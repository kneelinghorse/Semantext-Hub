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
import { openDb } from '../../packages/runtime/registry/db.mjs';
import { startServer } from '../../packages/runtime/registry/server.mjs';

const cloneCard = () => JSON.parse(JSON.stringify(BASE_CARD));

afterEach(async () => {
  await cleanupRegistryTestContexts();
});

describe('Runtime registry persistence', () => {
  it('stores manifest metadata with signer information in SQLite', async () => {
    const { app, dbPath, signCard } = await createRegistryTestContext();
    const urn = `urn:agent:registry:index:${randomUUID()}`;
    const manifest = cloneCard();
    manifest.id = 'registry.index.agent';
    const signature = signCard(manifest);

    const response = await registerManifest(app, { urn, manifest, signature });
    expect(response.status).toBe(200);

    const db = await openDb({ dbPath });
    try {
      const row = await db.get(
        'SELECT urn, issuer, signature FROM manifests WHERE urn = ?',
        urn,
      );
      expect(row).toBeDefined();
      expect(row.urn).toBe(urn);
      expect(row.issuer).toBeDefined();
      expect(typeof row.signature).toBe('string');
      expect(row.signature).toContain('"signature"');
      expect(() => JSON.parse(row.signature)).not.toThrow();
    } finally {
      await db.close();
    }
  });

  it('rehydrates registry state when startServer reuses the same database', async () => {
    const { app, dbPath } = await createRegistryTestContext();
    const urn = `urn:agent:registry:rehydrate:${randomUUID()}`;
    const manifest = cloneCard();
    manifest.communication.endpoints.default = 'https://agents.example.com/rehydrate';

    await registerManifest(app, { urn, manifest });

    const originalDb = app.get('db');
    if (originalDb) {
      await originalDb.close();
    }

    const runtime = await startServer({
      apiKey: API_KEY,
      dbPath,
      host: '127.0.0.1',
      port: 0,
      requireProvenance: false,
      provenanceKeys: [],
    });

    try {
      const resolveResponse = await request(runtime.app)
        .get('/v1/resolve')
        .query({ urn })
        .set('X-API-Key', API_KEY)
        .expect(200);

      expect(resolveResponse.body.urn).toBe(urn);
      expect(resolveResponse.body.manifest.communication.endpoints.default).toContain(
        'rehydrate',
      );
    } finally {
      await runtime.close();
    }
  });
});
