import { generateKeyPairSync } from 'node:crypto';

import { signJws, verifyJws, decodeSignedPayload, SignatureEnvelopeSpec } from '../../app/libs/signing/jws.mjs';

describe('signJws / verifyJws', () => {
  test('produces and verifies EdDSA envelope', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const payload = { doc: 'example', value: 42 };

    const envelope = signJws(payload, {
      privateKey,
      keyId: 'urn:proto:agent:signer@test',
    });

    expect(envelope.spec).toBe(SignatureEnvelopeSpec.id);
    expect(typeof envelope.signature).toBe('string');
    expect(envelope.header.alg).toBe('EdDSA');

    const verification = verifyJws(envelope, {
      publicKey,
      expectedPayload: payload,
      keyId: 'urn:proto:agent:signer@test',
    });

    expect(verification.valid).toBe(true);
    expect(verification.digestValid).toBe(true);
    expect(verification.signatureValid).toBe(true);
    expect(verification.errors).toHaveLength(0);
    expect(verification.payload).toEqual(payload);
    expect(decodeSignedPayload(envelope)).toEqual(payload);
  });

  test('produces and verifies ES256 envelope', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const payload = { id: 'urn:proto:api:billing@1.0.0', status: 'active' };

    const envelope = signJws(payload, {
      privateKey,
      keyId: 'urn:proto:agent:p256@test',
      algorithm: 'ES256',
      header: { scope: 'registry-write' },
    });

    expect(envelope.header.alg).toBe('ES256');
    expect(envelope.header.scope).toBe('registry-write');

    const verification = verifyJws(envelope, {
      publicKey,
      expectedPayload: payload,
    });

    expect(verification.valid).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  test('detects payload tampering', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const payload = { doc: 'immutable', counter: 1 };
    const envelope = signJws(payload, {
      privateKey,
      keyId: 'urn:proto:agent:signer@test',
    });

    // Tamper with payload bytes (without updating signature/hash)
    envelope.payload = toBase64Url(JSON.stringify({ doc: 'tampered', counter: 2 }));

    const verification = verifyJws(envelope, { publicKey });
    expect(verification.valid).toBe(false);
    expect(verification.digestValid).toBe(false);
    expect(verification.errors).toContain('Digest mismatch');
    expect(verification.errors.some((msg) => msg.includes('Digest mismatch'))).toBe(true);
  });

  test('detects mismatched expected payload', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const payload = { doc: 'expected', count: 5 };
    const envelope = signJws(payload, {
      privateKey,
      keyId: 'urn:proto:agent:signer@test',
    });

    const verification = verifyJws(envelope, {
      publicKey,
      expectedPayload: { doc: 'unexpected', count: 5 },
    });

    expect(verification.valid).toBe(false);
    expect(verification.errors).toContain('Expected payload does not match signed payload');
  });
});

function toBase64Url(raw) {
  return Buffer.from(raw, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
