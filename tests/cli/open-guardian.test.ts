import path from 'path';
import { EventEmitter } from 'node:events';

import {
  assessEnvironment,
  launch,
  normaliseTarget,
  resolveCommand
} from '../../src/cli/utils/open-guardian.js';

function createChildProcessMock() {
  const emitter = new EventEmitter();
  emitter.unref = jest.fn();
  return emitter;
}

describe('open guardian utilities', () => {
  describe('normaliseTarget', () => {
    test('resolves relative file paths to absolute paths', () => {
      const relative = './fixtures/example.drawio';
      const normalised = normaliseTarget(relative);
      expect(normalised).toBe(path.resolve(relative));
    });

    test('preserves URL targets', () => {
      const url = 'file:///tmp/viewer.html?hint=/tmp/output.json';
      expect(normaliseTarget(url, 'url')).toBe(url);
    });
  });

  describe('resolveCommand', () => {
    test('uses open on macOS', () => {
      expect(resolveCommand('/tmp/file', 'darwin')).toEqual({
        command: 'open',
        args: ['/tmp/file']
      });
    });

    test('uses start via cmd on Windows', () => {
      expect(resolveCommand('C:\\\\files\\\\graph.drawio', 'win32')).toEqual({
        command: 'cmd',
        args: ['/c', 'start', '', 'C:\\\\files\\\\graph.drawio']
      });
    });

    test('uses xdg-open on Linux', () => {
      expect(resolveCommand('/tmp/file', 'linux')).toEqual({
        command: 'xdg-open',
        args: ['/tmp/file']
      });
    });
  });

  describe('assessEnvironment', () => {
    test('denies execution in CI environments', () => {
      const assessment = assessEnvironment({
        env: { CI: 'true' },
        platform: 'linux',
        interactive: true
      });
      expect(assessment.canOpen).toBe(false);
      expect(assessment.reason).toMatch(/CI/);
    });

    test('denies execution when no DISPLAY is available on Linux', () => {
      const assessment = assessEnvironment({
        env: {},
        platform: 'linux',
        interactive: true
      });
      expect(assessment.canOpen).toBe(false);
      expect(assessment.reason).toMatch(/DISPLAY/);
    });

    test('allows execution on Linux when DISPLAY is present', () => {
      const assessment = assessEnvironment({
        env: { DISPLAY: ':0' },
        platform: 'linux',
        interactive: true
      });
      expect(assessment.canOpen).toBe(true);
    });
  });

  describe('launch', () => {
    test('skips launching when environment is disallowed', async () => {
      const spawnStub = jest.fn();
      const result = await launch('/tmp/example.drawio', {
        env: { CI: '1' },
        interactive: false,
        platform: 'darwin',
        spawn: spawnStub
      });

      expect(result.skipped).toBe(true);
      expect(result.launched).toBe(false);
      expect(spawnStub).not.toHaveBeenCalled();
    });

    test('launches viewer with xdg-open on Linux', async () => {
      const spawnStub = jest.fn().mockImplementation(() => createChildProcessMock());
      const result = await launch('./artifacts/diagram.drawio', {
        env: { DISPLAY: ':1' },
        interactive: true,
        platform: 'linux',
        spawn: spawnStub
      });

      expect(result.launched).toBe(true);
      expect(result.skipped).toBe(false);
      expect(spawnStub).toHaveBeenCalledTimes(1);
      const [command, args] = spawnStub.mock.calls[0];
      expect(command).toBe('xdg-open');
      expect(args).toEqual([path.resolve('./artifacts/diagram.drawio')]);
    });

    test('launches URL targets without path resolution', async () => {
      const spawnStub = jest.fn().mockImplementation(() => createChildProcessMock());
      const url = 'file:///viewer/index.html?hint=/tmp/export.json';
      await launch(url, {
        env: {},
        interactive: true,
        platform: 'darwin',
        type: 'url',
        spawn: spawnStub
      });

      expect(spawnStub).toHaveBeenCalledWith(
        'open',
        [url],
        expect.objectContaining({ detached: true })
      );
    });

    test('propagates spawn errors', async () => {
      const failure = new Error('spawn failed');
      const result = await launch('/tmp/example.drawio', {
        env: { DISPLAY: ':0' },
        interactive: true,
        platform: 'linux',
        spawn: () => {
          throw failure;
        }
      });

      expect(result.launched).toBe(false);
      expect(result.error).toBe(failure);
      expect(result.skipped).toBe(false);
    });
  });
});
