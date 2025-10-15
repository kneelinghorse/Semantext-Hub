/**
 * Tests for Tool adapter
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import ToolAdapter from '../../packages/runtime/workflow/adapters/toolAdapter.js';
import { ValidationError, AdapterExecutionError } from '../../packages/runtime/workflow/types.js';

describe('ToolAdapter', () => {
  let adapter;
  let mockToolRegistry;

  beforeEach(() => {
    mockToolRegistry = {
      getTool: jest.fn(),
      listTools: jest.fn(),
      registerTool: jest.fn(),
      hasTool: jest.fn()
    };
    adapter = new ToolAdapter({ toolRegistry: mockToolRegistry });
    jest.clearAllMocks();
  });

  describe('validateInput', () => {
    it('should validate valid input', () => {
      const input = {
        tool: 'echo',
        args: { message: 'test' }
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

    it('should reject missing tool name', () => {
      const input = { args: { message: 'test' } };
      const result = adapter.validateInput(input);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Tool name is required');
    });

    it('should reject empty tool name', () => {
      const input = {
        tool: '',
        args: { message: 'test' }
      };
      const result = adapter.validateInput(input);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Tool name must be a non-empty string');
    });

    it('should reject non-string tool name', () => {
      const input = {
        tool: 123,
        args: { message: 'test' }
      };
      const result = adapter.validateInput(input);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Tool name must be a string');
    });

    it('should reject invalid timeout', () => {
      const input = {
        tool: 'echo',
        timeout: -1
      };
      const result = adapter.validateInput(input);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Timeout must be a positive number');
    });

    it('should reject invalid max retries', () => {
      const input = {
        tool: 'echo',
        maxRetries: 15
      };
      const result = adapter.validateInput(input);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Max retries must be a number between 0 and 10');
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

    it('should execute successful tool invocation', async () => {
      const mockTool = {
        name: 'echo',
        execute: jest.fn().mockResolvedValue({ result: 'echoed message' })
      };

      mockToolRegistry.getTool.mockReturnValue(mockTool);
      mockToolRegistry.listTools.mockReturnValue(['echo', 'add', 'delay']);

      const input = {
        tool: 'echo',
        args: { message: 'test' }
      };

      const result = await adapter.execute(context, input);

      expect(result.success).toBe(true);
      expect(result.tool).toBe('echo');
      expect(result.result).toBe('echoed message');
      expect(result.metadata.traceId).toBe('test-trace');
      expect(mockTool.execute).toHaveBeenCalledWith({
        message: 'test',
        _context: expect.objectContaining({
          traceId: 'test-trace'
        })
      });
    });

    it('should handle tool execution timeout', async () => {
      const adapter = new ToolAdapter({ 
        toolRegistry: mockToolRegistry,
        timeout: 100
      });

      const mockTool = {
        name: 'slow-tool',
        execute: jest.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(resolve, 200))
        )
      };

      mockToolRegistry.getTool.mockReturnValue(mockTool);

      const input = {
        tool: 'slow-tool',
        args: {}
      };

      await expect(adapter.execute(context, input)).rejects.toThrow(AdapterExecutionError);
    });

    it('should retry on tool execution failure', async () => {
      const adapter = new ToolAdapter({ 
        toolRegistry: mockToolRegistry,
        maxRetries: 2,
        timeout: 1000
      });

      const mockTool = {
        name: 'unreliable-tool',
        execute: jest.fn()
          .mockRejectedValueOnce(new Error('Temporary failure'))
          .mockRejectedValueOnce(new Error('Temporary failure'))
          .mockResolvedValue({ result: 'success' })
      };

      mockToolRegistry.getTool.mockReturnValue(mockTool);

      const input = {
        tool: 'unreliable-tool',
        args: {}
      };

      const result = await adapter.execute(context, input);

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(mockTool.execute).toHaveBeenCalledTimes(3);
    });

    it('should not retry on validation errors', async () => {
      const adapter = new ToolAdapter({ 
        toolRegistry: mockToolRegistry,
        maxRetries: 2
      });

      const mockTool = {
        name: 'validation-tool',
        execute: jest.fn().mockRejectedValue(new Error('must be a number'))
      };

      mockToolRegistry.getTool.mockReturnValue(mockTool);

      const input = {
        tool: 'validation-tool',
        args: {}
      };

      await expect(adapter.execute(context, input)).rejects.toThrow(AdapterExecutionError);
      expect(mockTool.execute).toHaveBeenCalledTimes(1);
    });

    it('should throw validation error for invalid input', async () => {
      const input = { tool: '' };

      await expect(adapter.execute(context, input)).rejects.toThrow(AdapterExecutionError);
    });

    it('should handle missing tool', async () => {
      mockToolRegistry.getTool.mockReturnValue(null);
      mockToolRegistry.listTools.mockReturnValue(['echo', 'add']);

      const input = {
        tool: 'nonexistent',
        args: {}
      };

      await expect(adapter.execute(context, input)).rejects.toThrow(AdapterExecutionError);
    });

    it('should handle missing tool registry', async () => {
      const adapter = new ToolAdapter({ toolRegistry: null });

      const input = {
        tool: 'nonexistent-tool',
        args: {}
      };

      await expect(adapter.execute(context, input)).rejects.toThrow(AdapterExecutionError);
    });
  });

  describe('createDefaultToolRegistry', () => {
    it('should create default tool registry', () => {
      const adapter = new ToolAdapter();
      expect(adapter.toolRegistry).toBeDefined();
      expect(typeof adapter.toolRegistry.getTool).toBe('function');
      expect(typeof adapter.toolRegistry.listTools).toBe('function');
    });

    it('should have default tools', () => {
      const adapter = new ToolAdapter();
      const tools = adapter.toolRegistry.listTools();
      expect(tools).toContain('echo');
      expect(tools).toContain('add');
      expect(tools).toContain('delay');
    });

    it('should execute echo tool', async () => {
      const adapter = new ToolAdapter();
      const context = { 
        traceId: 'test-trace',
        getElapsedTime: jest.fn().mockReturnValue(100)
      };

      const input = {
        tool: 'echo',
        args: { message: 'test' }
      };

      const result = await adapter.execute(context, input);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ 
        message: 'test',
        _context: expect.objectContaining({
          traceId: 'test-trace'
        })
      });
    });

    it('should execute add tool', async () => {
      const adapter = new ToolAdapter();
      const context = { 
        traceId: 'test-trace',
        getElapsedTime: jest.fn().mockReturnValue(100)
      };

      const input = {
        tool: 'add',
        args: { a: 5, b: 3 }
      };

      const result = await adapter.execute(context, input);

      expect(result.success).toBe(true);
      expect(result.result).toBe(8);
    });

    it('should execute delay tool', async () => {
      const adapter = new ToolAdapter();
      const context = { 
        traceId: 'test-trace',
        getElapsedTime: jest.fn().mockReturnValue(100)
      };

      const input = {
        tool: 'delay',
        args: { ms: 10 }
      };

      const startTime = Date.now();
      const result = await adapter.execute(context, input);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.result).toBe('Delayed for 10ms');
      expect(duration).toBeGreaterThanOrEqual(10);
    });

    it('should handle add tool validation error', async () => {
      const adapter = new ToolAdapter();
      const context = { 
        traceId: 'test-trace',
        getElapsedTime: jest.fn().mockReturnValue(100)
      };

      const input = {
        tool: 'add',
        args: { a: 'invalid', b: 3 }
      };

      await expect(adapter.execute(context, input)).rejects.toThrow(AdapterExecutionError);
    });
  });

  describe('getMetadata', () => {
    it('should return adapter metadata', () => {
      mockToolRegistry.listTools.mockReturnValue(['echo', 'add']);

      const metadata = adapter.getMetadata();
      expect(metadata).toEqual({
        kind: 'tool',
        version: '1.0.0',
        description: 'Tool adapter for workflow execution',
        config: {
          timeout: 30000,
          maxRetries: 3,
          toolRegistry: true
        },
        availableTools: ['echo', 'add']
      });
    });

    it('should return metadata with custom config', () => {
      const adapter = new ToolAdapter({
        timeout: 10000,
        maxRetries: 5
      });
      
      const metadata = adapter.getMetadata();
      expect(metadata.config).toEqual({
        timeout: 10000,
        maxRetries: 5,
        toolRegistry: false
      });
    });
  });
});
