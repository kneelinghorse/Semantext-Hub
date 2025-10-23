import { verifyEnvelope, parsePayload } from './dsse.mjs';

export const REQUIRED_FIELDS = ['builder', 'materials', 'metadata'];
export const DEFAULT_PROVENANCE_TYPE = 'application/vnd.in-toto+json';
export const DEFAULT_STATEMENT_TYPE = 'https://in-toto.io/Statement/v0.1';

function isIsoDate(value) {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time);
}

function normalizeMaterials(materials) {
  if (!Array.isArray(materials)) return null;
  for (const entry of materials) {
    if (entry && typeof entry === 'object') {
      continue;
    }
    return null;
  }
  return materials;
}

export function validateProvenance(envelope, verifyConfig) {
  if (!envelope || typeof envelope !== 'object') {
    return { ok: false, reason: 'missing-envelope' };
  }

  const sigResult = verifyEnvelope(envelope, verifyConfig);
  if (!sigResult.ok) {
    return { ok: false, reason: sigResult.errorReason };
  }

  let payload;
  try {
    payload = parsePayload(envelope);
  } catch {
    return { ok: false, reason: 'invalid-payload-format' };
  }

  if (envelope.payloadType && envelope.payloadType !== DEFAULT_PROVENANCE_TYPE) {
    return { ok: false, reason: 'unsupported-payload-type' };
  }

  if (!payload || typeof payload !== 'object') {
    return { ok: false, reason: 'invalid-payload-format' };
  }

  if (payload._type && payload._type !== DEFAULT_STATEMENT_TYPE) {
    return { ok: false, reason: 'unsupported-statement-type' };
  }

  const builderId = payload.builder?.id;
  if (!builderId || typeof builderId !== 'string') {
    return { ok: false, reason: 'missing-builder-id' };
  }

  const materials = normalizeMaterials(payload.materials);
  if (!materials) {
    return { ok: false, reason: 'missing-materials' };
  }

  const metadata = payload.metadata;
  if (!metadata || typeof metadata !== 'object') {
    return { ok: false, reason: 'missing-commit-metadata' };
  }

  if (!metadata.commit || typeof metadata.commit !== 'string') {
    return { ok: false, reason: 'missing-commit-metadata' };
  }

  if (metadata.timestamp && !isIsoDate(metadata.timestamp)) {
    return { ok: false, reason: 'invalid-metadata-timestamp' };
  }

  if (payload.buildType && typeof payload.buildType !== 'string') {
    return { ok: false, reason: 'invalid-buildType' };
  }

  if (metadata.buildTool && typeof metadata.buildTool !== 'string') {
    return { ok: false, reason: 'invalid-buildTool' };
  }

  return {
    ok: true,
    payload,
    signature: {
      keyid: sigResult.keyid || null,
      alg: sigResult.alg || null,
    },
  };
}

export function summarizeProvenance(envelope) {
  try {
    const payload = parsePayload(envelope);
    const primarySignature =
      Array.isArray(envelope?.signatures) && envelope.signatures.length > 0
        ? envelope.signatures[0]
        : null;
    const signatureSummary = primarySignature
      ? {
          scheme: 'dsse+jws',
          keyId: primarySignature.keyid ?? null,
          algorithm: primarySignature.alg ?? null,
        }
      : null;
    return {
      builder: payload.builder?.id,
      commit: payload.metadata?.commit,
      timestamp: payload.metadata?.timestamp,
      buildTool: payload.metadata?.buildTool,
      materialsCount: Array.isArray(payload.materials) ? payload.materials.length : 0,
      buildType: payload.buildType,
      statementType: payload._type ?? DEFAULT_STATEMENT_TYPE,
      statementMediaType: envelope?.payloadType ?? DEFAULT_PROVENANCE_TYPE,
      signature: signatureSummary,
    };
  } catch (error) {
    return { error: 'invalid-provenance' };
  }
}

export function createProvenancePayload({
  builderId,
  commit,
  materials = [],
  buildType = 'ossp-manifest-v1',
  timestamp = new Date().toISOString(),
  buildTool = 'ossp-cli',
  inputs = [],
  outputs = [],
}) {
  return {
    _type: DEFAULT_STATEMENT_TYPE,
    buildType,
    builder: {
      id: builderId,
    },
    materials: materials.map((m) => ({
      uri: m.uri || m,
      digest: m.digest || {},
    })),
    metadata: {
      commit,
      timestamp,
      buildTool,
    },
    inputs: inputs.length > 0 ? inputs : undefined,
    outputs: outputs.length > 0 ? outputs : undefined,
  };
}
