#!/usr/bin/env node

/**
 * Performance Status CLI Command - B18.6
 *
 * Thin wrapper delegating workspace metric collection to src/metrics/perf.js.
 * Emits catalog-focused summaries while leaving shared logic in the metrics layer.
 */

import chalk from 'chalk';
import { performance } from 'perf_hooks';
import { randomUUID } from 'crypto';
import { adapterTracing } from '../../utils/trace.js';
import { collectWorkspacePerfMetrics } from '../../src/metrics/perf.js';

function displayStatus(summary, { verbose = false } = {}) {
  console.log(chalk.blue('\n📊 Performance Status Summary'));
  console.log(chalk.gray('================================\n'));

  console.log(chalk.cyan('🔍 Discovery Service'));
  console.log(chalk.gray(`  Requests: ${summary.discovery.total}`));
  console.log(chalk.gray(`  P50: ${summary.discovery.p50.toFixed(2)}ms`));
  console.log(chalk.gray(`  P95: ${summary.discovery.p95.toFixed(2)}ms`));
  console.log(chalk.gray(`  Avg: ${summary.discovery.avg.toFixed(2)}ms`));
  console.log(
    chalk.gray(
      `  Cache Hit Rate: ${(summary.discovery.cacheHitRate * 100).toFixed(1)}%`,
    ),
  );

  if (summary.discovery.p95 > 1000) {
    console.log(
      chalk.red(`  ⚠ P95 exceeds SLO (1s): ${summary.discovery.p95.toFixed(2)}ms`),
    );
  } else {
    console.log(
      chalk.green(
        `  ✅ P95 within SLO (1s): ${summary.discovery.p95.toFixed(2)}ms`,
      ),
    );
  }

  if (summary.discovery.errors > 0) {
    console.log(chalk.red(`  ❌ Errors: ${summary.discovery.errors}`));
  }

  console.log();

  console.log(chalk.cyan('🔧 MCP Service'));
  console.log(chalk.gray(`  Requests: ${summary.mcp.total}`));
  console.log(chalk.gray(`  P50: ${summary.mcp.p50.toFixed(2)}ms`));
  console.log(chalk.gray(`  P95: ${summary.mcp.p95.toFixed(2)}ms`));
  console.log(chalk.gray(`  Avg: ${summary.mcp.avg.toFixed(2)}ms`));
  console.log(
    chalk.gray(`  Tool Executions: ${summary.mcp.toolExecutions}`),
  );

  if (summary.mcp.p95 > 3000) {
    console.log(
      chalk.red(`  ⚠ P95 exceeds SLO (3s): ${summary.mcp.p95.toFixed(2)}ms`),
    );
  } else {
    console.log(
      chalk.green(
        `  ✅ P95 within SLO (3s): ${summary.mcp.p95.toFixed(2)}ms`,
      ),
    );
  }

  if (summary.mcp.errors > 0) {
    console.log(chalk.red(`  ❌ Errors: ${summary.mcp.errors}`));
  }

  console.log();

  console.log(chalk.cyan('💻 System'));
  console.log(
    chalk.gray(
      `  Memory: ${(summary.system.memoryUsage.heapUsed / 1024 / 1024).toFixed(
        2,
      )}MB`,
    ),
  );
  console.log(
    chalk.gray(`  Uptime: ${(summary.system.uptime / 60).toFixed(1)}min`),
  );

  if (verbose) {
    console.log(chalk.gray(`\nDetailed Memory:`));
    console.log(
      chalk.gray(
        `  Heap Used: ${(summary.system.memoryUsage.heapUsed / 1024 / 1024).toFixed(
          2,
        )}MB`,
      ),
    );
    console.log(
      chalk.gray(
        `  Heap Total: ${(summary.system.memoryUsage.heapTotal / 1024 / 1024).toFixed(
          2,
        )}MB`,
      ),
    );
    console.log(
      chalk.gray(
        `  External: ${(summary.system.memoryUsage.external / 1024 / 1024).toFixed(
          2,
        )}MB`,
      ),
    );
    console.log(
      chalk.gray(`  RSS: ${(summary.system.memoryUsage.rss / 1024 / 1024).toFixed(2)}MB`),
    );
  }

  console.log();
}

function generateCorrelationId() {
  return randomUUID();
}

async function perfStatusCommand(options = {}) {
  return adapterTracing.traceCLIOperation('perf-status', async () => {
    const startTime = performance.now();
    const correlationId = generateCorrelationId();
    const {
      workspace = process.cwd(),
      verbose = false,
      format = 'text',
    } = options;

    const warn = verbose
      ? (message) => console.warn(chalk.yellow(`⚠ ${message}`))
      : undefined;

    try {
      if (verbose) {
        console.log(chalk.blue(`\n📊 Collecting performance status...`));
        console.log(chalk.gray(`Workspace: ${workspace}`));
        console.log(chalk.gray(`Correlation ID: ${correlationId}`));
      }

      const collector = await collectWorkspacePerfMetrics({
        workspace,
        verbose,
        onWarning: warn,
      });

      const summary = collector.getSummary();
      summary.correlationId = correlationId;
      summary.timestamp = new Date().toISOString();

      if (format === 'json') {
        console.log(JSON.stringify(summary, null, 2));
      } else {
        displayStatus(summary, { verbose });
        if (verbose) {
          console.log(chalk.gray(`Correlation ID: ${correlationId}`));
          console.log(chalk.gray(`Generated: ${summary.timestamp}`));
        }
      }

      const executionTime = performance.now() - startTime;
      if (verbose) {
        console.log(
          chalk.gray(`\nStatus check completed in ${executionTime.toFixed(2)}ms`),
        );
      }

      return {
        success: true,
        summary,
        correlationId,
        executionTime,
      };
    } catch (error) {
      const executionTime = performance.now() - startTime;
      console.error(chalk.red(`\n❌ Performance status failed: ${error.message}`));
      if (verbose) {
        console.error(chalk.gray(`Execution time: ${executionTime.toFixed(2)}ms`));
        console.error(chalk.gray(`Correlation ID: ${correlationId}`));
        console.error(chalk.gray(`Error details: ${error.stack}`));
      }
      throw error;
    }
  });
}

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
Performance Status Command

Usage: node perf-status.js [options]

Options:
  --workspace <path>     Workspace path (default: current directory)
  --verbose              Show detailed output
  --format <format>      Output format: text (default) or json
  --help                 Show this help

Examples:
  node perf-status.js
  node perf-status.js --workspace ./my-workspace --verbose
  node perf-status.js --format json

SLO Targets:
  Discovery P95: < 1s
  MCP P95: < 3s
`);
      process.exit(0);
    }
  }

  await perfStatusCommand(options);
}

export { perfStatusCommand };
