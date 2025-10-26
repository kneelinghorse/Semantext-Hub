#!/usr/bin/env node

/**
 * Release Canary Registry Seed Helper
 *
 * Boots a local echo agent, ensures the registry database schema exists,
 * starts the runtime registry, and registers the echo agent so the
 * release canary can resolve it without 404s.
 *
 * Optional flags allow running the canary immediately after the seed step
 * and keeping the services alive for manual probes.
 */

import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, isAbsolute } from 'node:path';
import { readFile } from 'node:fs/promises';

import express from 'express';
import fetch from 'node-fetch';

import { openDb } from '../../packages/runtime/registry/db.mjs';
import { startServer } from '../../packages/runtime/registry/server.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const DEFAULT_DB_PATH = resolve(REPO_ROOT, 'var', 'release-canary-registry.sqlite');
const DEFAULT_LOG_ROOT = resolve(REPO_ROOT, 'artifacts', 'perf');
const SCHEMA_PATH = resolve(REPO_ROOT, 'scripts', 'db', 'schema.sql');

const DEFAULTS = {
  registryHost: '127.0.0.1',
  registryPort: 3333,
  agentHost: '127.0.0.1',
  agentPort: 0,
  apiKey: 'canary-local-secret',
  agentUrn: 'urn:ossp:agent:echo',
  capability: 'a2a.echo',
  stayAlive: false,
  runCanary: false,
  canaryDuration: 15,
  canaryQps: 2,
  canaryP95: 250,
  canaryErrorRate: 0.05,
};

function normalizePath(candidate) {
  if (!candidate) return null;
  return isAbsolute(candidate) ? candidate : resolve(process.cwd(), candidate);
}

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function parseNonNegative(value, label) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    registryHost: DEFAULTS.registryHost,
    registryPort: DEFAULTS.registryPort,
    agentHost: DEFAULTS.agentHost,
    agentPort: DEFAULTS.agentPort,
    apiKey: process.env.OSSP_REGISTRY_API_KEY || DEFAULTS.apiKey,
    dbPath: DEFAULT_DB_PATH,
    logRoot: process.env.OSSP_LOG_ROOT || DEFAULT_LOG_ROOT,
    agentUrn: DEFAULTS.agentUrn,
    capability: DEFAULTS.capability,
    stayAlive: DEFAULTS.stayAlive,
    runCanary: DEFAULTS.runCanary,
    canaryDuration: DEFAULTS.canaryDuration,
    canaryQps: DEFAULTS.canaryQps,
    canaryP95: DEFAULTS.canaryP95,
    canaryErrorRate: DEFAULTS.canaryErrorRate,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case '--registry-host':
        options.registryHost = argv[++index] ?? options.registryHost;
        break;
      case '--registry-port':
        options.registryPort = parsePositiveInteger(argv[++index], '--registry-port');
        break;
      case '--agent-host':
        options.agentHost = argv[++index] ?? options.agentHost;
        break;
      case '--agent-port':
        options.agentPort = Number.parseInt(argv[++index], 10);
        if (!Number.isFinite(options.agentPort) || options.agentPort < 0) {
          throw new Error('--agent-port must be >= 0');
        }
        break;
      case '--api-key':
        options.apiKey = argv[++index] ?? options.apiKey;
        break;
      case '--db-path':
        options.dbPath = normalizePath(argv[++index]) ?? options.dbPath;
        break;
      case '--log-root':
        options.logRoot = normalizePath(argv[++index]) ?? options.logRoot;
        break;
      case '--agent-urn':
        options.agentUrn = argv[++index] ?? options.agentUrn;
        break;
      case '--capability':
        options.capability = argv[++index] ?? options.capability;
        break;
      case '--stay-alive':
        options.stayAlive = true;
        break;
      case '--run-canary':
        options.runCanary = true;
        break;
      case '--canary-duration':
        options.canaryDuration = parsePositiveInteger(argv[++index], '--canary-duration');
        break;
      case '--canary-qps':
        options.canaryQps = parsePositiveInteger(argv[++index], '--canary-qps');
        break;
      case '--canary-p95':
        options.canaryP95 = parsePositiveInteger(argv[++index], '--canary-p95');
        break;
      case '--canary-error-rate':
        options.canaryErrorRate = parseNonNegative(argv[++index], '--canary-error-rate');
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
  console.log(`Usage: node scripts/release/canary-registry-seed.mjs [options]

Seeds the runtime registry with a local echo agent for release canary telemetry.

Options:
  --registry-host <host>        Registry bind host (default: ${DEFAULTS.registryHost})
  --registry-port <port>        Registry bind port (default: ${DEFAULTS.registryPort})
  --agent-host <host>           Echo agent bind host (default: ${DEFAULTS.agentHost})
  --agent-port <port>           Echo agent port (0 picks a random free port)
  --api-key <key>               Registry API key (default: ${DEFAULTS.apiKey})
  --db-path <path>              Registry SQLite path (default: ${DEFAULT_DB_PATH})
  --log-root <path>             Metrics root for canary runs (default: ${DEFAULT_LOG_ROOT})
  --agent-urn <urn>             Agent URN to register (default: ${DEFAULTS.agentUrn})
  --capability <cap>            Capability string to advertise (default: ${DEFAULTS.capability})
  --stay-alive                  Keep registry + agent running until Ctrl+C
  --run-canary                  Run app/cli/release-canary.mjs after seeding
  --canary-duration <seconds>   Canary window when --run-canary is set (default: ${DEFAULTS.canaryDuration})
  --canary-qps <qps>            Canary QPS when --run-canary is set (default: ${DEFAULTS.canaryQps})
  --canary-p95 <ms>             Canary latency budget when --run-canary is set (default: ${DEFAULTS.canaryP95})
  --canary-error-rate <rate>    Canary max error rate (default: ${DEFAULTS.canaryErrorRate})
  -h, --help                    Show this help text
`);
}

async function ensureSchema(dbPath) {
  const schemaSql = await readFile(SCHEMA_PATH, 'utf8');
  const db = await openDb({ dbPath });
  try {
    await db.exec(schemaSql);
  } finally {
    await db.close();
  }
}

async function startEchoAgent({ host, port }) {
  const app = express();
  app.use(express.json());

  app.post('/a2a/echo', (request, response) => {
    const message = request.body?.payload?.message ?? null;
    response.json({
      ok: true,
      echo: message,
      correlationId: request.get('x-correlation-id') ?? null,
      receivedAt: new Date().toISOString(),
    });
  });

  const server = await new Promise((resolvePromise) => {
    const listener = app.listen(port, host, () => resolvePromise(listener));
  });

  const address = server.address();
  const resolvedHost =
    typeof address === 'object' && address?.address
      ? address.address === '::'
        ? '127.0.0.1'
        : address.address
      : host;
  const resolvedPort =
    typeof address === 'object' && typeof address?.port === 'number'
      ? address.port
      : port;

  const baseUrl = `http://${resolvedHost}:${resolvedPort}`;
  return {
    url: baseUrl,
    host: resolvedHost,
    port: resolvedPort,
    close: () =>
      new Promise((resolvePromise) => {
        server.close(() => resolvePromise());
      }),
  };
}

async function seedRegistry({ registryUrl, apiKey, agentUrn, capability, agentEndpoint }) {
  const manifest = {
    id: agentUrn,
    name: 'Release Canary Echo Agent',
    version: '1.0.0',
    description: 'Local echo agent used for release-canary telemetry validation.',
    communication: {
      supported: ['http'],
      endpoints: {
        default: agentEndpoint,
        http: agentEndpoint,
      },
      transports: ['http'],
    },
    capabilities: {
      tools: [
        {
          name: 'echo',
          capability,
          urn: capability,
          description: 'Echo message payloads for release-canary verification.',
          tags: ['telemetry', 'echo', 'release-canary'],
        },
      ],
      resources: [],
    },
    authorization: {
      type: 'none',
      scopes: [],
    },
    metadata: {
      environment: 'local',
      seededAt: new Date().toISOString(),
      seededBy: 'scripts/release/canary-registry-seed.mjs',
    },
  };

  const upsertUrl = new URL(`/v1/registry/${encodeURIComponent(agentUrn)}`, registryUrl);
  const response = await fetch(upsertUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      manifest,
      issuer: 'release.canary.seed',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Failed to seed registry (status ${response.status}): ${errText || response.statusText}`,
    );
  }
}

async function verifySeed({ registryUrl, apiKey, agentUrn, capability }) {
  const resolveUrl = new URL('/v1/resolve', registryUrl);
  resolveUrl.searchParams.set('urn', agentUrn);
  const resolveResponse = await fetch(resolveUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-API-Key': apiKey,
    },
  });
  if (!resolveResponse.ok) {
    throw new Error(`Registry resolve check failed with status ${resolveResponse.status}`);
  }
  const resolvePayload = await resolveResponse.json();
  if (!resolvePayload?.manifest) {
    throw new Error('Registry resolve response missing manifest payload');
  }

  const queryUrl = new URL('/v1/query', registryUrl);
  const queryResponse = await fetch(queryUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({ capability }),
  });

  if (!queryResponse.ok) {
    throw new Error(`Capability query failed with status ${queryResponse.status}`);
  }
}

async function runReleaseCanary(options) {
  const args = [
    '--duration',
    String(options.canaryDuration),
    '--qps',
    String(options.canaryQps),
    '--p95',
    String(options.canaryP95),
    '--max-error-rate',
    String(options.canaryErrorRate),
  ];

  const childEnv = {
    ...process.env,
    OSSP_REGISTRY_URL: options.registryUrl,
    OSSP_REGISTRY_API_KEY: options.apiKey,
    OSSP_LOG_ROOT: options.logRoot,
    OSSP_CANARY_TARGET: options.agentUrn,
  };

  return new Promise((resolvePromise) => {
    const child = spawn(
      process.execPath,
      [join(REPO_ROOT, 'app', 'cli', 'release-canary.mjs'), ...args],
      {
        cwd: REPO_ROOT,
        stdio: 'inherit',
        env: childEnv,
      },
    );

    child.on('exit', (code) => {
      resolvePromise(code ?? 0);
    });
  });
}

async function main() {
  process.chdir(REPO_ROOT);

  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }

  await ensureSchema(options.dbPath);
  console.log(`[seed] SQLite schema ensured at ${options.dbPath}`);

  const agent = await startEchoAgent({
    host: options.agentHost,
    port: options.agentPort,
  });
  console.log(`[seed] Echo agent listening at ${agent.url}`);

  const runtime = await startServer({
    host: options.registryHost,
    port: options.registryPort,
    apiKey: options.apiKey,
    dbPath: options.dbPath,
    registryConfigPath: null,
    rateLimitConfigPath: null,
    rateLimit: { windowMs: 60000, max: 1000 },
    requireProvenance: false,
    provenanceKeys: [],
  });

  const registryHost =
    runtime.host === '::' || runtime.host === '0.0.0.0' ? '127.0.0.1' : runtime.host;
  const registryUrl = `http://${registryHost}:${runtime.port}`;

  console.log(`[seed] Registry running at ${registryUrl}`);

  await seedRegistry({
    registryUrl,
    apiKey: options.apiKey,
    agentUrn: options.agentUrn,
    capability: options.capability,
    agentEndpoint: agent.url,
  });
  console.log(`[seed] Registered ${options.agentUrn} with capability ${options.capability}`);

  await verifySeed({
    registryUrl,
    apiKey: options.apiKey,
    agentUrn: options.agentUrn,
    capability: options.capability,
  });
  console.log('[seed] Seed verification succeeded (resolve + capability query)');

  process.env.OSSP_REGISTRY_URL = registryUrl;
  process.env.OSSP_REGISTRY_API_KEY = options.apiKey;
  process.env.OSSP_LOG_ROOT = options.logRoot;

  const shutdownTasks = [
    () => runtime.close(),
    () => agent.close(),
  ];

  const handleExit = async () => {
    for (const task of shutdownTasks) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await task();
      } catch (error) {
        console.warn('[seed] Error during shutdown:', error);
      }
    }
  };

  process.once('SIGINT', async () => {
    console.log('\n[seed] Caught SIGINT, shutting down...');
    await handleExit();
    process.exit(0);
  });

  let exitCode = 0;
  if (options.runCanary) {
    console.log('[seed] Running release canary with seeded registry...');
    exitCode = await runReleaseCanary({
      registryUrl,
      apiKey: options.apiKey,
      logRoot: options.logRoot,
      agentUrn: options.agentUrn,
      canaryDuration: options.canaryDuration,
      canaryQps: options.canaryQps,
      canaryP95: options.canaryP95,
      canaryErrorRate: options.canaryErrorRate,
    });
    if (exitCode === 0) {
      console.log('[seed] Release canary completed successfully.');
    } else {
      console.warn(`[seed] Release canary exited with code ${exitCode}.`);
    }
  }

  if (options.stayAlive) {
    console.log('[seed] Registry + agent will remain online. Press Ctrl+C to stop.');
    await new Promise(() => {
      /* keep process alive until SIGINT */
    });
  } else {
    await handleExit();
  }

  return exitCode;
}

main()
  .then((code) => {
    if (code !== 0) {
      process.exitCode = code;
    }
  })
  .catch(async (error) => {
    console.error('[seed] Fatal error:', error);
    process.exitCode = 1;
  });
