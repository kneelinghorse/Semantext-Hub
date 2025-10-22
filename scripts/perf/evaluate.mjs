#!/usr/bin/env node

/**
 * Performance Evaluator - Enforces performance budgets
 * 
 * This script compares actual performance against budgets:
 * - Loads performance summary (from summarize.mjs)
 * - Compares against budgets (from perf-budgets.json)
 * - Exits non-zero on budget violations with clear diffs
 * - Requires minimum sample count per route
 * 
 * Usage:
 *   node scripts/perf/evaluate.mjs --input <file> --budgets <file> [options]
 * 
 * Options:
 *   --input <path>         Input JSONL file (required)
 *   --budgets <path>       Budgets JSON file (required)
 *   --tool <name>          Filter by tool (optional)
 *   --step <name>          Filter by step (optional)
 *   --min-samples <n>      Minimum samples required (default: 50)
 *   --fail-on-insufficient Fail if insufficient samples (default: false)
 *   --verbose              Enable verbose logging
 *   --help                 Show this help
 */

import { readFile } from 'node:fs/promises';
import { loadEntries, summarizeEntries } from './summarize.mjs';

/**
 * Parse command line arguments
 */
function parseArgs(argv) {
  const args = {
    input: null,
    budgets: null,
    tool: null,
    step: null,
    minSamples: 50,
    failOnInsufficient: false,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--input':
        args.input = argv[++i];
        break;
      case '--budgets':
        args.budgets = argv[++i];
        break;
      case '--tool':
        args.tool = argv[++i];
        break;
      case '--step':
        args.step = argv[++i];
        break;
      case '--min-samples':
        args.minSamples = parseInt(argv[++i], 10) || 50;
        break;
      case '--fail-on-insufficient':
        args.failOnInsufficient = true;
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

  return args;
}

/**
 * Print help text
 */
function printHelp() {
  console.log(`
Performance Evaluator - Enforces performance budgets

Usage:
  node scripts/perf/evaluate.mjs --input <file> --budgets <file> [options]

Options:
  --input <path>         Input JSONL file (required)
  --budgets <path>       Budgets JSON file (required)
  --tool <name>          Filter by tool (optional)
  --step <name>          Filter by step (optional)
  --min-samples <n>      Minimum samples required (default: 50)
  --fail-on-insufficient Fail if insufficient samples (default: false)
  --verbose              Enable verbose logging
  --help                 Show this help

Exit Codes:
  0 - All budgets met
  1 - Fatal error
  2 - Insufficient samples
  3 - Budget violations

Examples:
  # Evaluate all routes
  node scripts/perf/evaluate.mjs --input latest.jsonl --budgets app/config/perf-budgets.json

  # Evaluate specific tool with minimum samples
  node scripts/perf/evaluate.mjs --input latest.jsonl --budgets budgets.json --tool registry --min-samples 100
`);
}

/**
 * Load budgets from JSON file
 */
async function loadBudgets(budgetsPath) {
  const content = await readFile(budgetsPath, 'utf8');
  const budgets = JSON.parse(content);

  if (!budgets.budgets || typeof budgets.budgets !== 'object') {
    throw new Error('Budgets file must contain a "budgets" object.');
  }

  return budgets;
}

/**
 * Find budget for tool/step
 */
function findBudget(budgets, tool, step) {
  if (!budgets.budgets[tool]) {
    return null;
  }

  if (!budgets.budgets[tool][step]) {
    return null;
  }

  return budgets.budgets[tool][step];
}

/**
 * Evaluate a single tool/step against budget
 */
function evaluateToolStep(item, budget, minSamples) {
  const result = {
    tool: item.tool,
    step: item.step,
    samples: item.stats.count,
    minSamples,
    hasBudget: !!budget,
    sufficientSamples: item.stats.count >= minSamples,
    violations: [],
    passed: true,
  };

  // Check sample count
  if (!result.sufficientSamples) {
    result.passed = false;
    result.violations.push({
      metric: 'samples',
      required: minSamples,
      actual: item.stats.count,
      message: `Insufficient samples: ${item.stats.count} < ${minSamples}`,
    });
    return result;
  }

  // No budget defined - skip
  if (!budget) {
    result.passed = true;
    return result;
  }

  // Check avg budget
  if (typeof budget.avg === 'number') {
    const actual = item.stats.avg;
    const limit = budget.avg;
    const diff = actual - limit;

    result.avgBudget = limit;
    result.avgActual = actual;

    if (actual > limit) {
      result.passed = false;
      result.violations.push({
        metric: 'avg',
        limit,
        actual,
        diff: Math.round(diff * 100) / 100,
        percentage: Math.round((diff / limit) * 100),
        message: `avg ${actual}ms > ${limit}ms (+${Math.round(diff * 100) / 100}ms, +${Math.round((diff / limit) * 100)}%)`,
      });
    }
  }

  // Check p95 budget
  if (typeof budget.p95 === 'number') {
    const actual = item.stats.p95;
    const limit = budget.p95;
    const diff = actual - limit;

    result.p95Budget = limit;
    result.p95Actual = actual;

    if (actual > limit) {
      result.passed = false;
      result.violations.push({
        metric: 'p95',
        limit,
        actual,
        diff: Math.round(diff * 100) / 100,
        percentage: Math.round((diff / limit) * 100),
        message: `p95 ${actual}ms > ${limit}ms (+${Math.round(diff * 100) / 100}ms, +${Math.round((diff / limit) * 100)}%)`,
      });
    }
  }

  return result;
}

/**
 * Evaluate all tool/step combinations
 */
function evaluateAll(summary, budgets, options = {}) {
  const { minSamples = 50 } = options;
  
  const results = {
    totalChecked: 0,
    passed: 0,
    failed: 0,
    insufficientSamples: 0,
    noBudget: 0,
    violations: [],
    insufficientItems: [],
    evaluations: [],
  };

  for (const item of summary.byToolStep) {
    const budget = findBudget(budgets, item.tool, item.step);
    const evaluation = evaluateToolStep(item, budget, minSamples);

    results.totalChecked++;
    results.evaluations.push(evaluation);

    if (!evaluation.hasBudget) {
      results.noBudget++;
      continue;
    }

    if (!evaluation.sufficientSamples) {
      results.insufficientSamples++;
      results.insufficientItems.push(evaluation);
      continue;
    }

    if (evaluation.passed) {
      results.passed++;
    } else {
      results.failed++;
      results.violations.push(evaluation);
    }
  }

  return results;
}

/**
 * Print evaluation results
 */
function printResults(results, verbose = false) {
  console.log('\n=== Performance Budget Evaluation ===');
  console.log(`Total checked: ${results.totalChecked}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Insufficient samples: ${results.insufficientSamples}`);
  console.log(`No budget defined: ${results.noBudget}`);

  // Print insufficient samples
  if (results.insufficientItems.length > 0) {
    console.log('\n⚠️  Insufficient Samples:');
    for (const item of results.insufficientItems) {
      console.log(`  ${item.tool}/${item.step}: ${item.samples} < ${item.minSamples} required`);
    }
  }

  // Print violations
  if (results.violations.length > 0) {
    console.log('\n❌ Budget Violations:');
    for (const item of results.violations) {
      console.log(`\n  ${item.tool}/${item.step}:`);
      console.log(`    Samples: ${item.samples}`);
      for (const violation of item.violations) {
        console.log(`    ${violation.message}`);
      }
    }
  }

  // Print passed items if verbose
  if (verbose && results.passed > 0) {
    console.log('\n✅ Passed:');
    for (const item of results.evaluations) {
      if (item.passed && item.hasBudget && item.sufficientSamples) {
        const avgDiff = item.avgActual && item.avgBudget ? item.avgBudget - item.avgActual : null;
        const p95Diff = item.p95Actual && item.p95Budget ? item.p95Budget - item.p95Actual : null;
        
        console.log(`  ${item.tool}/${item.step}:`);
        if (avgDiff !== null) {
          console.log(`    avg: ${item.avgActual}ms ≤ ${item.avgBudget}ms (${Math.round(avgDiff * 100) / 100}ms headroom)`);
        }
        if (p95Diff !== null) {
          console.log(`    p95: ${item.p95Actual}ms ≤ ${item.p95Budget}ms (${Math.round(p95Diff * 100) / 100}ms headroom)`);
        }
      }
    }
  }
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

  if (!args.input || !args.budgets) {
    console.error('Error: --input and --budgets are required.');
    printHelp();
    return 1;
  }

  if (args.verbose) {
    console.log('Performance Evaluator starting...');
    console.log(`Input: ${args.input}`);
    console.log(`Budgets: ${args.budgets}`);
    console.log(`Minimum samples: ${args.minSamples}`);
  }

  try {
    // Load budgets
    const budgets = await loadBudgets(args.budgets);

    // Load and summarize entries
    const entries = await loadEntries(args.input, {
      tool: args.tool,
      step: args.step,
    });

    const summary = summarizeEntries(entries, {
      minSamples: 1, // Don't filter here, we'll check in evaluation
    });

    // Evaluate
    const results = evaluateAll(summary, budgets, {
      minSamples: args.minSamples,
    });

    // Print results
    printResults(results, args.verbose);

    // Determine exit code
    if (results.failed > 0) {
      console.log('\n❌ Budget evaluation FAILED');
      return 3;
    }

    if (results.insufficientSamples > 0 && args.failOnInsufficient) {
      console.log('\n⚠️  Budget evaluation INCOMPLETE (insufficient samples)');
      return 2;
    }

    console.log('\n✅ Budget evaluation PASSED');
    return 0;
  } catch (error) {
    console.error('Fatal error:', error.message);
    if (args.verbose) {
      console.error(error.stack);
    }
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

export { loadBudgets, findBudget, evaluateToolStep, evaluateAll };



