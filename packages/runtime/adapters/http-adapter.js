// http-adapter: stable timeout + validation + requestId semantics
// ESM module; Node 20+
import { randomUUID } from 'node:crypto';

export class TimeoutError extends Error {
  constructor(message = 'timeout') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function validateHttpRequestOptions(opts = {}) {
  const errors = [];
  if (!opts.url || typeof opts.url !== 'string' || !opts.url.trim()) {
    errors.push({ field: 'url', code: 'ERR_REQUIRED', message: 'url required' });
  }
  if (opts.timeout !== undefined) {
    const t = Number(opts.timeout);
    if (!Number.isFinite(t) || t <= 0) {
      errors.push({
        field: 'timeout',
        code: 'ERR_INVALID_TIMEOUT',
        message: 'timeout must be a positive number',
      });
    }
  }
  return { valid: errors.length === 0, errors };
}

async function httpRequest({
  url,
  method = 'GET',
  headers = {},
  body,
  timeout = 10000,
  responseType = 'json',
}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new TimeoutError('timeout')), Number(timeout));
  try {
    const res = await fetch(url, { method, headers, body, signal: ac.signal });
    const txt = await res.text();
    let data = txt;
    if (responseType === 'json') {
      try {
        data = txt ? JSON.parse(txt) : null;
      } catch {
        // leave as text on parse error
      }
    }
    return {
      status: res.status,
      ok: res.ok,
      headers: Object.fromEntries(res.headers.entries()),
      data,
    };
  } catch (err) {
    // Normalize AbortError → TimeoutError('timeout') to match tests
    if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      throw new TimeoutError('timeout');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function execute(requestOptions = {}) {
  const v = validateHttpRequestOptions(requestOptions);
  if (!v.valid) {
    const e = new Error('Invalid HTTP request options');
    e.details = v.errors;
    throw e;
  }
  const result = await httpRequest(requestOptions);
  if (!result.data || typeof result.data !== 'object') result.data = {};
  if (!result.data.requestId) result.data.requestId = randomUUID();
  return result;
}

export default { execute, httpRequest, validateHttpRequestOptions, TimeoutError };
