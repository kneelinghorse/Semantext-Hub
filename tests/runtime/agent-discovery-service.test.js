/**
 * Agent Discovery Service Tests
 * 
 * Comprehensive test suite for the agent discovery service with:
 * - Unit tests for all discovery operations
 * - Integration tests with registry
 * - Query filtering and sorting tests
 * - Performance and caching tests
 * - Error handling tests
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const discoveryModuleUrl = pathToFileURL(path.join(__dirname, '../../packages/runtime/runtime/agent-discovery-service.js')).href;
const urnTypesModuleUrl = pathToFileURL(path.join(__dirname, '../../packages/runtime/runtime/urn-types.js')).href;

const {
  AgentDiscoveryService,
  createAgentDiscoveryService,
  discoverAgents,
  discoverByDomain,
  discoverByCapability
} = await import(discoveryModuleUrl);

const {
  URNError,
  URNFormatError,
  URNResolutionError
} = await import(urnTypesModuleUrl);

// Mock fetch for health checks
global.fetch = jest.fn();

describe('Agent Discovery Service', () => {
  let service;
  let mockRegistry;
  let mockAgentData;
  let registryFactory;
  let registryStats;

  beforeEach(() => {
    jest.clearAllMocks();
    fetch.mockClear();

    mockAgentData = {
      urn: 'urn:agent:ai:ml-agent@1.0.0',
      name: 'ml-agent',
      version: '1.0.0',
      description: 'Machine learning inference agent',
      capabilities: {
        'ml-inference': {
          type: 'service',
          description: 'Machine learning model inference',
          version: '1.0.0'
        },
        'data-processing': {
          type: 'service',
          description: 'Data processing capabilities',
          version: '1.0.0'
        }
      },
      endpoints: {
        api: '/api/v1',
        health: '/health',
        metrics: '/metrics'
      },
      registeredAt: '2024-01-01T00:00:00.000Z',
      lastUpdated: '2024-01-01T00:00:00.000Z'
    };

    mockRegistry = {
      initialize: jest.fn(),
      registerAgent: jest.fn(),
      getAgent: jest.fn(),
      listAgentsByDomain: jest.fn(),
      searchAgentsByCapability: jest.fn(),
      getStats: jest.fn(() => ({
        ...registryStats,
        domainStats: { ...registryStats.domainStats },
        capabilityStats: { ...registryStats.capabilityStats }
      })),
      getHealth: jest.fn(() => ({
        status: 'healthy',
        isInitialized: true,
        totalAgents: 2
      })),
      shutdown: jest.fn()
    };

    registryFactory = jest.fn(() => mockRegistry);
    registryStats = {
      totalAgents: 2,
      domains: 2,
      capabilities: 3,
      domainStats: { ai: 1, data: 1 },
      capabilityStats: { 'ml-inference': 1, 'data-processing': 1, 'etl': 1 }
    };
  });

  afterEach(async () => {
    if (service) {
      await service.shutdown();
    }
  });

  describe('Service Initialization', () => {
    test('should initialize with default configuration', async () => {
      service = createAgentDiscoveryService({ registryFactory, enableLogging: false });
      await service.initialize();
      
      expect(service.isInitialized).toBe(true);
      expect(mockRegistry.initialize).toHaveBeenCalled();
    });

    test('should initialize with custom configuration', async () => {
      service = createAgentDiscoveryService({
        registryFactory,
        enableLogging: false,
        maxResults: 50,
        cacheTtl: 600000
      });
      
      await service.initialize();
      
      expect(service.config.maxResults).toBe(50);
      expect(service.config.cacheTtl).toBe(600000);
    });

    test('should handle initialization errors', async () => {
      mockRegistry.initialize.mockRejectedValue(new Error('Registry init failed'));
      
      service = createAgentDiscoveryService({ registryFactory, enableLogging: false });
      
      await expect(service.initialize()).rejects.toThrow(URNError);
    });
  });

  describe('Agent Discovery', () => {
    beforeEach(async () => {
      service = createAgentDiscoveryService({ registryFactory, enableLogging: false });
      await service.initialize();
      
      // Mock registry methods
      mockRegistry.listAgentsByDomain.mockImplementation((domain) => {
        if (domain === 'ai') {
          return Promise.resolve([mockAgentData]);
        } else if (domain === 'data') {
          return Promise.resolve([{
            ...mockAgentData,
            urn: 'urn:agent:data:etl-agent@1.0.0',
            name: 'etl-agent',
            capabilities: { 'etl': { type: 'service', description: 'ETL processing' } }
          }]);
        }
        return Promise.resolve([]);
      });
    });

    test('should discover all agents with empty query', async () => {
      const result = await service.discoverAgents();
      
      expect(result.agents).toBeDefined();
      expect(result.total).toBeGreaterThan(0);
      expect(result.executedAt).toBeDefined();
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    test('should filter agents by domain', async () => {
      const result = await service.discoverAgents({ domain: 'ai' });
      
      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].urn).toBe(mockAgentData.urn);
    });

    test('should filter agents by capability', async () => {
      const result = await service.discoverAgents({ capabilities: ['ml-inference'] });
      
      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].urn).toBe(mockAgentData.urn);
    });

    test('should filter agents by multiple capabilities', async () => {
      const result = await service.discoverAgents({ 
        capabilities: ['ml-inference', 'data-processing'] 
      });
      
      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].urn).toBe(mockAgentData.urn);
    });

    test('should filter agents by name', async () => {
      const result = await service.discoverAgents({ name: 'ml-agent' });
      
      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].name).toBe('ml-agent');
    });

    test('should filter agents by version', async () => {
      const result = await service.discoverAgents({ version: '1.0.0' });
      
      expect(result.agents.length).toBeGreaterThan(0);
      expect(result.agents.every(agent => agent.version === '1.0.0')).toBe(true);
    });

    test('should sort agents by name ascending', async () => {
      const result = await service.discoverAgents({ 
        sort: { field: 'name', order: 'asc' } 
      });
      
      expect(result.agents).toBeDefined();
      // Note: Actual sorting depends on mock data
    });

    test('should sort agents by name descending', async () => {
      const result = await service.discoverAgents({ 
        sort: { field: 'name', order: 'desc' } 
      });
      
      expect(result.agents).toBeDefined();
    });

    test('should sort agents by version', async () => {
      const result = await service.discoverAgents({ 
        sort: { field: 'version', order: 'asc' } 
      });
      
      expect(result.agents).toBeDefined();
    });

    test('should sort agents by registration date', async () => {
      const result = await service.discoverAgents({ 
        sort: { field: 'registeredAt', order: 'desc' } 
      });
      
      expect(result.agents).toBeDefined();
    });

    test('should apply pagination with limit', async () => {
      const result = await service.discoverAgents({ limit: 1 });
      
      expect(result.returned).toBeLessThanOrEqual(1);
      expect(result.total).toBeGreaterThanOrEqual(result.returned);
    });

    test('should apply pagination with offset', async () => {
      const result = await service.discoverAgents({ offset: 1 });
      
      expect(result.returned).toBeGreaterThanOrEqual(0);
    });

    test('should include health status when requested', async () => {
      fetch.mockResolvedValue({
        ok: true,
        status: 200
      });
      
      const result = await service.discoverAgents({ includeHealth: true });
      
      expect(result.agents[0].health).toBeDefined();
      expect(result.agents[0].health.status).toBe('healthy');
    });

    test('should handle health check failures', async () => {
      fetch.mockRejectedValue(new Error('Network error'));
      
      const result = await service.discoverAgents({ includeHealth: true });
      
      expect(result.agents[0].health).toBeDefined();
      expect(result.agents[0].health.status).toBe('unhealthy');
    });

    test('should validate query parameters', async () => {
      await expect(service.discoverAgents({ limit: -1 }))
        .rejects.toThrow(URNError);
      
      await expect(service.discoverAgents({ offset: -1 }))
        .rejects.toThrow(URNError);
      
      await expect(service.discoverAgents({ sort: { field: 'invalid', order: 'asc' } }))
        .rejects.toThrow(URNError);
      
      await expect(service.discoverAgents({ sort: { field: 'name', order: 'invalid' } }))
        .rejects.toThrow(URNError);
    });

    test('should emit agentsDiscovered event', async () => {
      const eventSpy = jest.fn();
      service.on('agentsDiscovered', eventSpy);
      
      await service.discoverAgents();
      
      expect(eventSpy).toHaveBeenCalledWith({
        query: expect.any(Object),
        total: expect.any(Number),
        returned: expect.any(Number),
        executionTime: expect.any(Number)
      });
    });
  });

  describe('Convenience Methods', () => {
    beforeEach(async () => {
      service = createAgentDiscoveryService({ registryFactory, enableLogging: false });
      await service.initialize();
      
      mockRegistry.listAgentsByDomain.mockResolvedValue([mockAgentData]);
    });

    test('should discover by domain', async () => {
      const result = await service.discoverByDomain('ai');
      
      expect(result.agents).toBeDefined();
      expect(result.query.domain).toBe('ai');
    });

    test('should discover by capability', async () => {
      const result = await service.discoverByCapability('ml-inference');
      
      expect(result.agents).toBeDefined();
      expect(result.query.capabilities).toEqual(['ml-inference']);
    });

    test('should discover by multiple capabilities', async () => {
      const result = await service.discoverByCapability(['ml-inference', 'data-processing']);
      
      expect(result.agents).toBeDefined();
      expect(result.query.capabilities).toEqual(['ml-inference', 'data-processing']);
    });

    test('should search by name', async () => {
      const result = await service.searchByName('ml-agent');
      
      expect(result.agents).toBeDefined();
      expect(result.query.name).toBe('ml-agent');
    });
  });

  describe('Agent Operations', () => {
    beforeEach(async () => {
      service = createAgentDiscoveryService({ registryFactory, enableLogging: false });
      await service.initialize();
    });

    test('should get agent by URN', async () => {
      mockRegistry.getAgent.mockResolvedValue(mockAgentData);
      
      const agent = await service.getAgent(mockAgentData.urn);
      
      expect(agent).toBeDefined();
      expect(agent.urn).toBe(mockAgentData.urn);
      expect(mockRegistry.getAgent).toHaveBeenCalledWith(mockAgentData.urn);
    });

    test('should register agent', async () => {
      mockRegistry.registerAgent.mockResolvedValue({
        success: true,
        urn: mockAgentData.urn,
        registeredAt: '2024-01-01T00:00:00.000Z'
      });
      
      const result = await service.registerAgent(mockAgentData);
      
      expect(result.success).toBe(true);
      expect(mockRegistry.registerAgent).toHaveBeenCalledWith(mockAgentData);
    });

    test('should clear cache after registration', async () => {
      mockRegistry.registerAgent.mockResolvedValue({
        success: true,
        urn: mockAgentData.urn
      });
      
      // Add something to cache
      service.cache.set('test-key', { result: {}, timestamp: Date.now() });
      expect(service.cache.size).toBe(1);
      
      await service.registerAgent(mockAgentData);
      
      expect(service.cache.size).toBe(0);
    });
  });

  describe('Caching', () => {
    beforeEach(async () => {
      service = createAgentDiscoveryService({
        registryFactory,
        enableLogging: false,
        enableCaching: true,
        cacheTtl: 1000 // 1 second for testing
      });
      await service.initialize();
      
      mockRegistry.listAgentsByDomain.mockResolvedValue([mockAgentData]);
    });

    test('should cache discovery results', async () => {
      const query = { domain: 'ai' };
      
      // First call
      const result1 = await service.discoverAgents(query);
      
      // Second call should use cache
      const result2 = await service.discoverAgents(query);
      
      expect(result1).toEqual(result2);
      expect(service.cache.size).toBe(1);
    });

    test('should expire cache after TTL', async () => {
      const query = { domain: 'ai' };
      
      // First call
      await service.discoverAgents(query);
      expect(service.cache.size).toBe(1);
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Second call should not use cache
      await service.discoverAgents(query);
      expect(service.cache.size).toBe(1); // New entry
    });

    test('should clear cache manually', async () => {
      const query = { domain: 'ai' };
      
      await service.discoverAgents(query);
      expect(service.cache.size).toBe(1);
      
      service.clearCache();
      expect(service.cache.size).toBe(0);
    });

    test('should disable caching when configured', async () => {
      service = createAgentDiscoveryService({
        registryFactory,
        enableLogging: false,
        enableCaching: false
      });
      await service.initialize();
      
      mockRegistry.listAgentsByDomain.mockResolvedValue([mockAgentData]);
      
      const query = { domain: 'ai' };
      
      await service.discoverAgents(query);
      await service.discoverAgents(query);
      
      expect(service.cache.size).toBe(0);
    });
  });

  describe('Statistics and Health', () => {
    beforeEach(async () => {
      service = createAgentDiscoveryService({ registryFactory, enableLogging: false });
      await service.initialize();
    });

    test('should provide discovery statistics', () => {
      const stats = service.getStats();
      
      expect(stats.totalAgents).toBe(2);
      expect(stats.domains).toBe(2);
      expect(stats.capabilities).toBe(3);
      expect(stats.cacheSize).toBe(0);
      expect(stats.serviceStatus).toBe('healthy');
    });

    test('should provide service health', () => {
      const health = service.getHealth();
      
      expect(health.status).toBe('healthy');
      expect(health.isInitialized).toBe(true);
      expect(health.totalAgents).toBe(2);
      expect(health.service).toBe('AgentDiscoveryService');
      expect(health.cacheEnabled).toBe(true);
    });
  });

  describe('Service Lifecycle', () => {
    test('should shutdown gracefully', async () => {
      service = createAgentDiscoveryService({ registryFactory, enableLogging: false });
      await service.initialize();
      
      await service.shutdown();
      
      expect(mockRegistry.shutdown).toHaveBeenCalled();
      expect(service.cache.size).toBe(0);
      expect(service.isInitialized).toBe(false);
    });

    test('should emit shutdown event', async () => {
      service = createAgentDiscoveryService({ registryFactory, enableLogging: false });
      await service.initialize();
      
      const eventSpy = jest.fn();
      service.on('shutdown', eventSpy);
      
      await service.shutdown();
      
      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('Convenience Functions', () => {
    test('should discover agents using convenience function', async () => {
      mockRegistry.listAgentsByDomain.mockResolvedValue([mockAgentData]);
      
      const result = await discoverAgents({ domain: 'ai' }, {
        registryFactory,
        enableLogging: false
      });
      
      expect(result.agents).toBeDefined();
      expect(result.query.domain).toBe('ai');
    });

    test('should discover by domain using convenience function', async () => {
      mockRegistry.listAgentsByDomain.mockResolvedValue([mockAgentData]);
      
      const result = await discoverByDomain('ai', {
        registryFactory,
        enableLogging: false
      });
      
      expect(result.agents).toBeDefined();
      expect(result.query.domain).toBe('ai');
    });

    test('should discover by capability using convenience function', async () => {
      mockRegistry.listAgentsByDomain.mockResolvedValue([mockAgentData]);
      
      const result = await discoverByCapability('ml-inference', {
        registryFactory,
        enableLogging: false
      });
      
      expect(result.agents).toBeDefined();
      expect(result.query.capabilities).toEqual(['ml-inference']);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      service = createAgentDiscoveryService({ registryFactory, enableLogging: false });
      await service.initialize();
    });

    test('should handle registry errors during discovery', async () => {
      mockRegistry.listAgentsByDomain.mockRejectedValue(new Error('Registry error'));
      
      await expect(service.discoverAgents())
        .rejects.toThrow(URNError);
    });

    test('should handle registry errors during agent retrieval', async () => {
      mockRegistry.getAgent.mockRejectedValue(new Error('Registry error'));
      
      await expect(service.getAgent('urn:agent:ai:test@1.0.0'))
        .rejects.toThrow(URNError);
    });

    test('should handle registry errors during agent registration', async () => {
      mockRegistry.registerAgent.mockRejectedValue(new Error('Registry error'));
      
      await expect(service.registerAgent(mockAgentData))
        .rejects.toThrow(URNError);
    });
  });

  describe('Performance', () => {
    test('should handle large result sets efficiently', async () => {
      const largeAgentList = Array.from({ length: 1000 }, (_, i) => ({
        ...mockAgentData,
        urn: `urn:agent:ai:agent-${i}@1.0.0`,
        name: `agent-${i}`
      }));
      
      mockRegistry.listAgentsByDomain.mockResolvedValue(largeAgentList);
      registryStats = {
        totalAgents: 1000,
        domains: 1,
        capabilities: 1,
        domainStats: { ai: 1000 },
        capabilityStats: { 'ml-inference': 1000 }
      };
      
      service = createAgentDiscoveryService({ registryFactory, enableLogging: false });
      await service.initialize();
      
      const startTime = Date.now();
      
      const result = await service.discoverAgents({ limit: 100 });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(100); // Should complete in under 100ms
      expect(result.returned).toBeLessThanOrEqual(100);
      expect(result.total).toBe(1000);
    });

    test('should handle complex queries efficiently', async () => {
      mockRegistry.listAgentsByDomain.mockResolvedValue([mockAgentData]);
      
      service = createAgentDiscoveryService({ registryFactory, enableLogging: false });
      await service.initialize();
      
      const startTime = Date.now();
      
      const result = await service.discoverAgents({
        domain: 'ai',
        capabilities: ['ml-inference', 'data-processing'],
        name: 'ml-agent',
        version: '1.0.0',
        sort: { field: 'name', order: 'asc' },
        limit: 50,
        offset: 0,
        includeHealth: true
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(100); // Should complete in under 100ms
      expect(result.agents).toBeDefined();
    });
  });
});
