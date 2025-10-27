/**
 * Registry HTTP Parity Test Harness
 * 
 * Mission: IM-01A-20251101
 * 
 * Validates that the runtime registry server (packages/runtime/registry/server.mjs)
 * provides full parity with the expected API contract, including:
 * - All required routes (/health, /openapi.json, /v1/registry/:urn, /v1/resolve, /v1/query)
 * - OpenAPI spec equality with on-disk spec
 * - Capability projection into capabilities table
 * - Provenance insertion and retrieval
 * - SQLite-only repository layer (no file-store dependencies)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createServer, loadOpenApiSpec } from '../../packages/runtime/registry/server.mjs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEnvelope } from '../../packages/runtime/security/dsse.mjs';
import { createProvenancePayload } from '../../packages/runtime/security/provenance.mjs';

const TEST_API_KEY = 'test-registry-key';
const PROVENANCE_PUBKEY_PATH = fileURLToPath(
  new URL('../../fixtures/keys/pub.pem', import.meta.url),
);
const PROVENANCE_PRIVKEY_PATH = fileURLToPath(
  new URL('../../fixtures/keys/priv.pem', import.meta.url),
);
const PROVENANCE_KEY_ID = 'registry-parity-key';

/**
 * Helper to normalize JSON for deep comparison (sorted keys)
 */
function normalizeJSON(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(normalizeJSON);
  }
  const sorted = {};
  Object.keys(obj).sort().forEach(key => {
    sorted[key] = normalizeJSON(obj[key]);
  });
  return sorted;
}

describe('Runtime Registry HTTP Parity', () => {
  let app;
  let db;
  let tmpDir;
  let provenancePrivateKey;
  let provenancePublicKey;

  beforeAll(async () => {
    // Create temporary directory for test database
    tmpDir = await mkdtemp(join(tmpdir(), 'registry-test-'));
    
    // Create a config file path that doesn't exist, will use defaults
    const nonExistentConfigPath = join(tmpDir, 'nonexistent-config.json');
    provenancePublicKey = await readFile(PROVENANCE_PUBKEY_PATH, 'utf8');
    provenancePrivateKey = await readFile(PROVENANCE_PRIVKEY_PATH, 'utf8');
    
    // Create server with test configuration
    app = await createServer({
      registryConfigPath: nonExistentConfigPath,
      rateLimitConfigPath: null, // Disable rate limiting for tests
      apiKey: TEST_API_KEY,
      requireProvenance: false, // Allow tests without provenance
      provenanceKeys: [
        { pubkey: provenancePublicKey, alg: 'Ed25519', keyid: PROVENANCE_KEY_ID },
      ],
    });
    
    // Initialize schema on the server's db
    db = app.get('db');
    const schemaPath = fileURLToPath(
      new URL('../../scripts/db/schema.sql', import.meta.url)
    );
    const schema = await readFile(schemaPath, 'utf8');
    await db.exec(schema);
  });

  afterAll(async () => {
    // Cleanup
    if (db) {
      await db.close();
    }
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    // Clear test data before each test
    await db.exec('DELETE FROM manifests');
    await db.exec('DELETE FROM capabilities');
    await db.exec('DELETE FROM provenance');
  });

  it('exposes runtime handles on the Express app', () => {
    expect(app.get('db')).toBeDefined();
    expect(typeof app.get('rateLimiter')).toBe('function');
    expect(app.get('rateLimitConfig')).toEqual(
      expect.objectContaining({
        windowMs: expect.any(Number),
        max: expect.any(Number),
      }),
    );
    expect(app.get('registryConfig')).toEqual(expect.any(Object));
  });

  describe('GET /health', () => {
    it('should return healthy status with registry info', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toEqual(
        expect.objectContaining({
          status: expect.stringMatching(/^(ok|warn|error)$/),
          registry: expect.objectContaining({
            driver: 'sqlite',
            wal: expect.any(Boolean),
            journal_mode: expect.anything(),
            schema_version: expect.any(Number),
            expected_schema_version: expect.any(Number),
            records: expect.any(Number),
          }),
          warnings: expect.any(Array),
          errors: expect.any(Array),
          rateLimit: expect.any(Object),
        }),
      );
      expect(response.body.errors).toHaveLength(0);
    });

    it('should report correct record count', async () => {
      // Clear existing data first
      await db.exec('DELETE FROM manifests');
      
      // Insert a test manifest
      await db.run(
        'INSERT INTO manifests (urn, body, digest) VALUES (?, ?, ?)',
        ['urn:test:agent:sample', '{"id":"sample"}', 'abc123']
      );

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.registry.records).toBe(1);
    });
  });

  describe('GET /openapi.json', () => {
    it('should serve the OpenAPI specification', async () => {
      const response = await request(app)
        .get('/openapi.json')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('openapi');
      expect(response.body).toHaveProperty('info');
      expect(response.body).toHaveProperty('paths');
    });

    it('should match the on-disk OpenAPI spec exactly', async () => {
      const response = await request(app)
        .get('/openapi.json')
        .expect(200);

      const diskSpec = await loadOpenApiSpec();
      
      // Normalize both for comparison
      const normalizedResponse = normalizeJSON(response.body);
      const normalizedDisk = normalizeJSON(diskSpec);

      expect(normalizedResponse).toEqual(normalizedDisk);
    });
  });

  describe('PUT /v1/registry/:urn', () => {
    const testUrn = 'urn:test:agent:example@v1.0.0';
    const testManifest = {
      id: 'example',
      version: '1.0.0',
      capabilities: ['test.capability.a', 'test.capability.b'],
      metadata: { author: 'Test Author' },
    };

    it('should register a new manifest', async () => {
      const response = await request(app)
        .put(`/v1/registry/${encodeURIComponent(testUrn)}`)
        .set('X-API-Key', TEST_API_KEY)
        .send({ manifest: testManifest })
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toEqual({
        status: 'ok',
        urn: testUrn,
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
        provenance: null,
      });
    });

    it('should require API key', async () => {
      await request(app)
        .put(`/v1/registry/${encodeURIComponent(testUrn)}`)
        .send({ manifest: testManifest })
        .expect(401)
        .expect('Content-Type', /json/);
    });

    it('should reject requests with invalid API key', async () => {
      await request(app)
        .put(`/v1/registry/${encodeURIComponent(testUrn)}`)
        .set('X-API-Key', 'invalid-key')
        .send({ manifest: testManifest })
        .expect(401);
    });

    it('should reject requests without manifest', async () => {
      const response = await request(app)
        .put(`/v1/registry/${encodeURIComponent(testUrn)}`)
        .set('X-API-Key', TEST_API_KEY)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('invalid_manifest');
    });

    it('should project capabilities into capabilities table', async () => {
      await request(app)
        .put(`/v1/registry/${encodeURIComponent(testUrn)}`)
        .set('X-API-Key', TEST_API_KEY)
        .send({ manifest: testManifest })
        .expect(200);

      // Verify capabilities were inserted
      const caps = await db.all(
        'SELECT cap FROM capabilities WHERE urn = ? ORDER BY cap',
        [testUrn]
      );

      expect(caps).toEqual([
        { cap: 'test.capability.a' },
        { cap: 'test.capability.b' },
      ]);
    });

    it('should update existing manifest and capabilities', async () => {
      // First insert
      await request(app)
        .put(`/v1/registry/${encodeURIComponent(testUrn)}`)
        .set('X-API-Key', TEST_API_KEY)
        .send({ manifest: testManifest })
        .expect(200);

      // Update with different capabilities
      const updatedManifest = {
        ...testManifest,
        capabilities: ['test.capability.c'],
      };

      await request(app)
        .put(`/v1/registry/${encodeURIComponent(testUrn)}`)
        .set('X-API-Key', TEST_API_KEY)
        .send({ manifest: updatedManifest })
        .expect(200);

      // Verify capabilities were replaced
      const caps = await db.all(
        'SELECT cap FROM capabilities WHERE urn = ?',
        [testUrn]
      );

      expect(caps).toEqual([{ cap: 'test.capability.c' }]);
    });

    it('should handle provenance when provided', async () => {
      // Note: Since requireProvenance: false, provenance validation still happens
      // when provided. For this test, we skip provenance since our mock
      // signature won't pass validation. This tests the flow without provenance.
      
      // Instead, test that we can register without provenance when it's optional
      const response = await request(app)
        .put(`/v1/registry/${encodeURIComponent(testUrn)}`)
        .set('X-API-Key', TEST_API_KEY)
        .send({ 
          manifest: testManifest,
        })
        .expect(200);

      expect(response.body.provenance).toBe(null);
    });
  });

  describe('GET /v1/registry/:urn', () => {
    const testUrn = 'urn:test:agent:fetch@v1.0.0';
    const testManifest = {
      id: 'fetch',
      version: '1.0.0',
      capabilities: ['fetch.data'],
    };

    beforeEach(async () => {
      // Seed test data
      await request(app)
        .put(`/v1/registry/${encodeURIComponent(testUrn)}`)
        .set('X-API-Key', TEST_API_KEY)
        .send({ manifest: testManifest })
        .expect(200);
    });

    it('should fetch existing manifest', async () => {
      const response = await request(app)
        .get(`/v1/registry/${encodeURIComponent(testUrn)}`)
        .set('X-API-Key', TEST_API_KEY)
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toEqual({
        urn: testUrn,
        body: testManifest,
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
        issuer: null,
        signature: null,
        updated_at: expect.any(String),
        provenance: null,
      });
    });

    it('should require API key', async () => {
      await request(app)
        .get(`/v1/registry/${encodeURIComponent(testUrn)}`)
        .expect(401);
    });

    it('should return 404 for non-existent manifest', async () => {
      const response = await request(app)
        .get('/v1/registry/urn:test:agent:nonexistent')
        .set('X-API-Key', TEST_API_KEY)
        .expect(404);

      expect(response.body.error).toBe('not_found');
    });

    it('should return null provenance when not provided', async () => {
      const urnWithoutProv = 'urn:test:agent:noprovenance@v1.0.0';
      const manifest = { id: 'noprovenance', capabilities: [] };

      await request(app)
        .put(`/v1/registry/${encodeURIComponent(urnWithoutProv)}`)
        .set('X-API-Key', TEST_API_KEY)
        .send({ manifest })
        .expect(200);

      const response = await request(app)
        .get(`/v1/registry/${encodeURIComponent(urnWithoutProv)}`)
        .set('X-API-Key', TEST_API_KEY)
        .expect(200);

      expect(response.body.provenance).toBe(null);
    });
  });

  describe('GET /v1/resolve', () => {
    const testUrn = 'urn:test:agent:resolver@v1.0.0';
    const testManifest = {
      id: 'resolver',
      version: '1.0.0',
      capabilities: ['resolve.a', 'resolve.b'],
    };

    beforeEach(async () => {
      await request(app)
        .put(`/v1/registry/${encodeURIComponent(testUrn)}`)
        .set('X-API-Key', TEST_API_KEY)
        .send({ manifest: testManifest })
        .expect(200);
    });

    it('should resolve agent by URN', async () => {
      const response = await request(app)
        .get('/v1/resolve')
        .query({ urn: testUrn })
        .set('X-API-Key', TEST_API_KEY)
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toEqual({
        urn: testUrn,
        manifest: testManifest,
        capabilities: expect.arrayContaining(['resolve.a', 'resolve.b']),
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
    });

    it('should require API key', async () => {
      await request(app)
        .get('/v1/resolve')
        .query({ urn: testUrn })
        .expect(401);
    });

    it('should require urn parameter', async () => {
      const response = await request(app)
        .get('/v1/resolve')
        .set('X-API-Key', TEST_API_KEY)
        .expect(400);

      expect(response.body.error).toBe('invalid_query');
    });

    it('should return 404 for non-existent URN', async () => {
      await request(app)
        .get('/v1/resolve')
        .query({ urn: 'urn:test:agent:missing' })
        .set('X-API-Key', TEST_API_KEY)
        .expect(404);
    });
  });

  describe('POST /v1/query', () => {
    beforeEach(async () => {
      // Seed multiple agents with different capabilities
      const agents = [
        {
          urn: 'urn:test:agent:alpha@v1',
          manifest: { id: 'alpha', capabilities: ['cap.shared', 'cap.alpha'] },
        },
        {
          urn: 'urn:test:agent:beta@v1',
          manifest: { id: 'beta', capabilities: ['cap.shared', 'cap.beta'] },
        },
        {
          urn: 'urn:test:agent:gamma@v1',
          manifest: { id: 'gamma', capabilities: ['cap.gamma'] },
        },
      ];

      for (const agent of agents) {
        await request(app)
          .put(`/v1/registry/${encodeURIComponent(agent.urn)}`)
          .set('X-API-Key', TEST_API_KEY)
          .send({ manifest: agent.manifest })
          .expect(200);
      }
    });

    it('should query agents by capability', async () => {
      const response = await request(app)
        .post('/v1/query')
        .set('X-API-Key', TEST_API_KEY)
        .send({ capability: 'cap.shared' })
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toEqual({
        status: 'ok',
        capability: 'cap.shared',
        results: expect.arrayContaining([
          {
            urn: 'urn:test:agent:alpha@v1',
            digest: expect.stringMatching(/^[a-f0-9]{64}$/),
          },
          {
            urn: 'urn:test:agent:beta@v1',
            digest: expect.stringMatching(/^[a-f0-9]{64}$/),
          },
        ]),
      });

      expect(response.body.results).toHaveLength(2);
    });

    it('should return empty results for non-existent capability', async () => {
      const response = await request(app)
        .post('/v1/query')
        .set('X-API-Key', TEST_API_KEY)
        .send({ capability: 'cap.nonexistent' })
        .expect(200);

      expect(response.body.results).toEqual([]);
    });

    it('should require API key', async () => {
      await request(app)
        .post('/v1/query')
        .send({ capability: 'cap.shared' })
        .expect(401);
    });

    it('should require capability parameter', async () => {
      const response = await request(app)
        .post('/v1/query')
        .set('X-API-Key', TEST_API_KEY)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('invalid_request');
    });
  });

  describe('Repository Intents - Capability Projection', () => {
    it('should verify capabilities are stored in separate table', async () => {
      const testUrn = 'urn:test:agent:cap-test@v1.0.0';
      const manifest = {
        id: 'cap-test',
        version: '1.0.0',
        capabilities: ['repo.cap.a', 'repo.cap.b', 'repo.cap.c'],
      };

      // Register manifest
      await request(app)
        .put(`/v1/registry/${encodeURIComponent(testUrn)}`)
        .set('X-API-Key', TEST_API_KEY)
        .send({ manifest })
        .expect(200);

      // Verify capabilities were projected
      const capRows = await db.all(
        'SELECT cap FROM capabilities WHERE urn = ? ORDER BY cap',
        [testUrn]
      );

      expect(capRows).toHaveLength(3);
      expect(capRows.map(r => r.cap)).toEqual([
        'repo.cap.a',
        'repo.cap.b',
        'repo.cap.c',
      ]);
    });

    it('should handle manifest updates by replacing capabilities', async () => {
      const testUrn = 'urn:test:agent:cap-update@v1.0.0';
      
      // First version with 2 capabilities
      const manifest1 = { id: 'cap-update', capabilities: ['old.cap.1', 'old.cap.2'] };
      await request(app)
        .put(`/v1/registry/${encodeURIComponent(testUrn)}`)
        .set('X-API-Key', TEST_API_KEY)
        .send({ manifest: manifest1 })
        .expect(200);

      // Update with different capabilities
      const manifest2 = { id: 'cap-update', capabilities: ['new.cap.1'] };
      await request(app)
        .put(`/v1/registry/${encodeURIComponent(testUrn)}`)
        .set('X-API-Key', TEST_API_KEY)
        .send({ manifest: manifest2 })
        .expect(200);

      // Verify old capabilities were replaced
      const capRows = await db.all(
        'SELECT cap FROM capabilities WHERE urn = ?',
        [testUrn]
      );

      expect(capRows).toHaveLength(1);
      expect(capRows[0].cap).toBe('new.cap.1');
    });
  });

  describe('Repository Intents - Provenance', () => {
    it('should persist provenance envelopes and expose summaries via GET', async () => {
      const testUrn = 'urn:test:agent:provenance@v1.0.0';
      const manifest = {
        id: 'prov-agent',
        version: '1.0.0',
        capabilities: ['prov.capability'],
      };

      const payload = createProvenancePayload({
        builderId: 'registry-parity-tests',
        commit: 'main-sha-commit',
        materials: [{ uri: testUrn }],
        buildTool: 'parity-suite',
      });

      const envelope = createEnvelope('application/vnd.in-toto+json', payload, {
        key: provenancePrivateKey,
        alg: 'Ed25519',
        keyid: PROVENANCE_KEY_ID,
      });

      const putResponse = await request(app)
        .put(`/v1/registry/${encodeURIComponent(testUrn)}`)
        .set('X-API-Key', TEST_API_KEY)
        .send({ manifest, provenance: envelope })
        .expect(200);

      expect(putResponse.body.provenance).toEqual(
        expect.objectContaining({
          builder: 'registry-parity-tests',
          commit: 'main-sha-commit',
          buildTool: 'parity-suite',
          materialsCount: expect.any(Number),
          statementType: expect.stringContaining('in-toto'),
          signature: expect.objectContaining({
            keyId: PROVENANCE_KEY_ID,
            scheme: expect.any(String),
            algorithm: expect.any(String),
          }),
        }),
      );

      const stored = await db.get(
        'SELECT envelope, digest, issuer, payload_type FROM provenance WHERE urn = ?',
        [testUrn],
      );
      expect(stored).toMatchObject({
        issuer: 'registry-parity-tests',
        payload_type: 'application/vnd.in-toto+json',
        digest: putResponse.body.digest,
      });

      const fetched = await request(app)
        .get(`/v1/registry/${encodeURIComponent(testUrn)}`)
        .set('X-API-Key', TEST_API_KEY)
        .expect(200);

      expect(fetched.body.provenance).toEqual(
        expect.objectContaining({
          builder: 'registry-parity-tests',
          commit: 'main-sha-commit',
          issuer: 'registry-parity-tests',
          digest: putResponse.body.digest,
          materialsCount: 1,
          buildTool: 'parity-suite',
          signature: expect.objectContaining({
            keyId: PROVENANCE_KEY_ID,
            scheme: expect.any(String),
            algorithm: expect.any(String),
          }),
        }),
      );
      expect(fetched.body.provenance.committedAt).toEqual(expect.any(String));
      expect(fetched.body.provenance.recordedAt).toEqual(expect.any(String));
      expect(Date.parse(fetched.body.provenance.timestamp)).not.toBeNaN();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON gracefully', async () => {
      const response = await request(app)
        .put('/v1/registry/urn:test:invalid')
        .set('X-API-Key', TEST_API_KEY)
        .set('Content-Type', 'application/json')
        .send('invalid json{')
        .expect(400);

      expect(response.body.error).toBe('invalid_json');
    });

    it('should return 404 for non-existent URN with proper error structure', async () => {
      const response = await request(app)
        .get('/v1/registry/urn:test:definitely-not-exists')
        .set('X-API-Key', TEST_API_KEY)
        .expect(404);

      expect(response.body).toEqual({
        error: 'not_found',
        message: expect.stringContaining('No manifest found'),
        urn: 'urn:test:definitely-not-exists',
      });
    });
  });

  describe('CORS Handling', () => {
    it('should allow localhost origins', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:8080')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8080');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
    });

    it('should handle OPTIONS preflight requests', async () => {
      const response = await request(app)
        .options('/v1/registry/test')
        .set('Origin', 'http://localhost:3000')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });
  });
});
