#!/usr/bin/env node

/**
 * Shared CLI UX helpers for spinners, status output, and colourised messaging.
 * These utilities centralise console formatting so commands remain focused on behaviour.
 */

import ora from 'ora';
import chalk from 'chalk';

function defaultIsInteractive() {
  return Boolean(process.stdout?.isTTY) && !process.env.CI;
}

function normaliseLines(lines = []) {
  if (!Array.isArray(lines)) return [];
  return lines.filter((line) => typeof line === 'string' && line.trim().length > 0);
}

function createNonInteractiveSpinner(text) {
  let started = false;
  let current = text;

  return {
    start() {
      if (!started) {
        started = true;
        if (current) {
          console.log(chalk.gray(current));
        }
      }
    },
    stop() {},
    succeed(message) {
      if (message) {
        console.log(chalk.green(`✔ ${message}`));
      }
    },
    fail(message) {
      if (message) {
        console.error(chalk.red(`✖ ${message}`));
      }
    },
    update(text) {
      current = text;
    }
  };
}

export function createConsole(options = {}) {
  const interactive = options.interactive ?? defaultIsInteractive();

  return {
    interactive,

    spinner(text) {
      if (interactive) {
        const instance = ora({
          text,
          spinner: 'dots',
          isEnabled: true
        });

        return {
          start: () => instance.start(),
          stop: () => instance.stop(),
          succeed: (message) => {
            if (message) {
              instance.succeed(message);
            } else {
              instance.stop();
            }
          },
          fail: (message) => {
            if (message) {
              instance.fail(message);
            } else {
              instance.stop();
            }
          },
          update: (value) => {
            instance.text = value;
          }
        };
      }

      return createNonInteractiveSpinner(text);
    },

    info(message) {
      if (!message) return;
      console.log(chalk.gray(message));
    },

    success(message, lines) {
      if (!message) return;
      console.log(chalk.green(`✔ ${message}`));
      for (const line of normaliseLines(lines)) {
        console.log(chalk.gray(`  ${line}`));
      }
    },

    warn(message, lines) {
      if (!message) return;
      console.warn(chalk.yellow(`⚠ ${message}`));
      for (const line of normaliseLines(lines)) {
        console.warn(chalk.yellow(`  ${line}`));
      }
    },

    error(message, lines) {
      if (!message) return;
      console.error(chalk.red(`✖ ${message}`));
      for (const line of normaliseLines(lines)) {
        console.error(chalk.gray(`  ${line}`));
      }
    }
  };
}

export function isInteractive() {
  return defaultIsInteractive();
}

export default {
  createConsole,
  isInteractive
};
