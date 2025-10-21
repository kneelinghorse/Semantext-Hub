#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

log() {
  printf '[release-gate] %s\n' "$*"
}

PERF_ROOT="$ROOT_DIR/artifacts/perf"
WSAP_ROOT="$ROOT_DIR/app/artifacts/wsap"

mkdir -p "$PERF_ROOT"
mkdir -p "$WSAP_ROOT"
rm -rf "$ROOT_DIR/coverage"
REGISTRY_PORT=3333
REGISTRY_API_KEY="release-gate-stub"
REGISTRY_ENV_PID=""

cleanup() {
  if [ -n "$REGISTRY_ENV_PID" ] && kill -0 "$REGISTRY_ENV_PID" 2>/dev/null; then
    kill "$REGISTRY_ENV_PID" 2>/dev/null || true
    wait "$REGISTRY_ENV_PID" 2>/dev/null || true
  fi
  rm -f "${WSAP_STATE_FILE:-}"
  rm -f "${CANARY_STATE_FILE:-}"
}
trap cleanup EXIT

log "Running gate-critical test suite with coverage"
GATE_TESTS=(
  tests/runtime/registry-api.test.js
  tests/a2a/client.resilience.spec.mjs
  tests/signing/jws.spec.mjs
  tests/release/preflight.spec.mjs
  tests/release/canary-rollback.spec.mjs
  tests/release/promotion-signed.spec.mjs
)
COVERAGE_TARGETS=(
  app/cli/release-preflight.mjs
  app/cli/release-canary.mjs
  app/cli/release-promote.mjs
  app/cli/release-rollback.mjs
  app/libs/a2a/client.mjs
  app/libs/signing/jws.mjs
  packages/runtime/runtime/registry-api.js
)
COVERAGE_ARGS=()
for target in "${COVERAGE_TARGETS[@]}"; do
  COVERAGE_ARGS+=(--collectCoverageFrom "$target")
done
node --experimental-vm-modules ./node_modules/jest/bin/jest.js \
  --config jest.esm.ci.js \
  --ci \
  --coverage \
  --maxWorkers=2 \
  --testTimeout=30000 \
  --runTestsByPath \
  "${COVERAGE_ARGS[@]}" \
  "${GATE_TESTS[@]}"

start_registry_env() {
  local registry_port="${REGISTRY_PORT:-3333}"
  local agent_port=3335
  local api_key="${REGISTRY_API_KEY:-release-gate-stub}"

  RELEASE_GATE_REGISTRY_PORT="$registry_port" \
  RELEASE_GATE_AGENT_PORT="$agent_port" \
  RELEASE_GATE_REGISTRY_KEY="$api_key" \
  node --input-type=module - <<'NODE' &
import http from 'node:http';
import { URL } from 'node:url';

const registryPort = Number.parseInt(process.env.RELEASE_GATE_REGISTRY_PORT ?? '3333', 10);
const agentPort = Number.parseInt(process.env.RELEASE_GATE_AGENT_PORT ?? '3335', 10);
const apiKey = process.env.RELEASE_GATE_REGISTRY_KEY ?? 'release-gate-stub';
const agentEndpoint = `http://127.0.0.1:${agentPort}`;
const agentUrn = 'urn:ossp:agent:echo';

const agentServer = http.createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/a2a/echo') {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(body || '{}');
      } catch {
        payload = {};
      }
      const message = payload?.payload?.message ?? null;
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json');
      const correlation = request.headers['x-correlation-id'];
      if (correlation) {
        response.setHeader('X-Correlation-ID', correlation);
      }
      response.end(
        JSON.stringify({
          ok: true,
          echo: message,
          correlationId: correlation ?? null,
          receivedAt: new Date().toISOString(),
        }),
      );
    });
    return;
  }
  response.statusCode = 404;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ status: 'not_found' }));
});

agentServer.listen(agentPort, '127.0.0.1');

const buildCard = () => ({
  id: agentUrn,
  name: 'Release Gate Stub Agent',
  version: '1.0.0',
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
        capability: 'stub.echo',
      },
    ],
    resources: [],
  },
  authorization: { type: 'none' },
});

const registryServer = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${registryPort}`);

  const requireKey = () => {
    const provided = request.headers['x-api-key'];
    if (provided !== apiKey) {
      response.statusCode = 401;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ error: 'unauthorized' }));
      return false;
    }
    return true;
  };

  if (request.method === 'GET' && url.pathname === '/health') {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify({
        status: 'ok',
        agents: 1,
        updatedAt: new Date().toISOString(),
      }),
    );
    return;
  }

  if (request.method === 'GET' && url.pathname === '/resolve') {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ status: 'ok', results: [] }));
    return;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/resolve/')) {
    if (!requireKey()) return;
    const target = decodeURIComponent(url.pathname.replace('/resolve/', '')) || agentUrn;
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify({
        urn: target,
        card: buildCard(),
        verification: { status: 'verified', verifiedAt: new Date().toISOString() },
      }),
    );
    return;
  }

  if (request.method === 'GET' && url.pathname === '/registry') {
    if (!requireKey()) return;
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify({
        status: 'ok',
        results: [
          {
            urn: agentUrn,
            card: buildCard(),
            verification: { status: 'verified', verifiedAt: new Date().toISOString() },
          },
        ],
      }),
    );
    return;
  }

  response.statusCode = 404;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ status: 'not_found' }));
});

registryServer.listen(registryPort, '127.0.0.1');

const shutdown = () => {
  registryServer.close(() => {
    agentServer.close(() => process.exit(0));
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await new Promise(() => {});
NODE
  REGISTRY_ENV_PID=$!
  sleep 0.5
  if ! kill -0 "$REGISTRY_ENV_PID" 2>/dev/null; then
    echo "Failed to launch registry environment" >&2
    exit 1
  fi
}

log "Generating WSAP release artifacts"
export OSSP_GATE_LOG_ROOT="$PERF_ROOT"
export OSSP_GATE_ART_ROOT="$WSAP_ROOT"
WSAP_STATE_FILE="$(mktemp)"
export WSAP_STATE_FILE

node --input-type=module - <<'NODE'
import fs from 'node:fs';
import { runWsap } from './app/cli/wsap.mjs';

const logRoot = process.env.OSSP_GATE_LOG_ROOT;
const artifactRoot = process.env.OSSP_GATE_ART_ROOT;
const statePath = process.env.WSAP_STATE_FILE;

const result = await runWsap({
  logRoot,
  artifactRoot,
  open: false,
});

if (!result.success) {
  const messages = (result.errors ?? []).map((err) => {
    if (!err) return 'unknown error';
    if (typeof err === 'string') return err;
    return err.message ?? String(err);
  });
  console.error(`WSAP session ${result.sessionId} failed: ${messages.join('; ')}`);
  process.exit(1);
}

const payload = {
  sessionId: result.sessionId,
  runDir: result.runDir,
  metricsLog: result.metrics?.logPath ?? null,
  report: result.artifacts?.reportJson ?? null,
  reportSig: result.artifacts?.reportSignature ?? null,
  diagram: result.artifacts?.drawioDiagram ?? null,
  diagramSig: result.artifacts?.diagramSignature ?? null,
  publicKey: result.artifacts?.signingPublicKey ?? null
};

fs.writeFileSync(statePath, JSON.stringify(payload));
NODE

if [ ! -s "$WSAP_STATE_FILE" ]; then
  echo "WSAP state file was not created" >&2
  exit 1
fi

eval "$(
  node --input-type=module - "$WSAP_STATE_FILE" <<'NODE'
import fs from 'node:fs';

const statePath = process.argv[2];
const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const entries = {
  WSAP_SESSION: data.sessionId,
  WSAP_RUN_DIR: data.runDir,
  WSAP_METRICS_LOG: data.metricsLog,
  WSAP_REPORT: data.report,
  WSAP_REPORT_SIG: data.reportSig,
  WSAP_DIAGRAM: data.diagram,
  WSAP_DIAGRAM_SIG: data.diagramSig,
  WSAP_PUBLIC_KEY: data.publicKey
};

const required = [
  'WSAP_RUN_DIR',
  'WSAP_METRICS_LOG',
  'WSAP_REPORT',
  'WSAP_REPORT_SIG',
  'WSAP_DIAGRAM',
  'WSAP_DIAGRAM_SIG',
  'WSAP_PUBLIC_KEY'
];

for (const key of required) {
  if (!entries[key]) {
    throw new Error(`Missing ${key} from WSAP session results`);
  }
}

for (const [key, value] of Object.entries(entries)) {
  if (value === undefined || value === null) continue;
  const serialized = JSON.stringify(String(value));
  console.log(`${key}=${serialized}`);
}
NODE
)"

log "Copying WSAP metrics to artifacts/perf/latest.jsonl"
if [ ! -f "$WSAP_METRICS_LOG" ]; then
  echo "Expected WSAP metrics log at $WSAP_METRICS_LOG" >&2
  exit 1
fi
cp "$WSAP_METRICS_LOG" "$PERF_ROOT/latest.jsonl"

log "Starting registry and agent stubs"
start_registry_env

log "Running release preflight policy checks"
node app/cli/release-preflight.mjs --policy app/policies/release/preflight.policy.json

log "Executing release canary probe"
CANARY_STATE_FILE="$(mktemp)"
node app/cli/release-canary.mjs \
  --json \
  --log-root "$PERF_ROOT" \
  --manifest "$ROOT_DIR/app/protocols/release/manifest.extend.json" \
  --registry-url "http://127.0.0.1:${REGISTRY_PORT}" \
  --api-key "$REGISTRY_API_KEY" \
  --duration 10 \
  --qps 1 \
  --p95 500 \
  --max-error-rate 0.2 \
  > "$CANARY_STATE_FILE"

if [ -s "$CANARY_STATE_FILE" ]; then
  eval "$(
    node --input-type=module - "$CANARY_STATE_FILE" <<'NODE'
import fs from 'node:fs';

const payloadPath = process.argv[2];
const raw = fs.readFileSync(payloadPath, 'utf8').trim();
if (!raw) {
  process.exit(0);
}
const data = JSON.parse(raw);
const logPath = data?.stats?.logPath;
if (logPath) {
  console.log(`CANARY_METRICS_LOG=${JSON.stringify(String(logPath))}`);
}
NODE
  )"
fi

if [ -n "${CANARY_METRICS_LOG:-}" ] && [ -f "$CANARY_METRICS_LOG" ]; then
  log "Updating latest metrics with canary session"
  cp "$CANARY_METRICS_LOG" "$PERF_ROOT/latest.jsonl"
fi

log "Verifying signed artifacts and promoting release"
node app/cli/release-promote.mjs \
  --manifest "$ROOT_DIR/app/protocols/release/manifest.json" \
  --public-key "$WSAP_PUBLIC_KEY" \
  --report "$WSAP_REPORT" \
  --report-sig "$WSAP_REPORT_SIG" \
  --diagram "$WSAP_DIAGRAM" \
  --diagram-sig "$WSAP_DIAGRAM_SIG"

log "Release Gate completed successfully"
