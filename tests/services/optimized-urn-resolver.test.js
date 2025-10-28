import { OptimizedURNResolver } from '../../packages/runtime/services/mcp-server/performance-optimizations.js';

describe('OptimizedURNResolver', () => {
  test('resolveAgentUrn returns capabilities and endpoints populated', async () => {
    const resolver = new OptimizedURNResolver({ enableLogging: false, maxCacheSize: 10, memoryMonitorInterval: 0 });
    const urn = 'urn:agent:ai:ml-agent@1.0.0';

    const result = await resolver.resolveAgentUrn(urn, { useCache: false });

    expect(result).toBeDefined();
    expect(result.metadata).toBeDefined();
    expect(result.metadata.urn).toBe(urn);
    expect(result.metadata.endpoints).toBeDefined();
    expect(result.capabilities).toBeDefined();
    expect(Object.keys(result.capabilities).length).toBeGreaterThan(0);
  });

  test('cached resolution preserves capability payloads', async () => {
    const resolver = new OptimizedURNResolver({ enableLogging: false, maxCacheSize: 10, memoryMonitorInterval: 0 });
    const urn = 'urn:agent:data:etl-agent@1.0.0';

    const first = await resolver.resolveAgentUrn(urn);
    expect(first.cached).toBe(false);
    expect(first.capabilities).toBeDefined();
    expect(Object.keys(first.capabilities).length).toBeGreaterThan(0);

    const second = await resolver.resolveAgentUrn(urn);
    expect(second.cached).toBe(true);
    expect(Object.keys(second.capabilities).length).toBeGreaterThan(0);
    expect(Object.keys(second.capabilities)).toEqual(Object.keys(first.capabilities));
  });
});
