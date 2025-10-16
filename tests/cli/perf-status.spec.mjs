import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { MetricsIngestWriter, logPerformanceEvent } from '../../app/services/obs/ingest.mjs';
import {
  EXIT_CODES,
  run,
  summarizeMetrics,
  evaluateBudgets,
  loadLogEntries,
  resolveLogFile,
} from '../../app/cli/perf-status.mjs';

async function createTempRoot() {
  return mkdtemp(join(tmpdir(), 'perf-status-'));
}

describe('Metrics ingest writer', () => {
  let tempRoot;

  beforeEach(async () => {
    tempRoot = await createTempRoot();
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('writes JSONL events to the expected day/session path', async () => {
    const writer = new MetricsIngestWriter({ sessionId: 'session-123', root: tempRoot });

    const ts = '2025-10-16T08:00:00.000Z';
    const result = await writer.log({
      ts,
      tool: 'wsap',
      step: 'ingest',
      ms: 123.4,
      ok: true,
    });

    expect(result.path).toBe(resolve(tempRoot, '2025-10-16', 'session-123.jsonl'));
    const fileContents = await readFile(result.path, 'utf8');
    expect(fileContents.trim()).toBe(
      JSON.stringify({
        ts,
        sessionId: 'session-123',
        tool: 'wsap',
        step: 'ingest',
        ms: 123.4,
        ok: true,
      }),
    );
  });
});

describe('perf-status CLI', () => {
  let tempRoot;
  const sessionId = 'session-xyz';

  beforeEach(async () => {
    tempRoot = await createTempRoot();
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  async function seedSampleEvents(root, session = sessionId) {
    const baseEvent = {
      sessionId: session,
      tool: 'wsap',
      step: 'ingest',
      ok: true,
    };

    await logPerformanceEvent({ ...baseEvent, ts: '2025-10-16T10:00:00.000Z', ms: 100 }, { root });
    await logPerformanceEvent({ ...baseEvent, ts: '2025-10-16T10:01:00.000Z', ms: 200 }, { root });
    await logPerformanceEvent({ ...baseEvent, ts: '2025-10-16T10:02:00.000Z', ms: 300, ok: false, err: 'Timeout' }, { root });
  }

  it('summarizes metrics and returns EXIT_CODES.OK when budgets pass', async () => {
    await seedSampleEvents(tempRoot);

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const code = await run(['--root', tempRoot, '--session', sessionId]);
    expect(code).toBe(EXIT_CODES.OK);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Session: session-xyz'));

    const { path: logPath } = await resolveLogFile({ root: tempRoot, sessionId });
    const entries = await loadLogEntries(logPath);
    const summary = summarizeMetrics(entries);
    const evaluation = evaluateBudgets(summary, {
      wsap: {
        ingest: {
          avg: 400,
          p95: 600,
        },
      },
    });
    expect(evaluation.pass).toBe(true);
  });

  it('returns NO_LOG exit code when no logs exist', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const code = await run(['--root', tempRoot, '--session', sessionId]);
    expect(code).toBe(EXIT_CODES.NO_LOG);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns BUDGET_FAIL when metrics exceed budgets', async () => {
    await seedSampleEvents(tempRoot);

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const budgetsPath = join(tempRoot, 'budgets.json');
    await logPerformanceEvent({
      sessionId,
      tool: 'wsap',
      step: 'ingest',
      ms: 800,
      ok: true,
      ts: '2025-10-16T10:05:00.000Z',
    }, { root: tempRoot });

    await writeBudgetsFile(budgetsPath, {
      wsap: {
        ingest: {
          avg: 200,
          p95: 350,
        },
      },
    });

    const code = await run(['--root', tempRoot, '--session', sessionId, '--budgets', budgetsPath]);
    expect(code).toBe(EXIT_CODES.BUDGET_FAIL);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Budgets: FAIL'));
  });
});

async function writeBudgetsFile(filePath, budgets) {
  const payload = JSON.stringify({ budgets }, null, 2);
  await writeFile(filePath, payload, 'utf8');
}
