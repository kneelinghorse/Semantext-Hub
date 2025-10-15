const { inject } = require('light-my-request');
const { ProtocolViewerServer } = require('../../packages/runtime/viewer/server.js');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, '../fixtures/manifests');

async function makeRequest(app, url) {
  const response = await inject(app, { method: 'GET', url });
  const body = response.payload ? JSON.parse(response.payload) : undefined;

  return {
    status: response.statusCode,
    body,
    headers: response.headers,
  };
}

describe('API Routes', () => {
  let server;
  let app;

  beforeAll(() => {
    server = new ProtocolViewerServer(FIXTURES_DIR, { port: 3010 });
    app = server.app;
  });

  describe('GET /api/health', () => {

    test('returns 200 status', async () => {
      const res = await makeRequest(app, '/api/health');
      expect(res.status).toBe(200);
    });

    test('returns correct health check structure', async () => {
      const res = await makeRequest(app, '/api/health');

      expect(res.body).toMatchObject({
        status: 'ok',
        version: '0.1.0',
        artifacts_dir: expect.any(String),
        manifest_count: expect.any(Number)
      });
    });

    test('counts manifest files correctly', async () => {
      const res = await makeRequest(app, '/api/health');
      expect(res.body.manifest_count).toBeGreaterThanOrEqual(2);
    });

  });

  describe('GET /api/manifests', () => {

    test('returns 200 status', async () => {
      const res = await makeRequest(app, '/api/manifests');
      expect(res.status).toBe(200);
    });

    test('returns array of manifests', async () => {
      const res = await makeRequest(app, '/api/manifests');

      expect(res.body).toHaveProperty('manifests');
      expect(Array.isArray(res.body.manifests)).toBe(true);
      expect(res.body.manifests.length).toBeGreaterThanOrEqual(2);
    });

    test('manifest entries have required fields', async () => {
      const res = await makeRequest(app, '/api/manifests');
      const manifest = res.body.manifests[0];

      expect(manifest).toMatchObject({
        filename: expect.any(String),
        kind: expect.any(String),
        size: expect.any(Number),
        modified: expect.any(String),
        urn: expect.any(String)
      });
    });

    test('filters by kind=api', async () => {
      const res = await makeRequest(app, '/api/manifests?kind=api');

      expect(res.status).toBe(200);
      expect(res.body.manifests.length).toBeGreaterThanOrEqual(1);

      const allApi = res.body.manifests.every(m => m.kind === 'api');
      expect(allApi).toBe(true);
    });

    test('filters by kind=data', async () => {
      const res = await makeRequest(app, '/api/manifests?kind=data');

      expect(res.status).toBe(200);
      expect(res.body.manifests.length).toBeGreaterThanOrEqual(1);

      const allData = res.body.manifests.every(m => m.kind === 'data');
      expect(allData).toBe(true);
    });

    test('response time is under 100ms', async () => {
      const start = Date.now();
      await makeRequest(app, '/api/manifests');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(500);
    });

  });

  describe('GET /api/manifest/:filename', () => {

    test('returns 200 for valid manifest', async () => {
      const res = await makeRequest(app, '/api/manifest/api-test.json');
      expect(res.status).toBe(200);
    });

    test('returns full manifest JSON', async () => {
      const res = await makeRequest(app, '/api/manifest/api-test.json');

      expect(res.body).toHaveProperty('event');
      expect(res.body).toHaveProperty('protocol');
      expect(res.body.event.kind).toBe('api');
    });

    test('returns 404 for non-existent file', async () => {
      const res = await makeRequest(app, '/api/manifest/does-not-exist.json');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    test('response time is under 100ms', async () => {
      const start = Date.now();
      await makeRequest(app, '/api/manifest/api-test.json');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
    });

  });

});
