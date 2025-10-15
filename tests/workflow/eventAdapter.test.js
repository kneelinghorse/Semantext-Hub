/**
 * Tests for Event adapter
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import EventAdapter from '../../packages/runtime/workflow/adapters/eventAdapter.js';
import { ValidationError, AdapterExecutionError } from '../../packages/runtime/workflow/types.js';

describe('EventAdapter', () => {
  let adapter;
  let mockEventBus;

  beforeEach(() => {
    mockEventBus = {
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn()
    };
    adapter = new EventAdapter({ eventBus: mockEventBus });
    jest.clearAllMocks();
  });

  describe('validateInput', () => {
    it('should validate valid input', () => {
      const input = {
        event: 'test.event',
        data: { message: 'test' }
      };
      const result = adapter.validateInput(input);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing input', () => {
      const result = adapter.validateInput(null);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Input is required');
    });

    it('should reject missing event name', () => {
      const input = { data: { message: 'test' } };
      const result = adapter.validateInput(input);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Event name is required');
    });

    it('should reject empty event name', () => {
      const input = {
        event: '',
        data: { message: 'test' }
      };
      const result = adapter.validateInput(input);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Event name must be a non-empty string');
    });

    it('should reject non-string event name', () => {
      const input = {
        event: 123,
        data: { message: 'test' }
      };
      const result = adapter.validateInput(input);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Event name must be a string');
    });

    it('should reject invalid priority', () => {
      const input = {
        event: 'test.event',
        priority: 15
      };
      const result = adapter.validateInput(input);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Priority must be a number between 0 and 10');
    });

    it('should reject invalid TTL', () => {
      const input = {
        event: 'test.event',
        ttl: -1
      };
      const result = adapter.validateInput(input);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('TTL must be a positive number');
    });

    it('should reject non-string routing key', () => {
      const input = {
        event: 'test.event',
        routingKey: 123
      };
      const result = adapter.validateInput(input);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Routing key must be a string');
    });
  });

  describe('execute', () => {
    const context = { 
      traceId: 'test-trace',
      sessionId: 'test-session',
      userId: 'test-user',
      metadata: { workflow: 'test' },
      getElapsedTime: jest.fn().mockReturnValue(100)
    };

    it('should execute successful event emission', async () => {
      mockEventBus.emit.mockResolvedValue({
        emitted: true,
        listenerCount: 2,
        results: [
          { success: true, result: 'processed' },
          { success: true, result: 'logged' }
        ]
      });

      const input = {
        event: 'test.event',
        data: { message: 'test' },
        priority: 5
      };

      const result = await adapter.execute(context, input);

      expect(result.success).toBe(true);
      expect(result.event).toBe('test.event');
      expect(result.traceId).toBe('test-trace');
      expect(result.listenerCount).toBe(2);
      expect(mockEventBus.emit).toHaveBeenCalledWith('test.event', expect.objectContaining({
        event: 'test.event',
        data: { message: 'test' },
        metadata: expect.objectContaining({
          traceId: 'test-trace',
          priority: 5
        })
      }));
    });

    it('should handle event emission with TTL', async () => {
      mockEventBus.emit.mockResolvedValue({
        emitted: true,
        listenerCount: 1,
        results: []
      });

      const input = {
        event: 'test.event',
        data: { message: 'test' },
        ttl: 300
      };

      const result = await adapter.execute(context, input);

      expect(result.success).toBe(true);
      expect(mockEventBus.emit).toHaveBeenCalledWith('test.event', expect.objectContaining({
        metadata: expect.objectContaining({
          ttl: 300,
          expiresAt: expect.any(String)
        })
      }));
    });

    it('should handle listener failures', async () => {
      mockEventBus.emit.mockResolvedValue({
        emitted: true,
        listenerCount: 2,
        results: [
          { success: true, result: 'processed' },
          { success: false, error: 'Listener failed' }
        ]
      });

      const input = {
        event: 'test.event',
        data: { message: 'test' }
      };

      const result = await adapter.execute(context, input);

      expect(result.success).toBe(true);
      expect(result.warnings).toEqual(['Listener failed']);
    });

    it('should throw validation error for invalid input', async () => {
      const input = { event: '' };

      await expect(adapter.execute(context, input)).rejects.toThrow(AdapterExecutionError);
    });

    it('should handle event bus errors', async () => {
      mockEventBus.emit.mockRejectedValue(new Error('Event bus error'));

      const input = {
        event: 'test.event',
        data: { message: 'test' }
      };

      await expect(adapter.execute(context, input)).rejects.toThrow(AdapterExecutionError);
    });

    it('should handle missing event bus', async () => {
      const adapter = new EventAdapter({ eventBus: null });

      const input = {
        event: 'test.event',
        data: { message: 'test' }
      };

      // Should create default event bus and succeed
      const result = await adapter.execute(context, input);
      expect(result.success).toBe(true);
    });
  });

  describe('createDefaultEventBus', () => {
    it('should create default event bus', () => {
      const adapter = new EventAdapter();
      expect(adapter.eventBus).toBeDefined();
      expect(typeof adapter.eventBus.emit).toBe('function');
      expect(typeof adapter.eventBus.on).toBe('function');
      expect(typeof adapter.eventBus.off).toBe('function');
    });

    it('should handle event emission with default bus', async () => {
      const adapter = new EventAdapter();
      const context = { 
        traceId: 'test-trace',
        getElapsedTime: jest.fn().mockReturnValue(100)
      };

      const input = {
        event: 'test.event',
        data: { message: 'test' }
      };

      const result = await adapter.execute(context, input);

      expect(result.success).toBe(true);
      expect(result.event).toBe('test.event');
      expect(result.listenerCount).toBe(0);
    });

    it('should handle event listeners with default bus', async () => {
      const adapter = new EventAdapter();
      const context = { 
        traceId: 'test-trace',
        getElapsedTime: jest.fn().mockReturnValue(100)
      };

      // Add a listener
      const listener = jest.fn().mockResolvedValue('processed');
      adapter.eventBus.on('test.event', listener);

      const input = {
        event: 'test.event',
        data: { message: 'test' }
      };

      const result = await adapter.execute(context, input);

      expect(result.success).toBe(true);
      expect(result.listenerCount).toBe(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        event: 'test.event',
        data: { message: 'test' }
      }));
    });
  });

  describe('getMetadata', () => {
    it('should return adapter metadata', () => {
      const metadata = adapter.getMetadata();
      expect(metadata).toEqual({
        kind: 'event',
        version: '1.0.0',
        description: 'Event adapter for workflow execution',
        config: {
          eventBus: mockEventBus,
          routingKey: '',
          persistent: false,
          priority: 0
        }
      });
    });

    it('should return metadata with custom config', () => {
      const adapter = new EventAdapter({
        routingKey: 'workflow.events',
        persistent: true,
        priority: 8
      });
      
      const metadata = adapter.getMetadata();
      expect(metadata.config).toEqual({
        eventBus: 'default',
        routingKey: 'workflow.events',
        persistent: true,
        priority: 8
      });
    });
  });
});
