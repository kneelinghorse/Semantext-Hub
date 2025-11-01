import { describe, expect, test, jest } from '@jest/globals';

import { LanceDBAdapter } from '../../packages/runtime/registry-loader/lancedb-adapter.mjs';

describe('LanceDBAdapter search (fallback mode)', () => {
  test('ranks results using cosine similarity when running in fallback mode', async () => {
    const adapter = new LanceDBAdapter({ logger: { warn: jest.fn() } });
    adapter.mode = 'fallback';
    adapter._records = new Map([
      [
        'alpha',
        {
          payload: {
            tool_id: 'alpha',
            name: 'Alpha Tool',
            capabilities: ['tool.execute']
          },
          vector: [1, 0]
        }
      ],
      [
        'beta',
        {
          payload: {
            tool_id: 'beta',
            name: 'Beta Tool',
            capabilities: ['tool.observe']
          },
          vector: [0, 1]
        }
      ]
    ]);

    const results = await adapter.search([1, 0], { limit: 2 });

    expect(results).toHaveLength(2);
    expect(results[0].payload.tool_id).toBe('alpha');
    expect(results[0].score).toBeCloseTo(1, 5);
    expect(results[1].payload.tool_id).toBe('beta');
    expect(results[1].score).toBeCloseTo(0, 5);
  });
});
