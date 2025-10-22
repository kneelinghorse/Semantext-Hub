import crypto from 'node:crypto';

const DSSE_VERSION = 'DSSEv1';
const SUPPORTED_ALGORITHMS = new Set(['Ed25519', 'ES256']);

const textEncoder = new TextEncoder();

function encodeUint64(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('DSSE PAE length must be a non-negative safe integer.');
  }
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(value));
  return buf;
}

function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === 'string') return Buffer.from(data, 'utf8');
  return Buffer.from(JSON.stringify(data));
}

function preAuthEncoding(payloadType, payloadBytes) {
  const pieces = [
    textEncoder.encode(DSSE_VERSION),
    textEncoder.encode(payloadType ?? ''),
    payloadBytes,
  ].map((value) => Buffer.from(value));

  const encoded = [encodeUint64(pieces.length)];
  for (const piece of pieces) {
    encoded.push(encodeUint64(piece.length));
    encoded.push(piece);
  }
  return Buffer.concat(encoded);
}

function normalizeVerificationConfigs(config) {
  if (!config) {
    return [];
  }
  const configs = Array.isArray(config) ? config : [config];
  return configs
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      if (!entry.pubkey) {
        return null;
      }
      const alg = entry.alg || entry.algorithm || 'Ed25519';
      return {
        pubkey: entry.pubkey,
        alg,
        keyid: entry.keyid || entry.keyId || entry.kid || null,
      };
    })
    .filter(Boolean);
}

function resolveNodeAlgorithm(alg) {
  switch (alg) {
    case 'Ed25519':
      return { nodeAlg: null, normalized: 'Ed25519' };
    case 'ES256':
      return { nodeAlg: 'sha256', normalized: 'ES256' };
    default:
      return null;
  }
}

function decodeBase64(input) {
  if (typeof input !== 'string') {
    return null;
  }
  if (input.length === 0) {
    return Buffer.alloc(0);
  }
  try {
    const buf = Buffer.from(input, 'base64');
    const normalized = input.replace(/\s+/g, '').replace(/=+$/, '');
    const roundTrip = buf.toString('base64').replace(/=+$/, '');
    if (buf.length === 0 || normalized.length === 0) {
      return buf;
    }
    if (roundTrip !== normalized) {
      return null;
    }
    return buf;
  } catch {
    return null;
  }
}

function selectSignatureConfigs(signatures, configs) {
  if (!Array.isArray(signatures) || signatures.length === 0) {
    return [];
  }
  return signatures.flatMap((signature) => {
    if (!signature || typeof signature !== 'object') {
      return [];
    }
    const candidates = configs.filter((cfg) => !cfg.keyid || !signature.keyid || cfg.keyid === signature.keyid);
    return candidates.map((candidate) => ({
      signature,
      config: candidate,
    }));
  });
}

export function createEnvelope(payloadType, payload, { key, alg = 'Ed25519', keyid = 'local' }) {
  if (!SUPPORTED_ALGORITHMS.has(alg)) {
    throw new Error(`Unsupported algorithm: ${alg}`);
  }
  if (!payloadType || typeof payloadType !== 'string') {
    throw new TypeError('payloadType must be a non-empty string.');
  }
  if (!key) {
    throw new TypeError('Signing key is required.');
  }

  const payloadBytes = toBuffer(payload);
  const payloadBase64 = payloadBytes.toString('base64');
  const pae = preAuthEncoding(payloadType, payloadBytes);

  const signature = crypto.sign(alg === 'Ed25519' ? null : 'sha256', pae, key);
  return {
    payloadType,
    payload: payloadBase64,
    signatures: [
      {
        keyid,
        sig: signature.toString('base64'),
        alg,
      },
    ],
  };
}

export function verifyEnvelope(envelope, verificationConfig) {
  try {
    if (
      !envelope ||
      typeof envelope !== 'object' ||
      typeof envelope.payloadType !== 'string' ||
      typeof envelope.payload !== 'string' ||
      !Array.isArray(envelope.signatures) ||
      envelope.signatures.length === 0
    ) {
      return { ok: false, errorReason: 'malformed-envelope' };
    }

    const payloadBytes = decodeBase64(envelope.payload);
    if (!payloadBytes) {
      return { ok: false, errorReason: 'malformed-payload' };
    }

    const configs = normalizeVerificationConfigs(verificationConfig);
    if (configs.length === 0) {
      return { ok: false, errorReason: 'no-verification-keys' };
    }

    const pae = preAuthEncoding(envelope.payloadType, payloadBytes);
    const candidates = selectSignatureConfigs(envelope.signatures, configs);
    if (candidates.length === 0) {
      return { ok: false, errorReason: 'no-matching-key' };
    }

    for (const { signature, config } of candidates) {
      if (typeof signature.sig !== 'string' || signature.sig.length === 0) {
        continue;
      }
      const decodedSignature = decodeBase64(signature.sig);
      if (!decodedSignature) {
        continue;
      }
      const alg = signature.alg || config.alg;
      if (!SUPPORTED_ALGORITHMS.has(alg)) {
        return { ok: false, errorReason: 'unsupported-algorithm' };
      }
      const nodeAlg = resolveNodeAlgorithm(alg);
      if (!nodeAlg) {
        return { ok: false, errorReason: 'unsupported-algorithm' };
      }
      try {
        const verified = crypto.verify(nodeAlg.nodeAlg, pae, config.pubkey, decodedSignature);
        if (verified) {
          return {
            ok: true,
            errorReason: null,
            keyid: signature.keyid || config.keyid || null,
            alg: nodeAlg.normalized,
          };
        }
      } catch {
        // fall through and try next combination
      }
    }
    return { ok: false, errorReason: 'invalid-signature' };
  } catch {
    return { ok: false, errorReason: 'verification-error' };
  }
}

export function parsePayload(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    throw new TypeError('Envelope must be an object.');
  }
  const payloadBytes = decodeBase64(envelope.payload);
  if (!payloadBytes) {
    throw new Error('Failed to decode DSSE payload.');
  }
  const json = payloadBytes.toString('utf8');
  return JSON.parse(json);
}
