#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import WorkflowOrchestrator from '../../src/workbench/runtime/orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_WORKSPACE = path.resolve(__dirname, '..', '..');

function computePercentile(values, percentile) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function buildBenchmarkWorkflow(iteration) {
  const prefix = `iteration-${iteration}`;

  return {
    name: `integration-benchmark-${iteration}`,
    description: 'Simulated API → Event → Data orchestration used for CI guardrails.',
    concurrency: 5,
    metadata: {
      iteration,
      scenario: 'api-event-data',
      source: 'workbench-ci-benchmark'
    },
    steps: [
      {
        id: `${prefix}-api-call`,
        agent: 'api',
        description: 'Simulate upstream API call',
        params: {
          endpoint: '/customers',
          durationMs: 180 + iteration * 5
        }
      },
      {
        id: `${prefix}-fanout`,
        name: 'parallel-fanout',
        description: 'Publish event and store snapshot concurrently',
        parallel: [
          {
            id: `${prefix}-event-publish`,
            agent: 'event',
            params: {
              channel: 'events.integration',
              durationMs: 90 + iteration * 3
            }
          },
          {
            id: `${prefix}-data-store`,
            agent: 'data',
            params: {
              table: 'integration_snapshots',
              durationMs: 140 + iteration * 4
            }
          }
        ]
      },
      {
        id: `${prefix}-aggregate`,
        agent: 'data',
        description: 'Aggregate downstream store',
        input: `{{${prefix}-event-publish}}`,
        params: {
          durationMs: 150 + iteration * 2
        }
      }
    ]
  };
}

function aggregateRuns(runs) {
  const latencies = runs.flatMap((run) => run.steps.map((step) => step.durationMs));
  const totalDurationMs = runs.reduce((sum, run) => sum + run.metrics.totalDurationMs, 0);
  const maxConcurrent = runs.reduce(
    (max, run) => Math.max(max, run.metrics.maxConcurrent),
    1
  );

  return {
    totalDurationMs,
    maxConcurrent,
    latency: {
      minMs: latencies.length ? Math.min(...latencies) : 0,
      maxMs: latencies.length ? Math.max(...latencies) : 0,
      p50Ms: computePercentile(latencies, 50),
      p95Ms: computePercentile(latencies, 95),
      averageMs:
        latencies.length === 0
          ? 0
          : Math.round((latencies.reduce((acc, value) => acc + value, 0) / latencies.length) * 100) /
            100
    }
  };
}

function formatOutputPath(workspace, output) {
  if (output) {
    const resolved = path.resolve(output);
    if (path.extname(resolved)) {
      return {
        directory: path.dirname(resolved),
        filePath: resolved
      };
    }

    return {
      directory: resolved,
      filePath: path.join(resolved, 'perf-results.json')
    };
  }

  const directory = path.join(workspace, 'reports', 'workbench');
  return {
    directory,
    filePath: path.join(directory, 'perf-results.json')
  };
}

export async function runWorkbenchBenchmark(options = {}) {
  const workspace = options.workspace ? path.resolve(options.workspace) : DEFAULT_WORKSPACE;
  const iterations = Math.max(1, Number.parseInt(String(options.iterations ?? '5'), 10) || 5);

  const orchestrator = new WorkflowOrchestrator({
    concurrencyLimit: 8
  });

  const runs = [];

  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    const workflow = buildBenchmarkWorkflow(iteration);
    const summary = await orchestrator.run(workflow, { iteration });
    runs.push(summary);
  }

  const metrics = aggregateRuns(runs);
  const averageDuration =
    runs.length === 0
      ? 0
      : Math.round((metrics.totalDurationMs / runs.length) * 100) / 100;

  const report = {
    generatedAt: new Date().toISOString(),
    workspace,
    summary: {
      runCount: runs.length,
      averageDurationMs: averageDuration
    },
    metrics,
    runs: runs.map((run) => ({
      iteration: run.workflow.iteration,
      workflow: run.workflow.name,
      totalDurationMs: run.metrics.totalDurationMs,
      stepCount: run.metrics.stepCount,
      p95LatencyMs: run.metrics.latency.p95Ms,
      successCount: run.metrics.successCount
    }))
  };

  const { directory, filePath } = formatOutputPath(workspace, options.output);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');

  return {
    reportPath: filePath,
    ...report
  };
}

async function main() {
  try {
    const workspace = process.env.WORKBENCH_WORKSPACE
      ? path.resolve(process.env.WORKBENCH_WORKSPACE)
      : DEFAULT_WORKSPACE;
    const result = await runWorkbenchBenchmark({
      workspace,
      iterations: process.env.WORKBENCH_ITERATIONS,
      output: process.env.WORKBENCH_OUTPUT
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Benchmark failed: ${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}

export default {
  runWorkbenchBenchmark
};
