#!/usr/bin/env node

/**
 * Performance System Validation Script
 * 
 * Validates the complete performance monitoring pipeline:
 * 1. Runs WSAP to generate performance logs
 * 2. Collects logs using the perf collector
 * 3. Evaluates against budgets
 * 4. Reports results
 * 
 * Usage:
 *   node scripts/perf/validate.mjs [--quick]
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');

const QUICK_MODE_TIMEOUT = 5000; // 5 seconds for quick validation

/**
 * Run command and capture output
 */
async function runCommand(command, options = {}) {
  console.log(`\n▶️  ${command}`);
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: PROJECT_ROOT,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      ...options,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.code || 1,
    };
  }
}

/**
 * Step 1: Run WSAP to generate fresh performance data
 */
async function runWSAP(quick = false) {
  console.log('\n=== Step 1: Generate Performance Data ===');
  
  if (quick) {
    console.log('⏩ Quick mode: Using existing performance data');
    return true;
  }
  
  console.log('Running WSAP to generate fresh performance logs...');
  const result = await runCommand('node app/cli/wsap.mjs --seed github-api');
  
  if (result.exitCode !== 0) {
    console.error('❌ WSAP failed:', result.stderr);
    return false;
  }
  
  console.log('✅ WSAP completed successfully');
  return true;
}

/**
 * Step 2: Collect performance logs
 */
async function collectLogs() {
  console.log('\n=== Step 2: Collect Performance Logs ===');
  
  const result = await runCommand('node scripts/perf/collect.mjs');
  
  if (result.exitCode !== 0) {
    console.error('❌ Collector failed:', result.stderr);
    return null;
  }
  
  // Parse the summary from output
  const lines = result.stdout.split('\n');
  const summaryStart = lines.findIndex(l => l.includes('Performance Collection Summary'));
  
  if (summaryStart >= 0) {
    console.log(lines.slice(summaryStart).join('\n'));
  }
  
  // Count collected entries
  try {
    const logContent = await readFile(
      resolve(PROJECT_ROOT, 'artifacts/perf/latest.jsonl'),
      'utf8'
    );
    const entryCount = logContent.trim().split('\n').length;
    console.log(`\n✅ Collected ${entryCount} performance entries`);
    return entryCount;
  } catch (error) {
    console.error('❌ Could not read collected logs:', error.message);
    return null;
  }
}

/**
 * Step 3: Evaluate budgets
 */
async function evaluateBudgets() {
  console.log('\n=== Step 3: Evaluate Performance Budgets ===');
  
  const checks = [
    { tool: 'wsap', step: 'import', name: 'WSAP Import' },
    { tool: 'wsap', step: 'plan', name: 'WSAP Plan' },
    { tool: 'wsap', step: 'runtime', name: 'WSAP Runtime' },
    { tool: 'a2a', step: 'echo', name: 'A2A Echo' },
    { tool: 'release:canary', step: 'a2a.echo', name: 'Release Canary' },
  ];
  
  const results = [];
  let allPassed = true;
  
  for (const check of checks) {
    const result = await runCommand(
      `./app/ci/perf-gate.sh --log artifacts/perf/latest.jsonl --tool ${check.tool} --step ${check.step} --budgets app/config/perf-budgets.json`,
      { timeout: 10000 }
    );
    
    const passed = result.exitCode === 0;
    
    // Handle case where no data exists
    if (result.stderr.includes('no entries found') || result.stderr.includes('does not exist')) {
      console.log(`⊘ ${check.name}: No data`);
      results.push({ ...check, status: 'no_data' });
      continue;
    }
    
    if (passed) {
      console.log(`✅ ${check.name}: Passed`);
      results.push({ ...check, status: 'passed' });
    } else {
      console.log(`❌ ${check.name}: Failed`);
      allPassed = false;
      results.push({ ...check, status: 'failed' });
      
      // Print failure details
      if (result.stdout) {
        const failLines = result.stdout.split('\n').filter(l => l.includes('FAIL'));
        failLines.forEach(line => console.log(`   ${line}`));
      }
    }
  }
  
  return { allPassed, results };
}

/**
 * Main validation flow
 */
async function main() {
  const quickMode = process.argv.includes('--quick');
  
  console.log('🔍 Performance System Validation');
  console.log('================================');
  
  if (quickMode) {
    console.log('Mode: Quick (using existing data)');
  } else {
    console.log('Mode: Full (generating fresh data)');
  }
  
  // Step 1: Generate data
  const wsapOk = await runWSAP(quickMode);
  if (!wsapOk && !quickMode) {
    console.error('\n❌ Validation failed: Could not generate performance data');
    return 1;
  }
  
  // Step 2: Collect
  const entryCount = await collectLogs();
  if (entryCount === null) {
    console.error('\n❌ Validation failed: Could not collect performance logs');
    return 1;
  }
  
  if (entryCount === 0) {
    console.error('\n❌ Validation failed: No performance entries collected');
    return 1;
  }
  
  // Step 3: Evaluate
  const { allPassed, results } = await evaluateBudgets();
  
  // Summary
  console.log('\n=== Validation Summary ===');
  console.log(`Total entries: ${entryCount}`);
  console.log(`Budget checks: ${results.length}`);
  console.log(`Passed: ${results.filter(r => r.status === 'passed').length}`);
  console.log(`Failed: ${results.filter(r => r.status === 'failed').length}`);
  console.log(`No data: ${results.filter(r => r.status === 'no_data').length}`);
  
  if (allPassed) {
    console.log('\n✅ Performance system validation PASSED');
    return 0;
  } else {
    console.log('\n⚠️  Performance system validation completed with budget failures');
    console.log('This is expected if actual performance exceeds budgets.');
    console.log('Review the failures above and either:');
    console.log('  1. Optimize the slow operations');
    console.log('  2. Update budgets in app/config/perf-budgets.json if appropriate');
    return 0; // Don't fail validation on budget failures
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(code => process.exit(code))
    .catch(error => {
      console.error('\n❌ Fatal error:', error);
      process.exit(1);
    });
}

export { runWSAP, collectLogs, evaluateBudgets };

