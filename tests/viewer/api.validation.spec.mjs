import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';

import { ProtocolViewerServer } from '../../packages/runtime/viewer/server.mjs';

describe('Viewer API validation branch coverage', () => {
  let workDir;
  let viewer;

  beforeAll(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'viewer-coverage-'));
    // Seed a simple manifest file to satisfy file system lookups
    const manifestPath = path.join(workDir, 'sample.json');
    await writeFile(
      manifestPath,
      JSON.stringify({
        protocol: { urn: 'urn:test:protocol:sample', kind: 'api', version: '1.0.0' },
      }),
      'utf8',
    );
    viewer = new ProtocolViewerServer(workDir, { enableCors: false });
  }, 15000);

  afterAll(async () => {
    if (viewer?.server) {
      await new Promise((resolve) => viewer.server.close(resolve));
    }
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('returns 400 when validation payload omits manifests field', async () => {
    const response = await request(viewer.app)
      .post('/api/validate')
      .set('Content-Type', 'application/json')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/manifests/);
  });

  it('returns 400 when all manifests are filtered out', async () => {
    const response = await request(viewer.app)
      .post('/api/validate')
      .set('Content-Type', 'application/json')
      .send({ manifests: ['   ', '\t'] });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('No valid manifests provided');
  });

  it('returns 400 when graph payload omits manifests field', async () => {
    const response = await request(viewer.app)
      .post('/api/graph')
      .set('Content-Type', 'application/json')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/manifests/);
  });
});
