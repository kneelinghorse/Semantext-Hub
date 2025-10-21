#!/usr/bin/env node
import fs from 'node:fs';

const qpath = 'tests/quarantine.globs.json';
const md = 'tests/QUARANTINED.md';
const q = JSON.parse(fs.readFileSync(qpath, 'utf8'));
const beforeTests = new Set(q.testPathIgnorePatterns || []);
const beforeCov = new Set(q.coveragePathIgnorePatterns || []);

const drop = (s) => s.filter((p) => !/http-adapter/i.test(p));
q.testPathIgnorePatterns = drop(q.testPathIgnorePatterns || []);
q.coveragePathIgnorePatterns = drop(q.coveragePathIgnorePatterns || []);
fs.writeFileSync(qpath, JSON.stringify(q, null, 2));

let table = fs.readFileSync(md, 'utf8');
table = table.replace(
  /\|\s*tests\/\*\*\/http-adapter\*\.test\.js\s*\|([^\n]*)\|/i,
  (m) =>
    m
      .replace('| TBD |', '| Completed |')
      .replace(/\|\s*_YYYY-MM-DD_\s*\|/, `| ${new Date().toISOString().slice(0, 10)} |`),
);
fs.writeFileSync(md, table, 'utf8');
console.log('[B18.11c] http-adapter unquarantined and QUARANTINED.md updated');
