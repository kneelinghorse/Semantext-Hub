import { afterEach, describe, expect, test } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import {
  API_KEY,
  BASE_CARD,
  KEY_ID,
  createRegistryTestContext,
  cleanupRegistryTestContexts,
  registerManifest,
} from './helpers/registry-context.mjs';
import { startServer } from '../../packages/runtime/registry/server.mjs';

const cloneCard = () => JSON.parse(JSON.stringify(BASE_CARD));

afterEach(async () => {
  await cleanupRegistryTestContexts();
});

describe('Runtime Registry v1 API negative paths', () => {
  test('GET /v1/registry/:urn → 404 for unknown URN', async () => {
    const { app } = await createRegistryTestContext();
    await request(app)
      .get('/v1/registry/urn:protocol:api:does-not-exist:1.0.0')
      .set('X-API-Key', API_KEY)
      .expect(404)
      .expect('Content-Type', /json/);
  });

  test('PUT /v1/registry/:urn → 400 for invalid JSON payload', async () => {
    const { app } = await createRegistryTestContext();
    await request(app)
      .put('/v1/registry/urn:protocol:api:bad-json:1.0.0')
      .set('X-API-Key', API_KEY)
      .set('Content-Type', 'application/json')
      .send('{"oops"') // malformed JSON triggers body parser error
      .expect(400)
      .expect((res) => {
        expect(res.body.error).toBe('invalid_json');
      });
  });

  test('PUT /v1/registry/:urn → 400 when manifest is missing', async () => {
    const { app } = await createRegistryTestContext();
    const urn = 'urn:agent:runtime:missing-manifest';
    const response = await request(app)
      .put(`/v1/registry/${encodeURIComponent(urn)}`)
      .set('X-API-Key', API_KEY)
      .set('Content-Type', 'application/json')
      .send({ manifest: null });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_manifest');
  });

  test('PUT /v1/registry/:urn → 422 when provenance enforcement enabled without attestation', async () => {
    const { app } = await createRegistryTestContext({ requireProvenance: true });
    const urn = 'urn:agent:runtime:missing-provenance';
    const card = cloneCard();
    card.id = 'agent.runtime.missing-provenance';

    const response = await request(app)
      .put(`/v1/registry/${encodeURIComponent(urn)}`)
      .set('X-API-Key', API_KEY)
      .set('Content-Type', 'application/json')
      .send({ manifest: card, issuer: KEY_ID });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('missing-provenance');
  });

  test('PUT /v1/registry/:urn → 422 for invalid provenance signature', async () => {
    const { app, createProvenance } = await createRegistryTestContext({ requireProvenance: true });
    const urn = 'urn:agent:runtime:invalid-provenance';
    const card = cloneCard();
    card.id = 'agent.runtime.invalid-provenance';

    const provenance = createProvenance({
      outputs: [{ uri: urn, digest: { sha256: 'deadbeef' } }],
    });
    provenance.payload = Buffer.from('{}').toString('base64url');

    const response = await request(app)
      .put(`/v1/registry/${encodeURIComponent(urn)}`)
      .set('X-API-Key', API_KEY)
      .set('Content-Type', 'application/json')
      .send({ manifest: card, issuer: KEY_ID, provenance });

    expect(response.status).toBeGreaterThanOrEqual(422);
    expect(response.body.error).toBe('invalid-provenance');
    expect(response.body.reason).toBeDefined();
  });

  test('GET /v1/registry/:urn → 401 without API key', async () => {
    const { app } = await createRegistryTestContext();
    await request(app)
      .get('/v1/registry/urn:agent:runtime:auth-missing')
      .expect(401);
  });

  test('GET /v1/resolve → 400 when urn query missing or empty', async () => {
    const { app } = await createRegistryTestContext();
    await request(app)
      .get('/v1/resolve')
      .set('X-API-Key', API_KEY)
      .expect(400);

    await request(app)
      .get('/v1/resolve')
      .query({ urn: ' ' })
      .set('X-API-Key', API_KEY)
      .expect(400);
  });

  test('GET /v1/resolve → 404 for unknown URN', async () => {
    const { app } = await createRegistryTestContext();
    await request(app)
      .get('/v1/resolve')
      .query({ urn: 'urn:agent:runtime:missing' })
      .set('X-API-Key', API_KEY)
      .expect(404);
  });

  test('POST /v1/query → 400 when capability missing or invalid', async () => {
    const { app } = await createRegistryTestContext();
    await request(app)
      .post('/v1/query')
      .set('X-API-Key', API_KEY)
      .set('Content-Type', 'application/json')
      .send({})
      .expect(400);

    await request(app)
      .post('/v1/query')
      .set('X-API-Key', API_KEY)
      .set('Content-Type', 'application/json')
      .send({ capability: 123 })
      .expect(400);
  });

  test('POST /v1/query → returns registered capability results', async () => {
    const { app } = await createRegistryTestContext();
    const urn = `urn:agent:runtime:${randomUUID()}`;
    const manifest = cloneCard();
    manifest.id = 'agent.runtime.capability';
    manifest.capabilities.tools = [
      { name: 'echo', capability: 'runtime.echo', urn: 'runtime.echo' },
    ];

    const registerResponse = await registerManifest(app, { urn, manifest });
    expect(registerResponse.status).toBe(200);
    expect(registerResponse.body.digest).toBeDefined();

    const queryResponse = await request(app)
      .post('/v1/query')
      .set('X-API-Key', API_KEY)
      .set('Content-Type', 'application/json')
      .send({ capability: 'runtime.echo' })
      .expect(200);

    expect(queryResponse.body.status).toBe('ok');
    expect(Array.isArray(queryResponse.body.results)).toBe(true);
    expect(queryResponse.body.results[0]).toMatchObject({
      urn,
      digest: registerResponse.body.digest,
    });
  });

  test('GET /.well-known/ossp-agi.json → exposes discovery payload', async () => {
    const { app } = await createRegistryTestContext();
    const response = await request(app)
      .get('/.well-known/ossp-agi.json')
      .set('X-API-Key', API_KEY)
      .expect(200);

    expect(response.body.service).toMatch(/Registry Service/i);
    expect(response.body.links?.register_v1).toBe('/v1/registry/{urn}');
  });

  test('GET /health → reports database stats and rate limit configuration', async () => {
    const { app } = await createRegistryTestContext();
    const response = await request(app)
      .get('/health')
      .set('X-API-Key', API_KEY)
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.registry?.driver).toBe('sqlite');
    expect(response.body.rateLimit?.windowMs).toBeGreaterThan(0);
  });
});

describe('Runtime registry startServer integration', () => {
  test('startServer() launches listener and exposes close()', async () => {
    const started = await startServer({
      apiKey: API_KEY,
      dbPath: `var/test-registry-${randomUUID()}.sqlite`,
      host: '127.0.0.1',
      port: 0,
      requireProvenance: false,
      provenanceKeys: [],
    });

    try {
      expect(started.port).toBeGreaterThan(0);
      expect(typeof started.close).toBe('function');
    } finally {
      await started.close();
    }
  });
});
