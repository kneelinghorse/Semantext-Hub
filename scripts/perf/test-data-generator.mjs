#!/usr/bin/env node

/**
 * Test Data Generator for Performance Validation
 * 
 * Generates test JSONL data with various scenarios:
 * - ok:true entries
 * - ok:false entries with errorReason
 * - Entries without ok field (unknown)
 * 
 * Usage:
 *   node scripts/perf/test-data-generator.mjs --output <file>
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Generate test performance entries
 */
function generateTestData(options = {}) {
  const {
    successCount = 20,
    errorCount = 5,
    unknownCount = 3,
    tool = 'registry',
  } = options;

  const entries = [];
  const sessionId = `test-${Date.now()}`;
  const baseTime = Date.now();

  // Generate success entries
  for (let i = 0; i < successCount; i++) {
    const steps = ['health', 'openapi', 'registry_get', 'registry_put', 'resolve'];
    const step = steps[i % steps.length];
    
    // Generate realistic latencies
    let baseLatency;
    switch (step) {
      case 'health':
        baseLatency = 50;
        break;
      case 'openapi':
        baseLatency = 75;
        break;
      case 'registry_get':
        baseLatency = 100;
        break;
      case 'registry_put':
        baseLatency = 120;
        break;
      case 'resolve':
        baseLatency = 200;
        break;
      default:
        baseLatency = 100;
    }

    const jitter = Math.random() * 20 - 10; // ±10ms jitter
    const ms = Math.max(1, baseLatency + jitter);

    entries.push({
      ts: new Date(baseTime + i * 100).toISOString(),
      sessionId,
      tool,
      step,
      ms: Math.round(ms * 100) / 100,
      ok: true,
    });
  }

  // Generate error entries
  for (let i = 0; i < errorCount; i++) {
    const steps = ['registry_get', 'registry_put', 'resolve'];
    const step = steps[i % steps.length];
    const errorReasons = ['timeout', 'unauthorized', 'not_found', 'rate_limited', 'internal_error'];
    const errorReason = errorReasons[i % errorReasons.length];

    entries.push({
      ts: new Date(baseTime + (successCount + i) * 100).toISOString(),
      sessionId,
      tool,
      step,
      ms: Math.random() * 1000 + 500, // Errors typically take longer
      ok: false,
      errorReason,
    });
  }

  // Generate unknown entries (missing ok field)
  for (let i = 0; i < unknownCount; i++) {
    const steps = ['health', 'registry_get', 'resolve'];
    const step = steps[i % steps.length];

    entries.push({
      ts: new Date(baseTime + (successCount + errorCount + i) * 100).toISOString(),
      sessionId,
      tool,
      step,
      ms: Math.random() * 200 + 50,
      // Intentionally no 'ok' field
    });
  }

  return entries;
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  let output = 'artifacts/perf/test-data.jsonl';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output') {
      output = args[++i];
    }
  }

  console.log('Generating test data...');

  const entries = generateTestData({
    successCount: 20,
    errorCount: 5,
    unknownCount: 3,
  });

  await mkdir(dirname(output), { recursive: true });
  const lines = entries.map(e => JSON.stringify(e)).join('\n');
  await writeFile(output, lines + '\n', 'utf8');

  console.log(`Generated ${entries.length} test entries:`);
  console.log(`  Success (ok:true): ${entries.filter(e => e.ok === true).length}`);
  console.log(`  Error (ok:false): ${entries.filter(e => e.ok === false).length}`);
  console.log(`  Unknown (no ok): ${entries.filter(e => !('ok' in e)).length}`);
  console.log(`\nWritten to: ${output}`);

  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(code => process.exit(code))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { generateTestData };



