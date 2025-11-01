import { describe, expect, test, jest } from '@jest/globals';

import { QdrantAdapter } from '../../../packages/runtime/vector-store/qdrant-adapter.mjs';

describe('QdrantAdapter', () => {
  test('initialize resolves collection via client', async () => {
    const ensureCollection = jest.fn().mockResolvedValue({});
    const adapter = new QdrantAdapter({
      client: { ensureCollection },
      logger: { warn: jest.fn() },
      vectorSize: 1536,
      distance: 'Dot',
      enableFallback: false
    });

    await adapter.initialize('custom_collection');

    expect(ensureCollection).toHaveBeenCalledWith('custom_collection', {
      vectorSize: 1536,
      distance: 'Dot'
    });
    expect(adapter.mode).toBe('qdrant');
  });

  test('initialize falls back to JSON store when client fails', async () => {
    const warn = jest.fn();
    const ensureCollection = jest.fn().mockRejectedValue(new Error('network failure'));
    const adapter = new QdrantAdapter({
      client: { ensureCollection },
      logger: { warn },
      fallbackDir: './tmp/qdrant-tests'
    });

    await adapter.initialize('fallback_collection');

    expect(adapter.mode).toBe('fallback');
    expect(warn).toHaveBeenCalled();
  });

  test('initialize without fallback propagates client error', async () => {
    const adapter = new QdrantAdapter({
      client: {
        ensureCollection: jest.fn().mockRejectedValue(new Error('forbidden'))
      },
      enableFallback: false
    });

    await expect(adapter.initialize('no-fallback')).rejects.toThrow('forbidden');
  });

  test('upsert delegates to client in qdrant mode', async () => {
    const ensureCollection = jest.fn().mockResolvedValue({});
    const upsert = jest.fn().mockResolvedValue({});
    const adapter = new QdrantAdapter({
      client: { ensureCollection, upsert },
      enableFallback: false
    });

    await adapter.initialize('vector_test');

    await adapter.upsert([
      {
        vector: [1, 0],
        payload: { tool_id: 'alpha', tags: ['one'] }
      }
    ]);

    expect(upsert).toHaveBeenCalledWith('vector_test', [
      {
        id: 'alpha',
        vector: [1, 0],
        payload: {
          tool_id: 'alpha',
          tags: ['one'],
          capabilities: []
        }
      }
    ]);
  });

  test('search maps client results into vector store format', async () => {
    const ensureCollection = jest.fn().mockResolvedValue({});
    const search = jest.fn().mockResolvedValue([
      {
        id: 'alpha',
        score: 0.9,
        payload: {
          tool_id: 'alpha',
          name: 'Alpha'
        },
        vector: [1, 0]
      }
    ]);
    const adapter = new QdrantAdapter({
      client: { ensureCollection, search },
      enableFallback: false
    });

    await adapter.initialize('vector_test');

    const results = await adapter.search([1, 0], { limit: 1, includeVectors: true });

    expect(search).toHaveBeenCalledWith('vector_test', {
      vector: [1, 0],
      limit: 1,
      withVectors: true,
      filter: undefined
    });
    expect(results).toHaveLength(1);
    expect(results[0].payload.tool_id).toBe('alpha');
    expect(results[0].score).toBe(0.9);
    expect(results[0].vector).toEqual([1, 0]);
  });

  test('delete delegates to client in qdrant mode', async () => {
    const ensureCollection = jest.fn().mockResolvedValue({});
    const deleteFn = jest.fn().mockResolvedValue({});
    const adapter = new QdrantAdapter({
      client: { ensureCollection, delete: deleteFn },
      enableFallback: false
    });

    await adapter.initialize('vector_test');
    await adapter.delete(['alpha', 'beta']);

    expect(deleteFn).toHaveBeenCalledWith('vector_test', ['alpha', 'beta']);
  });
});
