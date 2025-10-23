import { afterEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import {
  API_KEY,
  BASE_CARD,
  KEY_ID,
  cleanupRegistryTestContexts,
  createRegistryTestContext,
  registerManifest,
} from './helpers/registry-context.mjs';

const cloneCard = () => JSON.parse(JSON.stringify(BASE_CARD));

afterEach(async () => {
  await cleanupRegistryTestContexts();
});

describe('Runtime registry provenance enforcement', () => {
  it('accepts registration with valid DSSE provenance and returns summary', async () => {
    const { app, createProvenance } = await createRegistryTestContext({
      requireProvenance: true,
    });
    const urn = `urn:agent:registry:provenance:${randomUUID()}`;
    const manifest = cloneCard();
    manifest.id = 'registry.provenance.valid';

    const provenance = createProvenance({
      outputs: [{ uri: urn, digest: { sha256: 'abcd1234' } }],
    });

    const response = await registerManifest(app, {
      urn,
      manifest,
      provenance,
      issuer: KEY_ID,
    });

    expect(response.status).toBe(200);
    expect(response.body.provenance).toEqual(
      expect.objectContaining({
        statementType: expect.stringContaining('in-toto'),
        signature: expect.objectContaining({
          scheme: expect.any(String),
          algorithm: expect.any(String),
          keyId: expect.any(String),
        }),
      }),
    );

    const detail = await request(app)
      .get(`/v1/registry/${encodeURIComponent(urn)}`)
      .set('X-API-Key', API_KEY)
      .expect(200);

    expect(detail.body.provenance).toBeDefined();
  });

  it('rejects registration when attestation signature is tampered', async () => {
    const { app, createProvenance } = await createRegistryTestContext({
      requireProvenance: true,
    });
    const urn = `urn:agent:registry:provenance:${randomUUID()}`;
    const manifest = cloneCard();
    manifest.id = 'registry.provenance.invalid';

    const provenance = createProvenance({
      outputs: [{ uri: urn, digest: { sha256: 'abcd1234' } }],
    });
    provenance.signatures[0].sig = '00deadbeef';

    const response = await registerManifest(app, {
      urn,
      manifest,
      provenance,
      issuer: KEY_ID,
    });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('invalid-provenance');
  });
});
