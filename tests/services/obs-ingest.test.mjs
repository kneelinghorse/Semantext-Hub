import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  logPerformanceEvent,
  MetricsIngestWriter,
  getDefaultLogRoot
} from '../../app/services/obs/ingest.mjs';

describe('app/services/obs/ingest.mjs', () => {
  let tempRoot;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), 'obs-ingest-'));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  test('logPerformanceEvent normalizes data and writes to JSONL file', async () => {
    const event = {
      sessionId: 'session-1',
      tool: 'ingest-service',
      step: 'collect',
      ms: 123.45,
      ok: 1,
      ts: '2025-01-01T12:30:00.000Z',
      err: new Error('sample error')
    };

    const result = await logPerformanceEvent(event, { root: tempRoot });

    expect(result.record.ok).toBe(true);
    expect(result.record.err).toBe('Error: sample error');
    expect(result.path).toContain(path.join(tempRoot, '2025-01-01', 'session-1.jsonl'));

    const fileContents = await readFile(result.path, 'utf8');
    const lines = fileContents.trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.tool).toBe('ingest-service');
    expect(parsed.ok).toBe(true);
    expect(parsed.sessionId).toBe('session-1');
    expect(parsed.err).toBe('Error: sample error');
  });

  test('logPerformanceEvent rejects when required fields are missing', async () => {
    const event = {
      tool: 'missing-session',
      step: 'collect',
      ms: 10,
      ok: true
    };

    await expect(logPerformanceEvent(event, { root: tempRoot })).rejects.toThrow(
      'Missing required field "sessionId"',
    );
  });

  test('logPerformanceEvent rejects invalid timestamps', async () => {
    const event = {
      sessionId: 'session-2',
      tool: 'ingest-service',
      step: 'collect',
      ms: 10,
      ok: true,
      ts: 'not-a-date'
    };

    await expect(logPerformanceEvent(event, { root: tempRoot })).rejects.toThrow(
      'Invalid event timestamp',
    );
  });

  test('MetricsIngestWriter fills in missing sessionId and delegates to logPerformanceEvent', async () => {
    const writer = new MetricsIngestWriter({ sessionId: 'session-3', root: tempRoot });
    const result = await writer.log({
      tool: 'ingest-service',
      step: 'store',
      ms: 55.5,
      ok: false
    });

    expect(result.record.sessionId).toBe('session-3');
    expect(result.record.ok).toBe(false);
    expect(result.record.ms).toBe(55.5);
  });

  test('getDefaultLogRoot exposes the configured default root', () => {
    const root = getDefaultLogRoot();
    expect(typeof root).toBe('string');
    expect(root.length).toBeGreaterThan(0);
  });
});
