import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { ContextStore } from '../../../packages/runtime/services/context/context-store.js';

const noopLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child() {
    return this;
  }
};

describe('ContextStore', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'context-store-tests-'));
  });

  test('writes context entries to disk and emits events', async () => {
    const eventPublisher = {
      publish: jest.fn().mockResolvedValue('1-0')
    };

    const store = new ContextStore({
      workspace: tempDir,
      eventPublisher,
      logger: noopLogger,
      streamDefaults: {
        env: 'test',
        domain: 'demo',
        object: 'context',
        event: 'updated',
        objectId: 'global'
      }
    });

    const entry = await store.writeContext('workspace.synced', { status: 'ok' }, {
      source: 'tests',
      correlationId: 'corr-456'
    });

    expect(entry.key).toBe('workspace.synced');
    const filePath = path.join(tempDir, 'var', 'context', 'events.jsonl');
    const contents = await fs.readFile(filePath, 'utf8');
    const lines = contents.trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.key).toBe('workspace.synced');
    expect(parsed.data.status).toBe('ok');
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
  });

  test('records tool activation context with derived stream segments', async () => {
    const eventPublisher = {
      publish: jest.fn().mockResolvedValue('1-0')
    };

    const store = new ContextStore({
      workspace: tempDir,
      eventPublisher,
      logger: noopLogger
    });

    await store.recordToolActivation({
      urn: 'urn:test:tool:gamma',
      toolId: 'gamma',
      actor: { id: 'agent://tester' },
      capabilities: ['tool.execute'],
      metadata: { name: 'Gamma Tool' },
      resolvedAt: '2025-11-01T12:00:00Z'
    }, {
      source: 'tests'
    });

    expect(eventPublisher.publish).toHaveBeenCalled();
    const [[call]] = eventPublisher.publish.mock.calls;
    expect(call.streamSegments.object).toBe('tool');
    expect(call.streamSegments.event).toBe('activated');
    expect(call.payload.data.toolId).toBe('gamma');
  });
});
