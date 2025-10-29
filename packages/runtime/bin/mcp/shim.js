/**
 * MCP Server Shim
 * 
 * A minimal MCP server implementation for stdio transport.
 * This is a lightweight adapter that implements the MCP protocol.
 */

import { EventEmitter } from 'events';
import readline from 'readline';

/**
 * Attempt to recover the request id from malformed JSON input.
 * This is a best-effort extraction so we only use the recovered id
 * when it can be interpreted as a valid JSON-RPC identifier.
 *
 * @param {string} rawLine - The raw line read from stdin
 * @returns {string|number|null|undefined} The recovered id or undefined if it could not be extracted
 */
function extractRequestId(rawLine) {
  if (typeof rawLine !== 'string') {
    return undefined;
  }

  const doubleQuoteMatch = rawLine.match(/"id"\s*:\s*(null|"((?:\\.|[^"\\])*)"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
  const singleQuoteMatch = rawLine.match(/'id'\s*:\s*(null|'((?:\\.|[^'\\])*)'|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
  const match = doubleQuoteMatch ?? singleQuoteMatch;

  if (!match) {
    return undefined;
  }

  const rawValue = match[1];

  if (rawValue === 'null') {
    return null;
  }

  if (rawValue.startsWith('"')) {
    try {
      return JSON.parse(rawValue);
    } catch {
      return undefined;
    }
  }

  if (rawValue.startsWith("'")) {
    const inner = rawValue.slice(1, -1).replace(/\\'/g, "'");
    return inner;
  }

  const asNumber = Number(rawValue);
  return Number.isFinite(asNumber) ? asNumber : undefined;
}

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
        
        let request;
        try {
          request = JSON.parse(line);
        } catch (parseError) {
          const recoveredId = extractRequestId(line);
          logger?.error('Error parsing request', { error: parseError, requestId: recoveredId });
          const errorResponse = {
            jsonrpc: '2.0',
            error: {
              code: -32700,
              message: parseError.message
            },
            id: recoveredId !== undefined ? recoveredId : null
          };
          try {
            process.stdout.write(JSON.stringify(errorResponse) + '\n');
          } catch (writeError) {
            if (writeError.code === 'EPIPE') {
              process.exit(0);
            }
            throw writeError;
          }
          return;
        }
        
        // Handle notifications (no id field means it's a notification)
        if (request.id === undefined || request.id === null) {
          // Don't respond to notifications
          return;
        }
        
        try {
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
          logger?.error('Error handling request', { error, requestId: request.id });
          const errorResponse = {
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: error.message
            },
            id: request.id ?? null
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

export const __testUtils = {
  extractRequestId,
};
