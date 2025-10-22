import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { openDb } from '../../packages/runtime/registry/db.mjs';

const API_KEY = 'test-key';

let registryConfigPath;

const SERVER_SCRIPT = path.resolve(process.cwd(), 'tests/runtime/helpers/registry-test-server.mjs');

const startRegistryProcess = async ({ configPath, apiKey, port }) => {
  const child = fork(
    SERVER_SCRIPT,
    [configPath, apiKey, String(port)],
    { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
  );

  const onExit = (code, signal) => {
    throw new Error(`registry server exited prematurely (${code ?? 'null'}:${signal ?? 'null'})`);
  };

  child.once('exit', onExit);

  const message = await once(child, 'message');
  child.off('exit', onExit);

  const [payload] = message;
  if (!payload || payload.type !== 'ready') {
    child.kill('SIGKILL');
    throw new Error('registry server failed to start');
  }

  return { child, port: payload.port };
};

const stopRegistryProcess = async (child) => {
  if (!child || child.killed) return;
  const exitPromise = once(child, 'exit').catch(() => {});
  child.send({ type: 'shutdown' });
  await Promise.race([
    exitPromise,
    sleep(1_000).then(() => {
      if (!child.killed) child.kill('SIGKILL');
    }),
  ]);
};

const ensureSchema = async (dbPath) => {
  const schema = fs.readFileSync(path.resolve(process.cwd(), 'scripts/db/schema.sql'), 'utf8');
  const db = await openDb({ dbPath });
  try {
    await db.exec(schema);
  } finally {
    await db.close();
  }
};

describe('SQLite Registry', () => {
  let testDbPath;

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    testDbPath = path.resolve(process.cwd(), `var/test-registry-${suffix}.sqlite`);
    registryConfigPath = path.resolve(process.cwd(), `var/test-registry-config-${suffix}.json`);

    const registryConfig = {
      dbPath: testDbPath,
      pragmas: { journal_mode: 'WAL', synchronous: 'NORMAL' },
    };
    fs.writeFileSync(registryConfigPath, JSON.stringify(registryConfig));
    await ensureSchema(testDbPath);
  });

  afterEach(async () => {
    try {
      if (registryConfigPath && fs.existsSync(registryConfigPath)) {
        fs.unlinkSync(registryConfigPath);
      }
      if (testDbPath && fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
      if (testDbPath && fs.existsSync(`${testDbPath}-wal`)) {
        fs.unlinkSync(`${testDbPath}-wal`);
      }
      if (testDbPath && fs.existsSync(`${testDbPath}-shm`)) {
        fs.unlinkSync(`${testDbPath}-shm`);
      }
    } catch {}
  });

  const requestJson = async (url, options = {}) => {
    const response = await fetch(url, options);
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (error) {
      throw new Error(`Failed to parse JSON for ${url}: ${error.message}`);
    }
    if (!response.ok) {
      throw new Error(`Request failed for ${url}: ${response.status} ${response.statusText} :: ${text}`);
    }
    return { response, json };
  };

  test('concurrency: 50 parallel PUTs succeed and last write wins', async () => {
    const { child, port } = await startRegistryProcess({
      configPath: registryConfigPath,
      apiKey: API_KEY,
      port: 4241,
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    const urn = 'urn:protocol:api:concurrency-demo:1.0.0';
    const bodies = Array.from({ length: 50 }, (_, i) => ({
      v: i,
      capabilities: ['concurrency'],
    }));

    const results = await Promise.allSettled(
      bodies.map(async (body) => {
        const res = await fetch(`${baseUrl}/v1/registry/${encodeURIComponent(urn)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error(`Unexpected status ${res.status}`);
        }
      }),
    );

    const failures = results.filter((r) => r.status === 'rejected');
    expect(failures.length).toBe(0);

    const finalBody = {
      v: 999,
      capabilities: ['concurrency', 'final'],
      marker: 'final-write',
    };
    const finalDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify(finalBody))
      .digest('hex');

    const finalPut = await fetch(`${baseUrl}/v1/registry/${encodeURIComponent(urn)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify(finalBody),
    });
    expect(finalPut.ok).toBe(true);

    const { json: manifest } = await requestJson(
      `${baseUrl}/v1/registry/${encodeURIComponent(urn)}`,
      {
        headers: { 'X-API-Key': API_KEY },
      },
    );

    expect(manifest).toEqual(
      expect.objectContaining({
        urn,
        digest: finalDigest,
        body: finalBody,
      }),
    );

    await stopRegistryProcess(child);
  }, 30000);

  test('crash/restart: DB persists and GET/resolve remain consistent', async () => {
    const urn = 'urn:protocol:api:crash:1.0.0';
    const manifest = { x: 1, capabilities: ['x'] };

    const initial = await startRegistryProcess({
      configPath: registryConfigPath,
      apiKey: API_KEY,
      port: 4242,
    });

    const baseUrl = `http://127.0.0.1:${initial.port}`;

    const putResponse = await fetch(`${baseUrl}/v1/registry/${encodeURIComponent(urn)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify(manifest),
    });
    expect(putResponse.ok).toBe(true);

    // Simulate crash (hard kill)
    initial.child.kill('SIGKILL');
    await once(initial.child, 'exit').catch(() => {});

    const restarted = await startRegistryProcess({
      configPath: registryConfigPath,
      apiKey: API_KEY,
      port: 4243,
    });

    const restartBaseUrl = `http://127.0.0.1:${restarted.port}`;

    const { json: manifestAfter } = await requestJson(
      `${restartBaseUrl}/v1/registry/${encodeURIComponent(urn)}`,
      { headers: { 'X-API-Key': API_KEY } },
    );

    expect(manifestAfter.body).toEqual(manifest);

    const { json: resolved } = await requestJson(
      `${restartBaseUrl}/v1/resolve?urn=${encodeURIComponent(urn)}`,
      { headers: { 'X-API-Key': API_KEY } },
    );

    expect(resolved).toEqual(
      expect.objectContaining({
        urn,
        manifest,
        capabilities: ['x'],
      }),
    );

    await stopRegistryProcess(restarted.child);
  });
});
