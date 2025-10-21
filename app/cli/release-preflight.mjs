#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import process from 'node:process';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import fetch from 'node-fetch';

import {
  loadBudgets,
  loadLogEntries,
  summarizeMetrics,
  evaluateBudgets,
} from './perf-status.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(APP_ROOT, '..');
const DEFAULT_POLICY_PATH = resolve(APP_ROOT, 'policies', 'release', 'preflight.policy.json');

export const EXIT_CODES = {
  OK: 0,
  FAIL: 1,
};

function parseArgs(argv) {
  const args = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case '--policy':
        args.policy = argv[++index];
        break;
      case '--metrics':
        args.metrics = argv[++index];
        break;
      case '--budgets':
        args.budgets = argv[++index];
        break;
      case '--lcov':
        args.lcov = argv[++index];
        break;
      case '--json':
        args.json = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        break;
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: ossp release preflight [options]

Options:
  --policy <path>    Override policy file path
  --metrics <path>   Override performance metrics JSONL file path
  --budgets <path>   Override performance budgets JSON file path
  --lcov <path>      Override LCOV coverage file path
  --json             Emit JSON summary output
  -h, --help         Show this help text
`);
}

function resolveFromRepo(pathValue) {
  if (!pathValue) return null;
  if (isAbsolute(pathValue)) {
    return pathValue;
  }
  return resolve(REPO_ROOT, pathValue);
}

async function loadPolicy(policyPath) {
  const content = await readFile(policyPath, 'utf8');
  return JSON.parse(content);
}

async function ensureArtifactFresh(pathValue, label, maxAgeMinutes) {
  try {
    const info = await stat(pathValue);
    if (maxAgeMinutes && Number.isFinite(maxAgeMinutes)) {
      const ageMinutes = (Date.now() - info.mtimeMs) / 60000;
      if (ageMinutes > maxAgeMinutes) {
        return {
          ok: false,
          reason: `${label} is stale (${ageMinutes.toFixed(1)} min > ${maxAgeMinutes} min)`,
        };
      }
      return { ok: true, ageMinutes };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: `${label} is missing at ${pathValue}` };
  }
}

function ratio(hit, found) {
  if (found === 0) return 1;
  return hit / found;
}

async function parseCoverage(lcovPath) {
  const payload = await readFile(lcovPath, 'utf8');
  const lines = payload.split('\n');
  const totals = {
    lines: { found: 0, hit: 0 },
    branches: { found: 0, hit: 0 },
    functions: { found: 0, hit: 0 },
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('LF:')) {
      totals.lines.found += Number.parseInt(line.slice(3), 10) || 0;
    } else if (line.startsWith('LH:')) {
      totals.lines.hit += Number.parseInt(line.slice(3), 10) || 0;
    } else if (line.startsWith('BRF:')) {
      totals.branches.found += Number.parseInt(line.slice(4), 10) || 0;
    } else if (line.startsWith('BRH:')) {
      totals.branches.hit += Number.parseInt(line.slice(4), 10) || 0;
    } else if (line.startsWith('FNF:')) {
      totals.functions.found += Number.parseInt(line.slice(4), 10) || 0;
    } else if (line.startsWith('FNH:')) {
      totals.functions.hit += Number.parseInt(line.slice(4), 10) || 0;
    }
  }

  return {
    lines: ratio(totals.lines.hit, totals.lines.found),
    branches: ratio(totals.branches.hit, totals.branches.found),
    functions: ratio(totals.functions.hit, totals.functions.found),
  };
}

async function checkPerformance({ performance = {}, artifacts = {} }, overrides = {}) {
  const results = {
    status: 'pass',
    details: '',
    errorRate: 0,
  };
  const failures = [];
  const logPath = overrides.metrics ?? performance.logPath;
  const budgetsPath = overrides.budgets ?? performance.budgetsPath;
  const maxErrorRate = overrides.maxErrorRate ?? performance.maxErrorRate ?? 0;
  const maxAgeMinutes = overrides.maxAgeMinutes ?? artifacts.maxAgeMinutes;

  if (!logPath) {
    return {
      status: 'fail',
      details: 'No performance log configured in policy',
      errorRate: 0,
    };
  }

  const resolvedLogPath = resolveFromRepo(logPath);
  const logArtifact = await ensureArtifactFresh(resolvedLogPath, 'Performance log', maxAgeMinutes);
  if (!logArtifact.ok) {
    failures.push(logArtifact.reason);
  }

  if (!budgetsPath) {
    failures.push('Performance budgets path missing in policy');
  }
  const resolvedBudgetsPath = budgetsPath ? resolveFromRepo(budgetsPath) : null;

  if (resolvedBudgetsPath) {
    const budgetsArtifact = await ensureArtifactFresh(resolvedBudgetsPath, 'Performance budgets', null);
    if (!budgetsArtifact.ok) {
      failures.push(budgetsArtifact.reason);
    }
  }

  if (failures.length === 0) {
    const entries = await loadLogEntries(resolvedLogPath);
    if (!entries.length) {
      failures.push(`Performance log ${resolvedLogPath} has no entries`);
    } else {
      const summary = summarizeMetrics(entries);
      if (!summary.length) {
        failures.push('No metrics summarised from performance log');
      } else {
        const totals = summary.reduce(
          (acc, metric) => ({
            count: acc.count + metric.count,
            errors: acc.errors + metric.errorCount,
          }),
          { count: 0, errors: 0 },
        );
        results.errorRate = totals.count ? totals.errors / totals.count : 0;

        if (totals.count === 0) {
          failures.push('Performance metrics contain zero measurements');
        }

        if (resolvedBudgetsPath) {
          const budgets = await loadBudgets(resolvedBudgetsPath);
          const evaluation = evaluateBudgets(summary, budgets);
          if (!evaluation.pass) {
            const violationSummary = evaluation.violations
              .map(
                (violation) =>
                  `${violation.tool}/${violation.step} ${violation.metric} ` +
                  `${violation.actual.toFixed(2)}>${violation.limit.toFixed(2)}`,
              )
              .slice(0, 5)
              .join('; ');
            failures.push(
              violationSummary || 'Performance metrics exceeded budgets',
            );
          }
        }

        if (totals.count > 0 && results.errorRate > maxErrorRate) {
          failures.push(
            `Error rate ${(results.errorRate * 100).toFixed(1)}% exceeds ${(maxErrorRate * 100).toFixed(1)}%`,
          );
        }
      }
    }
  }

  if (failures.length) {
    results.status = 'fail';
    results.details = failures.join('; ');
  }

  return results;
}

async function checkCoverage({ coverage = {}, artifacts = {} }, overrides = {}) {
  const results = {
    status: 'pass',
    details: '',
    coverage: null,
  };
  const failures = [];
  const lcovPath = overrides.lcov ?? coverage.lcovPath;
  const minimums = coverage.minimums ?? {};
  const maxAgeMinutes = overrides.maxAgeMinutes ?? artifacts.maxAgeMinutes;

  if (!lcovPath) {
    return {
      status: 'fail',
      details: 'Coverage LCOV path missing in policy',
      coverage: null,
    };
  }

  const resolvedLcovPath = resolveFromRepo(lcovPath);
  const coverageArtifact = await ensureArtifactFresh(resolvedLcovPath, 'Coverage report', maxAgeMinutes);
  if (!coverageArtifact.ok) {
    failures.push(coverageArtifact.reason);
  } else {
    try {
      results.coverage = await parseCoverage(resolvedLcovPath);
      const thresholds = overrides.minimums ?? minimums;

      for (const [key, threshold] of Object.entries(thresholds)) {
        const actual = results.coverage[key];
        if (typeof threshold === 'number' && typeof actual === 'number' && actual + 1e-6 < threshold) {
          failures.push(
            `${key} coverage ${(actual * 100).toFixed(2)}% < ${(threshold * 100).toFixed(2)}% threshold`,
          );
        }
      }
    } catch (error) {
      failures.push(`Failed to parse LCOV report: ${error.message}`);
    }
  }

  if (failures.length) {
    results.status = 'fail';
    results.details = failures.join('; ');
  }

  return results;
}

async function fetchWithTimeout(url, timeoutMs = 3000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function checkHealth({ health = {} }) {
  const results = {
    status: 'pass',
    details: '',
    endpoints: [],
  };
  const failures = [];
  const timeoutMs = health.timeoutMs ?? 3000;

  if (!Array.isArray(health.endpoints) || health.endpoints.length === 0) {
    return results;
  }

  for (const endpoint of health.endpoints) {
    const targetUrl = endpoint?.url;
    if (!targetUrl) {
      failures.push(`Endpoint ${endpoint?.name ?? 'unnamed'} missing URL`);
      continue;
    }

    try {
      const response = await fetchWithTimeout(targetUrl, timeoutMs);
      if (!response.ok) {
        failures.push(
          `${endpoint.name ?? targetUrl} responded with HTTP ${response.status}`,
        );
        continue;
      }

      if (endpoint.expect?.httpStatus && response.status !== endpoint.expect.httpStatus) {
        failures.push(
          `${endpoint.name ?? targetUrl} expected HTTP ${endpoint.expect.httpStatus} but received ${response.status}`,
        );
        continue;
      }

      if (endpoint.expect?.status) {
        let payload;
        try {
          payload = await response.clone().json();
        } catch (error) {
          failures.push(`${endpoint.name ?? targetUrl} did not return JSON payload`);
          continue;
        }
        if (payload?.status !== endpoint.expect.status) {
          failures.push(
            `${endpoint.name ?? targetUrl} status ${payload?.status ?? 'unknown'} != ${endpoint.expect.status}`,
          );
          continue;
        }
      }

      results.endpoints.push({
        name: endpoint.name ?? targetUrl,
        url: targetUrl,
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        failures.push(`${endpoint.name ?? targetUrl} timed out after ${timeoutMs} ms`);
      } else {
        failures.push(`${endpoint.name ?? targetUrl} failed: ${error.message}`);
      }
    }
  }

  if (failures.length) {
    results.status = 'fail';
    results.details = failures.join('; ');
  }

  return results;
}

function printFailureTable(failures) {
  if (!failures.length) return;

  const headers = ['Check', 'Details'];
  const colWidths = [
    Math.max(headers[0].length, ...failures.map((item) => item.check.length)),
    Math.max(headers[1].length, ...failures.map((item) => item.details.length)),
  ];

  const separator = `+-${'-'.repeat(colWidths[0])}-+-${'-'.repeat(colWidths[1])}-+`;
  console.log(separator);
  console.log(
    `| ${headers[0].padEnd(colWidths[0])} | ${headers[1].padEnd(colWidths[1])} |`,
  );
  console.log(separator);
  for (const failure of failures) {
    console.log(
      `| ${failure.check.padEnd(colWidths[0])} | ${failure.details.padEnd(colWidths[1])} |`,
    );
  }
  console.log(separator);
}

function formatPercent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function emitSuccessSummary({ performance, coverage }) {
  const coverageParts = [];
  if (coverage?.coverage) {
    coverageParts.push(`lines ${formatPercent(coverage.coverage.lines)}`);
    coverageParts.push(`functions ${formatPercent(coverage.coverage.functions)}`);
    coverageParts.push(`branches ${formatPercent(coverage.coverage.branches)}`);
  }

  const perfParts = [];
  if (typeof performance?.errorRate === 'number') {
    perfParts.push(`error rate ${(performance.errorRate * 100).toFixed(2)}%`);
  }

  console.log('Release preflight: PASS');
  if (perfParts.length) {
    console.log(`Performance: ${perfParts.join(', ')}`);
  }
  if (coverageParts.length) {
    console.log(`Coverage: ${coverageParts.join(', ')}`);
  }
}

export async function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return EXIT_CODES.OK;
  }

  const policyPath = resolveFromRepo(args.policy ?? DEFAULT_POLICY_PATH);
  let policy;
  try {
    policy = await loadPolicy(policyPath);
  } catch (error) {
    console.error(`Failed to load policy at ${policyPath}: ${error.message}`);
    return EXIT_CODES.FAIL;
  }

  const overrides = {
    metrics: args.metrics,
    budgets: args.budgets,
    lcov: args.lcov,
  };

  const results = {
    performance: await checkPerformance(policy, overrides),
    coverage: await checkCoverage(policy, overrides),
    health: await checkHealth(policy),
  };

  const failures = Object.entries(results)
    .filter(([, value]) => value.status === 'fail')
    .map(([check, value]) => ({
      check,
      details: value.details || 'Unknown failure',
    }));

  if (failures.length) {
    if (args.json) {
      console.log(JSON.stringify({ policyPath, results, status: 'failed' }, null, 2));
    } else {
      console.error('Release preflight: FAIL');
      printFailureTable(failures);
    }
    return EXIT_CODES.FAIL;
  }

  if (args.json) {
    console.log(JSON.stringify({ policyPath, results, status: 'passed' }, null, 2));
  } else {
    emitSuccessSummary(results);
  }

  return EXIT_CODES.OK;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then((code) => {
    process.exitCode = code;
  });
}
