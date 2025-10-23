import { afterEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import {
  API_KEY,
  BASE_CARD,
  cleanupRegistryTestContexts,
  createRegistryTestContext,
  registerManifest,
} from './helpers/registry-context.mjs';

const cloneCard = () => JSON.parse(JSON.stringify(BASE_CARD));

afterEach(async () => {
  await cleanupRegistryTestContexts();
});

describe('Runtime registry capability queries', () => {
  it('returns all manifests advertising a capability', async () => {
    const { app } = await createRegistryTestContext();

    const capability = 'protocol:api@1.1.1';
    const mkManifest = (id) => {
      const manifest = cloneCard();
      manifest.id = id;
      manifest.capabilities.tools = [
        { name: 'call_api', capability, urn: capability },
      ];
      return manifest;
    };

    const primaryUrn = `urn:agent:cap:${randomUUID()}`;
    const secondaryUrn = `urn:agent:cap:${randomUUID()}`;

    await registerManifest(app, { urn: primaryUrn, manifest: mkManifest('primary.agent') });
    await registerManifest(app, { urn: secondaryUrn, manifest: mkManifest('secondary.agent') });

    const response = await request(app)
      .post('/v1/query')
      .set('X-API-Key', API_KEY)
      .set('Content-Type', 'application/json')
      .send({ capability })
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.capability).toBe(capability);
    expect(response.body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ urn: primaryUrn, digest: expect.any(String) }),
        expect.objectContaining({ urn: secondaryUrn, digest: expect.any(String) }),
      ]),
    );
  });

  it('returns an empty list when no manifests match', async () => {
    const { app } = await createRegistryTestContext();
    const response = await request(app)
      .post('/v1/query')
      .set('X-API-Key', API_KEY)
      .set('Content-Type', 'application/json')
      .send({ capability: 'protocol:unknown@1.0.0' })
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(Array.isArray(response.body.results)).toBe(true);
    expect(response.body.results).toHaveLength(0);
  });

  it('requires authentication for capability queries', async () => {
    const { app } = await createRegistryTestContext();
    await request(app)
      .post('/v1/query')
      .set('Content-Type', 'application/json')
      .send({ capability: 'protocol:api@1.1.1' })
      .expect(401);
  });
});
