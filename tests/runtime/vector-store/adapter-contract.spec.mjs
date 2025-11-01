import { describe, expect, test, jest } from '@jest/globals';

import { LanceDBAdapter } from '../../../packages/runtime/registry-loader/lancedb-adapter.mjs';
import { QdrantAdapter } from '../../../packages/runtime/vector-store/qdrant-adapter.mjs';

const SAMPLE_RECORDS = [
  {
    vector: [1, 0],
    payload: {
      tool_id: 'alpha',
      name: 'Alpha Tool',
      capabilities: ['tool.execute']
    }
  },
  {
    vector: [0.9, 0.1],
    payload: {
      tool_id: 'beta',
      name: 'Beta Tool',
      capabilities: ['tool.observe']
    }
  },
  {
    vector: [0, 1],
    payload: {
      tool_id: 'gamma',
      name: 'Gamma Tool',
      capabilities: ['tool.analyse']
    }
  }
];

function runContractSuite(name, createAdapter) {
  describe(`IVectorStore contract :: ${name}`, () => {
    test('upsert stores vectors and search ranks by similarity', async () => {
      const adapter = createAdapter();
      await adapter.upsert(SAMPLE_RECORDS);

      const results = await adapter.search([1, 0], { limit: 2, includeVectors: true });

      expect(results).toHaveLength(2);
      expect(results[0].payload.tool_id).toBe('alpha');
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score ?? 0);
      expect(results[0].vector).toBeDefined();
    });

    test('delete removes stored entries', async () => {
      const adapter = createAdapter();
      await adapter.upsert(SAMPLE_RECORDS);

      await adapter.delete(['beta']);

      const results = await adapter.search([0.9, 0.1], { limit: 3 });
      const identifiers = results.map((entry) => entry.payload.tool_id);
      expect(identifiers).not.toContain('beta');
    });
  });
}

runContractSuite('LanceDBAdapter (fallback)', () => {
  const adapter = new LanceDBAdapter({ logger: { warn: jest.fn() } });
  adapter.mode = 'fallback';
  adapter._records = new Map();
  adapter._fallbackFile = null;
  adapter.initialized = true;
  return adapter;
});

runContractSuite('QdrantAdapter (fallback)', () => {
  const adapter = new QdrantAdapter({ logger: { warn: jest.fn() } });
  adapter.mode = 'fallback';
  adapter._records = new Map();
  adapter._fallbackFile = null;
  adapter._hasPendingWrites = false;
  adapter.initialized = true;
  return adapter;
});
