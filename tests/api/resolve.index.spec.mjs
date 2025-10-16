import { afterEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { readFile } from 'node:fs/promises';

import {
  API_KEY,
  BASE_CARD,
  KEY_ID,
  cleanupRegistryTestContexts,
  createRegistryTestContext,
} from './helpers/registry-context.mjs';
import { createRegistryServer } from '../../app/services/registry/server.mjs';

describe('Registry URN Index', () => {
  afterEach(async () => {
    await cleanupRegistryTestContexts();
  });

  it('persists URN index sidecar entries with signer metadata', async () => {
    const { app, indexPath, signCard } = await createRegistryTestContext();
    const urn = 'urn:agent:registry:test:index-sidecar';
    const card = { ...BASE_CARD, name: 'Index Agent' };
    const sig = signCard(card);

    await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .send({ urn, card, sig });

    const indexData = JSON.parse(await readFile(indexPath, 'utf8'));
    expect(Array.isArray(indexData.entries)).toBe(true);
    expect(indexData.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ urn, keyId: KEY_ID, algorithm: expect.any(String) }),
      ]),
    );
  });

  it('rebuilds index on startup and serves resolve requests via the index', async () => {
    const { app, storePath, indexPath, policyPath, signCard } = await createRegistryTestContext();
    const urn = 'urn:agent:registry:test:index-rehydrate';
    const card = { ...BASE_CARD, name: 'Rehydrate Agent' };
    const sig = signCard(card);

    await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .send({ urn, card, sig });

    const restarted = await createRegistryServer({
      apiKey: API_KEY,
      storePath,
      indexPath,
      signaturePolicyPath: policyPath,
    });

    expect(restarted.store.index.size).toBeGreaterThanOrEqual(1);

    const response = await request(restarted.app)
      .get(`/resolve/${encodeURIComponent(urn)}`)
      .set('X-API-Key', API_KEY);

    expect(response.status).toBe(200);
    expect(response.body.verification.status).toBe('verified');
    expect(response.body.verification.keyId).toBe(KEY_ID);
  });
});
