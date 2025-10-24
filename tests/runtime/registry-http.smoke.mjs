#!/usr/bin/env node

/**
 * Registry HTTP Smoke Tests
 * 
 * Hits real Registry endpoints and collects performance metrics:
 * - GET /health
 * - GET /openapi.json
 * - GET /v1/registry/:urn
 * - PUT /v1/registry/:urn
 * - GET /v1/resolve
 * 
 * Usage:
 *   node tests/runtime/registry-http.smoke.mjs [options]
 * 
 * Options:
 *   --base-url <url>       Registry base URL (default: http://localhost:3000)
 *   --api-key <key>        API key (required if REGISTRY_API_KEY not set)
 *   --samples <n>          Number of samples per endpoint (default: 50)
 *   --output <path>        Output JSONL file (optional)
 *   --verbose              Enable verbose logging
 *   --help                 Show this help
 */

import fs from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve as resolvePath } from 'node:path';
import { createEnvelope } from '../../packages/runtime/security/dsse.mjs';
import { createProvenancePayload } from '../../packages/runtime/security/provenance.mjs';

const DSSE_PRIVATE_KEY_PATH = resolvePath(process.cwd(), 'fixtures/keys/priv.pem');
const DSSE_PRIVATE_KEY = fs.existsSync(DSSE_PRIVATE_KEY_PATH)
  ? fs.readFileSync(DSSE_PRIVATE_KEY_PATH, 'utf8')
  : null;

if (!DSSE_PRIVATE_KEY) {
  throw new Error('DSSE private key not found at fixtures/keys/priv.pem. Cannot run registry smoke tests without provenance attestation key.');
}

/**
 * Parse command line arguments
 */
function parseArgs(argv) {
  const args = {
    baseUrl: 'http://localhost:3000',
    apiKey:
      typeof process.env.REGISTRY_API_KEY === 'string'
        ? process.env.REGISTRY_API_KEY.trim()
        : null,
    samples: 50,
    output: null,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--base-url':
        args.baseUrl = argv[++i];
        break;
      case '--api-key':
        args.apiKey = argv[++i];
        break;
      case '--samples':
        args.samples = parseInt(argv[++i], 10) || 50;
        break;
      case '--output':
        args.output = argv[++i];
        break;
      case '--verbose':
        args.verbose = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
    }
  }

  if (typeof args.apiKey === 'string') {
    args.apiKey = args.apiKey.trim();
  }

  return args;
}

/**
 * Print help text
 */
function printHelp() {
  console.log(`
Registry HTTP Smoke Tests - Hit real Registry endpoints

Usage:
  node tests/runtime/registry-http.smoke.mjs [options]

Options:
  --base-url <url>       Registry base URL (default: http://localhost:3000)
  --api-key <key>        API key (required if REGISTRY_API_KEY not set)
  --samples <n>          Number of samples per endpoint (default: 50)
  --output <path>        Output JSONL file (optional)
  --verbose              Enable verbose logging
  --help                 Show this help

Examples:
  # Basic smoke test (requires API key)
  REGISTRY_API_KEY=test-key node tests/runtime/registry-http.smoke.mjs

  # Custom URL and API key with output
  node tests/runtime/registry-http.smoke.mjs \\
    --base-url http://localhost:3000 \\
    --api-key test-key \\
    --samples 100 \\
    --output artifacts/perf/registry-smoke.jsonl
`);
}

/**
 * Make HTTP request with timing
 */
async function makeRequest(url, options = {}) {
  const startTime = performance.now();
  let ok = false;
  let errorReason = null;
  let status = null;
  let data = null;

  try {
    const response = await fetch(url, options);
    status = response.status;
    ok = response.ok;

    if (!ok) {
      errorReason = `HTTP ${status}`;
    }

    // Try to parse JSON response
    try {
      data = await response.json();
      if (!ok && data.error) {
        errorReason = `${errorReason}: ${data.error}`;
      }
    } catch {
      // Not JSON, that's ok
    }
  } catch (error) {
    ok = false;
    errorReason = error.message;
  }

  const endTime = performance.now();
  const ms = Math.round((endTime - startTime) * 100) / 100;

  return { ok, errorReason, status, ms, data };
}

/**
 * Test GET /health
 */
async function testHealth(baseUrl, verbose) {
  const url = `${baseUrl}/health`;
  if (verbose) console.log(`Testing GET /health...`);

  const result = await makeRequest(url);

  if (!result.ok) {
    throw new Error(`Health check failed: ${result.errorReason}`);
  }

  if (verbose) console.log(`  ✓ Health OK (${result.ms}ms)`);

  return result;
}

/**
 * Test GET /openapi.json
 */
async function testOpenAPI(baseUrl, verbose) {
  const url = `${baseUrl}/openapi.json`;
  if (verbose) console.log(`Testing GET /openapi.json...`);

  const result = await makeRequest(url);

  if (!result.ok) {
    throw new Error(`OpenAPI fetch failed: ${result.errorReason}`);
  }

  if (!result.data || !result.data.openapi) {
    throw new Error('OpenAPI response missing openapi field');
  }

  if (verbose) console.log(`  ✓ OpenAPI OK (${result.ms}ms)`);

  return result;
}

/**
 * Test PUT /v1/registry/:urn
 */
async function testRegistryPut(baseUrl, apiKey, urn, card, sig, provenance, verbose) {
  const url = `${baseUrl}/v1/registry/${encodeURIComponent(urn)}`;
  if (verbose) console.log(`Testing PUT /v1/registry/${urn}...`);

  const result = await makeRequest(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({ urn, card, sig, provenance }),
  });

  if (!result.ok && result.status !== 200 && result.status !== 201) {
    throw new Error(`Registry PUT failed: ${result.errorReason}`);
  }

  if (verbose) console.log(`  ✓ Registry PUT OK (${result.ms}ms)`);

  return result;
}

/**
 * Test GET /v1/registry/:urn
 */
async function testRegistryGet(baseUrl, apiKey, urn, verbose) {
  const url = `${baseUrl}/v1/registry/${encodeURIComponent(urn)}`;
  if (verbose) console.log(`Testing GET /v1/registry/${urn}...`);

  const result = await makeRequest(url, {
    headers: {
      'X-API-Key': apiKey,
    },
  });

  if (!result.ok) {
    if (result.status === 404) {
      // Not found is ok for testing
      return { ...result, ok: true, errorReason: null };
    }
    throw new Error(`Registry GET failed: ${result.errorReason}`);
  }

  if (verbose) console.log(`  ✓ Registry GET OK (${result.ms}ms)`);

  return result;
}

/**
 * Test GET /v1/resolve
 */
async function testResolve(baseUrl, apiKey, urn, verbose) {
  const url = `${baseUrl}/v1/resolve?urn=${encodeURIComponent(urn)}`;
  if (verbose) console.log(`Testing GET /v1/resolve?urn=${urn}...`);

  const result = await makeRequest(url, {
    headers: {
      'X-API-Key': apiKey,
    },
  });

  if (!result.ok) {
    if (result.status === 404) {
      // Not found is ok for testing
      return { ...result, ok: true, errorReason: null };
    }
    throw new Error(`Resolve failed: ${result.errorReason}`);
  }

  if (verbose) console.log(`  ✓ Resolve OK (${result.ms}ms)`);

  return result;
}

/**
 * Generate test agent card
 */
function generateTestCard(index) {
  const urn = `urn:ossp-agi:agent:smoke-test-${index}`;
  
  const card = {
    id: `smoke-test-${index}`,
    name: `Smoke Test Agent ${index}`,
    capabilities: {
      tools: [
        {
          name: 'test-tool',
          urn: `urn:ossp-agi:tool:test-${index}`,
        },
      ],
    },
    communication: {
      protocols: ['http'],
    },
    authorization: {
      required: false,
    },
  };

  // Minimal signature (won't verify, but registry accepts it in non-enforced mode)
  const sig = {
    spec: 'identity-access.signing.v1',
    protected: Buffer.from(JSON.stringify({ alg: 'EdDSA', kid: 'test-key' })).toString('base64url'),
    payload: Buffer.from(JSON.stringify(card)).toString('base64url'),
    signature: 'fake-signature-for-testing',
    hash: {
      alg: 'sha256',
      value: 'fake-hash',
    },
  };

  const provenance = createEnvelope(
    'application/vnd.in-toto+json',
    createProvenancePayload({
      builderId: 'registry-smoke-suite',
      commit: `smoke-${index}-${Date.now()}`,
      materials: [{ uri: urn }],
      buildTool: 'registry-http-smoke',
    }),
    { key: DSSE_PRIVATE_KEY, alg: 'Ed25519', keyid: 'registry-smoke-key' },
  );

  return { urn, card, sig, provenance };
}

/**
 * Run smoke tests
 */
async function runSmokeTests(options) {
  const { baseUrl, apiKey, samples, verbose } = options;
  const sessionId = `registry-smoke-${Date.now()}`;
  const metrics = [];

  console.log('=== Registry HTTP Smoke Tests ===');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Samples per endpoint: ${samples}`);

  // Test health (single call)
  console.log('\n1. Testing GET /health...');
  try {
    const result = await testHealth(baseUrl, verbose);
    metrics.push({
      ts: new Date().toISOString(),
      sessionId,
      tool: 'registry',
      step: 'health',
      ms: result.ms,
      ok: result.ok,
      ...(result.errorReason && { errorReason: result.errorReason }),
    });
  } catch (error) {
    console.error(`  ✗ Health check failed: ${error.message}`);
    throw error;
  }

  // Test OpenAPI (single call)
  console.log('\n2. Testing GET /openapi.json...');
  try {
    const result = await testOpenAPI(baseUrl, verbose);
    metrics.push({
      ts: new Date().toISOString(),
      sessionId,
      tool: 'registry',
      step: 'openapi',
      ms: result.ms,
      ok: result.ok,
      ...(result.errorReason && { errorReason: result.errorReason }),
    });
  } catch (error) {
    console.error(`  ✗ OpenAPI fetch failed: ${error.message}`);
    throw error;
  }

  // Test PUT /v1/registry/:urn (samples)
  console.log(`\n3. Testing PUT /v1/registry/:urn (${samples} samples)...`);
  let putSuccess = 0;
  for (let i = 0; i < samples; i++) {
    const { urn, card, sig, provenance } = generateTestCard(i);
    try {
      const result = await testRegistryPut(baseUrl, apiKey, urn, card, sig, provenance, false);
      metrics.push({
        ts: new Date().toISOString(),
        sessionId,
        tool: 'registry',
        step: 'registry_put',
        ms: result.ms,
        ok: result.ok,
        ...(result.errorReason && { errorReason: result.errorReason }),
      });
      if (result.ok) putSuccess++;
    } catch (error) {
      metrics.push({
        ts: new Date().toISOString(),
        sessionId,
        tool: 'registry',
        step: 'registry_put',
        ms: 0,
        ok: false,
        errorReason: error.message,
      });
    }
  }
  console.log(`  ✓ PUT completed: ${putSuccess}/${samples} successful`);

  // Test GET /v1/registry/:urn (samples)
  console.log(`\n4. Testing GET /v1/registry/:urn (${samples} samples)...`);
  let getSuccess = 0;
  for (let i = 0; i < samples; i++) {
    const { urn } = generateTestCard(i);
    try {
      const result = await testRegistryGet(baseUrl, apiKey, urn, false);
      metrics.push({
        ts: new Date().toISOString(),
        sessionId,
        tool: 'registry',
        step: 'registry_get',
        ms: result.ms,
        ok: result.ok,
        ...(result.errorReason && { errorReason: result.errorReason }),
      });
      if (result.ok) getSuccess++;
    } catch (error) {
      metrics.push({
        ts: new Date().toISOString(),
        sessionId,
        tool: 'registry',
        step: 'registry_get',
        ms: 0,
        ok: false,
        errorReason: error.message,
      });
    }
  }
  console.log(`  ✓ GET completed: ${getSuccess}/${samples} successful`);

  // Test GET /v1/resolve (samples)
  console.log(`\n5. Testing GET /v1/resolve (${samples} samples)...`);
  let resolveSuccess = 0;
  for (let i = 0; i < samples; i++) {
    const { urn } = generateTestCard(i);
    try {
      const result = await testResolve(baseUrl, apiKey, urn, false);
      metrics.push({
        ts: new Date().toISOString(),
        sessionId,
        tool: 'registry',
        step: 'resolve',
        ms: result.ms,
        ok: result.ok,
        ...(result.errorReason && { errorReason: result.errorReason }),
      });
      if (result.ok) resolveSuccess++;
    } catch (error) {
      metrics.push({
        ts: new Date().toISOString(),
        sessionId,
        tool: 'registry',
        step: 'resolve',
        ms: 0,
        ok: false,
        errorReason: error.message,
      });
    }
  }
  console.log(`  ✓ Resolve completed: ${resolveSuccess}/${samples} successful`);

  return { metrics, sessionId };
}

/**
 * Main execution
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return 0;
  }

  if (!args.apiKey || args.apiKey.length === 0) {
    console.error(
      'Missing API key. Provide --api-key <key> or set REGISTRY_API_KEY before running the smoke tests.',
    );
    return 1;
  }

  try {
    const { metrics, sessionId } = await runSmokeTests(args);

    // Write output if specified
    if (args.output) {
      await mkdir(dirname(args.output), { recursive: true });
      const lines = metrics.map(m => JSON.stringify(m)).join('\n');
      await writeFile(args.output, lines + '\n', 'utf8');
      console.log(`\n✓ Metrics written to: ${args.output}`);
    }

    // Summary
    const successCount = metrics.filter(m => m.ok).length;
    const errorCount = metrics.filter(m => !m.ok).length;

    console.log('\n=== Summary ===');
    console.log(`Session: ${sessionId}`);
    console.log(`Total requests: ${metrics.length}`);
    console.log(`Success: ${successCount}`);
    console.log(`Errors: ${errorCount}`);

    if (errorCount > 0) {
      console.log('\n⚠️  Some requests failed');
      return 1;
    }

    console.log('\n✅ All smoke tests passed');
    return 0;
  } catch (error) {
    console.error('\n❌ Smoke tests failed:', error.message);
    return 1;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(code => process.exit(code))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { runSmokeTests, makeRequest };
