/**
 * Registry API Server Tests
 * 
 * Comprehensive test suite for the registry API server with:
 * - Unit tests for all API endpoints
 * - Integration tests with registry and discovery service
 * - Request validation and error handling tests
 * - CORS and rate limiting tests
 * - Performance tests
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

import { 
  RegistryAPIServer, 
  createRegistryAPIServer, 
  startRegistryAPIServer 
} from '../../packages/runtime/runtime/registry-api.js';

import { 
  URNError, 
  URNFormatError, 
  URNResolutionError 
} from '../../packages/runtime/runtime/urn-types.js';

// Mock the registry and discovery service
jest.mock('../../packages/runtime/runtime/urn-registry.js', () => ({
  createURNRegistry: jest.fn(() => ({
    initialize: jest.fn(),
    registerAgent: jest.fn(),
    getAgent: jest.fn(),
    listAgentsByDomain: jest.fn(),
    searchAgentsByCapability: jest.fn(),
    getStats: jest.fn(),
    getHealth: jest.fn(),
    shutdown: jest.fn()
  }))
}));

jest.mock('../../packages/runtime/runtime/agent-discovery-service.js', () => ({
  createAgentDiscoveryService: jest.fn(() => ({
    initialize: jest.fn(),
    discoverAgents: jest.fn(),
    discoverByDomain: jest.fn(),
    discoverByCapability: jest.fn(),
    getAgent: jest.fn(),
    registerAgent: jest.fn(),
    getStats: jest.fn(),
    getHealth: jest.fn(),
    shutdown: jest.fn()
  }))
}));

describe('Registry API Server', () => {
  let server;
  let mockRegistry;
  let mockDiscoveryService;
  let mockAgentData;

  beforeEach(async () => {
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
        }
      },
      endpoints: {
        api: '/api/v1',
        health: '/health'
      }
    };

    // Create mock registry
    mockRegistry = {
      initialize: jest.fn(),
      registerAgent: jest.fn(),
      getAgent: jest.fn(),
      listAgentsByDomain: jest.fn(),
      searchAgentsByCapability: jest.fn(),
      getStats: jest.fn(() => ({
        totalAgents: 1,
        domains: 1,
        capabilities: 1
      })),
      getHealth: jest.fn(() => ({
        status: 'healthy',
        isInitialized: true,
        totalAgents: 1
      })),
      shutdown: jest.fn()
    };

    // Create mock discovery service
    mockDiscoveryService = {
      initialize: jest.fn(),
      discoverAgents: jest.fn(),
      discoverByDomain: jest.fn(),
      discoverByCapability: jest.fn(),
      getAgent: jest.fn(),
      registerAgent: jest.fn(),
      getStats: jest.fn(() => ({
        totalAgents: 1,
        domains: 1,
        capabilities: 1,
        cacheSize: 0,
        serviceStatus: 'healthy'
      })),
      getHealth: jest.fn(() => ({
        status: 'healthy',
        isInitialized: true,
        totalAgents: 1,
        service: 'AgentDiscoveryService',
        cacheEnabled: true,
        cacheSize: 0
      })),
      shutdown: jest.fn()
    };

    // Mock the service creation
    const { createURNRegistry } = await import('../../packages/runtime/runtime/urn-registry.js');
    const { createAgentDiscoveryService } = await import('../../packages/runtime/runtime/agent-discovery-service.js');
    
    createURNRegistry.mockReturnValue(mockRegistry);
    createAgentDiscoveryService.mockReturnValue(mockDiscoveryService);

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Server Initialization', () => {
    test('should initialize with default configuration', async () => {
      server = createRegistryAPIServer();
      await server.start();
      
      expect(server.isRunning).toBe(true);
      expect(mockRegistry.initialize).toHaveBeenCalled();
      expect(mockDiscoveryService.initialize).toHaveBeenCalled();
    });

    test('should initialize with custom configuration', async () => {
      server = createRegistryAPIServer({
        port: 3002,
        host: '0.0.0.0',
        enableLogging: false
      });
      
      await server.start();
      
      expect(server.config.port).toBe(3002);
      expect(server.config.host).toBe('0.0.0.0');
    });

    test('should handle initialization errors', async () => {
      mockRegistry.initialize.mockRejectedValue(new Error('Registry init failed'));
      
      server = createRegistryAPIServer();
      
      await expect(server.start()).rejects.toThrow(URNError);
    });

    test('should provide server status', () => {
      server = createRegistryAPIServer();
      
      const status = server.getStatus();
      
      expect(status.isRunning).toBe(false);
      expect(status.port).toBeDefined();
      expect(status.host).toBeDefined();
      expect(status.endpoints).toBeDefined();
    });
  });

  describe('Health Check Endpoint', () => {
    beforeEach(async () => {
      server = createRegistryAPIServer();
      await server.start();
    });

    test('should return health status', async () => {
      const request = {
        method: 'GET',
        url: '/api/v1/health',
        headers: {},
        query: {},
        body: null,
        ip: '127.0.0.1'
      };

      const response = await server.handleRequest(request);
      
      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.services.registry).toBeDefined();
      expect(response.body.services.discovery).toBeDefined();
    });
  });

  describe('Statistics Endpoint', () => {
    beforeEach(async () => {
      server = createRegistryAPIServer();
      await server.start();
    });

    test('should return statistics', async () => {
      const request = {
        method: 'GET',
        url: '/api/v1/stats',
        headers: {},
        query: {},
        body: null,
        ip: '127.0.0.1'
      };

      const response = await server.handleRequest(request);
      
      expect(response.statusCode).toBe(200);
      expect(response.body.registry).toBeDefined();
      expect(response.body.discovery).toBeDefined();
      expect(response.body.server).toBeDefined();
    });
  });

  describe('Agent List Endpoint', () => {
    beforeEach(async () => {
      server = createRegistryAPIServer();
      await server.start();
      
      mockDiscoveryService.discoverAgents.mockResolvedValue({
        agents: [mockAgentData],
        total: 1,
        returned: 1,
        query: {},
        executedAt: '2024-01-01T00:00:00.000Z',
        executionTime: 10
      });
    });

    test('should list agents with default parameters', async () => {
      const request = {
        method: 'GET',
        url: '/api/v1/agents',
        headers: {},
        query: {},
        body: null,
        ip: '127.0.0.1'
      };

      const response = await server.handleRequest(request);
      
      expect(response.statusCode).toBe(200);
      expect(response.body.agents).toHaveLength(1);
      expect(mockDiscoveryService.discoverAgents).toHaveBeenCalledWith({
        limit: 50,
        offset: 0,
        sort: undefined
      });
    });

    test('should list agents with query parameters', async () => {
      const request = {
        method: 'GET',
        url: '/api/v1/agents',
        headers: {},
        query: {
          limit: '10',
          offset: '5',
          sort: '{"field":"name","order":"asc"}'
        },
        body: null,
        ip: '127.0.0.1'
      };

      const response = await server.handleRequest(request);
      
      expect(response.statusCode).toBe(200);
      expect(mockDiscoveryService.discoverAgents).toHaveBeenCalledWith({
        limit: 10,
        offset: 5,
        sort: { field: 'name', order: 'asc' }
      });
    });

    test('should handle discovery errors', async () => {
      mockDiscoveryService.discoverAgents.mockRejectedValue(new Error('Discovery failed'));
      
      const request = {
        method: 'GET',
        url: '/api/v1/agents',
        headers: {},
        query: {},
        body: null,
        ip: '127.0.0.1'
      };

      const response = await server.handleRequest(request);
      
      expect(response.statusCode).toBe(500);
      expect(response.body.error).toBe('Internal Server Error');
    });
  });

  describe('Agent Registration Endpoint', () => {
    beforeEach(async () => {
      server = createRegistryAPIServer();
      await server.start();
      
      mockDiscoveryService.registerAgent.mockResolvedValue({
        success: true,
        urn: mockAgentData.urn,
        registeredAt: '2024-01-01T00:00:00.000Z',
        message: 'Agent registered successfully'
      });
    });

    test('should register agent successfully', async () => {
      const request = {
        method: 'POST',
        url: '/api/v1/agents',
        headers: { 'Content-Type': 'application/json' },
        query: {},
        body: mockAgentData,
        ip: '127.0.0.1'
      };

      const response = await server.handleRequest(request);
      
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(mockDiscoveryService.registerAgent).toHaveBeenCalledWith(mockAgentData);
    });

    test('should handle missing request body', async () => {
      const request = {
        method: 'POST',
        url: '/api/v1/agents',
        headers: { 'Content-Type': 'application/json' },
        query: {},
        body: null,
        ip: '127.0.0.1'
      };

      const response = await server.handleRequest(request);
      
      expect(response.statusCode).toBe(500);
      expect(response.body.error).toBe('Internal Server Error');
    });

    test('should handle URN format errors', async () => {
      mockDiscoveryService.registerAgent.mockRejectedValue(
        new URNFormatError('Invalid URN format')
      );
      
      const request = {
        method: 'POST',
        url: '/api/v1/agents',
        headers: { 'Content-Type': 'application/json' },
        query: {},
        body: { ...mockAgentData, urn: 'invalid-urn' },
        ip: '127.0.0.1'
      };

      const response = await server.handleRequest(request);
      
      expect(response.statusCode).toBe(400);
      expect(response.body.error).toBe('Invalid URN format');
    });

    test('should handle duplicate agent errors', async () => {
      mockDiscoveryService.registerAgent.mockRejectedValue(
        new URNResolutionError('Agent already exists')
      );
      
      const request = {
        method: 'POST',
        url: '/api/v1/agents',
        headers: { 'Content-Type': 'application/json' },
        query: {},
        body: mockAgentData,
        ip: '127.0.0.1'
      };

      const response = await server.handleRequest(request);
      
      expect(response.statusCode).toBe(409);
      expect(response.body.error).toBe('Agent already exists');
    });
  });

  describe('Get Agent Endpoint', () => {
    beforeEach(async () => {
      server = createRegistryAPIServer();
      await server.start();
    });

    test('should get agent by URN', async () => {
      mockDiscoveryService.getAgent.mockResolvedValue(mockAgentData);
      
      const request = {
        method: 'GET',
        url: '/api/v1/agents/urn%3Aagent%3Aai%3Aml-agent%401.0.0',
        headers: {},
        query: {},
        body: null,
        ip: '127.0.0.1'
      };

      const response = await server.handleRequest(request);
      
      expect(response.statusCode).toBe(200);
      expect(response.body.urn).toBe(mockAgentData.urn);
      expect(mockDiscoveryService.getAgent).toHaveBeenCalledWith(mockAgentData.urn);
    });

    test('should return 404 for non-existent agent', async () => {
      mockDiscoveryService.getAgent.mockResolvedValue(null);
      
      const request = {
        method: 'GET',
        url: '/api/v1/agents/urn%3Aagent%3Aai%3Anon-existent%401.0.0',
        headers: {},
        query: {},
        body: null,
        ip: '127.0.0.1'
      };

      const response = await server.handleRequest(request);
      
      expect(response.statusCode).toBe(404);
      expect(response.body.error).toBe('Agent not found');
    });

    test('should handle URN format errors', async () => {
      mockDiscoveryService.getAgent.mockRejectedValue(
        new URNFormatError('Invalid URN format')
      );
      
      const request = {
        method: 'GET',
        url: '/api/v1/agents/invalid-urn',
        headers: {},
        query: {},
        body: null,
        ip: '127.0.0.1'
      };

      const response = await server.handleRequest(request);
      
      expect(response.statusCode).toBe(400);
      expect(response.body.error).toBe('Invalid URN format');
    });
  });

  describe('Domain Endpoint', () => {
    beforeEach(async () => {
      server = createRegistryAPIServer();
      await server.start();
      
      mockDiscoveryService.discoverByDomain.mockResolvedValue({
        agents: [mockAgentData],
        total: 1,
        returned: 1,
        query: { domain: 'ai' },
        executedAt: '2024-01-01T00:00:00.000Z',
        executionTime: 10
      });
    });

    test('should list agents by domain', async () => {
      const request = {
        method: 'GET',
        url: '/api/v1/agents/domain/ai',
        headers: {},
        query: {},
        body: null,
        ip: '127.0.0.1'
      };

      const response = await server.handleRequest(request);
      
      expect(response.statusCode).toBe(200);
      expect(response.body.agents).toHaveLength(1);
      expect(mockDiscoveryService.discoverByDomain).toHaveBeenCalledWith('ai', {
        limit: 50,
        offset: 0
      });
    });

    test('should handle domain discovery errors', async () => {
      mockDiscoveryService.discoverByDomain.mockRejectedValue(
        new Error('Domain discovery failed')
      );
      
      const request = {
        method: 'GET',
        url: '/api/v1/agents/domain/ai',
        headers: {},
        query: {},
        body: null,
        ip: '127.0.0.1'
      };

      const response = await server.handleRequest(request);
      
      expect(response.statusCode).toBe(500);
      expect(response.body.error).toBe('Internal Server Error');
    });
  });

  describe('Capability Endpoint', () => {
    beforeEach(async () => {
      server = createRegistryAPIServer();
      await server.start();
      
      mockDiscoveryService.discoverByCapability.mockResolvedValue({
        agents: [mockAgentData],
        total: 1,
        returned: 1,
        query: { capabilities: ['ml-inference'] },
        executedAt: '2024-01-01T00:00:00.000Z',
        executionTime: 10
      });
    });

    test('should list agents by capability', async () => {
      const request = {
        method: 'GET',
        url: '/api/v1/agents/capability/ml-inference',
        headers: {},
        query: {},
        body: null,
        ip: '127.0.0.1'
      };

      const response = await server.handleRequest(request);
      
      expect(response.statusCode).toBe(200);
      expect(response.body.agents).toHaveLength(1);
      expect(mockDiscoveryService.discoverByCapability).toHaveBeenCalledWith('ml-inference', {
        limit: 50,
        offset: 0
      });
    });
  });

  describe('Discovery Endpoint', () => {
    beforeEach(async () => {
      server = createRegistryAPIServer();
      await server.start();
      
      mockDiscoveryService.discoverAgents.mockResolvedValue({
        agents: [mockAgentData],
        total: 1,
        returned: 1,
        query: {},
        executedAt: '2024-01-01T00:00:00.000Z',
        executionTime: 10
      });
    });

    test('should discover agents with query parameters', async () => {
      const request = {
        method: 'GET',
        url: '/api/v1/discover',
        headers: {},
        query: {
          domain: 'ai',
          capabilities: 'ml-inference,data-processing',
          version: '1.0.0',
          name: 'ml-agent',
          sort: '{"field":"name","order":"asc"}',
          limit: '10',
          offset: '0',
          includeHealth: 'true'
        },
        body: null,
        ip: '127.0.0.1'
      };

      const response = await server.handleRequest(request);
      
      expect(response.statusCode).toBe(200);
      expect(mockDiscoveryService.discoverAgents).toHaveBeenCalledWith({
        domain: 'ai',
        capabilities: ['ml-inference', 'data-processing'],
        version: '1.0.0',
        name: 'ml-agent',
        sort: { field: 'name', order: 'asc' },
        limit: 10,
        offset: 0,
        includeHealth: true
      });
    });

    test('should handle discovery errors', async () => {
      mockDiscoveryService.discoverAgents.mockRejectedValue(
        new Error('Discovery failed')
      );
      
      const request = {
        method: 'GET',
        url: '/api/v1/discover',
        headers: {},
        query: {},
        body: null,
        ip: '127.0.0.1'
      };

      const response = await server.handleRequest(request);
      
      expect(response.statusCode).toBe(500);
      expect(response.body.error).toBe('Internal Server Error');
    });
  });

  describe('CORS Handling', () => {
    beforeEach(async () => {
      server = createRegistryAPIServer();
      await server.start();
    });

    test('should handle CORS preflight requests', async () => {
      const request = {
        method: 'OPTIONS',
        url: '/api/v1/agents',
        headers: {
          'Origin': 'https://example.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type'
        },
        query: {},
        body: null,
        ip: '127.0.0.1'
      };

      const response = await server.handleRequest(request);
      
      expect(response.statusCode).toBe(200);
      expect(response.headers['Access-Control-Allow-Origin']).toBeDefined();
      expect(response.headers['Access-Control-Allow-Methods']).toBeDefined();
      expect(response.headers['Access-Control-Allow-Headers']).toBeDefined();
    });

    test('should include CORS headers in responses', async () => {
      mockDiscoveryService.discoverAgents.mockResolvedValue({
        agents: [],
        total: 0,
        returned: 0,
        query: {},
        executedAt: '2024-01-01T00:00:00.000Z',
        executionTime: 10
      });
      
      const request = {
        method: 'GET',
        url: '/api/v1/agents',
        headers: {},
        query: {},
        body: null,
        ip: '127.0.0.1'
      };

      const response = await server.handleRequest(request);
      
      expect(response.headers['Access-Control-Allow-Origin']).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(async () => {
      server = createRegistryAPIServer({
        rateLimit: {
          windowMs: 60000,
          max: 2
        }
      });
      await server.start();
    });

    test('should allow requests within rate limit', async () => {
      mockDiscoveryService.discoverAgents.mockResolvedValue({
        agents: [],
        total: 0,
        returned: 0,
        query: {},
        executedAt: '2024-01-01T00:00:00.000Z',
        executionTime: 10
      });
      
      const request = {
        method: 'GET',
        url: '/api/v1/agents',
        headers: {},
        query: {},
        body: null,
        ip: '127.0.0.1'
      };

      // First request
      const response1 = await server.handleRequest(request);
      expect(response1.statusCode).toBe(200);

      // Second request
      const response2 = await server.handleRequest(request);
      expect(response2.statusCode).toBe(200);
    });

    test('should reject requests exceeding rate limit', async () => {
      mockDiscoveryService.discoverAgents.mockResolvedValue({
        agents: [],
        total: 0,
        returned: 0,
        query: {},
        executedAt: '2024-01-01T00:00:00.000Z',
        executionTime: 10
      });
      
      const request = {
        method: 'GET',
        url: '/api/v1/agents',
        headers: {},
        query: {},
        body: null,
        ip: '127.0.0.1'
      };

      // Make requests up to the limit
      await server.handleRequest(request);
      await server.handleRequest(request);

      // Third request should be rate limited
      const response = await server.handleRequest(request);
      expect(response.statusCode).toBe(429);
      expect(response.body.error).toBe('Rate Limit Exceeded');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      server = createRegistryAPIServer();
      await server.start();
    });

    test('should handle 404 for unknown routes', async () => {
      const request = {
        method: 'GET',
        url: '/api/v1/unknown',
        headers: {},
        query: {},
        body: null,
        ip: '127.0.0.1'
      };

      const response = await server.handleRequest(request);
      
      expect(response.statusCode).toBe(404);
      expect(response.body.error).toBe('Not Found');
      expect(response.body.availableEndpoints).toBeDefined();
    });

    test('should handle server errors', async () => {
      const request = {
        method: 'GET',
        url: '/api/v1/agents',
        headers: {},
        query: {},
        body: null,
        ip: '127.0.0.1'
      };

      // Mock an error
      mockDiscoveryService.discoverAgents.mockRejectedValue(new Error('Service error'));

      const response = await server.handleRequest(request);
      
      expect(response.statusCode).toBe(500);
      expect(response.body.error).toBe('Internal Server Error');
      expect(response.body.requestId).toBeDefined();
    });
  });

  describe('Server Lifecycle', () => {
    test('should shutdown gracefully', async () => {
      server = createRegistryAPIServer();
      await server.start();
      
      await server.stop();
      
      expect(server.isRunning).toBe(false);
      expect(mockDiscoveryService.shutdown).toHaveBeenCalled();
      expect(mockRegistry.shutdown).toHaveBeenCalled();
    });

    test('should emit lifecycle events', async () => {
      server = createRegistryAPIServer();
      
      const startedSpy = jest.fn();
      const stoppedSpy = jest.fn();
      
      server.on('started', startedSpy);
      server.on('stopped', stoppedSpy);
      
      await server.start();
      expect(startedSpy).toHaveBeenCalled();
      
      await server.stop();
      expect(stoppedSpy).toHaveBeenCalled();
    });
  });

  describe('Convenience Functions', () => {
    test('should start server using convenience function', async () => {
      const startedServer = await startRegistryAPIServer({
        port: 3003
      });
      
      expect(startedServer.isRunning).toBe(true);
      expect(startedServer.config.port).toBe(3003);
      
      await startedServer.stop();
    });
  });

  describe('Performance', () => {
    beforeEach(async () => {
      server = createRegistryAPIServer();
      await server.start();
      
      mockDiscoveryService.discoverAgents.mockResolvedValue({
        agents: Array.from({ length: 1000 }, (_, i) => ({
          ...mockAgentData,
          urn: `urn:agent:ai:agent-${i}@1.0.0`,
          name: `agent-${i}`
        })),
        total: 1000,
        returned: 1000,
        query: {},
        executedAt: '2024-01-01T00:00:00.000Z',
        executionTime: 50
      });
    });

    test('should handle high request volume efficiently', async () => {
      const request = {
        method: 'GET',
        url: '/api/v1/agents',
        headers: {},
        query: { limit: '100' },
        body: null,
        ip: '127.0.0.1'
      };

      const startTime = Date.now();
      
      // Make 100 requests
      const promises = Array.from({ length: 100 }, () => 
        server.handleRequest(request)
      );
      
      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
      expect(responses.every(r => r.statusCode === 200)).toBe(true);
    });
  });
});
