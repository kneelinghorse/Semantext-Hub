#!/usr/bin/env node
/**
 * Measure viewer TTI and memory using Playwright + CDP
 */

import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.VIEWER_URL || 'http://localhost:3000/viewer?seed=graph10k';

fs.mkdirSync('artifacts/perf', { recursive: true });
const outTTI = 'artifacts/perf/viewer-tti.jsonl';
const outMem = 'artifacts/perf/viewer-mem.jsonl';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  let tti = null;

  page.on('console', (message) => {
    if (message.text().startsWith('[graphReady]')) {
      const value = Number(message.text().split('=')[1]);
      if (!Number.isNaN(value)) {
        tti = value;
      }
    }
  });

  const client = await context.newCDPSession(page);
  await client.send('Performance.enable');
  await client.send('Runtime.enable');

  await page.goto(URL, { waitUntil: 'networkidle' });

  await page.waitForFunction(() => window.__GRAPH_READY__ === true, { timeout: 60000 });

  if (tti === null) {
    tti = await page.evaluate(() => window.__GRAPH_READY_MS ?? null);
  }

  const graphMetadata = await page.evaluate(() => window.__GRAPH_METADATA__ ?? null);

  const perfMetrics = await client.send('Performance.getMetrics').catch(() => null);
  const jsHeapMetric = Array.isArray(perfMetrics?.metrics)
    ? perfMetrics.metrics.find((metric) => metric.name === 'JSHeapUsedSize')
    : null;
  const jsHeapUsedBytes = jsHeapMetric ? jsHeapMetric.value : null;
  const jsHeapUsedMB = jsHeapUsedBytes != null ? +(jsHeapUsedBytes / (1024 * 1024)).toFixed(2) : null;

  const heapUsage = await client.send('Runtime.getHeapUsage').catch(() => null);

  const timestamp = new Date().toISOString();

  fs.appendFileSync(
    outTTI,
    JSON.stringify({
      url: URL,
      tti,
      timestamp,
      parts: graphMetadata?.parts?.length ?? null,
      nodeCount: graphMetadata?.metadata?.nodeCount ?? graphMetadata?.index?.node_count ?? null,
      partition: graphMetadata?.metadata?.partition ?? graphMetadata?.index?.partition ?? null
    }) + '\n'
  );

  fs.appendFileSync(
    outMem,
    JSON.stringify({
      url: URL,
      timestamp,
      jsHeapUsedBytes,
      jsHeapUsedMB,
      heapUsage,
      performanceMetrics: perfMetrics?.metrics ?? null
    }) + '\n'
  );

  await browser.close();

  console.log('[perf] wrote', outTTI, outMem);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
