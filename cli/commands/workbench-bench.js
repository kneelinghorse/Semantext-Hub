#!/usr/bin/env node

import path from 'path';

import { createConsole } from '../../src/cli/ux/console.js';
import { runWorkbenchBenchmark } from '../../scripts/bench/workbench-ci-benchmark.js';

function parseIterations(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 5;
}

export async function workbenchBenchCommand(options = {}) {
  const consoleUi = createConsole();
  const format = String(options.format ?? 'text').toLowerCase();
  const workspace = options.workspace ? path.resolve(options.workspace) : process.cwd();
  const iterations = parseIterations(options.iterations);
  const output = options.output ? path.resolve(options.output) : undefined;

  const spinner =
    format === 'json'
      ? null
      : consoleUi.spinner(`Running ${iterations} integration benchmark iteration(s)...`);

  if (spinner) {
    spinner.start();
  }

  try {
    const result = await runWorkbenchBenchmark({
      workspace,
      iterations,
      output
    });

    if (spinner) {
      spinner.succeed(
        `Benchmark completed in ${result.metrics.totalDurationMs}ms (p95 ${result.metrics.latency.p95Ms}ms)`
      );
    }

    if (format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      consoleUi.success('Integration benchmark results ready.', [
        `Runs: ${result.summary.runCount}`,
        `p95 latency: ${result.metrics.latency.p95Ms}ms`,
        `Max concurrency observed: ${result.metrics.maxConcurrent}`
      ]);
      consoleUi.info(`Artifact: ${result.reportPath}`);
    }

    return result;
  } catch (error) {
    if (spinner) {
      spinner.fail('Benchmark failed.');
    }

    const message = error instanceof Error ? error.message : String(error);
    consoleUi.error('Unable to complete benchmark.', [message]);
    process.exitCode = 1;
    return null;
  }
}

export default {
  workbenchBenchCommand
};
