import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtemp, rm, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { RegistryLoader } from '../../packages/runtime/registry-loader/index.mjs';
import { openDb } from '../../packages/runtime/registry/db.mjs';

class StubEmbeddingService {
  constructor() {
    this.mode = 'stub';
  }

  async initialize() {}

  async embedDocuments(documents) {
    return documents.map((doc, index) => [index + 1, doc.length]);
  }
}

class StubVectorStore {
  constructor() {
    this.mode = 'stub';
    this.records = [];
  }

  async initialize() {}

  async upsert(records) {
    this.records.push(...records);
  }

  async close() {}
}

describe('RegistryLoader', () => {
  let tempRoot;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'registry-loader-'));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  test('persists manifests and vectors', async () => {
    const protocolsDir = join(tempRoot, 'protocols');
    await mkdir(protocolsDir, { recursive: true });

    await writeFile(
      join(protocolsDir, 'alpha.json'),
      JSON.stringify({
        urn: 'urn:example:alpha',
        name: 'Alpha Protocol',
        summary: 'Alpha summary',
        tags: ['alpha', 'primary']
      }),
      'utf8'
    );

    await writeFile(
      join(protocolsDir, 'beta.json'),
      JSON.stringify({
        manifest: {
          urn: 'urn:example:beta',
          name: 'Beta Protocol',
          summary: 'Beta summary',
          tags: ['beta']
        }
      }),
      'utf8'
    );

    const vectorStore = new StubVectorStore();
    const embeddingService = new StubEmbeddingService();

    const loader = new RegistryLoader({
      workspace: tempRoot,
      directory: 'protocols',
      dbPath: join(tempRoot, 'registry.sqlite'),
      embeddingService,
      vectorStore,
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }
    });

    const result = await loader.load();

    expect(result.manifestsProcessed).toBe(2);
    expect(vectorStore.records).toHaveLength(2);
    expect(vectorStore.records[0].payload.tool_id).toBe('urn:example:alpha');

    const db = await openDb({ dbPath: join(tempRoot, 'registry.sqlite') });
    const row = await db.get('SELECT COUNT(*) as count FROM manifests');
    await db.close();

    expect(row.count).toBe(2);
  });

  test('supports dry-run without persistence', async () => {
    const protocolsDir = join(tempRoot, 'protocols');
    await mkdir(protocolsDir, { recursive: true });

    await writeFile(
      join(protocolsDir, 'gamma.json'),
      JSON.stringify({
        urn: 'urn:example:gamma',
        name: 'Gamma Protocol'
      }),
      'utf8'
    );

    const loader = new RegistryLoader({
      workspace: tempRoot,
      directory: 'protocols',
      dbPath: join(tempRoot, 'registry.sqlite'),
      embeddingService: new StubEmbeddingService(),
      vectorStore: new StubVectorStore(),
      dryRun: true,
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }
    });

    const result = await loader.load();

    expect(result.dryRun).toBe(true);
    expect(result.manifestsProcessed).toBe(1);

    const dbExists = await access(join(tempRoot, 'registry.sqlite'))
      .then(() => true)
      .catch(() => false);

    expect(dbExists).toBe(false);
  });
});
