/**
 * Property/Fuzz Tests for Event Workflow Adapter
 * 
 * Tests event adapter behavior with random inputs to ensure robustness
 * and catch edge cases that might cause flakiness.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { EventAdapter } from '../../../packages/runtime/workflow/adapters/eventAdapter.js';
import { deflake } from '../../util/deflake.js';

describe('Event Adapter Property Tests', () => {
  let adapter;
  let isolationContext;

  beforeEach(() => {
    adapter = new EventAdapter({
      priority: 5,
      persistent: true,
      routingKey: 'default'
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

    it('should always reject invalid event names', async () => {
      const invalidEventNames = [
        null,
        undefined,
        '',
        '   ',
        {},
        [],
        123,
        true,
        false
      ];

      for (let i = 0; i < 100; i++) {
        const eventName = i < invalidEventNames.length ? invalidEventNames[i] : `event_${i}`;
        
        const input = {
          event: eventName,
          data: { test: 'data' }
        };

        const validation = adapter.validateInput(input);
        
        if (typeof eventName !== 'string' || eventName.trim() === '') {
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(e => e.field === 'event')).toBe(true);
        } else {
          expect(validation.isValid).toBe(true);
        }
      }
    });

    it('should always reject invalid priority values', async () => {
      const invalidPriorities = [
        -1,
        11,
        100,
        'string',
        null,
        undefined,
        {},
        [],
        Infinity,
        -Infinity
      ];

      for (let i = 0; i < 50; i++) {
        const priority = invalidPriorities[i % invalidPriorities.length];
        
        const input = {
          event: `test_event_${i}`,
          priority
        };

        const validation = adapter.validateInput(input);
        
        if (typeof priority !== 'number' || priority < 0 || priority > 10) {
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(e => e.field === 'priority')).toBe(true);
        }
      }
    });

    it('should always reject invalid TTL values', async () => {
      const invalidTTLs = [
        0,
        -1,
        -100,
        'string',
        null,
        undefined,
        {},
        [],
        Infinity,
        -Infinity
      ];

      for (let i = 0; i < 50; i++) {
        const ttl = invalidTTLs[i % invalidTTLs.length];
        
        const input = {
          event: `test_event_${i}`,
          ttl
        };

        const validation = adapter.validateInput(input);
        
        if (typeof ttl !== 'number' || ttl <= 0) {
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(e => e.field === 'ttl')).toBe(true);
        }
      }
    });

    it('should always reject invalid routing keys', async () => {
      const invalidRoutingKeys = [
        123,
        {},
        [],
        true,
        false
      ];

      for (let i = 0; i < 50; i++) {
        const routingKey = invalidRoutingKeys[i % invalidRoutingKeys.length];
        
        const input = {
          event: `test_event_${i}`,
          routingKey
        };

        const validation = adapter.validateInput(input);
        
        if (routingKey !== undefined && typeof routingKey !== 'string') {
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(e => e.field === 'routingKey')).toBe(true);
        }
      }
    });
  });

  describe('Event Data Building Properties', () => {
    it('should always build valid event data structure', async () => {
      for (let i = 0; i < 100; i++) {
        const testData = deflake.generateDeterministicData(`event_data_${i}`, {
          event: 'string',
          data: 'object',
          priority: 'number',
          ttl: 'number',
          routingKey: 'string',
          metadata: 'object'
        });

        const input = {
          event: `test_event_${i}`,
          data: testData.data ? { test: `value${i}` } : undefined,
          priority: testData.priority ? i % 11 : undefined,
          ttl: testData.ttl ? 1000 + (i * 100) : undefined,
          routingKey: testData.routingKey ? `route_${i}` : undefined,
          metadata: testData.metadata ? { custom: `meta${i}` } : undefined
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: { contextMeta: `ctx${i}` }
        };

        const eventData = adapter.buildEventData(input, context);

        expect(eventData).toBeDefined();
        expect(eventData.event).toBe(input.event);
        expect(eventData.data).toBeDefined();
        expect(eventData.metadata).toBeDefined();
        expect(eventData.metadata.traceId).toBe(context.traceId);
        expect(eventData.metadata.sessionId).toBe(context.sessionId);
        expect(eventData.metadata.userId).toBe(context.userId);
        expect(eventData.metadata.timestamp).toBeDefined();
        expect(new Date(eventData.metadata.timestamp)).toBeInstanceOf(Date);
      }
    });

    it('should always calculate TTL expiration correctly', async () => {
      for (let i = 0; i < 50; i++) {
        const ttl = 1000 + (i * 100);
        const input = {
          event: `ttl_test_${i}`,
          ttl
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        const eventData = adapter.buildEventData(input, context);

        expect(eventData.metadata.ttl).toBe(ttl);
        expect(eventData.metadata.expiresAt).toBeDefined();
        
        const expiresAt = new Date(eventData.metadata.expiresAt);
        const now = new Date();
        const expectedExpiry = new Date(now.getTime() + ttl * 1000);
        
        // Allow 1 second tolerance for execution time
        expect(Math.abs(expiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(1000);
      }
    });

    it('should always merge metadata correctly', async () => {
      for (let i = 0; i < 50; i++) {
        const input = {
          event: `metadata_test_${i}`,
          metadata: {
            inputMeta: `input_${i}`,
            shared: 'input_value'
          }
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {
            contextMeta: `context_${i}`,
            shared: 'context_value'
          }
        };

        const eventData = adapter.buildEventData(input, context);

        expect(eventData.metadata.inputMeta).toBe(`input_${i}`);
        expect(eventData.metadata.contextMeta).toBe(`context_${i}`);
        expect(eventData.metadata.shared).toBe('input_value'); // Input should override context
      }
    });
  });

  describe('Event Emission Properties', () => {
    it('should always emit events successfully with valid input', async () => {
      for (let i = 0; i < 50; i++) {
        const input = {
          event: `success_test_${i}`,
          data: { test: `value${i}` }
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        const result = await adapter.execute(context, input);

        expect(result.success).toBe(true);
        expect(result.event).toBe(input.event);
        expect(result.timestamp).toBeDefined();
        expect(result.traceId).toBe(context.traceId);
        expect(result.listenerCount).toBe(0); // No listeners by default
      }
    });

    it('should always handle event bus errors gracefully', async () => {
      // Create adapter with invalid event bus
      const invalidAdapter = new EventAdapter({
        eventBus: null
      });

      for (let i = 0; i < 20; i++) {
        const input = {
          event: `error_test_${i}`,
          data: { test: `value${i}` }
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        try {
          await invalidAdapter.execute(context, input);
          expect(true).toBe(false); // Should not reach here
        } catch (error) {
          expect(error.message).toContain('Event emission failed');
        }
      }
    });

    it('should always process listener results correctly', async () => {
      // Create adapter with custom event bus that has listeners
      const eventBus = {
        emit: async (event, data) => {
          return {
            event,
            emitted: true,
            listenerCount: 2,
            results: [
              { success: true, result: 'listener1_success' },
              { success: false, error: 'listener2_failure' }
            ]
          };
        }
      };

      const customAdapter = new EventAdapter({
        eventBus
      });

      for (let i = 0; i < 20; i++) {
        const input = {
          event: `listener_test_${i}`,
          data: { test: `value${i}` }
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        const result = await customAdapter.execute(context, input);

        expect(result.success).toBe(true);
        expect(result.listenerCount).toBe(2);
        expect(result.listenerResults).toBeDefined();
        expect(result.listenerResults).toHaveLength(2);
        expect(result.listenerResults[0].success).toBe(true);
        expect(result.listenerResults[1].success).toBe(false);
        expect(result.warnings).toBeDefined();
        expect(result.warnings).toContain('listener2_failure');
      }
    });
  });

  describe('Event Bus Integration Properties', () => {
    it('should always create valid default event bus', async () => {
      for (let i = 0; i < 20; i++) {
        const adapter = new EventAdapter();
        const eventBus = adapter.eventBus;

        expect(eventBus).toBeDefined();
        expect(typeof eventBus.emit).toBe('function');
        expect(typeof eventBus.on).toBe('function');
        expect(typeof eventBus.off).toBe('function');

        // Test emit functionality
        const result = await eventBus.emit(`test_event_${i}`, { data: `value${i}` });
        expect(result.emitted).toBe(true);
        expect(result.event).toBe(`test_event_${i}`);
        expect(result.listenerCount).toBe(0);
      }
    });

    it('should always handle event listeners correctly', async () => {
      for (let i = 0; i < 20; i++) {
        const adapter = new EventAdapter();
        const eventBus = adapter.eventBus;

        const listener1 = jest.fn().mockResolvedValue(`result1_${i}`);
        const listener2 = jest.fn().mockRejectedValue(new Error(`error2_${i}`));

        eventBus.on(`test_event_${i}`, listener1);
        eventBus.on(`test_event_${i}`, listener2);

        const result = await eventBus.emit(`test_event_${i}`, { data: `value${i}` });

        expect(result.listenerCount).toBe(2);
        expect(result.results).toHaveLength(2);
        expect(result.results[0].success).toBe(true);
        expect(result.results[0].result).toBe(`result1_${i}`);
        expect(result.results[1].success).toBe(false);
        expect(result.results[1].error).toBe(`error2_${i}`);

        expect(listener1).toHaveBeenCalledWith({ data: `value${i}` });
        expect(listener2).toHaveBeenCalledWith({ data: `value${i}` });

        // Test listener removal
        eventBus.off(`test_event_${i}`, listener1);
        const resultAfterRemoval = await eventBus.emit(`test_event_${i}`, { data: `value${i}` });
        expect(resultAfterRemoval.listenerCount).toBe(1);
      }
    });
  });

  describe('Concurrency Properties', () => {
    it('should handle concurrent event emissions without interference', async () => {
      for (let i = 0; i < 5; i++) {
        const emissions = Array.from({ length: 10 }, (_, j) => {
          const input = {
            event: `concurrent_event_${i}_${j}`,
            data: { test: `value_${i}_${j}` }
          };
          const context = {
            traceId: `trace_${i}_${j}`,
            sessionId: `session_${i}_${j}`,
            userId: `user_${i}_${j}`,
            metadata: {}
          };
          return adapter.execute(context, input);
        });

        const results = await Promise.all(emissions);
        
        expect(results).toHaveLength(10);
        results.forEach((result, j) => {
          expect(result.success).toBe(true);
          expect(result.event).toBe(`concurrent_event_${i}_${j}`);
        });
      }
    });

    it('should handle concurrent listener registrations safely', async () => {
      for (let i = 0; i < 5; i++) {
        const adapter = new EventAdapter();
        const eventBus = adapter.eventBus;

        // Register multiple listeners concurrently
        const listeners = Array.from({ length: 10 }, (_, j) => {
          const listener = jest.fn().mockResolvedValue(`result_${i}_${j}`);
          eventBus.on(`concurrent_event_${i}`, listener);
          return listener;
        });

        // Emit event
        const result = await eventBus.emit(`concurrent_event_${i}`, { data: `value_${i}` });

        expect(result.listenerCount).toBe(10);
        expect(result.results).toHaveLength(10);

        // Verify all listeners were called
        listeners.forEach((listener, j) => {
          expect(listener).toHaveBeenCalledWith({ data: `value_${i}` });
        });
      }
    });
  });

  describe('Performance Properties', () => {
    it('should always complete within reasonable time', async () => {
      for (let i = 0; i < 20; i++) {
        const startTime = performance.now();
        
        const input = {
          event: `perf_test_${i}`,
          data: { test: `value${i}` }
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        const result = await adapter.execute(context, input);
        const duration = performance.now() - startTime;

        expect(result.success).toBe(true);
        expect(duration).toBeLessThan(100); // Should complete within 100ms
      }
    });

    it('should handle large event data efficiently', async () => {
      for (let i = 0; i < 10; i++) {
        const largeData = {
          field1: `value_${i}`.repeat(1000),
          field2: Array.from({ length: 1000 }, (_, j) => `item_${i}_${j}`),
          field3: {
            nested: {
              deep: {
                value: `deep_value_${i}`.repeat(100)
              }
            }
          }
        };

        const input = {
          event: `large_data_test_${i}`,
          data: largeData
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        const startTime = performance.now();
        const result = await adapter.execute(context, input);
        const duration = performance.now() - startTime;

        expect(result.success).toBe(true);
        expect(duration).toBeLessThan(500); // Should handle large data within 500ms
      }
    });
  });
});
