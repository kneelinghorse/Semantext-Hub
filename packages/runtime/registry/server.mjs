import express from 'express';
import rateLimit from 'express-rate-limit';
import { openDb, getHealth } from './db.mjs';
import { upsertManifest, getManifest, queryByCapability, resolve, listManifests } from './repository.mjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateProvenance, summarizeProvenance } from '../security/provenance.mjs';

const DEFAULT_API_KEY = process.env.REGISTRY_API_KEY || 'local-dev-key';
const DEFAULT_RATE_LIMIT_CONFIG = fileURLToPath(
  new URL('../../../app/config/security/rate-limit.config.json', import.meta.url),
);
const DEFAULT_REGISTRY_CONFIG = fileURLToPath(
  new URL('../../../app/config/registry.config.json', import.meta.url),
);
const DEFAULT_PROVENANCE_KEY = fileURLToPath(
  new URL('../../../fixtures/keys/pub.pem', import.meta.url),
);

const WELL_KNOWN_PAYLOAD = {
  service: 'OSSP-AGI Registry Service (SQLite)',
  version: 'registry.ossp-agi.io/v1',
  description: 'SQLite-backed registry with WAL mode for durability',
  links: {
    register_v1: '/v1/registry/{urn}',
    resolve_v1: '/v1/resolve?urn={urn}',
    query_v1: '/v1/query',
    health: '/health',
  },
  auth: { type: 'api-key', header: 'X-API-Key' },
};

async function loadRateLimitConfig(path) {
  if (path === null) return {};
  const configPath = path || DEFAULT_RATE_LIMIT_CONFIG;
  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`[registry] Failed to load rate limit config:`, error);
    }
  }
  return {};
}

async function loadRegistryConfig(path) {
  const configPath = path || DEFAULT_REGISTRY_CONFIG;
  try {
    const raw = await readFile(configPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`[registry] Failed to load registry config:`, error);
    }
  }
  return {};
}

function buildRateLimiter(config = {}) {
  const {
    windowMs = 60000,
    max = 60,
    standardHeaders = true,
    legacyHeaders = false,
    message = { error: 'rate_limited', message: 'Too many requests.' },
  } = config;

  const limiter = rateLimit({
    windowMs,
    max,
    standardHeaders,
    legacyHeaders,
    message,
  });

  return { limiter, config: { windowMs, max, standardHeaders, legacyHeaders } };
}

function normalizeProvenanceKeyConfig(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('Provenance verifier entries must be objects.');
  }
  if (!entry.pubkey) {
    throw new Error('Provenance verifier entry requires a `pubkey`.');
  }
  return {
    pubkey: entry.pubkey,
    alg: entry.alg || entry.algorithm || 'Ed25519',
    keyid: entry.keyid || entry.keyId || entry.kid || null,
  };
}

async function loadProvenanceVerifier(options = {}) {
  if (Array.isArray(options.keys) && options.keys.length > 0) {
    return options.keys.map(normalizeProvenanceKeyConfig);
  }

  const keyPath =
    options.keyPath ??
    process.env.PROVENANCE_PUBKEY_PATH ??
    DEFAULT_PROVENANCE_KEY;

  try {
    const pubkey = await readFile(keyPath, 'utf8');
    return [
      normalizeProvenanceKeyConfig({
        pubkey,
        alg: options.algorithm || 'Ed25519',
        keyid: options.keyid || options.keyId || null,
      }),
    ];
  } catch (error) {
    if (options.optional) {
      return [];
    }
    throw new Error(
      `Failed to load provenance verification key from ${keyPath}: ${error.message}`,
    );
  }
}

export async function createServer(options = {}) {
  const {
    registryConfigPath,
    rateLimitConfigPath,
    apiKey = DEFAULT_API_KEY,
    jsonLimit = '512kb',
    provenanceKeyPath,
    provenanceKeys,
    provenanceAlgorithm = 'Ed25519',
    provenanceKeyId = null,
    requireProvenance = true,
  } = options;

  if (!apiKey) {
    throw new Error('Registry API key must be provided via options.apiKey or REGISTRY_API_KEY.');
  }

  const registryConfig = await loadRegistryConfig(registryConfigPath);
  const db = await openDb(registryConfig);

  const rateLimitConfig = await loadRateLimitConfig(rateLimitConfigPath);
  const { limiter, config: limiterConfig } = buildRateLimiter(rateLimitConfig);

  const provenanceVerifier = await loadProvenanceVerifier({
    keyPath: provenanceKeyPath,
    keys: provenanceKeys,
    algorithm: provenanceAlgorithm,
    keyid: provenanceKeyId,
    optional: requireProvenance === false,
  });
  if (requireProvenance !== false && provenanceVerifier.length === 0) {
    throw new Error(
      'Provenance enforcement enabled but no verification keys were loaded.',
    );
  }

  const app = express();
  app.disable('x-powered-by');
  app.set('db', db);
  app.set('provenanceVerifier', provenanceVerifier);
  app.set('provenanceRequired', requireProvenance !== false);

  app.use(express.json({ limit: jsonLimit }));
  
  // CORS
  app.use((request, response, next) => {
    const origin = request.headers.origin;
    if (typeof origin === 'string') {
      try {
        const url = new URL(origin);
        const hostname = url.hostname.toLowerCase();
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
          response.setHeader('Access-Control-Allow-Origin', origin);
          response.setHeader('Vary', 'Origin');
          response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
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

  app.get('/health', async (request, response, next) => {
    try {
      const health = await getHealth(db);
      const count = (await db.get("SELECT COUNT(*) as count FROM manifests"))?.count || 0;
      response.json({
        status: 'ok',
        registry: {
          driver: health.driver,
          wal: health.wal,
          schema_version: health.schemaVersion,
          records: count,
        },
        rateLimit: limiterConfig,
      });
    } catch (error) {
      next(error);
    }
  });

  const v1Router = express.Router();

  v1Router.get(
    '/registry/:urn',
    limiter,
    requireApiKey,
    async (request, response, next) => {
      try {
        const urn = decodeURIComponent(request.params.urn);
        const manifest = await getManifest(db, urn);
        if (!manifest) {
          return response.status(404).json({
            error: 'not_found',
            message: `No manifest found for urn '${urn}'.`,
            urn,
          });
        }
        return response.json({
          urn: manifest.urn,
          body: manifest.body,
          digest: manifest.digest,
          issuer: manifest.issuer,
          signature: manifest.signature,
          updated_at: manifest.updated_at,
          provenance: manifest.provenance ?? null,
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
        const payload = request.body;

        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          return response.status(400).json({
            error: 'invalid_request',
            message: 'Body must be a JSON object.',
          });
        }

        let manifest = payload.manifest ?? payload.body ?? null;
        if (typeof manifest === 'string') {
          try {
            manifest = JSON.parse(manifest);
          } catch {
            manifest = null;
          }
        }
        if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
          return response.status(400).json({
            error: 'invalid_manifest',
            message: 'Request must include a `manifest` object.',
          });
        }

        if (
          manifest &&
          typeof manifest === 'object' &&
          !Array.isArray(manifest) &&
          manifest.manifest &&
          manifest.provenance &&
          typeof manifest.manifest === 'object' &&
          !Array.isArray(manifest.manifest) &&
          (Array.isArray(manifest.manifest.capabilities) || manifest.manifest.id)
        ) {
          manifest = manifest.manifest;
        }

        const provenance = payload.provenance;
        const requireAttestation = app.get('provenanceRequired') !== false;
        if (requireAttestation && !provenance) {
          return response.status(422).json({
            error: 'missing-provenance',
            message: 'DSSE provenance attestation is required.',
            urn,
          });
        }

        let provenanceSummary = null;
        if (provenance) {
          const verifierConfigs = app.get('provenanceVerifier') || [];
          const validation = validateProvenance(provenance, verifierConfigs);
          if (!validation.ok) {
            const status =
              validation.reason === 'no-verification-keys' ||
              validation.reason === 'no-matching-key'
                ? 500
                : 422;
            return response.status(status).json({
              error: 'invalid-provenance',
              message: 'Provenance attestation failed validation.',
              urn,
              reason: validation.reason,
            });
          }
          provenanceSummary = summarizeProvenance(provenance);
          provenanceSummary = {
            ...provenanceSummary,
            signature: validation.signature,
          };
        } else if (requireAttestation) {
          return response.status(422).json({
            error: 'missing-provenance',
            message: 'DSSE provenance attestation is required.',
            urn,
          });
        }

        const result = await upsertManifest(db, urn, manifest, {
          issuer: payload?.issuer,
          signature: payload?.signature,
          provenance: provenance || null,
        });

        return response.status(200).json({
          status: 'ok',
          urn: result.urn,
          digest: result.digest,
          provenance: provenanceSummary,
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
        const resolved = await resolve(db, urn);
        if (!resolved) {
          return response.status(404).json({
            error: 'not_found',
            message: `No manifest found for urn '${urn}'.`,
            urn,
          });
        }
        return response.json({
          urn: resolved.urn,
          manifest: resolved.manifest,
          capabilities: resolved.capabilities,
          digest: resolved.digest,
        });
      } catch (error) {
        return next(error);
      }
    },
  );

  v1Router.post(
    '/query',
    limiter,
    requireApiKey,
    async (request, response, next) => {
      try {
        const { capability } = request.body;
        if (!capability || typeof capability !== 'string') {
          return response.status(400).json({
            error: 'invalid_request',
            message: 'Body must include a `capability` string.',
          });
        }
        const results = await queryByCapability(db, capability);
        return response.json({
          status: 'ok',
          capability,
          results,
        });
      } catch (error) {
        return next(error);
      }
    },
  );

  app.use('/v1', v1Router);

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

  return app;
}

export async function startServer(options = {}) {
  const app = await createServer(options);
  const port = options.port || 3000;

  return new Promise((resolve, reject) => {
    const server = app
      .listen(port, () => {
        console.log(`[registry] Server listening on port ${port}`);
        resolve({
          app,
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
