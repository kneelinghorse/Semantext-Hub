#!/usr/bin/env node

/**
 * Performance Summarizer - Computes percentiles with unknown classification
 * 
 * This script analyzes performance logs and computes statistics:
 * - Treats missing ok as unknown (excluded from calculations)
 * - Computes p5, p50, p95 percentiles
 * - Asserts monotonic percentiles: p95 ≥ p50 ≥ p5
 * - Groups by tool/step combinations
 * 
 * Usage:
 *   node scripts/perf/summarize.mjs --input <file> [options]
 * 
 * Options:
 *   --input <path>         Input JSONL file (required)
 *   --output <path>        Output JSON file (optional)
 *   --tool <name>          Filter by tool (optional)
 *   --step <name>          Filter by step (optional)
 *   --min-samples <n>      Minimum samples required (default: 1)
 *   --verbose              Enable verbose logging
 *   --help                 Show this help
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Parse command line arguments
 */
function parseArgs(argv) {
  const args = {
    input: null,
    output: null,
    tool: null,
    step: null,
    minSamples: 1,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--input':
        args.input = argv[++i];
        break;
      case '--output':
        args.output = argv[++i];
        break;
      case '--tool':
        args.tool = argv[++i];
        break;
      case '--step':
        args.step = argv[++i];
        break;
      case '--min-samples':
        args.minSamples = parseInt(argv[++i], 10) || 1;
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
Performance Summarizer - Computes percentiles with unknown classification

Usage:
  node scripts/perf/summarize.mjs --input <file> [options]

Options:
  --input <path>         Input JSONL file (required)
  --output <path>        Output JSON file (optional)
  --tool <name>          Filter by tool (optional)
  --step <name>          Filter by step (optional)
  --min-samples <n>      Minimum samples required (default: 1)
  --verbose              Enable verbose logging
  --help                 Show this help

Examples:
  # Summarize all performance logs
  node scripts/perf/summarize.mjs --input artifacts/perf/latest.jsonl

  # Filter by tool and save to file
  node scripts/perf/summarize.mjs --input latest.jsonl --tool registry --output summary.json

  # Require minimum samples
  node scripts/perf/summarize.mjs --input latest.jsonl --min-samples 50
`);
}

/**
 * Compute percentile from sorted array
 */
function percentile(sortedValues, p) {
  if (sortedValues.length === 0) {
    return null;
  }
  
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) {
    return sortedValues[lower];
  }

  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

/**
 * Compute statistics for a set of values
 */
function computeStats(values) {
  if (values.length === 0) {
    return {
      count: 0,
      min: null,
      max: null,
      avg: null,
      p5: null,
      p50: null,
      p95: null,
      monotonicValid: null,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, val) => acc + val, 0);
  const avg = sum / values.length;

  const p5 = percentile(sorted, 5);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);

  // Assert monotonic: p95 >= p50 >= p5
  const monotonicValid = p95 >= p50 && p50 >= p5;

  return {
    count: values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(avg * 100) / 100,
    p5: Math.round(p5 * 100) / 100,
    p50: Math.round(p50 * 100) / 100,
    p95: Math.round(p95 * 100) / 100,
    monotonicValid,
  };
}

/**
 * Classify entry status
 */
function classifyEntry(entry) {
  // Missing ok field = unknown
  if (typeof entry.ok !== 'boolean') {
    return 'unknown';
  }

  // ok:false = error
  if (entry.ok === false) {
    return 'error';
  }

  // ok:true = success
  return 'success';
}

/**
 * Load and classify entries from JSONL
 */
async function loadEntries(inputPath, filters = {}) {
  const content = await readFile(inputPath, 'utf8');
  const lines = content.split('\n').filter(line => line.trim());

  const entries = {
    all: [],
    success: [],
    error: [],
    unknown: [],
    byToolStep: new Map(),
  };

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // Apply filters
      if (filters.tool && entry.tool !== filters.tool) {
        continue;
      }
      if (filters.step && entry.step !== filters.step) {
        continue;
      }

      // Validate required fields
      if (!entry.ts || !entry.sessionId || !entry.tool || !entry.step || typeof entry.ms !== 'number') {
        continue;
      }

      const status = classifyEntry(entry);
      entries.all.push({ ...entry, _status: status });

      // Classify by status
      if (status === 'success') {
        entries.success.push(entry);
      } else if (status === 'error') {
        entries.error.push(entry);
      } else if (status === 'unknown') {
        entries.unknown.push(entry);
      }

      // Group by tool/step
      const key = `${entry.tool}/${entry.step}`;
      if (!entries.byToolStep.has(key)) {
        entries.byToolStep.set(key, {
          tool: entry.tool,
          step: entry.step,
          all: [],
          success: [],
          error: [],
          unknown: [],
        });
      }

      const group = entries.byToolStep.get(key);
      group.all.push(entry);
      if (status === 'success') {
        group.success.push(entry);
      } else if (status === 'error') {
        group.error.push(entry);
      } else if (status === 'unknown') {
        group.unknown.push(entry);
      }
    } catch (error) {
      // Skip invalid lines
    }
  }

  return entries;
}

/**
 * Summarize entries
 */
function summarizeEntries(entries, options = {}) {
  const { minSamples = 1 } = options;

  const summary = {
    total: {
      all: entries.all.length,
      success: entries.success.length,
      error: entries.error.length,
      unknown: entries.unknown.length,
    },
    byToolStep: [],
    monotonicViolations: [],
  };

  // Summarize each tool/step combination
  for (const [key, group] of entries.byToolStep.entries()) {
    const successValues = group.success.map(e => e.ms);
    const stats = computeStats(successValues);

    // Check minimum samples
    if (stats.count < minSamples) {
      continue;
    }

    const toolStepSummary = {
      tool: group.tool,
      step: group.step,
      key,
      counts: {
        all: group.all.length,
        success: group.success.length,
        error: group.error.length,
        unknown: group.unknown.length,
      },
      stats,
    };

    // Track monotonic violations
    if (stats.monotonicValid === false) {
      summary.monotonicViolations.push({
        tool: group.tool,
        step: group.step,
        p5: stats.p5,
        p50: stats.p50,
        p95: stats.p95,
        violation: `p95(${stats.p95}) < p50(${stats.p50}) or p50(${stats.p50}) < p5(${stats.p5})`,
      });
    }

    summary.byToolStep.push(toolStepSummary);
  }

  // Sort by tool/step
  summary.byToolStep.sort((a, b) => a.key.localeCompare(b.key));

  return summary;
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

  if (!args.input) {
    console.error('Error: --input is required.');
    printHelp();
    return 1;
  }

  if (args.verbose) {
    console.log('Performance Summarizer starting...');
    console.log(`Input: ${args.input}`);
    if (args.tool) console.log(`Filter tool: ${args.tool}`);
    if (args.step) console.log(`Filter step: ${args.step}`);
    console.log(`Minimum samples: ${args.minSamples}`);
  }

  try {
    const entries = await loadEntries(args.input, {
      tool: args.tool,
      step: args.step,
    });

    const summary = summarizeEntries(entries, {
      minSamples: args.minSamples,
    });

    // Write output if specified
    if (args.output) {
      await mkdir(dirname(args.output), { recursive: true });
      await writeFile(args.output, JSON.stringify(summary, null, 2) + '\n', 'utf8');
    }

    // Print summary
    console.log('\n=== Performance Summary ===');
    console.log(`Total entries: ${summary.total.all}`);
    console.log(`  Success: ${summary.total.success}`);
    console.log(`  Error: ${summary.total.error}`);
    console.log(`  Unknown: ${summary.total.unknown} (excluded from calculations)`);
    console.log(`\nTool/Step combinations: ${summary.byToolStep.length}`);

    if (summary.monotonicViolations.length > 0) {
      console.log(`\n⚠️  Monotonic violations detected: ${summary.monotonicViolations.length}`);
      for (const violation of summary.monotonicViolations) {
        console.log(`  ${violation.tool}/${violation.step}: ${violation.violation}`);
      }
    }

    console.log('\nBy Tool/Step:');
    for (const item of summary.byToolStep) {
      console.log(`\n  ${item.tool}/${item.step}:`);
      console.log(`    Samples: ${item.stats.count} (success: ${item.counts.success}, error: ${item.counts.error}, unknown: ${item.counts.unknown})`);
      console.log(`    Min: ${item.stats.min}ms, Max: ${item.stats.max}ms`);
      console.log(`    Avg: ${item.stats.avg}ms`);
      console.log(`    p5: ${item.stats.p5}ms, p50: ${item.stats.p50}ms, p95: ${item.stats.p95}ms`);
      console.log(`    Monotonic: ${item.stats.monotonicValid ? '✓' : '✗'}`);
    }

    if (args.output) {
      console.log(`\nOutput written to: ${args.output}`);
    }

    return summary.monotonicViolations.length > 0 ? 1 : 0;
  } catch (error) {
    console.error('Fatal error:', error.message);
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

export { classifyEntry, computeStats, percentile, loadEntries, summarizeEntries };



