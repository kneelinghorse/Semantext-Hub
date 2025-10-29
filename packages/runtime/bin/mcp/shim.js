/**
 * MCP Server Shim
 * 
 * A minimal MCP server implementation for stdio transport.
 * This is a lightweight adapter that implements the MCP protocol.
 */

import { EventEmitter } from 'events';
import readline from 'readline';

const isWhitespace = (char) =>
  char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f' || char === '\v';

const skipWhitespace = (input, startIndex) => {
  let index = startIndex;
  while (index < input.length && isWhitespace(input[index])) {
    index += 1;
  }
  return index;
};

const decodePartialJsonString = (rawToken, quote) => {
  // rawToken always includes the opening quote.
  if (quote === "'") {
    const inner = rawToken.slice(1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    return inner;
  }

  if (quote !== '"') {
    return undefined;
  }

  let candidate = rawToken;
  while (candidate.endsWith('\\') && candidate.length > 1) {
    candidate = candidate.slice(0, -1);
  }

  try {
    return JSON.parse(candidate + '"');
  } catch {
    // Manual unescape fallback for heavily malformed inputs.
    const inner = candidate.slice(1);
    let result = '';
    let index = 0;
    while (index < inner.length) {
      const current = inner[index];
      if (current === '\\') {
        const next = inner[index + 1];
        if (next === undefined) {
          result += '\\';
          break;
        }

        switch (next) {
          case '"':
          case '\\':
          case '/':
            result += next;
            index += 2;
            continue;
          case 'b':
            result += '\b';
            index += 2;
            continue;
          case 'f':
            result += '\f';
            index += 2;
            continue;
          case 'n':
            result += '\n';
            index += 2;
            continue;
          case 'r':
            result += '\r';
            index += 2;
            continue;
          case 't':
            result += '\t';
            index += 2;
            continue;
          case 'u': {
            const hex = inner.slice(index + 2, index + 6);
            if (/^[0-9a-fA-F]{4}$/.test(hex)) {
              result += String.fromCharCode(parseInt(hex, 16));
              index += 6;
              continue;
            }
            result += '\\u' + hex;
            index += 2 + hex.length;
            continue;
          }
          default:
            result += next;
            index += 2;
            continue;
        }
      }

      result += current;
      index += 1;
    }

    return result;
  }
};

const decodeStringToken = (rawToken, quote, terminated, { allowPartial = false } = {}) => {
  if (terminated) {
    if (quote === '"') {
      try {
        return JSON.parse(rawToken);
      } catch {
        return undefined;
      }
    }

    if (quote === "'") {
      const inner = rawToken.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      return inner;
    }

    return undefined;
  }

  return allowPartial ? decodePartialJsonString(rawToken, quote) : undefined;
};

const readStringTokenFactory = (rawLine) => (startIndex) => {
  const quote = rawLine[startIndex];
  let index = startIndex + 1;
  let escaped = false;

  while (index < rawLine.length) {
    const current = rawLine[index];

    if (escaped) {
      escaped = false;
      index += 1;
      continue;
    }

    if (current === '\\') {
      escaped = true;
      index += 1;
      continue;
    }

    if (current === quote) {
      return {
        raw: rawLine.slice(startIndex, index + 1),
        endIndex: index + 1,
        quote,
        terminated: true,
      };
    }

    index += 1;
  }

  return {
    raw: rawLine.slice(startIndex),
    endIndex: rawLine.length,
    quote,
    terminated: false,
  };
};

const extractTopLevelFields = (rawLine, fieldsToRecover = []) => {
  if (typeof rawLine !== 'string') {
    return {};
  }

  const targets = new Set(fieldsToRecover);
  const collectAll = targets.size === 0;
  const found = {};
  const readStringToken = readStringTokenFactory(rawLine);
  let depth = 0;
  let cursor = 0;
  let recoveredTargetCount = 0;
  const targetCount = targets.size;

  const recordField = (name, value) => {
    if (!collectAll && !targets.has(name)) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(found, name)) {
      return;
    }
    if (value === undefined) {
      return;
    }
    found[name] = value;
    if (!collectAll) {
      recoveredTargetCount += 1;
    }
  };

  while (cursor < rawLine.length) {
    if (!collectAll && recoveredTargetCount === targetCount) {
      break;
    }

    const char = rawLine[cursor];

    if (char === '"' || char === "'") {
      const token = readStringToken(cursor);
      const afterToken = token.endIndex;
      let lookahead = skipWhitespace(rawLine, afterToken);

      const isProperty = token.terminated && lookahead < rawLine.length && rawLine[lookahead] === ':';

      if (isProperty && depth === 1) {
        const propertyName = decodeStringToken(token.raw, token.quote, token.terminated);
        cursor = skipWhitespace(rawLine, lookahead + 1);

        if (!propertyName) {
          cursor = Math.max(cursor, afterToken);
          continue;
        }

        if (cursor >= rawLine.length) {
          continue;
        }

        const valueChar = rawLine[cursor];
        let nextIndex = cursor;
        let decodedValue;

        if (valueChar === '"' || valueChar === "'") {
          const valueToken = readStringToken(cursor);
          decodedValue = decodeStringToken(valueToken.raw, valueToken.quote, valueToken.terminated, { allowPartial: true });
          nextIndex = valueToken.endIndex;
        } else if (valueChar === '-' || (valueChar >= '0' && valueChar <= '9')) {
          const numberMatch = rawLine.slice(cursor).match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
          if (numberMatch) {
            const numeric = Number(numberMatch[0]);
            decodedValue = Number.isFinite(numeric) ? numeric : undefined;
            nextIndex = cursor + numberMatch[0].length;
          }
        } else if (rawLine.startsWith('null', cursor)) {
          const nextChar = rawLine[cursor + 4];
          if (
            nextChar === undefined ||
            nextChar === ',' ||
            nextChar === '}' ||
            nextChar === ']' ||
            isWhitespace(rawLine[cursor + 4])
          ) {
            decodedValue = null;
            nextIndex = cursor + 4;
          }
        } else if (rawLine.startsWith('true', cursor)) {
          decodedValue = true;
          nextIndex = cursor + 4;
        } else if (rawLine.startsWith('false', cursor)) {
          decodedValue = false;
          nextIndex = cursor + 5;
        } else if (valueChar === '{' || valueChar === '[') {
          // Defer complex values to the main scanner so depth tracking stays accurate.
          nextIndex = cursor;
        } else {
          nextIndex = cursor + 1;
        }

        recordField(propertyName, decodedValue);
        cursor = nextIndex;
        continue;
      }

      cursor = afterToken;
      continue;
    }

    if (char === '{' || char === '[') {
      depth += 1;
      cursor += 1;
      continue;
    }

    if (char === '}' || char === ']') {
      depth = Math.max(0, depth - 1);
      cursor += 1;
      continue;
    }

    cursor += 1;
  }

  return found;
};

/**
 * Attempt to recover the request id from malformed JSON input.
 * This is a best-effort extraction so we only use the recovered id
 * when it can be interpreted as a valid JSON-RPC identifier.
 *
 * @param {string} rawLine - The raw line read from stdin
 * @returns {string|number|null|undefined} The recovered id or undefined if it could not be extracted
 */
function extractRequestId(rawLine) {
  const fields = extractTopLevelFields(rawLine, ['id']);
  return Object.prototype.hasOwnProperty.call(fields, 'id') ? fields.id : undefined;
}

const recoverPartialRequestContext = (rawLine) => {
  const fields = extractTopLevelFields(rawLine, ['id', 'jsonrpc', 'method']);
  const context = {};

  if (Object.prototype.hasOwnProperty.call(fields, 'id')) {
    context.id = fields.id;
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'jsonrpc')) {
    context.jsonrpc = fields.jsonrpc;
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'method')) {
    context.method = fields.method;
  }

  return context;
};

const extractJsonParseErrorPosition = (parseError) => {
  const message = parseError?.message;
  if (typeof message !== 'string') {
    return null;
  }

  const match = message.match(/position\s+(\d+)/i);
  if (!match) {
    return null;
  }

  const position = Number.parseInt(match[1], 10);
  return Number.isNaN(position) ? null : position;
};

const buildMalformedJsonErrorPayload = (rawLine, parseError) => {
  const partialContext = recoverPartialRequestContext(rawLine);
  const recoveredId = partialContext.id;
  const { id, ...contextForData } = partialContext;
  const errorPosition = extractJsonParseErrorPosition(parseError);
  const rawString = typeof rawLine === 'string' ? rawLine : null;

  const data = {};

  if (rawString) {
    data.rawExcerpt = rawString.slice(0, 256);
    if (rawString.length > 256) {
      data.rawTruncated = true;
    }
  }

  if (errorPosition !== null) {
    data.position = errorPosition;
  }

  if (Object.keys(contextForData).length > 0) {
    data.recoveredFields = contextForData;
  }

  const hasData = Object.keys(data).length > 0;
  const messageDetail = parseError?.message ? `: ${parseError.message}` : '';

  const errorResponse = {
    jsonrpc: '2.0',
    error: {
      code: -32700,
      message: `Malformed JSON request${messageDetail}`,
      ...(hasData ? { data } : {}),
    },
    id: recoveredId !== undefined ? recoveredId : null,
  };

  const logContext = {
    error: parseError,
    requestId: recoveredId,
    ...contextForData,
  };

  if (rawString) {
    logContext.rawExcerpt = data.rawExcerpt;
    if (rawString.length > 256) {
      logContext.rawTruncated = true;
    }
  }

  if (errorPosition !== null) {
    logContext.position = errorPosition;
  }

  return { errorResponse, recoveredId, logContext };
};

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
          const { errorResponse, logContext } = buildMalformedJsonErrorPayload(line, parseError);
          logger?.error('Error parsing request', logContext);
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
  recoverPartialRequestContext,
  buildMalformedJsonErrorPayload,
};
