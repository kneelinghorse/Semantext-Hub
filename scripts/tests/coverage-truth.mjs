#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const artifactsDir = path.join(repoRoot, 'artifacts', 'test');
const coverageDir = path.join(repoRoot, 'coverage');
const coverageSummaryPath = path.join(coverageDir, 'coverage-summary.json');
const artifactCoveragePath = path.join(artifactsDir, 'coverage-summary.json');
const jestResultsPath = path.join(artifactsDir, 'jest-results.json');
const readmePath = path.join(repoRoot, 'README.md');

const TEST_BLOCK_BEGIN = '<!-- TEST-COUNTS:BEGIN -->';
const TEST_BLOCK_END = '<!-- TEST-COUNTS:END -->';

const thresholds = {
  statements: 80,
  branches: 70,
  functions: 80,
  lines: 80,
};

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

function runJestWithCoverage() {
  return new Promise((resolve, reject) => {
    const jestBin = path.join(repoRoot, 'node_modules', 'jest', 'bin', 'jest.js');
    const args = [
      '--experimental-vm-modules',
      jestBin,
      '--ci',
      '--coverage',
      '--maxWorkers=2',
      '--testTimeout=30000',
      '--json',
      '--outputFile',
      jestResultsPath,
    ];

    const child = spawn('node', args, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        COVERAGE_TRUTH: 'true',
      },
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Jest exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

async function readJson(filePath, label) {
  try {
    const file = await readFile(filePath, 'utf8');
    return JSON.parse(file);
  } catch (error) {
    throw new Error(`Unable to read ${label} at ${filePath}: ${error.message}`);
  }
}

function formatPct(value) {
  return `${value.toFixed(1)}%`;
}

function buildReadmeBlock({ timestamp, coverageTotals, testStats }) {
  const lines = [
    TEST_BLOCK_BEGIN,
    `- Updated: ${timestamp}`,
    `- Test suites: ${testStats.numTotalTestSuites} total (passed ${testStats.numPassedTestSuites}, failed ${testStats.numFailedTestSuites}, pending ${testStats.numPendingTestSuites})`,
    `- Tests: ${testStats.numTotalTests} total (passed ${testStats.numPassedTests}, failed ${testStats.numFailedTests}, skipped ${testStats.numPendingTests}, todo ${testStats.numTodoTests})`,
    `- Coverage (statements): ${formatPct(coverageTotals.statements.pct)} (${coverageTotals.statements.covered}/${coverageTotals.statements.total})`,
    `- Coverage (functions): ${formatPct(coverageTotals.functions.pct)} (${coverageTotals.functions.covered}/${coverageTotals.functions.total})`,
    `- Coverage (branches): ${formatPct(coverageTotals.branches.pct)} (${coverageTotals.branches.covered}/${coverageTotals.branches.total})`,
    `- Coverage (lines): ${formatPct(coverageTotals.lines.pct)} (${coverageTotals.lines.covered}/${coverageTotals.lines.total})`,
    TEST_BLOCK_END,
  ];

  return `${lines.join('\n')}\n`;
}

async function updateReadme(block) {
  let readme = await readFile(readmePath, 'utf8');

  if (!readme.includes(TEST_BLOCK_BEGIN) || !readme.includes(TEST_BLOCK_END)) {
    const anchor = '## ✅ Test Coverage';
    if (readme.includes(anchor)) {
      readme = readme.replace(anchor, `${anchor}\n\n${block}`);
    } else {
      readme = `${readme.trimEnd()}\n\n${block}`;
    }
  } else {
    const blockRegex = new RegExp(`${TEST_BLOCK_BEGIN}[\\s\\S]*?${TEST_BLOCK_END}\\n?`, 'm');
    readme = readme.replace(blockRegex, block);
  }

  await writeFile(readmePath, readme);
}

function evaluateThresholds(coverageTotals) {
  const status = Object.entries(thresholds).reduce((acc, [key, minimum]) => {
    const pct = coverageTotals[key].pct;
    acc[key] = {
      minimum,
      actual: pct,
      ok: pct >= minimum,
    };
    return acc;
  }, {});

  return {
    status,
    ok: Object.values(status).every(({ ok }) => ok),
  };
}

async function writeCoverageArtifact({ timestamp, coverageTotals }) {
  const evaluation = evaluateThresholds(coverageTotals);
  const payload = {
    ts: timestamp,
    totals: coverageTotals,
    thresholds,
    evaluation: evaluation.status,
    meetsThresholds: evaluation.ok,
  };

  await ensureDir(artifactsDir);
  await writeFile(artifactCoveragePath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const skipTests = args.has('--skip-tests');
  const timestamp = new Date().toISOString();

  await ensureDir(artifactsDir);

  if (!skipTests) {
    await runJestWithCoverage();
  }

  const [coverageSummary, jestResults] = await Promise.all([
    readJson(coverageSummaryPath, 'coverage summary'),
    readJson(jestResultsPath, 'Jest results'),
  ]);

  const coverageTotals = coverageSummary.total;
  const testStats = {
    numTotalTests: jestResults.numTotalTests ?? 0,
    numPassedTests: jestResults.numPassedTests ?? 0,
    numFailedTests: jestResults.numFailedTests ?? 0,
    numPendingTests: jestResults.numPendingTests ?? 0,
    numTodoTests: jestResults.numTodoTests ?? 0,
    numTotalTestSuites: jestResults.numTotalTestSuites ?? 0,
    numPassedTestSuites: jestResults.numPassedTestSuites ?? 0,
    numFailedTestSuites: jestResults.numFailedTestSuites ?? 0,
    numPendingTestSuites: jestResults.numPendingTestSuites ?? 0,
  };

  const block = buildReadmeBlock({ timestamp, coverageTotals, testStats });

  await updateReadme(block);
  await writeCoverageArtifact({ timestamp, coverageTotals });

  await rm(jestResultsPath, { force: true });

  const evaluation = evaluateThresholds(coverageTotals);
  if (!evaluation.ok) {
    console.warn('Coverage thresholds not met:', evaluation.status);
    process.exitCode = 1;
  } else {
    console.log('Coverage thresholds satisfied.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
