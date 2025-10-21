import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { run } from '../../app/cli/release-preflight.mjs';

async function createTempDir() {
  return mkdtemp(join(tmpdir(), 'release-preflight-'));
}

function createMockRegistryServer({ healthy = true } = {}) {
  const server = createServer((request, response) => {
    if (request.url === '/health') {
      if (healthy) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok' }));
      } else {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'error' }));
      }
      return;
    }

    if (request.url?.startsWith('/resolve')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'not_found' }));
  });

  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address) {
        resolvePromise({ server, port: address.port });
      }
    });
  });
}

async function writeJsonl(filePath, events) {
  const content = events.map((event) => JSON.stringify(event)).join('\n');
  await writeFile(filePath, content, 'utf8');
}

async function writeBudgets(filePath) {
  await writeFile(
    filePath,
    JSON.stringify(
      {
        budgets: {
          wsap: {
            ingest: {
              avg: 500,
              p95: 800,
            },
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  );
}

async function writeLcov(filePath, { linesHit = 9, linesFound = 10 } = {}) {
  const content = [
    'TN:',
    `SF:${filePath}.fixture.js`,
    'FNF:1',
    'FNH:1',
    `LF:${linesFound}`,
    `LH:${linesHit}`,
    'BRF:2',
    'BRH:2',
    'end_of_record',
  ].join('\n');
  await writeFile(filePath, content, 'utf8');
}

function buildPolicy({ metricsPath, budgetsPath, lcovPath, baseUrl }) {
  return {
    performance: {
      logPath: metricsPath,
      budgetsPath,
      maxErrorRate: 0.2,
    },
    coverage: {
      lcovPath,
      minimums: {
        lines: 0.8,
        functions: 0.8,
        branches: 0.5,
      },
    },
    health: {
      timeoutMs: 1000,
      endpoints: [
        {
          name: 'registry-health',
          url: `${baseUrl}/health`,
          expect: { status: 'ok' },
        },
        {
          name: 'registry-resolve',
          url: `${baseUrl}/resolve`,
          expect: { httpStatus: 200 },
        },
      ],
    },
    artifacts: {
      maxAgeMinutes: 120,
    },
  };
}

describe('release preflight CLI', () => {
  let tempDir;
  let server;
  let baseUrl;

  beforeEach(async () => {
    tempDir = await createTempDir();
    const { server: createdServer, port } = await createMockRegistryServer();
    server = createdServer;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolvePromise) => server.close(resolvePromise));
    }
    await rm(tempDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  async function seedArtifacts({ linesHit = 9, linesFound = 10 } = {}) {
    const metricsPath = join(tempDir, 'session.jsonl');
    await writeJsonl(metricsPath, [
      { tool: 'wsap', step: 'ingest', ms: 120, ok: true },
      { tool: 'wsap', step: 'ingest', ms: 140, ok: true },
      { tool: 'wsap', step: 'ingest', ms: 160, ok: true },
    ]);

    const budgetsPath = join(tempDir, 'budgets.json');
    await writeBudgets(budgetsPath);

    const lcovPath = join(tempDir, 'lcov.info');
    await writeLcov(lcovPath, { linesHit, linesFound });

    const policyPath = join(tempDir, 'policy.json');
    await writeFile(
      policyPath,
      JSON.stringify(
        buildPolicy({ metricsPath, budgetsPath, lcovPath, baseUrl }),
        null,
        2,
      ),
      'utf8',
    );

    return { metricsPath, budgetsPath, lcovPath, policyPath };
  }

  it('returns EXIT_CODES.OK when all gates pass', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { policyPath } = await seedArtifacts();
    const code = await run(['--policy', policyPath]);
    expect(code).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Release preflight: PASS'));
  });

  it('fails when coverage minimums are not met', async () => {
    const { policyPath } = await seedArtifacts({ linesHit: 6, linesFound: 10 });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const code = await run(['--policy', policyPath]);
    expect(code).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Release preflight: FAIL'));
    const tableOutput = logSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(tableOutput).toContain('coverage');
  });

  it('fails when health endpoint is unreachable', async () => {
    const { policyPath } = await seedArtifacts();
    await new Promise((resolvePromise) => server.close(resolvePromise));
    server = null;

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const code = await run(['--policy', policyPath]);
    expect(code).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Release preflight: FAIL'));
    const combinedLogs = logSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(combinedLogs).toContain('health');
  });
});
