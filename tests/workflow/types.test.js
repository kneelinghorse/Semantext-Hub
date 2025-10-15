/**
 * Tests for workflow types and base classes
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  WorkflowAdapter,
  HttpAdapterConfig,
  EventAdapterConfig,
  ToolAdapterConfig,
  WorkflowContext,
  WorkflowResult,
  ValidationError,
  AdapterExecutionError,
  AdapterRegistry
} from '../../packages/runtime/workflow/types.js';

describe('WorkflowAdapter', () => {
  class TestAdapter extends WorkflowAdapter {
    async execute(context, input) {
      return { result: 'test' };
    }
  }

  it('should create adapter instance', () => {
    const adapter = new TestAdapter();
    expect(adapter).toBeInstanceOf(WorkflowAdapter);
  });

  it('should throw error for unimplemented execute', async () => {
    const adapter = new WorkflowAdapter();
    await expect(adapter.execute({}, {})).rejects.toThrow('execute() must be implemented by subclass');
  });

  it('should have default validateInput', () => {
    const adapter = new WorkflowAdapter();
    const result = adapter.validateInput({});
    expect(result).toEqual({ isValid: true, errors: [] });
  });

  it('should have default getMetadata', () => {
    const adapter = new WorkflowAdapter();
    const metadata = adapter.getMetadata();
    expect(metadata).toEqual({
      kind: 'unknown',
      version: '1.0.0',
      description: 'Base workflow adapter'
    });
  });
});

describe('HttpAdapterConfig', () => {
  it('should create with default values', () => {
    const config = new HttpAdapterConfig();
    expect(config.baseUrl).toBe('');
    expect(config.timeout).toBe(30000);
    expect(config.headers).toEqual({});
    expect(config.retries).toBe(3);
    expect(config.retryDelay).toBe(1000);
  });

  it('should create with custom values', () => {
    const config = new HttpAdapterConfig({
      baseUrl: 'https://api.example.com',
      timeout: 5000,
      headers: { 'X-API-Key': 'test' },
      retries: 5,
      retryDelay: 2000
    });
    expect(config.baseUrl).toBe('https://api.example.com');
    expect(config.timeout).toBe(5000);
    expect(config.headers).toEqual({ 'X-API-Key': 'test' });
    expect(config.retries).toBe(5);
    expect(config.retryDelay).toBe(2000);
  });
});

describe('EventAdapterConfig', () => {
  it('should create with default values', () => {
    const config = new EventAdapterConfig();
    expect(config.eventBus).toBe('default');
    expect(config.routingKey).toBe('');
    expect(config.persistent).toBe(false);
    expect(config.priority).toBe(0);
  });

  it('should create with custom values', () => {
    const config = new EventAdapterConfig({
      eventBus: 'production',
      routingKey: 'workflow.events',
      persistent: true,
      priority: 8
    });
    expect(config.eventBus).toBe('production');
    expect(config.routingKey).toBe('workflow.events');
    expect(config.persistent).toBe(true);
    expect(config.priority).toBe(8);
  });
});

describe('ToolAdapterConfig', () => {
  it('should create with default values', () => {
    const config = new ToolAdapterConfig();
    expect(config.toolRegistry).toBe(null);
    expect(config.timeout).toBe(30000);
    expect(config.maxRetries).toBe(3);
  });

  it('should create with custom values', () => {
    const mockRegistry = {};
    const config = new ToolAdapterConfig({
      toolRegistry: mockRegistry,
      timeout: 10000,
      maxRetries: 5
    });
    expect(config.toolRegistry).toBe(mockRegistry);
    expect(config.timeout).toBe(10000);
    expect(config.maxRetries).toBe(5);
  });
});

describe('WorkflowContext', () => {
  it('should create with default values', () => {
    const context = new WorkflowContext();
    expect(context.traceId).toMatch(/^trace_\d+_[a-z0-9]+$/);
    expect(context.sessionId).toBe(null);
    expect(context.userId).toBe(null);
    expect(context.metadata).toEqual({});
    expect(typeof context.startTime).toBe('number');
  });

  it('should create with custom values', () => {
    const context = new WorkflowContext({
      traceId: 'custom-trace',
      sessionId: 'session-123',
      userId: 'user-456',
      metadata: { test: true }
    });
    expect(context.traceId).toBe('custom-trace');
    expect(context.sessionId).toBe('session-123');
    expect(context.userId).toBe('user-456');
    expect(context.metadata).toEqual({ test: true });
  });

  it('should calculate elapsed time', () => {
    const context = new WorkflowContext();
    const elapsed = context.getElapsedTime();
    expect(typeof elapsed).toBe('number');
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });
});

describe('WorkflowResult', () => {
  it('should create with default values', () => {
    const result = new WorkflowResult();
    expect(result.success).toBe(false);
    expect(result.data).toBe(null);
    expect(result.error).toBe(null);
    expect(result.metadata).toEqual({});
    expect(result.traceId).toBe(null);
    expect(result.duration).toBe(0);
  });

  it('should create with custom values', () => {
    const result = new WorkflowResult({
      success: true,
      data: { test: 'data' },
      error: 'test error',
      metadata: { key: 'value' },
      traceId: 'trace-123',
      duration: 1000
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ test: 'data' });
    expect(result.error).toBe('test error');
    expect(result.metadata).toEqual({ key: 'value' });
    expect(result.traceId).toBe('trace-123');
    expect(result.duration).toBe(1000);
  });

  it('should create success result', () => {
    const result = WorkflowResult.success({ test: 'data' }, { key: 'value' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ test: 'data' });
    expect(result.metadata).toEqual({ key: 'value' });
    expect(result.error).toBe(null);
  });

  it('should create error result', () => {
    const error = new Error('test error');
    const result = WorkflowResult.error(error, { key: 'value' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('test error');
    expect(result.metadata).toEqual({ key: 'value' });
    expect(result.data).toBe(null);
  });
});

describe('ValidationError', () => {
  it('should create with message only', () => {
    const error = new ValidationError('test error');
    expect(error.message).toBe('test error');
    expect(error.name).toBe('ValidationError');
    expect(error.field).toBe(null);
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  it('should create with field and code', () => {
    const error = new ValidationError('test error', 'testField', 'CUSTOM_CODE');
    expect(error.message).toBe('test error');
    expect(error.field).toBe('testField');
    expect(error.code).toBe('CUSTOM_CODE');
  });
});

describe('AdapterExecutionError', () => {
  it('should create with message only', () => {
    const error = new AdapterExecutionError('test error');
    expect(error.message).toBe('test error');
    expect(error.name).toBe('AdapterExecutionError');
    expect(error.adapterKind).toBe('unknown');
    expect(error.originalError).toBe(null);
  });

  it('should create with adapter kind and original error', () => {
    const originalError = new Error('original');
    const error = new AdapterExecutionError('test error', 'http', originalError);
    expect(error.message).toBe('test error');
    expect(error.adapterKind).toBe('http');
    expect(error.originalError).toBe(originalError);
  });
});

describe('AdapterRegistry', () => {
  let registry;
  let mockAdapter;

  beforeEach(() => {
    registry = new AdapterRegistry();
    mockAdapter = new WorkflowAdapter();
    mockAdapter.execute = jest.fn();
    mockAdapter.validateInput = jest.fn();
    mockAdapter.getMetadata = jest.fn();
  });

  it('should register adapter', () => {
    registry.register('test', mockAdapter);
    expect(registry.hasAdapter('test')).toBe(true);
  });

  it('should get registered adapter', () => {
    registry.register('test', mockAdapter);
    const adapter = registry.getAdapter('test');
    expect(adapter).toBe(mockAdapter);
  });

  it('should throw error for unregistered adapter', () => {
    expect(() => registry.getAdapter('nonexistent')).toThrow('No adapter found for kind: nonexistent');
  });

  it('should list registered adapters', () => {
    registry.register('test1', mockAdapter);
    registry.register('test2', mockAdapter);
    const adapters = registry.listAdapters();
    expect(adapters).toEqual(['test1', 'test2']);
  });

  it('should validate adapter on registration', () => {
    const invalidAdapter = {};
    expect(() => registry.register('test', invalidAdapter)).toThrow('Adapter must extend WorkflowAdapter');
  });
});
