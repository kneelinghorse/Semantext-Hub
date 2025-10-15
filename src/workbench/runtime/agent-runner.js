#!/usr/bin/env node

import { performance } from 'perf_hooks';
import { randomUUID } from 'crypto';

const DEFAULT_LATENCY_MS = 160;
const MAX_CONCURRENCY = 8;

export class AgentRunnerError extends Error {
  constructor(message, step, result, cause) {
    super(message);
    this.name = 'AgentRunnerError';
    this.step = step;
    this.result = result;
    if (cause) {
      this.cause = cause;
    }
  }
}

function normaliseContext(context) {
  if (context && context.results instanceof Map) {
    return context;
  }

  return {
    results: new Map(),
    metadata: (context && context.metadata) || {}
  };
}

function clampLatency(value, fallback) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.min(2000, Math.round(numeric)));
}

function resolveLatency(step, defaultLatency) {
  if (typeof step.simulateLatencyMs === 'number') {
    return clampLatency(step.simulateLatencyMs, defaultLatency);
  }

  const latencyFromParams =
    (step.params && (step.params.durationMs ?? step.params.latencyMs)) ?? undefined;
  if (typeof latencyFromParams === 'number') {
    return clampLatency(latencyFromParams, defaultLatency);
  }

  if (typeof step.timeoutMs === 'number') {
    return clampLatency(step.timeoutMs * 0.8, defaultLatency);
  }

  return clampLatency(defaultLatency, defaultLatency);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function cloneResult(result) {
  return {
    ...result,
    metrics: { ...result.metrics },
    logs: [...result.logs]
  };
}

function createSimulatedAdapter(kind, defaultLatency) {
  return async (step) => {
    const targetLatency = resolveLatency(step, defaultLatency);
    const waitTime = Math.min(targetLatency, 60);
    if (waitTime > 0) {
      await sleep(waitTime);
    }

    const requestId =
      (step.params && typeof step.params.requestId === 'string' && step.params.requestId) ||
      randomUUID();

    const output = {
      agent: step.agent,
      id: step.id,
      kind,
      input: step.input ?? null,
      params: step.params ?? {},
      message: `${kind} agent ${step.id} executed`
    };

    return {
      output,
      metrics: {
        latencyMs: targetLatency,
        requestId,
        agent: step.agent,
        simulated: true
      },
      logs: [`${kind} agent ${step.id} completed in ${targetLatency}ms`]
    };
  };
}

export const DEFAULT_ADAPTERS = Object.freeze({
  api: createSimulatedAdapter('API', DEFAULT_LATENCY_MS),
  event: createSimulatedAdapter('Event', DEFAULT_LATENCY_MS / 2),
  data: createSimulatedAdapter('Data', DEFAULT_LATENCY_MS * 0.75)
});

export class AgentRunner {
  constructor(options = {}) {
    this.defaultLatencyMs = options.defaultLatencyMs ?? DEFAULT_LATENCY_MS;
    this.maxConcurrency = Math.max(
      1,
      Math.min(options.concurrencyLimit ?? MAX_CONCURRENCY, MAX_CONCURRENCY)
    );
    this.failFast = options.failFast ?? false;

    const entries = Object.entries(DEFAULT_ADAPTERS);
    if (options.adapters) {
      for (const [name, adapter] of Object.entries(options.adapters)) {
        entries.push([name, adapter]);
      }
    }

    this.adapters = new Map(entries);
  }

  get concurrencyLimit() {
    return this.maxConcurrency;
  }

  registerAdapter(name, adapter) {
    if (!name || typeof adapter !== 'function') {
      throw new Error('Adapter name and implementation are required');
    }
    this.adapters.set(name, adapter);
  }

  getAdapter(name) {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new Error(`No adapter registered for agent "${name}"`);
    }
    return adapter;
  }

  async run(step, context, options) {
    const runtimeContext = normaliseContext(context);
    const adapter = this.getAdapter(step.agent);
    const failFast = (options && options.failFast) ?? this.failFast;

    const startedAt = new Date();
    const perfStart = performance.now();

    try {
      const adapterResult = await adapter(step, runtimeContext);
      const completedAt = new Date();
      const durationMs =
        (adapterResult.metrics && adapterResult.metrics.latencyMs) ??
        Math.max(1, Math.round(performance.now() - perfStart));

      const result = {
        id: step.id,
        agent: step.agent,
        status: 'ok',
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs,
        output: adapterResult.output,
        metrics: {
          latencyMs: durationMs,
          requestId:
            (adapterResult.metrics &&
              typeof adapterResult.metrics.requestId === 'string' &&
              adapterResult.metrics.requestId) ||
            randomUUID(),
          agent: step.agent,
          simulated: adapterResult.metrics?.simulated ?? false,
          ...(adapterResult.metrics || {})
        },
        logs: adapterResult.logs ?? []
      };

      runtimeContext.results.set(step.id, cloneResult(result));
      return result;
    } catch (error) {
      const completedAt = new Date();
      const latency = Math.max(1, Math.round(performance.now() - perfStart));
      const failure = {
        id: step.id,
        agent: step.agent,
        status: 'error',
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: latency,
        output: null,
        metrics: {
          latencyMs: latency,
          requestId: randomUUID(),
          agent: step.agent,
          simulated: false
        },
        logs: [],
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        }
      };

      runtimeContext.results.set(step.id, cloneResult(failure));

      if (failFast) {
        throw new AgentRunnerError('Agent step failed', step, failure, error);
      }

      return failure;
    }
  }
}

export function createDefaultAgentRunner(options = {}) {
  return new AgentRunner(options);
}

export default AgentRunner;
