#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import {
  summarizeMetrics,
  evaluateBudgets,
  loadPerfBudgets,
  resolvePerfLogFile,
  loadPerfLogEntries,
} from '../../src/metrics/perf.js';

const DEFAULT_LOG_ROOT = process.env.OSSP_LOG_ROOT ?? '/var/ossp/logs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BUDGET_PATH = resolve(__dirname, '../config/perf-budgets.json');

export const EXIT_CODES = {
  OK: 0,
  NO_LOG: 2,
  BUDGET_FAIL: 3,
};

function parseArgs(argv) {
  const args = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case '--root':
        args.root = argv[++i];
        break;
      case '--session':
        args.session = argv[++i];
        break;
      case '--budgets':
        args.budgets = argv[++i];
        break;
      case '--json':
      case '--format=json':
        args.json = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        if (token.startsWith('--format=')) {
          args.json = token.split('=')[1] === 'json';
        }
        break;
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: perf-status [options]

Options:
  --root <path>       Override metrics log root directory (defaults to /var/ossp/logs or $OSSP_LOG_ROOT)
  --session <id>      Explicit session identifier to inspect
  --budgets <path>    Override perf budgets JSON path
  --json              Emit JSON instead of human output
  -h, --help          Show this help text
`);
}

function formatNumber(value) {
  return `${value.toFixed(2)}ms`;
}

function emitHumanReport({ path: filePath, sessionId, date }, summary, evaluation) {
  console.log(`Session: ${sessionId} (${date})`);
  console.log(`Log file: ${filePath}`);
  console.log('');

  for (const metric of summary) {
    const parts = [
      `${metric.tool} → ${metric.step}`,
      `count=${metric.count}`,
      `avg=${formatNumber(metric.avg)}`,
      `p95=${formatNumber(metric.p95)}`,
      `ok=${metric.okCount}`,
      `err=${metric.errorCount}`,
    ];
    console.log(parts.join(' | '));
  }

  if (evaluation.pass) {
    console.log('\nBudgets: PASS');
  } else {
    console.log('\nBudgets: FAIL');
    for (const violation of evaluation.violations) {
      console.log(
        `  ${violation.tool}/${violation.step} exceeded ${violation.metric}: ` +
        `${violation.actual.toFixed(2)}ms > ${violation.limit.toFixed(2)}ms`,
      );
    }
  }
}

export async function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return EXIT_CODES.OK;
  }

  const root = args.root ?? DEFAULT_LOG_ROOT;
  const budgetsPath = args.budgets ? resolve(args.budgets) : DEFAULT_BUDGET_PATH;
  const budgets = await loadPerfBudgets(budgetsPath);

  const located = await resolvePerfLogFile({ root, sessionId: args.session });
  if (!located) {
    console.error('No performance log found. Ensure metrics have been ingested.');
    return EXIT_CODES.NO_LOG;
  }

  const entries = await loadPerfLogEntries(located.path);
  if (entries.length === 0) {
    console.error(`Performance log ${located.path} has no entries.`);
    return EXIT_CODES.NO_LOG;
  }

  const summary = summarizeMetrics(entries);
  const evaluation = evaluateBudgets(summary, budgets);

  if (args.json) {
    console.log(JSON.stringify({
      sessionId: located.sessionId,
      date: located.date,
      logFile: located.path,
      metrics: summary,
      evaluation,
    }, null, 2));
  } else {
    emitHumanReport(located, summary, evaluation);
  }

  return evaluation.pass ? EXIT_CODES.OK : EXIT_CODES.BUDGET_FAIL;
}

// Re-export shared summarization utilities for existing imports
export {
  summarizeMetrics,
  evaluateBudgets,
  loadPerfBudgets,
  resolvePerfLogFile,
  loadPerfLogEntries,
} from '../../src/metrics/perf.js';
export {
  loadPerfBudgets as loadBudgets,
  resolvePerfLogFile as resolveLogFile,
  loadPerfLogEntries as loadLogEntries,
} from '../../src/metrics/perf.js';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = EXIT_CODES.BUDGET_FAIL;
    });
}
