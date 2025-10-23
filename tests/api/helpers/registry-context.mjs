import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { signJws } from '../../../app/libs/signing/jws.mjs';
import { createEnvelope } from '../../../packages/runtime/security/dsse.mjs';
import { createProvenancePayload } from '../../../packages/runtime/security/provenance.mjs';
import { createServer } from '../../../packages/runtime/registry/server.mjs';
import { openDb } from '../../../packages/runtime/registry/db.mjs';
import request from 'supertest';

export const API_KEY = 'test-secret';
export const KEY_ID = 'test-key';

export const BASE_CARD = {
  id: 'agent.registry.test',
  name: 'Registry Test Agent',
  version: '1.0.0',
  capabilities: { tools: [], resources: [] },
  communication: {
    supported: ['http'],
    endpoints: { default: 'https://agents.example.com/registry-test' },
    transport: {},
  },
  authorization: { delegation_supported: false, signature_algorithm: null },
};

const cleanupFns = [];
const PRIV_KEY_PATH = new URL('../../../fixtures/keys/priv.pem', import.meta.url);
const PUB_KEY_PATH = new URL('../../../fixtures/keys/pub.pem', import.meta.url);
const SCHEMA_SQL_PATH = fileURLToPath(new URL('../../../scripts/db/schema.sql', import.meta.url));

export async function createRegistryTestContext(overrides = {}) {
  const {
    rateLimit: rateLimitOverrides,
    signaturePolicy,
    preloadStoreRecords = [],
    ...serverOverrides
  } = overrides;
  const workDir = await mkdtemp(join(tmpdir(), 'registry-service-'));
  const dbPath = join(workDir, 'registry.sqlite');

  const [publicKeyPem, privateKeyPem, schemaSql] = await Promise.all([
    readFile(PUB_KEY_PATH, 'utf8'),
    readFile(PRIV_KEY_PATH, 'utf8'),
    readFile(SCHEMA_SQL_PATH, 'utf8'),
  ]);

  // Initialize SQLite database with schema
  const db = await openDb({ dbPath });
  await db.exec(schemaSql);

  // Preload records if provided (convert from legacy JSONL format to SQLite)
  if (preloadStoreRecords.length > 0) {
    const { upsertManifest } = await import('../../../packages/runtime/registry/repository.mjs');
    for (const record of preloadStoreRecords) {
      const entry = typeof record === 'string' ? JSON.parse(record) : record;
      if (entry.urn && entry.card) {
        await upsertManifest(db, entry.urn, entry.card, {
          issuer: entry.verification?.keyId || null,
          signature: entry.sig ? JSON.stringify(entry.sig) : null,
          provenance: entry.provenance || null,
        });
      }
    }
  }

  await db.close();

  const baseOptions = {
    apiKey: API_KEY,
    registryConfigPath: null,
    dbPath,
    provenanceKeys: [
      {
        pubkey: publicKeyPem,
        alg: 'Ed25519',
        keyid: KEY_ID,
      },
    ],
    requireProvenance: false,
    rateLimit: { windowMs: 60000, max: 5 },
  };

  if (rateLimitOverrides) {
    baseOptions.rateLimit = { ...baseOptions.rateLimit, ...rateLimitOverrides };
  }

  const serverOptions = {
    ...baseOptions,
    ...serverOverrides,
  };

  const app = await createServer(serverOptions);

  cleanupFns.push(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  const createProvenance = ({
    builderId = 'registry.test.builder',
    commit = `commit-${Date.now()}`,
    materials = [],
    buildTool = 'registry-test-suite',
    timestamp = new Date().toISOString(),
    inputs = [],
    outputs = [],
  } = {}) => {
    const payload = createProvenancePayload({
      builderId,
      commit,
      materials,
      buildTool,
      timestamp,
      inputs,
      outputs,
    });
    return createEnvelope('application/vnd.in-toto+json', payload, {
      key: privateKeyPem,
      alg: 'Ed25519',
      keyid: KEY_ID,
    });
  };

  return {
    app,
    dbPath,
    publicKeyPem,
    privateKeyPem,
    rateLimit: app.get('rateLimitConfig'),
    registryConfig: app.get('registryConfig'),
    signCard: (card) =>
      signJws(card, { privateKey: privateKeyPem, keyId: KEY_ID, algorithm: 'EdDSA' }),
    createProvenance,
  };
}

export async function cleanupRegistryTestContexts() {
  while (cleanupFns.length > 0) {
    const fn = cleanupFns.pop();
    // eslint-disable-next-line no-await-in-loop
    await fn();
  }
}

export async function registerManifest(app, {
  urn,
  manifest = BASE_CARD,
  apiKey = API_KEY,
  issuer = KEY_ID,
  signature = null,
  provenance = null,
} = {}) {
  if (!urn) {
    throw new Error('registerManifest requires a `urn`.');
  }
  const payload = {
    manifest,
    issuer,
  };
  if (signature) {
    payload.signature = signature;
  }
  if (provenance) {
    payload.provenance = provenance;
  }
  return request(app)
    .put(`/v1/registry/${encodeURIComponent(urn)}`)
    .set('X-API-Key', apiKey)
    .set('Content-Type', 'application/json')
    .send(payload);
}
