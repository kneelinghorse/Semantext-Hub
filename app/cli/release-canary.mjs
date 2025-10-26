#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import fetch from 'node-fetch';

import { callAgent } from '../libs/a2a/client.mjs';
import { MetricsIngestWriter } from '../services/obs/ingest.mjs';
import {
  loadManifestExtend,
  writeManifestExtend,
  recordRollback,
} from './release-rollback.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');
const DEFAULT_MANIFEST_PATH = resolve(APP_ROOT, 'protocols', 'release', 'manifest.extend.json');

const DEFAULT_REGISTRY_URL = process.env.OSSP_REGISTRY_URL ?? 'http://localhost:3333';
const DEFAULT_TARGET = process.env.OSSP_CANARY_TARGET ?? 'urn:ossp:agent:echo';
const DEFAULT_DURATION_SECONDS = 60;
const DEFAULT_QPS = 2;
const DEFAULT_P95_THRESHOLD = 1000;
const DEFAULT_ERROR_RATE = 0.1;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_HEALTH_TIMEOUT_MS = 3500;

const FATAL_ERROR_PATTERNS = [
  /registry resolve failed/i,
  /does not expose a default endpoint/i,
  /circuit breaker is open/i,
  /circuit_open/i,
];

const EXIT_OK = 0;
const EXIT_FAIL = 1;

function parsePositiveNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return parsed;
}

function parseNonNegative(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    duration: DEFAULT_DURATION_SECONDS,
    qps: DEFAULT_QPS,
    p95: DEFAULT_P95_THRESHOLD,
    maxErrorRate: DEFAULT_ERROR_RATE,
    registryUrl: DEFAULT_REGISTRY_URL,
    target: DEFAULT_TARGET,
    manifest: DEFAULT_MANIFEST_PATH,
    timeout: DEFAULT_TIMEOUT_MS,
    healthTimeout: DEFAULT_HEALTH_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case '--duration':
        options.duration = parsePositiveNumber(argv[++index], '--duration');
        break;
      case '--qps':
        options.qps = parsePositiveNumber(argv[++index], '--qps');
        break;
      case '--p95':
      case '--p95-max':
        options.p95 = parsePositiveNumber(argv[++index], '--p95');
        break;
      case '--max-error-rate':
        options.maxErrorRate = parseNonNegative(argv[++index], '--max-error-rate');
        break;
      case '--registry-url':
        options.registryUrl = argv[++index];
        break;
      case '--target':
        options.target = argv[++index];
        break;
      case '--manifest':
        options.manifest = resolve(process.cwd(), argv[++index]);
        break;
      case '--session':
        options.sessionId = argv[++index];
        break;
      case '--log-root':
        options.logRoot = resolve(process.cwd(), argv[++index]);
        break;
      case '--api-key':
        options.apiKey = argv[++index];
        break;
      case '--timeout':
        options.timeout = parsePositiveNumber(argv[++index], '--timeout');
        break;
      case '--health-url':
        options.healthUrl = argv[++index];
        break;
      case '--health-timeout':
        options.healthTimeout = parsePositiveNumber(argv[++index], '--health-timeout');
        break;
      case '--json':
        options.json = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: ossp release canary [options]

Options:
  --duration <seconds>     Total duration for canary window (default: ${DEFAULT_DURATION_SECONDS})
  --qps <number>           Target queries per second (default: ${DEFAULT_QPS})
  --registry-url <url>     Registry base URL (default: ${DEFAULT_REGISTRY_URL})
  --target <urn|cap>       Target agent/capability for echo probe (default: ${DEFAULT_TARGET})
  --manifest <path>        Override manifest.extend.json path
  --session <id>           Override session identifier
  --log-root <dir>         Override metrics log root directory
  --timeout <ms>           Timeout per probe request (default: ${DEFAULT_TIMEOUT_MS})
  --p95 <ms>               Maximum allowed p95 latency (default: ${DEFAULT_P95_THRESHOLD})
  --max-error-rate <n>     Maximum allowed error rate (0-1, default: ${DEFAULT_ERROR_RATE})
  --health-url <url>       Override health check URL (default: <registry>/health)
  --health-timeout <ms>    Timeout for health check (default: ${DEFAULT_HEALTH_TIMEOUT_MS})
  --api-key <key>          Registry API key when required
  --json                   Emit JSON output
  -h, --help               Show this help text
`);
}

function computePercentile(values, percentile) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex];
  }
  const lowerWeight = upperIndex - position;
  const upperWeight = position - lowerIndex;
  return sorted[lowerIndex] * lowerWeight + sorted[upperIndex] * upperWeight;
}

function createTimeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

async function checkHealth(url, { fetchImpl = fetch, timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS } = {}) {
  try {
    const response = await fetchImpl(url, {
      signal: createTimeoutSignal(timeoutMs),
      headers: {
        'user-agent': 'ossp-release-canary',
      },
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status}` };
    }
    if (body?.status && body.status !== 'ok') {
      return { ok: false, reason: `status=${body.status}` };
    }
    return { ok: true, body };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { ok: false, reason: `health check timed out after ${timeoutMs} ms` };
    }
    return { ok: false, reason: error.message ?? 'health check failed' };
  }
}

async function annotateCanarySuccess(manifestPath, { correlationId, stats }) {
  const manifest = await loadManifestExtend(manifestPath);
  manifest.annotations.canary = {
    status: 'canary-ok',
    ts: new Date().toISOString(),
    correlationId,
    sessionId: stats.sessionId,
    attempts: stats.attempts,
    successes: stats.successes,
    failures: stats.failures,
    p95: stats.p95,
    errorRate: stats.errorRate,
    durationMs: stats.durationMs,
  };
  await writeManifestExtend(manifestPath, manifest);
  return manifest.annotations.canary;
}

async function runCanary({
  options,
  correlationId,
  callAgentImpl,
  metricsWriter,
  delayImpl,
}) {
  const attempts = [];
  const startTime = Date.now();
  const durationMs = options.duration * 1000;
  const intervalMs = Math.max(1, Math.floor(1000 / options.qps));
  const endTime = startTime + durationMs;
  let lastLogPath = null;
  let iteration = 0;
  let fatalError = null;

  while (Date.now() < endTime || attempts.length === 0) {
    iteration += 1;
    const attemptStart = Date.now();
    let duration;
    let ok = false;
    let errMessage = null;

    try {
      const result = await callAgentImpl(
        options.target,
        'echo',
        {
          message: `release-canary-${iteration}`,
          correlationId,
        },
        {
          sessionId: options.sessionId,
          logRoot: options.logRoot,
          registryUrl: options.registryUrl,
          apiKey: options.apiKey,
          timeout: options.timeout,
          headers: {
            'x-release-correlation-id': correlationId,
          },
        },
      );
      duration = result?.trace?.durationMs ?? Date.now() - attemptStart;
      ok = Boolean(result?.ok);
      if (!ok) {
        errMessage = result?.error?.message ?? 'call_failed';
      }
    } catch (error) {
      duration = Date.now() - attemptStart;
      ok = false;
      errMessage = error?.message ?? 'call_failed';
    }

    attempts.push({
      ok,
      durationMs: duration,
      err: errMessage,
    });

    const fatalTriggered =
      !ok &&
      fatalError == null &&
      typeof errMessage === 'string' &&
      FATAL_ERROR_PATTERNS.some((pattern) => pattern.test(errMessage));
    if (fatalTriggered) {
      fatalError = errMessage;
      console.warn(
        `[release-canary] Fatal error encountered after ${attempts.length} attempt(s): ${errMessage}`,
      );
    }

    if (metricsWriter) {
      try {
        const { path: logPath } = await metricsWriter.log({
          tool: 'release:canary',
          step: 'a2a.echo',
          ms: duration,
          ok,
          ...(errMessage ? { err: errMessage } : {}),
        });
        lastLogPath = logPath;
      } catch {
        // ignore metrics errors
      }
    }

    if (fatalError) {
      break;
    }

    if (Date.now() >= endTime) {
      break;
    }

    const waitMs = intervalMs - (Date.now() - attemptStart);
    if (waitMs > 0) {
      await delayImpl(waitMs);
    }
  }

  const totalDuration = Date.now() - startTime;
  const successes = attempts.filter((item) => item.ok).length;
  const failures = attempts.length - successes;
  const durations = attempts.map((item) => item.durationMs);
  const p95 = computePercentile(durations, 0.95);
  const errorRate = attempts.length === 0 ? 1 : failures / attempts.length;

  return {
    attempts,
    stats: {
      sessionId: options.sessionId,
      attempts: attempts.length,
      successes,
      failures,
      durations,
      p95,
      errorRate,
      durationMs: totalDuration,
      qps: options.qps,
      windowSeconds: options.duration,
      logPath: lastLogPath,
      fatalError,
    },
  };
}

export async function run(argv = process.argv.slice(2), overrides = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    return EXIT_FAIL;
  }

  if (options.help) {
    printHelp();
    return EXIT_OK;
  }

  const callAgentImpl = overrides.callAgentImpl ?? callAgent;
  const fetchImpl = overrides.fetchImpl ?? fetch;
  const delayImpl = overrides.delayImpl ?? delay;
  const correlationId = overrides.correlationId ?? randomUUID();

  if (!options.sessionId) {
    options.sessionId = `release-canary-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  }

  const metricsWriter = (() => {
    try {
      return new MetricsIngestWriter({
        sessionId: options.sessionId,
        root: options.logRoot,
      });
    } catch {
      return null;
    }
  })();

  const healthUrl =
    options.healthUrl ?? new URL('/health', options.registryUrl).toString();
  const preflightHealth = await checkHealth(healthUrl, {
    fetchImpl,
    timeoutMs: options.healthTimeout,
  });

  const manifestPath = options.manifest ?? DEFAULT_MANIFEST_PATH;
  const breaches = [];

  if (!preflightHealth.ok) {
    breaches.push(`health:${preflightHealth.reason}`);
  }

  let canaryResult = { attempts: [], stats: null };
  if (breaches.length === 0) {
    canaryResult = await runCanary({
      options,
      correlationId,
      callAgentImpl,
      metricsWriter,
      delayImpl,
    });
    const { stats } = canaryResult;
    if (stats.attempts === 0) {
      breaches.push('no_samples_collected');
    } else {
      if (stats.fatalError) {
        breaches.push(`fatal:${stats.fatalError}`);
      }
      if (stats.p95 > options.p95) {
        breaches.push(`p95:${stats.p95.toFixed(2)}>${options.p95}`);
      }
      if (stats.errorRate > options.maxErrorRate) {
        breaches.push(`errorRate:${stats.errorRate.toFixed(4)}>${options.maxErrorRate}`);
      }
    }
  }

  const postHealth =
    breaches.length === 0
      ? await checkHealth(healthUrl, {
          fetchImpl,
          timeoutMs: options.healthTimeout,
        })
      : preflightHealth;

  if (breaches.length === 0 && !postHealth.ok) {
    breaches.push(`health:${postHealth.reason}`);
  }

  const stats = canaryResult.stats ?? {
    sessionId: options.sessionId,
    attempts: 0,
    successes: 0,
    failures: 0,
    durations: [],
    p95: 0,
    errorRate: 1,
    durationMs: 0,
    qps: options.qps,
    windowSeconds: options.duration,
    fatalError: null,
  };

  if (breaches.length > 0) {
    stats.breaches = breaches;
    try {
      const entry = await recordRollback({
        manifestPath,
        correlationId,
        reason: `Canary breach: ${breaches.join(', ')}`,
        stats,
      });
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              status: 'failed',
              correlationId: entry.correlationId,
              breaches,
              stats,
            },
            null,
            2,
          ),
        );
      } else {
        console.error(
          `Release canary failed (${entry.correlationId}): ${breaches.join(', ')}`,
        );
      }
    } catch (error) {
      console.error(`Release canary failed; rollback logging error: ${error.message}`);
    }
    return EXIT_FAIL;
  }

  try {
    const annotation = await annotateCanarySuccess(manifestPath, {
      correlationId,
      stats,
    });
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            status: 'passed',
            correlationId,
            stats,
            annotation,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(
        `Release canary passed (correlationId=${correlationId}) p95=${annotation.p95.toFixed(
          2,
        )}ms errorRate=${annotation.errorRate.toFixed(4)}`,
      );
    }
  } catch (error) {
    console.error(`Failed to annotate manifest: ${error.message}`);
    return EXIT_FAIL;
  }

  return EXIT_OK;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then((code) => {
    process.exitCode = code;
  });
}
