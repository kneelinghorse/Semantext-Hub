/**
 * Well-Known Server for Agent Discovery - Test/Mock Implementation
 * 
 * NOTE: This is a TEST/MOCK implementation for well-known endpoints.
 * For production registry HTTP server, use: packages/runtime/registry/server.mjs
 * 
 * Serves ACM manifests through /.well-known/agent-capabilities endpoint with:
 * - Mock HTTP server for testing
 * - CORS support
 * - Error handling and logging
 * - Integration with ACM generator and URN resolver
 * 
 * @deprecated For production use, integrate with packages/runtime/registry/server.mjs
 */

import { EventEmitter } from 'events';
import { 
  WellKnownError, 
  WellKnownServerError, 
  WellKnownValidationError,
  generateRequestId,
  createLogEntry,
  DEFAULT_CONFIG
} from './well-known-types.js';

import { createACMGenerator } from './acm-generator.js';
import { createURNResolver } from './urn-resolver.js';

/**
 * Well-Known Server Configuration
 * @typedef {Object} WellKnownServerConfig
 * @property {number} port - Server port
 * @property {string} host - Server host
 * @property {Object} cors - CORS configuration
 * @property {Object} acm - ACM generator configuration
 * @property {Object} urn - URN resolver configuration
 */

/**
 * HTTP Request Context
 * @typedef {Object} RequestContext
 * @property {string} method - HTTP method
 * @property {string} url - Request URL
 * @property {Object} headers - Request headers
 * @property {Object} query - Query parameters
 */

/**
 * HTTP Response Context
 * @typedef {Object} ResponseContext
 * @property {number} statusCode - HTTP status code
 * @property {Object} headers - Response headers
 * @property {any} body - Response body
 */

/**
 * Well-Known Server
 */
export class WellKnownServer extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      port: options.port || DEFAULT_CONFIG.port,
      host: options.host || DEFAULT_CONFIG.host,
      cors: {
        origin: options.cors?.origin || '*',
        methods: options.cors?.methods || ['GET', 'OPTIONS'],
        headers: options.cors?.headers || ['Content-Type', 'Authorization'],
        ...options.cors
      },
      enableLogging: options.enableLogging !== false,
      ...options
    };

    this.acmGenerator = createACMGenerator(options.acm);
    this.urnResolver = createURNResolver(options.urn);
    
    this.server = null;
    this.isRunning = false;
  }

  /**
   * Start the well-known server
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      throw new WellKnownServerError('Server is already running');
    }

    const reqId = generateRequestId();
    
    try {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'server_start', {
          port: this.config.port,
          host: this.config.host
        });
        console.debug('[Well-Known Server]', logEntry);
      }

      // Start mock server (for testing only)
      await this._startMockServer();

      this.isRunning = true;
      this.emit('started', {
        port: this.config.port,
        host: this.config.host
      });

      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'server_started', {
          port: this.config.port,
          host: this.config.host
        });
        console.info('[Well-Known Server]', logEntry);
      }
    } catch (error) {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'server_start_failed', {
          port: this.config.port,
          host: this.config.host,
          error: error.message
        });
        console.error('[Well-Known Server]', logEntry);
      }

      throw new WellKnownServerError(
        `Failed to start server: ${error.message}`,
        error
      );
    }
  }

  /**
   * Stop the well-known server
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    const reqId = generateRequestId();
    
    try {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'server_stop', {});
        console.debug('[Well-Known Server]', logEntry);
      }

      await this._stopMockServer();

      this.isRunning = false;
      this.emit('stopped');

      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'server_stopped', {});
        console.info('[Well-Known Server]', logEntry);
      }
    } catch (error) {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'server_stop_failed', {
          error: error.message
        });
        console.error('[Well-Known Server]', logEntry);
      }

      throw new WellKnownServerError(
        `Failed to stop server: ${error.message}`,
        error
      );
    }
  }

  /**
   * Get server status
   * @returns {Object} Server status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      port: this.config.port,
      host: this.config.host,
      endpoints: [
        '/.well-known/agent-capabilities',
        '/.well-known/agent-capabilities/{urn}'
      ]
    };
  }

  /**
   * Start mock server - TEST UTILITY ONLY
   * 
   * NOTE: This is NOT a production HTTP server.
   * For production registry HTTP server, use packages/runtime/registry/server.mjs
   * 
   * This mock server is used only for unit testing well-known endpoints.
   * 
   * @private
   * @returns {Promise<void>}
   */
  async _startMockServer() {
    // TESTING UTILITY: In-memory mock server for unit tests only
    // Production code MUST use packages/runtime/registry/server.mjs
    return new Promise((resolve, reject) => {
      try {
        this.server = {
          listen: (port, host, callback) => {
            setTimeout(() => {
              if (callback) callback();
              resolve();
            }, 10);
          },
          close: (callback) => {
            setTimeout(() => {
              if (callback) callback();
            }, 10);
          }
        };

        this.server.listen(this.config.port, this.config.host, () => {
          if (this.config.enableLogging) {
            console.log(`[TEST] Mock Well-Known Server on http://${this.config.host}:${this.config.port}`);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop mock server - TEST UTILITY ONLY
   * @private
   * @returns {Promise<void>}
   */
  async _stopMockServer() {
    return new Promise((resolve, reject) => {
      try {
        if (this.server) {
          this.server.close((error) => {
            if (error) {
              reject(error);
            } else {
              this.server = null;
              resolve();
            }
          });
        } else {
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle HTTP request
   * @param {RequestContext} request - HTTP request context
   * @returns {Promise<ResponseContext>} HTTP response context
   */
  async handleRequest(request) {
    const reqId = generateRequestId();
    const normalizedRequest = this._normalizeRequest(request);

    try {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'request_received', {
          method: normalizedRequest.method,
          url: normalizedRequest.url
        });
        console.debug('[Well-Known Server]', logEntry);
      }

      // Handle CORS preflight
      if (normalizedRequest.method === 'OPTIONS') {
        return this._handleCorsPreflight(normalizedRequest);
      }

      // Route requests
      if (normalizedRequest.path === '/.well-known/agent-capabilities') {
        return await this._handleCapabilitiesList(normalizedRequest);
      }

      const urnMatch = normalizedRequest.path.match(/^\/\.well-known\/agent-capabilities\/(.+)$/);
      if (urnMatch) {
        const urn = decodeURIComponent(urnMatch[1]);
        return await this._handleCapabilitiesByUrn(normalizedRequest, urn);
      }

      // 404 for unknown routes
      return this._handleNotFound(normalizedRequest);
    } catch (error) {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'request_failed', {
          method: normalizedRequest.method,
          url: normalizedRequest.url,
          error: error.message
        });
        console.error('[Well-Known Server]', logEntry);
      }

      return this._handleError(normalizedRequest, error);
    }
  }

  /**
   * Handle CORS preflight request
   * @private
   * @param {RequestContext} request - HTTP request context
   * @returns {ResponseContext} Response context
   */
  _handleCorsPreflight(request) {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': this.config.cors.origin,
        'Access-Control-Allow-Methods': this.config.cors.methods.join(', '),
        'Access-Control-Allow-Headers': this.config.cors.headers.join(', '),
        'Access-Control-Max-Age': '86400'
      },
      body: ''
    };
  }

  /**
   * Handle capabilities list request
   * @private
   * @param {RequestContext} request - HTTP request context
   * @returns {Promise<ResponseContext>} Response context
   */
  async _handleCapabilitiesList(request) {
    const domain = request.query?.domain || 'default';
    
    try {
      const agents = await this.urnResolver.discoverCapabilities(domain);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': this.config.cors.origin,
          'Cache-Control': 'public, max-age=300'
        },
        body: {
          apiVersion: 'well-known.ossp-agi.io/v1',
          kind: 'AgentCapabilityList',
          metadata: {
            domain,
            count: agents.length,
            generatedAt: new Date().toISOString()
          },
          items: agents
        }
      };
    } catch (error) {
      throw new WellKnownValidationError(
        `Failed to discover capabilities: ${error.message}`,
        error
      );
    }
  }

  /**
   * Handle capabilities by URN request
   * @private
   * @param {RequestContext} request - HTTP request context
   * @param {string} urn - Agent URN
   * @returns {Promise<ResponseContext>} Response context
   */
  async _handleCapabilitiesByUrn(request, urn) {
    try {
      const result = await this.urnResolver.resolveAgentUrn(urn, { useCache: true });
      const metadata = {
        urn,
        ...(result.metadata || {})
      };

      if (request.query?.domain && !metadata.domain) {
        metadata.domain = request.query.domain;
      }
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': this.config.cors.origin,
          'Cache-Control': 'public, max-age=300'
        },
        body: {
          apiVersion: 'well-known.ossp-agi.io/v1',
          kind: 'AgentCapabilityManifest',
          metadata,
          spec: {
            capabilities: result.capabilities,
            resolvedAt: result.resolvedAt,
            cached: result.cached
          }
        }
      };
    } catch (error) {
      if (error.name === 'URNFormatError') {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': this.config.cors.origin
          },
          body: {
            error: 'Invalid URN format',
            message: error.message,
            urn
          }
        };
      }

      if (error.name === 'URNResolutionError' || error.message === 'Agent not found') {
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': this.config.cors.origin
          },
          body: {
            error: 'Agent not found',
            message: error.message,
            urn
          }
        };
      }

      throw error;
    }
  }

  /**
   * Handle 404 Not Found
   * @private
   * @param {RequestContext} request - HTTP request context
   * @returns {ResponseContext} Response context
   */
  _handleNotFound(request) {
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': this.config.cors.origin
      },
      body: {
        error: 'Not Found',
        message: `Endpoint not found: ${request.url}`,
        availableEndpoints: [
          '/.well-known/agent-capabilities',
          '/.well-known/agent-capabilities/{urn}'
        ]
      }
    };
  }

  /**
   * Handle server error
   * @private
   * @param {RequestContext} request - HTTP request context
   * @param {Error} error - Error object
   * @returns {ResponseContext} Response context
   */
  _handleError(request, error) {
    const wrappedError = error instanceof WellKnownError
      ? error
      : new WellKnownServerError('Internal Server Error', error);
    const requestId = generateRequestId();

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': this.config.cors.origin
      },
      body: {
        error: 'Internal Server Error',
        message: wrappedError.cause?.message || error.message,
        requestId,
        details: {
          type: wrappedError.name,
          path: request.url
        },
        timestamp: wrappedError.timestamp
      }
    };
  }

  /**
   * Normalize incoming request with parsed URL/query data
   * @private
   * @param {RequestContext} request
   * @returns {RequestContext & {path: string}}
   */
  _normalizeRequest(request) {
    const method = request.method || 'GET';
    const originalUrl = request.url || '/';
    const parsedUrl = new URL(originalUrl, `http://${this.config.host}:${this.config.port}`);
    const queryFromUrl = Object.fromEntries(parsedUrl.searchParams.entries());
    const mergedQuery = {
      ...queryFromUrl,
      ...(request.query || {})
    };

    return {
      ...request,
      method,
      url: originalUrl,
      path: parsedUrl.pathname,
      query: mergedQuery
    };
  }
}

/**
 * Create well-known server with default configuration
 * @param {Object} options - Server options
 * @returns {WellKnownServer} Server instance
 */
export function createWellKnownServer(options = {}) {
  return new WellKnownServer(options);
}

/**
 * Convenience function for starting well-known server
 * @param {Object} [options] - Server options
 * @returns {Promise<WellKnownServer>} Started server instance
 */
export async function startWellKnownServer(options = {}) {
  const server = createWellKnownServer(options);
  await server.start();
  return server;
}
