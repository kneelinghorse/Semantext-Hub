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

  test('rejects unsupported algorithms and missing private keys', () => {
    expect(() => signJws({ doc: 'demo' }, { keyId: 'urn:test' })).toThrow(
      'signJws requires a privateKey',
    );

    const { privateKey } = generateKeyPairSync('ed25519');
    expect(() =>
      signJws({ doc: 'demo' }, { privateKey, keyId: 'urn:test', algorithm: 'RS256' }),
    ).toThrow('Unsupported algorithm: RS256');
  });

  test('verifyJws enforces issuedAt and expiresAt guards', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const now = new Date();
    const envelope = signJws(
      { doc: 'time' },
      {
        privateKey,
        keyId: 'urn:proto:agent:signer@test',
        issuedAt: new Date(now.getTime() + 60_000).toISOString(),
        expiresAt: new Date(now.getTime() - 60_000).toISOString(),
      },
    );

    const verification = verifyJws(envelope, { publicKey, now });
    expect(verification.valid).toBe(false);
    expect(verification.errors).toEqual(
      expect.arrayContaining([
        'Signature issued in the future',
        'Signature expired',
      ]),
    );
  });

  test('verifyJws flags key identifier mismatches', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const envelope = signJws({ doc: 'key' }, { privateKey, keyId: 'urn:proto:agent:signer@test' });

    const verification = verifyJws(envelope, {
      publicKey,
      keyId: 'urn:different',
    });

    expect(verification.valid).toBe(false);
    expect(verification.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Key identifier mismatch'),
      ]),
    );
  });

  test('verifyJws requires a public key for cryptographic checks', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const envelope = signJws({ doc: 'missing-key' }, { privateKey, keyId: 'urn:proto:agent:signer@test' });

    const verification = verifyJws(envelope, {});
    expect(verification.valid).toBe(false);
    expect(verification.errors).toEqual(
      expect.arrayContaining(['Public key is required for verification']),
    );
  });

  test('verifyJws surfaces unsupported header algorithms', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const payload = { doc: 'demo' };
    const envelope = signJws(payload, {
      privateKey,
      keyId: 'urn:proto:agent:signer@test',
    });

    envelope.header.alg = 'RS256';

    const verification = verifyJws(envelope, { publicKey });
    expect(verification.valid).toBe(false);
    expect(verification.errors).toEqual(
      expect.arrayContaining(['Unsupported algorithm in header: RS256']),
    );
  });
});

function toBase64Url(raw) {
  return Buffer.from(raw, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
