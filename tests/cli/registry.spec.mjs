import { afterEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import {
  API_KEY,
  BASE_CARD,
  cleanupRegistryTestContexts,
  createRegistryTestContext,
  registerManifest,
} from '../api/helpers/registry-context.mjs';

const cloneCard = () => JSON.parse(JSON.stringify(BASE_CARD));

afterEach(async () => {
  await cleanupRegistryTestContexts();
});

describe('CLI registry workflows against runtime server', () => {
  it('exposes runtime configuration details for CLI bootstrap', async () => {
    const context = await createRegistryTestContext({
      rateLimit: { windowMs: 5000, max: 5 },
    });

    expect(context.rateLimit).toEqual(
      expect.objectContaining({
        windowMs: 5000,
        max: 5,
        standardHeaders: true,
        legacyHeaders: false,
      }),
    );
    expect(context.registryConfig.dbPath).toContain('registry.sqlite');
  });

  it('registers manifests via PUT /v1/registry and allows runtime fetch', async () => {
    const { app } = await createRegistryTestContext();
    const urn = `urn:agent:cli:register:${randomUUID()}`;
    const manifest = cloneCard();
    manifest.id = 'cli.registry.register';

    const putResponse = await registerManifest(app, { urn, manifest });
    expect(putResponse.status).toBe(200);

    const getResponse = await request(app)
      .get(`/v1/registry/${encodeURIComponent(urn)}`)
      .set('X-API-Key', API_KEY)
      .expect(200);

    expect(getResponse.body.body.id).toBe(manifest.id);
    expect(getResponse.body.digest).toBe(putResponse.body.digest);
  });

  it('supports capability discovery used by CLI resolvers', async () => {
    const { app } = await createRegistryTestContext();
    const capability = 'cli.registry.echo';
    const manifest = cloneCard();
    manifest.id = 'cli.registry.echo';
    manifest.capabilities.tools = [
      { name: 'echo', capability, urn: capability },
    ];
    const urn = `urn:agent:cli:capability:${randomUUID()}`;

    await registerManifest(app, { urn, manifest });

    const queryResponse = await request(app)
      .post('/v1/query')
      .set('X-API-Key', API_KEY)
      .set('Content-Type', 'application/json')
      .send({ capability })
      .expect(200);

    expect(queryResponse.body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ urn, digest: expect.any(String) }),
      ]),
    );
  });

  it('resolves manifests via /v1/resolve for CLI invocation', async () => {
    const { app } = await createRegistryTestContext();
    const urn = `urn:agent:cli:resolve:${randomUUID()}`;
    const manifest = cloneCard();
    manifest.communication.endpoints.default = 'https://agents.example.com/cli';

    await registerManifest(app, { urn, manifest });

    const response = await request(app)
      .get('/v1/resolve')
      .query({ urn })
      .set('X-API-Key', API_KEY)
      .expect(200);

    expect(response.body.urn).toBe(urn);
    expect(response.body.manifest.communication.endpoints.default).toContain('cli');
  });

  it('enforces authentication for runtime routes', async () => {
    const { app } = await createRegistryTestContext();
    const urn = `urn:agent:cli:auth:${randomUUID()}`;
    const manifest = cloneCard();

    const putResponse = await request(app)
      .put(`/v1/registry/${encodeURIComponent(urn)}`)
      .set('Content-Type', 'application/json')
      .send({ manifest })
      .expect(401);

    expect(putResponse.body.error).toBe('unauthorized');

    await request(app)
      .post('/v1/query')
      .set('Content-Type', 'application/json')
      .send({ capability: 'cli.registry.echo' })
      .expect(401);
  });

  it('publishes runtime metadata for CLI diagnostics', async () => {
    const { app } = await createRegistryTestContext();

    const wellKnown = await request(app)
      .get('/.well-known/ossp-agi.json')
      .set('X-API-Key', API_KEY)
      .expect(200);
    expect(wellKnown.body.links.register_v1).toBe('/v1/registry/{urn}');

    const openapi = await request(app)
      .get('/openapi.json')
      .set('X-API-Key', API_KEY)
      .expect(200);
    expect(openapi.body.openapi).toMatch(/^3\./);
  });
});
