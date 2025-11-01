import { describe, expect, test, jest } from '@jest/globals';

import { IAMFilter } from '../../packages/runtime/services/tool-hub/iam-filter.js';

describe('IAMFilter', () => {
  test('allows results without capabilities and preserves metadata', async () => {
    const authorize = jest.fn();
    const filter = new IAMFilter({ authorize });

    const results = [
      { tool_id: 'urn:alpha', name: 'Alpha Tool', capabilities: [] },
      { tool_id: 'urn:beta', name: 'Beta Tool', capabilities: null }
    ];

    const filtered = await filter.filter(results, { id: 'agent://tester' });

    expect(filtered).toHaveLength(2);
    expect(filtered[0].iam.allowed).toBe(true);
    expect(filtered[1].iam.allowed).toBe(true);
    expect(authorize).not.toHaveBeenCalled();
  });

  test('filters results when IAM denies capability', async () => {
    const authorize = jest
      .fn()
      .mockImplementation((actor, capability) => {
        if (capability === 'tool.execute') {
          return Promise.resolve({ allowed: false, reason: 'not_granted' });
        }
        return Promise.resolve({ allowed: true });
      });

    const filter = new IAMFilter({
      authorize,
      logger: { warn: jest.fn(), debug: jest.fn() }
    });

    const results = [
      { tool_id: 'urn:alpha', capabilities: ['tool.execute'] },
      { tool_id: 'urn:beta', capabilities: ['tool.read'] }
    ];

    const filtered = await filter.filter(results, { id: 'agent://tester' });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].tool_id).toBe('urn:beta');
    expect(filtered[0].iam.allowed).toBe(true);
    expect(authorize).toHaveBeenCalledWith('agent://tester', 'tool.execute', 'urn:alpha');
  });

  test('merges provided actor capabilities without calling IAM', async () => {
    const authorize = jest.fn();
    const filter = new IAMFilter({ authorize });

    const results = [
      { tool_id: 'urn:alpha', capabilities: ['tool.execute'] }
    ];

    const filtered = await filter.filter(results, {
      id: 'agent://tester',
      capabilities: ['tool.execute']
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].iam.allowed).toBe(true);
    expect(authorize).not.toHaveBeenCalled();
  });
});
