import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDb } from '../../packages/runtime/registry/db.mjs';
import { createEnvelope } from '../../packages/runtime/security/dsse.mjs';
import { createProvenancePayload } from '../../packages/runtime/security/provenance.mjs';

const API_KEY = 'test-key';

const DSSE_PRIVATE_KEY_PATH = path.resolve(process.cwd(), 'fixtures/keys/priv.pem');
if (!fs.existsSync(DSSE_PRIVATE_KEY_PATH)) {
  throw new Error('Missing DSSE private key at fixtures/keys/priv.pem for registry SQLite tests.');
}
const DSSE_PRIVATE_KEY = fs.readFileSync(DSSE_PRIVATE_KEY_PATH, 'utf8');

let registryConfigPath;

const serverModuleUrl = pathToFileURL(path.resolve('packages/runtime/registry/server.mjs')).href;
let startServer;
let activeServer;

const ensureSchema = async (dbPath) => {
  const schema = fs.readFileSync(path.resolve(process.cwd(), 'scripts/db/schema.sql'), 'utf8');
  const db = await openDb({ dbPath });
  try {
    await db.exec(schema);
  } finally {
    await db.close();
  }
};

const createAttestedRequest = (urn, manifest, { commit } = {}) => {
  const payload = createProvenancePayload({
    builderId: 'registry-sqlite-tests',
    commit: commit ?? `sqlite-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    materials: [{ uri: urn }],
    buildTool: 'registry-sqlite-spec',
  });

  const envelope = createEnvelope('application/vnd.in-toto+json', payload, {
    key: DSSE_PRIVATE_KEY,
    alg: 'Ed25519',
    keyid: 'registry-sqlite-test-key',
  });

  return {
    manifest,
    provenance: envelope,
  };
};

describe('SQLite Registry', () => {
  let testDbPath;

  beforeAll(async () => {
    ({ startServer } = await import(serverModuleUrl));
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    testDbPath = path.resolve(process.cwd(), `var/test-registry-${suffix}.sqlite`);
    registryConfigPath = path.resolve(process.cwd(), `var/test-registry-config-${suffix}.json`);

    const registryConfig = {
      dbPath: testDbPath,
      pragmas: { journal_mode: 'WAL', synchronous: 'NORMAL' },
    };
    fs.writeFileSync(registryConfigPath, JSON.stringify(registryConfig));
    await ensureSchema(testDbPath);
  });

  afterEach(async () => {
    try {
      if (registryConfigPath && fs.existsSync(registryConfigPath)) {
        fs.unlinkSync(registryConfigPath);
      }
      if (testDbPath && fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
      if (testDbPath && fs.existsSync(`${testDbPath}-wal`)) {
        fs.unlinkSync(`${testDbPath}-wal`);
      }
      if (testDbPath && fs.existsSync(`${testDbPath}-shm`)) {
        fs.unlinkSync(`${testDbPath}-shm`);
      }
    } catch {}

    if (activeServer) {
      await activeServer.close();
      activeServer = null;
    }
  });

  const requestJson = async (url, options = {}) => {
    const response = await fetch(url, options);
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (error) {
      throw new Error(`Failed to parse JSON for ${url}: ${error.message}`);
    }
    if (!response.ok) {
      throw new Error(`Request failed for ${url}: ${response.status} ${response.statusText} :: ${text}`);
    }
    return { response, json };
  };

const startRegistry = async ({ port }) => {
  activeServer = await startServer({
    registryConfigPath,
    apiKey: API_KEY,
    port,
    });
    return activeServer;
};

const uniquePort = () => 4800 + Math.floor(Math.random() * 200);

  test('concurrency: 50 parallel PUTs succeed and last write wins', async () => {
    const server = await startRegistry({ port: uniquePort() });
    expect(server.port).toBeDefined();
    const baseUrl = `http://127.0.0.1:${server.port}`;
    const urn = 'urn:protocol:api:concurrency-demo:1.0.0';
    const manifests = Array.from({ length: 50 }, (_, i) => ({
      v: i,
      capabilities: ['concurrency'],
    }));

    const results = await Promise.allSettled(
      manifests.map(async (body, idx) => {
        const attested = createAttestedRequest(urn, body, { commit: `commit-${idx}` });
        const res = await fetch(`${baseUrl}/v1/registry/${encodeURIComponent(urn)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
          },
          body: JSON.stringify(attested),
        });
        if (!res.ok) {
          const errorBody = await res.text();
          throw new Error(`Unexpected status ${res.status}: ${errorBody}`);
        }
      }),
    );

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      throw failures[0].reason;
    }

    const finalBody = {
      v: 999,
      capabilities: ['concurrency', 'final'],
      marker: 'final-write',
    };
    const finalDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify(finalBody))
      .digest('hex');

    const finalPut = await fetch(`${baseUrl}/v1/registry/${encodeURIComponent(urn)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify(createAttestedRequest(urn, finalBody, { commit: 'commit-final' })),
    });
    expect(finalPut.ok).toBe(true);

    const { json: manifest } = await requestJson(
      `${baseUrl}/v1/registry/${encodeURIComponent(urn)}`,
      {
        headers: { 'X-API-Key': API_KEY },
      },
    );

    const dbCheck = await openDb({ dbPath: testDbPath });
    const dbRow = await dbCheck.get('SELECT body FROM manifests WHERE urn=?', [urn]);
    await dbCheck.close();
    expect(JSON.parse(dbRow.body)).toEqual(finalBody);
    expect(manifest).toEqual(
      expect.objectContaining({
        urn,
        digest: finalDigest,
        body: finalBody,
      }),
    );
    expect(JSON.stringify(manifest.body)).not.toContain('"provenance"');
  }, 30000);

  test('crash/restart: DB persists and GET/resolve remain consistent', async () => {
    const urn = 'urn:protocol:api:crash:1.0.0';
    const manifest = { x: 1, capabilities: ['x'] };

    const initial = await startRegistry({ port: uniquePort() });

    const baseUrl = `http://127.0.0.1:${initial.port}`;

    const putResponse = await fetch(`${baseUrl}/v1/registry/${encodeURIComponent(urn)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify(createAttestedRequest(urn, manifest, { commit: 'commit-initial' })),
    });
    expect(putResponse.ok).toBe(true);

    await initial.close();
    activeServer = null;

    const restarted = await startRegistry({ port: uniquePort() });

    const restartBaseUrl = `http://127.0.0.1:${restarted.port}`;

    const { json: manifestAfter } = await requestJson(
      `${restartBaseUrl}/v1/registry/${encodeURIComponent(urn)}`,
      { headers: { 'X-API-Key': API_KEY } },
    );

    expect(manifestAfter.body).toEqual(manifest);
    expect(manifestAfter.provenance).toBeDefined();
    expect(manifestAfter.provenance.commit).toBe('commit-initial');

    const { json: resolved } = await requestJson(
      `${restartBaseUrl}/v1/resolve?urn=${encodeURIComponent(urn)}`,
      { headers: { 'X-API-Key': API_KEY } },
    );

    expect(resolved).toEqual(
      expect.objectContaining({
        urn,
        manifest,
        capabilities: ['x'],
      }),
    );
    await restarted.close();
    activeServer = null;
  });
});


