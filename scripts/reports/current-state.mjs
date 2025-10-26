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
const CURRENT_SPRINT = 22;
const NEXT_SPRINT = 23;
const REPORT_PATH = path.resolve(
  REPO_ROOT,
  'artifacts',
  'reports',
  `sprint-${CURRENT_SPRINT}-current-state.md`,
);
const COVERAGE_THRESHOLDS = {
  statements: 80,
  functions: 80,
  branches: 70,
  lines: 80,
};

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

function normalizeCoverageSummary(rawSummary) {
  if (!rawSummary) return null;

  if (rawSummary.coverage && rawSummary.thresholds) {
    const coverage = Object.fromEntries(
      Object.entries(rawSummary.coverage ?? {}).map(([key, value]) => [
        key,
        Number(value ?? NaN),
      ]),
    );
    const thresholds = Object.fromEntries(
      Object.entries({
        ...COVERAGE_THRESHOLDS,
        ...(rawSummary.thresholds ?? {}),
      }).map(([key, value]) => [key, Number(value ?? NaN)]),
    );
    return {
      coverage,
      thresholds,
      meetsThresholds: Boolean(rawSummary.meetsThresholds),
      generatedAt: rawSummary.generatedAt ?? rawSummary.ts ?? null,
    };
  }

  const totals = rawSummary.total ?? rawSummary.totals;
  if (!totals) return null;

  const coverage = {
    statements: Number(totals.statements?.pct ?? NaN),
    functions: Number(totals.functions?.pct ?? NaN),
    branches: Number(totals.branches?.pct ?? NaN),
    lines: Number(totals.lines?.pct ?? NaN),
  };

  const meetsThresholds = Object.entries(COVERAGE_THRESHOLDS).every(
    ([surface, target]) => {
      const actual = coverage[surface];
      return Number.isFinite(actual) && actual >= target;
    },
  );

  return {
    coverage,
    thresholds: COVERAGE_THRESHOLDS,
    meetsThresholds,
    generatedAt: rawSummary.generatedAt ?? rawSummary.ts ?? null,
  };
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

function buildTargetCoverageTable(assertCoverage) {
  if (!assertCoverage?.targets) {
    return [
      '- Targeted coverage assertions unavailable — run coverage guard scripts to refresh artifacts.',
    ];
  }

  const rows = [
    '| Target | Lines | Threshold | Status |',
    '| --- | --- | --- | --- |',
  ];

  const sorted = Object.entries(assertCoverage.targets).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  for (const [target, info] of sorted) {
    if (!info?.found) {
      const threshold = Number.isFinite(info?.threshold)
        ? `${info.threshold}%`
        : 'n/a';
      rows.push(`| ${target} | n/a | ${threshold} | ⚠️ missing |`);
      continue;
    }

    const linesPct = Number.isFinite(info.linesPct)
      ? `${info.linesPct.toFixed(2)}%`
      : 'n/a';
    const threshold = Number.isFinite(info.threshold)
      ? `${info.threshold}%`
      : 'n/a';
    const status = info.pass ? '✅ pass' : '⚠️ fail';
    rows.push(`| ${target} | ${linesPct} | ${threshold} | ${status} |`);
  }

  return rows;
}

function buildExitNarrative({ coverageSummary, perfSummary, assertCoverage }) {
  const coverageMet = Boolean(coverageSummary?.meetsThresholds);
  const targetedMet = assertCoverage?.ok;
  const lineCoverage = coverageSummary?.coverage?.lines;
  const perfHasErrors = Array.isArray(perfSummary)
    ? perfSummary.some((metric) => metric.errorCount > 0)
    : false;
  const perfMissing = !Array.isArray(perfSummary) || perfSummary.length === 0;

  if (coverageMet && targetedMet !== false && !perfHasErrors && !perfMissing) {
    return (
      `✅ Guardrails healthy — Sprint ${CURRENT_SPRINT} closes with coverage and live telemetry in good standing. Carry this momentum into Sprint ${NEXT_SPRINT}'s end-to-end workbench flow demo.`
    );
  }

  const reasons = [];
  const failingSurfaces = [];
  if (coverageSummary?.coverage && coverageSummary?.thresholds) {
    for (const [surface, target] of Object.entries(
      coverageSummary.thresholds,
    )) {
      const actual = coverageSummary.coverage?.[surface];
      if (
        Number.isFinite(target) &&
        Number.isFinite(actual) &&
        actual < target
      ) {
        failingSurfaces.push(
          `${surface} ${actual.toFixed(2)}% vs ${target.toFixed(2)}%`,
        );
      }
    }
  }
  let coverageReason = 'automated coverage remains below thresholds';
  if (failingSurfaces.length > 0) {
    coverageReason += ` (${failingSurfaces.join(', ')})`;
  } else if (Number.isFinite(lineCoverage)) {
    coverageReason += ` (lines at ${lineCoverage.toFixed(2)}% vs ${COVERAGE_THRESHOLDS.lines}% target)`;
  }
  if (!coverageMet) {
    reasons.push(coverageReason);
  }
  if (targetedMet === false) {
    reasons.push('one or more targeted surfaces missed the 85% line coverage guardrail');
  }
  if (perfHasErrors) {
    reasons.push('performance logs include error samples');
  }
  if (perfMissing) {
    reasons.push('performance telemetry unavailable — refresh JSONL artifacts before review');
  }

  const reasonText = reasons.join(' and ');
  return `⚠️ Sprint ${CURRENT_SPRINT} needs attention before closing: ${reasonText}. Use this to prioritize Sprint ${NEXT_SPRINT}'s “import → validate → visualize → document” showcase.`;
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
  const assertCoveragePath = path.resolve(
    REPO_ROOT,
    'artifacts',
    'test',
    'assert-coverage.json',
  );
  const perfLogPath = path.resolve(
    REPO_ROOT,
    'artifacts',
    'perf',
    'latest.jsonl',
  );

  const jestResults = await readJson(jestResultsPath);
  const coverageRaw = await readJson(coverageSummaryPath);
  const coverageSummary = normalizeCoverageSummary(coverageRaw);
  const assertCoverage = await readJson(assertCoveragePath);

  let perfEntries = [];
  try {
    perfEntries = await loadPerfLogEntries(perfLogPath);
  } catch {
    perfEntries = [];
  }
  const perfSummary = summarizeMetrics(perfEntries);
  const contracts = await discoverApiContracts();

  const generatedAt = new Date().toISOString();
  const coverageGeneratedAt =
    coverageSummary?.generatedAt ??
    assertCoverage?.generatedAt ??
    'n/a';

  const lines = [];
  lines.push(`# Sprint ${CURRENT_SPRINT} Current-State Snapshot`);
  lines.push('');
  lines.push(`_Generated ${generatedAt}_`);
  lines.push('');
  lines.push('## Quality: Tests & Coverage');
  lines.push('');
  const coverageArtifacts = [
    toPosixRelative(jestResultsPath),
    toPosixRelative(coverageSummaryPath),
  ];
  if (assertCoverage) {
    coverageArtifacts.push(toPosixRelative(assertCoveragePath));
  }
  lines.push(
    `Source artifacts: ${coverageArtifacts
      .map((artifact) => `\`${artifact}\``)
      .join(', ')}`,
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

  if (coverageSummary) {
    lines.push(
      `- Coverage thresholds met: ${coverageSummary.meetsThresholds ? '✅ Yes' : '⚠️ No'}`,
    );
  } else {
    lines.push('- Coverage thresholds met: n/a (coverage artifact not available)');
  }

  if (assertCoverage) {
    lines.push(
      `- Targeted surfaces (>=85% lines) met: ${assertCoverage.ok ? '✅ Yes' : '⚠️ No'}`,
    );
  }

  lines.push(`- Coverage snapshot generated at: ${coverageGeneratedAt}`);
  lines.push('');

  if (coverageSummary) {
    lines.push(...buildCoverageTableLines(coverageSummary));
    lines.push('');
  } else {
    lines.push(
      '- Coverage metrics unavailable — run coverage suite to regenerate artifacts.',
    );
    lines.push('');
  }

  if (assertCoverage) {
    lines.push('### Critical Surfaces');
    lines.push('');
    lines.push(...buildTargetCoverageTable(assertCoverage));
    lines.push('');
  }

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
    buildExitNarrative({ coverageSummary, perfSummary, assertCoverage }),
  );
  lines.push('');
  lines.push(
    'Sprint 23 entry note: package the import → validate → visualize → document loop into a reproducible demo, leaning on the truthful telemetry and guardrails captured here.',
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
        `Sprint ${CURRENT_SPRINT} current-state report written to ${relativeReportPath} ` +
          `(perf entries: ${perfEntryCount}, contracts: ${contractsCount})`,
      );
    })
    .catch((error) => {
      console.error('Failed to synthesize current-state report:', error);
      process.exitCode = 1;
    });
}

export { synthesizeReport };
