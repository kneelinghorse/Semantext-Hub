import { createHash, sign as cryptoSign, verify as cryptoVerify, createPrivateKey, createPublicKey, timingSafeEqual } from 'node:crypto';

import { canonicalizeToBuffer } from './jcs.mjs';

const SPEC_ID = 'identity-access.signing.v1';
const DIGEST_ALGORITHM = 'sha-256';
const SUPPORTED_ALGORITHMS = new Set(['EdDSA', 'ES256']);

/**
 * @typedef {Object} SignatureEnvelope
 * @property {'identity-access.signing.v1'} spec
 * @property {string} protected - Base64url encoded protected header
 * @property {string} payload - Base64url encoded canonical payload (RFC 8785)
 * @property {{alg:'sha-256', value:string}} hash - Canonical payload digest
 * @property {string} signature - Base64url encoded signature
 * @property {Record<string, any>} header - Decoded protected header (convenience)
 */

export const SignatureEnvelopeSpec = Object.freeze({
  id: SPEC_ID,
  canonicalization: 'RFC8785-JCS',
  digest: DIGEST_ALGORITHM,
  encoding: 'base64url',
  algorithms: ['EdDSA', 'ES256'],
  headerClaims: {
    required: ['alg', 'kid', 'iat'],
    optional: ['exp', 'scope', 'nonce', 'aud', 'sub']
  },
});

/**
 * Sign arbitrary JSON payload using the identity-access.signing.v1 envelope.
 * @param {any} payload
 * @param {{ privateKey: string|Buffer|import('node:crypto').KeyObject, keyId: string, algorithm?: 'EdDSA'|'ES256', header?: Record<string, any>, issuedAt?: Date|string, expiresAt?: Date|string }} options
 * @returns {SignatureEnvelope}
 */
export function signJws(payload, options) {
  if (!options?.privateKey) throw new Error('signJws requires a privateKey');
  if (!options?.keyId) throw new Error('signJws requires a keyId');
  const algorithm = options.algorithm ?? 'EdDSA';
  if (!SUPPORTED_ALGORITHMS.has(algorithm)) throw new Error(`Unsupported algorithm: ${algorithm}`);

  const privateKey = toPrivateKey(options.privateKey);
  const protectedHeader = buildProtectedHeader({
    alg: algorithm,
    kid: options.keyId,
    issuedAt: options.issuedAt,
    expiresAt: options.expiresAt,
    header: options.header,
  });

  const protectedB64 = toBase64Url(Buffer.from(JSON.stringify(protectedHeader), 'utf8'));
  const payloadBuffer = canonicalizeToBuffer(payload);
  const payloadB64 = toBase64Url(payloadBuffer);
  const signingInput = Buffer.from(`${protectedB64}.${payloadB64}`, 'utf8');

  const signatureBuffer = createSignature(algorithm, signingInput, privateKey);
  const signatureB64 = toBase64Url(signatureBuffer);
  const digestValue = toBase64Url(createHash('sha256').update(payloadBuffer).digest());

  return {
    spec: SPEC_ID,
    protected: protectedB64,
    payload: payloadB64,
    signature: signatureB64,
    hash: {
      alg: DIGEST_ALGORITHM,
      value: digestValue,
    },
    header: protectedHeader,
  };
}

/**
 * Verify a signature envelope.
 * @param {SignatureEnvelope} envelope
 * @param {{ publicKey: string|Buffer|import('node:crypto').KeyObject, expectedPayload?: any, now?: Date, keyId?: string }} options
 * @returns {{ valid: boolean, signatureValid: boolean, digestValid: boolean, header: Record<string,any>, payload: any|null, canonical: string, errors: string[] }}
 */
export function verifyJws(envelope, options) {
  const errors = [];
  if (!envelope || envelope.spec !== SPEC_ID) {
    errors.push('Invalid or missing spec identifier');
  }

  const header = decodeHeader(envelope, errors);
  const payloadBuffer = decodeBase64Url(envelope?.payload);
  const canonical = payloadBuffer?.toString('utf8') ?? '';
  let payload = null;

  if (canonical) {
    try {
      payload = JSON.parse(canonical);
    } catch (error) {
      errors.push('Payload is not valid JSON');
    }
  } else {
    errors.push('Missing payload');
  }

  if (!options?.publicKey) {
    errors.push('Public key is required for verification');
  }

  if (options?.keyId && header?.kid && options.keyId !== header.kid) {
    errors.push(`Key identifier mismatch (expected ${options.keyId}, got ${header.kid})`);
  }

  let digestValid = false;
  if (header) {
    if (!SUPPORTED_ALGORITHMS.has(header.alg)) {
      errors.push(`Unsupported algorithm in header: ${header.alg}`);
    }

    const digestBuffer = decodeBase64Url(envelope?.hash?.value);
    if (!digestBuffer) {
      errors.push('Missing digest value');
    } else if (envelope?.hash?.alg?.toLowerCase() !== DIGEST_ALGORITHM) {
      errors.push(`Digest algorithm mismatch (expected ${DIGEST_ALGORITHM})`);
    } else if (payloadBuffer) {
      const computed = createHash('sha256').update(payloadBuffer).digest();
      digestValid = computed.length === digestBuffer.length && timingSafeEqual(computed, digestBuffer);
      if (!digestValid) errors.push('Digest mismatch');
    }

    const now = options?.now ?? new Date();
    if (header.iat && !isIsoDate(header.iat)) {
      errors.push('Header iat must be ISO-8601');
    } else if (header.iat && new Date(header.iat) > now) {
      errors.push('Signature issued in the future');
    }

    if (header.exp) {
      if (!isIsoDate(header.exp)) {
        errors.push('Header exp must be ISO-8601');
      } else if (now > new Date(header.exp)) {
        errors.push('Signature expired');
      }
    }
  }

  let signatureValid = false;
  if (header && payloadBuffer && options?.publicKey && envelope?.signature && envelope?.protected) {
    const publicKey = toPublicKey(options.publicKey);
    const signatureBuffer = decodeBase64Url(envelope.signature);
    const signingInput = Buffer.from(`${envelope.protected}.${envelope.payload}`, 'utf8');
    if (signatureBuffer) {
      signatureValid = verifySignature(header.alg, signingInput, signatureBuffer, publicKey);
      if (!signatureValid) errors.push('Signature verification failed');
    } else {
      errors.push('Signature is not valid base64url');
    }
  }

  if (options?.expectedPayload !== undefined && payloadBuffer) {
    const expectedBuffer = canonicalizeToBuffer(options.expectedPayload);
    if (expectedBuffer.toString('utf8') !== canonical) {
      errors.push('Expected payload does not match signed payload');
    }
  }

  const valid = errors.length === 0 && digestValid && signatureValid;
  return { valid, signatureValid, digestValid, header: header ?? {}, payload, canonical, errors };
}

/**
 * Decode canonical payload without verification.
 * @param {SignatureEnvelope} envelope
 * @returns {any|null}
 */
export function decodeSignedPayload(envelope) {
  const payloadBuffer = decodeBase64Url(envelope?.payload);
  if (!payloadBuffer) return null;
  try {
    return JSON.parse(payloadBuffer.toString('utf8'));
  } catch {
    return null;
  }
}

function buildProtectedHeader({ alg, kid, issuedAt, expiresAt, header }) {
  const iat = normalizeIsoDate(issuedAt ?? new Date());
  const base = {
    ...header,
    alg,
    kid,
    typ: SPEC_ID,
    canonical: 'jcs@rfc8785',
    digest: DIGEST_ALGORITHM,
    iat,
  };
  if (expiresAt) base.exp = normalizeIsoDate(expiresAt);
  return base;
}

function toPrivateKey(key) {
  if (typeof key === 'string' || Buffer.isBuffer(key) || key instanceof Uint8Array) {
    return createPrivateKey(key);
  }
  return key;
}

function toPublicKey(key) {
  if (typeof key === 'string' || Buffer.isBuffer(key) || key instanceof Uint8Array) {
    return createPublicKey(key);
  }
  return key;
}

function createSignature(alg, input, privateKey) {
  if (alg === 'EdDSA') {
    return cryptoSign(null, input, privateKey);
  }
  if (alg === 'ES256') {
    return cryptoSign('sha256', input, privateKey);
  }
  throw new Error(`Unsupported algorithm: ${alg}`);
}

function verifySignature(alg, input, signature, publicKey) {
  if (alg === 'EdDSA') {
    return cryptoVerify(null, input, publicKey, signature);
  }
  if (alg === 'ES256') {
    return cryptoVerify('sha256', input, publicKey, signature);
  }
  return false;
}

function toBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  const padded = normalized + '='.repeat(padLength);
  try {
    return Buffer.from(padded, 'base64');
  } catch {
    return null;
  }
}

function normalizeIsoDate(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid ISO date: ${value}`);
    return date.toISOString();
  }
  throw new Error('issuedAt/expiresAt must be Date or ISO string');
}

function isIsoDate(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function decodeHeader(envelope, errors) {
  if (!envelope?.protected && !envelope?.header) {
    errors.push('Missing protected header');
    return null;
  }
  if (envelope.header) return envelope.header;
  const headerBuffer = decodeBase64Url(envelope.protected);
  if (!headerBuffer) {
    errors.push('Protected header is not valid base64url');
    return null;
  }
  try {
    return JSON.parse(headerBuffer.toString('utf8'));
  } catch {
    errors.push('Protected header is not valid JSON');
    return null;
  }
}
