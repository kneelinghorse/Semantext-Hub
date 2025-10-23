import { afterEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import {
  API_KEY,
  BASE_CARD,
  KEY_ID,
  createRegistryTestContext,
  cleanupRegistryTestContexts,
  registerManifest,
} from './helpers/registry-context.mjs';
import { openDb } from '../../packages/runtime/registry/db.mjs';

const cloneCard = () => JSON.parse(JSON.stringify(BASE_CARD));

afterEach(async () => {
  await cleanupRegistryTestContexts();
});

describe('Runtime Registry Service API', () => {
  it('exposes discovery metadata for /v1 routes', async () => {
    const { app } = await createRegistryTestContext();
    const response = await request(app)
      .get('/.well-known/ossp-agi.json')
      .set('X-API-Key', API_KEY);

    expect(response.status).toBe(200);
    expect(response.body.links).toEqual(
      expect.objectContaining({
        register_v1: '/v1/registry/{urn}',
        resolve_v1: '/v1/resolve?urn={urn}',
        query_v1: '/v1/query',
        health: '/health',
      }),
    );
    expect(response.body.auth).toEqual(
      expect.objectContaining({ header: 'X-API-Key' }),
    );
  });

  it('registers a manifest via PUT /v1/registry/:urn and persists to SQLite', async () => {
    const { app, dbPath } = await createRegistryTestContext();
    const urn = `urn:agent:registry:test:${randomUUID()}`;
    const manifest = cloneCard();
    manifest.id = 'agent.registry.test';

    const response = await registerManifest(app, { urn, manifest });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        urn,
        digest: expect.any(String),
      }),
    );

    const db = await openDb({ dbPath });
    try {
      const row = await db.get('SELECT urn, digest FROM manifests WHERE urn = ?', urn);
      expect(row).toBeDefined();
      expect(row.urn).toBe(urn);
    } finally {
      await db.close();
    }
  });

  it('allows manifest updates without conflicts', async () => {
    const { app } = await createRegistryTestContext();
    const urn = `urn:agent:registry:update:${randomUUID()}`;
    const manifest = cloneCard();
    manifest.id = 'agent.registry.update';

    const first = await registerManifest(app, { urn, manifest });
    expect(first.status).toBe(200);

    const updatedManifest = { ...manifest, version: '2.0.0' };
    const second = await registerManifest(app, { urn, manifest: updatedManifest });
    expect(second.status).toBe(200);
    expect(second.body.digest).not.toBe(first.body.digest);

    const detail = await request(app)
      .get(`/v1/registry/${encodeURIComponent(urn)}`)
      .set('X-API-Key', API_KEY)
      .expect(200);

    expect(detail.body.body.version).toBe('2.0.0');
  });

  it('unwraps nested manifest payload structures before persistence', async () => {
    const { app } = await createRegistryTestContext({ requireProvenance: false });
    const urn = `urn:agent:registry:nested:${randomUUID()}`;
    const manifest = cloneCard();
    manifest.id = 'agent.registry.nested';

    const response = await request(app)
      .put(`/v1/registry/${encodeURIComponent(urn)}`)
      .set('X-API-Key', API_KEY)
      .set('Content-Type', 'application/json')
      .send({
        manifest: {
          manifest,
          provenance: null,
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');

    const detail = await request(app)
      .get(`/v1/registry/${encodeURIComponent(urn)}`)
      .set('X-API-Key', API_KEY)
      .expect(200);

    expect(detail.body.body.id).toBe(manifest.id);
  });

  it('requires a valid API key for protected endpoints', async () => {
    const { app } = await createRegistryTestContext();
    const urn = `urn:agent:registry:auth:${randomUUID()}`;
    const manifest = cloneCard();

    const registerResponse = await request(app)
      .put(`/v1/registry/${encodeURIComponent(urn)}`)
      .set('Content-Type', 'application/json')
      .send({ manifest, issuer: KEY_ID });
    expect(registerResponse.status).toBe(401);

    const resolveResponse = await request(app)
      .get('/v1/resolve')
      .query({ urn })
      .expect(401);
    expect(resolveResponse.body.error).toBe('unauthorized');
  });

  it('resolves a previously registered manifest', async () => {
    const { app } = await createRegistryTestContext();
    const urn = `urn:agent:registry:resolve:${randomUUID()}`;
    const manifest = cloneCard();
    manifest.communication.endpoints.default = 'https://agents.example.com/resolve';

    await registerManifest(app, { urn, manifest });

    const response = await request(app)
      .get('/v1/resolve')
      .query({ urn })
      .set('X-API-Key', API_KEY)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        urn,
        capabilities: expect.any(Array),
        digest: expect.any(String),
      }),
    );
    expect(response.body.manifest.id).toBe(manifest.id);
  });

  it('queries capabilities through POST /v1/query', async () => {
    const { app } = await createRegistryTestContext();
    const urn = `urn:agent:registry:query:${randomUUID()}`;
    const manifest = cloneCard();
    manifest.id = 'agent.registry.query';
    manifest.capabilities.tools = [
      { name: 'analytics', capability: 'analytics.report', urn: 'analytics.report' },
    ];

    await registerManifest(app, { urn, manifest });

    const response = await request(app)
      .post('/v1/query')
      .set('X-API-Key', API_KEY)
      .set('Content-Type', 'application/json')
      .send({ capability: 'analytics.report' })
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          urn,
          digest: expect.any(String),
        }),
      ]),
    );
  });

  it('applies configured rate limits', async () => {
    const { app } = await createRegistryTestContext({
      rateLimit: { windowMs: 1000, max: 1 },
    });

    const target = '/v1/resolve';
    const params = { urn: 'urn:agent:registry:limit' };

    const first = await request(app)
      .get(target)
      .query(params)
      .set('X-API-Key', API_KEY);
    expect([200, 404]).toContain(first.status);

    const second = await request(app)
      .get(target)
      .query(params)
      .set('X-API-Key', API_KEY);

    expect(second.status).toBe(429);
    expect(second.body.error).toBe('rate_limited');
  });

  it('reports registry health with record counts and rate limit metadata', async () => {
    const { app, signCard } = await createRegistryTestContext();
    const urn = `urn:agent:registry:health:${randomUUID()}`;
    const manifest = cloneCard();
    const signature = signCard(manifest);

    await registerManifest(app, { urn, manifest, signature });

    const response = await request(app)
      .get('/health')
      .set('X-API-Key', API_KEY)
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.registry.records).toBeGreaterThanOrEqual(1);
    expect(response.body.rateLimit.windowMs).toBeGreaterThan(0);
  });
});
