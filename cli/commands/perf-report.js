#!/usr/bin/env node

/**
 * Performance Report CLI Command - S22.2
 *
 * Enhanced performance reporting with table/JSON outputs showing p50/p95/p99 metrics.
 * Built on top of the shared perf.js infrastructure from S22.1.
 */

import { performance } from 'perf_hooks';
import { randomUUID } from 'crypto';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import chalk from 'chalk';
import { adapterTracing } from '../../utils/trace.js';
import {
  collectWorkspacePerfMetrics,
  percentile,
  DEFAULT_MAX_LOG_AGE_MS,
} from '../../src/metrics/perf.js';

const BUDGETS = {
  discovery: { p95: 1000 },
  mcp: { p95: 3000 },
};

const MS_PER_MINUTE = 60 * 1000;
const MAX_LOG_AGE_MS = DEFAULT_MAX_LOG_AGE_MS;
const MAX_LOG_AGE_MINUTES = Math.round(MAX_LOG_AGE_MS / MS_PER_MINUTE);

async function gatherLogMetadata(sourceLogs = []) {
  const now = Date.now();
  const annotated = await Promise.all(
    sourceLogs.map(async (source) => {
      if (!source?.absolute) {
        return {
          ...source,
          exists: false,
          mtimeMs: null,
          mtimeIso: null,
          ageMinutes: null,
        };
      }

      try {
        const fileStat = await stat(source.absolute);
        const ageMs = Math.max(0, now - fileStat.mtimeMs);
        return {
          ...source,
          exists: true,
          mtimeMs: fileStat.mtimeMs,
          mtimeIso: fileStat.mtime.toISOString(),
          ageMinutes: Math.floor(ageMs / MS_PER_MINUTE),
        };
      } catch {
        return {
          ...source,
          exists: false,
          mtimeMs: null,
          mtimeIso: null,
          ageMinutes: null,
        };
      }
    }),
  );

  annotated.sort((a, b) => {
    if (a.exists && b.exists) return b.mtimeMs - a.mtimeMs;
    if (a.exists) return -1;
    if (b.exists) return 1;
    const aKey = a.relative ?? a.absolute ?? '';
    const bKey = b.relative ?? b.absolute ?? '';
    return aKey.localeCompare(bKey);
  });

  return annotated;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function displayTableReport(summary, { verbose = false } = {}) {
  console.log(chalk.blue('\n📊 Performance Report'));
  console.log(chalk.gray('═══════════════════════════════════════════════════════════════\n'));

  // Discovery table
  console.log(chalk.cyan('🔍 Discovery Service'));
  console.log(chalk.gray('───────────────────────────────────────────────────────────────'));
  
  const discoveryData = [
    ['Metric', 'Value', 'Budget', 'Status'],
    ['─────────────', '──────────────', '──────────', '──────'],
    ['Requests', summary.discovery.total.toString(), '—', ''],
    ['P50 Latency', formatDuration(summary.discovery.p50), '—', ''],
    ['P95 Latency', formatDuration(summary.discovery.p95), '≤ 1s', 
     summary.discovery.p95 <= 1000 ? chalk.green('✓') : chalk.red('✗')],
    ['P99 Latency', formatDuration(summary.discovery.p99), '—', ''],
    ['Average', formatDuration(summary.discovery.avg), '—', ''],
    ['Cache Hit Rate', `${(summary.discovery.cacheHitRate * 100).toFixed(1)}%`, '—', ''],
    ['Errors', summary.discovery.errors.toString(), '0', 
     summary.discovery.errors === 0 ? chalk.green('✓') : chalk.red('✗')],
  ];

  for (const row of discoveryData) {
    if (row[0] === 'Metric' || row[0].startsWith('─')) {
      console.log(chalk.gray(`  ${row[0].padEnd(14)} ${row[1].padEnd(15)} ${row[2].padEnd(11)} ${row[3]}`));
    } else {
      const statusCell = typeof row[3] === 'string' && row[3].includes('✓') 
        ? row[3] 
        : typeof row[3] === 'string' && row[3].includes('✗')
        ? row[3]
        : chalk.gray(row[3]);
      console.log(`  ${chalk.white(row[0].padEnd(14))} ${chalk.cyan(row[1].padEnd(15))} ${chalk.gray(row[2].padEnd(11))} ${statusCell}`);
    }
  }

  console.log();

  // MCP table
  console.log(chalk.cyan('🔧 MCP Service'));
  console.log(chalk.gray('───────────────────────────────────────────────────────────────'));
  
  const mcpData = [
    ['Metric', 'Value', 'Budget', 'Status'],
    ['─────────────', '──────────────', '──────────', '──────'],
    ['Requests', summary.mcp.total.toString(), '—', ''],
    ['P50 Latency', formatDuration(summary.mcp.p50), '—', ''],
    ['P95 Latency', formatDuration(summary.mcp.p95), '≤ 3s', 
     summary.mcp.p95 <= 3000 ? chalk.green('✓') : chalk.red('✗')],
    ['P99 Latency', formatDuration(summary.mcp.p99), '—', ''],
    ['Average', formatDuration(summary.mcp.avg), '—', ''],
    ['Tool Executions', summary.mcp.toolExecutions.toString(), '—', ''],
    ['Errors', summary.mcp.errors.toString(), '0', 
     summary.mcp.errors === 0 ? chalk.green('✓') : chalk.red('✗')],
  ];

  for (const row of mcpData) {
    if (row[0] === 'Metric' || row[0].startsWith('─')) {
      console.log(chalk.gray(`  ${row[0].padEnd(14)} ${row[1].padEnd(15)} ${row[2].padEnd(11)} ${row[3]}`));
    } else {
      const statusCell = typeof row[3] === 'string' && row[3].includes('✓') 
        ? row[3] 
        : typeof row[3] === 'string' && row[3].includes('✗')
        ? row[3]
        : chalk.gray(row[3]);
      console.log(`  ${chalk.white(row[0].padEnd(14))} ${chalk.cyan(row[1].padEnd(15))} ${chalk.gray(row[2].padEnd(11))} ${statusCell}`);
    }
  }

  console.log();

  // System info
  console.log(chalk.cyan('💻 System'));
  console.log(chalk.gray('───────────────────────────────────────────────────────────────'));
  console.log(`  ${chalk.white('Memory Used'.padEnd(14))} ${chalk.cyan((summary.system.memoryUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB')}`);
  console.log(`  ${chalk.white('Uptime'.padEnd(14))} ${chalk.cyan((summary.system.uptime / 60).toFixed(1) + ' min')}`);

  console.log();

  if (summary.logs) {
    console.log(chalk.cyan('🗂 Logs'));
    console.log(chalk.gray('───────────────────────────────────────────────────────────────'));
    const latestLabel =
      summary.logs.latest?.relative ??
      summary.logs.latest?.absolute ??
      '—';
    const lastUpdated = summary.logs.latest?.mtime ?? '—';
    const ageDisplay =
      summary.logs.latest?.ageMinutes != null
        ? `${summary.logs.latest.ageMinutes} min`
        : 'unknown';
    console.log(`  ${chalk.white('Latest'.padEnd(14))} ${chalk.cyan(latestLabel)}`);
    console.log(`  ${chalk.white('Last Updated'.padEnd(14))} ${chalk.cyan(lastUpdated)}`);
    console.log(
      `  ${chalk.white('Age'.padEnd(14))} ${chalk.cyan(ageDisplay)} ${chalk.gray(`(max ${summary.logs.thresholdMinutes} min)`)}`
    );
  }

  if (verbose && Array.isArray(summary.sourceLogs) && summary.sourceLogs.length > 0) {
    console.log();
    console.log(chalk.cyan('📁 Source Logs'));
    console.log(chalk.gray('───────────────────────────────────────────────────────────────'));
    for (const source of summary.sourceLogs) {
      const displayPath = source.relative ?? source.absolute ?? source;
      const extra = source.mtime ? ` (${source.mtime})` : '';
      if (source.exists === false) {
        console.log(`${chalk.red('  ⚠ ')}${chalk.red(`${displayPath}${extra}`)}`);
      } else {
        console.log(`${chalk.gray('  • ')}${chalk.gray(`${displayPath}${extra}`)}`);
      }
    }
  }

  console.log(chalk.gray('═══════════════════════════════════════════════════════════════'));

  // Budget violations summary
  const violations = [];
  if (summary.discovery.p95 > BUDGETS.discovery.p95) {
    violations.push(`Discovery P95 exceeds budget: ${formatDuration(summary.discovery.p95)} > ${formatDuration(BUDGETS.discovery.p95)}`);
  }
  if (summary.mcp.p95 > BUDGETS.mcp.p95) {
    violations.push(`MCP P95 exceeds budget: ${formatDuration(summary.mcp.p95)} > ${formatDuration(BUDGETS.mcp.p95)}`);
  }

  if (violations.length > 0) {
    console.log(chalk.red('⚠ Budget Violations:'));
    for (const violation of violations) {
      console.log(chalk.red(`  • ${violation}`));
    }
  } else {
    console.log(chalk.green('✅ All performance budgets met'));
  }

  if (summary.logs) {
    const ageDisplay =
      summary.logs.latest?.ageMinutes != null
        ? `${summary.logs.latest.ageMinutes} min`
        : 'unknown';
    if (summary.logs.stale) {
      console.log(
        chalk.red(
          `⚠ Telemetry logs are stale: last update ${ageDisplay} ago (threshold ${summary.logs.thresholdMinutes} min)`,
        ),
      );
    } else {
      console.log(
        chalk.green(
          `✅ Telemetry fresh: last update ${ageDisplay} ago`,
        ),
      );
    }
  }

  console.log();
}

function computeEnhancedSummary(collector) {
  const baseSummary = collector.getSummary();
  
  // Add p99 metrics
  const discoveryP99 = percentile(collector.metrics.discovery.requests, 99);
  const mcpP99 = percentile(collector.metrics.mcp.requests, 99);

  return {
    ...baseSummary,
    discovery: {
      ...baseSummary.discovery,
      p99: discoveryP99,
    },
    mcp: {
      ...baseSummary.mcp,
      p99: mcpP99,
    },
  };
}

async function perfReportCommand(options = {}) {
  return adapterTracing.traceCLIOperation('perf-report', async () => {
    const startTime = performance.now();
    const correlationId = generateCorrelationId();
    const {
      workspace = process.cwd(),
      verbose = false,
      format = 'table',
    } = options;

    const warn = verbose
      ? (message) => console.warn(chalk.yellow(`⚠ ${message}`))
      : undefined;

    try {
      if (verbose) {
        console.log(chalk.blue(`\n📊 Generating performance report...`));
        console.log(chalk.gray(`Workspace: ${workspace}`));
        console.log(chalk.gray(`Correlation ID: ${correlationId}`));
      }

      const collector = await collectWorkspacePerfMetrics({
        workspace,
        verbose,
        onWarning: warn,
        maxLogAgeMs: MAX_LOG_AGE_MS,
      });

      const summary = computeEnhancedSummary(collector);
      
      // Add metadata
      const rawSourceLogs =
        Array.isArray(collector.sourceLogFiles) && collector.sourceLogFiles.length > 0
          ? collector.sourceLogFiles.map((filePath) => ({
              absolute: filePath,
              relative: path.relative(workspace, filePath),
            }))
          : [];

      const annotatedLogs = await gatherLogMetadata(rawSourceLogs);
      const nowTs = Date.now();
      let newestLog = null;
      let oldestLog = null;

      for (const entry of annotatedLogs) {
        if (!entry.exists) continue;
        if (!newestLog) {
          newestLog = entry;
        }
        oldestLog = entry;
      }

      const logsStale =
        !newestLog || nowTs - newestLog.mtimeMs > MAX_LOG_AGE_MS;
      const latestAgeMinutes = newestLog
        ? Math.floor((nowTs - newestLog.mtimeMs) / MS_PER_MINUTE)
        : null;
      const oldestAgeMinutes = oldestLog
        ? Math.floor((nowTs - oldestLog.mtimeMs) / MS_PER_MINUTE)
        : null;

      summary.sourceLogs = annotatedLogs.map((entry) => ({
        absolute: entry.absolute,
        relative: entry.relative,
        exists: entry.exists,
        mtime: entry.exists ? entry.mtimeIso : null,
        ageMinutes:
          entry.exists && entry.mtimeMs != null
            ? Math.floor((nowTs - entry.mtimeMs) / MS_PER_MINUTE)
            : null,
      }));
      summary.latestLog = newestLog?.absolute ?? null;
      summary.logs = {
        stale: logsStale,
        thresholdMinutes: MAX_LOG_AGE_MINUTES,
        latest: newestLog
          ? {
              absolute: newestLog.absolute,
              relative: newestLog.relative,
              mtime: newestLog.mtimeIso,
              ageMinutes: latestAgeMinutes,
            }
          : null,
        oldest: oldestLog
          ? {
              absolute: oldestLog.absolute,
              relative: oldestLog.relative,
              mtime: oldestLog.mtimeIso,
              ageMinutes: oldestAgeMinutes,
            }
          : null,
        totalParsed: annotatedLogs.length,
        available: annotatedLogs.filter((entry) => entry.exists).length,
      };
      summary.correlationId = correlationId;
      summary.timestamp = new Date().toISOString();

      // Check budget violations for exit code
      const budgetViolated =
        summary.discovery.p95 > BUDGETS.discovery.p95 ||
        summary.mcp.p95 > BUDGETS.mcp.p95;
      const shouldFail = budgetViolated || logsStale;

      if (format === 'json') {
        console.log(JSON.stringify(summary, null, 2));
      } else {
        displayTableReport(summary, { verbose });
        if (verbose) {
          console.log(chalk.gray(`Correlation ID: ${correlationId}`));
          console.log(chalk.gray(`Generated: ${summary.timestamp}`));
        }
      }

      const executionTime = performance.now() - startTime;
      if (verbose) {
        console.log(
          chalk.gray(`Report generated in ${executionTime.toFixed(2)}ms`),
        );
      }

      // Exit with non-zero if budgets violated or telemetry stale
      if (shouldFail) {
        process.exitCode = 1;
      }

      return {
        success: !shouldFail,
        summary,
        correlationId,
        executionTime,
        budgetViolated,
        logsStale,
      };
    } catch (error) {
      const executionTime = performance.now() - startTime;
      console.error(chalk.red(`\n❌ Performance report failed: ${error.message}`));
      
      // Provide actionable guidance for missing logs
      if (error.message.includes('not found') || error.message.includes('No performance logs')) {
        console.error(chalk.yellow('\n💡 Troubleshooting:'));
        console.error(chalk.gray('   1. Run tests to generate telemetry:'));
        console.error(chalk.gray('      npm run test:fast'));
        console.error(chalk.gray('      npm run test:performance'));
        console.error(chalk.gray('   2. Check that logs exist in artifacts/perf/'));
        console.error(chalk.gray('   3. See artifacts/perf/README.md for log format'));
      }
      
      if (verbose) {
        console.error(chalk.gray(`\nExecution time: ${executionTime.toFixed(2)}ms`));
        console.error(chalk.gray(`Correlation ID: ${correlationId}`));
        console.error(chalk.gray(`Error details: ${error.stack}`));
      }
      
      process.exitCode = 1;
      return {
        success: false,
        error: error.message,
        correlationId,
        executionTime,
      };
    }
  });
}

function generateCorrelationId() {
  return randomUUID();
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--workspace' && index + 1 < args.length) {
      options.workspace = args[++index];
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--format' && index + 1 < args.length) {
      options.format = args[++index];
    } else if (arg === '--help') {
      console.log(`
Performance Report Command

Usage: node perf-report.js [options]

Options:
  --workspace <path>     Workspace path (default: current directory)
  --verbose              Show detailed output including source logs
  --format <format>      Output format: table (default) or json
  --help                 Show this help

Examples:
  node perf-report.js
  node perf-report.js --workspace ./my-workspace --verbose
  node perf-report.js --format json
  node perf-report.js --format table --verbose

Output:
  • Table format displays structured performance metrics with budget compliance
  • JSON format outputs machine-readable summary suitable for CI/automation
  • Exits with code 1 when budgets are exceeded or logs are stale

Performance Budgets:
  Discovery P95: ≤ 1000ms
  MCP P95: ≤ 3000ms
`);
      process.exit(0);
    }
  }

  await perfReportCommand(options);
}

export { perfReportCommand };
