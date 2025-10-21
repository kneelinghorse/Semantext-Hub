/**
 * Viewer API Routes - Comprehensive Test Suite
 * Mission S19.2-20251021
 * 
 * Tests critical viewer surfaces: /api/validate and /api/graph
 * Ensures stable JSON shapes, error handling, and chunking behavior
 */

import { describe, expect, it, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { setupApiRoutes } from '../../packages/runtime/viewer/routes/api.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../fixtures/manifests');
const TEMP_TEST_DIR = path.join(__dirname, '../_tmp/viewer-api-test');

function createViewerApp(artifactsDir) {
  const app = express();
  app.use(express.json());
  setupApiRoutes(app, artifactsDir);
  return app;
}

describe('Viewer API - /api/validate', () => {
  let app;

  beforeAll(async () => {
    // Ensure fixtures exist
    await fs.mkdir(FIXTURES_DIR, { recursive: true });
    
    // Create test manifests if they don't exist
    const apiManifest = {
      protocol: {
        urn: 'urn:proto:test:api',
        kind: 'api',
        version: '1.0.0',
        name: 'Test API',
        dependencies: []
      },
      event: {
        urn: 'urn:event:test:api',
        kind: 'api'
      }
    };

    const dataManifest = {
      protocol: {
        urn: 'urn:proto:test:data',
        kind: 'data',
        version: '1.0.0',
        name: 'Test Data'
      },
      event: {
        urn: 'urn:event:test:data',
        kind: 'data'
      }
    };

    const invalidManifest = {
      // Missing protocol section
      event: {
        kind: 'invalid'
      }
    };

    await fs.writeFile(
      path.join(FIXTURES_DIR, 'api-test.json'),
      JSON.stringify(apiManifest, null, 2)
    );
    await fs.writeFile(
      path.join(FIXTURES_DIR, 'data-test.json'),
      JSON.stringify(dataManifest, null, 2)
    );
    await fs.writeFile(
      path.join(FIXTURES_DIR, 'invalid-test.json'),
      JSON.stringify(invalidManifest, null, 2)
    );

    app = express();
    app.use(express.json());
    setupApiRoutes(app, FIXTURES_DIR);
  });

  describe('Schema and shape validation', () => {
    it('returns 400 when manifests array is missing', async () => {
      const response = await request(app)
        .post('/api/validate')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('manifests');
    });

    it('returns 400 when manifests array is empty', async () => {
      const response = await request(app)
        .post('/api/validate')
        .send({ manifests: [] });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('returns correct JSON schema for valid manifests', async () => {
      const response = await request(app)
        .post('/api/validate')
        .send({ manifests: ['api-test.json'] });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        valid: expect.any(Boolean),
        checked_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        summary: {
          total: expect.any(Number),
          passed: expect.any(Number),
          warnings: expect.any(Number),
          failed: expect.any(Number)
        },
        manifests: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            urn: expect.any(String),
            validationStatus: expect.stringMatching(/^(pass|warning|fail)$/),
            errors: expect.any(Array),
            warnings: expect.any(Array)
          })
        ]),
        errors: expect.any(Array)
      });
    });

    it('validates multiple manifests and aggregates results', async () => {
      const response = await request(app)
        .post('/api/validate')
        .send({ manifests: ['api-test.json', 'data-test.json'] });

      expect(response.status).toBe(200);
      expect(response.body.summary.total).toBe(2);
      expect(response.body.manifests).toHaveLength(2);
      expect(response.body.valid).toBe(true);
    });

    it('rejects absolute manifest paths for validation requests', async () => {
      const response = await request(app)
        .post('/api/validate')
        .send({ manifests: ['/etc/passwd'] });

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(false);
      const result = response.body.manifests[0];
      expect(result.validationStatus).toBe('fail');
      expect(result.errors[0].message).toContain('Invalid manifest name');
    });
  });

  describe('Error handling and validation status', () => {
    it('detects manifest with missing protocol section', async () => {
      const response = await request(app)
        .post('/api/validate')
        .send({ manifests: ['invalid-test.json'] });

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(false);
      expect(response.body.summary.failed).toBeGreaterThan(0);
      
      const invalidResult = response.body.manifests[0];
      expect(invalidResult.validationStatus).toBe('fail');
      expect(invalidResult.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('protocol'),
            level: 'error'
          })
        ])
      );
    });

    it('returns 404-style validation error for non-existent manifest', async () => {
      const response = await request(app)
        .post('/api/validate')
        .send({ manifests: ['does-not-exist.json'] });

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(false);
      expect(response.body.summary.failed).toBe(1);
      
      const result = response.body.manifests[0];
      expect(result.validationStatus).toBe('fail');
      expect(result.errors[0].message).toContain('not found');
    });

    it('rejects manifests with path traversal attempts', async () => {
      const response = await request(app)
        .post('/api/validate')
        .send({ manifests: ['../../../etc/passwd'] });

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(false);
      
      const result = response.body.manifests[0];
      expect(result.validationStatus).toBe('fail');
      expect(result.errors[0].message).toContain('Invalid manifest name');
    });

    it('normalizes manifest entries from object format', async () => {
      const response = await request(app)
        .post('/api/validate')
        .send({ 
          manifests: [
            { filename: 'api-test.json' },
            { id: 'data-test' }
          ] 
        });

      expect(response.status).toBe(200);
      expect(response.body.summary.total).toBe(2);
      expect(response.body.manifests).toHaveLength(2);
    });
  });

  describe('Validation warnings vs errors', () => {
    it('issues warnings for missing optional fields', async () => {
      const manifestWithWarnings = {
        protocol: {
          urn: 'urn:proto:test:warnings',
          // Missing kind and version
          name: 'Warning Test'
        },
        // Missing event.urn
        event: {
          kind: 'test'
        }
      };

      await fs.writeFile(
        path.join(FIXTURES_DIR, 'warnings-test.json'),
        JSON.stringify(manifestWithWarnings, null, 2)
      );

      const response = await request(app)
        .post('/api/validate')
        .send({ manifests: ['warnings-test.json'] });

      expect(response.status).toBe(200);
      const result = response.body.manifests[0];
      
      expect(result.validationStatus).toBe('warning');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.errors.length).toBe(0);
      
      // Should have warnings about missing kind, version, and event.urn
      const warningPaths = result.warnings.map(w => w.path);
      expect(warningPaths.some(p => p.includes('kind'))).toBe(true);
    });
  });

  describe('JSON Pointer paths in errors', () => {
    it('provides JSON Pointer paths for validation errors', async () => {
      const response = await request(app)
        .post('/api/validate')
        .send({ manifests: ['invalid-test.json'] });

      expect(response.status).toBe(200);
      const result = response.body.manifests[0];
      
      expect(result.errors[0].path).toBeDefined();
      expect(result.errors[0].path).toContain('.');
    });

    it('includes manifest name in aggregated errors', async () => {
      const response = await request(app)
        .post('/api/validate')
        .send({ manifests: ['invalid-test.json'] });

      expect(response.status).toBe(200);
      expect(response.body.errors.length).toBeGreaterThan(0);
      expect(response.body.errors[0]).toHaveProperty('manifest');
      expect(response.body.errors[0].manifest).toBeDefined();
    });
  });
});

describe('Viewer API - metadata endpoints', () => {
  let fixturesApp;
  let missingDirApp;

  beforeAll(() => {
    fixturesApp = createViewerApp(FIXTURES_DIR);
    const missingDir = path.join(TEMP_TEST_DIR, 'missing');
    missingDirApp = createViewerApp(missingDir);
  });

  it('reports manifest counts in health check', async () => {
    const res = await request(fixturesApp).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.manifest_count).toBeGreaterThan(0);
  });

  it('returns 500 when health check cannot read directory', async () => {
    const res = await request(missingDirApp).get('/api/health');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to read artifacts directory');
  });

  it('lists manifests and filters by kind', async () => {
    const res = await request(fixturesApp).get('/api/manifests');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.manifests)).toBe(true);
    expect(res.body.manifests.length).toBeGreaterThan(0);

    const apiOnly = await request(fixturesApp).get('/api/manifests?kind=api');
    expect(apiOnly.status).toBe(200);
    expect(apiOnly.body.manifests.every((entry) => entry.kind === 'api')).toBe(true);
  });
});

describe('Viewer API - manifest retrieval', () => {
  const manifestDir = path.join(TEMP_TEST_DIR, 'manifest-route');
  let manifestApp;

  beforeAll(async () => {
    await fs.mkdir(manifestDir, { recursive: true });
    await fs.writeFile(path.join(manifestDir, 'valid.json'), JSON.stringify({
      protocol: { urn: 'urn:test:valid', kind: 'api', version: '1.0.0' },
      event: { urn: 'urn:event:valid', kind: 'api' }
    }, null, 2));
    await fs.writeFile(path.join(manifestDir, 'invalid.json'), '{ invalid json', 'utf8');
    manifestApp = createViewerApp(manifestDir);
  });

  afterAll(async () => {
    await fs.rm(manifestDir, { recursive: true, force: true });
  });

  it('serves manifests by filename', async () => {
    const res = await request(manifestApp).get('/api/manifest/valid.json');
    expect(res.status).toBe(200);
    expect(res.body.protocol.urn).toBe('urn:test:valid');
  });

  it('returns 404 when manifest is missing', async () => {
    const res = await request(manifestApp).get('/api/manifest/missing.json');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Manifest not found');
  });

  it('returns 400 for invalid JSON manifest files', async () => {
    const res = await request(manifestApp).get('/api/manifest/invalid.json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON in manifest file');
  });

  it('rejects path traversal attempts', async () => {
    const res = await request(manifestApp).get('/api/manifest/..%2Fsecret.json');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Invalid path');
  });

  it('handles manifest listing errors gracefully', async () => {
    // Create app pointing to directory that will be removed before request
    const transientDir = path.join(TEMP_TEST_DIR, `transient-${Date.now()}`);
    await fs.mkdir(transientDir, { recursive: true });
    const transientApp = createViewerApp(transientDir);
    await fs.rm(transientDir, { recursive: true, force: true });

    const res = await request(transientApp).get('/api/manifests');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to list manifests');
  });
});

describe('Viewer API - /api/graph', () => {
  let app;
  const nullManifestName = 'null-manifest.json';
  const brokenManifestName = 'broken-graph.json';

  beforeAll(async () => {
    await fs.mkdir(FIXTURES_DIR, { recursive: true });

    // Create manifests with dependencies for graph testing
    const serviceA = {
      protocol: {
        urn: 'urn:proto:test:service-a',
        kind: 'api',
        version: '1.0.0',
        name: 'Service A',
        dependencies: [
          { target: 'Service B', type: 'depends-on' }
        ]
      },
      event: {
        urn: 'urn:event:test:service-a',
        kind: 'api'
      }
    };

    const serviceB = {
      protocol: {
        urn: 'urn:proto:test:service-b',
        kind: 'api',
        version: '1.0.0',
        name: 'Service B',
        dependencies: []
      },
      event: {
        urn: 'urn:event:test:service-b',
        kind: 'api'
      }
    };

    await fs.writeFile(
      path.join(FIXTURES_DIR, 'service-a.json'),
      JSON.stringify(serviceA, null, 2)
    );
    await fs.writeFile(
      path.join(FIXTURES_DIR, 'service-b.json'),
      JSON.stringify(serviceB, null, 2)
    );

    await fs.writeFile(path.join(FIXTURES_DIR, nullManifestName), 'null', 'utf8');
    await fs.writeFile(path.join(FIXTURES_DIR, brokenManifestName), '{ invalid json', 'utf8');

    app = express();
    app.use(express.json());
    setupApiRoutes(app, FIXTURES_DIR);
  });

  describe('Graph index generation', () => {
    it('returns 400 when manifests array is missing', async () => {
      const response = await request(app)
        .post('/api/graph')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('returns correct JSON schema with index and parts', async () => {
      const response = await request(app)
        .post('/api/graph')
        .send({ manifests: ['service-a.json', 'service-b.json'] });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        index: {
          generated_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
          parts: expect.any(Number),
          node_count: expect.any(Number),
          edge_count: expect.any(Number),
          depth: expect.any(Number),
          expires_in_ms: expect.any(Number)
        },
        parts: expect.arrayContaining([
          expect.objectContaining({
            id: expect.stringMatching(/^chunk-/),
            url: expect.stringMatching(/^\/api\/graph\/part\//),
            size: expect.any(Number),
            nodes: expect.any(Number),
            edges: expect.any(Number),
            depth: expect.any(Number)
          })
        ])
      });
    });

    it('generates nodes with correct structure', async () => {
      const response = await request(app)
        .post('/api/graph')
        .send({ manifests: ['service-a.json', 'service-b.json'] });

      expect(response.status).toBe(200);
      expect(response.body.index.node_count).toBe(2);
      expect(response.body.index.edge_count).toBeGreaterThanOrEqual(1);
    });

    it('produces empty graph parts when manifests resolve to no nodes', async () => {
      const response = await request(app)
        .post('/api/graph')
        .send({ manifests: [nullManifestName] });

      expect(response.status).toBe(200);
      expect(response.body.index.node_count).toBe(0);
      expect(response.body.parts[0].nodes).toBe(0);
      expect(response.body.parts[0].edges).toBe(0);
    });

    it('handles empty manifest list gracefully', async () => {
      const response = await request(app)
        .post('/api/graph')
        .send({ manifests: [] });

      expect(response.status).toBe(400);
    });
  });

  describe('Graph chunk retrieval', () => {
    it('retrieves chunk data by ID', async () => {
      // First, generate a graph
      const graphResponse = await request(app)
        .post('/api/graph')
        .send({ manifests: ['service-a.json', 'service-b.json'] });

      expect(graphResponse.status).toBe(200);
      const chunkId = graphResponse.body.parts[0].id;

      // Then retrieve the chunk
      const chunkResponse = await request(app)
        .get(`/api/graph/part/${chunkId}`);

      expect(chunkResponse.status).toBe(200);
      expect(chunkResponse.body).toMatchObject({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            urn: expect.any(String),
            type: expect.any(String),
            format: expect.any(String),
            source: expect.any(String)
          })
        ]),
        edges: expect.any(Array),
        summary: {
          nodes: expect.any(Number),
          edges: expect.any(Number),
          depth: expect.any(Number)
        },
        served_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
      });
    });

    it('returns 404 for non-existent chunk ID', async () => {
      const response = await request(app)
        .get('/api/graph/part/invalid-chunk-id');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not found');
    });

    it('handles chunk expiration correctly', async () => {
      // Generate graph
      const graphResponse = await request(app)
        .post('/api/graph')
        .send({ manifests: ['service-a.json'] });

      const chunkId = graphResponse.body.parts[0].id;
      const expiresInMs = graphResponse.body.index.expires_in_ms;

      // Verify we can access immediately
      const immediate = await request(app).get(`/api/graph/part/${chunkId}`);
      expect(immediate.status).toBe(200);

      // Verify expiration is set
      expect(expiresInMs).toBeGreaterThan(0);
      expect(expiresInMs).toBeLessThanOrEqual(5 * 60 * 1000); // 5 minutes
    });

    it('evicts expired chunks before serving new graph parts', async () => {
      const now = Date.now();
      const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);

      const graphResponse = await request(app)
        .post('/api/graph')
        .send({ manifests: ['service-a.json', 'service-b.json'] });

      expect(graphResponse.status).toBe(200);
      const chunkId = graphResponse.body.parts[0].id;

      // Advance time beyond TTL so eviction kicks in
      nowSpy.mockImplementation(() => now + (5 * 60 * 1000) + 1000);

      const expiredResponse = await request(app)
        .get(`/api/graph/part/${chunkId}`);

      expect(expiredResponse.status).toBe(404);
      expect(expiredResponse.body.error).toContain('not found');

      nowSpy.mockRestore();
    });
  });

  describe('Graph chunking behavior', () => {
    it('chunks large graphs into multiple parts', async () => {
      // Create many manifests to trigger chunking
      const manifests = [];
      for (let i = 0; i < 60; i++) {
        const manifest = {
          protocol: {
            urn: `urn:proto:test:service-${i}`,
            kind: 'api',
            version: '1.0.0',
            name: `Service ${i}`,
            dependencies: []
          },
          event: {
            urn: `urn:event:test:service-${i}`,
            kind: 'api'
          }
        };
        
        await fs.writeFile(
          path.join(FIXTURES_DIR, `service-${i}.json`),
          JSON.stringify(manifest, null, 2)
        );
        manifests.push(`service-${i}.json`);
      }

      const response = await request(app)
        .post('/api/graph')
        .send({ manifests: manifests.slice(0, 60) });

      expect(response.status).toBe(200);
      expect(response.body.index.parts).toBeGreaterThan(1);
      expect(response.body.parts.length).toBe(response.body.index.parts);
    });

    it('includes correct node and edge counts in chunk summaries', async () => {
      const response = await request(app)
        .post('/api/graph')
        .send({ manifests: ['service-a.json', 'service-b.json'] });

      expect(response.status).toBe(200);
      
      let totalNodes = 0;
      let totalEdges = 0;
      
      for (const part of response.body.parts) {
        totalNodes += part.nodes;
        totalEdges += part.edges;
      }

      expect(totalNodes).toBe(response.body.index.node_count);
      // Note: edges might be counted multiple times if they span chunks
    });
  });

  describe('Error handling', () => {
    it('returns 404 when a manifest in the list does not exist', async () => {
      const response = await request(app)
        .post('/api/graph')
        .send({ manifests: ['does-not-exist.json'] });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('returns 500 when graph generation fails unexpectedly', async () => {
      const response = await request(app)
        .post('/api/graph')
        .send({ manifests: [brokenManifestName] });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Graph generation failed');
    });

    it('filters out unsafe manifest names', async () => {
      const response = await request(app)
        .post('/api/graph')
        .send({ 
          manifests: ['../../../etc/passwd', 'service-a.json'] 
        });

      // Should only process safe manifests
      expect(response.status).toBe(200);
      expect(response.body.index.node_count).toBe(1);
    });
  });

  describe('Graph depth calculation', () => {
    it('calculates depth correctly for simple chains', async () => {
      const response = await request(app)
        .post('/api/graph')
        .send({ manifests: ['service-a.json', 'service-b.json'] });

      expect(response.status).toBe(200);
      expect(response.body.index.depth).toBeGreaterThanOrEqual(1);
      expect(response.body.index.depth).toBeLessThanOrEqual(6); // Capped at 6
    });
  });
});

describe('Viewer API - Integration', () => {
  let app;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    setupApiRoutes(app, FIXTURES_DIR);
  });

  it('validate and graph endpoints work together in a workflow', async () => {
    // First validate manifests
    const validateResponse = await request(app)
      .post('/api/validate')
      .send({ manifests: ['service-a.json', 'service-b.json'] });

    expect(validateResponse.status).toBe(200);
    expect(validateResponse.body.valid).toBe(true);

    // Then generate graph
    const graphResponse = await request(app)
      .post('/api/graph')
      .send({ manifests: ['service-a.json', 'service-b.json'] });

    expect(graphResponse.status).toBe(200);
    expect(graphResponse.body.index.node_count).toBe(2);

    // Finally retrieve chunk
    const chunkId = graphResponse.body.parts[0].id;
    const chunkResponse = await request(app)
      .get(`/api/graph/part/${chunkId}`);

    expect(chunkResponse.status).toBe(200);
    expect(chunkResponse.body.nodes).toHaveLength(2);
  });
});
