/**
 * URN Resolver Tests
 * 
 * Comprehensive test suite for the URN resolver including:
 * - URN resolution
 * - Capability discovery
 * - Caching behavior
 * - Error handling
 * - Retry logic
 * - URN format validation
 */

import { jest } from '@jest/globals';
import { URNResolver, createURNResolver, resolveAgentUrn, discoverCapabilities } from '../../packages/runtime/runtime/urn-resolver.js';
import { 
  URNError, 
  URNResolutionError, 
  URNFormatError 
} from '../../packages/runtime/runtime/urn-types.js';

describe('URN Resolver', () => {
  let resolver;

  beforeEach(() => {
    resolver = new URNResolver({
      enableLogging: false, // Disable logging for tests
      cacheTtl: 1000, // Short TTL for testing
      maxRetries: 2 // Fewer retries for testing
    });
  });

  describe('resolveAgentUrn', () => {
    test('should resolve valid URN', async () => {
      const urn = 'urn:agent:ai:ml-agent@1.0.0';
      
      const result = await resolver.resolveAgentUrn(urn);
      
      expect(result).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.urn).toBe(urn);
      expect(result.metadata.name).toBe('ml-agent');
      expect(result.metadata.version).toBe('1.0.0');
      expect(result.capabilities).toBeDefined();
      expect(result.cached).toBe(false);
      expect(result.resolvedAt).toBeDefined();
    });

    test('should resolve URN without version', async () => {
      const urn = 'urn:agent:data:etl-agent';
      
      const result = await resolver.resolveAgentUrn(urn);
      
      expect(result).toBeDefined();
      expect(result.metadata.urn).toBe(urn);
      expect(result.metadata.name).toBe('etl-agent');
      expect(result.metadata.version).toBe('latest');
    });

    test('should use cached result when available', async () => {
      const urn = 'urn:agent:test:cached-agent@1.0.0';
      
      // First resolution
      const result1 = await resolver.resolveAgentUrn(urn);
      expect(result1.cached).toBe(false);
      
      // Second resolution should be cached
      const result2 = await resolver.resolveAgentUrn(urn);
      expect(result2.cached).toBe(true);
      expect(result2.metadata.urn).toBe(result1.metadata.urn);
    });

    test('should bypass cache when disabled', async () => {
      const urn = 'urn:agent:test:no-cache-agent@1.0.0';
      
      // First resolution
      const result1 = await resolver.resolveAgentUrn(urn, { useCache: false });
      expect(result1.cached).toBe(false);
      
      // Second resolution with cache disabled
      const result2 = await resolver.resolveAgentUrn(urn, { useCache: false });
      expect(result2.cached).toBe(false);
    });

    test('should throw error for invalid URN format', async () => {
      const invalidUrn = 'invalid-urn-format';
      
      await expect(resolver.resolveAgentUrn(invalidUrn)).rejects.toThrow(URNFormatError);
      await expect(resolver.resolveAgentUrn(invalidUrn)).rejects.toThrow('Invalid URN format');
    });

    test('should throw error for null URN', async () => {
      await expect(resolver.resolveAgentUrn(null)).rejects.toThrow(URNFormatError);
      await expect(resolver.resolveAgentUrn(null)).rejects.toThrow('URN must be a non-empty string');
    });

    test('should throw error for empty URN', async () => {
      await expect(resolver.resolveAgentUrn('')).rejects.toThrow(URNFormatError);
      await expect(resolver.resolveAgentUrn('')).rejects.toThrow('URN must be a non-empty string');
    });

    test('should throw error for non-string URN', async () => {
      await expect(resolver.resolveAgentUrn(123)).rejects.toThrow(URNFormatError);
      await expect(resolver.resolveAgentUrn(123)).rejects.toThrow('URN must be a non-empty string');
    });

    test('should retry on resolution failure', async () => {
      const urn = 'urn:agent:test:retry-agent@1.0.0';
      
      // Mock resolution to fail first, then succeed
      let attemptCount = 0;
      const originalResolveSingleUrn = resolver._resolveSingleUrn;
      resolver._resolveSingleUrn = jest.fn().mockImplementation(async (urn) => {
        attemptCount++;
        if (attemptCount <= 1) {
          throw new Error('Network error');
        }
        return originalResolveSingleUrn.call(resolver, urn);
      });

      const result = await resolver.resolveAgentUrn(urn);
      
      expect(result).toBeDefined();
      expect(attemptCount).toBe(2);
    });

    test('should exhaust retries and throw error', async () => {
      const urn = 'urn:agent:test:failing-agent@1.0.0';
      
      // Mock resolution to always fail
      resolver._resolveSingleUrn = jest.fn().mockRejectedValue(new Error('Persistent error'));

      await expect(resolver.resolveAgentUrn(urn)).rejects.toThrow(URNResolutionError);
      await expect(resolver.resolveAgentUrn(urn)).rejects.toThrow('Failed to resolve URN');
    });

    test('should not retry format errors', async () => {
      const invalidUrn = 'invalid-urn';
      
      // Mock format validation to throw error
      resolver._validateUrnFormat = jest.fn().mockImplementation(() => {
        throw new URNFormatError('Invalid format');
      });

      await expect(resolver.resolveAgentUrn(invalidUrn)).rejects.toThrow(URNFormatError);
      expect(resolver._validateUrnFormat).toHaveBeenCalledTimes(1);
    });
  });

  describe('discoverCapabilities', () => {
    test('should discover agents by domain', async () => {
      const domain = 'ai';
      
      const agents = await resolver.discoverCapabilities(domain);
      
      expect(agents).toBeDefined();
      expect(Array.isArray(agents)).toBe(true);
      expect(agents.length).toBeGreaterThan(0);
      
      const agent = agents[0];
      expect(agent.urn).toMatch(new RegExp(`^urn:agent:${domain}:`));
      expect(agent.name).toBeDefined();
      expect(agent.version).toBeDefined();
      expect(agent.description).toBeDefined();
      expect(agent.capabilities).toBeDefined();
    });

    test('should return domain-specific capabilities', async () => {
      const aiAgents = await resolver.discoverCapabilities('ai');
      const dataAgents = await resolver.discoverCapabilities('data');
      
      expect(aiAgents).toBeDefined();
      expect(dataAgents).toBeDefined();
      
      // AI agents should have ML capabilities
      const aiAgent = aiAgents[0];
      expect(aiAgent.capabilities).toHaveProperty('ml-inference');
      
      // Data agents should have ETL capabilities
      const dataAgent = dataAgents[0];
      expect(dataAgent.capabilities).toHaveProperty('etl');
    });

    test('should handle discovery errors', async () => {
      // Mock discovery to fail
      resolver._discoverAgentsByDomain = jest.fn().mockRejectedValue(new Error('Discovery failed'));

      await expect(resolver.discoverCapabilities('test')).rejects.toThrow(URNResolutionError);
      await expect(resolver.discoverCapabilities('test')).rejects.toThrow('Failed to discover capabilities');
    });
  });

  describe('Cache Management', () => {
    test('should clear cache for specific URN', async () => {
      const urn = 'urn:agent:test:cache-test@1.0.0';
      
      // Resolve and cache
      await resolver.resolveAgentUrn(urn);
      expect(resolver.cache.has(urn)).toBe(true);
      
      // Clear cache
      resolver.clearCache(urn);
      expect(resolver.cache.has(urn)).toBe(false);
    });

    test('should clear all cache', async () => {
      const urn1 = 'urn:agent:test:cache-test-1@1.0.0';
      const urn2 = 'urn:agent:test:cache-test-2@1.0.0';
      
      // Resolve and cache both
      await resolver.resolveAgentUrn(urn1);
      await resolver.resolveAgentUrn(urn2);
      expect(resolver.cache.size).toBe(2);
      
      // Clear all cache
      resolver.clearCache();
      expect(resolver.cache.size).toBe(0);
    });

    test('should expire cache entries', async () => {
      const resolverWithShortTtl = new URNResolver({
        enableLogging: false,
        cacheTtl: 100 // Very short TTL
      });

      const urn = 'urn:agent:test:expiry-test@1.0.0';
      
      // Resolve and cache
      await resolverWithShortTtl.resolveAgentUrn(urn);
      expect(resolverWithShortTtl.cache.has(urn)).toBe(true);
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Next resolution should not use cache
      const result = await resolverWithShortTtl.resolveAgentUrn(urn);
      expect(result.cached).toBe(false);
    });

    test('should return cache statistics', async () => {
      const urn1 = 'urn:agent:test:stats-test-1@1.0.0';
      const urn2 = 'urn:agent:test:stats-test-2@1.0.0';
      
      // Resolve both URNs
      await resolver.resolveAgentUrn(urn1);
      await resolver.resolveAgentUrn(urn2);
      
      const stats = resolver.getCacheStats();
      
      expect(stats.size).toBe(2);
      expect(stats.entries).toContain(urn1);
      expect(stats.entries).toContain(urn2);
      expect(stats.oldestEntry).toBeDefined();
      expect(stats.newestEntry).toBeDefined();
    });
  });

  describe('Convenience Functions', () => {
    test('createURNResolver should create resolver instance', () => {
      const resolver = createURNResolver();
      expect(resolver).toBeInstanceOf(URNResolver);
    });

    test('resolveAgentUrn should resolve URN', async () => {
      const urn = 'urn:agent:test:convenience@1.0.0';
      
      const result = await resolveAgentUrn(urn);
      
      expect(result).toBeDefined();
      expect(result.metadata.urn).toBe(urn);
    });

    test('discoverCapabilities should discover agents', async () => {
      const domain = 'test';
      
      const agents = await discoverCapabilities(domain);
      
      expect(agents).toBeDefined();
      expect(Array.isArray(agents)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should wrap non-URN errors', async () => {
      const urn = 'urn:agent:test:error-test@1.0.0';
      
      // Mock resolution to throw non-URN error
      resolver._resolveSingleUrn = jest.fn().mockRejectedValue(new Error('Unexpected error'));

      await expect(resolver.resolveAgentUrn(urn)).rejects.toThrow(URNResolutionError);
      await expect(resolver.resolveAgentUrn(urn)).rejects.toThrow('Failed to resolve URN');
    });

    test('should preserve URN in error context', async () => {
      const urn = 'urn:agent:test:error-context@1.0.0';
      
      // Mock resolution to fail
      resolver._resolveSingleUrn = jest.fn().mockRejectedValue(new Error('Resolution failed'));

      try {
        await resolver.resolveAgentUrn(urn);
      } catch (error) {
        expect(error).toBeInstanceOf(URNResolutionError);
        expect(error.urn).toBe(urn);
      }
    });
  });

  describe('Mock Data Generation', () => {
    test('should generate appropriate capabilities for AI domain', () => {
      const capabilities = resolver._generateMockCapabilities('ai');
      
      expect(capabilities).toHaveProperty('ml-inference');
      expect(capabilities).toHaveProperty('data-processing');
      expect(capabilities).toHaveProperty('api-client');
      expect(capabilities['ml-inference'].type).toBe('service');
    });

    test('should generate appropriate capabilities for data domain', () => {
      const capabilities = resolver._generateMockCapabilities('data');
      
      expect(capabilities).toHaveProperty('etl');
      expect(capabilities).toHaveProperty('data-processing');
      expect(capabilities).toHaveProperty('api-client');
      expect(capabilities['etl'].type).toBe('service');
    });

    test('should generate base capabilities for other domains', () => {
      const capabilities = resolver._generateMockCapabilities('other');
      
      expect(capabilities).toHaveProperty('data-processing');
      expect(capabilities).toHaveProperty('api-client');
      expect(capabilities).not.toHaveProperty('ml-inference');
      expect(capabilities).not.toHaveProperty('etl');
    });
  });
});
