import path from 'node:path';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import request from 'supertest';
import { chromium } from 'playwright';
import { jest } from '@jest/globals';
import { createApp } from '../../app/ui/authoring/server.mjs';

function ensureDirSync(p) {
  fssync.mkdirSync(p, { recursive: true });
}

jest.setTimeout(60000);

const screenshotDir = path.resolve(process.cwd(), 'artifacts/ui/screenshots');
ensureDirSync(screenshotDir);

function computeP95(latencies) {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[idx];
}

async function recordLatency(kind, took_ms) {
  const dir = path.resolve(process.cwd(), 'artifacts/perf');
  ensureDirSync(dir);
  const file = path.join(dir, 'ui-preview.jsonl');
  const line = JSON.stringify({ ts: new Date().toISOString(), kind, took_ms });
  await fs.appendFile(file, line + '\n');
}

describe('Authoring UI E2E Flows (Mission S19.2)', () => {
  const tmpDir = path.resolve(process.cwd(), 'artifacts/ui/tmp-e2e');
  let app;
  let api;

  beforeAll(() => {
    ensureDirSync(tmpDir);
    app = createApp({ baseDir: tmpDir });
    api = request.agent(app);
  });

  describe('Flow 1: edit→validate→save→graph', () => {
    test('complete workflow with viewer routes', async () => {
      // Step 1: Edit - create a schema and manifest
      const defsPath = path.join(tmpDir, 'flow1-defs.json');
      await fs.writeFile(defsPath, JSON.stringify({
        $id: 'flow1-defs.json',
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $defs: {
          serviceName: { type: 'string', minLength: 1 }
        }
      }, null, 2));

      const schema = {
        $id: 'flow1-schema.json',
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          name: { $ref: './flow1-defs.json#/$defs/serviceName' },
          version: { type: 'string' },
          dependencies: { type: 'array', items: { type: 'string' } }
        },
        required: ['name', 'version']
      };

      const manifest = { 
        name: 'test-service', 
        version: '1.0.0', 
        dependencies: ['dep-a', 'dep-b'] 
      };

      // Step 2: Validate - using viewer route POST /api/validate
      const validateRes = await api
        .post('/api/validate')
        .send({ schema, manifest, baseDir: tmpDir });

      expect(validateRes.status).toBe(200);
      expect(validateRes.body.ok).toBe(true);
      expect(validateRes.body.draft).toBe('2020-12');
      expect(validateRes.body.results[0].valid).toBe(true);
      expect(validateRes.body.results[0].errors).toEqual([]);
      expect(validateRes.body.took_ms).toBeDefined();

      // Step 3: Save - write manifest to disk (simulates save)
      const manifestPath = path.join(tmpDir, 'flow1-manifest.json');
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      const saved = await fs.readFile(manifestPath, 'utf8');
      expect(JSON.parse(saved)).toEqual(manifest);

      // Step 4: Graph - using viewer route POST /api/graph
      const graphRes = await api
        .post('/api/graph')
        .send({ manifest });

      expect(graphRes.status).toBe(200);
      expect(graphRes.body.ok).toBe(true);
      expect(graphRes.body.nodes).toBeDefined();
      expect(graphRes.body.edges).toBeDefined();
      expect(graphRes.body.summary).toMatchObject({
        nodeCount: expect.any(Number),
        edgeCount: expect.any(Number)
      });
      expect(graphRes.body.nodes.length).toBeGreaterThan(0);
      expect(graphRes.body.edges.length).toBe(2); // two dependencies
    });

    test('zero network 4xx/5xx errors in flow', async () => {
      const schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { id: { type: 'string' } }
      };
      const manifest = { id: 'test' };

      const r1 = await api.post('/api/validate').send({ schema, manifest });
      expect(r1.status).toBe(200);

      const r2 = await api.post('/api/graph').send({ manifest });
      expect(r2.status).toBe(200);

      // Verify no errors in responses
      expect(r1.body.ok).toBe(true);
      expect(r2.body.ok).toBe(true);
    });
  });

  describe('Flow 2: schema error shows pointer', () => {
    test('validation errors include pointer field', async () => {
      const schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 3 },
          age: { type: 'number', minimum: 0 }
        },
        required: ['name', 'age']
      };

      const invalidManifest = {
        name: 'ab', // too short
        age: -5 // negative
      };

      const res = await api
        .post('/api/validate')
        .send({ schema, manifest: invalidManifest });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.results[0].valid).toBe(false);
      expect(res.body.results[0].errors.length).toBeGreaterThan(0);

      // Verify each error has pointer field
      for (const error of res.body.results[0].errors) {
        expect(error).toHaveProperty('pointer');
        expect(error).toHaveProperty('path');
        expect(error).toHaveProperty('msg');
        expect(typeof error.pointer).toBe('string');
      }
    });

    test('pointer indicates exact field location', async () => {
      const schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            properties: {
              field: { type: 'string' }
            }
          }
        }
      };

      const manifest = {
        nested: {
          field: 123 // wrong type
        }
      };

      const res = await api
        .post('/api/validate')
        .send({ schema, manifest });

      expect(res.status).toBe(200);
      expect(res.body.results[0].valid).toBe(false);
      const errors = res.body.results[0].errors;
      expect(errors.length).toBeGreaterThan(0);
      
      const fieldError = errors.find(e => e.pointer.includes('nested') || e.pointer.includes('field'));
      expect(fieldError).toBeDefined();
      expect(fieldError.pointer).toBeTruthy();
    });
  });

  describe('Flow 3: dark/light theme persistence', () => {
    test('UI serves theme toggle functionality', async () => {
      // Test that the UI HTML includes theme toggle
      const htmlRes = await api.get('/');
      expect(htmlRes.status).toBe(200);
      expect(htmlRes.text).toContain('theme-toggle');
      // data-theme is set by JavaScript, not in initial HTML
      expect(htmlRes.text).toContain('<html');
    });

    test('CSS includes theme variables', async () => {
      const cssRes = await api.get('/styles.css');
      expect(cssRes.status).toBe(200);
      expect(cssRes.text).toContain('[data-theme="light"]');
      expect(cssRes.text).toContain('--bg');
      expect(cssRes.text).toContain('--fg');
    });

    test('JS includes theme persistence logic', async () => {
      const jsRes = await api.get('/main.js');
      expect(jsRes.status).toBe(200);
      expect(jsRes.text).toContain('localStorage');
      expect(jsRes.text).toContain('theme');
      expect(jsRes.text).toContain('setTheme');
    });
  });

  describe('Performance: Preview p95 ≤ 500ms', () => {
    test('50 preview calls meet p95 budget', async () => {
      const latencies = [];
      const manifest = { 
        id: 'perf-test', 
        name: 'Performance Test Service',
        version: '1.0.0',
        dependencies: ['dep-1', 'dep-2', 'dep-3'] 
      };

      // Run 50 preview calls
      for (let i = 0; i < 50; i++) {
        const start = Date.now();
        const res = await api
          .post('/api/graph')
          .send({ manifest });
        const took = Date.now() - start;
        
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        
        latencies.push(took);
        await recordLatency('graph', took);
      }

      const p95 = computeP95(latencies);
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const min = Math.min(...latencies);
      const max = Math.max(...latencies);

      // Log metrics for visibility
      console.log(`\nPreview Performance (50 calls):`);
      console.log(`  p95: ${p95}ms`);
      console.log(`  avg: ${avg.toFixed(2)}ms`);
      console.log(`  min: ${min}ms`);
      console.log(`  max: ${max}ms`);

      // Success criterion: p95 ≤ 500ms
      expect(p95).toBeLessThanOrEqual(500);
    });

    test('validation calls meet p95 budget', async () => {
      const latencies = [];
      const schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          name: { type: 'string' },
          version: { type: 'string' }
        }
      };
      const manifest = { name: 'test', version: '1.0.0' };

      // Run 50 validation calls
      for (let i = 0; i < 50; i++) {
        const start = Date.now();
        const res = await api
          .post('/api/validate')
          .send({ schema, manifest });
        const took = Date.now() - start;
        
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        
        latencies.push(took);
        await recordLatency('validate', took);
      }

      const p95 = computeP95(latencies);
      console.log(`\nValidation Performance (50 calls):`);
      console.log(`  p95: ${p95}ms`);

      expect(p95).toBeLessThanOrEqual(500);
    });
  });

  describe('API Contract Verification', () => {
    test('POST /api/validate matches viewer contract', async () => {
      const schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object'
      };
      const manifest = { test: true };

      const res = await api
        .post('/api/validate')
        .send({ schema, manifest });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: expect.any(Boolean),
        draft: expect.any(String),
        results: expect.any(Array),
        took_ms: expect.any(Number)
      });
    });

    test('POST /api/graph matches viewer contract', async () => {
      const manifest = { id: 'test-contract' };

      const res = await api
        .post('/api/graph')
        .send({ manifest });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: expect.any(Boolean),
        nodes: expect.any(Array),
        edges: expect.any(Array),
        took_ms: expect.any(Number),
        summary: expect.objectContaining({
          nodeCount: expect.any(Number),
          edgeCount: expect.any(Number)
        })
      });
    });

    test('error responses have consistent structure', async () => {
      // Missing schema
      const res1 = await api
        .post('/api/validate')
        .send({ manifest: {} });

      expect(res1.status).toBe(400);
      expect(res1.body).toMatchObject({
        ok: false,
        error: expect.any(String),
        message: expect.any(String)
      });
    });
  });

  describe('Browser authoring flow with Playwright', () => {
    let browser;

    async function withServer(run) {
      const root = path.resolve(process.cwd(), 'artifacts/ui/tmp-e2e/browser');
      ensureDirSync(root);
      const runDir = path.join(root, `run-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      ensureDirSync(runDir);

      const expressApp = createApp({ baseDir: runDir });
      const server = await new Promise((resolve, reject) => {
        const srv = expressApp.listen(0, () => resolve(srv));
        srv.once('error', reject);
      });
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        await run({ baseDir: runDir, url: baseUrl });
      } finally {
        await new Promise((resolve) => server.close(resolve));
        await fs.rm(runDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    beforeAll(async () => {
      browser = await chromium.launch({ headless: true });
    });

    afterAll(async () => {
      await browser?.close();
    });

    test('edit → validate (error+pass) → save → graph → theme persists', async () => {
      await withServer(async ({ baseDir, url }) => {
        const defsPath = path.join(baseDir, 'flow-defs.json');
        await fs.writeFile(defsPath, JSON.stringify({
          $id: 'flow-defs.json',
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $defs: {
            serviceName: { type: 'string', minLength: 3 }
          }
        }, null, 2));

        const schema = {
          $id: 'flow-schema.json',
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {
            name: { $ref: './flow-defs.json#/$defs/serviceName' },
            version: { type: 'string' },
            dependencies: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['name', 'version']
        };

        const invalidManifest = {
          name: 'ab',
          version: '1.0.0',
          dependencies: ['service-b']
        };

        const validManifest = {
          name: 'test-service',
          version: '1.0.0',
          dependencies: ['service-b', 'service-c']
        };

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        await page.fill('#schema', JSON.stringify(schema, null, 2));
        await page.fill('#manifest', JSON.stringify(invalidManifest, null, 2));
        await page.fill('#baseDir', baseDir);

        await page.click('#validate');
        await page.waitForFunction(() => {
          const raw = document.querySelector('#validate-result')?.textContent ?? '';
          try {
            const data = JSON.parse(raw);
            return Array.isArray(data.results?.[0]?.errors) && data.results[0].errors.length > 0;
          } catch {
            return false;
          }
        });

        const invalidResult = await page.evaluate(() => JSON.parse(document.querySelector('#validate-result').textContent));
        expect(invalidResult.results[0].errors[0].pointer).toBeDefined();

        await page.fill('#manifest', JSON.stringify(validManifest, null, 2));
        await page.click('#validate');
        await page.waitForFunction(() => {
          const raw = document.querySelector('#validate-result')?.textContent ?? '';
          try {
            const data = JSON.parse(raw);
            return data.results?.[0]?.valid === true;
          } catch {
            return false;
          }
        });
        const validResult = await page.evaluate(() => JSON.parse(document.querySelector('#validate-result').textContent));
        expect(validResult.results[0].valid).toBe(true);

        const manifestPath = path.join(baseDir, 'flow-manifest.json');
        await fs.writeFile(manifestPath, JSON.stringify(validManifest, null, 2));
        const saved = await fs.readFile(manifestPath, 'utf8');
        expect(JSON.parse(saved).name).toBe(validManifest.name);

        await page.click('#preview-graph');
        await page.waitForFunction(() => {
          const raw = document.querySelector('#preview-result')?.textContent ?? '';
          try {
            const data = JSON.parse(raw);
            return Array.isArray(data.nodes) && data.nodes.length > 0;
          } catch {
            return false;
          }
        });
        const graphResult = await page.evaluate(() => JSON.parse(document.querySelector('#preview-result').textContent));
        expect(graphResult.summary.nodeCount).toBeGreaterThan(0);

        const initialTheme = await page.evaluate(() => document.documentElement.dataset.theme || 'light');
        await page.click('#theme-toggle');
        const toggledTheme = await page.evaluate(() => document.documentElement.dataset.theme || 'light');
        expect(toggledTheme).not.toBe(initialTheme);

        await page.reload({ waitUntil: 'domcontentloaded' });
        const persistedTheme = await page.evaluate(() => document.documentElement.dataset.theme || 'light');
        expect(persistedTheme).toBe(toggledTheme);

        const screenshotPath = path.join(screenshotDir, `authoring-flow-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        const stats = await fs.stat(screenshotPath);
        expect(stats.size).toBeGreaterThan(0);

        await page.close();
      });
    });
  });
});
