/**
 * Tests for adapter registry
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { WorkflowAdapterRegistry, defaultRegistry } from '../../packages/runtime/workflow/adapter-registry.js';
import { AdapterExecutionError, WorkflowAdapter } from '../../packages/runtime/workflow/types.js';

describe('WorkflowAdapterRegistry', () => {
  let registry;
  let mockAdapter;

  beforeEach(() => {
    registry = new WorkflowAdapterRegistry();
    mockAdapter = new WorkflowAdapter();
    mockAdapter.execute = jest.fn();
    mockAdapter.validateInput = jest.fn();
    mockAdapter.getMetadata = jest.fn();
  });

  describe('initialization', () => {
    it('should initialize with default adapters', () => {
      expect(registry.hasAdapter('http')).toBe(true);
      expect(registry.hasAdapter('event')).toBe(true);
      expect(registry.hasAdapter('tool')).toBe(true);
    });

    it('should list all adapters', () => {
      const adapters = registry.listAdapters();
      expect(adapters).toContain('http');
      expect(adapters).toContain('event');
      expect(adapters).toContain('tool');
    });
  });

  describe('getAdapter', () => {
    it('should get existing adapter', () => {
      const adapter = registry.getAdapter('http');
      expect(adapter).toBeDefined();
      expect(adapter.getMetadata().kind).toBe('http');
    });

    it('should throw error for non-existent adapter', () => {
      expect(() => registry.getAdapter('nonexistent')).toThrow(AdapterExecutionError);
    });

    it('should provide helpful error message', () => {
      try {
        registry.getAdapter('nonexistent');
      } catch (error) {
        expect(error.message).toContain('Available adapters:');
        expect(error.message).toContain('http');
        expect(error.message).toContain('event');
        expect(error.message).toContain('tool');
      }
    });
  });

  describe('executeStep', () => {
    const context = { 
      traceId: 'test-trace',
      getElapsedTime: jest.fn().mockReturnValue(100)
    };

    it('should execute HTTP step', async () => {
      const input = {
        method: 'GET',
        url: 'https://example.com'
      };

      // Mock fetch for HTTP adapter
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue({ success: true })
      });

      const result = await registry.executeStep('http', context, input);

      expect(result.status).toBe(200);
      expect(result.ok).toBe(true);
    });

    it('should execute event step', async () => {
      const input = {
        event: 'test.event',
        data: { message: 'test' }
      };

      const result = await registry.executeStep('event', context, input);

      expect(result.success).toBe(true);
      expect(result.event).toBe('test.event');
    });

    it('should execute tool step', async () => {
      const input = {
        tool: 'echo',
        args: { message: 'test' }
      };

      const result = await registry.executeStep('tool', context, input);

      expect(result.success).toBe(true);
      expect(result.tool).toBe('echo');
    });

    it('should throw error for invalid adapter', async () => {
      const input = { test: 'data' };

      await expect(registry.executeStep('nonexistent', context, input))
        .rejects.toThrow(AdapterExecutionError);
    });
  });

  describe('validateStep', () => {
    it('should validate HTTP step', () => {
      const input = {
        method: 'GET',
        url: 'https://example.com'
      };

      const result = registry.validateStep('http', input);
      expect(result.isValid).toBe(true);
    });

    it('should validate event step', () => {
      const input = {
        event: 'test.event',
        data: { message: 'test' }
      };

      const result = registry.validateStep('event', input);
      expect(result.isValid).toBe(true);
    });

    it('should validate tool step', () => {
      const input = {
        tool: 'echo',
        args: { message: 'test' }
      };

      const result = registry.validateStep('tool', input);
      expect(result.isValid).toBe(true);
    });

    it('should throw error for invalid adapter', () => {
      const input = { test: 'data' };

      expect(() => registry.validateStep('nonexistent', input))
        .toThrow(AdapterExecutionError);
    });
  });

  describe('getAdapterMetadata', () => {
    it('should get HTTP adapter metadata', () => {
      const metadata = registry.getAdapterMetadata('http');
      expect(metadata.kind).toBe('http');
      expect(metadata.version).toBe('1.0.0');
    });

    it('should get event adapter metadata', () => {
      const metadata = registry.getAdapterMetadata('event');
      expect(metadata.kind).toBe('event');
      expect(metadata.version).toBe('1.0.0');
    });

    it('should get tool adapter metadata', () => {
      const metadata = registry.getAdapterMetadata('tool');
      expect(metadata.kind).toBe('tool');
      expect(metadata.version).toBe('1.0.0');
    });

    it('should throw error for invalid adapter', () => {
      expect(() => registry.getAdapterMetadata('nonexistent'))
        .toThrow(AdapterExecutionError);
    });
  });

  describe('getAllMetadata', () => {
    it('should get all adapter metadata', () => {
      const metadata = registry.getAllMetadata();
      
      expect(metadata.http).toBeDefined();
      expect(metadata.event).toBeDefined();
      expect(metadata.tool).toBeDefined();
      
      expect(metadata.http.kind).toBe('http');
      expect(metadata.event.kind).toBe('event');
      expect(metadata.tool.kind).toBe('tool');
    });
  });

  describe('supportsFeature', () => {
    it('should check feature support', () => {
      // Default adapters don't have features defined
      expect(registry.supportsFeature('http', 'retry')).toBe(undefined);
      expect(registry.supportsFeature('event', 'timeout')).toBe(undefined);
      expect(registry.supportsFeature('tool', 'validation')).toBe(undefined);
    });

    it('should return false for invalid adapter', () => {
      expect(registry.supportsFeature('nonexistent', 'retry')).toBe(false);
    });
  });

  describe('getCapabilities', () => {
    it('should return capabilities summary', () => {
      const capabilities = registry.getCapabilities();
      
      expect(capabilities.adapters).toContain('http');
      expect(capabilities.adapters).toContain('event');
      expect(capabilities.adapters).toContain('tool');
      expect(capabilities.count).toBe(3);
      expect(capabilities.metadata).toBeDefined();
      expect(capabilities.features).toBeDefined();
    });
  });

  describe('createAdapter', () => {
    it('should create HTTP adapter', () => {
      const adapter = registry.createAdapter('http', { timeout: 5000 });
      expect(adapter).toBeDefined();
      expect(adapter.getMetadata().kind).toBe('http');
    });

    it('should create event adapter', () => {
      const adapter = registry.createAdapter('event', { priority: 8 });
      expect(adapter).toBeDefined();
      expect(adapter.getMetadata().kind).toBe('event');
    });

    it('should create tool adapter', () => {
      const adapter = registry.createAdapter('tool', { timeout: 10000 });
      expect(adapter).toBeDefined();
      expect(adapter.getMetadata().kind).toBe('tool');
    });

    it('should throw error for unknown adapter kind', () => {
      expect(() => registry.createAdapter('unknown')).toThrow(AdapterExecutionError);
    });
  });

  describe('register', () => {
    it('should register valid adapter', () => {
      registry.register('test', mockAdapter);
      expect(registry.hasAdapter('test')).toBe(true);
    });

    it('should validate adapter on registration', () => {
      const invalidAdapter = {};
      expect(() => registry.register('test', invalidAdapter))
        .toThrow(AdapterExecutionError);
    });

    it('should validate execute method', () => {
      const invalidAdapter = {
        validateInput: jest.fn(),
        getMetadata: jest.fn()
      };
      expect(() => registry.register('test', invalidAdapter))
        .toThrow(AdapterExecutionError);
    });

    it('should validate validateInput method', () => {
      const invalidAdapter = {
        execute: jest.fn(),
        getMetadata: jest.fn()
      };
      expect(() => registry.register('test', invalidAdapter))
        .toThrow(AdapterExecutionError);
    });

    it('should validate getMetadata method', () => {
      const invalidAdapter = {
        execute: jest.fn(),
        validateInput: jest.fn()
      };
      expect(() => registry.register('test', invalidAdapter))
        .toThrow(AdapterExecutionError);
    });
  });

  describe('unregister', () => {
    it('should unregister adapter', () => {
      registry.register('test', mockAdapter);
      expect(registry.hasAdapter('test')).toBe(true);
      
      const removed = registry.unregister('test');
      expect(removed).toBe(true);
      expect(registry.hasAdapter('test')).toBe(false);
    });

    it('should return false for non-existent adapter', () => {
      const removed = registry.unregister('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('clear and reset', () => {
    it('should clear all adapters', () => {
      registry.register('test', mockAdapter);
      expect(registry.hasAdapter('test')).toBe(true);
      
      registry.clear();
      expect(registry.hasAdapter('test')).toBe(false);
      expect(registry.hasAdapter('http')).toBe(true); // Default adapters restored
    });

    it('should reset to default state', () => {
      registry.register('test', mockAdapter);
      registry.reset();
      
      expect(registry.hasAdapter('test')).toBe(false);
      expect(registry.hasAdapter('http')).toBe(true);
      expect(registry.hasAdapter('event')).toBe(true);
      expect(registry.hasAdapter('tool')).toBe(true);
    });
  });
});

describe('defaultRegistry', () => {
  it('should be a WorkflowAdapterRegistry instance', () => {
    expect(defaultRegistry).toBeInstanceOf(WorkflowAdapterRegistry);
  });

  it('should have default adapters', () => {
    expect(defaultRegistry.hasAdapter('http')).toBe(true);
    expect(defaultRegistry.hasAdapter('event')).toBe(true);
    expect(defaultRegistry.hasAdapter('tool')).toBe(true);
  });
});

describe('convenience functions', () => {
  it('should provide getAdapter function', () => {
    const adapter = defaultRegistry.getAdapter('http');
    expect(adapter).toBeDefined();
  });

  it('should provide executeStep function', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: jest.fn().mockResolvedValue({ success: true })
    });

    const context = { 
      traceId: 'test-trace',
      getElapsedTime: jest.fn().mockReturnValue(100)
    };
    const input = { method: 'GET', url: 'https://example.com' };
    
    const result = await defaultRegistry.executeStep('http', context, input);
    expect(result.status).toBe(200);
  });

  it('should provide validateStep function', () => {
    const input = { method: 'GET', url: 'https://example.com' };
    const result = defaultRegistry.validateStep('http', input);
    expect(result.isValid).toBe(true);
  });

  it('should provide getAdapterMetadata function', () => {
    const metadata = defaultRegistry.getAdapterMetadata('http');
    expect(metadata.kind).toBe('http');
  });

  it('should provide getAllMetadata function', () => {
    const metadata = defaultRegistry.getAllMetadata();
    expect(metadata.http).toBeDefined();
    expect(metadata.event).toBeDefined();
    expect(metadata.tool).toBeDefined();
  });

  it('should provide getCapabilities function', () => {
    const capabilities = defaultRegistry.getCapabilities();
    expect(capabilities.adapters).toContain('http');
    expect(capabilities.count).toBeGreaterThan(0);
  });
});
