/**
 * Well-Known Server Tests
 * 
 * Comprehensive test suite for the well-known server including:
 * - Server lifecycle management
 * - HTTP request handling
 * - CORS support
 * - Endpoint routing
 * - Error handling
 * - Integration with ACM generator and URN resolver
 */

import { jest } from '@jest/globals';
import { WellKnownServer, createWellKnownServer, startWellKnownServer } from '../../packages/runtime/runtime/well-known-server.js';
import { 
  WellKnownError, 
  WellKnownServerError, 
  WellKnownValidationError 
} from '../../packages/runtime/runtime/well-known-types.js';

describe('Well-Known Server', () => {
  let server;

  beforeEach(() => {
    server = new WellKnownServer({
      enableLogging: false, // Disable logging for tests
      port: 3001 // Use different port for tests
    });
  });

  afterEach(async () => {
    if (server && server.isRunning) {
      await server.stop();
    }
  });

  describe('Server Lifecycle', () => {
    test('should start server successfully', async () => {
      await server.start();
      
      expect(server.isRunning).toBe(true);
      expect(server.server).toBeDefined();
    });

    test('should stop server successfully', async () => {
      await server.start();
      expect(server.isRunning).toBe(true);
      
      await server.stop();
      expect(server.isRunning).toBe(false);
    });

    test('should throw error when starting already running server', async () => {
      await server.start();
      
      await expect(server.start()).rejects.toThrow(WellKnownServerError);
      await expect(server.start()).rejects.toThrow('Server is already running');
    });

    test('should handle stop when not running', async () => {
      // Server is not running
      expect(server.isRunning).toBe(false);
      
      // Should not throw error
      await expect(server.stop()).resolves.not.toThrow();
    });

    test('should emit started event', async () => {
      const startedSpy = jest.fn();
      server.on('started', startedSpy);
      
      await server.start();
      
      expect(startedSpy).toHaveBeenCalledWith({
        port: 3001,
        host: 'localhost'
      });
    });

    test('should emit stopped event', async () => {
      const stoppedSpy = jest.fn();
      server.on('stopped', stoppedSpy);
      
      await server.start();
      await server.stop();
      
      expect(stoppedSpy).toHaveBeenCalled();
    });
  });

  describe('Server Status', () => {
    test('should return correct status when stopped', () => {
      const status = server.getStatus();
      
      expect(status.isRunning).toBe(false);
      expect(status.port).toBe(3001);
      expect(status.host).toBe('localhost');
      expect(status.endpoints).toContain('/.well-known/agent-capabilities');
    });

    test('should return correct status when running', async () => {
      await server.start();
      
      const status = server.getStatus();
      
      expect(status.isRunning).toBe(true);
      expect(status.port).toBe(3001);
      expect(status.host).toBe('localhost');
    });
  });

  describe('Request Handling', () => {
    beforeEach(async () => {
      await server.start();
    });

    test('should handle capabilities list request', async () => {
      const request = {
        method: 'GET',
        url: '/.well-known/agent-capabilities',
        headers: {},
        query: { domain: 'ai' }
      };

      const response = await server.handleRequest(request);

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/json');
      expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(response.body.apiVersion).toBe('well-known.ossp-agi.io/v1');
      expect(response.body.kind).toBe('AgentCapabilityList');
      expect(response.body.metadata.domain).toBe('ai');
      expect(Array.isArray(response.body.items)).toBe(true);
    });

    test('should handle capabilities by URN request', async () => {
      const urn = 'urn:agent:ai:ml-agent@1.0.0';
      const request = {
        method: 'GET',
        url: `/.well-known/agent-capabilities/${encodeURIComponent(urn)}`,
        headers: {},
        query: {}
      };

      const response = await server.handleRequest(request);

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/json');
      expect(response.body.apiVersion).toBe('well-known.ossp-agi.io/v1');
      expect(response.body.kind).toBe('AgentCapabilityManifest');
      expect(response.body.metadata.urn).toBe(urn);
    });

    test('should handle CORS preflight request', async () => {
      const request = {
        method: 'OPTIONS',
        url: '/.well-known/agent-capabilities',
        headers: {
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'Content-Type'
        },
        query: {}
      };

      const response = await server.handleRequest(request);

      expect(response.statusCode).toBe(200);
      expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(response.headers['Access-Control-Allow-Methods']).toContain('GET');
      expect(response.headers['Access-Control-Allow-Headers']).toContain('Content-Type');
      expect(response.body).toBe('');
    });

    test('should handle 404 for unknown routes', async () => {
      const request = {
        method: 'GET',
        url: '/unknown-route',
        headers: {},
        query: {}
      };

      const response = await server.handleRequest(request);

      expect(response.statusCode).toBe(404);
      expect(response.headers['Content-Type']).toBe('application/json');
      expect(response.body.error).toBe('Not Found');
      expect(response.body.availableEndpoints).toContain('/.well-known/agent-capabilities');
    });

    test('should handle invalid URN format', async () => {
      const invalidUrn = 'invalid-urn-format';
      const request = {
        method: 'GET',
        url: `/.well-known/agent-capabilities/${encodeURIComponent(invalidUrn)}`,
        headers: {},
        query: {}
      };

      const response = await server.handleRequest(request);

      expect(response.statusCode).toBe(400);
      expect(response.headers['Content-Type']).toBe('application/json');
      expect(response.body.error).toBe('Invalid URN format');
      expect(response.body.urn).toBe(invalidUrn);
    });

    test('should handle URN resolution error', async () => {
      // Mock URN resolver to throw resolution error
      server.urnResolver.resolveAgentUrn = jest.fn().mockRejectedValue(
        new Error('Agent not found')
      );

      const urn = 'urn:agent:test:non-existent@1.0.0';
      const request = {
        method: 'GET',
        url: `/.well-known/agent-capabilities/${encodeURIComponent(urn)}`,
        headers: {},
        query: {}
      };

      const response = await server.handleRequest(request);

      expect(response.statusCode).toBe(404);
      expect(response.headers['Content-Type']).toBe('application/json');
      expect(response.body.error).toBe('Agent not found');
      expect(response.body.urn).toBe(urn);
    });

    test('should handle server errors', async () => {
      // Mock request handling to throw error
      server._handleCapabilitiesList = jest.fn().mockRejectedValue(
        new Error('Internal server error')
      );

      const request = {
        method: 'GET',
        url: '/.well-known/agent-capabilities',
        headers: {},
        query: {}
      };

      const response = await server.handleRequest(request);

      expect(response.statusCode).toBe(500);
      expect(response.headers['Content-Type']).toBe('application/json');
      expect(response.body.error).toBe('Internal Server Error');
      expect(response.body.requestId).toBeDefined();
    });
  });

  describe('CORS Configuration', () => {
    test('should use default CORS settings', () => {
      const server = new WellKnownServer();
      
      expect(server.config.cors.origin).toBe('*');
      expect(server.config.cors.methods).toContain('GET');
      expect(server.config.cors.methods).toContain('OPTIONS');
      expect(server.config.cors.headers).toContain('Content-Type');
    });

    test('should use custom CORS settings', () => {
      const customCors = {
        origin: 'https://example.com',
        methods: ['GET', 'POST'],
        headers: ['Content-Type', 'Authorization', 'X-Custom-Header']
      };

      const server = new WellKnownServer({
        cors: customCors
      });

      expect(server.config.cors.origin).toBe('https://example.com');
      expect(server.config.cors.methods).toContain('POST');
      expect(server.config.cors.headers).toContain('X-Custom-Header');
    });

    test('should include CORS headers in responses', async () => {
      await server.start();

      const request = {
        method: 'GET',
        url: '/.well-known/agent-capabilities',
        headers: {},
        query: {}
      };

      const response = await server.handleRequest(request);

      expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(response.headers['Cache-Control']).toBe('public, max-age=300');
    });
  });

  describe('Integration with ACM Generator and URN Resolver', () => {
    test('should have ACM generator instance', () => {
      expect(server.acmGenerator).toBeDefined();
    });

    test('should have URN resolver instance', () => {
      expect(server.urnResolver).toBeDefined();
    });

    test('should use URN resolver for capability discovery', async () => {
      await server.start();

      const discoverSpy = jest.spyOn(server.urnResolver, 'discoverCapabilities');
      
      const request = {
        method: 'GET',
        url: '/.well-known/agent-capabilities',
        headers: {},
        query: { domain: 'test' }
      };

      await server.handleRequest(request);

      expect(discoverSpy).toHaveBeenCalledWith('test');
    });

    test('should use URN resolver for URN resolution', async () => {
      await server.start();

      const resolveSpy = jest.spyOn(server.urnResolver, 'resolveAgentUrn');
      
      const urn = 'urn:agent:test:agent@1.0.0';
      const request = {
        method: 'GET',
        url: `/.well-known/agent-capabilities/${encodeURIComponent(urn)}`,
        headers: {},
        query: {}
      };

      await server.handleRequest(request);

      expect(resolveSpy).toHaveBeenCalledWith(urn, { useCache: true });
    });
  });

  describe('Convenience Functions', () => {
    test('createWellKnownServer should create server instance', () => {
      const server = createWellKnownServer();
      expect(server).toBeInstanceOf(WellKnownServer);
    });

    test('startWellKnownServer should create and start server', async () => {
      const server = await startWellKnownServer({
        port: 3002,
        enableLogging: false
      });

      expect(server).toBeInstanceOf(WellKnownServer);
      expect(server.isRunning).toBe(true);

      await server.stop();
    });
  });

  describe('Error Handling', () => {
    test('should wrap non-well-known errors', async () => {
      await server.start();

      // Mock request handling to throw non-well-known error
      server._handleCapabilitiesList = jest.fn().mockRejectedValue(
        new Error('Unexpected error')
      );

      const request = {
        method: 'GET',
        url: '/.well-known/agent-capabilities',
        headers: {},
        query: {}
      };

      const response = await server.handleRequest(request);

      expect(response.statusCode).toBe(500);
      expect(response.body.error).toBe('Internal Server Error');
    });

    test('should preserve error context in logs', async () => {
      const serverWithLogging = new WellKnownServer({
        enableLogging: true,
        port: 3003
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await serverWithLogging.start();

      // Mock request handling to throw error
      serverWithLogging._handleCapabilitiesList = jest.fn().mockRejectedValue(
        new Error('Test error')
      );

      const request = {
        method: 'GET',
        url: '/.well-known/agent-capabilities',
        headers: {},
        query: {}
      };

      await serverWithLogging.handleRequest(request);

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
      await serverWithLogging.stop();
    });
  });

  describe('Request Context Parsing', () => {
    beforeEach(async () => {
      await server.start();
    });

    test('should parse query parameters', async () => {
      const request = {
        method: 'GET',
        url: '/.well-known/agent-capabilities?domain=ai&limit=10',
        headers: {},
        query: { domain: 'ai', limit: '10' }
      };

      const response = await server.handleRequest(request);

      expect(response.body.metadata.domain).toBe('ai');
    });

    test('should decode URN in URL path', async () => {
      const urn = 'urn:agent:test:agent@1.0.0';
      const encodedUrn = encodeURIComponent(urn);
      
      const request = {
        method: 'GET',
        url: `/.well-known/agent-capabilities/${encodedUrn}`,
        headers: {},
        query: {}
      };

      const response = await server.handleRequest(request);

      expect(response.body.metadata.urn).toBe(urn);
    });
  });
});
