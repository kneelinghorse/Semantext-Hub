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

describe('Registry Signing Verification', () => {
  afterEach(async () => {
    await cleanupRegistryTestContexts();
  });

  it('rejects registration when the signature does not match the submitted card', async () => {
    const { app, signCard } = await createRegistryTestContext();
    const urn = 'urn:agent:registry:test:signature-mismatch';
    const originalCard = JSON.parse(JSON.stringify(BASE_CARD));
    const sig = signCard(originalCard);
    const tamperedCard = { ...originalCard, name: 'Tampered Agent Record' };

    const response = await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .send({ urn, card: tamperedCard, sig });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('signature_invalid');
    expect(response.body.verification).toEqual(
      expect.objectContaining({
        status: 'failed',
        enforced: true,
        keyId: KEY_ID,
      }),
    );
    expect(response.body.details).toEqual(
      expect.arrayContaining(['Expected payload does not match signed payload']),
    );
  });

  it('accepts registration when signature enforcement is disabled but records outcome', async () => {
    const { app, storePath, signCard } = await createRegistryTestContext({
      signaturePolicy: { version: 1, requireSignature: false, keys: [] },
    });
    const urn = 'urn:agent:registry:test:policy-soft';
    const card = JSON.parse(JSON.stringify(BASE_CARD));
    const sig = signCard(card);

    const response = await request(app)
      .post('/registry')
      .set('X-API-Key', API_KEY)
      .send({ urn, card, sig });

    expect(response.status).toBe(201);
    expect(response.body.verification).toEqual(
      expect.objectContaining({
        status: 'unverified',
        enforced: false,
      }),
    );
    expect(response.body.verification.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('No signature policy entry for key')]),
    );

    const contents = (await readFile(storePath, 'utf8')).trim().split('\n');
    expect(contents).toHaveLength(1);
    const record = JSON.parse(contents[0]);
    expect(record.verification).toEqual(
      expect.objectContaining({
        status: 'unverified',
        enforced: false,
      }),
    );
  });
});
