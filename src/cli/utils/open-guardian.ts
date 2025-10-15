import type { ChildProcess, SpawnOptions } from 'child_process';

import {
  assessEnvironment as assessEnvironmentJs,
  launch as launchJs,
  normaliseTarget as normaliseTargetJs,
  resolveCommand as resolveCommandJs
} from './open-guardian.js';

export interface OpenEnvironmentAssessment {
  canOpen: boolean;
  reason?: string;
}

export interface OpenGuardianEnvironmentOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  interactive?: boolean;
}

export type OpenTargetType = 'file' | 'url';

export interface OpenLaunchOptions extends OpenGuardianEnvironmentOptions {
  type?: OpenTargetType;
  spawn?: OpenSpawnFunction;
  cwd?: string;
}

export interface OpenLaunchResult {
  launched: boolean;
  skipped: boolean;
  reason?: string;
  command?: string;
  args?: string[];
  error?: Error;
}

export type OpenSpawnFunction = (
  command: string,
  args?: readonly string[],
  options?: SpawnOptions
) => ChildProcess;

export function normaliseTarget(target: string, type?: OpenTargetType): string {
  return normaliseTargetJs(target, type);
}

export function resolveCommand(
  target: string,
  platform?: NodeJS.Platform
): { command: string; args: string[] } {
  return resolveCommandJs(target, platform);
}

export function assessEnvironment(options?: OpenGuardianEnvironmentOptions): OpenEnvironmentAssessment {
  return assessEnvironmentJs(options);
}

export function launch(target: string, options?: OpenLaunchOptions): Promise<OpenLaunchResult> {
  return launchJs(target, options);
}

export default {
  assessEnvironment,
  launch,
  normaliseTarget,
  resolveCommand
};
