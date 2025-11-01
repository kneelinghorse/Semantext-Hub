const COSINE_EPSILON = 1e-9;

export function ensureStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (entry == null) {
        return null;
      }
      if (typeof entry === 'string') {
        return entry.trim();
      }
      return String(entry).trim();
    })
    .filter((entry) => entry && entry.length > 0);
}

export function toPlainArray(vector) {
  if (!vector) {
    return [];
  }
  if (Array.isArray(vector)) {
    return vector.slice();
  }
  if (ArrayBuffer.isView(vector)) {
    return Array.from(vector);
  }
  if (typeof vector?.toArray === 'function') {
    try {
      const result = vector.toArray();
      return Array.isArray(result) ? result.slice() : Array.from(result ?? []);
    } catch {
      return [];
    }
  }
  if (typeof vector === 'object' && typeof vector.length === 'number') {
    try {
      return Array.from(vector);
    } catch {
      return [];
    }
  }
  return [];
}

export function cosineSimilarity(a, b) {
  const lhs = toPlainArray(a);
  const rhs = toPlainArray(b);
  const length = Math.min(lhs.length, rhs.length);
  if (length === 0) {
    return 0;
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < length; i += 1) {
    const ax = lhs[i];
    const bx = rhs[i];
    if (!Number.isFinite(ax) || !Number.isFinite(bx)) {
      continue;
    }
    dot += ax * bx;
    magA += ax * ax;
    magB += bx * bx;
  }
  if (magA <= COSINE_EPSILON || magB <= COSINE_EPSILON) {
    return 0;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function buildPayload(entry) {
  const payloadSource =
    entry && typeof entry === 'object' && entry.payload && typeof entry.payload === 'object'
      ? entry.payload
      : {};

  const toolIdCandidate =
    payloadSource.tool_id ??
    entry?.tool_id ??
    payloadSource.urn ??
    entry?.urn ??
    null;

  const urnCandidate =
    payloadSource.urn ??
    entry?.urn ??
    (toolIdCandidate ? String(toolIdCandidate) : null);

  return {
    tool_id: toolIdCandidate ? String(toolIdCandidate) : null,
    urn: urnCandidate ? String(urnCandidate) : null,
    name: payloadSource.name ?? entry?.name ?? null,
    summary: payloadSource.summary ?? entry?.summary ?? null,
    tags: ensureStringArray(payloadSource.tags ?? entry?.tags ?? []),
    capabilities: ensureStringArray(payloadSource.capabilities ?? entry?.capabilities ?? [])
  };
}

export default {
  ensureStringArray,
  toPlainArray,
  cosineSimilarity,
  buildPayload
};
