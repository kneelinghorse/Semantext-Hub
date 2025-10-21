#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const summaryPath = path.resolve(process.cwd(), 'coverage/coverage-summary.json');
if (!fs.existsSync(summaryPath)) {
  console.error('[assert-coverage] coverage-summary.json not found at', summaryPath);
  process.exit(2);
}
const data = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const files = data || {};
const want = [
  'app/services/registry/server.mjs',
  'app/ui/authoring/server.mjs'
];

const result = { targets: {}, ok: true, generatedAt: new Date().toISOString() };

for (const target of want) {
  const key = Object.keys(files).find(k => k.endsWith(target));
  if (!key) {
    result.targets[target] = { found: false, reason: 'file not in coverage map' };
    result.ok = false;
    continue;
  }
  const pct = (files[key].lines?.pct ?? 0);
  result.targets[target] = { found: true, linesPct: pct, threshold: 85, pass: pct >= 85 };
  if (pct < 85) result.ok = false;
}

const outPath = path.resolve(process.cwd(), 'artifacts/test/assert-coverage.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');

if (!result.ok) {
  console.error('[assert-coverage] FAIL', result);
  process.exit(1);
} else {
  console.log('[assert-coverage] OK', result);
}

