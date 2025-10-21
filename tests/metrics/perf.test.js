import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  collectWorkspacePerfMetrics,
  evaluateBudgets,
  summarizeMetrics,
} from '../../src/metrics/perf.js';

describe('metrics/perf shared helpers', () => {
  it('summarizes metrics by tool and step', () => {
    const summary = summarizeMetrics([
      { tool: 'wsap', step: 'ingest', ms: 100, ok: true },
      { tool: 'wsap', step: 'ingest', ms: 200, ok: false },
      { tool: 'wsap', step: 'publish', ms: 150, ok: true },
    ]);

    expect(summary).toEqual([
      expect.objectContaining({
        tool: 'wsap',
        step: 'ingest',
        count: 2,
        okCount: 1,
        errorCount: 1,
        p95: expect.any(Number),
      }),
      expect.objectContaining({
        tool: 'wsap',
        step: 'publish',
        count: 1,
        okCount: 1,
        errorCount: 0,
      }),
    ]);
  });

  it('evaluates budgets and reports violations', () => {
    const summary = [
      { tool: 'wsap', step: 'ingest', avg: 200, p95: 500 },
    ];
    const budgets = {
      wsap: {
        ingest: { avg: 150, p95: 400 },
      },
    };

    const evaluation = evaluateBudgets(summary, budgets);
    expect(evaluation.pass).toBe(false);
    expect(evaluation.violations).toEqual([
      expect.objectContaining({ metric: 'avg' }),
      expect.objectContaining({ metric: 'p95' }),
    ]);
  });

  it('collects workspace metrics from JSONL logs', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'perf-workspace-'));
    try {
      const artifactsDir = path.join(workspace, 'artifacts');
      await mkdir(artifactsDir, { recursive: true });

      const logPath = path.join(artifactsDir, 'metrics.jsonl');
      const entry = JSON.stringify({
        message: 'Discovery run',
        duration: 120,
      });
      await writeFile(logPath, `${entry}\n`, 'utf8');

      const collector = await collectWorkspacePerfMetrics({
        workspace,
        fallbackToMocks: false,
      });
      const summary = collector.getSummary();

      expect(summary.discovery.total).toBe(1);
      expect(summary.discovery.p95).toBeGreaterThan(0);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
