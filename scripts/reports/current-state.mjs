#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  summarizeMetrics,
  loadPerfLogEntries,
} from '../../src/metrics/perf.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const REPORT_PATH = path.resolve(
  REPO_ROOT,
  'artifacts',
  'reports',
  'sprint-18-current-state.md',
);

async function readJson(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toPosixRelative(filePath) {
  const relativePath = path.relative(REPO_ROOT, filePath);
  return relativePath.split(path.sep).join('/');
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : 'n/a';
}

function formatMillis(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

async function discoverApiContracts() {
  const adaptersDir = path.resolve(REPO_ROOT, 'app', 'artifacts', 'adapters');
  const contracts = [];

  try {
    const adapterEntries = await readdir(adaptersDir, { withFileTypes: true });
    for (const adapterEntry of adapterEntries) {
      if (!adapterEntry.isDirectory()) continue;
      const adapterName = adapterEntry.name;
      const adapterPath = path.join(adaptersDir, adapterName);
      const files = await readdir(adapterPath, { withFileTypes: true });

      for (const file of files) {
        if (!file.isFile()) continue;
        const lower = file.name.toLowerCase();
        if (
          !(
            lower.endsWith('.json') ||
            lower.endsWith('.yaml') ||
            lower.endsWith('.yml')
          )
        ) {
          continue;
        }

        if (!/spec|minimal|contract/.test(lower)) continue;

        const filePath = path.join(adapterPath, file.name);
        const json = lower.endsWith('.json') ? await readJson(filePath) : null;
        const title =
          json?.info?.title ??
          json?.title ??
          `${adapterName} ${file.name.replace(/\.(json|ya?ml)$/i, '')}`;
        const description = json?.info?.description ?? null;

        contracts.push({
          adapter: adapterName,
          title,
          description,
          path: toPosixRelative(filePath),
        });
      }
    }
  } catch {
    // No adapter artifacts discovered; return empty list.
  }

  contracts.sort((a, b) =>
    a.adapter === b.adapter
      ? a.title.localeCompare(b.title)
      : a.adapter.localeCompare(b.adapter),
  );

  return contracts;
}

function buildCoverageTableLines(coverageSummary) {
  const rows = [];
  rows.push('| Surface | Actual | Target |');
  rows.push('| --- | --- | --- |');

  const surfaces = ['statements', 'functions', 'branches', 'lines'];
  for (const surface of surfaces) {
    const actual = coverageSummary?.coverage?.[surface];
    const target = coverageSummary?.thresholds?.[surface];
    rows.push(
      `| ${surface} | ${formatPercent(actual)} | ${
        Number.isFinite(target) ? `${target.toFixed(2)}%` : 'n/a'
      } |`,
    );
  }

  return rows;
}

function buildPerfTable(perfSummary) {
  if (!Array.isArray(perfSummary) || perfSummary.length === 0) {
    return [
      '| Tool | Step | Count | Avg (ms) | P95 (ms) | OK | Errors |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| n/a | n/a | 0 | 0.00 | 0.00 | 0 | 0 |',
    ];
  }

  const rows = [
    '| Tool | Step | Count | Avg (ms) | P95 (ms) | OK | Errors |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];

  const sorted = [...perfSummary].sort((a, b) => b.count - a.count);
  for (const metric of sorted) {
    rows.push(
      `| ${metric.tool} | ${metric.step} | ${metric.count} | ${formatMillis(
        metric.avg,
      )} | ${formatMillis(metric.p95)} | ${metric.okCount} | ${
        metric.errorCount
      } |`,
    );
  }

  return rows;
}

function buildExitNarrative({ coverageSummary, perfSummary }) {
  const coverageMet = Boolean(coverageSummary?.meetsThresholds);
  const lineCoverage = coverageSummary?.coverage?.lines;
  const perfHasErrors = Array.isArray(perfSummary)
    ? perfSummary.some((metric) => metric.errorCount > 0)
    : false;

  if (coverageMet && !perfHasErrors) {
    return (
      '✅ Guardrails met — Sprint 18 exits cleanly with test coverage and performance budgets satisfied.'
    );
  }

  const reasons = [];
  let coverageReason = 'automated coverage remains below thresholds';
  if (Number.isFinite(lineCoverage)) {
    coverageReason += ` (lines at ${lineCoverage.toFixed(2)}% vs 80% target)`;
  }
  reasons.push(coverageReason);
  if (perfHasErrors) {
    reasons.push('performance logs include error samples');
  }

  const reasonText = reasons.join(' and ');
  return `⚠️ Sprint 18 exits with follow-up actions: ${reasonText}. Carry these into Sprint 19 security enforcement + release gate hardening.`;
}

async function synthesizeReport() {
  const jestResultsPath = path.resolve(
    REPO_ROOT,
    'artifacts',
    'test',
    'jest-results.json',
  );
  const coverageSummaryPath = path.resolve(
    REPO_ROOT,
    'artifacts',
    'test',
    'coverage-summary.json',
  );
  const perfLogPath = path.resolve(
    REPO_ROOT,
    'artifacts',
    'perf',
    'latest.jsonl',
  );

  const jestResults = await readJson(jestResultsPath);
  const coverageSummary = await readJson(coverageSummaryPath);

  let perfEntries = [];
  try {
    perfEntries = await loadPerfLogEntries(perfLogPath);
  } catch {
    perfEntries = [];
  }
  const perfSummary = summarizeMetrics(perfEntries);
  const contracts = await discoverApiContracts();

  const generatedAt = new Date().toISOString();
  const coverageGeneratedAt = coverageSummary?.generatedAt ?? 'n/a';

  const lines = [];
  lines.push('# Sprint 18 Current-State Snapshot');
  lines.push('');
  lines.push(`_Generated ${generatedAt}_`);
  lines.push('');
  lines.push('## Quality: Tests & Coverage');
  lines.push('');
  lines.push(
    `Source artifacts: \`${
      toPosixRelative(jestResultsPath)
    }\`, \`${toPosixRelative(coverageSummaryPath)}\``,
  );
  lines.push('');

  if (jestResults) {
    const suitesPassed = jestResults.numPassedTestSuites ?? 0;
    const suitesTotal = jestResults.numTotalTestSuites ?? 0;
    const suitesPending = jestResults.numPendingTestSuites ?? 0;
    const testsPassed = jestResults.numPassedTests ?? 0;
    const testsTotal = jestResults.numTotalTests ?? 0;
    const testsPending = jestResults.numPendingTests ?? 0;

    lines.push(
      `- Suites: ${suitesPassed} passed / ${suitesTotal} total (${suitesPending} pending)`,
    );
    lines.push(
      `- Tests: ${testsPassed} passed / ${testsTotal} total (${testsPending} pending)`,
    );
  } else {
    lines.push('- Jest results not found — ensure CI artifacts are present.');
  }

  lines.push(
    `- Coverage thresholds met: ${coverageSummary?.meetsThresholds ? '✅ Yes' : '⚠️ No'}`,
  );
  lines.push(`- Coverage snapshot generated at: ${coverageGeneratedAt}`);
  lines.push('');
  lines.push(...buildCoverageTableLines(coverageSummary));
  lines.push('');

  lines.push('## Performance Snapshot');
  lines.push('');
  lines.push(
    `Source artifact: \`${toPosixRelative(perfLogPath)}\` (${perfEntries.length} entries)`,
  );
  lines.push('');
  lines.push(...buildPerfTable(perfSummary));
  lines.push('');

  lines.push('## API Contracts');
  lines.push('');
  if (contracts.length === 0) {
    lines.push(
      '- No adapter contract artifacts located. Run adapter scaffolding to regenerate specs.',
    );
  } else {
    for (const contract of contracts) {
      const detail = contract.description
        ? ` — ${contract.description}`
        : '';
      lines.push(
        `- [${contract.title}](${contract.path}) (adapter: ${contract.adapter})${detail}`,
      );
    }
  }
  lines.push('');

  lines.push('## Exit Decision & Next Sprint Focus');
  lines.push('');
  lines.push(
    buildExitNarrative({ coverageSummary, perfSummary }),
  );
  lines.push('');
  lines.push(
    'Sprint 19 entry note: prioritize security enforcement, raise coverage to thresholds, and harden release gates based on the above telemetry.',
  );
  lines.push('');

  const reportBody = `${lines.join('\n')}\n`;

  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, reportBody, 'utf8');

  return {
    reportPath: REPORT_PATH,
    perfEntryCount: perfEntries.length,
    contractsCount: contracts.length,
  };
}

if (path.resolve(process.argv[1] ?? '') === __filename) {
  synthesizeReport()
    .then(({ reportPath, perfEntryCount, contractsCount }) => {
      const relativeReportPath = toPosixRelative(reportPath);
      console.log(
        `Sprint 18 current-state report written to ${relativeReportPath} ` +
          `(perf entries: ${perfEntryCount}, contracts: ${contractsCount})`,
      );
    })
    .catch((error) => {
      console.error('Failed to synthesize current-state report:', error);
      process.exitCode = 1;
    });
}

export { synthesizeReport };
