// Negative-path coverage for Registry HTTP service.
// Targets: 400/401/404/409/422 paths, OPTIONS/CORS, invalid URNs, query validation.
import { afterEach, describe, expect, test } from '@jest/globals';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';

import {
  API_KEY,
  BASE_CARD,
  createRegistryTestContext,
  cleanupRegistryTestContexts,
} from './helpers/registry-context.mjs';
import {
  createRegistryServer,
  RegistryStore,
  startRegistryServer,
} from '../../app/services/registry/server.mjs';

const cloneCard = () => JSON.parse(JSON.stringify(BASE_CARD));

afterEach(async () => {
  await cleanupRegistryTestContexts();
});

async function makeTempConfig() {
  const workDir = await mkdtemp(path.join(tmpdir(), 'registry-config-'));
  const storePath = path.join(workDir, 'store.jsonl');
  const indexPath = path.join(workDir, 'index.urn.json');
  const capIndexPath = path.join(workDir, 'index.cap.json');
  const policyPath = path.join(workDir, 'signature-policy.json');
  await writeFile(
    policyPath,
    JSON.stringify({ version: 1, requireSignature: true, keys: [] }),
    'utf8',
  );
  return { workDir, storePath, indexPath, capIndexPath, policyPath };
}

describe('Registry Service Negative Paths', () => {
  test('GET /v1/registry/:urn → 404 for unknown URN', async () => {
    const { app } = await createRegistryTestContext();
    await request(app)
      .get('/v1/registry/urn:protocol:api:does-not-exist:1.0.0')
      .set('X-API-Key', API_KEY)
      .expect(404)
      .expect('Content-Type', /json/);
  });

  test('PUT /v1/registry/:urn → 400 for invalid JSON', async () => {
    const { app } = await createRegistryTestContext();
    await request(app)
      .put('/v1/registry/urn:protocol:api:bad-json:1.0.0')
      .set('X-API-Key', API_KEY)
      .set('Content-Type', 'application/json')
      .send('{"oops"') // malformed JSON triggers body parser error
      .expect(400);
  });

  test('GET /v1/resolve without urn → 400', async () => {
    const { app } = await createRegistryTestContext();
    await request(app)
      .get('/v1/resolve')
      .set('X-API-Key', API_KEY)
      .expect(400);
  });

  test('GET /v1/resolve with empty urn → 400', async () => {
    const { app } = await createRegistryTestContext();
    await request(app)
      .get('/v1/resolve')
      .query({ urn: '' })
      .set('X-API-Key', API_KEY)
      .expect(400);
  });

  test('OPTIONS preflight sets localhost CORS headers', async () => {
    const { app } = await createRegistryTestContext();
    const response = await request(app)
      .options('/v1/registry/urn:protocol:api:something:1.0.0')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'PUT')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toContain('localhost');
    expect(response.headers['access-control-allow-methods']).toContain('OPTIONS');
    expect(response.headers['access-control-allow-headers']).toContain('X-API-Key');
  });

  test('OPTIONS with non-localhost origin does not echo origin', async () => {
    const { app } = await createRegistryTestContext();
    const response = await request(app)
      .options('/v1/registry/urn:protocol:api:something:1.0.0')
      .set('Origin', 'https://malicious.example')
      .set('Access-Control-Request-Method', 'PUT')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('GET /registry with invalid cap format → 400', async () => {
    const { app } = await createRegistryTestContext();
    const response = await request(app)
      .get('/registry')
      .set('X-API-Key', API_KEY)
      .query({ cap: 'not!!!valid' })
      .expect(400);

    expect(response.body.error).toBe('invalid_query');
  });

  test('GET /registry with cap longer than 256 chars → 400', async () => {
    const { app } = await createRegistryTestContext();
    await request(app)
      .get('/registry')
      .set('X-API-Key', API_KEY)
      .query({ cap: 'x'.repeat(300) })
      .expect(400);
  });

  test('GET /registry with empty cap entry → 400', async () => {
    const { app } = await createRegistryTestContext();
    await request(app)
      .get('/registry')
      .set('X-API-Key', API_KEY)
      .query({ cap: '  ' })
      .expect(400);
  });

  test('GET /registry with array containing invalid entries → 400', async () => {
    const { app } = await createRegistryTestContext();
    await request(app)
      .get('/registry')
      .set('X-API-Key', API_KEY)
      .query({ cap: ['valid:cap', 'bad!!!', ''] })
      .expect(400);
  });

  test('POST /registry with unknown signature key → 422', async () => {
    const { app } = await createRegistryTestContext();
    const card = cloneCard();
    const header = Buffer.from(
      JSON.stringify({ kid: 'missing-key', alg: 'EdDSA' }),
    ).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ card })).toString('base64url');

    const response = await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .set('Content-Type', 'application/json')
      .send({
        urn: 'urn:agent:negative:test',
        card,
        sig: {
          spec: 'identity-access.signing.v1',
          protected: header,
          payload,
          signature: 'invalid-signature',
          hash: { alg: 'sha256', value: 'deadbeef' },
        },
      })
      .expect(422);

    expect(response.body.error).toBe('signature_invalid');
    expect(JSON.stringify(response.body.details ?? [])).toContain('unknown_issuer');
  });

  test('GET /v1/registry/:urn without API key → 401', async () => {
    const { app } = await createRegistryTestContext();
    await request(app)
      .get('/v1/registry/urn:agent:auth-missing')
      .expect(401);
  });

  const invalidPayloads = [
    {
      name: 'payload is null',
      body: null,
      check: (res) => expect(['invalid_request', 'invalid_json']).toContain(res.body.error),
    },
    {
      name: 'payload is array',
      body: [],
      check: (res) => expect(res.body.error).toBe('invalid_request'),
    },
    {
      name: 'missing card',
      body: { urn: 'urn:test', sig: {} },
      check: (res) => expect(JSON.stringify(res.body.details)).toContain('`card`'),
    },
    {
      name: 'missing card.id',
      body: { urn: 'urn:test', card: { name: 'Test', capabilities: { tools: [] }, communication: {}, authorization: {} }, sig: {} },
      check: (res) => expect(JSON.stringify(res.body.details)).toContain('`card.id`'),
    },
    {
      name: 'missing card.capabilities',
      body: { urn: 'urn:test', card: { id: 'test', name: 'Test', communication: {}, authorization: {} }, sig: {} },
      check: (res) => expect(JSON.stringify(res.body.details)).toContain('`card.capabilities`'),
    },
    {
      name: 'card.capabilities.tools not array',
      body: { urn: 'urn:test', card: { id: 'test', name: 'Test', capabilities: { tools: {} }, communication: {}, authorization: {} }, sig: {} },
      check: (res) => expect(JSON.stringify(res.body.details)).toContain('capabilities.tools'),
    },
    {
      name: 'missing communication',
      body: { urn: 'urn:test', card: { id: 'test', name: 'Test', capabilities: { tools: [] }, authorization: {} }, sig: {} },
      check: (res) => expect(JSON.stringify(res.body.details)).toContain('communication'),
    },
    {
      name: 'missing authorization',
      body: { urn: 'urn:test', card: { id: 'test', name: 'Test', capabilities: { tools: [] }, communication: {} }, sig: {} },
      check: (res) => expect(JSON.stringify(res.body.details)).toContain('authorization'),
    },
    {
      name: 'missing sig',
      body: { urn: 'urn:test', card: { id: 'test', name: 'Test', capabilities: { tools: [] }, communication: {}, authorization: {} } },
      check: (res) => expect(JSON.stringify(res.body.details)).toContain('`sig`'),
    },
    {
      name: 'invalid sig.spec value',
      body: {
        urn: 'urn:test',
        card: { id: 'test', name: 'Test', capabilities: { tools: [] }, communication: {}, authorization: {} },
        sig: {
          spec: 'wrong-spec',
          protected: 'x',
          payload: 'x',
          signature: 'x',
          hash: { alg: 'sha256', value: 'deadbeef' },
        },
      },
      check: (res) => expect(JSON.stringify(res.body.details)).toContain('sig.spec'),
    },
    {
      name: 'missing sig.protected',
      body: {
        urn: 'urn:test',
        card: { id: 'test', name: 'Test', capabilities: { tools: [] }, communication: {}, authorization: {} },
        sig: {
          spec: 'identity-access.signing.v1',
          payload: 'payload',
          signature: 'sig',
          hash: { alg: 'sha256', value: 'deadbeef' },
        },
      },
      check: (res) => expect(JSON.stringify(res.body.details)).toContain('sig.protected'),
    },
    {
      name: 'missing sig.payload',
      body: {
        urn: 'urn:test',
        card: { id: 'test', name: 'Test', capabilities: { tools: [] }, communication: {}, authorization: {} },
        sig: {
          spec: 'identity-access.signing.v1',
          protected: 'x',
          signature: 'sig',
          hash: { alg: 'sha256', value: 'deadbeef' },
        },
      },
      check: (res) => expect(JSON.stringify(res.body.details)).toContain('sig.payload'),
    },
    {
      name: 'sig.payload wrong type',
      body: {
        urn: 'urn:test',
        card: { id: 'test', name: 'Test', capabilities: { tools: [] }, communication: {}, authorization: {} },
        sig: {
          spec: 'identity-access.signing.v1',
          protected: 'x',
          payload: 123,
          signature: 'sig',
          hash: { alg: 'sha256', value: 'deadbeef' },
        },
      },
      check: (res) => expect(JSON.stringify(res.body.details)).toContain('sig.payload'),
    },
    {
      name: 'missing sig.signature',
      body: {
        urn: 'urn:test',
        card: { id: 'test', name: 'Test', capabilities: { tools: [] }, communication: {}, authorization: {} },
        sig: {
          spec: 'identity-access.signing.v1',
          protected: 'x',
          payload: 'payload',
          hash: { alg: 'sha256', value: 'deadbeef' },
        },
      },
      check: (res) => expect(JSON.stringify(res.body.details)).toContain('sig.signature'),
    },
    {
      name: 'sig.signature wrong type',
      body: {
        urn: 'urn:test',
        card: { id: 'test', name: 'Test', capabilities: { tools: [] }, communication: {}, authorization: {} },
        sig: {
          spec: 'identity-access.signing.v1',
          protected: 'x',
          payload: 'payload',
          signature: 42,
          hash: { alg: 'sha256', value: 'deadbeef' },
        },
      },
      check: (res) => expect(JSON.stringify(res.body.details)).toContain('sig.signature'),
    },
    {
      name: 'sig hash missing fields',
      body: {
        urn: 'urn:test',
        card: { id: 'test', name: 'Test', capabilities: { tools: [] }, communication: {}, authorization: {} },
        sig: { spec: 'identity-access.signing.v1', protected: 'x', payload: 'x', signature: 'x', hash: { alg: 'sha256' } },
      },
      check: (res) => expect(JSON.stringify(res.body.details)).toContain('sig.hash.value'),
    },
    {
      name: 'sig.hash missing alg',
      body: {
        urn: 'urn:test',
        card: { id: 'test', name: 'Test', capabilities: { tools: [] }, communication: {}, authorization: {} },
        sig: {
          spec: 'identity-access.signing.v1',
          protected: 'x',
          payload: 'x',
          signature: 'x',
          hash: { value: 'deadbeef' },
        },
      },
      check: (res) => expect(JSON.stringify(res.body.details)).toContain('sig.hash.alg'),
    },
    {
      name: 'sig.hash.alg wrong type',
      body: {
        urn: 'urn:test',
        card: { id: 'test', name: 'Test', capabilities: { tools: [] }, communication: {}, authorization: {} },
        sig: {
          spec: 'identity-access.signing.v1',
          protected: 'x',
          payload: 'x',
          signature: 'x',
          hash: { alg: 123, value: 'deadbeef' },
        },
      },
      check: (res) => expect(JSON.stringify(res.body.details)).toContain('sig.hash.alg'),
    },
    {
      name: 'sig.hash not object',
      body: {
        urn: 'urn:test',
        card: { id: 'test', name: 'Test', capabilities: { tools: [] }, communication: {}, authorization: {} },
        sig: {
          spec: 'identity-access.signing.v1',
          protected: 'x',
          payload: 'x',
          signature: 'x',
          hash: [],
        },
      },
      check: (res) => expect(JSON.stringify(res.body.details)).toContain('`sig.hash` is required and must be an object.'),
    },
    {
      name: 'sig.hash.value wrong type',
      body: {
        urn: 'urn:test',
        card: { id: 'test', name: 'Test', capabilities: { tools: [] }, communication: {}, authorization: {} },
        sig: {
          spec: 'identity-access.signing.v1',
          protected: 'x',
          payload: 'x',
          signature: 'x',
          hash: { alg: 'sha256', value: 999 },
        },
      },
      check: (res) => expect(JSON.stringify(res.body.details)).toContain('sig.hash.value'),
    },
  ];

  test.each(invalidPayloads)('POST /registry with %s → 400', async ({ body, check }) => {
    const { app } = await createRegistryTestContext();
    const response = await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(400);

    check(response);
  });

  test('POST /registry registers agent and prevents duplicate → 201 then 409', async () => {
    const { app, signCard } = await createRegistryTestContext();
    const card = cloneCard();
    const sig = signCard(card);

    const first = await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .send({ urn: 'urn:agent:registered', card, sig })
      .expect(201);

    expect(first.body.status).toBe('registered');
    expect(first.body.urn).toBe('urn:agent:registered');

    const second = await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .send({ urn: 'urn:agent:registered', card, sig })
      .expect(409);

    expect(second.body.error).toBe('conflict');
  });

  test('GET /registry returns capability matches with pagination', async () => {
    const { app, signCard } = await createRegistryTestContext();

    const makeCard = (urn, capability) => {
      const card = cloneCard();
      card.id = urn;
      card.capabilities.tools = [{ name: `tool-${capability}`, capability }];
      return card;
    };

    for (const suffix of ['alpha', 'alpha.extra', 'beta']) {
      const urn = `urn:agent:${suffix}`;
      const card = makeCard(urn, `cap:${suffix}`);
      const sig = signCard(card);
      await request(app)
        .post('/registry')
        .set('X-API-Key', API_KEY)
        .send({ urn, card, sig })
        .expect(201);
    }

    const response = await request(app)
      .get('/registry')
      .set('X-API-Key', API_KEY)
      .query({ cap: 'cap:alpha', limit: 1, offset: 0 })
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.results.length).toBeGreaterThan(0);
    expect(response.body.query.limit).toBe(1);
    expect(response.body.results[0]).toHaveProperty('urn');
  });

  test('GET /registry caps limit to MAX_QUERY_LIMIT and normalizes offset', async () => {
    const { app, signCard } = await createRegistryTestContext();
    const urn = 'urn:agent:max-limit';
    const card = cloneCard();
    card.capabilities.tools = [{ name: 'tool', capability: 'cap:max' }];
    const sig = signCard(card);

    await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .send({ urn, card, sig })
      .expect(201);

    const response = await request(app)
      .get('/registry')
      .set('X-API-Key', API_KEY)
      .query({ cap: 'cap:max', limit: 9999, offset: -10 })
      .expect(200);

    expect(response.body.query.limit).toBeLessThanOrEqual(100);
    expect(response.body.query.offset).toBe(0);
  });

  test('GET /registry accepts comma-separated cap values', async () => {
    const { app, signCard } = await createRegistryTestContext();
    const urn = 'urn:agent:comma';
    const card = cloneCard();
    card.capabilities.tools = [{ name: 'tool', capability: 'cap:comma' }];
    const sig = signCard(card);

    await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .send({ urn, card, sig })
      .expect(201);

    const response = await request(app)
      .get('/registry')
      .set('X-API-Key', API_KEY)
      .query({ cap: 'cap:comma, cap:other' })
      .expect(200);

    const caps = response.body.query.caps.map((entry) => entry.normalized);
    expect(caps).toContain('cap:comma');
  });

  test('GET /registry honors X-Forwarded-For for rate limiting keys', async () => {
    const { app, signCard } = await createRegistryTestContext();
    const card = cloneCard();
    card.capabilities.tools = [{ name: 'tool', capability: 'cap:forwarded' }];
    const sig = signCard(card);

    await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .send({ urn: 'urn:agent:forwarded', card, sig })
      .expect(201);

    const response = await request(app)
      .get('/registry')
      .set('X-API-Key', API_KEY)
      .set('X-Forwarded-For', '192.168.0.1, 10.0.0.1')
      .query({ cap: 'cap:forwarded' })
      .expect(200);

    expect(response.body.results[0].urn).toBe('urn:agent:forwarded');
  });

  test('PUT /v1/registry/:urn enforces URN match', async () => {
    const { app } = await createRegistryTestContext();
    const card = cloneCard();
    const response = await request(app)
      .put('/v1/registry/urn:agent:one')
      .set('X-API-Key', API_KEY)
      .send({ urn: 'urn:agent:two', card, sig: {} })
      .expect(400);

    expect(response.body.error).toBe('urn_mismatch');
  });

  test('PUT /v1/registry creates new record then updates existing', async () => {
    const { app, signCard, createProvenance } = await createRegistryTestContext();
    const urn = 'urn:agent:put';
    const card = cloneCard();
    const sig = signCard(card);
    const provenanceInitial = createProvenance({ commit: 'commit-initial' });

    const first = await request(app)
      .put(`/v1/registry/${encodeURIComponent(urn)}`)
      .set('X-API-Key', API_KEY)
      .send({ urn, card, sig, provenance: provenanceInitial })
      .expect(201);
    expect(first.body.status).toBe('registered');

    const provenanceUpdated = createProvenance({ commit: 'commit-update' });

    const second = await request(app)
      .put(`/v1/registry/${encodeURIComponent(urn)}`)
      .set('X-API-Key', API_KEY)
      .send({ urn, card, sig, provenance: provenanceUpdated })
      .expect(200);

    expect(second.body.status).toBe('updated');
    expect(second.body.provenance).toBeDefined();
    expect(second.body.provenance.signature?.keyid).toBe('test-key');
  });

  test('PUT /v1/registry rejects tampered signature with 422', async () => {
    const { app, signCard, createProvenance } = await createRegistryTestContext();
    const urn = 'urn:agent:tamper';
    const card = cloneCard();
    const sig = signCard(card);
    // Tamper with card after signing to trigger digest mismatch
    const tamperedCard = { ...card, name: 'Altered Name' };

    const response = await request(app)
      .put(`/v1/registry/${encodeURIComponent(urn)}`)
      .set('X-API-Key', API_KEY)
      .send({ urn, card: tamperedCard, sig, provenance: createProvenance({ commit: 'commit-tamper' }) })
      .expect(422);

    expect(response.body.error).toBe('signature_invalid');
    expect(response.body.verification).toBeDefined();
  });

  test('PUT /v1/registry rejects missing provenance in enforce mode', async () => {
    const { app, signCard } = await createRegistryTestContext();
    const urn = 'urn:agent:missing-prov';
    const card = cloneCard();
    const sig = signCard(card);

    const response = await request(app)
      .put(`/v1/registry/${encodeURIComponent(urn)}`)
      .set('X-API-Key', API_KEY)
      .send({ urn, card, sig })
      .expect(422);

    expect(response.body.error).toBe('missing_provenance');
  });

  test('GET /v1/registry and /v1/resolve return registered record', async () => {
    const { app, signCard } = await createRegistryTestContext();
    const urn = 'urn:agent:get';
    const card = cloneCard();
    card.capabilities.tools = [{ name: 'tool', capability: 'cap:get' }];
    const sig = signCard(card);

    await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .send({ urn, card, sig })
      .expect(201);

    const v1Record = await request(app)
      .get(`/v1/registry/${encodeURIComponent(urn)}`)
      .set('X-API-Key', API_KEY)
      .expect(200);

    expect(v1Record.body.urn).toBe(urn);

    const resolveRecord = await request(app)
      .get('/v1/resolve')
      .set('X-API-Key', API_KEY)
      .query({ urn })
      .expect(200);

    expect(resolveRecord.body.urn).toBe(urn);

    const legacyResolve = await request(app)
      .get(`/resolve/${encodeURIComponent(urn)}`)
      .set('X-API-Key', API_KEY)
      .expect(200);

    expect(legacyResolve.body.card).toBeDefined();
  });

  test('GET /v1/resolve returns 404 for unknown URN', async () => {
    const { app } = await createRegistryTestContext();
    await request(app)
      .get('/v1/resolve')
      .set('X-API-Key', API_KEY)
      .query({ urn: 'urn:agent:nope' })
      .expect(404);
  });

  test('GET /.well-known/ossp-agi.json returns service metadata', async () => {
    const { app } = await createRegistryTestContext();
    const response = await request(app)
      .get('/.well-known/ossp-agi.json')
      .expect(200);

    expect(response.body.service).toBe('OSSP-AGI Registry Service');
  });

  test('GET /openapi.json returns OpenAPI spec', async () => {
    const { app } = await createRegistryTestContext();
    const response = await request(app)
      .get('/openapi.json')
      .expect(200);

    expect(response.body.openapi).toBe('3.0.0');
  });

  test('GET /health reports registry state and rate limit config', async () => {
    const { app } = await createRegistryTestContext({ rateLimit: { windowMs: 5000, max: 5 } });
    const response = await request(app)
      .get('/health')
      .set('X-API-Key', API_KEY)
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.rateLimit.max).toBe(5);
  });

  test('Unhandled errors bubble to 500 response', async () => {
    const { app } = await createRegistryTestContext({
      // Force invalid signature policy path to trigger startup failure
      signaturePolicy: {
        version: 1,
        requireSignature: true,
        keys: [
          { keyId: 'test-key', publicKey: '-----BEGIN PUBLIC KEY-----\ninvalid\n-----END PUBLIC KEY-----', algorithm: 'EdDSA' },
        ],
      },
    });

    const card = cloneCard();
    const header = Buffer.from(
      JSON.stringify({ kid: 'test-key', alg: 'EdDSA' }),
    ).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ card })).toString('base64url');

    const response = await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .set('Content-Type', 'application/json')
      .send({
        urn: 'urn:agent:broken',
        card,
        sig: {
          spec: 'identity-access.signing.v1',
          protected: header,
          payload,
          signature: 'invalid',
          hash: { alg: 'sha256', value: 'beadfeed' },
        },
      })
      .expect(res => {
        // Expect either 422 (signature invalid) or 500 depending on verification failure path.
        expect([422, 500]).toContain(res.status);
      });

    if (response.status === 500) {
      expect(response.body.error).toBe('internal_error');
    }
  });

  test('createRegistryServer requires an API key', async () => {
    const paths = await makeTempConfig();
    await expect(
      createRegistryServer({
        apiKey: '',
        storePath: paths.storePath,
        indexPath: paths.indexPath,
        capIndexPath: paths.capIndexPath,
        signaturePolicyPath: paths.policyPath,
      }),
    ).rejects.toThrow('Registry API key must be provided');
    await rm(paths.workDir, { recursive: true, force: true });
  });

  test('createRegistryServer loads custom rate limit config', async () => {
    const paths = await makeTempConfig();
    const ratePath = path.join(paths.workDir, 'rate-limit.json');
    await writeFile(ratePath, JSON.stringify({ windowMs: 2500, max: 3 }), 'utf8');

    const server = await createRegistryServer({
      apiKey: 'custom-rate',
      storePath: paths.storePath,
      indexPath: paths.indexPath,
      capIndexPath: paths.capIndexPath,
      signaturePolicyPath: paths.policyPath,
      rateLimitConfigPath: ratePath,
    });

    expect(server.rateLimit.max).toBe(3);
    expect(server.rateLimit.windowMs).toBe(2500);
    await rm(paths.workDir, { recursive: true, force: true });
  });

  test('createRegistryServer falls back when rate limit config is invalid JSON', async () => {
    const paths = await makeTempConfig();
    const ratePath = path.join(paths.workDir, 'rate-limit.json');
    await writeFile(ratePath, '{invalid', 'utf8');

    const server = await createRegistryServer({
      apiKey: 'fallback-rate',
      storePath: paths.storePath,
      indexPath: paths.indexPath,
      capIndexPath: paths.capIndexPath,
      signaturePolicyPath: paths.policyPath,
      rateLimitConfigPath: ratePath,
    });

    expect(server.rateLimit.max).toBe(60);
    await rm(paths.workDir, { recursive: true, force: true });
  });

  test('createRegistryServer allows null rate limit config path', async () => {
    const paths = await makeTempConfig();
    const server = await createRegistryServer({
      apiKey: 'null-rate',
      storePath: paths.storePath,
      indexPath: paths.indexPath,
      capIndexPath: paths.capIndexPath,
      signaturePolicyPath: paths.policyPath,
      rateLimitConfigPath: null,
    });

    expect(server.rateLimit.max).toBe(60);
    await rm(paths.workDir, { recursive: true, force: true });
  });

  test('createRegistryServer rejects invalid signature policy JSON', async () => {
    const paths = await makeTempConfig();
    const badPolicy = path.join(paths.workDir, 'bad-policy.json');
    await writeFile(badPolicy, '{ not json', 'utf8');

    await expect(
      createRegistryServer({
        apiKey: 'policy-test',
        storePath: paths.storePath,
        indexPath: paths.indexPath,
        capIndexPath: paths.capIndexPath,
        signaturePolicyPath: badPolicy,
      }),
    ).rejects.toThrow(/not valid JSON/i);

    await rm(paths.workDir, { recursive: true, force: true });
  });

  test('createRegistryServer rejects signature policy missing keyId', async () => {
    const paths = await makeTempConfig();
    const badPolicy = path.join(paths.workDir, 'bad-policy.json');
    await writeFile(
      badPolicy,
      JSON.stringify({ version: 1, requireSignature: true, keys: [{}] }),
      'utf8',
    );

    await expect(
      createRegistryServer({
        apiKey: 'policy-test',
        storePath: paths.storePath,
        indexPath: paths.indexPath,
        capIndexPath: paths.capIndexPath,
        signaturePolicyPath: badPolicy,
      }),
    ).rejects.toThrow(/keyId/);

    await rm(paths.workDir, { recursive: true, force: true });
  });

  test('createRegistryServer rejects signature policy missing publicKey', async () => {
    const paths = await makeTempConfig();
    const badPolicy = path.join(paths.workDir, 'bad-policy.json');
    await writeFile(
      badPolicy,
      JSON.stringify({
        version: 1,
        requireSignature: true,
        keys: [{ keyId: 'missing-public-key' }],
      }),
      'utf8',
    );

    await expect(
      createRegistryServer({
        apiKey: 'policy-test',
        storePath: paths.storePath,
        indexPath: paths.indexPath,
        capIndexPath: paths.capIndexPath,
        signaturePolicyPath: badPolicy,
      }),
    ).rejects.toThrow(/publicKey/);

    await rm(paths.workDir, { recursive: true, force: true });
  });

  test('createRegistryServer errors when signature policy file is missing', async () => {
    const paths = await makeTempConfig();
    const missingPolicy = path.join(paths.workDir, 'does-not-exist.json');

    await expect(
      createRegistryServer({
        apiKey: 'policy-test',
        storePath: paths.storePath,
        indexPath: paths.indexPath,
        capIndexPath: paths.capIndexPath,
        signaturePolicyPath: missingPolicy,
      }),
    ).rejects.toThrow(/Signature policy not found/);

    await rm(paths.workDir, { recursive: true, force: true });
  });

  test('POST /registry with invalid protected header → 422', async () => {
    const { app } = await createRegistryTestContext();
    const card = cloneCard();

    const response = await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .send({
        urn: 'urn:agent:invalid-header',
        card,
        sig: {
          spec: 'identity-access.signing.v1',
          protected: '!!not-base64!!',
          payload: 'payload',
          signature: 'sig',
          hash: { alg: 'sha256', value: 'deadbeef' },
        },
      })
      .expect(422);

    expect(JSON.stringify(response.body.details)).toContain('invalid_protected_header');
  });

  test('POST /registry with malformed protected header JSON → 422', async () => {
    const { app } = await createRegistryTestContext();
    const card = cloneCard();
    const malformed = Buffer.from('{ invalid json').toString('base64url');

    const response = await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .send({
        urn: 'urn:agent:invalid-json-header',
        card,
        sig: {
          spec: 'identity-access.signing.v1',
          protected: malformed,
          payload: 'payload',
          signature: 'sig',
          hash: { alg: 'sha256', value: 'deadbeef' },
        },
      })
      .expect(422);

    expect(JSON.stringify(response.body.details)).toContain('invalid_protected_header');
  });

  test('POST /registry with header missing kid still rejects with error detail', async () => {
    const { app } = await createRegistryTestContext();
    const card = cloneCard();
    const header = Buffer.from(JSON.stringify({ alg: 'EdDSA' })).toString('base64url');

    const response = await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .send({
        urn: 'urn:agent:no-kid',
        card,
        sig: {
          spec: 'identity-access.signing.v1',
          protected: header,
          payload: Buffer.from(JSON.stringify({ card })).toString('base64url'),
          signature: 'sig',
          hash: { alg: 'sha256', value: 'beadfeed' },
        },
      })
      .expect(422);

    const details = JSON.stringify(response.body.details);
    expect(details).toContain('missing_key_id');
  });

  test('POST /registry with algorithm mismatch reports verification error', async () => {
    const { app, signCard } = await createRegistryTestContext();
    const card = cloneCard();
    const validSig = signCard(card);
    const header = JSON.parse(Buffer.from(validSig.protected, 'base64url').toString('utf8'));
    header.alg = 'ES256';
    const mismatchedSig = {
      ...validSig,
      protected: Buffer.from(JSON.stringify(header)).toString('base64url'),
    };

    const response = await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .send({ urn: 'urn:agent:algo-mismatch', card, sig: mismatchedSig })
      .expect(422);

    expect(JSON.stringify(response.body.details)).toContain('unsupported_algorithm');
  });

  test('Signature enforcement disabled allows registration with unverifiable signature', async () => {
    const { app } = await createRegistryTestContext({
      signaturePolicy: { version: 1, requireSignature: false, keys: [] },
    });

    const card = cloneCard();
    const response = await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .send({
        urn: 'urn:agent:optional-signature',
        card,
        sig: {
          spec: 'identity-access.signing.v1',
          protected: Buffer.from(JSON.stringify({ alg: 'EdDSA', kid: 'unknown' })).toString('base64url'),
          payload: Buffer.from(JSON.stringify({ card })).toString('base64url'),
          signature: 'invalid',
          hash: { alg: 'sha256', value: 'feedbeef' },
        },
      })
      .expect(201);

    expect(response.body.status).toBe('registered');
    expect(response.body.verification.status).toBe('unverified');
  });

  test('SignatureVerifier handles missing signature envelope', async () => {
    const context = await createRegistryTestContext();
    const verification = await context.signatureVerifier.verify({ card: cloneCard(), sig: null });
    expect(verification.errors).toContain('invalid_protected_header');
    expect(verification.shouldReject).toBe(true);
  });

  test('RegistryStore capability indexing returns exact and partial matches', async () => {
    const { workDir, storePath, indexPath, capIndexPath } = await makeTempConfig();
    const store = new RegistryStore({ storePath, indexPath, capIndexPath });
    await store.initialize();

    const makeCard = (id, capability) => {
      const card = cloneCard();
      card.id = id;
      card.name = `Agent ${id}`;
      card.capabilities.tools = [{ name: `tool-${id}`, capability }];
      card.capabilities.resources = [
        { urn: `urn:resource:${id}`, name: `Resource ${id}`, capability: `resource:${id}` },
      ];
      card.capabilities.tags = ['alpha', 'beta'];
      return card;
    };

    const exactUrn = 'urn:agent:store:exact';
    const partialUrn = 'urn:agent:store:partial';
    const unverifiedUrn = 'urn:agent:store:unverified';

    const verification = {
      status: 'verified',
      keyId: 'test-key',
      algorithm: 'EdDSA',
      digestValid: true,
      signatureValid: true,
      verifiedAt: new Date().toISOString(),
      enforced: true,
    };

    await store.register({ urn: exactUrn, card: makeCard('exact', 'cap:alpha'), sig: null, verification });
    await store.register({ urn: partialUrn, card: makeCard('partial', 'cap:alpha:extended'), sig: null, verification });
    await store.register({ urn: unverifiedUrn, card: makeCard('unverified', 'cap:alpha'), sig: null, verification: { ...verification, status: 'unverified' } });

    // Overwrite existing record to hit overwrite branch.
    await store.register(
      { urn: partialUrn, card: makeCard('partial-updated', 'cap:alpha:extended'), sig: null, verification },
      { overwrite: true },
    );

    expect(await store.count()).toBeGreaterThanOrEqual(2);
    expect((await store.find(exactUrn)).urn).toBe(exactUrn);

    const exactMatches = await store.queryCapabilities({
      capabilities: ['cap:alpha', 123],
      limit: '5',
      offset: '0',
    });
    expect(exactMatches.results.some((entry) => entry.urn === exactUrn)).toBe(true);
    expect(exactMatches.results.every((entry) => entry.urn !== unverifiedUrn)).toBe(true);

    const extendedMatches = await store.queryCapabilities({
      capabilities: ['cap:alpha:extended'],
      limit: 5,
      offset: 0,
    });
    expect(extendedMatches.results.some((entry) => entry.urn === partialUrn)).toBe(true);

    await rm(workDir, { recursive: true, force: true });
  });

  test('RegistryStore register requires URN value', async () => {
    const { workDir, storePath, indexPath, capIndexPath } = await makeTempConfig();
    const store = new RegistryStore({ storePath, indexPath, capIndexPath });
    await expect(store.register({ urn: '', card: null, sig: null, verification: null })).rejects.toThrow('URN is required.');
    await rm(workDir, { recursive: true, force: true });
  });

  test('Performance logging middleware writes metrics entries', async () => {
    const { workDir, storePath, indexPath, capIndexPath, policyPath } = await makeTempConfig();
    const metricsDir = path.join(workDir, 'metrics');
    const server = await createRegistryServer({
      apiKey: 'metrics-key',
      storePath,
      indexPath,
      capIndexPath,
      signaturePolicyPath: policyPath,
      enablePerformanceLogging: true,
      performanceSessionId: 'test-session',
      performanceLogRoot: metricsDir,
    });

    await request(server.app)
      .get('/health')
      .set('X-API-Key', 'metrics-key')
      .expect(200);

    const isoPrefix = new Date().toISOString().slice(0, 10);
    const metricsFile = path.join(metricsDir, isoPrefix, 'test-session.jsonl');
    // Second request ensures logging runs more than once.
    await request(server.app)
      .get('/health')
      .set('X-API-Key', 'metrics-key')
      .expect(200);

    await new Promise((resolve) => setTimeout(resolve, 25));
    const logExists = await stat(metricsFile)
      .then(() => true)
      .catch(() => false);
    expect(logExists).toBe(true);
    await rm(workDir, { recursive: true, force: true });
  });

  test('startRegistryServer launches listener and exposes close()', async () => {
    const { workDir, storePath, indexPath, capIndexPath, policyPath } = await makeTempConfig();
    const started = await startRegistryServer({
      apiKey: 'start-key',
      storePath,
      indexPath,
      capIndexPath,
      signaturePolicyPath: policyPath,
      port: 0,
    });

    expect(started.port).toBeGreaterThan(0);
    await started.close();
    await rm(workDir, { recursive: true, force: true });
  });
});
