import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtemp, rm, mkdir, writeFile, utimes, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRetentionGc } from '../../scripts/cleanup/gc-artifacts.mjs';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe('scripts/cleanup/gc-artifacts', () => {
  let workspace;
  let now;

  beforeEach(async () => {
    now = Date.now();
    workspace = await mkdtemp(join(tmpdir(), 'gc-artifacts-'));
    await mkdir(join(workspace, 'app/config'), { recursive: true });
    await mkdir(join(workspace, 'artifacts/perf'), { recursive: true });

    const config = {
      defaults: {
        keepLatest: 1,
        maxAgeDays: 7,
        maxTotalSizeMB: 1,
        protect: ['latest.jsonl']
      },
      targets: [
        {
          id: 'perf-artifacts',
          path: 'artifacts/perf',
          keepLatest: 1,
          maxAgeDays: 7,
          maxTotalSizeMB: 1
        }
      ]
    };

    await writeFile(
      join(workspace, 'app/config/retention.json'),
      JSON.stringify(config, null, 2),
      'utf8'
    );
  });

  afterEach(async () => {
    if (workspace) {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  async function createSession(name, { ageDays, sizeBytes }) {
    const sessionDir = join(workspace, 'artifacts/perf', name);
    await mkdir(sessionDir, { recursive: true });
    const metricsPath = join(sessionDir, 'metrics.jsonl');
    await writeFile(metricsPath, 'x'.repeat(sizeBytes), 'utf8');

    const mtimeSeconds = (now - ageDays * MS_PER_DAY) / 1000;
    await utimes(metricsPath, mtimeSeconds, mtimeSeconds);
    await utimes(sessionDir, mtimeSeconds, mtimeSeconds);
  }

  async function createLatestPointer(ageDays) {
    const latestPath = join(workspace, 'artifacts/perf/latest.jsonl');
    await writeFile(latestPath, '{"summary":true}', 'utf8');
    const mtimeSeconds = (now - ageDays * MS_PER_DAY) / 1000;
    await utimes(latestPath, mtimeSeconds, mtimeSeconds);
  }

  async function exists(relativePath) {
    try {
      await stat(join(workspace, relativePath));
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  it('identifies aged entries during dry-run without deleting data', async () => {
    await createSession('session-old', { ageDays: 14, sizeBytes: 600_000 });
    await createSession('session-mid', { ageDays: 6, sizeBytes: 600_000 });
    await createSession('session-recent', { ageDays: 1, sizeBytes: 600_000 });
    await createLatestPointer(0.5);

    const summary = await runRetentionGc({
      workspace,
      dryRun: true,
      now
    });

    const target = summary.targets[0];
    const candidatePaths = target.candidateEntries.map((entry) => entry.path);

    expect(summary.dryRun).toBe(true);
    expect(candidatePaths).toEqual(
      expect.arrayContaining([
        'artifacts/perf/session-old',
        'artifacts/perf/session-mid'
      ])
    );
    expect(candidatePaths).not.toContain('artifacts/perf/session-recent');
    expect(await exists('artifacts/perf/session-old')).toBe(true);
    expect(await exists('artifacts/perf/session-mid')).toBe(true);
    expect(await exists('artifacts/perf/latest.jsonl')).toBe(true);
  });

  it('removes eligible entries when dryRun is false', async () => {
    await createSession('session-old', { ageDays: 14, sizeBytes: 600_000 });
    await createSession('session-mid', { ageDays: 6, sizeBytes: 600_000 });
    await createSession('session-recent', { ageDays: 1, sizeBytes: 600_000 });
    await createLatestPointer(0.5);

    const summary = await runRetentionGc({
      workspace,
      dryRun: false,
      now
    });

    const target = summary.targets[0];

    expect(summary.dryRun).toBe(false);
    expect(target.removedEntries).toEqual(
      expect.arrayContaining([
        'artifacts/perf/session-old',
        'artifacts/perf/session-mid'
      ])
    );
    expect(await exists('artifacts/perf/session-old')).toBe(false);
    expect(await exists('artifacts/perf/session-mid')).toBe(false);
    expect(await exists('artifacts/perf/session-recent')).toBe(true);
    expect(await exists('artifacts/perf/latest.jsonl')).toBe(true);
  });
});
