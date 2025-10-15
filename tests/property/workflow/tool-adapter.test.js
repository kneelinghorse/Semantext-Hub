/**
 * Property/Fuzz Tests for Tool Workflow Adapter
 * 
 * Tests tool adapter behavior with random inputs to ensure robustness
 * and catch edge cases that might cause flakiness.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ToolAdapter } from '../../../packages/runtime/workflow/adapters/toolAdapter.js';
import { deflake } from '../../util/deflake.js';

describe('Tool Adapter Property Tests', () => {
  let adapter;
  let isolationContext;

  beforeEach(() => {
    adapter = new ToolAdapter({
      timeout: 1000,
      maxRetries: 2
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

    it('should always reject invalid tool names', async () => {
      const invalidToolNames = [
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
        const toolName = i < invalidToolNames.length ? invalidToolNames[i] : `tool_${i}`;
        
        const input = {
          tool: toolName,
          args: { test: 'data' }
        };

        const validation = adapter.validateInput(input);
        
        if (typeof toolName !== 'string' || toolName.trim() === '') {
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(e => e.field === 'tool')).toBe(true);
        } else {
          expect(validation.isValid).toBe(true);
        }
      }
    });

    it('should always reject invalid timeout values', async () => {
      const invalidTimeouts = [
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
        const timeout = invalidTimeouts[i % invalidTimeouts.length];
        
        const input = {
          tool: 'echo',
          timeout
        };

        const validation = adapter.validateInput(input);
        
        if (typeof timeout !== 'number' || timeout <= 0) {
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(e => e.field === 'timeout')).toBe(true);
        }
      }
    });

    it('should always reject invalid max retries values', async () => {
      const invalidMaxRetries = [
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
        const maxRetries = invalidMaxRetries[i % invalidMaxRetries.length];
        
        const input = {
          tool: 'echo',
          maxRetries
        };

        const validation = adapter.validateInput(input);
        
        if (typeof maxRetries !== 'number' || maxRetries < 0 || maxRetries > 10) {
          expect(validation.isValid).toBe(false);
          expect(validation.errors.some(e => e.field === 'maxRetries')).toBe(true);
        }
      }
    });
  });

  describe('Tool Registry Properties', () => {
    it('should always create valid default tool registry', async () => {
      for (let i = 0; i < 20; i++) {
        const adapter = new ToolAdapter();
        const registry = adapter.toolRegistry;

        expect(registry).toBeDefined();
        expect(typeof registry.getTool).toBe('function');
        expect(typeof registry.listTools).toBe('function');
        expect(typeof registry.registerTool).toBe('function');
        expect(typeof registry.hasTool).toBe('function');

        // Test default tools
        expect(registry.hasTool('echo')).toBe(true);
        expect(registry.hasTool('add')).toBe(true);
        expect(registry.hasTool('delay')).toBe(true);

        const tools = registry.listTools();
        expect(tools).toContain('echo');
        expect(tools).toContain('add');
        expect(tools).toContain('delay');
      }
    });

    it('should always handle tool registration correctly', async () => {
      for (let i = 0; i < 20; i++) {
        const adapter = new ToolAdapter();
        const registry = adapter.toolRegistry;

        const toolName = `custom_tool_${i}`;
        const tool = {
          name: toolName,
          description: `Custom tool ${i}`,
          execute: async (input) => ({ result: `custom_result_${i}`, input })
        };

        registry.registerTool(toolName, tool);

        expect(registry.hasTool(toolName)).toBe(true);
        expect(registry.getTool(toolName)).toBe(tool);

        const tools = registry.listTools();
        expect(tools).toContain(toolName);
      }
    });

    it('should always reject invalid tool registrations', async () => {
      for (let i = 0; i < 20; i++) {
        const adapter = new ToolAdapter();
        const registry = adapter.toolRegistry;

        const invalidTools = [
          { name: 'invalid1' }, // Missing execute
          { execute: async () => {} }, // Missing name
          { name: 'invalid3', execute: 'not_a_function' }, // Invalid execute
          null,
          undefined,
          'string',
          123
        ];

        invalidTools.forEach((invalidTool, j) => {
          try {
            registry.registerTool(`invalid_tool_${i}_${j}`, invalidTool);
            expect(true).toBe(false); // Should not reach here
          } catch (error) {
            expect(error.message).toContain('Tool must have execute function');
          }
        });
      }
    });
  });

  describe('Tool Execution Properties', () => {
    it('should always execute valid tools successfully', async () => {
      for (let i = 0; i < 50; i++) {
        const input = {
          tool: 'echo',
          args: { message: `test_message_${i}` }
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        const result = await adapter.execute(context, input);

        expect(result.success).toBe(true);
        expect(result.tool).toBe('echo');
        expect(result.result).toBeDefined();
        expect(result.metadata.traceId).toBe(context.traceId);
        expect(result.metadata.adapterKind).toBe('tool');
        expect(result.metadata.toolName).toBe('echo');
      }
    });

    it('should always handle tool not found errors', async () => {
      for (let i = 0; i < 20; i++) {
        const input = {
          tool: `nonexistent_tool_${i}`,
          args: { test: 'data' }
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        try {
          await adapter.execute(context, input);
          expect(true).toBe(false); // Should not reach here
        } catch (error) {
          expect(error.message).toContain('not found');
          expect(error.message).toContain(`nonexistent_tool_${i}`);
        }
      }
    });

    it('should always handle tool execution errors', async () => {
      // Register a tool that always fails
      const failingTool = {
        name: 'failing_tool',
        description: 'Tool that always fails',
        execute: async () => {
          throw new Error('Tool execution failed');
        }
      };

      adapter.toolRegistry.registerTool('failing_tool', failingTool);

      for (let i = 0; i < 20; i++) {
        const input = {
          tool: 'failing_tool',
          args: { test: `value_${i}` }
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        try {
          await adapter.execute(context, input);
          expect(true).toBe(false); // Should not reach here
        } catch (error) {
          expect(error.message).toContain('Tool invocation failed');
        }
      }
    });

    it('should always build tool input correctly', async () => {
      for (let i = 0; i < 50; i++) {
        const testData = deflake.generateDeterministicData(`tool_input_${i}`, {
          arg1: 'string',
          arg2: 'number',
          arg3: 'boolean'
        });

        const input = {
          tool: 'echo',
          args: {
            arg1: `value_${i}`,
            arg2: i,
            arg3: i % 2 === 0
          }
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: { contextMeta: `ctx_${i}` }
        };

        const toolInput = adapter.buildToolInput(input, context);

        expect(toolInput.arg1).toBe(`value_${i}`);
        expect(toolInput.arg2).toBe(i);
        expect(toolInput.arg3).toBe(i % 2 === 0);
        expect(toolInput._context).toBeDefined();
        expect(toolInput._context.traceId).toBe(context.traceId);
        expect(toolInput._context.sessionId).toBe(context.sessionId);
        expect(toolInput._context.userId).toBe(context.userId);
        expect(toolInput._context.metadata).toBe(context.metadata);
      }
    });
  });

  describe('Retry Logic Properties', () => {
    it('should always retry on transient failures', async () => {
      let attemptCount = 0;
      const flakyTool = {
        name: 'flaky_tool',
        description: 'Tool that fails first two attempts',
        execute: async (input) => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Transient failure');
          }
          return { result: `success_after_${attemptCount}_attempts` };
        }
      };

      adapter.toolRegistry.registerTool('flaky_tool', flakyTool);

      for (let i = 0; i < 10; i++) {
        attemptCount = 0;
        
        const input = {
          tool: 'flaky_tool',
          args: { test: `value_${i}` },
          maxRetries: 3
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        const result = await adapter.execute(context, input);

        expect(result.success).toBe(true);
        expect(result.result).toBe(`success_after_3_attempts`);
        expect(attemptCount).toBe(3);
      }
    });

    it('should always fail after max retries', async () => {
      const persistentFailingTool = {
        name: 'persistent_failing_tool',
        description: 'Tool that always fails',
        execute: async () => {
          throw new Error('Persistent failure');
        }
      };

      adapter.toolRegistry.registerTool('persistent_failing_tool', persistentFailingTool);

      for (let i = 0; i < 10; i++) {
        const input = {
          tool: 'persistent_failing_tool',
          args: { test: `value_${i}` },
          maxRetries: 2
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        try {
          await adapter.execute(context, input);
          expect(true).toBe(false); // Should not reach here
        } catch (error) {
          expect(error.message).toContain('Tool invocation failed');
        }
      }
    });

    it('should always not retry on validation errors', async () => {
      const validationFailingTool = {
        name: 'validation_failing_tool',
        description: 'Tool that fails with validation error',
        execute: async (input) => {
          throw new Error('Both a and b must be numbers');
        }
      };

      adapter.toolRegistry.registerTool('validation_failing_tool', validationFailingTool);

      for (let i = 0; i < 10; i++) {
        const input = {
          tool: 'validation_failing_tool',
          args: { test: `value_${i}` },
          maxRetries: 3
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        try {
          await adapter.execute(context, input);
          expect(true).toBe(false); // Should not reach here
        } catch (error) {
          expect(error.message).toContain('Tool invocation failed');
          // Should not have retried due to validation error
        }
      }
    });
  });

  describe('Timeout Properties', () => {
    it('should always timeout after specified duration', async () => {
      const slowTool = {
        name: 'slow_tool',
        description: 'Tool that takes a long time',
        execute: async (input) => {
          await new Promise(resolve => setTimeout(resolve, input.delay || 2000));
          return { result: 'slow_result' };
        }
      };

      adapter.toolRegistry.registerTool('slow_tool', slowTool);

      for (let i = 0; i < 10; i++) {
        const timeout = 100 + (i * 50); // Varying timeouts
        
        const input = {
          tool: 'slow_tool',
          args: { delay: timeout + 100 }, // Longer than timeout
          timeout
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        try {
          await adapter.execute(context, input);
          expect(true).toBe(false); // Should not reach here
        } catch (error) {
          expect(error.message).toContain('timeout');
        }
      }
    });

    it('should always complete within timeout for fast tools', async () => {
      const fastTool = {
        name: 'fast_tool',
        description: 'Tool that completes quickly',
        execute: async (input) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return { result: `fast_result_${input.id}` };
        }
      };

      adapter.toolRegistry.registerTool('fast_tool', fastTool);

      for (let i = 0; i < 20; i++) {
        const input = {
          tool: 'fast_tool',
          args: { id: i },
          timeout: 1000
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        const result = await adapter.execute(context, input);

        expect(result.success).toBe(true);
        expect(result.result).toBe(`fast_result_${i}`);
      }
    });
  });

  describe('Default Tools Properties', () => {
    it('should always execute echo tool correctly', async () => {
      for (let i = 0; i < 50; i++) {
        const testData = deflake.generateDeterministicData(`echo_test_${i}`, {
          message: 'string',
          number: 'number',
          boolean: 'boolean'
        });

        const input = {
          tool: 'echo',
          args: {
            message: `test_message_${i}`,
            number: i,
            boolean: i % 2 === 0
          }
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        const result = await adapter.execute(context, input);

        expect(result.success).toBe(true);
        expect(result.result).toBeDefined();
        expect(result.result.message).toBe(`test_message_${i}`);
        expect(result.result.number).toBe(i);
        expect(result.result.boolean).toBe(i % 2 === 0);
      }
    });

    it('should always execute add tool correctly', async () => {
      for (let i = 0; i < 50; i++) {
        const a = Math.floor(Math.random() * 1000);
        const b = Math.floor(Math.random() * 1000);
        
        const input = {
          tool: 'add',
          args: { a, b }
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        const result = await adapter.execute(context, input);

        expect(result.success).toBe(true);
        expect(result.result).toBe(a + b);
      }
    });

    it('should always execute delay tool correctly', async () => {
      for (let i = 0; i < 10; i++) {
        const delay = 10 + (i * 5); // Varying delays
        
        const input = {
          tool: 'delay',
          args: { ms: delay }
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
        expect(result.result).toBe(`Delayed for ${delay}ms`);
        expect(duration).toBeGreaterThanOrEqual(delay);
        expect(duration).toBeLessThan(delay + 50); // Allow some tolerance
      }
    });

    it('should always reject invalid add tool inputs', async () => {
      const invalidInputs = [
        { a: 'string', b: 5 },
        { a: 5, b: 'string' },
        { a: null, b: 5 },
        { a: 5, b: undefined },
        { a: {}, b: 5 },
        { a: 5, b: [] }
      ];

      for (let i = 0; i < invalidInputs.length; i++) {
        const input = {
          tool: 'add',
          args: invalidInputs[i]
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        try {
          await adapter.execute(context, input);
          expect(true).toBe(false); // Should not reach here
        } catch (error) {
          expect(error.message).toContain('Tool invocation failed');
        }
      }
    });

    it('should always reject invalid delay tool inputs', async () => {
      const invalidInputs = [
        { ms: -1 },
        { ms: 'string' },
        { ms: null },
        { ms: undefined },
        { ms: {} },
        { ms: [] }
      ];

      for (let i = 0; i < invalidInputs.length; i++) {
        const input = {
          tool: 'delay',
          args: invalidInputs[i]
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        try {
          await adapter.execute(context, input);
          expect(true).toBe(false); // Should not reach here
        } catch (error) {
          expect(error.message).toContain('Tool invocation failed');
        }
      }
    });
  });

  describe('Concurrency Properties', () => {
    it('should handle concurrent tool executions without interference', async () => {
      for (let i = 0; i < 5; i++) {
        const executions = Array.from({ length: 10 }, (_, j) => {
          const input = {
            tool: 'echo',
            args: { message: `concurrent_${i}_${j}` }
          };
          const context = {
            traceId: `trace_${i}_${j}`,
            sessionId: `session_${i}_${j}`,
            userId: `user_${i}_${j}`,
            metadata: {}
          };
          return adapter.execute(context, input);
        });

        const results = await Promise.all(executions);
        
        expect(results).toHaveLength(10);
        results.forEach((result, j) => {
          expect(result.success).toBe(true);
          expect(result.result.message).toBe(`concurrent_${i}_${j}`);
        });
      }
    });

    it('should handle concurrent tool registrations safely', async () => {
      for (let i = 0; i < 5; i++) {
        const adapter = new ToolAdapter();
        const registry = adapter.toolRegistry;

        // Register multiple tools concurrently
        const tools = Array.from({ length: 10 }, (_, j) => {
          const toolName = `concurrent_tool_${i}_${j}`;
          const tool = {
            name: toolName,
            description: `Concurrent tool ${i}_${j}`,
            execute: async (input) => ({ result: `result_${i}_${j}` })
          };
          registry.registerTool(toolName, tool);
          return toolName;
        });

        // Verify all tools were registered
        tools.forEach(toolName => {
          expect(registry.hasTool(toolName)).toBe(true);
        });

        const allTools = registry.listTools();
        expect(allTools.length).toBeGreaterThanOrEqual(13); // 3 default + 10 new
      }
    });
  });

  describe('Performance Properties', () => {
    it('should always complete within reasonable time', async () => {
      for (let i = 0; i < 20; i++) {
        const startTime = performance.now();
        
        const input = {
          tool: 'echo',
          args: { message: `perf_test_${i}` }
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

    it('should handle large tool input efficiently', async () => {
      for (let i = 0; i < 10; i++) {
        const largeInput = {
          tool: 'echo',
          args: {
            largeString: `value_${i}`.repeat(1000),
            largeArray: Array.from({ length: 1000 }, (_, j) => `item_${i}_${j}`),
            largeObject: {
              nested: {
                deep: {
                  value: `deep_value_${i}`.repeat(100)
                }
              }
            }
          }
        };

        const context = {
          traceId: `trace_${i}`,
          sessionId: `session_${i}`,
          userId: `user_${i}`,
          metadata: {}
        };

        const startTime = performance.now();
        const result = await adapter.execute(context, largeInput);
        const duration = performance.now() - startTime;

        expect(result.success).toBe(true);
        expect(duration).toBeLessThan(500); // Should handle large input within 500ms
      }
    });
  });
});
