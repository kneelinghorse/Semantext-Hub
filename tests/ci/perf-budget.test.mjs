import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtemp, rm, writeFile, mkdir, utimes } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

async function runPerfBudget(filePath) {
  return execFileAsync('node', ['scripts/ci/perf-budget.js', '--file', filePath], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      // Ensure consistent budgets for test assertions
      PERF_BUDGET_DISCOVERY_P95: '1000',
      PERF_BUDGET_MCP_P95: '3000',
      // Disable registry/resolve requirements for unit tests
      PERF_BUDGET_REGISTRY_GET_P95: 'NaN',
      PERF_BUDGET_RESOLVE_P95: 'NaN'
    },
    maxBuffer: 1024 * 1024
  });
}

describe('scripts/ci/perf-budget.js', () => {
  let tempDir;
  let summaryPath;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'perf-budget-'));
    await mkdir(tempDir, { recursive: true });
    summaryPath = path.join(tempDir, 'summary.json');
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('passes when discovery and MCP metrics are present', async () => {
    const summary = {
      discovery: { p95: 900.12, total: 12 },
      mcp: { p95: 2100.45, total: 8 }
    };
    await writeFile(summaryPath, JSON.stringify(summary), 'utf8');

    const { stdout } = await runPerfBudget(summaryPath);
    expect(stdout).toContain('✅ Performance budgets met');
    expect(stdout).toContain('discovery.p95 900.12ms ≤ 1000ms');
    expect(stdout).toContain('mcp.p95 2100.45ms ≤ 3000ms');
  });

  it('fails when required discovery metrics are missing', async () => {
    const summary = {
      mcp: { p95: 1900.1, total: 5 }
    };
    await writeFile(summaryPath, JSON.stringify(summary), 'utf8');

    await expect(runPerfBudget(summaryPath)).rejects.toMatchObject({
      stderr: expect.stringContaining('Missing required performance metrics'),
      code: 1
    });
  });

  it('fails when performance summary is stale', async () => {
    const summary = {
      discovery: { p95: 850.5, total: 10 },
      mcp: { p95: 2500.75, total: 7 }
    };
    await writeFile(summaryPath, JSON.stringify(summary), 'utf8');

    const staleDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    await utimes(summaryPath, staleDate, staleDate);

    await expect(runPerfBudget(summaryPath)).rejects.toMatchObject({
      stderr: expect.stringContaining('Performance metrics file is stale'),
      code: 1
    });
  });
});
