#!/usr/bin/env node

/**
 * Performance Collector
 * 
 * Ingests real WSAP & Registry latency logs from various sources,
 * aggregates them, and publishes unified performance artifacts.
 * 
 * Usage:
 *   node scripts/perf/collect.mjs [options]
 * 
 * Options:
 *   --sources <dir1,dir2,...>  Comma-separated source directories (default: artifacts/perf)
 *   --output <path>            Output JSONL path (default: artifacts/perf/latest.jsonl)
 *   --session <id>             Filter by session ID (optional)
 *   --since <iso-date>         Only include entries after this timestamp (optional)
 *   --tools <tool1,tool2>      Filter by tool names (optional)
 *   --verbose                  Enable verbose logging
 *   --help                     Show this help
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../..');

// Default configuration
const DEFAULT_SOURCE_CANDIDATES = [
  'artifacts/perf',
  'app/artifacts/perf',
  'app/artifacts/wsap',
  process.env.OSSP_LOG_ROOT,
];
const DEFAULT_SOURCES = DEFAULT_SOURCE_CANDIDATES.filter(Boolean);
const DEFAULT_OUTPUT = 'artifacts/perf/latest.jsonl';

function normalizePath(input) {
  if (!input) {
    return null;
  }
  return isAbsolute(input) ? input : resolve(PROJECT_ROOT, input);
}

/**
 * Parse command line arguments
 */
function parseArgs(argv) {
  const args = {
    sources: DEFAULT_SOURCES,
    output: DEFAULT_OUTPUT,
    session: null,
    since: null,
    tools: null,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--sources':
        args.sources = argv[++i]?.split(',').map(s => s.trim()) || DEFAULT_SOURCES;
        break;
      case '--output':
        args.output = argv[++i] || DEFAULT_OUTPUT;
        break;
      case '--session':
        args.session = argv[++i];
        break;
      case '--since':
        args.since = argv[++i];
        break;
      case '--tools':
        args.tools = argv[++i]?.split(',').map(t => t.trim());
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
Performance Collector - Ingests WSAP & Registry latency logs

Usage:
  node scripts/perf/collect.mjs [options]

Options:
  --sources <dir1,dir2,...>  Comma-separated source directories (default: ${DEFAULT_SOURCES.join(',')})
  --output <path>            Output JSONL path (default: ${DEFAULT_OUTPUT})
  --session <id>             Filter by session ID (optional)
  --since <iso-date>         Only include entries after this timestamp (optional)
  --tools <tool1,tool2>      Filter by tool names (optional, e.g., wsap,registry)
  --verbose                  Enable verbose logging
  --help                     Show this help

Examples:
  # Collect all performance logs
  node scripts/perf/collect.mjs

  # Collect only WSAP logs from last hour
  node scripts/perf/collect.mjs --tools wsap --since 2025-10-20T12:00:00Z

  # Collect specific session
  node scripts/perf/collect.mjs --session wsap-20251020120000
`);
}

/**
 * Recursively find all .jsonl files in a directory
 */
async function findJsonlFiles(dir, results = []) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        await findJsonlFiles(fullPath, results);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        results.push(fullPath);
      }
    }
  } catch (error) {
    // Silently skip directories that don't exist or can't be read
    if (error.code !== 'ENOENT' && error.code !== 'EACCES') {
      throw error;
    }
  }
  
  return results;
}

/**
 * Parse JSONL file and extract entries
 */
async function parseJsonlFile(filePath, filters, verbose) {
  const entries = [];
  
  try {
    const content = await readFile(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        
        // Apply filters
        if (filters.session && entry.sessionId !== filters.session) {
          continue;
        }
        
        if (filters.since) {
          const entrySince = new Date(entry.ts);
          const filterSince = new Date(filters.since);
          if (entrySince < filterSince) {
            continue;
          }
        }
        
        if (filters.tools && !filters.tools.includes(entry.tool)) {
          continue;
        }
        
        // Validate required fields
        if (entry.ts && entry.sessionId && entry.tool && entry.step && 
            typeof entry.ms === 'number' && typeof entry.ok === 'boolean') {
          entries.push(entry);
        } else if (verbose) {
          console.warn(`Skipping invalid entry in ${filePath}: missing required fields`);
        }
      } catch (parseError) {
        if (verbose) {
          console.warn(`Skipping invalid JSON line in ${filePath}: ${parseError.message}`);
        }
      }
    }
  } catch (error) {
    if (verbose) {
      console.warn(`Could not read file ${filePath}: ${error.message}`);
    }
  }
  
  return entries;
}

/**
 * Collect performance entries from all sources
 */
async function collectEntries(sources, filters, verbose, ignorePaths = []) {
  const allEntries = [];
  const ignoreSet = new Set(
    ignorePaths
      .map(normalizePath)
      .filter(Boolean),
  );
  const stats = {
    filesScanned: 0,
    entriesFound: 0,
    sourcesScanned: sources.length,
    filesIgnored: 0,
  };
  
  for (const source of sources) {
    const sourcePath = normalizePath(source);
    if (!sourcePath) {
      continue;
    }
    
    if (verbose) {
      console.log(`Scanning source: ${sourcePath}`);
    }
    
    const jsonlFiles = await findJsonlFiles(sourcePath);
    const usableFiles = [];
    let ignoredForSource = 0;
    for (const file of jsonlFiles) {
      if (ignoreSet.has(file)) {
        ignoredForSource += 1;
        continue;
      }
      usableFiles.push(file);
    }
    stats.filesIgnored += ignoredForSource;
    stats.filesScanned += usableFiles.length;
    
    if (verbose) {
      console.log(`  Found ${usableFiles.length} JSONL files`);
      if (ignoredForSource > 0) {
        console.log(`  Ignored ${ignoredForSource} file(s) (collector output)`);
      }
    }
    
    for (const file of usableFiles) {
      const entries = await parseJsonlFile(file, filters, verbose);
      allEntries.push(...entries);
      
      if (verbose && entries.length > 0) {
        console.log(`  Collected ${entries.length} entries from ${file}`);
      }
    }
  }
  
  stats.entriesFound = allEntries.length;
  return { entries: allEntries, stats };
}

/**
 * Sort entries by timestamp
 */
function sortEntries(entries) {
  return entries.sort((a, b) => {
    const aTime = new Date(a.ts).getTime();
    const bTime = new Date(b.ts).getTime();
    return aTime - bTime;
  });
}

function dedupeEntries(entries) {
  const seen = new Set();
  const deduped = [];

  for (const entry of entries) {
    const key = [
      entry.ts,
      entry.sessionId,
      entry.tool,
      entry.step,
      entry.ms,
      entry.ok,
      entry.err ?? '',
    ].join('|');

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(entry);
    }
  }

  return deduped;
}

/**
 * Write entries to output file
 */
async function writeOutput(entries, outputPath, verbose) {
  const absOutputPath = resolve(PROJECT_ROOT, outputPath);
  const outputDir = dirname(absOutputPath);
  
  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });
  
  // Write JSONL
  const lines = entries.map(entry => JSON.stringify(entry)).join('\n');
  await writeFile(absOutputPath, lines + '\n', 'utf8');
  
  if (verbose) {
    console.log(`Wrote ${entries.length} entries to ${absOutputPath}`);
  }
  
  return absOutputPath;
}

/**
 * Generate collection summary
 */
function generateSummary(entries, stats) {
  const summary = {
    totalEntries: entries.length,
    filesScanned: stats.filesScanned,
    sourcesScanned: stats.sourcesScanned,
     filesIgnored: stats.filesIgnored ?? 0,
    timeRange: {
      earliest: null,
      latest: null,
    },
    byTool: {},
    bySession: {},
  };
  
  if (entries.length === 0) {
    return summary;
  }
  
  const timestamps = entries.map(e => new Date(e.ts).getTime());
  summary.timeRange.earliest = new Date(Math.min(...timestamps)).toISOString();
  summary.timeRange.latest = new Date(Math.max(...timestamps)).toISOString();
  
  for (const entry of entries) {
    // Count by tool
    summary.byTool[entry.tool] = (summary.byTool[entry.tool] || 0) + 1;
    
    // Count by session
    summary.bySession[entry.sessionId] = (summary.bySession[entry.sessionId] || 0) + 1;
  }
  
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
  
  if (args.verbose) {
    console.log('Performance Collector starting...');
    console.log('Configuration:', {
      sources: args.sources,
      output: args.output,
      filters: {
        session: args.session || 'none',
        since: args.since || 'none',
        tools: args.tools?.join(',') || 'all',
      },
    });
  }
  
  const filters = {
    session: args.session,
    since: args.since,
    tools: args.tools,
  };
  
  // Collect entries
  const outputAbsPath = normalizePath(args.output);
  const { entries, stats } = await collectEntries(
    args.sources,
    filters,
    args.verbose,
    outputAbsPath ? [outputAbsPath] : [],
  );
  
  if (entries.length === 0) {
    console.warn('No performance entries found matching filters.');
    return 1;
  }

  const uniqueEntries = dedupeEntries(entries);
  if (args.verbose && uniqueEntries.length !== entries.length) {
    console.log(`Removed ${entries.length - uniqueEntries.length} duplicate entries`);
  }
  stats.entriesFound = uniqueEntries.length;
  
  // Sort by timestamp
  const sorted = sortEntries(uniqueEntries);
  
  // Write output
  const outputPath = await writeOutput(sorted, args.output, args.verbose);
  
  // Generate and print summary
  const summary = generateSummary(sorted, stats);
  
  console.log('\n=== Performance Collection Summary ===');
  console.log(`Total entries: ${summary.totalEntries}`);
  console.log(`Files scanned: ${summary.filesScanned}`);
  console.log(`Sources scanned: ${summary.sourcesScanned}`);
  if (summary.filesIgnored > 0) {
    console.log(`Files ignored: ${summary.filesIgnored}`);
  }
  
  if (summary.timeRange.earliest) {
    console.log(`Time range: ${summary.timeRange.earliest} to ${summary.timeRange.latest}`);
  }
  
  console.log('\nBy tool:');
  for (const [tool, count] of Object.entries(summary.byTool).sort()) {
    console.log(`  ${tool}: ${count}`);
  }
  
  console.log('\nBy session (top 10):');
  const topSessions = Object.entries(summary.bySession)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [session, count] of topSessions) {
    console.log(`  ${session}: ${count}`);
  }
  
  console.log(`\nOutput written to: ${outputPath}`);
  
  return 0;
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

export { collectEntries, parseJsonlFile, generateSummary };
