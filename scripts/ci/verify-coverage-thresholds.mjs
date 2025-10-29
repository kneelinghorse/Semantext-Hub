#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coverageThresholdConfig } from '../../config/coverage-thresholds.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const metricLabels = {
  statements: 'statements',
  branches: 'branches',
  functions: 'functions',
  lines: 'lines',
};

const toPct = (value) => Number.parseFloat(value ?? 0).toFixed(2);

const resolveSummaryPath = () => {
  const input = process.argv[2] ?? 'coverage/coverage-summary.json';
  return path.isAbsolute(input) ? input : path.resolve(ROOT, input);
};

const loadSummary = async (summaryPath) => {
  try {
    const raw = await fs.readFile(summaryPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to read coverage summary at ${summaryPath}: ${error.message}`);
  }
};

const normalizeFileCoverage = (summary) => {
  const map = new Map();
  for (const [key, value] of Object.entries(summary)) {
    if (key === 'total') continue;
    const relative = path.relative(ROOT, key);
    const normalized = relative.startsWith('.') ? relative : `./${relative}`;
    map.set(normalized, value);
    map.set(relative, value);
  }
  return map;
};

const collectFailures = (actual, expected, scope) => {
  const failures = [];
  for (const [metric, threshold] of Object.entries(expected)) {
    if (!(metric in metricLabels)) continue;
    const pct = actual?.[metric]?.pct ?? 0;
    if (pct + Number.EPSILON < threshold) {
      failures.push(
        `${scope} ${metricLabels[metric]} ${toPct(pct)}% (requires ≥${threshold}%)`,
      );
    }
  }
  return failures;
};

const run = async () => {
  const summaryPath = resolveSummaryPath();
  const summary = await loadSummary(summaryPath);

  const failures = [];

  const globalActual = summary.total;
  failures.push(
    ...collectFailures(
      globalActual,
      coverageThresholdConfig.global,
      'Global coverage',
    ),
  );

  const fileCoverageMap = normalizeFileCoverage(summary);
  for (const [relativePath, thresholds] of Object.entries(coverageThresholdConfig.files)) {
    const metrics = fileCoverageMap.get(`./${relativePath}`) ?? fileCoverageMap.get(relativePath);
    if (!metrics) {
      failures.push(
        `Coverage data missing for ${relativePath}`,
      );
      continue;
    }
    failures.push(
      ...collectFailures(metrics, thresholds, `Critical path ${relativePath}`),
    );
  }

  if (failures.length > 0) {
    console.error('❌ Coverage verification failed:');
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    console.error(`\nInspect ${path.relative(ROOT, summaryPath)} for full metrics.`);
    process.exit(1);
  }

  const formatMetrics = (metrics) =>
    Object.entries(metricLabels)
      .map(([key, label]) => `${label}: ${toPct(metrics[key]?.pct ?? 0)}%`)
      .join(', ');

  console.log('✅ Coverage thresholds satisfied.');
  console.log(`Global coverage → ${formatMetrics(globalActual)}`);
};

run().catch((error) => {
  console.error('❌ Coverage verification encountered an error.');
  console.error(error.stack || error.message);
  process.exit(1);
});

