import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..', '..');
const SCRIPT_PATH = resolve(ROOT_DIR, 'app', 'ci', 'perf-gate.sh');

async function createTempDir() {
  return mkdtemp(join(tmpdir(), 'perf-gate-'));
}

async function writeLog(filePath, entries) {
  const payload = entries.map((entry) => JSON.stringify(entry)).join('\n');
  await writeFile(filePath, `${payload}\n`, 'utf8');
}

async function writeBudgets(filePath, budgets) {
  const payload = {
    budgets,
  };
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function runGate(args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(SCRIPT_PATH, args, {
      cwd: ROOT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...options.env,
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      rejectPromise(error);
    });

    child.on('close', (code) => {
      resolvePromise({ code, stdout, stderr });
    });
  });
}

describe('app/ci/perf-gate.sh', () => {
  let tempDir;
  let logPath;
  let budgetsPath;

  beforeEach(async () => {
    tempDir = await createTempDir();
    logPath = join(tempDir, 'session.jsonl');
    budgetsPath = join(tempDir, 'budgets.json');
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('passes when metrics are within avg and p95 budgets', async () => {
    await writeLog(logPath, [
      { ts: '2025-10-16T10:00:00Z', sessionId: 's1', tool: 'wsap', step: 'ingest', ms: 120, ok: true },
      { ts: '2025-10-16T10:01:00Z', sessionId: 's1', tool: 'wsap', step: 'ingest', ms: 140, ok: true },
      { ts: '2025-10-16T10:02:00Z', sessionId: 's1', tool: 'wsap', step: 'ingest', ms: 160, ok: true },
    ]);

    await writeBudgets(budgetsPath, {
      wsap: {
        ingest: {
          avg: 200,
          p95: 300,
        },
      },
    });

    const result = await runGate(['--log', logPath, '--tool', 'wsap', '--step', 'ingest', '--budgets', budgetsPath]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('[OK] avg within budget');
    expect(result.stdout).toContain('[OK] p95 within budget');
    expect(result.stderr.trim()).toBe('');
  });

  it('fails with code 3 when p95 exceeds the provided budget override', async () => {
    await writeLog(logPath, [
      { ts: '2025-10-16T11:00:00Z', sessionId: 's1', tool: 'wsap', step: 'ingest', ms: 500, ok: true },
      { ts: '2025-10-16T11:01:00Z', sessionId: 's1', tool: 'wsap', step: 'ingest', ms: 700, ok: true },
      { ts: '2025-10-16T11:02:00Z', sessionId: 's1', tool: 'wsap', step: 'ingest', ms: 900, ok: true },
    ]);

    const result = await runGate([
      '--log',
      logPath,
      '--tool',
      'wsap',
      '--step',
      'ingest',
      '--avg-budget',
      '1000',
      '--p95-budget',
      '750',
    ]);

    expect(result.code).toBe(3);
    expect(result.stdout).toContain('[FAIL] p95 exceeded');
    expect(result.stderr.trim()).toBe('');
  });

  it('fails with code 2 when no matching entries exist', async () => {
    await writeLog(logPath, [
      { ts: '2025-10-16T12:00:00Z', sessionId: 's1', tool: 'wsap', step: 'plan', ms: 220, ok: true },
    ]);

    const result = await runGate(['--log', logPath, '--tool', 'wsap', '--step', 'ingest', '--p95-budget', '500']);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('no entries found');
  });
});
