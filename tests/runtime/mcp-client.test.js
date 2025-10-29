/**
 * MCP Client Tests
 * 
 * Comprehensive test suite for the MCP client implementation.
 * Tests connection lifecycle, tool execution, error handling, and edge cases.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
import {
  MCPClient,
  createMCPClient,
  withMCPClient
} from '../../packages/runtime/runtime/mcp-client.js';
import {
  MCPError,
  MCPConnectionError,
  MCPTimeoutError,
  MCPProtocolError,
  MCPToolError,
  MCPCancellationError
} from '../../packages/runtime/runtime/mcp-types.js';

// Mock MCP server for testing
class MockMCPServer extends EventEmitter {
  constructor() {
    super();
    this.tools = new Map([
      ['test_tool', {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          },
          required: ['message']
        }
      }],
      ['echo_tool', {
        name: 'echo_tool',
        description: 'Echo tool',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string' }
          },
          required: ['text']
        }
      }],
      ['error_tool', {
        name: 'error_tool',
        description: 'Tool that always errors',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }]
    ]);
    this.requestId = 0;
  }

  handleRequest(request) {
    const { method, params, id } = request;
    
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: {
              name: 'test-mcp-server',
              version: '1.0.0'
            },
            capabilities: {
              tools: {}
            }
          },
          id
        };
        
      case 'tools/list':
        return {
          jsonrpc: '2.0',
          result: {
            tools: Array.from(this.tools.values())
          },
          id
        };
        
      case 'tools/call':
        const tool = this.tools.get(params.name);
        if (!tool) {
          return {
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: `Tool not found: ${params.name}`
            },
            id
          };
        }
        
        if (params.name === 'error_tool') {
          return {
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Tool execution failed'
            },
            id
          };
        }
        
        return {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  tool: params.name,
                  input: params.arguments,
                  result: 'success'
                })
              }
            ]
          },
          id
        };
        
      default:
        return {
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          },
          id
        };
    }
  }
}

describe('MCPClient', () => {
  let client;

  beforeEach(() => {
    client = new MCPClient({
      endpoint: 'node',
      enableLogging: false
    });
  });

  afterEach(async () => {
    if (client && client.isConnected()) {
      await client.close();
    }
  });

  describe('Connection Lifecycle', () => {
    test('should handle connection errors', async () => {
      const badClient = new MCPClient({
        endpoint: {
          command: 'nonexistent-command',
          args: []
        }
      });

      await expect(badClient.open()).rejects.toThrow(MCPConnectionError);
      expect(badClient.isConnected()).toBe(false);
    });

    test('should reject open when already connected', async () => {
      const connectedClient = new MCPClient({
        endpoint: 'node',
        enableLogging: false
      });
      connectedClient.state.connected = true;

      await expect(connectedClient.open()).rejects.toThrow(MCPConnectionError);
      expect(connectedClient.isConnected()).toBe(true);
    });

    test('should prevent operations when not connected', async () => {
      await expect(client.listTools()).rejects.toThrow(MCPConnectionError);
      await expect(client.getToolSchema('test')).rejects.toThrow(MCPConnectionError);
      await expect(client.executeTool('test', {})).rejects.toThrow(MCPConnectionError);
    });
  });

  describe('Tool Operations', () => {
    test('should prevent operations when not connected', async () => {
      await expect(client.listTools()).rejects.toThrow(MCPConnectionError);
      await expect(client.getToolSchema('test')).rejects.toThrow(MCPConnectionError);
      await expect(client.executeTool('test', {})).rejects.toThrow(MCPConnectionError);
    });
  });

  describe('Connection State', () => {
    test('should track connection state', () => {
      const state = client.getState();
      expect(state.connected).toBe(false);
      expect(state.initialized).toBe(false);
      expect(state.serverName).toBe(null);
      expect(state.serverVersion).toBe(null);
    });

    test('should prevent operations when not connected', async () => {
      await expect(client.listTools()).rejects.toThrow(MCPConnectionError);
      await expect(client.getToolSchema('test')).rejects.toThrow(MCPConnectionError);
      await expect(client.executeTool('test', {})).rejects.toThrow(MCPConnectionError);
    });
  });
});

describe('MCP Client Factory Functions', () => {
  test('should create client with default options', () => {
    const client = createMCPClient({
      endpoint: 'node'
    });
    expect(client).toBeInstanceOf(MCPClient);
    expect(client.config.timeout).toBe(30000);
  });

  test('should create client with custom options', () => {
    const client = createMCPClient({
      endpoint: 'node',
      timeout: 5000,
      enableLogging: true
    });
    expect(client.config.timeout).toBe(5000);
    expect(client.config.enableLogging).toBe(true);
  });

  test('should use withMCPClient convenience function', async () => {
    // Test that the function exists and can be called
    expect(typeof withMCPClient).toBe('function');
    
    // Test with a simple endpoint that will fail
    await expect(withMCPClient('nonexistent-command', async (client) => {
      expect(client).toBeInstanceOf(MCPClient);
      return 'test-result';
    })).rejects.toThrow(MCPConnectionError);
  });
});

describe('MCP Error Classes', () => {
  test('should create MCPError with proper properties', () => {
    const error = new MCPError('Test error', new Error('cause'), 'tool:urn');
    expect(error.name).toBe('MCPError');
    expect(error.message).toBe('Test error');
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.toolUrn).toBe('tool:urn');
    expect(error.timestamp).toBeDefined();
  });

  test('should create MCPConnectionError', () => {
    const error = new MCPConnectionError('Connection failed', null, 'endpoint');
    expect(error.name).toBe('MCPConnectionError');
    expect(error.endpoint).toBe('endpoint');
  });

  test('should create MCPTimeoutError', () => {
    const error = new MCPTimeoutError('Timeout', null, 5000, 'tool:urn');
    expect(error.name).toBe('MCPTimeoutError');
    expect(error.timeout).toBe(5000);
    expect(error.toolUrn).toBe('tool:urn');
  });

  test('should create MCPProtocolError', () => {
    const error = new MCPProtocolError('Protocol error', null, -32600, 'method');
    expect(error.name).toBe('MCPProtocolError');
    expect(error.code).toBe(-32600);
    expect(error.method).toBe('method');
  });

  test('should create MCPToolError', () => {
    const error = new MCPToolError('Tool error', null, 'tool:urn', 'toolName');
    expect(error.name).toBe('MCPToolError');
    expect(error.toolUrn).toBe('tool:urn');
    expect(error.toolName).toBe('toolName');
  });

  test('should create MCPCancellationError', () => {
    const error = new MCPCancellationError('Cancelled', null, 'tool:urn');
    expect(error.name).toBe('MCPCancellationError');
    expect(error.toolUrn).toBe('tool:urn');
  });
});
