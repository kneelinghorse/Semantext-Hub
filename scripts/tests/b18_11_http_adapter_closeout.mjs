#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const log = (...args) => console.log('[CloseOut]', ...args);
const exists = (p) => fs.existsSync(p);
const jrPath = 'artifacts/test/jest-results.json';
const flkPath = 'artifacts/test/flakiness.jsonl';
const outPath = 'artifacts/test/http-adapter-closeout.json';

const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit' }).status ?? 0;

fs.mkdirSync('artifacts/test', { recursive: true });

// 1) run suite once with JSON output
const jestArgs = [
  '--experimental-vm-modules',
  './node_modules/jest/bin/jest.js',
  'tests/property/workflow/http-adapter.test.js',
  '--runInBand',
  '--json',
  `--outputFile=${jrPath}`,
];
run('node', jestArgs);

// 2) deflake N=30 -> JSONL
if (exists('tests/util/deflake-runner.js')) {
  fs.writeFileSync(flkPath, '', 'utf8');
  for (let iteration = 1; iteration <= 30; iteration += 1) {
    const status = run('node', [
      'tests/util/deflake-runner.js',
      '--testPathPattern',
      'tests/property/workflow/http-adapter.test.js',
      '--iterations',
      '30',
      '--iteration',
      String(iteration),
    ]);
    if (status !== 0) {
      break;
    }
  }
} else {
  fs.writeFileSync(flkPath, '', 'utf8');
}

// 3) decide: unquarantine if failures===0
let last = {};
try {
  const raw = fs.readFileSync(flkPath, 'utf8').trim();
  const lines = raw ? raw.split('\n').filter(Boolean) : [];
  last = lines.length ? JSON.parse(lines[lines.length - 1]) : {};
} catch {}

const stats = last.stats ?? {};
const iterations = last.iteration ?? 0;
const totalIterations = last.iterationOf ?? iterations;
const failures = stats.failedTests ?? null;
const ok = failures === 0 && iterations >= 30;
const result = {
  cluster: 'http-adapter',
  passes: iterations,
  failures,
  unquarantined: false,
  at: new Date().toISOString(),
};

if (ok) {
  run('node', ['scripts/tests/b18_11_unquarantine_http_adapter.mjs']);
  result.unquarantined = true;
}

// write summary
fs.mkdirSync('artifacts/test', { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
log('summary', result);
