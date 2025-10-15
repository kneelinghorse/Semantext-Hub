/**
 * Error Handler Tests
 * 
 * Tests for the centralized error handling system.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  ErrorHandler,
  RuntimeError,
  A2AError,
  MCPError,
  AuthError,
  TimeoutError,
  ValidationError,
  NetworkError,
  CircuitBreakerError,
  RetryError,
  RegistryError,
  DiscoveryError,
  ErrorMappers,
  ErrorContext,
  createErrorHandler,
  handleError,
  defaultErrorHandler
} from '../../packages/runtime/runtime/error-handler.js';

describe('Error Handler', () => {
  let errorHandler;

  beforeEach(() => {
    errorHandler = createErrorHandler({
      enableLogging: false,
      enableMetrics: true
    });
  });

  afterEach(() => {
    errorHandler.clearStats();
  });

  describe('Error Types', () => {
    test('should create RuntimeError with proper structure', () => {
      const error = new RuntimeError('Test error', null, { test: true });
      
      expect(error.name).toBe('RuntimeError');
      expect(error.message).toBe('Test error');
      expect(error.context).toEqual({ test: true });
      expect(error.timestamp).toBeDefined();
      expect(error.errorId).toBeDefined();
      expect(error.cause).toBeNull();
    });

    test('should create A2AError with component context', () => {
      const error = new A2AError('A2A operation failed', null, { operation: 'request' });
      
      expect(error.name).toBe('A2AError');
      expect(error.message).toBe('A2A operation failed');
      expect(error.context.component).toBe('A2A');
      expect(error.context.operation).toBe('request');
    });

    test('should create MCPError with component context', () => {
      const error = new MCPError('MCP operation failed', null, { operation: 'execute' });
      
      expect(error.name).toBe('MCPError');
      expect(error.message).toBe('MCP operation failed');
      expect(error.context.component).toBe('MCP');
      expect(error.context.operation).toBe('execute');
    });

    test('should create AuthError with auth type', () => {
      const error = new AuthError('Authentication failed', null, { reason: 'invalid_token' });
      
      expect(error.name).toBe('AuthError');
      expect(error.message).toBe('Authentication failed');
      expect(error.context.type).toBe('auth');
      expect(error.context.reason).toBe('invalid_token');
    });

    test('should create TimeoutError with timeout context', () => {
      const error = new TimeoutError('Request timed out', null, 5000, { operation: 'fetch' });
      
      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('Request timed out');
      expect(error.context.type).toBe('timeout');
      expect(error.context.timeout).toBe(5000);
      expect(error.context.operation).toBe('fetch');
    });

    test('should create ValidationError with field context', () => {
      const error = new ValidationError('Invalid input', null, 'email', { value: 'invalid' });
      
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Invalid input');
      expect(error.context.type).toBe('validation');
      expect(error.context.field).toBe('email');
      expect(error.context.value).toBe('invalid');
    });

    test('should create NetworkError with network type', () => {
      const error = new NetworkError('Network connection failed', null, { endpoint: 'api.example.com' });
      
      expect(error.name).toBe('NetworkError');
      expect(error.message).toBe('Network connection failed');
      expect(error.context.type).toBe('network');
      expect(error.context.endpoint).toBe('api.example.com');
    });

    test('should create CircuitBreakerError with state context', () => {
      const error = new CircuitBreakerError('Circuit breaker is open', null, 'open', { service: 'api' });
      
      expect(error.name).toBe('CircuitBreakerError');
      expect(error.message).toBe('Circuit breaker is open');
      expect(error.context.type).toBe('circuit_breaker');
      expect(error.context.state).toBe('open');
      expect(error.context.service).toBe('api');
    });

    test('should create RetryError with attempts context', () => {
      const error = new RetryError('All retries exhausted', null, 3, { operation: 'request' });
      
      expect(error.name).toBe('RetryError');
      expect(error.message).toBe('All retries exhausted');
      expect(error.context.type).toBe('retry');
      expect(error.context.attempts).toBe(3);
      expect(error.context.operation).toBe('request');
    });

    test('should create RegistryError with component context', () => {
      const error = new RegistryError('Registry operation failed', null, { operation: 'register' });
      
      expect(error.name).toBe('RegistryError');
      expect(error.message).toBe('Registry operation failed');
      expect(error.context.component).toBe('Registry');
      expect(error.context.operation).toBe('register');
    });

    test('should create DiscoveryError with component context', () => {
      const error = new DiscoveryError('Discovery operation failed', null, { operation: 'discover' });
      
      expect(error.name).toBe('DiscoveryError');
      expect(error.message).toBe('Discovery operation failed');
      expect(error.context.component).toBe('Discovery');
      expect(error.context.operation).toBe('discover');
    });
  });

  describe('Error Handler', () => {
    test('should handle RuntimeError and return as-is', () => {
      const originalError = new RuntimeError('Test error', null, { test: true });
      const handledError = errorHandler.handleError(originalError);
      
      expect(handledError).toBe(originalError);
      expect(handledError.name).toBe('RuntimeError');
      expect(handledError.message).toBe('Test error');
    });

    test('should map generic Error to RuntimeError', () => {
      const originalError = new Error('Generic error');
      const handledError = errorHandler.handleError(originalError);
      
      expect(handledError).toBeInstanceOf(RuntimeError);
      expect(handledError.message).toBe('Generic error');
      expect(handledError.cause).toBe(originalError);
    });

    test('should map string error to RuntimeError', () => {
      const handledError = errorHandler.handleError('String error', { test: true });
      
      expect(handledError).toBeInstanceOf(RuntimeError);
      expect(handledError.message).toBe('String error');
      expect(handledError.context.test).toBe(true);
    });

    test('should map unknown error to RuntimeError', () => {
      const unknownError = { message: 'Unknown error', code: 500 };
      const handledError = errorHandler.handleError(unknownError);
      
      expect(handledError).toBeInstanceOf(RuntimeError);
      expect(handledError.message).toBe('Unknown error');
      expect(handledError.cause).toBe(unknownError);
    });

    test('should map AbortError to TimeoutError', () => {
      const abortError = new Error('Request was aborted');
      abortError.name = 'AbortError';
      
      const handledError = errorHandler.handleError(abortError);
      
      expect(handledError).toBeInstanceOf(TimeoutError);
      expect(handledError.message).toBe('Request was aborted');
    });

    test('should map fetch TypeError to NetworkError', () => {
      const fetchError = new TypeError('fetch failed');
      fetchError.message = 'fetch failed';
      
      const handledError = errorHandler.handleError(fetchError);
      
      expect(handledError).toBeInstanceOf(NetworkError);
      expect(handledError.message).toBe('fetch failed');
    });

    test('should map auth-related errors to AuthError', () => {
      const authError = new Error('unauthorized access');
      const handledError = errorHandler.handleError(authError);
      
      expect(handledError).toBeInstanceOf(AuthError);
      expect(handledError.message).toBe('unauthorized access');
    });

    test('should map validation-related errors to ValidationError', () => {
      const validationError = new Error('invalid input provided');
      const handledError = errorHandler.handleError(validationError);
      
      expect(handledError).toBeInstanceOf(ValidationError);
      expect(handledError.message).toBe('invalid input provided');
    });

    test('should map MCP-related errors to MCPError', () => {
      const mcpError = new Error('MCP operation failed');
      const handledError = errorHandler.handleError(mcpError);
      
      expect(handledError).toBeInstanceOf(MCPError);
      expect(handledError.message).toBe('MCP operation failed');
    });

    test('should map A2A-related errors to A2AError', () => {
      const a2aError = new Error('A2A request failed');
      const handledError = errorHandler.handleError(a2aError);
      
      expect(handledError).toBeInstanceOf(A2AError);
      expect(handledError.message).toBe('A2A request failed');
    });

    test('should map registry-related errors to RegistryError', () => {
      const registryError = new Error('registry operation failed');
      const handledError = errorHandler.handleError(registryError);
      
      expect(handledError).toBeInstanceOf(RegistryError);
      expect(handledError.message).toBe('registry operation failed');
    });

    test('should map discovery-related errors to DiscoveryError', () => {
      const discoveryError = new Error('discovery operation failed');
      const handledError = errorHandler.handleError(discoveryError);
      
      expect(handledError).toBeInstanceOf(DiscoveryError);
      expect(handledError.message).toBe('discovery operation failed');
    });
  });

  describe('Error Metrics', () => {
    test('should track error counts', () => {
      errorHandler.handleError(new RuntimeError('Error 1'));
      errorHandler.handleError(new RuntimeError('Error 2'));
      errorHandler.handleError(new AuthError('Auth error'));
      
      const stats = errorHandler.getStats();
      
      expect(stats.totalErrors).toBe(3);
      expect(stats.errorTypes.RuntimeError).toBe(2);
      expect(stats.errorTypes.AuthError).toBe(1);
    });

    test('should maintain error history', () => {
      errorHandler.handleError(new RuntimeError('Error 1'));
      errorHandler.handleError(new RuntimeError('Error 2'));
      
      const stats = errorHandler.getStats();
      
      expect(stats.historySize).toBe(2);
      expect(stats.recentErrors).toHaveLength(2);
      expect(stats.recentErrors[0].type).toBe('RuntimeError');
      expect(stats.recentErrors[1].type).toBe('RuntimeError');
    });

    test('should clear stats', () => {
      errorHandler.handleError(new RuntimeError('Error 1'));
      errorHandler.handleError(new RuntimeError('Error 2'));
      
      let stats = errorHandler.getStats();
      expect(stats.totalErrors).toBe(2);
      
      errorHandler.clearStats();
      
      stats = errorHandler.getStats();
      expect(stats.totalErrors).toBe(0);
      expect(stats.historySize).toBe(0);
    });
  });

  describe('Error Classification', () => {
    test('should identify retryable errors', () => {
      const retryableErrors = [
        new NetworkError('Network error'),
        new TimeoutError('Timeout error'),
        new MCPError('MCP error'),
        new A2AError('A2A error'),
        new RegistryError('Registry error'),
        new DiscoveryError('Discovery error')
      ];

      retryableErrors.forEach(error => {
        expect(errorHandler.isRetryable(error)).toBe(true);
      });
    });

    test('should identify non-retryable errors', () => {
      const nonRetryableErrors = [
        new AuthError('Auth error'),
        new ValidationError('Validation error'),
        new CircuitBreakerError('Circuit breaker error')
      ];

      nonRetryableErrors.forEach(error => {
        expect(errorHandler.isRetryable(error)).toBe(false);
      });
    });

    test('should identify fatal errors', () => {
      const fatalErrors = [
        new AuthError('Auth error'),
        new ValidationError('Validation error'),
        new CircuitBreakerError('Circuit breaker error')
      ];

      fatalErrors.forEach(error => {
        expect(errorHandler.isFatal(error)).toBe(true);
      });
    });

    test('should identify non-fatal errors', () => {
      const nonFatalErrors = [
        new NetworkError('Network error'),
        new TimeoutError('Timeout error'),
        new MCPError('MCP error'),
        new A2AError('A2A error'),
        new RegistryError('Registry error'),
        new DiscoveryError('Discovery error')
      ];

      nonFatalErrors.forEach(error => {
        expect(errorHandler.isFatal(error)).toBe(false);
      });
    });
  });

  describe('Error Mappers', () => {
    test('should map HTTP status to error type', () => {
      const error401 = ErrorMappers.fromHttpStatus(401, 'Unauthorized', { endpoint: 'api' });
      expect(error401).toBeInstanceOf(AuthError);
      expect(error401.context.status).toBe(401);

      const error400 = ErrorMappers.fromHttpStatus(400, 'Bad Request', { endpoint: 'api' });
      expect(error400).toBeInstanceOf(ValidationError);
      expect(error400.context.status).toBe(400);

      const error500 = ErrorMappers.fromHttpStatus(500, 'Internal Server Error', { endpoint: 'api' });
      expect(error500).toBeInstanceOf(NetworkError);
      expect(error500.context.status).toBe(500);
    });

    test('should map MCP error to typed error', () => {
      const mcpError = { message: 'Invalid request', code: -32600 };
      const error = ErrorMappers.fromMCPError(mcpError, { operation: 'call' });
      
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.context.mcpCode).toBe(-32600);
      expect(error.context.operation).toBe('call');
    });

    test('should map fetch error to typed error', () => {
      const fetchError = new Error('fetch failed');
      fetchError.name = 'AbortError';
      
      const error = ErrorMappers.fromFetchError(fetchError, { url: 'https://api.example.com' });
      
      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.context.url).toBe('https://api.example.com');
    });
  });

  describe('Error Context', () => {
    test('should create request context', () => {
      const context = ErrorContext.createRequestContext('req-123', 'POST', '/api/test', { userId: 'user-456' });
      
      expect(context.requestId).toBe('req-123');
      expect(context.method).toBe('POST');
      expect(context.url).toBe('/api/test');
      expect(context.userId).toBe('user-456');
      expect(context.timestamp).toBeDefined();
    });

    test('should create operation context', () => {
      const context = ErrorContext.createOperationContext('register', 'Registry', { agentId: 'agent-789' });
      
      expect(context.operation).toBe('register');
      expect(context.component).toBe('Registry');
      expect(context.agentId).toBe('agent-789');
      expect(context.timestamp).toBeDefined();
    });

    test('should create agent context', () => {
      const context = ErrorContext.createAgentContext('urn:agent:ai:ml-agent@1.0.0', 'execute', { tool: 'inference' });
      
      expect(context.agentUrn).toBe('urn:agent:ai:ml-agent@1.0.0');
      expect(context.operation).toBe('execute');
      expect(context.tool).toBe('inference');
      expect(context.timestamp).toBeDefined();
    });
  });

  describe('Convenience Functions', () => {
    test('should handle error with convenience function', () => {
      const error = new Error('Test error');
      const handledError = handleError(error, { test: true });
      
      expect(handledError).toBeInstanceOf(RuntimeError);
      expect(handledError.message).toBe('Test error');
      expect(handledError.context.test).toBe(true);
    });

    test('should use default error handler', () => {
      const error = new Error('Test error');
      const handledError = defaultErrorHandler.handleError(error);
      
      expect(handledError).toBeInstanceOf(RuntimeError);
      expect(handledError.message).toBe('Test error');
    });
  });

  describe('Error Details', () => {
    test('should get error details', () => {
      const error = new RuntimeError('Test error', null, { test: true });
      const details = error.getDetails();
      
      expect(details.name).toBe('RuntimeError');
      expect(details.message).toBe('Test error');
      expect(details.context).toEqual({ test: true });
      expect(details.errorId).toBeDefined();
      expect(details.timestamp).toBeDefined();
    });

    test('should convert error to JSON', () => {
      const error = new RuntimeError('Test error', null, { test: true });
      const json = error.toJSON();
      
      expect(json.name).toBe('RuntimeError');
      expect(json.message).toBe('Test error');
      expect(json.context).toEqual({ test: true });
      expect(json.errorId).toBeDefined();
      expect(json.timestamp).toBeDefined();
    });
  });
});
