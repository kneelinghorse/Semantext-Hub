/**
 * Tests for HTTP adapter
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import HttpAdapter from '../../packages/runtime/workflow/adapters/httpAdapter.js';
import { ValidationError, AdapterExecutionError } from '../../packages/runtime/workflow/types.js';

// Mock fetch
global.fetch = jest.fn();

describe('HttpAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new HttpAdapter();
    jest.clearAllMocks();
  });

  describe('validateInput', () => {
    it('should validate valid input', () => {
      const input = {
        method: 'GET',
        url: 'https://example.com'
      };
      const result = adapter.validateInput(input);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing input', () => {
      const result = adapter.validateInput(null);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Input is required');
    });

    it('should reject missing method', () => {
      const input = { url: 'https://example.com' };
      const result = adapter.validateInput(input);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('HTTP method is required');
    });

    it('should reject invalid method', () => {
      const input = {
        method: 'INVALID',
        url: 'https://example.com'
      };
      const result = adapter.validateInput(input);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Invalid HTTP method');
    });

    it('should reject missing URL', () => {
      const input = { method: 'GET' };
      const result = adapter.validateInput(input);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('URL is required');
    });

    it('should reject invalid URL', () => {
      const input = {
        method: 'GET',
        url: 'not-a-url'
      };
      const result = adapter.validateInput(input);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Invalid URL format');
    });

    it('should reject invalid body type', () => {
      const input = {
        method: 'POST',
        url: 'https://example.com',
        body: 123
      };
      const result = adapter.validateInput(input);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Body must be string or object');
    });

    it('should reject invalid timeout', () => {
      const input = {
        method: 'GET',
        url: 'https://example.com',
        timeout: -1
      };
      const result = adapter.validateInput(input);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Timeout must be a positive number');
    });
  });

  describe('execute', () => {
    const context = { traceId: 'test-trace' };

    it('should execute successful request', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue({ success: true })
      };

      fetch.mockResolvedValue(mockResponse);

      const input = {
        method: 'GET',
        url: 'https://example.com'
      };

      const result = await adapter.execute(context, input);

      expect(result.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ success: true });
      expect(fetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'X-Trace-Id': 'test-trace'
          })
        })
      );
    });

    it('should handle POST request with body', async () => {
      const mockResponse = {
        ok: true,
        status: 201,
        statusText: 'Created',
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue({ id: 123 })
      };

      fetch.mockResolvedValue(mockResponse);

      const input = {
        method: 'POST',
        url: 'https://example.com',
        body: { name: 'test' }
      };

      const result = await adapter.execute(context, input);

      expect(result.status).toBe(201);
      expect(fetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'test' })
        })
      );
    });

    it('should handle query parameters', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue({})
      };

      fetch.mockResolvedValue(mockResponse);

      const input = {
        method: 'GET',
        url: 'https://example.com',
        query: { page: 1, limit: 10 }
      };

      await adapter.execute(context, input);

      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/?page=1&limit=10',
        expect.any(Object)
      );
    });

    it('should throw validation error for invalid input', async () => {
      const input = { method: 'INVALID' };

      await expect(adapter.execute(context, input)).rejects.toThrow(AdapterExecutionError);
    });

    it('should handle network errors', async () => {
      fetch.mockRejectedValue(new Error('Network error'));

      const input = {
        method: 'GET',
        url: 'https://example.com'
      };

      await expect(adapter.execute(context, input)).rejects.toThrow(AdapterExecutionError);
    });

    it('should handle timeout', async () => {
      const adapter = new HttpAdapter({ timeout: 100 });
      
      fetch.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 200))
      );

      const input = {
        method: 'GET',
        url: 'https://example.com'
      };

      await expect(adapter.execute(context, input)).rejects.toThrow(AdapterExecutionError);
    });

    it('should retry on server errors', async () => {
      const adapter = new HttpAdapter({ retries: 2, retryDelay: 10 });
      
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map()
      };

      fetch
        .mockResolvedValueOnce(mockResponse)
        .mockResolvedValueOnce(mockResponse)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Map([['content-type', 'application/json']]),
          json: jest.fn().mockResolvedValue({ success: true })
        });

      const input = {
        method: 'GET',
        url: 'https://example.com'
      };

      const result = await adapter.execute(context, input);

      expect(result.status).toBe(200);
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on client errors', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Map()
      };

      fetch.mockResolvedValue(mockResponse);

      const input = {
        method: 'GET',
        url: 'https://example.com'
      };

      await expect(adapter.execute(context, input)).rejects.toThrow(AdapterExecutionError);
      expect(fetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });
  });

  describe('getMetadata', () => {
    it('should return adapter metadata', () => {
      const metadata = adapter.getMetadata();
      expect(metadata).toEqual({
        kind: 'http',
        version: '1.0.0',
        description: 'HTTP adapter for workflow execution',
        config: {
          baseUrl: '',
          timeout: 30000,
          retries: 3
        }
      });
    });

    it('should return metadata with custom config', () => {
      const adapter = new HttpAdapter({
        baseUrl: 'https://api.example.com',
        timeout: 5000,
        retries: 5
      });
      
      const metadata = adapter.getMetadata();
      expect(metadata.config).toEqual({
        baseUrl: 'https://api.example.com',
        timeout: 5000,
        retries: 5
      });
    });
  });
});
