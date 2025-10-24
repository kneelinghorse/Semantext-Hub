import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { URL } from 'node:url';
import process from 'node:process';

import fetch from 'node-fetch';

import { MetricsIngestWriter } from '../../services/obs/ingest.mjs';

const DEFAULT_REGISTRY_URL = process.env.OSSP_REGISTRY_URL ?? 'http://localhost:3000';
const DEFAULT_API_KEY =
  typeof process.env.OSSP_REGISTRY_API_KEY === 'string'
    ? process.env.OSSP_REGISTRY_API_KEY.trim()
    : null;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_BASE = 200;
const DEFAULT_BACKOFF_FACTOR = 2;
const DEFAULT_BACKOFF_JITTER = 0.25;
const DEFAULT_BACKOFF_MAX = 2000;
const DEFAULT_BREAKER_FAILURES = 3;
const DEFAULT_BREAKER_COOLDOWN = 15000;
const DEFAULT_CACHE_TTL = 60000;

const resolutionCache = new Map();
const circuitBreakers = new Map();

class CircuitBreaker {
  constructor({ failureThreshold, cooldownMs, halfOpenMaxCalls }) {
    this.failureThreshold = Math.max(1, failureThreshold ?? DEFAULT_BREAKER_FAILURES);
    this.cooldownMs = Math.max(100, cooldownMs ?? DEFAULT_BREAKER_COOLDOWN);
    this.halfOpenMaxCalls = Math.max(1, halfOpenMaxCalls ?? 1);
    this.reset();
  }

  reset() {
    this.failureCount = 0;
    this.nextAttemptAt = null;
    this.state = 'closed';
    this.halfOpenAttempts = 0;
  }

  canAttempt() {
    if (this.state === 'open') {
      const now = Date.now();
      if (this.nextAttemptAt && now >= this.nextAttemptAt) {
        this.state = 'half-open';
        this.halfOpenAttempts = 0;
        return true;
      }
      return false;
    }
    if (this.state === 'half-open') {
      if (this.halfOpenAttempts >= this.halfOpenMaxCalls) {
        return false;
      }
      this.halfOpenAttempts += 1;
      return true;
    }
    return true;
  }

  recordSuccess() {
    this.reset();
  }

  recordFailure() {
    if (this.state === 'half-open') {
      this.open();
      return;
    }
    this.failureCount += 1;
    if (this.failureCount >= this.failureThreshold) {
      this.open();
    }
  }

  open() {
    this.state = 'open';
    this.nextAttemptAt = Date.now() + this.cooldownMs;
  }
}

function breakerKeyForTarget(target) {
  return typeof target === 'string' ? target.toLowerCase() : String(target);
}

function getCircuitBreaker(target, options = {}) {
  const key = breakerKeyForTarget(target);
  if (!circuitBreakers.has(key)) {
    circuitBreakers.set(
      key,
      new CircuitBreaker({
        failureThreshold: options.failureThreshold,
        cooldownMs: options.cooldownMs,
        halfOpenMaxCalls: options.halfOpenMaxCalls,
      }),
    );
  }
  return circuitBreakers.get(key);
}

function invalidateResolution(target) {
  resolutionCache.delete(breakerKeyForTarget(target));
}

function cacheResolution(target, payload, ttl = DEFAULT_CACHE_TTL) {
  if (!target) return;
  const key = breakerKeyForTarget(target);
  resolutionCache.set(key, {
    cachedAt: Date.now(),
    ttl: Math.max(0, ttl ?? DEFAULT_CACHE_TTL),
    value: payload,
  });
}

function getCachedResolution(target) {
  const key = breakerKeyForTarget(target);
  const entry = resolutionCache.get(key);
  if (!entry) return null;
  if (entry.ttl === 0) return entry.value;
  if (Date.now() - entry.cachedAt > entry.ttl) {
    resolutionCache.delete(key);
    return null;
  }
  return entry.value;
}

function isUrn(value) {
  return typeof value === 'string' && value.startsWith('urn:');
}

function sanitizeMethod(method) {
  if (!method || typeof method !== 'string') {
    return null;
  }
  const trimmed = method.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

function joinUrl(base, path) {
  try {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(base);
    const joined = new URL(normalizedPath, url);
    return joined.toString();
  } catch {
    return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  }
}

function pickEndpoint(card) {
  if (!card || typeof card !== 'object') return null;
  const endpoints = card.communication?.endpoints;
  if (endpoints && typeof endpoints.default === 'string') {
    return endpoints.default;
  }
  const supported = Array.isArray(card.communication?.supported)
    ? card.communication.supported
    : [];
  if (supported.includes('http') && typeof endpoints?.http === 'string') {
    return endpoints.http;
  }
  return null;
}

function resolveRegistryApiKey(candidate) {
  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    return candidate.trim();
  }
  if (typeof DEFAULT_API_KEY === 'string' && DEFAULT_API_KEY.length > 0) {
    return DEFAULT_API_KEY;
  }
  throw new Error(
    'Registry API key is required. Provide options.apiKey or set OSSP_REGISTRY_API_KEY environment variable.',
  );
}

async function resolveByUrn(target, { fetchImpl, registryUrl, apiKey, timeout, cacheTtl }) {
  const cached = getCachedResolution(target);
  if (cached) {
    return cached;
  }

  // Runtime v1 endpoint: GET /v1/resolve?urn={urn}
  const resolveUrl = new URL('/v1/resolve', registryUrl);
  resolveUrl.searchParams.append('urn', target);
  
  const response = await fetchWithTimeout(fetchImpl, resolveUrl.toString(), {
    method: 'GET',
    headers: {
      'X-API-Key': apiKey,
      Accept: 'application/json',
    },
    timeout,
  });

  if (!response.ok) {
    throw new Error(`Registry resolve failed (${response.status})`);
  }
  const payload = await safeParseJson(response);
  
  // Runtime response shape: { urn, manifest, capabilities, digest }
  if (!payload?.manifest) {
    throw new Error('Registry response missing agent manifest');
  }
  const endpoint = pickEndpoint(payload.manifest);
  if (!endpoint) {
    throw new Error(`Agent ${target} does not expose a default endpoint`);
  }

  const result = {
    urn: payload.urn ?? target,
    endpoint,
    card: payload.manifest,
    capabilities: payload.capabilities ?? [],
    digest: payload.digest ?? null,
  };
  cacheResolution(target, result, cacheTtl);
  return result;
}

async function resolveByCapability(target, options) {
  const cached = getCachedResolution(target);
  if (cached) {
    return cached;
  }

  const { fetchImpl, registryUrl, apiKey, timeout, cacheTtl } = options;
  
  // Runtime v1 endpoint: POST /v1/query with { capability: "..." }
  const queryUrl = joinUrl(registryUrl, '/v1/query');
  const response = await fetchWithTimeout(fetchImpl, queryUrl, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ capability: target }),
    timeout,
  });
  
  if (!response.ok) {
    throw new Error(`Capability query failed (${response.status})`);
  }
  const payload = await safeParseJson(response);
  
  // Runtime response shape: { status: 'ok', capability, results: [{ urn, digest }] }
  if (!payload?.results || !Array.isArray(payload.results) || payload.results.length === 0) {
    throw new Error(`No agents found for capability '${target}'`);
  }
  
  const first = payload.results[0];
  
  // Now fetch the full manifest for the first result
  const manifestUrl = joinUrl(registryUrl, `/v1/registry/${encodeURIComponent(first.urn)}`);
  const manifestResponse = await fetchWithTimeout(fetchImpl, manifestUrl, {
    method: 'GET',
    headers: {
      'X-API-Key': apiKey,
      Accept: 'application/json',
    },
    timeout,
  });
  
  if (!manifestResponse.ok) {
    throw new Error(`Failed to fetch manifest for ${first.urn} (${manifestResponse.status})`);
  }
  
  const manifestPayload = await safeParseJson(manifestResponse);
  const manifest = manifestPayload?.body;
  
  if (!manifest) {
    throw new Error(`Agent ${first.urn} for capability '${target}' has no manifest`);
  }
  
  const endpoint = pickEndpoint(manifest);
  if (!endpoint) {
    throw new Error(`Agent ${first.urn} for capability '${target}' lacks endpoint`);
  }
  
  const result = {
    urn: first.urn,
    endpoint,
    capability: target,
    card: manifest,
    digest: first.digest,
  };
  cacheResolution(target, result, cacheTtl);
  cacheResolution(first.urn, result, cacheTtl);
  return result;
}

async function resolveTarget(target, options) {
  if (isUrn(target)) {
    return resolveByUrn(target, options);
  }
  return resolveByCapability(target, options);
}

function computeBackoffDelay(base, factor, attemptIndex, jitter, max) {
  const exponential = base * Math.max(1, factor) ** Math.max(0, attemptIndex);
  const withMax = Math.min(exponential, max);
  if (!jitter) return Math.round(withMax);
  const spread = withMax * Math.max(0, Math.min(1, jitter));
  const min = withMax - spread;
  const maxValue = withMax + spread;
  return Math.round(min + Math.random() * (maxValue - min));
}

async function fetchWithTimeout(fetchImpl, url, { timeout, ...options }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (controller.signal.aborted) {
      const abortError = new Error(`Request timed out after ${timeout ?? DEFAULT_TIMEOUT_MS}ms`);
      abortError.code = 'timeout';
      throw abortError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function safeParseJson(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('json')) {
    return null;
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function sendAgentRequest(resolution, method, payload, options) {
  const { fetchImpl, timeout, correlationId, headers } = options;
  const endpointUrl = joinUrl(resolution.endpoint, `/a2a/${encodeURIComponent(method)}`);
  const response = await fetchWithTimeout(fetchImpl, endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Correlation-ID': correlationId,
      ...(headers ?? {}),
    },
    timeout,
    body: JSON.stringify({
      urn: resolution.urn,
      capability: resolution.capability ?? null,
      method,
      payload,
    }),
  });

  const responseBody = await safeParseJson(response);
  if (!response.ok) {
    const error = new Error(
      `Agent request failed with status ${response.status} (${response.statusText})`,
    );
    error.code = 'agent_error';
    error.status = response.status;
    error.response = responseBody;
    throw error;
  }

  return {
    data: responseBody,
    status: response.status,
    headers: response.headers,
    endpointUrl,
  };
}

async function logMetrics(writer, { sessionId, method, ms, ok, err }) {
  if (!writer) return;
  try {
    await writer.log({
      sessionId,
      tool: 'a2a',
      step: method,
      ms,
      ok,
      ...(err ? { err } : {}),
    });
  } catch {
    // Metrics logging should not fail the call.
  }
}

function defaultSessionId() {
  const iso = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `a2a-${iso}`;
}

export async function callAgent(target, method, payload = {}, options = {}) {
  const operation = sanitizeMethod(method);
  if (!operation) {
    throw new TypeError('method must be a non-empty string');
  }
  if (!target || typeof target !== 'string') {
    throw new TypeError('target must be a non-empty string');
  }

  const fetchImpl = options.fetch ?? fetch;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const retries = Math.max(0, options.retries ?? DEFAULT_RETRIES);
  const backoffOptions = typeof options.backoff === 'number'
    ? {
        base: Math.max(1, options.backoff),
        factor: DEFAULT_BACKOFF_FACTOR,
        jitter: DEFAULT_BACKOFF_JITTER,
        max: DEFAULT_BACKOFF_MAX,
      }
    : {
        base: Math.max(1, options.backoff?.base ?? DEFAULT_BACKOFF_BASE),
        factor: options.backoff?.factor ?? DEFAULT_BACKOFF_FACTOR,
        jitter: options.backoff?.jitter ?? DEFAULT_BACKOFF_JITTER,
        max: options.backoff?.max ?? DEFAULT_BACKOFF_MAX,
      };

  const breakerOptions = {
    failureThreshold:
      options.circuitBreaker?.failureThreshold ??
      options.backoff?.circuitBreaker?.failureThreshold ??
      DEFAULT_BREAKER_FAILURES,
    cooldownMs:
      options.circuitBreaker?.cooldownMs ??
      options.backoff?.circuitBreaker?.cooldownMs ??
      DEFAULT_BREAKER_COOLDOWN,
    halfOpenMaxCalls:
      options.circuitBreaker?.halfOpenMaxCalls ??
      options.backoff?.circuitBreaker?.halfOpenMaxCalls ??
      1,
  };

  const sessionId = options.sessionId ?? defaultSessionId();
  const metricsWriter =
    options.metricsWriter ?? (options.disableMetrics === true
      ? null
      : new MetricsIngestWriter({ sessionId, root: options.logRoot }));

  const correlationId = options.correlationId ?? randomUUID();
  const registryUrl = options.registryUrl ?? DEFAULT_REGISTRY_URL;
  const registryApiKey = resolveRegistryApiKey(options.apiKey);

  const trace = {
    target,
    method: operation,
    correlationId,
    startedAt: new Date().toISOString(),
    attempts: [],
    circuitBreaker: null,
  };

  const startTime = Date.now();
  const breaker = getCircuitBreaker(target, breakerOptions);
  trace.circuitBreaker = {
    state: breaker.state,
    failureCount: breaker.failureCount,
    nextAttemptAt: breaker.nextAttemptAt ? new Date(breaker.nextAttemptAt).toISOString() : null,
    threshold: breaker.failureThreshold,
    cooldownMs: breaker.cooldownMs,
  };

  const breakerAllowed = breaker.canAttempt();
  if (!breakerAllowed) {
    const duration = Date.now() - startTime;
    trace.endedAt = new Date().toISOString();
    trace.durationMs = duration;
    trace.circuitBreaker.state = breaker.state;
    trace.circuitBreaker.deniedAt = trace.endedAt;
    await logMetrics(metricsWriter, {
      sessionId,
      method: operation,
      ms: duration,
      ok: false,
      err: 'circuit_open',
    });
    return {
      ok: false,
      data: null,
      error: { code: 'circuit_open', message: 'Circuit breaker is open for target' },
      trace,
    };
  }

  let resolved = null;
  let success = false;
  let responseData = null;
  let failureError = null;

  const maxAttempts = retries + 1;
  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    const attemptNumber = attemptIndex + 1;
    const attemptStart = Date.now();
    const attemptTrace = {
      attempt: attemptNumber,
      startedAt: new Date(attemptStart).toISOString(),
    };

    try {
      resolved = await resolveTarget(target, {
        fetchImpl,
        registryUrl,
        apiKey: registryApiKey,
        timeout,
        cacheTtl: options.cacheTtl ?? DEFAULT_CACHE_TTL,
      });

      attemptTrace.urn = resolved.urn;
      attemptTrace.endpoint = resolved.endpoint;
      attemptTrace.capability = resolved.capability ?? null;

      const agentResult = await sendAgentRequest(resolved, operation, payload, {
        fetchImpl,
        timeout,
        correlationId,
        headers: options.headers,
      });

      attemptTrace.responseStatus = agentResult.status;
      attemptTrace.durationMs = Date.now() - attemptStart;
      attemptTrace.ok = true;
      attemptTrace.responseCorrelationId =
        agentResult.headers.get('x-correlation-id') ?? null;
      trace.attempts.push(attemptTrace);

      responseData = agentResult.data;
      success = true;
      break;
    } catch (error) {
      failureError = error;
      attemptTrace.ok = false;
      attemptTrace.durationMs = Date.now() - attemptStart;
      attemptTrace.error = {
        message: error.message,
        code: error.code ?? null,
        status: error.status ?? null,
      };
      trace.attempts.push(attemptTrace);

      if (breaker.state === 'half-open') {
        break;
      }

      const shouldRetry = attemptIndex < retries;
      if (!shouldRetry) {
        break;
      }
      const backoffMs = computeBackoffDelay(
        backoffOptions.base,
        backoffOptions.factor,
        attemptIndex,
        backoffOptions.jitter,
        backoffOptions.max,
      );
      attemptTrace.backoffMs = backoffMs;
      await delay(backoffMs);
    }
  }

  const duration = Date.now() - startTime;
  trace.endedAt = new Date().toISOString();
  trace.durationMs = duration;

  if (success) {
    breaker.recordSuccess();
    trace.circuitBreaker.state = breaker.state;
    trace.circuitBreaker.failureCount = breaker.failureCount;
    trace.resolution = {
      urn: resolved.urn,
      endpoint: resolved.endpoint,
      capability: resolved.capability ?? null,
    };
    await logMetrics(metricsWriter, {
      sessionId,
      method: operation,
      ms: duration,
      ok: true,
    });
    return {
      ok: true,
      data: responseData,
      trace,
    };
  }

  breaker.recordFailure();
  trace.circuitBreaker.state = breaker.state;
  trace.circuitBreaker.failureCount = breaker.failureCount;
  trace.circuitBreaker.nextAttemptAt = breaker.nextAttemptAt
    ? new Date(breaker.nextAttemptAt).toISOString()
    : null;

  await logMetrics(metricsWriter, {
    sessionId,
    method: operation,
    ms: duration,
    ok: false,
    err: failureError?.message ?? 'call_failed',
  });

  return {
    ok: false,
    data: null,
    error: {
      code: failureError?.code ?? 'call_failed',
      message: failureError?.message ?? 'A2A call failed',
    },
    trace,
  };
}

export function resetA2aState() {
  circuitBreakers.clear();
  resolutionCache.clear();
}

export function getCircuitBreakerSnapshot(target) {
  const breaker = circuitBreakers.get(breakerKeyForTarget(target));
  if (!breaker) return null;
  return {
    state: breaker.state,
    failureCount: breaker.failureCount,
    nextAttemptAt: breaker.nextAttemptAt,
    threshold: breaker.failureThreshold,
    cooldownMs: breaker.cooldownMs,
  };
}
