import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { appendFile, mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyJws } from '../../libs/signing/jws.mjs';
import { MetricsIngestWriter } from '../obs/ingest.mjs';

const DEFAULT_STORE_PATH = fileURLToPath(new URL('./store.jsonl', import.meta.url));
const DEFAULT_INDEX_PATH = fileURLToPath(new URL('./index.urn.json', import.meta.url));
const DEFAULT_CAPABILITY_INDEX_PATH = fileURLToPath(
  new URL('./index.cap.json', import.meta.url),
);
const DEFAULT_RATE_LIMIT_CONFIG = fileURLToPath(
  new URL('../../config/security/rate-limit.config.json', import.meta.url),
);
const DEFAULT_SIGNATURE_POLICY_PATH = fileURLToPath(
  new URL('../../config/security/signature-policy.json', import.meta.url),
);
const DEFAULT_API_KEY = process.env.REGISTRY_API_KEY || 'local-dev-key';
const CAPABILITY_PATTERN =
  /^[a-z0-9][a-z0-9._:-]*(?:@[a-z0-9][a-z0-9._:-]*)?(?:#[a-z0-9][a-z0-9._:-]*)?$/i;
const DEFAULT_QUERY_LIMIT = 25;
const MAX_QUERY_LIMIT = 100;

const WELL_KNOWN_PAYLOAD = {
  service: 'OSSP-AGI Registry Service',
  version: 'registry.ossp-agi.io/v1',
  description:
    'Provides API-key protected register/resolve endpoints for OSSP Agent Cards.',
  links: {
    register: '/registry',
    register_v1: '/v1/registry/{urn}',
    resolve: '/resolve/{urn}',
    resolve_v1: '/v1/resolve?urn={urn}',
    health: '/health',
  },
  auth: {
    type: 'api-key',
    header: 'X-API-Key',
  },
};

const OPENAPI_SPEC = {
  openapi: '3.0.0',
  info: {
    title: 'OSSP-AGI Registry Service API',
    version: '1.0.0',
    description:
      'Minimal OpenAPI description for the Registry Service: health, listing, registration, and resolve.',
  },
  paths: {
    '/health': {
      get: {
        summary: 'Service health',
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { status: { type: 'string' } } },
              },
            },
          },
        },
      },
    },
    '/registry': {
      get: {
        summary: 'List agents by capability match',
        parameters: [
          { in: 'query', name: 'cap', schema: { type: 'string' }, required: true },
          { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1 } },
          { in: 'query', name: 'offset', schema: { type: 'integer', minimum: 0 } },
        ],
        responses: { '200': { description: 'OK' }, '400': { description: 'Bad Request' } },
      },
      post: {
        summary: 'Register an agent card',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: {
          '201': { description: 'Created' },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
          '409': { description: 'Conflict' },
        },
      },
    },
    '/resolve/{urn}': {
      get: {
        summary: 'Resolve agent by URN',
        parameters: [
          { in: 'path', name: 'urn', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'OK' }, '404': { description: 'Not Found' } },
      },
    },
    '/v1/registry/{urn}': {
      get: {
        summary: 'Fetch agent by URN',
        parameters: [
          { in: 'path', name: 'urn', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'OK' },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Not Found' },
        },
      },
      put: {
        summary: 'Register or update an agent card',
        parameters: [
          { in: 'path', name: 'urn', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: {
          '200': { description: 'Updated' },
          '201': { description: 'Created' },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/v1/resolve': {
      get: {
        summary: 'Resolve agent by URN',
        parameters: [
          { in: 'query', name: 'urn', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'OK' },
          '400': { description: 'Bad Request' },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Not Found' },
        },
      },
    },
  },
};

function nowIso() {
  return new Date().toISOString();
}

async function ensureFile(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
  const handle = await open(filePath, 'a');
  await handle.close();
}

async function loadRateLimitConfig(path) {
  if (path === null) {
    return {};
  }

  const configPath = path || DEFAULT_RATE_LIMIT_CONFIG;
  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(
        `[registry] Failed to load rate limit config from ${configPath}:`,
        error,
      );
    }
  }
  return {};
}

function validateAgentPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    errors.push('Body must be a JSON object.');
    return { valid: false, errors };
  }

  const { urn, card, sig } = payload;
  if (!urn || typeof urn !== 'string') {
    errors.push('`urn` is required and must be a string.');
  }
  if (!card || typeof card !== 'object' || Array.isArray(card)) {
    errors.push('`card` is required and must be an object.');
  } else {
    if (!card.id || typeof card.id !== 'string') {
      errors.push('`card.id` is required.');
    }
    if (!card.name || typeof card.name !== 'string') {
      errors.push('`card.name` is required.');
    }
    if (!card.capabilities || typeof card.capabilities !== 'object') {
      errors.push('`card.capabilities` is required.');
    } else if (!Array.isArray(card.capabilities.tools)) {
      errors.push('`card.capabilities.tools` must be an array.');
    }
    if (!card.communication || typeof card.communication !== 'object') {
      errors.push('`card.communication` is required.');
    }
    if (!card.authorization || typeof card.authorization !== 'object') {
      errors.push('`card.authorization` is required.');
    }
  }

  if (!sig || typeof sig !== 'object' || Array.isArray(sig)) {
    errors.push('`sig` is required and must be an object.');
  } else {
    if (!sig.spec || typeof sig.spec !== 'string') {
      errors.push('`sig.spec` is required and must be a string.');
    } else if (sig.spec !== 'identity-access.signing.v1') {
      errors.push('`sig.spec` must be identity-access.signing.v1.');
    }
    if (!sig.protected || typeof sig.protected !== 'string') {
      errors.push('`sig.protected` is required and must be a string.');
    }
    if (!sig.payload || typeof sig.payload !== 'string') {
      errors.push('`sig.payload` is required and must be a string.');
    }
    if (!sig.signature || typeof sig.signature !== 'string') {
      errors.push('`sig.signature` is required and must be a string.');
    }
    if (!sig.hash || typeof sig.hash !== 'object' || Array.isArray(sig.hash)) {
      errors.push('`sig.hash` is required and must be an object.');
    } else {
      if (!sig.hash.alg || typeof sig.hash.alg !== 'string') {
        errors.push('`sig.hash.alg` is required and must be a string.');
      }
      if (!sig.hash.value || typeof sig.hash.value !== 'string') {
        errors.push('`sig.hash.value` is required and must be a string.');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function decodeEnvelopeHeader(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    return null;
  }
  if (!envelope.protected || typeof envelope.protected !== 'string') {
    return null;
  }
  try {
    const json = Buffer.from(envelope.protected, 'base64url').toString('utf8');
    if (!json) {
      return null;
    }
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

async function loadSignaturePolicy(policyPath) {
  const targetPath = policyPath ?? DEFAULT_SIGNATURE_POLICY_PATH;
  try {
    const raw = await readFile(targetPath, 'utf8');
    const parsed = JSON.parse(raw);
    const requireSignature = parsed.requireSignature !== false;
    const keys = Array.isArray(parsed.keys) ? parsed.keys : [];

    const normalizedKeys = keys.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error('Signature policy entries must be objects.');
      }
      if (!entry.keyId || typeof entry.keyId !== 'string') {
        throw new Error('Signature policy entries require a `keyId`.');
      }
      if (!entry.publicKey || typeof entry.publicKey !== 'string') {
        throw new Error(`Signature policy entry '${entry.keyId}' must provide a string publicKey.`);
      }
      const algorithm = entry.algorithm || 'EdDSA';
      return {
        keyId: entry.keyId,
        algorithm,
        publicKey: entry.publicKey,
      };
    });

    return { requireSignature, keys: normalizedKeys, path: targetPath };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Signature policy not found at ${targetPath}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Signature policy at ${targetPath} is not valid JSON: ${error.message}`);
    }
    throw error;
  }
}

class SignatureVerifier {
  constructor(policy) {
    this.requireSignature = policy.requireSignature !== false;
    this.keys = new Map(policy.keys.map((entry) => [entry.keyId, entry]));
  }

  verify({ card, sig }) {
    const enforced = this.requireSignature !== false;
    const timestamp = nowIso();
    const baseResult = {
      valid: false,
      errors: [],
      keyId: null,
      algorithm: null,
      digestValid: false,
      signatureValid: false,
      verifiedAt: timestamp,
      header: null,
      enforced,
      shouldReject: enforced,
    };

    if (!sig || typeof sig !== 'object') {
      return {
        ...baseResult,
        errors: ['Signature envelope is required.'],
      };
    }

    const errors = [];
    if (sig.spec && sig.spec !== 'identity-access.signing.v1') {
      errors.push('Unexpected signature spec identifier.');
    }

    const header = decodeEnvelopeHeader(sig);
    if (!header) {
      errors.push('Signature protected header is missing or invalid.');
      return {
        ...baseResult,
        errors,
      };
    }

    if (!header.kid) {
      errors.push('Signature header is missing `kid`.');
    }

    const key = header.kid ? this.keys.get(header.kid) : null;
    if (!key) {
      errors.push(`No signature policy entry for key '${header.kid ?? '<unknown>'}'.`);
      return {
        ...baseResult,
        errors,
        keyId: header.kid ?? null,
        algorithm: header.alg ?? null,
        header,
        shouldReject: enforced && true,
        valid: !enforced && errors.length === 0,
      };
    }

    if (key.algorithm && header.alg && key.algorithm !== header.alg) {
      errors.push(`Signature algorithm mismatch (expected ${key.algorithm}, got ${header.alg}).`);
    }

    const verification = verifyJws(sig, {
      publicKey: key.publicKey,
      keyId: key.keyId,
      expectedPayload: card,
    });

    const allErrors = [...errors, ...(verification.errors ?? [])];
    const success = allErrors.length === 0 && verification.valid;

    return {
      valid: success,
      errors: allErrors,
      keyId: key.keyId,
      algorithm: verification.header?.alg ?? key.algorithm ?? header.alg ?? null,
      digestValid: verification.digestValid,
      signatureValid: verification.signatureValid,
      verifiedAt: timestamp,
      header: verification.header ?? header,
      enforced,
      shouldReject: enforced ? !success : false,
    };
  }
}

class RegistryStore {
  constructor({ storePath, indexPath, capIndexPath } = {}) {
    this.storePath = storePath || DEFAULT_STORE_PATH;
    this.indexPath = indexPath || DEFAULT_INDEX_PATH;
    this.capIndexPath = capIndexPath || DEFAULT_CAPABILITY_INDEX_PATH;
    this.cache = new Map();
    this.index = new Map();
    this.capabilityIndex = new Map();
    this.capabilityLookup = new Map();
    this.lastUpdated = null;
    this.indexLastUpdated = null;
    this.capIndexLastUpdated = null;
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      await ensureFile(this.storePath);
      await ensureFile(this.indexPath);
      await ensureFile(this.capIndexPath);
      await this.#hydrate();
      this.initialized = true;
    }
  }

  async #hydrate() {
    this.cache.clear();
    this.index.clear();
    this.capabilityIndex.clear();
    this.capabilityLookup.clear();
    this.lastUpdated = null;
    this.capIndexLastUpdated = null;

    try {
      const raw = await readFile(this.storePath, 'utf8');
      if (raw) {
        const lines = raw.split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const record = JSON.parse(line);
            if (!record?.urn) {
              continue;
            }
            const normalized = {
              urn: record.urn,
              card: record.card ?? null,
              sig: record.sig ?? null,
              verification: record.verification ?? null,
              ts: record.ts ?? null,
            };

            this.cache.set(normalized.urn, normalized);
            this.index.set(normalized.urn, {
              urn: normalized.urn,
              ts: normalized.ts ?? normalized.verification?.verifiedAt ?? null,
              keyId: normalized.verification?.keyId ?? null,
              algorithm: normalized.verification?.algorithm ?? null,
            });
            this.#indexCapabilitiesForRecord(normalized);

            if (!this.lastUpdated || (normalized.ts && normalized.ts > this.lastUpdated)) {
              this.lastUpdated = normalized.ts;
            }
          } catch {
            // Ignore malformed lines to avoid blocking the service.
          }
        }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }

    await this.#persistIndex();
    await this.#persistCapabilityIndex();
  }

  #extractCapabilityTokens(card) {
    const tokens = [];
    if (!card || typeof card !== 'object' || Array.isArray(card)) {
      return tokens;
    }

    const capabilities = card.capabilities;
    if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
      return tokens;
    }

    const pushToken = (value, source) => {
      if (typeof value !== 'string') {
        return;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        return;
      }
      tokens.push({
        raw: trimmed,
        normalized: trimmed.toLowerCase(),
        source,
      });
    };

    const pushFromArray = (items, basePath) => {
      if (!Array.isArray(items)) {
        return;
      }
      items.forEach((entry, index) => {
        const path = `${basePath}[${index}]`;
        if (typeof entry === 'string') {
          pushToken(entry, path);
          return;
        }
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return;
        }
        if (entry.urn) {
          pushToken(entry.urn, `${path}.urn`);
        }
        if (entry.name) {
          pushToken(entry.name, `${path}.name`);
        }
        if (entry.capability) {
          pushToken(entry.capability, `${path}.capability`);
        }
        if (Array.isArray(entry.tags)) {
          entry.tags.forEach((tag, tagIndex) => {
            pushToken(tag, `${path}.tags[${tagIndex}]`);
          });
        }
      });
    };

    pushFromArray(capabilities.tools, 'capabilities.tools');
    pushFromArray(capabilities.resources, 'capabilities.resources');

    if (Array.isArray(capabilities.tags)) {
      capabilities.tags.forEach((tag, index) => {
        pushToken(tag, `capabilities.tags[${index}]`);
      });
    }

    return tokens;
  }

  #indexCapabilitiesForRecord(record) {
    if (!record?.urn) {
      return;
    }

    const tokens = this.#extractCapabilityTokens(record.card);
    const unique = new Set();
    const normalizedTokens = [];

    for (const token of tokens) {
      if (!token.normalized) {
        continue;
      }
      if (unique.has(token.normalized)) {
        continue;
      }
      unique.add(token.normalized);
      normalizedTokens.push(token);

      if (!this.capabilityIndex.has(token.normalized)) {
        this.capabilityIndex.set(token.normalized, new Set());
      }
      this.capabilityIndex.get(token.normalized).add(record.urn);
    }

    this.capabilityLookup.set(record.urn, {
      urn: record.urn,
      tokens: normalizedTokens,
    });
  }

  #matchCapabilityToken(tokenNormalized, queryNormalized) {
    if (!tokenNormalized || !queryNormalized) {
      return null;
    }
    if (tokenNormalized === queryNormalized) {
      return { exact: true, relation: 'exact', score: 0 };
    }
    if (tokenNormalized.startsWith(queryNormalized)) {
      const delta = Math.max(1, tokenNormalized.length - queryNormalized.length);
      return { exact: false, relation: 'token_extends', score: delta };
    }
    if (queryNormalized.startsWith(tokenNormalized)) {
      const delta = Math.max(1, queryNormalized.length - tokenNormalized.length);
      return { exact: false, relation: 'query_extends', score: delta };
    }
    return null;
  }

  #findBestCapabilityMatch(tokens, queryNormalized) {
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return null;
    }

    let best = null;
    for (const token of tokens) {
      if (!token?.normalized) {
        continue;
      }
      const evaluation = this.#matchCapabilityToken(token.normalized, queryNormalized);
      if (!evaluation) {
        continue;
      }
      const candidate = {
        capability: token.raw,
        normalized: token.normalized,
        source: token.source,
        exact: evaluation.exact,
        relation: evaluation.relation,
        score: evaluation.score,
      };

      if (!best) {
        best = candidate;
        continue;
      }

      if (!best.exact && candidate.exact) {
        best = candidate;
        continue;
      }

      if (best.exact === candidate.exact) {
        if (candidate.score < best.score) {
          best = candidate;
          continue;
        }
        if (candidate.score === best.score) {
          if ((candidate.capability ?? '').length < (best.capability ?? '').length) {
            best = candidate;
          }
        }
      }
    }

    return best;
  }

  async #persistCapabilityIndex() {
    const entries = Array.from(this.capabilityIndex.entries())
      .map(([capability, urns]) => ({
        capability,
        urns: Array.from(urns).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.capability.localeCompare(b.capability));

    const payload = {
      version: 1,
      updatedAt: nowIso(),
      entries,
    };
    await writeFile(this.capIndexPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    this.capIndexLastUpdated = payload.updatedAt;
  }

  async #persistIndex() {
    const entries = Array.from(this.index.values()).sort((a, b) =>
      a.urn.localeCompare(b.urn),
    );
    const payload = {
      version: 1,
      updatedAt: nowIso(),
      entries,
    };
    await writeFile(this.indexPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    this.indexLastUpdated = payload.updatedAt;
  }

  async entries() {
    await this.initialize();
    return Array.from(this.cache.values());
  }

  async count() {
    await this.initialize();
    return this.cache.size;
  }

  async find(urn) {
    await this.initialize();
    if (!this.index.has(urn)) {
      return null;
    }
    return this.cache.get(urn) || null;
  }

  async queryCapabilities(options = {}) {
    await this.initialize();
    const {
      capabilities,
      limit = DEFAULT_QUERY_LIMIT,
      offset = 0,
    } = options;

    const rawCapabilities = Array.isArray(capabilities)
      ? capabilities
      : typeof capabilities === 'string'
        ? [capabilities]
        : [];

    const normalizedCaps = [];
    const capMap = new Map();
    for (const value of rawCapabilities) {
      if (typeof value !== 'string') {
        continue;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }
      const normalized = trimmed.toLowerCase();
      if (!capMap.has(normalized)) {
        normalizedCaps.push(normalized);
      }
      if (!capMap.has(normalized)) {
        capMap.set(normalized, trimmed);
      }
    }

    const capMeta = normalizedCaps.map((normalized) => ({
      normalized,
      original: capMap.get(normalized) ?? normalized,
    }));

    const limitNumber = Number(limit);
    const offsetNumber = Number(offset);
    const safeLimitCandidate = Number.isFinite(limitNumber)
      ? Math.max(1, Math.floor(limitNumber))
      : DEFAULT_QUERY_LIMIT;
    const safeLimit = Math.min(MAX_QUERY_LIMIT, safeLimitCandidate);
    const safeOffset = Number.isFinite(offsetNumber) ? Math.max(0, Math.floor(offsetNumber)) : 0;

    if (capMeta.length === 0) {
      return {
        total: 0,
        offset: 0,
        limit: safeLimit,
        caps: [],
        results: [],
      };
    }

    const candidateEntries = new Map();
    for (const { normalized } of capMeta) {
      for (const [urn, lookup] of this.capabilityLookup.entries()) {
        const match = this.#findBestCapabilityMatch(lookup.tokens, normalized);
        if (!match) {
          continue;
        }
        const entry = candidateEntries.get(urn) ?? {
          urn,
          matches: new Map(),
        };
        entry.matches.set(normalized, match);
        candidateEntries.set(urn, entry);
      }
    }

    const requiredMatches = capMeta.length;
    const results = [];

    for (const [urn, entry] of candidateEntries.entries()) {
      if (entry.matches.size !== requiredMatches) {
        continue;
      }
      const record = this.cache.get(urn);
      if (!record || record.verification?.status !== 'verified') {
        continue;
      }

      const partialCount = Array.from(entry.matches.values()).filter(
        (match) => !match.exact,
      ).length;

      results.push({
        urn,
        record,
        matches: entry.matches,
        partialCount,
      });
    }

    results.sort((a, b) => {
      if (a.partialCount !== b.partialCount) {
        return a.partialCount - b.partialCount;
      }
      const aTs = a.record.ts ?? '';
      const bTs = b.record.ts ?? '';
      if (aTs || bTs) {
        if (!aTs) {
          return 1;
        }
        if (!bTs) {
          return -1;
        }
        if (aTs !== bTs) {
          return bTs.localeCompare(aTs);
        }
      }
      return a.urn.localeCompare(b.urn);
    });

    const total = results.length;
    const effectiveOffset = Math.min(safeOffset, total);
    const sliced = results.slice(effectiveOffset, effectiveOffset + safeLimit);

    const items = sliced.map((entry) => {
      const matchDetails = capMeta.map((meta) => {
        const match = entry.matches.get(meta.normalized);
        return {
          query: meta.original,
          normalizedQuery: meta.normalized,
          capability: match?.capability ?? null,
          normalizedCapability: match?.normalized ?? null,
          source: match?.source ?? null,
          exact: match?.exact ?? false,
          relation: match?.relation ?? (match?.exact ? 'exact' : 'partial'),
        };
      });
      return {
        urn: entry.urn,
        record: entry.record,
        matches: matchDetails,
        partialCount: entry.partialCount,
        verified: entry.record.verification?.status === 'verified',
      };
    });

    return {
      total,
      offset: effectiveOffset,
      limit: safeLimit,
      caps: capMeta,
      results: items,
    };
  }

  async register({ urn, card, sig, verification }, options = {}) {
    if (!urn) {
      throw new Error('URN is required.');
    }
    await this.initialize();
    const existing = this.cache.has(urn) ? this.cache.get(urn) : null;
    const overwrite = options.overwrite === true;
    if (existing && !overwrite) {
      return { inserted: false, updated: false, record: existing };
    }

    const timestamp = nowIso();
    const verificationRecord = verification
      ? {
          ...verification,
          verifiedAt: verification.verifiedAt ?? timestamp,
        }
      : null;
    const record = {
      urn,
      card,
      sig,
      verification: verificationRecord,
      ts: timestamp,
    };

    const payload = `${JSON.stringify(record)}\n`;
    await appendFile(this.storePath, payload, 'utf8');
    if (existing && overwrite) {
      await this.#hydrate();
      return {
        inserted: false,
        updated: true,
        record: this.cache.get(urn) ?? record,
      };
    }
    this.cache.set(urn, record);
    this.index.set(urn, {
      urn,
      ts: record.ts,
      keyId: record.verification?.keyId ?? null,
      algorithm: record.verification?.algorithm ?? null,
    });
    this.#indexCapabilitiesForRecord(record);
    this.lastUpdated = record.ts;
    await this.#persistIndex();
    await this.#persistCapabilityIndex();
    return { inserted: true, updated: false, record };
  }
}

function buildRateLimiter(config = {}) {
  const {
    windowMs = 60000,
    max = 60,
    standardHeaders = true,
    legacyHeaders = false,
    message = { error: 'rate_limited', message: 'Too many requests.' },
  } = config;

  const keyGenerator = (request) => {
    if (request.ip) {
      return ipKeyGenerator(request.ip);
    }
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return ipKeyGenerator(forwarded.split(',')[0].trim());
    }
    return 'anonymous';
  };

  const limiter = rateLimit({
    windowMs,
    max,
    standardHeaders,
    legacyHeaders,
    message,
    keyGenerator,
  });

  return { limiter, config: { windowMs, max, standardHeaders, legacyHeaders } };
}

export async function createRegistryServer(options = {}) {
  const {
    storePath = DEFAULT_STORE_PATH,
    indexPath = DEFAULT_INDEX_PATH,
    capIndexPath = DEFAULT_CAPABILITY_INDEX_PATH,
    rateLimit: overrideRateLimit,
    rateLimitConfigPath,
    signaturePolicyPath,
    apiKey = DEFAULT_API_KEY,
    jsonLimit = '512kb',
    enablePerformanceLogging = true,
    performanceLogRoot,
    performanceSessionId,
  } = options;

  if (!apiKey) {
    throw new Error('Registry API key must be provided via options.apiKey or REGISTRY_API_KEY.');
  }

  const store = new RegistryStore({ storePath, indexPath, capIndexPath });
  await store.initialize();

  const rateLimitConfig = overrideRateLimit ?? (await loadRateLimitConfig(rateLimitConfigPath));
  const { limiter, config: limiterConfig } = buildRateLimiter(rateLimitConfig);

  const signaturePolicy = await loadSignaturePolicy(signaturePolicyPath);
  const signatureVerifier = new SignatureVerifier(signaturePolicy);

  // Initialize performance logging if enabled
  let metricsWriter = null;
  if (enablePerformanceLogging && performanceSessionId) {
    metricsWriter = new MetricsIngestWriter({
      sessionId: performanceSessionId,
      root: performanceLogRoot,
    });
  }

  const app = express();
  app.disable('x-powered-by');
  app.set('registryStore', store);
  app.set('signatureVerifier', signatureVerifier);

  app.use(express.json({ limit: jsonLimit }));
  // Localhost-only CORS
  app.use((request, response, next) => {
    const origin = request.headers.origin;
    if (typeof origin === 'string') {
      try {
        const url = new URL(origin);
        const hostname = url.hostname.toLowerCase();
        if (
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname === '::1'
        ) {
          response.setHeader('Access-Control-Allow-Origin', origin);
          response.setHeader('Vary', 'Origin');
          response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
          response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
          response.setHeader('Access-Control-Max-Age', '600');
        }
      } catch {}
    }
    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }
    next();
  });
  app.use((request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Performance logging middleware
  if (metricsWriter) {
    app.use((request, response, next) => {
      const startTime = performance.now();
      
      // Track route for logging
      const originalUrl = request.originalUrl || request.url;
      let step = 'unknown';
      
      // Map routes to step names
      if (originalUrl.includes('/health')) {
        step = 'health';
      } else if (originalUrl.includes('/openapi.json')) {
        step = 'openapi';
      } else if (originalUrl.includes('/registry') && request.method === 'GET') {
        step = 'registry_get';
      } else if (originalUrl.includes('/registry') && request.method === 'POST') {
        step = 'registry_put';
      } else if (originalUrl.includes('/resolve')) {
        step = 'resolve';
      }
      
      // Hook into response finish
      const logPerformance = () => {
        const duration = performance.now() - startTime;
        const ok = response.statusCode >= 200 && response.statusCode < 400;
        
        const logEntry = {
          tool: 'registry',
          step,
          ms: Math.round(duration * 100) / 100,
          ok,
          ts: new Date().toISOString(),
        };

        // Add errorReason for failures
        if (!ok) {
          const statusText = {
            400: 'bad_request',
            401: 'unauthorized',
            404: 'not_found',
            409: 'conflict',
            422: 'validation_error',
            429: 'rate_limited',
            500: 'internal_error',
            502: 'bad_gateway',
            503: 'service_unavailable',
            504: 'gateway_timeout',
          };
          logEntry.errorReason = statusText[response.statusCode] || `http_${response.statusCode}`;
        }
        
        metricsWriter.log(logEntry).catch(err => {
          // Silently ignore logging errors
          console.error('[registry] Performance logging error:', err.message);
        });
      };
      
      response.once('finish', logPerformance);
      response.once('close', logPerformance);
      
      next();
    });
  }

  const requireApiKey = (request, response, next) => {
    const provided = request.get('X-API-Key');
    if (!provided || provided !== apiKey) {
      return response.status(401).json({
        error: 'unauthorized',
        message: 'Valid X-API-Key header is required.',
      });
    }
    return next();
  };

  app.get('/.well-known/ossp-agi.json', (request, response) => {
    response.json(WELL_KNOWN_PAYLOAD);
  });

  // OpenAPI description for basic endpoints
  app.get('/openapi.json', (request, response) => {
    response.json(OPENAPI_SPEC);
  });

  app.get('/health', async (request, response, next) => {
    try {
      const count = await store.count();
      response.json({
        status: 'ok',
        registry: {
          records: count,
          lastUpdated: store.lastUpdated,
          indexRecords: store.index?.size ?? 0,
          indexLastUpdated: store.indexLastUpdated,
        },
        rateLimit: limiterConfig,
      });
    } catch (error) {
      next(error);
    }
  });

  const toVerificationRecord = (verification) => {
    const status = verification.valid ? 'verified' : 'unverified';
    const record = {
      status,
      keyId: verification.keyId,
      algorithm: verification.algorithm,
      digestValid: verification.digestValid,
      signatureValid: verification.signatureValid,
      verifiedAt: verification.verifiedAt,
      enforced: verification.enforced,
    };
    if (!verification.valid && verification.errors?.length) {
      record.errors = verification.errors;
    }
    return record;
  };

  const registryRouter = express.Router();
  registryRouter.use(limiter, requireApiKey);

  registryRouter.get('/', async (request, response, next) => {
    try {
      const capParam = request.query.cap;
      const limitParam = request.query.limit;
      const offsetParam = request.query.offset;

      const rawCaps = Array.isArray(capParam)
        ? capParam
        : typeof capParam === 'string'
          ? [capParam]
          : [];

      const caps = [];
      const invalid = [];

      for (const value of rawCaps) {
        if (typeof value !== 'string') {
          invalid.push({ value, reason: 'must_be_string' });
          continue;
        }
        const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
        if (parts.length === 0) {
          invalid.push({ value, reason: 'empty' });
        }
        for (const part of parts) {
          if (part.length > 256) {
            invalid.push({ value: part, reason: 'too_long' });
            continue;
          }
          if (!CAPABILITY_PATTERN.test(part)) {
            invalid.push({ value: part, reason: 'invalid_format' });
            continue;
          }
          caps.push(part);
        }
      }

      if (caps.length === 0) {
        return response.status(400).json({
          error: 'invalid_query',
          message: 'At least one `cap` query parameter is required.',
          details: invalid,
        });
      }

      if (invalid.length > 0) {
        return response.status(400).json({
          error: 'invalid_query',
          message: 'One or more `cap` values are invalid.',
          details: invalid,
        });
      }

      const result = await store.queryCapabilities({
        capabilities: caps,
        limit: limitParam,
        offset: offsetParam,
      });

      return response.json({
        status: 'ok',
        query: {
          caps: result.caps.map((cap) => ({
            value: cap.original,
            normalized: cap.normalized,
          })),
          limit: result.limit,
          offset: result.offset,
        },
        total: result.total,
        results: result.results.map((entry) => ({
          urn: entry.urn,
          card: entry.record.card,
          verified: entry.verified,
          verification: entry.record.verification ?? null,
          registeredAt: entry.record.ts ?? null,
          partialCount: entry.partialCount,
          matches: entry.matches,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  registryRouter.post('/', async (request, response, next) => {
    try {
      const validation = validateAgentPayload(request.body);
      if (!validation.valid) {
        return response.status(400).json({
          error: 'invalid_request',
          message: 'Payload failed validation.',
          details: validation.errors,
        });
      }

      const { urn, card, sig } = request.body;
      const signatureVerifier = app.get('signatureVerifier');
      const verification = signatureVerifier.verify({ card, sig });

      if (verification.shouldReject) {
        return response.status(422).json({
          error: 'signature_invalid',
          message: 'Signature verification failed.',
          urn,
          details: verification.errors,
          verification: {
            status: 'failed',
            keyId: verification.keyId,
            algorithm: verification.algorithm,
            digestValid: verification.digestValid,
            signatureValid: verification.signatureValid,
            enforced: verification.enforced,
          },
        });
      }

      const verificationRecord = toVerificationRecord(verification);

      const result = await store.register({
        urn,
        card,
        sig,
        verification: verificationRecord,
      });

      if (!result.inserted) {
        return response.status(409).json({
          error: 'conflict',
          message: `Agent with urn '${urn}' already exists.`,
          urn,
          verification: result.record.verification ?? null,
        });
      }

      return response.status(201).json({
        status: 'registered',
        urn: result.record.urn,
        ts: result.record.ts,
        verification: verificationRecord,
      });
    } catch (error) {
      return next(error);
    }
	  });

  app.use('/registry', registryRouter);

  const v1Router = express.Router();

  v1Router.get(
    '/registry/:urn',
    limiter,
    requireApiKey,
    async (request, response, next) => {
      try {
        const urn = decodeURIComponent(request.params.urn);
        const record = await store.find(urn);
        if (!record) {
          return response.status(404).json({
            error: 'not_found',
            message: `No agent registered for urn '${urn}'.`,
            urn,
          });
        }
        return response.json({
          urn: record.urn,
          card: record.card,
          sig: record.sig ?? null,
          ts: record.ts,
          verification: record.verification ?? null,
        });
      } catch (error) {
        return next(error);
      }
    },
  );

  v1Router.put(
    '/registry/:urn',
    limiter,
    requireApiKey,
    async (request, response, next) => {
      try {
        const urn = decodeURIComponent(request.params.urn);
        const payload = {
          urn: request.body?.urn ?? urn,
          card: request.body?.card,
          sig: request.body?.sig,
        };
        if (payload.urn !== urn) {
          return response.status(400).json({
            error: 'urn_mismatch',
            message: 'URN in path must match payload.',
            expected: urn,
            received: payload.urn,
          });
        }

        const validation = validateAgentPayload(payload);
        if (!validation.valid) {
          return response.status(400).json({
            error: 'invalid_request',
            message: 'Payload failed validation.',
            details: validation.errors,
          });
        }

        const signatureVerifier = app.get('signatureVerifier');
        const verification = signatureVerifier.verify({
          card: payload.card,
          sig: payload.sig,
        });

        if (verification.shouldReject) {
          return response.status(422).json({
            error: 'signature_invalid',
            message: 'Signature verification failed.',
            urn,
            details: verification.errors,
            verification: {
              status: 'failed',
              keyId: verification.keyId,
              algorithm: verification.algorithm,
              digestValid: verification.digestValid,
              signatureValid: verification.signatureValid,
              enforced: verification.enforced,
            },
          });
        }

        const verificationRecord = toVerificationRecord(verification);
        const result = await store.register(
          {
            urn,
            card: payload.card,
            sig: payload.sig,
            verification: verificationRecord,
          },
          { overwrite: true },
        );

        const statusCode = result.inserted ? 201 : 200;
        const status = result.updated ? 'updated' : 'registered';

        return response.status(statusCode).json({
          status,
          urn: result.record.urn,
          ts: result.record.ts,
          verification: result.record.verification ?? verificationRecord,
        });
      } catch (error) {
        return next(error);
      }
    },
  );

  v1Router.get(
    '/resolve',
    limiter,
    requireApiKey,
    async (request, response, next) => {
      try {
        const urnCandidate = request.query.urn;
        if (typeof urnCandidate !== 'string' || urnCandidate.trim().length === 0) {
          return response.status(400).json({
            error: 'invalid_query',
            message: '`urn` query parameter is required.',
          });
        }
        const urn = decodeURIComponent(urnCandidate);
        const record = await store.find(urn);
        if (!record) {
          return response.status(404).json({
            error: 'not_found',
            message: `No agent registered for urn '${urn}'.`,
            urn,
          });
        }
        return response.json({
          urn: record.urn,
          card: record.card,
          sig: record.sig ?? null,
          ts: record.ts,
          verification: record.verification ?? null,
        });
      } catch (error) {
        return next(error);
      }
    },
  );

  app.use('/v1', v1Router);

  app.get('/resolve/:urn', limiter, requireApiKey, async (request, response, next) => {
    try {
      const urn = decodeURIComponent(request.params.urn);
      const record = await store.find(urn);
      if (!record) {
        return response.status(404).json({
          error: 'not_found',
          message: `No agent registered for urn '${urn}'.`,
          urn,
        });
      }
      return response.json({
        urn: record.urn,
        card: record.card,
        sig: record.sig ?? null,
        ts: record.ts,
        verification: record.verification ?? null,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.use((error, request, response, next) => {
    if (error?.type === 'entity.parse.failed') {
      return response.status(400).json({
        error: 'invalid_json',
        message: 'Request body must be valid JSON.',
      });
    }

    console.error('[registry] Unhandled error', error);
    if (response.headersSent) {
      return next(error);
    }
    return response.status(500).json({
      error: 'internal_error',
      message: 'Unexpected error occurred.',
    });
  });

  return { app, store, limiter, rateLimit: limiterConfig, signatureVerifier };
}

export async function startRegistryServer(options = {}) {
  const { app, store, limiter, rateLimit, signatureVerifier } =
    await createRegistryServer(options);
  const port = options.port || 3000;

  return new Promise((resolve, reject) => {
    const server = app
      .listen(port, () => {
        resolve({
          app,
          store,
          limiter,
          rateLimit,
          signatureVerifier,
          port,
          server,
          close: () =>
            new Promise((closeResolve) => {
              server.close(() => closeResolve());
            }),
        });
      })
      .on('error', reject);
  });
}

export { RegistryStore };
