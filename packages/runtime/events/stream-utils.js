const DEFAULT_ENVIRONMENT = (process.env.SEMANTEXT_ENV || process.env.NODE_ENV || 'development').trim().toLowerCase();
const DEFAULT_DOMAIN = 'semantext';

function sanitizeSegment(value, fallback) {
  if (value == null) {
    return fallback;
  }

  const text = String(value).trim();
  if (!text) {
    return fallback;
  }

  const normalised = text
    .toLowerCase()
    .replace(/[^a-z0-9\-_.:]/g, '-')
    .replace(/[:]{2,}/g, ':')
    .replace(/-{2,}/g, '-')
    .replace(/^:+|:+$/g, '')
    .replace(/^-+|-+$/g, '');

  return normalised || fallback;
}

export function buildStreamName(segments = {}) {
  const env = sanitizeSegment(segments.env, DEFAULT_ENVIRONMENT);
  const domain = sanitizeSegment(segments.domain, DEFAULT_DOMAIN);
  const object = sanitizeSegment(segments.object, 'object');
  const event = sanitizeSegment(segments.event, 'event');
  const objectId = sanitizeSegment(segments.objectId, 'global');

  return [env, domain, object, event, objectId].join(':');
}

export function mergeStreamDefaults(segments = {}, defaults = {}) {
  return {
    env: segments.env ?? defaults.env ?? DEFAULT_ENVIRONMENT,
    domain: segments.domain ?? defaults.domain ?? DEFAULT_DOMAIN,
    object: segments.object ?? defaults.object ?? 'object',
    event: segments.event ?? defaults.event ?? 'event',
    objectId: segments.objectId ?? defaults.objectId ?? 'global'
  };
}

export function normaliseTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  const seen = new Set();
  const result = [];
  for (const tag of tags) {
    if (tag == null) {
      continue;
    }
    const text = String(tag).trim().toLowerCase();
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    result.push(text);
  }
  return result;
}

export function isRedisUnavailableError(error) {
  if (!error) {
    return false;
  }
  const message = error.message || String(error);
  return message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT') || message.includes('NR_CLOSED');
}
