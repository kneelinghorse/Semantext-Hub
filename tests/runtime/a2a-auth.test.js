/**
 * A2A Auth Tests
 * 
 * Test suite for A2A authentication module including:
 * - Auth provider implementations
 * - Header creation
 * - Token validation
 * - Delegation support
 */

import { jest } from '@jest/globals';
import {
  DefaultAuthProvider,
  StaticAuthProvider,
  NoAuthProvider,
  createAuthHeaders,
  validateAuthResponse,
  createAuthProvider,
  extractDelegationUrn
} from '../../packages/runtime/runtime/a2a-auth.js';
import { AuthError } from '../../packages/runtime/runtime/a2a-types.js';

describe('A2A Auth', () => {
  describe('DefaultAuthProvider', () => {
    let originalEnv;

    beforeEach(() => {
      originalEnv = process.env.A2A_TOKEN;
    });

    afterEach(() => {
      process.env.A2A_TOKEN = originalEnv;
    });

    test('should get token from environment variable', async () => {
      process.env.A2A_TOKEN = 'test-token-123';
      const provider = new DefaultAuthProvider();

      const token = await provider.getToken();
      expect(token).toBe('test-token-123');
    });

    test('should cache token after first load', async () => {
      process.env.A2A_TOKEN = 'test-token-123';
      const provider = new DefaultAuthProvider();

      const token1 = await provider.getToken();
      const token2 = await provider.getToken();
      
      expect(token1).toBe(token2);
      expect(token1).toBe('test-token-123');
    });

    test('should throw AuthError when token not found', async () => {
      delete process.env.A2A_TOKEN;
      const provider = new DefaultAuthProvider();

      await expect(provider.getToken()).rejects.toThrow(AuthError);
      await expect(provider.getToken()).rejects.toThrow('No token found in environment variable A2A_TOKEN');
    });

    test('should trim whitespace from token', async () => {
      process.env.A2A_TOKEN = '  test-token-123  ';
      const provider = new DefaultAuthProvider();

      const token = await provider.getToken();
      expect(token).toBe('test-token-123');
    });

    test('should use custom environment variable name', async () => {
      process.env.CUSTOM_TOKEN = 'custom-token-456';
      const provider = new DefaultAuthProvider({ tokenEnvVar: 'CUSTOM_TOKEN' });

      const token = await provider.getToken();
      expect(token).toBe('custom-token-456');
    });

    test('should check if token is available', () => {
      process.env.A2A_TOKEN = 'test-token-123';
      const provider = new DefaultAuthProvider();

      expect(provider.hasToken()).toBe(true);
    });

    test('should return false when no token available', () => {
      delete process.env.A2A_TOKEN;
      const provider = new DefaultAuthProvider();

      expect(provider.hasToken()).toBe(false);
    });

    test('should clear cached token', async () => {
      process.env.A2A_TOKEN = 'test-token-123';
      const provider = new DefaultAuthProvider();

      await provider.getToken();
      expect(provider.hasToken()).toBe(true);

      provider.clearToken();
      expect(provider.hasToken()).toBe(false);
    });
  });

  describe('StaticAuthProvider', () => {
    test('should return provided token', async () => {
      const provider = new StaticAuthProvider('static-token-789');

      const token = await provider.getToken();
      expect(token).toBe('static-token-789');
    });

    test('should throw AuthError when no token provided', async () => {
      const provider = new StaticAuthProvider('');

      await expect(provider.getToken()).rejects.toThrow(AuthError);
      await expect(provider.getToken()).rejects.toThrow('No token provided to StaticAuthProvider');
    });

    test('should check if token is available', () => {
      const provider = new StaticAuthProvider('static-token-789');
      expect(provider.hasToken()).toBe(true);

      const emptyProvider = new StaticAuthProvider('');
      expect(emptyProvider.hasToken()).toBe(false);
    });
  });

  describe('NoAuthProvider', () => {
    test('should return empty token', async () => {
      const provider = new NoAuthProvider();

      const token = await provider.getToken();
      expect(token).toBe('');
    });

    test('should always return false for hasToken', () => {
      const provider = new NoAuthProvider();

      expect(provider.hasToken()).toBe(false);
    });
  });

  describe('createAuthHeaders', () => {
    test('should create headers with Bearer token', async () => {
      const provider = new StaticAuthProvider('test-token-123');

      const headers = await createAuthHeaders(provider);

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'User-Agent': 'OSSP-AGI-A2A-Client/1.0.0',
        'Authorization': 'Bearer test-token-123'
      });
    });

    test('should create headers without token when not available', async () => {
      const provider = new NoAuthProvider();

      const headers = await createAuthHeaders(provider);

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'User-Agent': 'OSSP-AGI-A2A-Client/1.0.0'
      });
      expect(headers.Authorization).toBeUndefined();
    });

    test('should include delegation header when provided', async () => {
      const provider = new StaticAuthProvider('test-token-123');

      const headers = await createAuthHeaders(provider, {
        delegationUrn: 'urn:agent:delegator:agent'
      });

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'User-Agent': 'OSSP-AGI-A2A-Client/1.0.0',
        'Authorization': 'Bearer test-token-123',
        'x-agent-delegation': 'urn:agent:delegator:agent'
      });
    });

    test('should include additional headers', async () => {
      const provider = new StaticAuthProvider('test-token-123');

      const headers = await createAuthHeaders(provider, {
        additionalHeaders: {
          'X-Custom-Header': 'custom-value',
          'Accept': 'application/json'
        }
      });

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'User-Agent': 'OSSP-AGI-A2A-Client/1.0.0',
        'Authorization': 'Bearer test-token-123',
        'X-Custom-Header': 'custom-value',
        'Accept': 'application/json'
      });
    });

    test('should handle token retrieval failure gracefully', async () => {
      const provider = new StaticAuthProvider('');

      const headers = await createAuthHeaders(provider);

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'User-Agent': 'OSSP-AGI-A2A-Client/1.0.0'
      });
      expect(headers.Authorization).toBeUndefined();
    });
  });

  describe('validateAuthResponse', () => {
    let consoleErrorSpy;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    test('should throw AuthError for 401 status', () => {
      const mockResponse = { status: 401 };
      const reqId = 'test-req-123';

      expect(() => {
        validateAuthResponse(mockResponse, reqId);
      }).toThrow(AuthError);

      expect(() => {
        validateAuthResponse(mockResponse, reqId);
      }).toThrow('Authentication failed: Unauthorized');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[A2A Auth]',
        expect.objectContaining({
          reqId: 'test-req-123',
          operation: 'auth_failed',
          status: 401,
          reason: 'Unauthorized - invalid or missing token'
        })
      );
    });

    test('should throw AuthError for 403 status', () => {
      const mockResponse = { status: 403 };
      const reqId = 'test-req-456';

      expect(() => {
        validateAuthResponse(mockResponse, reqId);
      }).toThrow(AuthError);

      expect(() => {
        validateAuthResponse(mockResponse, reqId);
      }).toThrow('Authentication failed: Forbidden');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[A2A Auth]',
        expect.objectContaining({
          reqId: 'test-req-456',
          operation: 'auth_failed',
          status: 403,
          reason: 'Forbidden - insufficient permissions'
        })
      );
    });

    test('should not throw for other status codes', () => {
      const mockResponse = { status: 200 };
      const reqId = 'test-req-789';

      expect(() => {
        validateAuthResponse(mockResponse, reqId);
      }).not.toThrow();

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('createAuthProvider', () => {
    test('should create DefaultAuthProvider by default', () => {
      const provider = createAuthProvider();
      expect(provider).toBeInstanceOf(DefaultAuthProvider);
    });

    test('should create DefaultAuthProvider with type "default"', () => {
      const provider = createAuthProvider({ type: 'default' });
      expect(provider).toBeInstanceOf(DefaultAuthProvider);
    });

    test('should create StaticAuthProvider with type "static"', () => {
      const provider = createAuthProvider({ 
        type: 'static', 
        token: 'static-token-123' 
      });
      expect(provider).toBeInstanceOf(StaticAuthProvider);
    });

    test('should create NoAuthProvider with type "none"', () => {
      const provider = createAuthProvider({ type: 'none' });
      expect(provider).toBeInstanceOf(NoAuthProvider);
    });

    test('should throw AuthError for static provider without token', () => {
      expect(() => {
        createAuthProvider({ type: 'static' });
      }).toThrow(AuthError);

      expect(() => {
        createAuthProvider({ type: 'static' });
      }).toThrow('Static auth provider requires token');
    });

    test('should pass custom tokenEnvVar to DefaultAuthProvider', () => {
      const provider = createAuthProvider({ 
        type: 'default',
        tokenEnvVar: 'CUSTOM_TOKEN' 
      });
      expect(provider).toBeInstanceOf(DefaultAuthProvider);
      expect(provider.tokenEnvVar).toBe('CUSTOM_TOKEN');
    });
  });

  describe('extractDelegationUrn', () => {
    test('should return delegation chain when present', () => {
      const context = {
        delegationChain: 'urn:agent:a:agent -> urn:agent:b:agent',
        currentAgentUrn: 'urn:agent:c:agent'
      };

      const result = extractDelegationUrn(context);
      expect(result).toBe('urn:agent:a:agent -> urn:agent:b:agent -> urn:agent:c:agent');
    });

    test('should return current agent URN when no delegation chain', () => {
      const context = {
        currentAgentUrn: 'urn:agent:current:agent'
      };

      const result = extractDelegationUrn(context);
      expect(result).toBe('urn:agent:current:agent');
    });

    test('should return null when no context provided', () => {
      const result = extractDelegationUrn();
      expect(result).toBeNull();
    });

    test('should return null when no relevant context', () => {
      const context = {
        someOtherField: 'value'
      };

      const result = extractDelegationUrn(context);
      expect(result).toBeNull();
    });

    test('should handle empty context object', () => {
      const result = extractDelegationUrn({});
      expect(result).toBeNull();
    });
  });
});
