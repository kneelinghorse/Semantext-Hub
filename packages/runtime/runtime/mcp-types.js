/**
 * MCP (Model Context Protocol) Client Types and Error Classes
 * 
 * Defines the interfaces, types, and error classes for the MCP client.
 * Provides typed error handling with structured error information.
 */

/**
 * MCP Client Configuration
 * @typedef {Object} MCPClientConfig
 * @property {string} endpoint - MCP server endpoint (stdio command)
 * @property {Object} [args] - Command arguments
 * @property {Object} [env] - Environment variables
 * @property {number} [timeout] - Default timeout in ms
 * @property {number} [heartbeatInterval] - Heartbeat interval in ms
 * @property {number} [maxRetries] - Maximum retry attempts
 * @property {boolean} [enableLogging] - Enable debug logging
 */

/**
 * MCP Tool Definition
 * @typedef {Object} MCPTool
 * @property {string} name - Tool name
 * @property {string} description - Tool description
 * @property {Object} inputSchema - JSON schema for tool input
 */

/**
 * MCP Tool Schema
 * @typedef {Object} MCPToolSchema
 * @property {string} name - Tool name
 * @property {string} description - Tool description
 * @property {Object} inputSchema - JSON schema for tool input
 */

/**
 * MCP Tool Execution Options
 * @typedef {Object} MCPToolOptions
 * @property {number} [timeout] - Execution timeout in ms
 * @property {AbortSignal} [signal] - Cancellation signal
 * @property {Object} [context] - Additional context
 */

/**
 * MCP Tool Execution Result
 * @typedef {Object} MCPToolResult
 * @property {boolean} success - Whether execution succeeded
 * @property {any} content - Tool output content
 * @property {string} [error] - Error message if failed
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * MCP Connection State
 * @typedef {Object} MCPConnectionState
 * @property {boolean} connected - Whether connected
 * @property {boolean} initialized - Whether initialized
 * @property {string} [serverName] - Server name
 * @property {string} [serverVersion] - Server version
 * @property {Object} [capabilities] - Server capabilities
 * @property {Date} lastHeartbeat - Last heartbeat timestamp
 * @property {number} reconnectAttempts - Number of reconnect attempts
 */

/**
 * Request ID generator for tracking
 * @returns {string} Unique request ID
 */
export function generateRequestId() {
  return `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Base MCP Error class
 */
export class MCPError extends Error {
  constructor(message, cause = null, toolUrn = null) {
    super(message);
    this.name = 'MCPError';
    this.cause = cause;
    this.toolUrn = toolUrn;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * MCP Connection Error
 * Thrown when connection to MCP server fails
 */
export class MCPConnectionError extends MCPError {
  constructor(message, cause = null, endpoint = null) {
    super(message, cause);
    this.name = 'MCPConnectionError';
    this.endpoint = endpoint;
  }
}

/**
 * MCP Timeout Error
 * Thrown when operations time out
 */
export class MCPTimeoutError extends MCPError {
  constructor(message, cause = null, timeout = null, toolUrn = null) {
    super(message, cause, toolUrn);
    this.name = 'MCPTimeoutError';
    this.timeout = timeout;
  }
}

/**
 * MCP Protocol Error
 * Thrown when MCP protocol violations occur
 */
export class MCPProtocolError extends MCPError {
  constructor(message, cause = null, code = null, method = null) {
    super(message, cause);
    this.name = 'MCPProtocolError';
    this.code = code;
    this.method = method;
  }
}

/**
 * MCP Tool Error
 * Thrown when tool execution fails
 */
export class MCPToolError extends MCPError {
  constructor(message, cause = null, toolUrn = null, toolName = null) {
    super(message, cause, toolUrn);
    this.name = 'MCPToolError';
    this.toolName = toolName;
  }
}

/**
 * MCP Cancellation Error
 * Thrown when operations are cancelled
 */
export class MCPCancellationError extends MCPError {
  constructor(message, cause = null, toolUrn = null) {
    super(message, cause, toolUrn);
    this.name = 'MCPCancellationError';
  }
}

/**
 * Default configuration for MCP client
 */
export const DEFAULT_CONFIG = {
  timeout: 30000, // 30 seconds
  heartbeatInterval: 30000, // 30 seconds
  maxRetries: 3,
  reconnectDelay: 1000, // 1 second base delay
  reconnectBackoff: 2, // Exponential backoff multiplier
  reconnectJitter: 0.1, // 10% jitter
  enableLogging: false,
};

/**
 * MCP Protocol Constants
 */
export const MCP_CONSTANTS = {
  PROTOCOL_VERSION: '2024-11-05',
  JSONRPC_VERSION: '2.0',
  METHODS: {
    INITIALIZE: 'initialize',
    TOOLS_LIST: 'tools/list',
    TOOLS_CALL: 'tools/call',
    RESOURCES_LIST: 'resources/list',
    RESOURCES_READ: 'resources/read',
    PROMPTS_LIST: 'prompts/list',
  },
  ERROR_CODES: {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
  },
};

/**
 * Create structured log entry for MCP operations
 * @param {string} reqId - Request ID
 * @param {string} operation - Operation name
 * @param {Object} data - Log data
 * @returns {Object} Structured log entry
 */
export function createLogEntry(reqId, operation, data = {}) {
  return {
    timestamp: new Date().toISOString(),
    reqId,
    operation,
    ...data
  };
}

/**
 * Validate MCP tool schema
 * @param {Object} schema - Tool schema to validate
 * @returns {boolean} True if valid
 */
export function validateToolSchema(schema) {
  if (!schema || typeof schema !== 'object') {
    return false;
  }
  
  if (!schema.name || typeof schema.name !== 'string') {
    return false;
  }
  
  if (!schema.inputSchema || typeof schema.inputSchema !== 'object') {
    return false;
  }
  
  return true;
}

/**
 * Parse MCP endpoint configuration
 * @param {string|Object} endpoint - Endpoint configuration
 * @returns {Object} Parsed endpoint config
 */
export function parseEndpoint(endpoint) {
  if (typeof endpoint === 'string') {
    // Simple string endpoint - assume it's a command
    return {
      command: endpoint,
      args: [],
      env: {}
    };
  }
  
  if (typeof endpoint === 'object' && endpoint !== null) {
    return {
      command: endpoint.command || 'node',
      args: endpoint.args || [],
      env: endpoint.env || {},
      type: endpoint.type || 'stdio'
    };
  }
  
  throw new MCPError(`Invalid endpoint configuration: ${endpoint}`);
}

/**
 * Check if error is retryable
 * @param {Error} error - Error to check
 * @returns {boolean} True if retryable
 */
export function isRetryableError(error) {
  if (error instanceof MCPConnectionError) {
    return true;
  }
  
  if (error instanceof MCPTimeoutError) {
    return false; // Don't retry timeouts
  }
  
  if (error instanceof MCPProtocolError) {
    return false; // Don't retry protocol errors
  }
  
  if (error instanceof MCPToolError) {
    return false; // Don't retry tool errors
  }
  
  if (error instanceof MCPCancellationError) {
    return false; // Don't retry cancellations
  }
  
  return false;
}

/**
 * Calculate reconnect delay with exponential backoff and jitter
 * @param {number} attempt - Current attempt number (0-based)
 * @param {number} baseDelay - Base delay in ms
 * @param {number} backoff - Backoff multiplier
 * @param {number} jitter - Jitter factor (0-1)
 * @returns {number} Delay in ms
 */
export function calculateReconnectDelay(attempt, baseDelay = DEFAULT_CONFIG.reconnectDelay, backoff = DEFAULT_CONFIG.reconnectBackoff, jitter = DEFAULT_CONFIG.reconnectJitter) {
  const exponentialDelay = baseDelay * Math.pow(backoff, attempt);
  const jitterAmount = exponentialDelay * jitter * Math.random();
  return Math.floor(exponentialDelay + jitterAmount);
}

/**
 * Sleep utility for delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
