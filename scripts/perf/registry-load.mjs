#!/usr/bin/env node
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

const OUT = 'artifacts/perf/registry-load.jsonl';
const SAMPLES_REQUIRED = Number(process.env.REGISTRY_SAMPLES || 50);
const MAX_ATTEMPTS_FACTOR = Number(process.env.REGISTRY_SAMPLE_ATTEMPTS_FACTOR || 2);
const REQUIRED_API_KEY =
  typeof process.env.REGISTRY_API_KEY === 'string'
    ? process.env.REGISTRY_API_KEY.trim()
    : '';
const DEFAULT_PORT = Number(process.env.REGISTRY_PORT || 3201);

fs.mkdirSync('artifacts/perf', { recursive: true });

function computeP95(samples) {
  if (samples.length === 0) {
    return 0;
  }
  const sorted = samples.slice().sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, idx)];
}

async function seedTestManifest(baseUrl, apiKey) {
  const testUrn = 'urn:protocol:api:test:1.0.0';
  const registryUrl = `${baseUrl}/v1/registry/${encodeURIComponent(testUrn)}`;

  const seedBody = {
    urn: testUrn,
    version: '1.0.0',
    capabilities: ['perf', 'resolve'],
    metadata: { seeded_at: new Date().toISOString() }
  };

  const response = await fetch(registryUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey
    },
    body: JSON.stringify(seedBody)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '<no-body>');
    throw new Error(`[perf] Failed to seed manifest (${response.status}): ${text}`);
  }

  return testUrn;
}

async function sample(route, { required = SAMPLES_REQUIRED, apiKey = REQUIRED_API_KEY } = {}) {
  const attemptsLimit = required * Math.max(1, MAX_ATTEMPTS_FACTOR);
  const rows = [];
  let successes = 0;
  let attempts = 0;

  while (successes < required && attempts < attemptsLimit) {
    attempts += 1;
    const t0 = performance.now();
    try {
      const res = await fetch(route.url, {
        headers: {
          'X-API-Key': apiKey
        }
      });
      const t1 = performance.now();
      const row = {
        route: route.url,
        ok: res.ok,
        status: res.status,
        ms: +(t1 - t0).toFixed(2)
      };
      if (!res.ok) {
        row.error = `status ${res.status}`;
      } else {
        successes += 1;
      }
      rows.push(row);
    } catch (error) {
      const t1 = performance.now();
      rows.push({
        route: route.url,
        ok: false,
        status: 0,
        ms: +(t1 - t0).toFixed(2),
        error: error.message || 'fetch_failed'
      });
    }
  }

  return { rows, successes, attempts };
}

(async () => {
let registryUrl = process.env.REGISTRY_URL;
let localServer = null;
const apiKey = REQUIRED_API_KEY;

if (!apiKey) {
  console.error('[perf] REGISTRY_API_KEY must be set before running registry-load benchmarks.');
  process.exit(1);
}

try {
  if (!registryUrl) {
    const { startServer } = await import('../../packages/runtime/registry/server.mjs');
    const port = DEFAULT_PORT;

    console.log(`[perf] No REGISTRY_URL provided, starting local server on port ${port}...`);
    localServer = await startServer({ apiKey, port });
    registryUrl = `http://localhost:${port}`;

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const routes = [
    {
      name: 'GET /v1/registry/:urn',
      url: `${registryUrl}/v1/registry/urn:protocol:api:test:1.0.0`,
      budget: 200
    },
    {
      name: 'GET /v1/resolve',
      url: `${registryUrl}/v1/resolve?urn=urn:protocol:api:test:1.0.0`,
      budget: 300
    }
  ];

  console.log('[perf] Starting registry performance test...');

  if (fs.existsSync(OUT)) {
    fs.unlinkSync(OUT);
  }

  await seedTestManifest(registryUrl, apiKey);

  let allPass = true;

  for (const route of routes) {
    console.log(`[perf] Sampling ${route.name} (${route.url})...`);
    const { rows, successes, attempts } = await sample(route, { required: SAMPLES_REQUIRED, apiKey });

    for (const row of rows) {
      fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
    }

    const failures = rows.filter((r) => !r.ok);

    if (successes < SAMPLES_REQUIRED) {
      console.error(
        `[perf] ✗ ${route.name}: only ${successes}/${SAMPLES_REQUIRED} successful samples collected within ${attempts} attempts`
      );
      if (failures.length) {
        console.error(
          `[perf]   first failure: ${failures[0].error ?? 'unknown'} (status ${failures[0].status}, ${failures[0].ms}ms)`
        );
      }
      allPass = false;
      continue;
    }

    if (failures.length > 0) {
      console.warn(
        `[perf] ! ${route.name}: ${failures.length} failures observed (first: ${failures[0].error ?? 'unknown'})`
      );
    }

    const validSamples = rows.filter((r) => r.ok).map((r) => r.ms);
    const p95 = computeP95(validSamples);
    const pass = p95 <= route.budget;
    const statusIcon = pass ? '✓' : '✗';

    console.log(
      `[perf] ${statusIcon} ${route.name}: p95 = ${p95.toFixed(2)}ms (budget ${route.budget}ms, successes ${successes})`
    );

    if (!pass) {
      allPass = false;
    }
  }

  console.log(`[perf] Results written to ${OUT}`);

  if (!allPass) {
    console.error('[perf] FAILED: Performance budgets not met');
    process.exit(1);
  }

  console.log('[perf] PASSED: All performance budgets met');
} finally {
  if (localServer) {
    console.log('[perf] Shutting down local registry server...');
    await localServer.close();
  }
}
})().catch((error) => {
  console.error('[perf] ERROR:', error);
  process.exit(1);
});





