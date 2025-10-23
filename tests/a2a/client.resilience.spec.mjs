import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import { setTimeout as wait } from 'node:timers/promises';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { callAgent, resetA2aState, getCircuitBreakerSnapshot } from '../../app/libs/a2a/client.mjs';
import { startServer } from '../../packages/runtime/registry/server.mjs';
import { openDb } from '../../packages/runtime/registry/db.mjs';
import { registerManifest } from '../api/helpers/registry-context.mjs';

jest.setTimeout(20000);

async function createTempDir(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

async function startRegistry(tempDir) {
  const dbPath = join(tempDir, 'registry.sqlite');
  const schemaPath = fileURLToPath(new URL('../../scripts/db/schema.sql', import.meta.url));
  const schemaSql = await readFile(schemaPath, 'utf8');
  
  // Initialize SQLite database with schema
  const db = await openDb({ dbPath });
  await db.exec(schemaSql);
  await db.close();

  const apiKey = 'test-registry-key';
  const runtime = await startServer({
    apiKey,
    dbPath,
    host: '127.0.0.1',
    port: 0,
    registryConfigPath: null,
    requireProvenance: false,
    provenanceKeys: [],
    rateLimitConfigPath: null,
    rateLimit: { windowMs: 60000, max: 1000 },
  });

  const runtimeHost =
    runtime.host && runtime.host !== '::' && runtime.host !== '0.0.0.0'
      ? runtime.host
      : '127.0.0.1';
  const url = `http://${runtimeHost}:${runtime.port}`;

  return {
    apiKey,
    dbPath,
    url,
    app: runtime.app,
    close: () => runtime.close(),
  };
}

async function startEchoAgent(options = {}) {
  const app = express();
  app.use(express.json());

  const state = {
    callCount: 0,
    lastCorrelationId: null,
  };

  app.post('/a2a/echo', (request, response) => {
    state.callCount += 1;
    state.lastCorrelationId = request.get('x-correlation-id') ?? null;

    if (options.failures && state.callCount <= options.failures) {
      const status = options.failureStatus ?? 503;
      return response.status(status).json({
        error: 'simulated_failure',
        attempt: state.callCount,
      });
    }

    if (typeof options.outcome === 'function') {
      return options.outcome({ request, response, state });
    }

    const message = request.body?.payload?.message ?? null;
    return response.json({
      echo: message,
      call: state.callCount,
      correlationId: state.lastCorrelationId,
    });
  });

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;

  return {
    url,
    state,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}

function buildAgentCard(endpoint, capability = 'protocol:echo@1') {
  return {
    id: 'agent.echo.test',
    name: 'Echo Agent',
    version: '1.0.0',
    capabilities: {
      tools: [
        {
          name: 'echo',
          capability,
          urn: capability,
        },
      ],
      resources: [],
    },
    communication: {
      supported: ['http'],
      endpoints: {
        default: endpoint,
      },
    },
    authorization: {
      delegation_supported: false,
      signature_algorithm: null,
    },
  };
}

async function registerAgent(registry, { urn, card }) {
  await registerManifest(registry.app, {
    urn,
    manifest: card,
    apiKey: registry.apiKey,
    issuer: 'test-key',
  });
}

describe('A2A client resilience', () => {
  let tempDir;
  let logRoot;
  let registry;
  let agent;

  beforeEach(async () => {
    tempDir = await createTempDir('a2a-client-');
    logRoot = join(tempDir, 'logs');
    resetA2aState();
  });

  afterEach(async () => {
    if (agent) {
      await agent.close();
      agent = null;
    }
    if (registry) {
      await registry.close();
      registry = null;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it('completes a successful call with correlation and metrics logging', async () => {
    registry = await startRegistry(tempDir);
    agent = await startEchoAgent();

    const urn = 'urn:agent:test:echo';
    await registerAgent(registry, {
      urn,
      card: buildAgentCard(agent.url),
    });

    const sessionId = 'session-success';
    const result = await callAgent(
      urn,
      'echo',
      { message: 'hello world' },
      {
        registryUrl: registry.url,
        apiKey: registry.apiKey,
        timeout: 2000,
        sessionId,
        logRoot,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      echo: 'hello world',
      call: 1,
    });
    expect(result.trace.correlationId).toBeTruthy();
    expect(agent.state.lastCorrelationId).toBe(result.trace.correlationId);

    const today = new Date().toISOString().slice(0, 10);
    const logPath = join(logRoot, today, `${sessionId}.jsonl`);
    const contents = await readFile(logPath, 'utf8');
    const lines = contents.trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    const entry = JSON.parse(lines.at(-1));
    expect(entry).toMatchObject({
      sessionId,
      tool: 'a2a',
      step: 'echo',
      ok: true,
    });
  });

  it('retries failed attempts before succeeding', async () => {
    registry = await startRegistry(tempDir);
    agent = await startEchoAgent({ failures: 1 });

    const urn = 'urn:agent:test:retry';
    await registerAgent(registry, {
      urn,
      card: buildAgentCard(agent.url),
    });

    const result = await callAgent(
      urn,
      'echo',
      { message: 'retry-me' },
      {
        registryUrl: registry.url,
        apiKey: registry.apiKey,
        timeout: 2000,
        retries: 2,
        sessionId: 'session-retry',
        logRoot,
        backoff: {
          base: 10,
          max: 20,
          jitter: 0,
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(agent.state.callCount).toBe(2);
    expect(result.trace.attempts).toHaveLength(2);
    expect(result.trace.attempts[0].ok).toBe(false);
    expect(result.trace.attempts[1].ok).toBe(true);
  });

  it('opens the circuit breaker after consecutive failures', async () => {
    registry = await startRegistry(tempDir);
    agent = await startEchoAgent({
      failures: Number.POSITIVE_INFINITY,
      failureStatus: 500,
    });

    const urn = 'urn:agent:test:circuit';
    await registerAgent(registry, {
      urn,
      card: buildAgentCard(agent.url),
    });

    const callOptions = {
      registryUrl: registry.url,
      apiKey: registry.apiKey,
      timeout: 1000,
      retries: 0,
      sessionId: 'session-circuit',
      logRoot,
      circuitBreaker: {
        failureThreshold: 2,
        cooldownMs: 150,
      },
    };

    const first = await callAgent(urn, 'echo', { message: 'fail-1' }, callOptions);
    expect(first.ok).toBe(false);
    expect(agent.state.callCount).toBe(1);

    const second = await callAgent(urn, 'echo', { message: 'fail-2' }, callOptions);
    expect(second.ok).toBe(false);
    expect(agent.state.callCount).toBe(2);

    const third = await callAgent(urn, 'echo', { message: 'blocked' }, callOptions);
    expect(third.ok).toBe(false);
    expect(third.error?.code).toBe('circuit_open');
    expect(agent.state.callCount).toBe(2);

    await wait(200);

    const fourth = await callAgent(urn, 'echo', { message: 'half-open' }, callOptions);
    expect(fourth.ok).toBe(false);
    expect(agent.state.callCount).toBe(3);

    const snapshot = getCircuitBreakerSnapshot(urn);
    expect(snapshot?.state).toBe('open');
    expect(snapshot?.failureCount).toBeGreaterThanOrEqual(1);
  });

  it('resolves capabilities and caches responses', async () => {
    registry = await startRegistry(tempDir);
    agent = await startEchoAgent();

    const capability = 'protocol:echo@2';
    const urn = 'urn:agent:test:capability';
    await registerAgent(registry, {
      urn,
      card: buildAgentCard(agent.url, capability),
    });

    const result = await callAgent(
      capability,
      'echo',
      { message: 'cap-call' },
      {
        registryUrl: registry.url,
        apiKey: registry.apiKey,
        timeout: 2000,
        sessionId: 'session-cap',
        logRoot,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.trace.resolution?.urn).toBe(urn);
    expect(result.trace.resolution?.capability).toBe(capability);

    // Second call should hit cache and not increase registry load.
    agent.state.callCount = 0;
    const second = await callAgent(
      capability,
      'echo',
      { message: 'cap-call-2' },
      {
        registryUrl: registry.url,
        apiKey: registry.apiKey,
        timeout: 2000,
        sessionId: 'session-cap',
        logRoot,
      },
    );
    expect(second.ok).toBe(true);
    expect(agent.state.callCount).toBe(1);
  });
});
