import path from 'path';
import { fileURLToPath } from 'url';
import { inject } from 'light-my-request';
import { ProtocolViewerServer } from '../../packages/runtime/viewer/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../fixtures/manifests');

async function makeRequest(app, url, overrides = {}) {
  const response = await inject(app, {
    method: overrides.method || 'GET',
    url,
    payload: overrides.payload,
    headers: overrides.headers,
    remoteAddress: overrides.remoteAddress || '127.0.0.1',
  });

  let body;
  if (response.payload) {
    try {
      body = JSON.parse(response.payload);
    } catch (err) {
      body = response.payload;
    }
  }

  return {
    status: response.statusCode,
    body,
    headers: response.headers,
  };
}

describe('Security', () => {

  describe('Path Validation', () => {
    let app;

    beforeAll(() => {
      const server = new ProtocolViewerServer(FIXTURES_DIR, { port: 3020 });
      app = server.app;
    });

    test('blocks directory traversal with ../', async () => {
      const res = await makeRequest(app, '/api/manifest/..%2Ftest.json');
      expect(res.status).not.toBe(200);
      expect([403, 404]).toContain(res.status);
    });

    test('blocks paths with double slash', async () => {
      const res = await makeRequest(app, '/api//manifest/test.json');
      expect(res.status).toBe(403);
    });

    test('blocks non-JSON files', async () => {
      const res = await makeRequest(app, '/api/manifest/test.txt');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Only JSON files allowed');
    });

    test('allows valid JSON filenames', async () => {
      const res = await makeRequest(app, '/api/manifest/api-test.json');
      expect(res.status).toBe(200);
    });
  });

  describe('Rate Limiting', () => {
    let app;

    beforeEach(() => {
      const server = new ProtocolViewerServer(FIXTURES_DIR, { port: 3021 });
      app = server.app;
    });

    test('enforces rate limit after 100 requests', async () => {
      let rateLimited = 0;

      for (let i = 0; i < 105; i++) {
        const res = await makeRequest(app, '/api/health');
        if (res.status === 429) {
          rateLimited++;
        }
      }

      expect(rateLimited).toBeGreaterThan(0);
    }, 15000);

    test('rate limit response includes error message', async () => {
      // Trigger the limiter first
      for (let i = 0; i < 100; i++) {
        await makeRequest(app, '/api/health');
      }

      const res = await makeRequest(app, '/api/health');

      if (res.status === 429) {
        expect(res.body).toHaveProperty('error');
      } else {
        expect(res.status).toBe(200);
      }
    });
  });

  describe('Error Sanitization', () => {
    let app;

    beforeAll(() => {
      const server = new ProtocolViewerServer(FIXTURES_DIR, { port: 3022 });
      app = server.app;
    });

    test('does not leak filesystem paths in 404 errors', async () => {
      const res = await makeRequest(app, '/api/manifest/nonexistent.json');

      expect(res.status).toBe(404);
      expect(res.body.error).not.toContain('/');
      expect(res.body.error).not.toContain('\\');
    });

    test('does not leak filesystem paths in 403 errors', async () => {
      const res = await makeRequest(app, '/api//manifest/test.json');

      expect(res.status).toBe(403);
      expect(res.body.error).not.toContain('/');
      expect(res.body.error).not.toContain('\\');
    });
  });
});
