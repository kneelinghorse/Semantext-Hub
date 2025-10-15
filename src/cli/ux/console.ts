import type ora from 'ora';

import { createConsole as createConsoleJs, isInteractive as isInteractiveJs } from './console.js';

export interface CliSpinner {
  start(): void;
  stop(): void;
  succeed(message?: string): void;
  fail(message?: string): void;
  update(value: string): void;
}

export interface CliConsole {
  interactive: boolean;
  spinner(text: string): CliSpinner | ora.Ora;
  info(message: string): void;
  success(message: string, lines?: string[]): void;
  warn(message: string, lines?: string[]): void;
  error(message: string, lines?: string[]): void;
}

export function createConsole(options?: { interactive?: boolean }): CliConsole {
  return createConsoleJs(options) as unknown as CliConsole;
}

export function isInteractive(): boolean {
  return isInteractiveJs();
}

export default {
  createConsole,
  isInteractive
};
