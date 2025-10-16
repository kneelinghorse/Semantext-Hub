import { afterEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { readFile } from 'node:fs/promises';

import {
  API_KEY,
  BASE_CARD,
  KEY_ID,
  createRegistryTestContext,
  cleanupRegistryTestContexts,
} from './helpers/registry-context.mjs';

afterEach(async () => {
  await cleanupRegistryTestContexts();
});

describe('Registry Service API', () => {
  it('exposes well-known discovery metadata', async () => {
    const { app } = await createRegistryTestContext();
    const response = await request(app).get('/.well-known/ossp-agi.json');

    expect(response.status).toBe(200);
    expect(response.body.links).toEqual(
      expect.objectContaining({
        register: '/registry',
        resolve: '/resolve/{urn}',
        health: '/health',
      }),
    );
    expect(response.body.auth).toEqual(
      expect.objectContaining({ header: 'X-API-Key' }),
    );
  });

  it('registers a new agent card and persists to the JSONL store', async () => {
    const { app, storePath, signCard } = await createRegistryTestContext();
    const urn = 'urn:agent:registry:test:1';
    const card = JSON.parse(JSON.stringify(BASE_CARD));
    const sig = signCard(card);
    const response = await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .send({ urn, card, sig });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'registered',
        urn,
        verification: expect.objectContaining({
          status: 'verified',
          keyId: KEY_ID,
        }),
      }),
    );

    const contents = (await readFile(storePath, 'utf8')).trim().split('\n');
    expect(contents).toHaveLength(1);
    const record = JSON.parse(contents[0]);
    expect(record.urn).toBe(urn);
    expect(record.card.id).toBe(BASE_CARD.id);
    expect(record.sig).toBeDefined();
    expect(record.verification).toEqual(
      expect.objectContaining({
        status: 'verified',
        keyId: KEY_ID,
        signatureValid: true,
        digestValid: true,
      }),
    );
  });

  it('prevents duplicate registrations with a 409 response', async () => {
    const { app, signCard } = await createRegistryTestContext();
    const urn = 'urn:agent:registry:test:duplicate';
    const buildPayload = () => {
      const card = JSON.parse(JSON.stringify(BASE_CARD));
      return { urn, card, sig: signCard(card) };
    };

    const first = await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .send(buildPayload());
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .send(buildPayload());
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('conflict');
  });

  it('requires a valid API key for protected endpoints', async () => {
    const { app, signCard } = await createRegistryTestContext();
    const urn = 'urn:agent:registry:test:auth';
    const card = JSON.parse(JSON.stringify(BASE_CARD));
    const sig = signCard(card);

    const registerResponse = await request(app)
      .post('/registry')
      .send({ urn, card, sig });
    expect(registerResponse.status).toBe(401);

    const resolveResponse = await request(app).get(`/resolve/${encodeURIComponent(urn)}`);
    expect(resolveResponse.status).toBe(401);
  });

  it('resolves a previously registered agent card', async () => {
    const { app, signCard } = await createRegistryTestContext();
    const urn = 'urn:agent:registry:test:resolve';
    const card = JSON.parse(JSON.stringify(BASE_CARD));
    const sig = signCard(card);

    await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .send({ urn, card, sig });

    const response = await request(app)
      .get(`/resolve/${encodeURIComponent(urn)}`)
      .set('X-API-Key', API_KEY);

    expect(response.status).toBe(200);
    expect(response.body.card).toEqual(expect.objectContaining({ id: BASE_CARD.id }));
    expect(response.body.sig).toEqual(expect.objectContaining({ signature: expect.any(String) }));
    expect(response.body.verification).toEqual(
      expect.objectContaining({ status: 'verified', keyId: KEY_ID }),
    );
  });

  it('returns 404 when resolving an unknown URN', async () => {
    const { app } = await createRegistryTestContext();
    const response = await request(app)
      .get('/resolve/urn%3Aagent%3Aunknown')
      .set('X-API-Key', API_KEY);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('not_found');
  });

  it('applies rate limiting to protected routes', async () => {
    const { app } = await createRegistryTestContext({ rateLimit: { windowMs: 1000, max: 1 } });
    const target = '/resolve/urn%3Aagent%3Alimit';

    const first = await request(app).get(target).set('X-API-Key', API_KEY);
    expect(first.status === 200 || first.status === 404).toBe(true);

    const second = await request(app).get(target).set('X-API-Key', API_KEY);
    expect(second.status).toBe(429);
    expect(second.body.error).toBe('rate_limited');
  });

  it('reports registry health with record counts', async () => {
    const { app, signCard } = await createRegistryTestContext();
    const urn = 'urn:agent:registry:test:health';
    const card = JSON.parse(JSON.stringify(BASE_CARD));
    const sig = signCard(card);

    await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .send({ urn, card, sig });

    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.registry.records).toBe(1);
    expect(response.body.registry.indexRecords).toBe(1);
    expect(response.body.registry.indexLastUpdated).toEqual(expect.any(String));
  });
});
