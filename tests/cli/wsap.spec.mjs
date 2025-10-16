import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { runWsap } from '../../app/cli/wsap.mjs';

describe('wsap CLI orchestration', () => {
  let tempRoot;

  beforeAll(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), 'wsap-run-'));
  });

  afterAll(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  test('executes end-to-end pipeline and enforces budgets', async () => {
    const result = await runWsap({
      artifactRoot: tempRoot,
      open: false,
    });

    expect(result.success).toBe(true);
    expect(result.sessionId).toMatch(/^wsap-/);
    expect(result.evaluation).toBeDefined();
    expect(result.evaluation?.pass).toBe(true);
    expect(result.errors.length).toBe(0);

    await expect(stat(result.artifacts.catalogGraph)).resolves.toBeDefined();
    await expect(stat(result.artifacts.drawioDiagram)).resolves.toBeDefined();
    await expect(stat(result.artifacts.cytoscapeExport)).resolves.toBeDefined();
    await expect(stat(result.artifacts.docsSummary)).resolves.toBeDefined();

    const summary = await readFile(result.artifacts.docsSummary, 'utf8');
    expect(summary).toContain(`WSAP Session ${result.sessionId}`);
    expect(summary).toContain('Performance Budgets: PASS');
  });
});
