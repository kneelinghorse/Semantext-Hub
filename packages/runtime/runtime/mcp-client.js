/**
 * MCP (Model Context Protocol) Client
 * 
 * Production-ready MCP client with:
 * - Connection lifecycle management
 * - Tool listing and schema fetching
 * - Tool execution with timeout and cancellation
 * - Heartbeat/ping support
 * - Connection pooling and retry logic
 * - Structured error handling
 * - Comprehensive logging
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import {
  MCPError,
  MCPConnectionError,
  MCPTimeoutError,
  MCPProtocolError,
  MCPToolError,
  MCPCancellationError,
  DEFAULT_CONFIG,
  MCP_CONSTANTS,
  generateRequestId,
  createLogEntry,
  validateToolSchema,
  parseEndpoint,
  isRetryableError,
  calculateReconnectDelay,
  sleep
} from './mcp-types.js';

import { 
  ErrorHandler, 
  handleError,
  ErrorMappers,
  ErrorContext
} from './error-handler.js';

import { 
  createCircuitBreaker,
  withCircuitBreaker
} from './circuit-breaker.js';

import { 
  createRetryPolicy,
  withRetryPolicy,
  PREDEFINED_POLICIES
} from './retry-policies.js';

import { adapterTracing } from '../../../utils/trace.js';

import { 
  createStructuredLogger,
  LOG_LEVELS,
  context
} from './structured-logger.js';

/**
 * MCP Client
 */
export class MCPClient extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      ...DEFAULT_CONFIG,
      ...options
    };
    
    this.endpoint = parseEndpoint(options.endpoint);
    this.state = {
      connected: false,
      initialized: false,
      serverName: null,
      serverVersion: null,
      capabilities: null,
      lastHeartbeat: null,
      reconnectAttempts: 0
    };
    
    this.process = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.tools = new Map();
    this.resources = new Map();
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.shutdown = false;
    
    // Initialize error handling and resilience components
    this.errorHandler = new ErrorHandler({
      enableLogging: this.config.enableLogging,
      enableMetrics: options.enableMetrics !== false
    });
    
    this.circuitBreaker = createCircuitBreaker({
      failureThreshold: options.circuitBreakerThreshold ?? 3,
      successThreshold: options.circuitBreakerSuccessThreshold ?? 2,
      timeout: options.circuitBreakerTimeout ?? 30000,
      enableLogging: this.config.enableLogging,
      enableMetrics: options.enableMetrics !== false
    });
    
    this.retryPolicy = createRetryPolicy({
      maxRetries: options.maxRetries ?? 3,
      baseDelay: options.baseDelay ?? 1000,
      maxDelay: options.maxDelay ?? 10000,
      backoffMultiplier: options.backoffMultiplier ?? 2,
      jitter: options.jitter !== false,
      enableLogging: this.config.enableLogging,
      enableMetrics: options.enableMetrics !== false
    });
    
    this.logger = createStructuredLogger({
      level: options.logLevel ?? LOG_LEVELS.INFO,
      enableConsole: this.config.enableLogging,
      enableMetrics: options.enableMetrics !== false,
      enableTracing: options.enableTracing !== false
    });
  }

  /**
   * Open connection to MCP server
   * @param {Object} [options] - Connection options
   * @returns {Promise<void>}
   */
  async open(options = {}) {
    if (this.state.connected) {
      throw new MCPConnectionError('Already connected to MCP server');
    }

    const correlationId = context.createCorrelationId();
    const requestId = context.createRequestId();
    
    // Start connection trace
    const traceId = this.logger.startTrace('mcp-connection', {
      correlationId,
      requestId,
      component: 'MCPClient',
      operation: 'open',
      endpoint: this.endpoint
    });
    
    try {
      // Execute with circuit breaker protection
      await this.circuitBreaker.execute(async () => {
        // Execute with retry policy
        return await this.retryPolicy.execute(async () => {
          await this._connect();
          await this._initialize(options);
          this._startHeartbeat();
          
          this.state.connected = true;
          this.state.reconnectAttempts = 0;
          
          return {
            serverName: this.state.serverName,
            serverVersion: this.state.serverVersion,
            capabilities: this.state.capabilities
          };
        });
      });
      
      // Log success
      this.logger.info('MCP connection successful', {
        correlationId,
        requestId,
        component: 'MCPClient',
        operation: 'open',
        endpoint: this.endpoint,
        serverName: this.state.serverName,
        serverVersion: this.state.serverVersion
      });
      
      // Complete trace
      this.logger.completeTrace(traceId, 'completed', {
        result: 'success',
        serverName: this.state.serverName,
        serverVersion: this.state.serverVersion
      });

      this.emit('connected', {
        serverName: this.state.serverName,
        serverVersion: this.state.serverVersion,
        capabilities: this.state.capabilities
      });
    } catch (error) {
      // Handle error with centralized error handler
      const typedError = this.errorHandler.handleError(error, {
        correlationId,
        requestId,
        component: 'MCPClient',
        operation: 'open',
        endpoint: this.endpoint
      });
      
      // Log error
      this.logger.error('MCP connection failed', {
        correlationId,
        requestId,
        component: 'MCPClient',
        operation: 'open',
        endpoint: this.endpoint,
        error: typedError.message,
        errorType: typedError.constructor.name
      });
      
      // Complete trace
      this.logger.completeTrace(traceId, 'failed', {
        error: typedError.message,
        errorType: typedError.constructor.name
      });

      await this._cleanup();
      throw new MCPConnectionError(
        `Failed to connect to MCP server: ${typedError.message}`,
        typedError,
        this.endpoint
      );
    }
  }

  /**
   * Close connection to MCP server
   * @returns {Promise<void>}
   */
  async close() {
    if (!this.state.connected) {
      return;
    }

    const reqId = generateRequestId();
    this.shutdown = true;

    try {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'connection_close', {});
        console.debug('[MCP Client]', logEntry);
      }

      await this._cleanup();
      
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'connection_closed', {});
        console.debug('[MCP Client]', logEntry);
      }

      this.emit('disconnected');
    } catch (error) {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'connection_close_error', {
          error: error.message
        });
        console.error('[MCP Client]', logEntry);
      }
      throw error;
    }
  }

  /**
   * Backward-compatible alias for open()
   * Some examples/docs use connect(); keep alias to avoid breakage.
   * @param {Object} [options]
   * @returns {Promise<void>}
   */
  async connect(options = {}) {
    return this.open(options);
  }

  /**
   * Backward-compatible alias for close()
   * Some examples/docs use disconnect(); keep alias to avoid breakage.
   * @returns {Promise<void>}
   */
  async disconnect() {
    return this.close();
  }

  /**
   * List available tools
   * @returns {Promise<Array<MCPTool>>} List of tools
   */
  async listTools() {
    return adapterTracing.traceMCPOperation('listTools', async () => {
      if (!this.state.connected) {
        throw new MCPConnectionError('Not connected to MCP server');
      }

      const reqId = generateRequestId();
      
      try {
        const response = await this._makeRequest({
          method: MCP_CONSTANTS.METHODS.TOOLS_LIST,
          params: {}
        }, reqId);

        const tools = response.result?.tools || [];
        
        // Update local tools cache
        this.tools.clear();
        tools.forEach(tool => {
          if (validateToolSchema(tool)) {
            this.tools.set(tool.name, tool);
          }
        });

        if (this.config.enableLogging) {
          const logEntry = createLogEntry(reqId, 'tools_listed', {
            count: tools.length
          });
          console.debug('[MCP Client]', logEntry);
        }

        return tools;
      } catch (error) {
        if (this.config.enableLogging) {
          const logEntry = createLogEntry(reqId, 'tools_list_failed', {
            error: error.message
          });
          console.error('[MCP Client]', logEntry);
        }
        throw error;
      }
    });
  }

  /**
   * Get tool schema by name
   * @param {string} toolName - Tool name
   * @returns {Promise<MCPToolSchema>} Tool schema
   */
  async getToolSchema(toolName) {
    if (!this.state.connected) {
      throw new MCPConnectionError('Not connected to MCP server');
    }

    const reqId = generateRequestId();
    
    try {
      // First check local cache
      if (this.tools.has(toolName)) {
        const tool = this.tools.get(toolName);
        if (this.config.enableLogging) {
          const logEntry = createLogEntry(reqId, 'tool_schema_cached', {
            toolName
          });
          console.debug('[MCP Client]', logEntry);
        }
        return tool;
      }

      // Refresh tools list if not in cache
      await this.listTools();
      
      if (!this.tools.has(toolName)) {
        throw new MCPToolError(
          `Tool not found: ${toolName}`,
          null,
          null,
          toolName
        );
      }

      const tool = this.tools.get(toolName);
      
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'tool_schema_fetched', {
          toolName
        });
        console.debug('[MCP Client]', logEntry);
      }

      return tool;
    } catch (error) {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'tool_schema_failed', {
          toolName,
          error: error.message
        });
        console.error('[MCP Client]', logEntry);
      }
      throw error;
    }
  }

  /**
   * Execute a tool
   * @param {string} toolName - Tool name
   * @param {Object} input - Tool input
   * @param {MCPToolOptions} [options] - Execution options
   * @returns {Promise<MCPToolResult>} Tool execution result
   */
  async executeTool(toolName, input, options = {}) {
    return adapterTracing.traceMCPOperation(`executeTool.${toolName}`, async () => {
      if (!this.state.connected) {
        throw new MCPConnectionError('Not connected to MCP server');
      }

      const reqId = generateRequestId();
      const timeout = options.timeout ?? this.config.timeout;
      const signal = options.signal;
    
    try {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'tool_execute_start', {
          toolName,
          timeout
        });
        console.debug('[MCP Client]', logEntry);
      }

      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.get(reqId).reject(
            new MCPTimeoutError(
              `Tool execution timed out after ${timeout}ms`,
              null,
              timeout,
              toolName
            )
          );
        }
      }, timeout);

      // Set up cancellation
      const abortHandler = () => {
        if (this.pendingRequests.has(reqId)) {
          clearTimeout(timeoutId);
          this.pendingRequests.get(reqId).reject(
            new MCPCancellationError(
              'Tool execution was cancelled',
              null,
              toolName
            )
          );
        }
      };

      if (signal) {
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      try {
        const response = await this._makeRequest({
          method: MCP_CONSTANTS.METHODS.TOOLS_CALL,
          params: {
            name: toolName,
            arguments: input
          }
        }, reqId);

        clearTimeout(timeoutId);
        if (signal) {
          signal.removeEventListener('abort', abortHandler);
        }

        const result = {
          success: true,
          content: response.result?.content || [],
          metadata: {
            toolName,
            requestId: reqId,
            timestamp: new Date().toISOString()
          }
        };

        if (this.config.enableLogging) {
          const logEntry = createLogEntry(reqId, 'tool_execute_success', {
            toolName
          });
          console.debug('[MCP Client]', logEntry);
        }

        return result;
      } catch (error) {
        clearTimeout(timeoutId);
        if (signal) {
          signal.removeEventListener('abort', abortHandler);
        }
        throw error;
      }
    } catch (error) {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'tool_execute_failed', {
          toolName,
          error: error.message
        });
        console.error('[MCP Client]', logEntry);
      }

      if (error instanceof MCPTimeoutError || error instanceof MCPCancellationError) {
        throw error;
      }

      throw new MCPToolError(
        `Tool execution failed: ${error.message}`,
        error,
        toolName,
        toolName
      );
    }
    });
  }

  /**
   * Get connection state
   * @returns {MCPConnectionState} Connection state
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Check if connected
   * @returns {boolean} True if connected
   */
  isConnected() {
    return this.state.connected;
  }

  /**
   * Connect to MCP server process
   * @private
   * @returns {Promise<void>}
   */
  async _connect() {
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.endpoint.command, this.endpoint.args, {
          env: { ...process.env, ...this.endpoint.env },
          stdio: ['pipe', 'pipe', 'pipe']
        });

        this.process.on('error', (error) => {
          reject(new MCPConnectionError(
            `Failed to spawn MCP server process: ${error.message}`,
            error
          ));
        });

        this.process.on('exit', (code, signal) => {
          if (!this.shutdown) {
            this.emit('disconnected', { code, signal });
            this._handleDisconnection();
          }
        });

        this.process.stdout.on('data', (data) => {
          this._handleData(data);
        });

        this.process.stderr.on('data', (data) => {
          if (this.config.enableLogging) {
            console.error('[MCP Server]', data.toString());
          }
        });

        // Wait a bit for process to start
        setTimeout(resolve, 100);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Initialize MCP connection
   * @private
   * @param {Object} options - Initialize options
   * @returns {Promise<void>}
   */
  async _initialize(options) {
    const response = await this._makeRequest({
      method: MCP_CONSTANTS.METHODS.INITIALIZE,
      params: {
        protocolVersion: MCP_CONSTANTS.PROTOCOL_VERSION,
        capabilities: options.capabilities || {},
        clientInfo: {
          name: 'Semantext-Hub-MCP-Client',
          version: '1.0.0'
        }
      }
    });

    if (response.error) {
      throw new MCPProtocolError(
        `Initialize failed: ${response.error.message}`,
        null,
        response.error.code,
        MCP_CONSTANTS.METHODS.INITIALIZE
      );
    }

    const result = response.result;
    this.state.initialized = true;
    this.state.serverName = result.serverInfo?.name;
    this.state.serverVersion = result.serverInfo?.version;
    this.state.capabilities = result.capabilities;
  }

  /**
   * Make a request to the MCP server
   * @private
   * @param {Object} request - Request object
   * @param {string} reqId - Request ID
   * @returns {Promise<Object>} Response
   */
  async _makeRequest(request, reqId) {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const message = {
        jsonrpc: MCP_CONSTANTS.JSONRPC_VERSION,
        id,
        ...request
      };

      this.pendingRequests.set(id, { resolve, reject, reqId });

      try {
        const jsonMessage = JSON.stringify(message) + '\n';
        this.process.stdin.write(jsonMessage);
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(new MCPConnectionError(
          `Failed to send request: ${error.message}`,
          error
        ));
      }
    });
  }

  /**
   * Handle data from MCP server
   * @private
   * @param {Buffer} data - Data buffer
   */
  _handleData(data) {
    const lines = data.toString().split('\n');
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          this._handleResponse(response);
        } catch (error) {
          if (this.config.enableLogging) {
            console.error('[MCP Client] Failed to parse response:', line);
          }
        }
      }
    }
  }

  /**
   * Handle response from MCP server
   * @private
   * @param {Object} response - Response object
   */
  _handleResponse(response) {
    const { id } = response;
    
    if (id === undefined || id === null) {
      // This is a notification, not a response
      return;
    }

    const pending = this.pendingRequests.get(id);
    if (!pending) {
      if (this.config.enableLogging) {
        console.warn('[MCP Client] Received response for unknown request:', id);
      }
      return;
    }

    this.pendingRequests.delete(id);
    
    if (response.error) {
      const error = new MCPProtocolError(
        response.error.message,
        null,
        response.error.code,
        'unknown'
      );
      pending.reject(error);
    } else {
      pending.resolve(response);
    }
  }

  /**
   * Start heartbeat timer
   * @private
   */
  _startHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(async () => {
      try {
        await this._ping();
        this.state.lastHeartbeat = new Date();
      } catch (error) {
        if (this.config.enableLogging) {
          console.warn('[MCP Client] Heartbeat failed:', error.message);
        }
        this._handleDisconnection();
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Send ping to server
   * @private
   * @returns {Promise<void>}
   */
  async _ping() {
    // Use a simple tools/list as ping since MCP doesn't have explicit ping
    await this.listTools();
  }

  /**
   * Handle disconnection
   * @private
   */
  _handleDisconnection() {
    if (this.shutdown) {
      return;
    }

    this.state.connected = false;
    this.state.initialized = false;

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new MCPConnectionError('Connection lost'));
    }
    this.pendingRequests.clear();

    // Attempt reconnection if not shutdown
    if (!this.shutdown && this.state.reconnectAttempts < this.config.maxRetries) {
      this.state.reconnectAttempts++;
      const delay = calculateReconnectDelay(this.state.reconnectAttempts - 1);
      
      if (this.config.enableLogging) {
        console.log(`[MCP Client] Reconnecting in ${delay}ms (attempt ${this.state.reconnectAttempts})`);
      }

      this.reconnectTimer = setTimeout(async () => {
        try {
          await this.open();
        } catch (error) {
          if (this.config.enableLogging) {
            console.error('[MCP Client] Reconnection failed:', error.message);
          }
        }
      }, delay);
    }
  }

  /**
   * Cleanup resources
   * @private
   * @returns {Promise<void>}
   */
  async _cleanup() {
    this.shutdown = true;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new MCPConnectionError('Connection closed'));
    }
    this.pendingRequests.clear();

    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.state.connected = false;
    this.state.initialized = false;
  }
}

/**
 * Create MCP client with default configuration
 * @param {Object} options - Client options
 * @returns {MCPClient} Client instance
 */
export function createMCPClient(options = {}) {
  return new MCPClient(options);
}

/**
 * Convenience function for MCP operations
 * @param {string} endpoint - MCP server endpoint
 * @param {Function} operation - Operation to perform
 * @param {Object} [options] - Client options
 * @returns {Promise<any>} Operation result
 */
export async function withMCPClient(endpoint, operation, options = {}) {
  const client = createMCPClient({ endpoint, ...options });
  
  try {
    await client.open();
    return await operation(client);
  } finally {
    await client.close();
  }
}
