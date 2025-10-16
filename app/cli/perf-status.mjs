#!/usr/bin/env node

import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import process from 'node:process';

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

export async function loadBudgets(filePath = DEFAULT_BUDGET_PATH) {
  try {
    const content = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);
    return parsed?.budgets ?? {};
  } catch (error) {
    return {};
  }
}

function groupByDateDescending(dirents) {
  return dirents
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .sort((a, b) => (a < b ? 1 : -1));
}

async function findSessionInDirectory(root, dateDir, sessionId) {
  const directoryPath = join(root, dateDir);
  const entries = await readdir(directoryPath, { withFileTypes: true });

  const files = entries
    .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.jsonl'))
    .map((dirent) => dirent.name)
    .sort((a, b) => (a < b ? 1 : -1));

  for (const fileName of files) {
    if (!sessionId || fileName === `${sessionId}.jsonl`) {
      const filePath = join(directoryPath, fileName);
      const session = fileName.replace(/\.jsonl$/, '');
      return { path: filePath, sessionId: session, date: dateDir };
    }
  }

  return null;
}

export async function resolveLogFile({ root = DEFAULT_LOG_ROOT, sessionId } = {}) {
  try {
    const dirents = await readdir(root, { withFileTypes: true });
    const dateDirs = groupByDateDescending(dirents);

    for (const dateDir of dateDirs) {
      const match = await findSessionInDirectory(root, dateDir, sessionId);
      if (match) return match;
    }
    return null;
  } catch (error) {
    return null;
  }
}

export async function loadLogEntries(filePath) {
  const content = await readFile(filePath, 'utf8');
  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  const entries = [];
  for (const line of lines) {
    try {
      const json = JSON.parse(line);
      if (json && typeof json.tool === 'string' && typeof json.step === 'string' && typeof json.ms === 'number') {
        entries.push(json);
      }
    } catch (error) {
      // Skip malformed line
    }
  }
  return entries;
}

function percentile(values, target) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((target / 100) * sorted.length) - 1;
  return sorted[Math.max(index, 0)];
}

export function summarizeMetrics(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = `${entry.tool}::${entry.step}`;
    if (!groups.has(key)) {
      groups.set(key, {
        tool: entry.tool,
        step: entry.step,
        durations: [],
        okCount: 0,
        errorCount: 0,
      });
    }
    const bucket = groups.get(key);
    bucket.durations.push(entry.ms);
    if (entry.ok) {
      bucket.okCount += 1;
    } else {
      bucket.errorCount += 1;
    }
  }

  const summary = [];
  for (const group of groups.values()) {
    const avg = group.durations.reduce((acc, value) => acc + value, 0) / group.durations.length;
    summary.push({
      tool: group.tool,
      step: group.step,
      count: group.durations.length,
      avg,
      p95: percentile(group.durations, 95),
      okCount: group.okCount,
      errorCount: group.errorCount,
    });
  }

  summary.sort((a, b) => {
    if (a.tool === b.tool) {
      return a.step.localeCompare(b.step);
    }
    return a.tool.localeCompare(b.tool);
  });

  return summary;
}

export function evaluateBudgets(summary, budgets) {
  const violations = [];
  for (const metric of summary) {
    const budget = budgets?.[metric.tool]?.[metric.step];
    if (!budget) continue;
    if (budget.avg !== undefined && metric.avg > budget.avg) {
      violations.push({
        tool: metric.tool,
        step: metric.step,
        metric: 'avg',
        actual: metric.avg,
        limit: budget.avg,
      });
    }
    if (budget.p95 !== undefined && metric.p95 > budget.p95) {
      violations.push({
        tool: metric.tool,
        step: metric.step,
        metric: 'p95',
        actual: metric.p95,
        limit: budget.p95,
      });
    }
  }

  return {
    pass: violations.length === 0,
    violations,
  };
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
  const budgets = await loadBudgets(budgetsPath);

  const located = await resolveLogFile({ root, sessionId: args.session });
  if (!located) {
    console.error('No performance log found. Ensure metrics have been ingested.');
    return EXIT_CODES.NO_LOG;
  }

  const entries = await loadLogEntries(located.path);
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
