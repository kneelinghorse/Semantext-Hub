#!/usr/bin/env node
/**
 * Benchmark authoring preview performance
 * Uses the viewer seed index as a proxy for preview payloads.
 */

import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import fetch from 'node-fetch';

fs.mkdirSync('artifacts/perf', { recursive: true });
const OUT = 'artifacts/perf/ui-preview.jsonl';
const PREVIEW_URL =
  process.env.PREVIEW_URL ||
  'http://localhost:3000/graph/seeds/graph10k/index.json';

const METHOD = process.env.PREVIEW_METHOD || 'GET';
const PAYLOAD = process.env.PREVIEW_BODY ? JSON.parse(process.env.PREVIEW_BODY) : null;

(async () => {
  const samples = [];

  for (let i = 0; i < 50; i++) {
    const t0 = performance.now();
    const response = await fetch(PREVIEW_URL, {
      method: METHOD,
      headers: PAYLOAD ? { 'Content-Type': 'application/json' } : undefined,
      body: PAYLOAD ? JSON.stringify(PAYLOAD) : undefined,
      cache: 'no-store'
    });
    const t1 = performance.now();

    await response.text(); // drain body

    const ms = +(t1 - t0).toFixed(2);
    samples.push(ms);

    fs.appendFileSync(
      OUT,
      JSON.stringify({ ok: response.ok, status: response.status, ms }) + '\n'
    );
  }

  const sorted = samples.slice().sort((a, b) => a - b);
  const index = Math.floor(0.95 * (sorted.length - 1));
  const p95 = sorted[index] ?? null;
  const avg = sorted.length
    ? sorted.reduce((acc, value) => acc + value, 0) / sorted.length
    : null;

  fs.appendFileSync(
    OUT,
    JSON.stringify({
      summary: true,
      count: samples.length,
      averageMs: avg !== null ? +avg.toFixed(2) : null,
      p95Ms: p95 !== null ? +p95.toFixed(2) : null
    }) + '\n'
  );

  console.log(
    `[perf] wrote ${OUT} (p95=${p95?.toFixed(2) ?? 'n/a'} ms, avg=${avg?.toFixed(2) ?? 'n/a'} ms)`
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
