/**
 * A2A Client Tests
 * 
 * Comprehensive test suite for the A2A HTTP client including:
 * - Success scenarios
 * - Authentication errors (401/403)
 * - Retry logic for 429/5xx errors
 * - Timeout handling
 * - Network error handling
 * - Error type validation
 */

import { jest } from '@jest/globals';
import { A2AClient, createA2AClient, request } from '../../packages/runtime/runtime/a2a-client.js';
import { StaticAuthProvider, NoAuthProvider } from '../../packages/runtime/runtime/a2a-auth.js';
import { 
  A2AError, 
  AuthError, 
  TimeoutError, 
  NetworkError, 
  RetryError 
} from '../../packages/runtime/runtime/a2a-types.js';

// Mock fetch globally
global.fetch = jest.fn();

describe('A2A Client', () => {
  let mockFetch;
  let client;
  let authProvider;

  beforeEach(() => {
    mockFetch = global.fetch;
    mockFetch.mockClear();
    authProvider = new StaticAuthProvider('test-token');
    client = new A2AClient({
      authProvider,
      baseUrl: 'http://localhost:3000',
      enableLogging: false // Disable logging for tests
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Functionality', () => {
    test('should make successful request', async () => {
      const mockResponse = {
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue({ success: true })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await client.request('urn:agent:test:example', '/api/test', {
        body: { test: 'data' }
      });

      expect(result).toEqual({
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: { success: true }
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/agents/test-example/api/test',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({ test: 'data' })
        })
      );
    });

    test('should handle text responses', async () => {
      const mockResponse = {
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        text: jest.fn().mockResolvedValue('Hello World')
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await client.request('urn:agent:test:example', '/api/test');

      expect(result.data).toBe('Hello World');
    });

    test('should handle non-JSON responses', async () => {
      const mockResponse = {
        status: 200,
        headers: new Map([['content-type', 'application/octet-stream']])
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await client.request('urn:agent:test:example', '/api/test');

      expect(result.data).toBe(mockResponse);
    });
  });

  describe('Authentication', () => {
    test('should throw AuthError for 401 status', async () => {
      const mockResponse = {
        status: 401,
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue({ error: 'Unauthorized' })
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        client.request('urn:agent:test:example', '/api/test')
      ).rejects.toThrow(AuthError);

      await expect(
        client.request('urn:agent:test:example', '/api/test')
      ).rejects.toThrow('Authentication failed: Unauthorized');
    });

    test('should throw AuthError for 403 status', async () => {
      const mockResponse = {
        status: 403,
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue({ error: 'Forbidden' })
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        client.request('urn:agent:test:example', '/api/test')
      ).rejects.toThrow(AuthError);

      await expect(
        client.request('urn:agent:test:example', '/api/test')
      ).rejects.toThrow('Authentication failed: Forbidden');
    });

    test('should work without authentication', async () => {
      const noAuthClient = new A2AClient({
        authProvider: new NoAuthProvider(),
        enableLogging: false
      });

      const mockResponse = {
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue({ success: true })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await noAuthClient.request('urn:agent:test:example', '/api/test');

      expect(result.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'Authorization': expect.any(String)
          })
        })
      );
    });

    test('should include delegation header when provided', async () => {
      const mockResponse = {
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue({ success: true })
      };
      mockFetch.mockResolvedValue(mockResponse);

      await client.request('urn:agent:test:example', '/api/test', {
        context: { currentAgentUrn: 'urn:agent:delegator:agent' }
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-agent-delegation': 'urn:agent:delegator:agent'
          })
        })
      );
    });
  });

  describe('Retry Logic', () => {
    test('should retry on 429 status', async () => {
      const mockResponses = [
        {
          status: 429,
          headers: new Map([['content-type', 'application/json']]),
          json: jest.fn().mockResolvedValue({ error: 'Rate limited' })
        },
        {
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: jest.fn().mockResolvedValue({ success: true })
        }
      ];

      mockFetch
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1]);

      const result = await client.request('urn:agent:test:example', '/api/test');

      expect(result.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('should retry on 5xx status codes', async () => {
      const mockResponses = [
        {
          status: 503,
          headers: new Map([['content-type', 'application/json']]),
          json: jest.fn().mockResolvedValue({ error: 'Service unavailable' })
        },
        {
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: jest.fn().mockResolvedValue({ success: true })
        }
      ];

      mockFetch
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1]);

      const result = await client.request('urn:agent:test:example', '/api/test');

      expect(result.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('should not retry auth errors', async () => {
      const mockResponse = {
        status: 401,
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue({ error: 'Unauthorized' })
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        client.request('urn:agent:test:example', '/api/test')
      ).rejects.toThrow(AuthError);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('should throw RetryError when max retries exceeded', async () => {
      const mockResponse = {
        status: 503,
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue({ error: 'Service unavailable' })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const retryClient = new A2AClient({
        authProvider,
        maxRetries: 2,
        enableLogging: false
      });

      await expect(
        retryClient.request('urn:agent:test:example', '/api/test')
      ).rejects.toThrow(RetryError);

      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    test('should respect custom maxRetries per request', async () => {
      const mockResponse = {
        status: 503,
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue({ error: 'Service unavailable' })
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        client.request('urn:agent:test:example', '/api/test', {
          maxRetries: 1
        })
      ).rejects.toThrow(RetryError);

      expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });
  });

  describe('Timeout Handling', () => {
    test('should throw TimeoutError on timeout', async () => {
      // Mock fetch to reject with AbortError after timeout
      mockFetch.mockImplementation(() => 
        new Promise((resolve, reject) => {
          setTimeout(() => {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          }, 50);
        })
      );

      const timeoutClient = new A2AClient({
        authProvider,
        timeout: 100,
        enableLogging: false
      });

      await expect(
        timeoutClient.request('urn:agent:test:example', '/api/test')
      ).rejects.toThrow(TimeoutError);
    });

    test('should respect custom timeout per request', async () => {
      // Mock fetch to reject with AbortError after timeout
      mockFetch.mockImplementation(() => 
        new Promise((resolve, reject) => {
          setTimeout(() => {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          }, 50);
        })
      );

      await expect(
        client.request('urn:agent:test:example', '/api/test', {
          timeout: 100
        })
      ).rejects.toThrow(TimeoutError);
    });
  });

  describe('Network Errors', () => {
    test('should throw NetworkError on fetch failure', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      const noRetryClient = new A2AClient({
        authProvider,
        maxRetries: 0,
        enableLogging: false
      });

      await expect(
        noRetryClient.request('urn:agent:test:example', '/api/test')
      ).rejects.toThrow(RetryError);
    }, 10000);

    test('should throw A2AError on other errors', async () => {
      mockFetch.mockRejectedValue(new Error('Some other error'));

      const noRetryClient = new A2AClient({
        authProvider,
        maxRetries: 0,
        enableLogging: false
      });

      await expect(
        noRetryClient.request('urn:agent:test:example', '/api/test')
      ).rejects.toThrow(RetryError);
    }, 10000);
  });

  describe('Error Types', () => {
    test('should have correct error properties', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      const noRetryClient = new A2AClient({
        authProvider,
        maxRetries: 0,
        enableLogging: false
      });

      try {
        await noRetryClient.request('urn:agent:test:example', '/api/test');
      } catch (error) {
        expect(error).toBeInstanceOf(RetryError);
        expect(error.name).toBe('RetryError');
        expect(error.cause).toBeDefined();
        expect(error.timestamp).toBeDefined();
        expect(error.attempts).toBe(1);
      }
    }, 10000);

    test('should have correct timeout error properties', async () => {
      mockFetch.mockImplementation(() => 
        new Promise((resolve) => {
          setTimeout(() => resolve({
            status: 200,
            headers: new Map(),
            json: jest.fn().mockResolvedValue({})
          }), 1000);
        })
      );

      try {
        await client.request('urn:agent:test:example', '/api/test', {
          timeout: 100
        });
      } catch (error) {
        expect(error).toBeInstanceOf(TimeoutError);
        expect(error.name).toBe('TimeoutError');
        expect(error.timeout).toBe(100);
        expect(error.timestamp).toBeDefined();
      }
    });
  });

  describe('URL Building', () => {
    test('should build correct URL from agent URN', async () => {
      const mockResponse = {
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue({ success: true })
      };
      mockFetch.mockResolvedValue(mockResponse);

      await client.request('urn:agent:domain:name@v1.0.0', '/api/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/agents/domain-name/api/test',
        expect.any(Object)
      );
    });

    test('should handle routes with and without leading slash', async () => {
      const mockResponse = {
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue({ success: true })
      };
      mockFetch.mockResolvedValue(mockResponse);

      // Test with leading slash
      await client.request('urn:agent:test:example', '/api/test');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/agents/test-example/api/test',
        expect.any(Object)
      );

      mockFetch.mockClear();

      // Test without leading slash
      await client.request('urn:agent:test:example', 'api/test');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/agents/test-example/api/test',
        expect.any(Object)
      );
    });
  });

  describe('Factory Functions', () => {
    test('createA2AClient should create client with options', () => {
      const client = createA2AClient({
        baseUrl: 'http://custom:8080',
        timeout: 5000
      });

      expect(client).toBeInstanceOf(A2AClient);
      expect(client.baseUrl).toBe('http://custom:8080');
      expect(client.defaultTimeout).toBe(5000);
    });

    test('request function should work as convenience method', async () => {
      const mockResponse = {
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue({ success: true })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await request('urn:agent:test:example', '/api/test', {}, {
        authProvider: new StaticAuthProvider('test-token')
      });

      expect(result.status).toBe(200);
      expect(result.data).toEqual({ success: true });
    });
  });

  describe('Performance', () => {
    test('should complete successful request quickly', async () => {
      const mockResponse = {
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue({ success: true })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const startTime = Date.now();
      await client.request('urn:agent:test:example', '/api/test');
      const duration = Date.now() - startTime;

      // Should complete well under 200ms baseline
      expect(duration).toBeLessThan(200);
    });
  });
});
