#!/usr/bin/env node

/**
 * Performance Emit - Ensures perf records have ok/errorReason fields
 * 
 * This script validates and normalizes performance log entries:
 * - Ensures every entry has ok:true|false
 * - Adds errorReason when ok:false
 * - Treats missing ok as unknown (for filtering)
 * 
 * Usage:
 *   node scripts/perf/emit.mjs --input <file> --output <file> [options]
 * 
 * Options:
 *   --input <path>         Input JSONL file (required)
 *   --output <path>        Output JSONL file (required)
 *   --fill-missing-ok      Fill missing ok fields with true (default: false)
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
    fillMissingOk: false,
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
      case '--fill-missing-ok':
        args.fillMissingOk = true;
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
Performance Emit - Ensures perf records have ok/errorReason fields

Usage:
  node scripts/perf/emit.mjs --input <file> --output <file> [options]

Options:
  --input <path>         Input JSONL file (required)
  --output <path>        Output JSONL file (required)
  --fill-missing-ok      Fill missing ok fields with true (default: false)
  --verbose              Enable verbose logging
  --help                 Show this help

Examples:
  # Normalize performance logs
  node scripts/perf/emit.mjs --input raw.jsonl --output normalized.jsonl

  # Fill missing ok fields
  node scripts/perf/emit.mjs --input raw.jsonl --output normalized.jsonl --fill-missing-ok
`);
}

/**
 * Normalize a performance entry
 */
function normalizeEntry(entry, options = {}) {
  const normalized = { ...entry };
  const issues = [];

  // Check if ok field exists
  if (typeof entry.ok !== 'boolean') {
    if (options.fillMissingOk) {
      normalized.ok = true;
      issues.push('filled_missing_ok');
    } else {
      // Mark as unknown - this will be handled by summarizer
      normalized._status = 'unknown';
      issues.push('missing_ok_field');
    }
  }

  // If ok is false, ensure errorReason exists
  if (normalized.ok === false && !entry.errorReason && !entry.err) {
    if (entry.error) {
      normalized.errorReason = String(entry.error);
      issues.push('added_error_reason_from_error');
    } else if (entry.err) {
      normalized.errorReason = String(entry.err);
      issues.push('added_error_reason_from_err');
    } else {
      normalized.errorReason = 'unknown_error';
      issues.push('added_default_error_reason');
    }
  }

  // Normalize errorReason from err field
  if (entry.err && !entry.errorReason) {
    normalized.errorReason = String(entry.err);
    delete normalized.err;
    issues.push('normalized_err_to_errorReason');
  }

  // Validate required fields
  const required = ['ts', 'sessionId', 'tool', 'step', 'ms'];
  for (const field of required) {
    if (!(field in entry)) {
      issues.push(`missing_required_field_${field}`);
    }
  }

  if (issues.length > 0) {
    normalized._normalization_issues = issues;
  }

  return normalized;
}

/**
 * Process JSONL file
 */
async function processFile(inputPath, outputPath, options = {}) {
  const stats = {
    totalLines: 0,
    validEntries: 0,
    normalizedEntries: 0,
    unknownEntries: 0,
    errors: 0,
    issues: {},
  };

  // Read input file
  const content = await readFile(inputPath, 'utf8');
  const lines = content.split('\n').filter(line => line.trim());
  stats.totalLines = lines.length;

  const normalized = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const normalizedEntry = normalizeEntry(entry, options);

      if (normalizedEntry._status === 'unknown') {
        stats.unknownEntries++;
      } else {
        stats.validEntries++;
      }

      if (normalizedEntry._normalization_issues) {
        stats.normalizedEntries++;
        for (const issue of normalizedEntry._normalization_issues) {
          stats.issues[issue] = (stats.issues[issue] || 0) + 1;
        }
      }

      normalized.push(normalizedEntry);
    } catch (error) {
      stats.errors++;
      if (options.verbose) {
        console.warn(`Skipping invalid JSON line: ${error.message}`);
      }
    }
  }

  // Ensure output directory exists
  await mkdir(dirname(outputPath), { recursive: true });

  // Write output file
  const outputLines = normalized.map(entry => JSON.stringify(entry)).join('\n');
  await writeFile(outputPath, outputLines + '\n', 'utf8');

  return { stats, normalized };
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

  if (!args.input || !args.output) {
    console.error('Error: --input and --output are required.');
    printHelp();
    return 1;
  }

  if (args.verbose) {
    console.log('Performance Emit starting...');
    console.log(`Input: ${args.input}`);
    console.log(`Output: ${args.output}`);
    console.log(`Fill missing ok: ${args.fillMissingOk}`);
  }

  try {
    const { stats } = await processFile(args.input, args.output, {
      fillMissingOk: args.fillMissingOk,
      verbose: args.verbose,
    });

    console.log('\n=== Performance Emit Summary ===');
    console.log(`Total lines: ${stats.totalLines}`);
    console.log(`Valid entries: ${stats.validEntries}`);
    console.log(`Unknown entries: ${stats.unknownEntries}`);
    console.log(`Normalized entries: ${stats.normalizedEntries}`);
    console.log(`Parse errors: ${stats.errors}`);

    if (Object.keys(stats.issues).length > 0) {
      console.log('\nNormalization issues:');
      for (const [issue, count] of Object.entries(stats.issues).sort()) {
        console.log(`  ${issue}: ${count}`);
      }
    }

    console.log(`\nOutput written to: ${args.output}`);

    return stats.errors > 0 ? 1 : 0;
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

export { normalizeEntry, processFile };


