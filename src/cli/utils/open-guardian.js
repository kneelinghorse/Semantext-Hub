#!/usr/bin/env node

/**
 * Cross-platform "open" guardian ensuring GUI availability before launching system viewers.
 *
 * Implements the research recommendations from R14.4:
 *  - Detect whether the current environment is safe for GUI operations.
 *  - Spawn the correct OS-level command with non-blocking semantics.
 *  - Provide structured results so callers can communicate skips and failures clearly.
 */

import path from 'path';
import { spawn } from 'child_process';

const CI_ENV_KEYS = ['CI', 'BUILD_ID', 'BUILD_NUMBER', 'TEAMCITY_VERSION', 'GITHUB_ACTIONS', 'JENKINS_URL'];
const SSH_ENV_KEYS = ['SSH_CONNECTION', 'SSH_CLIENT', 'SSH_TTY'];

function isTruthy(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'boolean') return value;
  const normalised = String(value).trim().toLowerCase();
  return normalised !== '' && normalised !== '0' && normalised !== 'false' && normalised !== 'no';
}

export function normaliseTarget(target, type = 'file') {
  if (typeof target !== 'string' || target.length === 0) {
    throw new TypeError('Target must be a non-empty string.');
  }

  if (type === 'url') {
    return target;
  }

  if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('file://')) {
    return target;
  }

  return path.resolve(target);
}

export function resolveCommand(target, platform = process.platform) {
  if (!target) {
    throw new TypeError('Target must be provided for resolveCommand().');
  }

  if (platform === 'darwin') {
    return { command: 'open', args: [target] };
  }

  if (platform === 'win32') {
    return { command: 'cmd', args: ['/c', 'start', '', target] };
  }

  return { command: 'xdg-open', args: [target] };
}

export function assessEnvironment(options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const interactive = options.interactive ?? Boolean(process.stdout?.isTTY);

  if (isTruthy(env.OPEN_GUARDIAN_DISABLE)) {
    return { canOpen: false, reason: 'Open guardian explicitly disabled by OPEN_GUARDIAN_DISABLE.' };
  }

  if (!interactive) {
    return { canOpen: false, reason: 'Non-interactive terminal detected.' };
  }

  if (CI_ENV_KEYS.some((key) => isTruthy(env[key]))) {
    return { canOpen: false, reason: 'CI environment detected.' };
  }

  if (SSH_ENV_KEYS.some((key) => isTruthy(env[key]))) {
    return { canOpen: false, reason: 'Remote SSH session detected.' };
  }

  if (platform === 'linux') {
    if (!isTruthy(env.DISPLAY) && !isTruthy(env.WAYLAND_DISPLAY) && !isTruthy(env.MIR_SOCKET)) {
      return { canOpen: false, reason: 'No graphical DISPLAY/WAYLAND session detected.' };
    }
  }

  if (platform === 'darwin') {
    if (isTruthy(env.TERM_PROGRAM) && env.TERM_PROGRAM.toLowerCase().includes('vscode')) {
      // VS Code integrated terminal typically has GUI access; continue.
    }
  }

  if (platform === 'win32') {
    if (isTruthy(env.WT_SESSION) || isTruthy(env.TERM_PROGRAM)) {
      // Windows Terminal / VS Code implies a desktop session.
      return { canOpen: true };
    }
  }

  return { canOpen: true };
}

export async function launch(target, options = {}) {
  const environmentAssessment = assessEnvironment(options);
  if (!environmentAssessment.canOpen) {
    return {
      launched: false,
      skipped: true,
      reason: environmentAssessment.reason
    };
  }

  const kind = options.type ?? 'file';
  const normalisedTarget = normaliseTarget(target, kind);
  const platform = options.platform ?? process.platform;
  const { command, args } = resolveCommand(normalisedTarget, platform);
  const spawnFn = options.spawn ?? spawn;
  const spawnOptions = {
    stdio: 'ignore',
    detached: platform !== 'win32',
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    windowsHide: platform === 'win32'
  };

  let child;
  try {
    child = spawnFn(command, args, spawnOptions);
  } catch (error) {
    return {
      launched: false,
      skipped: false,
      error,
      command,
      args
    };
  }

  return new Promise((resolve) => {
    let settled = false;

    const resolveSafe = (payload) => {
      if (!settled) {
        settled = true;
        resolve(payload);
      }
    };

    if (child && typeof child.once === 'function') {
      child.once('error', (error) => {
        resolveSafe({
          launched: false,
          skipped: false,
          error,
          command,
          args
        });
      });
    }

    setImmediate(() => {
      if (child && typeof child.unref === 'function') {
        try {
          child.unref();
        } catch {
          // Ignore unref failures (can happen in tests/mocks).
        }
      }

      resolveSafe({
        launched: true,
        skipped: false,
        command,
        args
      });
    });
  });
}

export default {
  assessEnvironment,
  launch,
  normaliseTarget,
  resolveCommand
};
