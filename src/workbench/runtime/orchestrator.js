#!/usr/bin/env node

import { AgentRunner, AgentRunnerError } from './agent-runner.js';

function isParallelStep(step) {
  return Boolean(step && step.parallel);
}

function resolveValue(value, context) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = trimmed.match(/^{{\s*([^}]+)\s*}}$/);
    if (match) {
      const ref = match[1];
      const record = context.get(ref);
      return (record && record.output) ?? null;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, context));
  }

  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = resolveValue(nested, context);
    }
    return result;
  }

  return value;
}

function cloneStepWithContext(step, context) {
  return {
    ...step,
    input: resolveValue(step.input, context),
    params: step.params ? resolveValue(step.params, context) : undefined
  };
}

function computePercentile(values, percentile) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function computeMetrics(records, totalDurationMs, maxConcurrent) {
  if (records.length === 0) {
    return {
      totalDurationMs,
      stepCount: 0,
      successCount: 0,
      failureCount: 0,
      latency: {
        minMs: 0,
        maxMs: 0,
        p50Ms: 0,
        p95Ms: 0,
        averageMs: 0
      },
      maxConcurrent
    };
  }

  const latencies = records.map((record) => record.durationMs);
  const successCount = records.filter((record) => record.status === 'ok').length;
  const failureCount = records.length - successCount;
  const totalLatency = latencies.reduce((acc, value) => acc + value, 0);

  return {
    totalDurationMs,
    stepCount: records.length,
    successCount,
    failureCount,
    latency: {
      minMs: Math.min(...latencies),
      maxMs: Math.max(...latencies),
      p50Ms: computePercentile(latencies, 50),
      p95Ms: computePercentile(latencies, 95),
      averageMs: Math.round((totalLatency / records.length) * 100) / 100
    },
    maxConcurrent
  };
}

export class WorkflowOrchestrator {
  constructor(options = {}) {
    this.runner =
      options.runner ??
      new AgentRunner({
        concurrencyLimit: options.concurrencyLimit,
        ...(options.runnerOptions ?? {})
      });

    const candidate = options.concurrencyLimit ?? this.runner.concurrencyLimit ?? 5;
    this.concurrencyLimit = Math.max(1, Math.min(candidate, this.runner.concurrencyLimit));
  }

  async run(workflow, options = {}) {
    if (!workflow || !Array.isArray(workflow.steps) || workflow.steps.length === 0) {
      throw new Error('Workflow must define at least one step');
    }

    const context = new Map();
    const runnerContext = {
      results: new Map(),
      metadata: workflow.metadata ?? {}
    };
    const steps = [];
    const errors = [];
    const iteration = options.iteration ?? 1;
    const maxConcurrency = Math.max(
      1,
      Math.min(
        options.concurrency ?? workflow.concurrency ?? this.concurrencyLimit,
        this.runner.concurrencyLimit
      )
    );

    const workflowStart = Date.now();
    let currentOrder = 0;
    let recordedMaxConcurrency = 1;

    for (const unit of workflow.steps) {
      if (isParallelStep(unit)) {
        const { records, errors: parallelErrors, peakConcurrency } = await this.runParallelGroup(
          unit,
          context,
          runnerContext,
          currentOrder,
          maxConcurrency,
          options.failFast
        );
        currentOrder += records.length;
        recordedMaxConcurrency = Math.max(recordedMaxConcurrency, peakConcurrency);
        for (const record of records) {
          steps.push(record);
          context.set(record.id, record);
        }
        errors.push(...parallelErrors);
        if (options.failFast && parallelErrors.length > 0) {
          break;
        }
      } else {
        const record = await this.runSingleStep(
          unit,
          context,
          runnerContext,
          currentOrder,
          options.failFast
        );
        currentOrder += 1;
        steps.push(record);
        context.set(record.id, record);
        if (record.status === 'error') {
          errors.push(record);
          if (options.failFast) {
            break;
          }
        }
      }
    }

    const workflowEnd = Date.now();
    const metrics = computeMetrics(steps, workflowEnd - workflowStart, recordedMaxConcurrency);

    return {
      workflow: {
        name: workflow.name,
        description: workflow.description,
        startedAt: new Date(workflowStart).toISOString(),
        completedAt: new Date(workflowEnd).toISOString(),
        iteration
      },
      metrics,
      steps,
      errors
    };
  }

  async runSingleStep(step, context, runnerContext, order, failFast = false) {
    const resolved = cloneStepWithContext(step, context);

    try {
      const result = await this.runner.run(resolved, runnerContext, { failFast });

      return {
        ...result,
        metrics: { ...result.metrics },
        logs: [...result.logs],
        order
      };
    } catch (error) {
      if (error instanceof AgentRunnerError && error.result) {
        return {
          ...error.result,
          metrics: { ...error.result.metrics },
          logs: [...error.result.logs],
          order
        };
      }

      return {
        id: step.id,
        agent: step.agent,
        status: 'error',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 0,
        output: null,
        metrics: { agent: step.agent },
        logs: [],
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        },
        order
      };
    }
  }

  async runParallelGroup(
    group,
    context,
    runnerContext,
    startingOrder,
    concurrencyLimit,
    failFast = false
  ) {
    if (!Array.isArray(group.parallel) || group.parallel.length === 0) {
      return { records: [], errors: [], peakConcurrency: 1 };
    }

    const queue = [...group.parallel];
    const records = [];
    const errors = [];
    let active = 0;
    let peakConcurrency = 1;
    let order = startingOrder;
    let aborted = false;

    const runNext = async () => {
      if (aborted) {
        return;
      }

      const next = queue.shift();
      if (!next) {
        return;
      }

      active += 1;
      peakConcurrency = Math.max(peakConcurrency, active);

      try {
        const record = await this.runSingleStep(next, context, runnerContext, order, failFast);
        order += 1;
        records.push(record);
        if (record.status === 'error') {
          errors.push(record);
          if (failFast) {
            aborted = true;
          }
        }
      } finally {
        active -= 1;
      }

      if (!aborted) {
        await runNext();
      }
    };

    const workers = [];
    const workerCount = Math.min(concurrencyLimit, queue.length);
    for (let i = 0; i < workerCount; i += 1) {
      workers.push(runNext());
    }

    await Promise.all(workers);

    for (const record of records) {
      record.group = group.name ?? group.id ?? 'parallel';
      context.set(record.id, record);
    }

    return { records, errors, peakConcurrency };
  }
}

export default WorkflowOrchestrator;
