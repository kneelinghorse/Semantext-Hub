// Negative-path coverage for Authoring server (viewer-backed APIs).
// Exercises: schema validation failures, unresolved $ref, graph/docs error handling.
import { describe, expect, test } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';

import { createApp } from '../../app/ui/authoring/server.mjs';

describe('Authoring Server Negative Paths', () => {
  test('POST /api/validate without schema → 400', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/validate')
      .set('Content-Type', 'application/json')
      .send({})
      .expect(400);

    expect(response.body.error).toBe('schema_required');
  });

  test('POST /api/validate with network $ref → 500 with specific code', async () => {
    const app = createApp();
    const schema = {
      $id: 'net',
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $ref: 'https://example.com/remote-schema.json',
    };

    const response = await request(app)
      .post('/api/validate')
      .set('Content-Type', 'application/json')
      .send({ schema, manifest: { id: 'demo' } })
      .expect(500);

    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe('NETWORK_REF_DISALLOWED');
  });

  test('POST /api/validate resolves local $ref successfully', async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'authoring-validate-'));
    try {
      const baseSchema = {
        $id: 'http://schemas.example/base',
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        defs: {
          manifest: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string' } },
          },
        },
      };
      const schemaPath = path.join(workDir, 'schema.json');
      await writeFile(`${schemaPath}`, JSON.stringify(baseSchema), 'utf8');

      const schema = {
        $id: 'test-schema',
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $ref: './schema.json#/defs/manifest',
      };
      const app = createApp({ baseDir: workDir });

      const response = await request(app)
        .post('/api/validate')
        .set('Content-Type', 'application/json')
        .send({ schema, manifests: [{ id: 'ok' }, { id: 123 }] })
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.results).toHaveLength(2);
      expect(response.body.results[0].valid).toBe(true);
      expect(response.body.results[1].valid).toBe(false);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  test('POST /api/graph with invalid manifests payload → 500', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/graph')
      .set('Content-Type', 'application/json')
      .send({ manifests: 'not-an-array' })
      .expect(500);

    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe('preview_failed');
  });

  test('POST /api/graph returns edges for dependencies', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/graph')
      .set('Content-Type', 'application/json')
      .send({
        manifests: [
          { id: 'a', dependencies: ['b'] },
          { id: 'b', dependencies: [] },
        ],
      })
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.edges).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: 'a', target: 'b' })]),
    );
  });

  test('POST /api/docs with malformed manifests → 500', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/docs')
      .set('Content-Type', 'application/json')
      .send({ manifests: 'bad' })
      .expect(500);

    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe('preview_failed');
  });

  test('POST /api/docs summarizes manifests', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/docs')
      .set('Content-Type', 'application/json')
      .send({
        manifests: [
          { id: 'api', type: 'api', version: '1.0.0', description: 'Demo', dependencies: ['dep'] },
        ],
      })
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.sections[0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Dependencies', value: 1 }),
      ]),
    );
  });
});
