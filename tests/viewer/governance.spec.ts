import path from 'path';
import { fileURLToPath } from 'url';
import { inject } from 'light-my-request';
import { ProtocolViewerServer } from '../../packages/runtime/viewer/server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../fixtures/manifests');

describe('Viewer governance API', () => {
  let app;

  beforeAll(() => {
    const server = new ProtocolViewerServer(FIXTURES_DIR, { port: 0 });
    app = server.app;
  });

  it('returns governance summary derived from manifests', async () => {
    const response = await inject(app, { method: 'GET', url: '/api/governance' });

    expect(response.statusCode).toBe(200);

    const payload = JSON.parse(response.payload);
    expect(Array.isArray(payload.manifests)).toBe(true);
    expect(payload.summary.total).toBeGreaterThan(0);
    expect(payload.summary.byKind).toBeDefined();
    expect(payload.artifacts.scanned).toBeGreaterThan(0);
  });

  it('includes manifest governance fields in each entry', async () => {
    const response = await inject(app, { method: 'GET', url: '/api/governance' });
    const payload = JSON.parse(response.payload);
    const manifest = payload.manifests[0];

    expect(manifest).toMatchObject({
      urn: expect.any(String),
      name: expect.any(String),
      kind: expect.any(String),
      classification: expect.any(String),
      status: expect.any(String),
      tags: expect.any(Array),
      path: expect.any(String),
    });
  });
});
