import path from 'node:path';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import request from 'supertest';
import { createApp } from '../../app/ui/authoring/server.mjs';

function ensureDirSync(p) {
  fssync.mkdirSync(p, { recursive: true });
}

describe('Authoring UI server', () => {
  const tmpDir = path.resolve(process.cwd(), 'artifacts/ui/tmp');

  beforeAll(() => {
    ensureDirSync(tmpDir);
  });

  test('validates manifest using local $ref', async () => {
    const defsPath = path.join(tmpDir, 'defs.json');
    await fs.writeFile(defsPath, JSON.stringify({
      $id: 'defs.json',
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $defs: {
        name: { type: 'string', minLength: 1 }
      }
    }, null, 2));

    const schema = {
      $id: 'schema.json',
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        name: { $ref: './defs.json#/$defs/name' }
      },
      required: ['name']
    };

    const good = { name: 'ok' };
    const bad = { name: '' };

    const app = createApp({ baseDir: tmpDir });
    const r1 = await request(app).post('/api/validate').send({ schema, manifest: good, baseDir: tmpDir });
    expect(r1.status).toBe(200);
    expect(r1.body.ok).toBe(true);
    expect(r1.body.results[0].valid).toBe(true);

    const r2 = await request(app).post('/api/validate').send({ schema, manifest: bad, baseDir: tmpDir });
    expect(r2.status).toBe(200);
    expect(r2.body.ok).toBe(true);
    expect(r2.body.results[0].valid).toBe(false);
    expect(r2.body.results[0].errors.length).toBeGreaterThan(0);
  });

  test('viewer API endpoints return derived outputs', async () => {
    const manifest = { id: 'a', dependencies: ['b', 'c'], type: 'api' };
    const app = createApp();
    const g = await request(app).post('/api/graph').send({ manifest });
    expect(g.status).toBe(200);
    expect(g.body.ok).toBe(true);
    expect(g.body.nodes.length).toBeGreaterThan(0);
    expect(g.body.edges.length).toBe(2);

    const d = await request(app).post('/api/docs').send({ manifest });
    expect(d.status).toBe(200);
    expect(d.body.ok).toBe(true);
    expect(Array.isArray(d.body.sections)).toBe(true);
  });
});

