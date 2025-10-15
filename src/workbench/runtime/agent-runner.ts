#!/usr/bin/env node

import { performance } from 'perf_hooks';
import { randomUUID } from 'crypto';

export type AgentResultStatus = 'ok' | 'error';

export interface AgentMetrics {
  latencyMs: number;
  requestId: string;
  agent: string;
  simulated?: boolean;
  [key: string]: unknown;
}

export interface AgentAdapterResult {
  output: unknown;
  metrics?: Partial<AgentMetrics>;
  logs?: string[];
}

export interface AgentStepDefinition {
  id: string;
  agent: string;
  description?: string;
  input?: unknown;
  params?: Record<string, unknown>;
  simulateLatencyMs?: number;
  timeoutMs?: number;
}

export interface AgentResult {
  id: string;
  agent: string;
  status: AgentResultStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  output: unknown;
  metrics: AgentMetrics;
  logs: string[];
  error?: {
    message: string;
    stack?: string;
  };
}

export interface AgentRuntimeContext {
  results: Map<string, AgentResult>;
  metadata?: Record<string, unknown>;
}

export interface AgentRunnerOptions {
  adapters?: Record<string, AgentAdapter>;
  defaultLatencyMs?: number;
  concurrencyLimit?: number;
  failFast?: boolean;
}

export interface AgentRunOptions {
  failFast?: boolean;
}

export type AgentAdapter = (
  step: AgentStepDefinition,
  context: AgentRuntimeContext
) => Promise<AgentAdapterResult>;

const DEFAULT_LATENCY_MS = 160;
const MAX_CONCURRENCY = 8;

export class AgentRunnerError extends Error {
  step: AgentStepDefinition;
  result?: AgentResult;

  constructor(message: string, step: AgentStepDefinition, result?: AgentResult, cause?: unknown) {
    super(message);
    this.name = 'AgentRunnerError';
    this.step = step;
    this.result = result;
    if (cause) {
      // @ts-expect-error - cause is not part of Error in older TS lib targets.
      this.cause = cause;
    }
  }
}

function normaliseContext(context?: AgentRuntimeContext): AgentRuntimeContext {
  if (context && context.results instanceof Map) {
    return context;
  }

  return {
    results: new Map(),
    metadata: context?.metadata ?? {}
  };
}

function clampLatency(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const bounded = Math.max(1, Math.min(2000, Math.round(numeric)));
  return bounded;
}

function resolveLatency(step: AgentStepDefinition, defaultLatency: number): number {
  if (typeof step.simulateLatencyMs === 'number') {
    return clampLatency(step.simulateLatencyMs, defaultLatency);
  }

  const latencyFromParams = step.params?.durationMs ?? step.params?.latencyMs;
  if (typeof latencyFromParams === 'number') {
    return clampLatency(latencyFromParams, defaultLatency);
  }

  if (typeof step.timeoutMs === 'number') {
    return clampLatency(step.timeoutMs * 0.8, defaultLatency);
  }

  return clampLatency(defaultLatency, defaultLatency);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function cloneResult(result: AgentResult): AgentResult {
  return {
    ...result,
    metrics: { ...result.metrics },
    logs: [...result.logs]
  };
}

function createSimulatedAdapter(kind: string, defaultLatency: number): AgentAdapter {
  return async (step) => {
    const targetLatency = resolveLatency(step, defaultLatency);
    // Keep actual waits short (<60ms) so local runs stay fast while metrics preserve intent.
    const waitTime = Math.min(targetLatency, 60);
    if (waitTime > 0) {
      await sleep(waitTime);
    }

    const requestId =
      (typeof step.params?.requestId === 'string' && step.params.requestId) || randomUUID();

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

export const DEFAULT_ADAPTERS: Readonly<Record<string, AgentAdapter>> = Object.freeze({
  api: createSimulatedAdapter('API', DEFAULT_LATENCY_MS),
  event: createSimulatedAdapter('Event', DEFAULT_LATENCY_MS / 2),
  data: createSimulatedAdapter('Data', DEFAULT_LATENCY_MS * 0.75)
});

export class AgentRunner {
  private adapters: Map<string, AgentAdapter>;
  private defaultLatencyMs: number;
  private maxConcurrency: number;
  private failFast: boolean;

  constructor(options: AgentRunnerOptions = {}) {
    this.defaultLatencyMs = options.defaultLatencyMs ?? DEFAULT_LATENCY_MS;
    this.maxConcurrency = Math.max(
      1,
      Math.min(options.concurrencyLimit ?? MAX_CONCURRENCY, MAX_CONCURRENCY)
    );
    this.failFast = options.failFast ?? false;

    const entries: [string, AgentAdapter][] = Object.entries(DEFAULT_ADAPTERS);
    if (options.adapters) {
      for (const [name, adapter] of Object.entries(options.adapters)) {
        entries.push([name, adapter]);
      }
    }

    this.adapters = new Map(entries);
  }

  get concurrencyLimit(): number {
    return this.maxConcurrency;
  }

  registerAdapter(name: string, adapter: AgentAdapter): void {
    if (!name || typeof adapter !== 'function') {
      throw new Error('Adapter name and implementation are required');
    }
    this.adapters.set(name, adapter);
  }

  getAdapter(name: string): AgentAdapter {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new Error(`No adapter registered for agent "${name}"`);
    }
    return adapter;
  }

  async run(
    step: AgentStepDefinition,
    context?: AgentRuntimeContext,
    options?: AgentRunOptions
  ): Promise<AgentResult> {
    const runtimeContext = normaliseContext(context);
    const adapter = this.getAdapter(step.agent);
    const failFast = options?.failFast ?? this.failFast;

    const startedAt = new Date();
    const perfStart = performance.now();

    try {
      const adapterResult = await adapter(step, runtimeContext);
      const completedAt = new Date();
      const durationMs =
        adapterResult.metrics?.latencyMs ?? Math.max(1, Math.round(performance.now() - perfStart));

      const result: AgentResult = {
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
            (typeof adapterResult.metrics?.requestId === 'string' &&
              adapterResult.metrics.requestId) ||
            randomUUID(),
          agent: step.agent,
          simulated: adapterResult.metrics?.simulated ?? false,
          ...adapterResult.metrics
        },
        logs: adapterResult.logs ?? []
      };

      runtimeContext.results.set(step.id, cloneResult(result));
      return result;
    } catch (error) {
      const completedAt = new Date();
      const failure: AgentResult = {
        id: step.id,
        agent: step.agent,
        status: 'error',
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: Math.max(1, Math.round(performance.now() - perfStart)),
        output: null,
        metrics: {
          latencyMs: Math.max(1, Math.round(performance.now() - perfStart)),
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

export function createDefaultAgentRunner(options: AgentRunnerOptions = {}): AgentRunner {
  return new AgentRunner(options);
}

export default AgentRunner;
