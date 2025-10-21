import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { run as runCanary } from '../../app/cli/release-canary.mjs';
import { loadManifestExtend } from '../../app/cli/release-rollback.mjs';

async function seedManifest(path) {
  await writeFile(
    path,
    JSON.stringify(
      {
        annotations: {},
        audit: [],
      },
      null,
      2,
    ),
    'utf8',
  );
}

function createFetchMock({ ok = true, status = 200, payload = { status: 'ok' } } = {}) {
  return jest.fn().mockImplementation(async () => ({
    ok,
    status,
    async json() {
      return payload;
    },
  }));
}

describe('release canary + rollback', () => {
  let tempDir;
  let manifestPath;
  let logsDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'release-canary-'));
    manifestPath = join(tempDir, 'manifest.extend.json');
    logsDir = join(tempDir, 'logs');
    await seedManifest(manifestPath);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('annotates manifest when canary passes', async () => {
    let currentTime = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
    const delayImpl = jest.fn(async (ms) => {
      currentTime += ms;
    });

    const callAgentMock = jest.fn().mockResolvedValue({
      ok: true,
      trace: { durationMs: 120 },
    });
    const fetchMock = createFetchMock();

    const exitCode = await runCanary(
      [
        '--duration',
        '1',
        '--qps',
        '1',
        '--manifest',
        manifestPath,
        '--log-root',
        logsDir,
        '--session',
        'test-session-pass',
      ],
      {
        callAgentImpl: callAgentMock,
        fetchImpl: fetchMock,
        delayImpl,
        correlationId: 'corr-pass',
      },
    );

    expect(exitCode).toBe(0);
    expect(callAgentMock).toHaveBeenCalled();

    const manifest = await loadManifestExtend(manifestPath);
    expect(manifest.audit).toHaveLength(0);
    expect(manifest.annotations.canary).toMatchObject({
      status: 'canary-ok',
      correlationId: 'corr-pass',
      sessionId: 'test-session-pass',
    });
    expect(manifest.annotations.canary.p95).toBeGreaterThanOrEqual(0);
  });

  it('records rollback event when thresholds are breached', async () => {
    let currentTime = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
    const delayImpl = jest.fn(async (ms) => {
      currentTime += ms;
    });

    const callAgentMock = jest.fn().mockResolvedValue({
      ok: false,
      trace: { durationMs: 400 },
      error: { message: 'probe failed' },
    });
    const fetchMock = createFetchMock();

    const exitCode = await runCanary(
      [
        '--duration',
        '1',
        '--qps',
        '1',
        '--manifest',
        manifestPath,
        '--log-root',
        logsDir,
        '--session',
        'test-session-fail',
        '--max-error-rate',
        '0',
      ],
      {
        callAgentImpl: callAgentMock,
        fetchImpl: fetchMock,
        delayImpl,
        correlationId: 'corr-fail',
      },
    );

    expect(exitCode).toBe(1);
    expect(callAgentMock).toHaveBeenCalled();

    const manifest = await loadManifestExtend(manifestPath);
    expect(manifest.annotations.canary).toBeUndefined();
    expect(manifest.audit).toHaveLength(1);
    const [auditEntry] = manifest.audit;
    expect(auditEntry.action).toBe('rollback');
    expect(auditEntry.correlationId).toBe('corr-fail');
    expect(auditEntry.reason).toContain('errorRate');
    expect(auditEntry.stats.sessionId).toBe('test-session-fail');
    expect(Array.isArray(auditEntry.stats.breaches)).toBe(true);
  });
});
