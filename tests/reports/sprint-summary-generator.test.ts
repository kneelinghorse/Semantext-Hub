import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { generateSprintSummary } from '../../scripts/reports/sprint-summary-generator';

describe('sprint-summary-generator', () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const workspace = path.resolve(testDir, '../../..');

  it('generates markdown with required sections for Sprint 13', async () => {
    const result = await generateSprintSummary({
      workspace,
      sprintId: 'Sprint 13',
      writeToDisk: false,
      includeLogs: false
    });

    expect(result.markdown).toContain('# Sprint 13:');
    expect(result.markdown).toContain('## Executive Summary');
    expect(result.markdown).toContain('## Missions Delivered');
    expect(result.markdown).toContain('| M13.1');
    expect(result.validation.missingHeadings).toHaveLength(0);
    expect(result.metrics.missionsTotal).toBeGreaterThan(0);
  });

  it('writes the summary to disk when requested', async () => {
    const outputPath = path.join(workspace, 'docs', 'sprints', 'sprint-13-summary.test.md');

    try {
      const result = await generateSprintSummary({
        workspace,
        sprintId: 'Sprint 13',
        outputPath,
        writeToDisk: true,
        includeLogs: false
      });

      const written = await fs.readFile(result.outputPath, 'utf8');

      expect(written).toContain('Sprint 13');
      expect(result.outputPath).toBe(outputPath);
    } finally {
      await fs.unlink(outputPath).catch(() => undefined);
    }
  });
});
