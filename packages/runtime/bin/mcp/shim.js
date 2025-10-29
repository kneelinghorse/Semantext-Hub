/**
 * MCP Server Shim
 * 
 * A minimal MCP server implementation for stdio transport.
 * This is a lightweight adapter that implements the MCP protocol.
 */

import { EventEmitter } from 'events';
import readline from 'readline';

/**
 * Creates a stdio-based MCP server
 * @param {Object} config - Server configuration
 * @param {string} config.name - Server name
 * @param {Array} config.tools - Tool definitions
 * @param {Array} config.resources - Resource definitions
 * @returns {Object} Server instance
 */
export function createStdioServer(config) {
  const { name, tools = [], resources = [], logger: providedLogger = null } = config;
  const logger = providedLogger ? providedLogger.child('stdio-server') : null;
  
  class MCPServer extends EventEmitter {
    constructor() {
      super();
      this.tools = new Map();
      this.resources = new Map();
      
      // Register tools
      tools.forEach(tool => {
        this.tools.set(tool.name, tool);
      });
      
      // Register resources
      resources.forEach(resource => {
        this.resources.set(resource.uriTemplate, resource);
      });
    }
    
    listen() {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
      });
      
      rl.on('line', async (line) => {
        // Skip empty lines
        if (!line.trim()) {
          return;
        }
        
        try {
          const request = JSON.parse(line);
          
          // Handle notifications (no id field means it's a notification)
          if (request.id === undefined || request.id === null) {
            // Don't respond to notifications
            return;
          }
          
          const response = await this.handleRequest(request);
          if (response) {
            try {
              process.stdout.write(JSON.stringify(response) + '\n');
            } catch (writeError) {
              if (writeError.code === 'EPIPE') {
                // Client disconnected, exit gracefully
                process.exit(0);
              }
              throw writeError;
            }
          }
        } catch (error) {
          logger?.error('Error handling request', { error });
          const errorResponse = {
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: error.message
            },
            id: null
          };
          try {
            process.stdout.write(JSON.stringify(errorResponse) + '\n');
          } catch (writeError) {
            if (writeError.code === 'EPIPE') {
              process.exit(0);
            }
            throw writeError;
          }
        }
      });
      
      // Handle close event
      rl.on('close', () => {
        logger?.warn('stdin closed');
        process.exit(0);
      });
      
      // Handle process signals
      process.on('SIGINT', () => { logger?.info('SIGINT received'); process.exit(0); });
      process.on('SIGTERM', () => { logger?.info('SIGTERM received'); process.exit(0); });
      
      // Keep process alive
      process.stdin.resume();
    }
    
    async handleRequest(request) {
      const { method, params, id } = request;
      
      switch (method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            result: {
              protocolVersion: params.protocolVersion || '2024-11-05',
              serverInfo: {
                name,
                version: '1.0.0'
              },
              capabilities: {
                tools: this.tools.size > 0 ? {} : undefined,
                resources: this.resources.size > 0 ? {} : undefined
              },
              instructions: 'System Protocols MCP server ready.'
            },
            id
          };
          
        case 'tools/list':
          return {
            jsonrpc: '2.0',
            result: {
              tools: Array.from(this.tools.values()).map(tool => ({
                name: tool.name,
                description: tool.description || '',
                inputSchema: tool.inputSchema
              }))
            },
            id
          };
          
        case 'tools/call':
          const toolName = params.name;
          const tool = this.tools.get(toolName);
          
          if (!tool) {
            return {
              jsonrpc: '2.0',
              error: {
                code: -32601,
                message: `Tool not found: ${toolName}`
              },
              id
            };
          }
          
          try {
            const result = await tool.handler(params.arguments || {});
            return {
              jsonrpc: '2.0',
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                  }
                ]
              },
              id
            };
          } catch (error) {
            return {
              jsonrpc: '2.0',
              error: {
                code: -32603,
                message: error.message
              },
              id
            };
          }
          
        case 'resources/list':
          return {
            jsonrpc: '2.0',
            result: {
              resources: Array.from(this.resources.values()).map(resource => ({
                uri: resource.uriTemplate,
                name: resource.name || resource.uriTemplate,
                description: resource.description || '',
                mimeType: resource.mimeType || 'text/plain'
              }))
            },
            id
          };
          
        case 'resources/read':
          const uri = params.uri;
          let matchedResource = null;
          let extractedParams = {};
          
          // Find matching resource template
          for (const [template, resource] of this.resources) {
            const regex = template.replace(/{(\w+)}/g, '(?<$1>[^/]+)');
            const match = uri.match(new RegExp(`^${regex}$`));
            if (match) {
              matchedResource = resource;
              extractedParams = match.groups || {};
              break;
            }
          }
          
          if (!matchedResource) {
            return {
              jsonrpc: '2.0',
              error: {
                code: -32602,
                message: `Resource not found: ${uri}`
              },
              id
            };
          }
          
          try {
            const result = await matchedResource.read(extractedParams);
            return {
              jsonrpc: '2.0',
              result: {
                contents: [
                  {
                    uri,
                    mimeType: matchedResource.mimeType || 'text/plain',
                    text: result.content
                  }
                ]
              },
              id
            };
          } catch (error) {
            return {
              jsonrpc: '2.0',
              error: {
                code: -32603,
                message: error.message
              },
              id
            };
          }
          
        default:
          // Handle prompts/list specially since it's a common request
          if (method === 'prompts/list') {
            return {
              jsonrpc: '2.0',
              result: {
                prompts: []
              },
              id
            };
          }
          
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
  
  return new MCPServer();
}
