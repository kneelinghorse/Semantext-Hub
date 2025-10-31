import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  StructuredLogger,
  createStructuredLogger,
  buildLoggerConfig
} from '../../../../packages/runtime/services/mcp-server/logger.js';

const LOG_FILE = 'mcp-server.log';

let envSnapshot;
let tempDirs;

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-logger-test-'));
  tempDirs.push(dir);
  return dir;
}

function readLogLines(dir, file = LOG_FILE) {
  const logPath = path.join(dir, file);
  if (!fs.existsSync(logPath)) {
    return [];
  }
  const contents = fs.readFileSync(logPath, 'utf8').trim();
  if (!contents) {
    return [];
  }
  return contents
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

beforeEach(() => {
  envSnapshot = { ...process.env };
  tempDirs = [];
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(envSnapshot)) {
    process.env[key] = value;
  }
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('StructuredLogger', () => {
  test('writes structured entries with merged context and service metadata', () => {
    const dir = createTempDir();
    const logger = new StructuredLogger({
      directory: dir,
      level: 'trace',
      serviceContext: { service: 'mcp', version: '1.0.0' }
    });

    const component = logger.child('registry', { correlationId: 'corr-1' });
    const error = new Error('boom');
    const circular = {};
    circular.self = circular;

    component.error({ status: 'failed' }, {
      requestId: 'req-9',
      detail: { nested: true },
      error,
      circular
    });

    const entries = readLogLines(dir);

    expect(entries).toHaveLength(1);
    const entry = entries[0];

    expect(entry.level).toBe('error');
    expect(entry.component).toBe('registry');
    expect(entry.message).toBe(JSON.stringify({ status: 'failed' }));
    expect(entry.service).toBe('mcp');
    expect(entry.version).toBe('1.0.0');
    expect(entry.context).toMatchObject({
      correlationId: 'corr-1',
      requestId: 'req-9',
      detail: { nested: true }
    });
    expect(entry.context.error).toMatchObject({
      name: 'Error',
      message: 'boom'
    });
    expect(entry.context.circular).toBe('[object Object]');
  });

  test('respects thresholds and ignores invalid levels', () => {
    const dir = createTempDir();
    const logger = new StructuredLogger({
      directory: dir,
      level: 'verbose',
      componentLevels: {
        worker: 'warn',
        'worker.sub': 'error'
      }
    });

    logger.log({ level: 'invalid', component: 'worker', message: 'skip me' });

    const worker = logger.child('worker');
    worker.debug('below threshold');
    worker.error('allowed');

    const subWorker = worker.child('sub');
    subWorker.warn('still suppressed');
    subWorker.error('finally allowed');

    const entries = readLogLines(dir);
    expect(entries).toHaveLength(2);
    expect(entries.map(line => line.level)).toEqual(['error', 'error']);
    expect(entries[0].component).toBe('worker');
    expect(entries[1].component).toBe('worker.sub');
  });

  test('rotates log files, enforces retention, and survives deletion failures', () => {
    const dir = createTempDir();
    const logger = new StructuredLogger({
      directory: dir,
      maxSizeBytes: 120,
      maxFiles: 2
    });

    const unlinkSpy = jest.spyOn(fs, 'unlinkSync');

    const staleFiles = [
      `${LOG_FILE}.old1.log`,
      `${LOG_FILE}.old2.log`,
      `${LOG_FILE}.old3.log`
    ];
    staleFiles.forEach((file, index) => {
      const filePath = path.join(dir, file);
      fs.writeFileSync(filePath, 'stale');
      const time = Date.now() - (index + 1) * 1000;
      fs.utimesSync(filePath, time / 1000, time / 1000);
    });

    for (let i = 0; i < 5; i += 1) {
      logger.info(`rotation-${i}`, {
        payload: 'X'.repeat(256)
      });
    }

    expect(unlinkSpy).toHaveBeenCalled();

    const retainedFiles = fs
      .readdirSync(dir)
      .filter(file => file.startsWith(LOG_FILE));
    expect(retainedFiles.length).toBeLessThanOrEqual(2);

    unlinkSpy.mockReset().mockImplementation(() => {
      throw new Error('permission denied');
    });

    for (let i = 0; i < 3; i += 1) {
      logger.info(`trigger-error-${i}`, { payload: 'Y'.repeat(256) });
    }

    expect(unlinkSpy).toHaveBeenCalled();
    unlinkSpy.mockRestore();

    const logFiles = fs
      .readdirSync(dir)
      .filter(file => file.startsWith(LOG_FILE));
    expect(logFiles.length).toBeGreaterThanOrEqual(2);

    const entries = readLogLines(dir);
    expect(entries.length).toBeGreaterThan(0);
  });

  test('handles writer failures without throwing', () => {
    const dir = createTempDir();
    const logger = new StructuredLogger({ directory: dir });
    jest.spyOn(logger.fileWriter, 'writeLine').mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(() => logger.info('still running')).not.toThrow();
  });

  test('child loggers merge nested default context', () => {
    const dir = createTempDir();
    const logger = new StructuredLogger({ directory: dir });
    const rootChild = logger.child('api', { region: 'us-east' });
    const nested = rootChild.child('handler', { zone: '1a' });
    nested.info(undefined, 'simple-context');

    const entries = readLogLines(dir);
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.component).toBe('api.handler');
    expect(entry.message).toBe('');
    expect(entry.context).toEqual({
      region: 'us-east',
      zone: '1a',
      value: 'simple-context'
    });
  });
});

describe('buildLoggerConfig', () => {
  test('parses environment settings with fallbacks', () => {
    process.env.MCP_LOG_DIR = '/tmp/mcp';
    process.env.MCP_LOG_FILE = 'custom.log';
    process.env.MCP_LOG_MAX_SIZE = 'abc';
    process.env.MCP_LOG_MAX_FILES = '3';
    process.env.MCP_LOG_LEVEL = 'DEBUG';
    process.env.MCP_LOG_LEVELS = 'worker=WARN,invalidpair,api=error ';
    process.env.PROTOCOL_ROOT = '/opt/protocol';

    const config = buildLoggerConfig(process.env);

    expect(config.directory).toBe('/tmp/mcp');
    expect(config.filename).toBe('custom.log');
    expect(config.maxSizeBytes).toBeUndefined();
    expect(config.maxFiles).toBe(3);
    expect(config.level).toBe('DEBUG');
    expect(config.componentLevels).toEqual({
      worker: 'warn',
      api: 'error'
    });
  });

  test('defaults to protocol root log directory when not provided', () => {
    delete process.env.MCP_LOG_DIR;
    delete process.env.PROTOCOL_ROOT;

    const config = buildLoggerConfig({});

    expect(config.directory).toBe(path.join(process.cwd(), 'var', 'log', 'mcp'));
    expect(config.filename).toBe('mcp-server.log');
    expect(config.maxSizeBytes).toBe(5 * 1024 * 1024);
    expect(config.maxFiles).toBe(5);
    expect(config.level).toBe('info');
    expect(config.componentLevels).toEqual({});
  });
});

describe('createStructuredLogger', () => {
  test('merges environment overrides and service context', () => {
    const dir = createTempDir();

    const logger = createStructuredLogger({
      environmentOverrides: {
        MCP_LOG_DIR: dir,
        MCP_LOG_LEVEL: 'debug',
        MCP_LOG_LEVELS: 'worker=warn'
      },
      serviceContext: { service: 'mcp-service', build: '42' }
    });

    const worker = logger.child('worker');
    worker.warn('about to rotate', { extra: true });

    const entries = readLogLines(dir);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: 'warn',
      component: 'worker',
      service: 'mcp-service',
      build: '42'
    });
    expect(entries[0].context).toEqual({ extra: true });
  });
});
