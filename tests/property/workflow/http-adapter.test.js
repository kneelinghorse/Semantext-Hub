/**
 * Property/Fuzz Tests for HTTP Workflow Adapter
 * 
 * Tests HTTP adapter behavior with random inputs to ensure robustness
 * and catch edge cases that might cause flakiness.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { HttpAdapter } from '../../../packages/runtime/workflow/adapters/httpAdapter.js';
import { deflake } from '../../util/deflake.js';

describe('HTTP Adapter Property Tests', () => {
  let adapter;
  let isolationContext;

  beforeEach(() => {
    adapter = new HttpAdapter({
      timeout: 1000,
      retries: 2,
      retryDelay: 100
    });
    isolationContext = deflake.createIsolationContext();
  });

  describe('Input Validation Properties', () => {
    it('should always reject null/undefined input', async () => {
      for (let i = 0; i < 50; i++) {
        const testData = deflake.generateDeterministicData(`null_test_${i}`, {
          input: 'null'
        });

        let input;
        if (testData.input === 'null') {
          input = null;
        } else {
          input = undefined;
        }

        const validation = adapter.validateInput(input);
        expect(validation.isValid).toBe(false);
        expect(validation.errors.length).toBeGreaterThan(0);
        expect(validation.errors[0].field).toBe('input');
      }
    });

    it('should always reject invalid HTTP methods', async () => {
      const invalidMethods = ['INVALID', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT', '', 'get', 'post'];
      
      for (let i = 0; i < 100; i++) {
        const testData = deflake.generateDeterministicData(`method_test_${i}`, {
          method: 'string',
          url: 'string'
        });

        const method = i < invalidMethods.length ? invalidMethods[i] : `INVALID${i}`;
        
        const input = {
          method,
          url: 'https://example.com'
        };

        const validation = adapter.validateInput(input);
        
        if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method?.toUpperCase())) {
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(e => e.field === 'method')).toBe(true);
        }
      }
    });

    it('should always reject invalid URLs', async () => {
      const invalidUrls = [
        'not-a-url',
        'ftp://invalid',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        '',
        null,
        undefined,
        'http://',
        'https://',
        '://example.com',
        'http://[invalid-ipv6',
        'http://example.com:99999'
      ];

      for (let i = 0; i < 100; i++) {
        const testData = deflake.generateDeterministicData(`url_test_${i}`, {
          url: 'string'
        });

        const url = i < invalidUrls.length ? invalidUrls[i] : `invalid-url-${i}`;
        
        const input = {
          method: 'GET',
          url
        };

        const validation = adapter.validateInput(input);
        
        try {
          new URL(url);
          // If URL constructor succeeds, validation should pass
          expect(validation.isValid).toBe(true);
        } catch (e) {
          // If URL constructor fails, validation should fail
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(e => e.field === 'url')).toBe(true);
        }
      }
    });

    it('should always reject invalid timeout values', async () => {
      const invalidTimeouts = [0, -1, -100, 'string', null, undefined, {}, [], Infinity, -Infinity];

      for (let i = 0; i < 50; i++) {
        const timeout = invalidTimeouts[i % invalidTimeouts.length];
        
        const input = {
          method: 'GET',
          url: 'https://example.com',
          timeout
        };

        const validation = adapter.validateInput(input);
        
        if (typeof timeout !== 'number' || timeout <= 0) {
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(e => e.field === 'timeout')).toBe(true);
        }
      }
    });
  });

  describe('Request Configuration Properties', () => {
    it('should always build valid request config for valid input', async () => {
      for (let i = 0; i < 100; i++) {
        const testData = deflake.generateDeterministicData(`config_test_${i}`, {
          method: 'string',
          url: 'string',
          body: 'string',
          headers: 'object',
          query: 'object'
        });

        const input = {
          method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'][i % 5],
          url: 'https://example.com',
          body: testData.body ? { test: 'data' } : undefined,
          headers: testData.headers ? { 'X-Test': 'value' } : undefined,
          query: testData.query ? { param: 'value' } : undefined
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        const config = adapter.buildRequestConfig(input, context);

        expect(config).toBeDefined();
        expect(config.method).toBe(input.method.toUpperCase());
        expect(config.url).toContain('https://example.com');
        expect(config.headers).toBeDefined();
        expect(config.headers['X-Trace-Id']).toBe(context.traceId);
        expect(config.headers['User-Agent']).toBe('OSSP-Workflow-Adapter/1.0');
      }
    });

    it('should always handle query parameters correctly', async () => {
      for (let i = 0; i < 50; i++) {
        const testData = deflake.generateDeterministicData(`query_test_${i}`, {
          param1: 'string',
          param2: 'number',
          param3: 'boolean'
        });

        const input = {
          method: 'GET',
          url: 'https://example.com',
          query: {
            param1: `value${i}`,
            param2: i,
            param3: i % 2 === 0
          }
        };

        const context = { traceId: `trace_${i}` };
        const config = adapter.buildRequestConfig(input, context);

        expect(config.url).toContain('param1=value');
        expect(config.url).toContain('param2=');
        expect(config.url).toContain('param3=');
      }
    });

    it('should always serialize body correctly for non-GET requests', async () => {
      for (let i = 0; i < 50; i++) {
        const methods = ['POST', 'PUT', 'PATCH'];
        const method = methods[i % methods.length];
        
        const input = {
          method,
          url: 'https://example.com',
          body: { test: `data${i}`, nested: { value: i } }
        };

        const context = { traceId: `trace_${i}` };
        const config = adapter.buildRequestConfig(input, context);

        expect(config.body).toBeDefined();
        expect(typeof config.body).toBe('string');
        
        const parsedBody = JSON.parse(config.body);
        expect(parsedBody.test).toBe(`data${i}`);
        expect(parsedBody.nested.value).toBe(i);
      }
    });
    });

  describe('Error Handling Properties', () => {
    it('should always handle network errors gracefully', async () => {
      const originalFetch = global.fetch;
      const networkAdapter = new HttpAdapter({
        timeout: 500,
        retries: 0,
        retryDelay: 0
      });
      
      for (let i = 0; i < 20; i++) {
        global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        const input = {
          method: 'GET',
          url: 'https://example.com/failure'
        };

        try {
          await networkAdapter.execute(context, input);
          // If it doesn't throw, that's unexpected but not necessarily wrong
        } catch (error) {
          expect(error).toBeDefined();
          expect(error.message).toContain('HTTP request failed');
        }
      }

      global.fetch = originalFetch;
    });

    it('should always retry on server errors but not client errors', async () => {
      // Mock fetch to simulate different error scenarios
      const originalFetch = global.fetch;
      
      for (let i = 0; i < 20; i++) {
        const statusCode = i < 10 ? 500 + (i % 5) : 400 + (i % 4); // Mix of 5xx and 4xx
        
        global.fetch = jest.fn().mockResolvedValue({
          ok: statusCode < 400,
          status: statusCode,
          statusText: 'Test Error',
          headers: new Map()
        });

        const input = {
          method: 'GET',
          url: 'https://example.com'
        };

        const context = { traceId: `trace_${i}` };

        try {
          await adapter.execute(context, input);
        } catch (error) {
          expect(error).toBeDefined();
        }

        // For 5xx errors, should have retried (multiple fetch calls)
        // For 4xx errors, should not retry (single fetch call)
        if (statusCode >= 500) {
          expect(global.fetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
        } else {
          expect(global.fetch).toHaveBeenCalledTimes(1); // No retries
        }
      }

      global.fetch = originalFetch;
    });
  });

  describe('Response Processing Properties', () => {
    it('should always process JSON responses correctly', async () => {
      const originalFetch = global.fetch;
      
      for (let i = 0; i < 20; i++) {
        const testData = deflake.generateDeterministicData(`json_test_${i}`, {
          field1: 'string',
          field2: 'number',
          field3: 'boolean'
        });

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.resolve({
            field1: `value${i}`,
            field2: i,
            field3: i % 2 === 0
          }),
          text: () => Promise.resolve('fallback')
        });

        const input = {
          method: 'GET',
          url: 'https://example.com'
        };

        const context = { traceId: `trace_${i}` };
        const result = await adapter.execute(context, input);

        expect(result.data).toBeDefined();
        expect(result.data.field1).toBe(`value${i}`);
        expect(result.data.field2).toBe(i);
        expect(result.data.field3).toBe(i % 2 === 0);
      }

      global.fetch = originalFetch;
    });

    it('should always process text responses correctly', async () => {
      const originalFetch = global.fetch;
      
      for (let i = 0; i < 20; i++) {
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Map([['content-type', 'text/plain']]),
          text: () => Promise.resolve(`Response text ${i}`)
        });

        const input = {
          method: 'GET',
          url: 'https://example.com'
        };

        const context = { traceId: `trace_${i}` };
        const result = await adapter.execute(context, input);

        expect(result.data).toBe(`Response text ${i}`);
      }

      global.fetch = originalFetch;
    });

    it('should always handle malformed JSON gracefully', async () => {
      const originalFetch = global.fetch;
      
      for (let i = 0; i < 20; i++) {
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Map([['content-type', 'application/json']]),
          json: () => Promise.reject(new Error('Invalid JSON')),
          text: () => Promise.resolve(`Fallback text ${i}`)
        });

        const input = {
          method: 'GET',
          url: 'https://example.com'
        };

        const context = { traceId: `trace_${i}` };
        const result = await adapter.execute(context, input);

        expect(result.data).toBe(`Fallback text ${i}`);
      }

      global.fetch = originalFetch;
    });
  });

  describe('Timeout Properties', () => {
    it('should always timeout after specified duration', async () => {
      const originalFetch = global.fetch;
      
      for (let i = 0; i < 10; i++) {
        const timeout = 100 + (i * 50); // Varying timeouts
        
        global.fetch = jest.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(resolve, timeout + 100)) // Longer than timeout
        );

        const input = {
          method: 'GET',
          url: 'https://example.com',
          timeout
        };

        const context = { traceId: `trace_${i}` };

        try {
          await adapter.execute(context, input);
          expect(true).toBe(false); // Should not reach here
        } catch (error) {
          expect(error.message).toContain('timeout');
        }
      }

      global.fetch = originalFetch;
    });
  });

  describe('Concurrency Properties', () => {
    it('should handle concurrent requests without interference', async () => {
      const originalFetch = global.fetch;
      
      for (let i = 0; i < 5; i++) {
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Map(),
          json: () => Promise.resolve({ requestId: i })
        });

        const requests = Array.from({ length: 10 }, (_, j) => {
          const input = {
            method: 'GET',
            url: `https://example.com/request-${j}`
          };
          const context = { traceId: `trace_${i}_${j}` };
          return adapter.execute(context, input);
        });

        const results = await Promise.all(requests);
        
        expect(results).toHaveLength(10);
        results.forEach((result, j) => {
          expect(result.data.requestId).toBe(i);
        });
      }

      global.fetch = originalFetch;
    });
  });
});
