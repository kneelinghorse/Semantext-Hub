/**
 * Registry API Server - Test/Mock Implementation
 * 
 * NOTE: This is a TEST/MOCK implementation for URN-based agent discovery.
 * For production registry HTTP server, use: packages/runtime/registry/server.mjs
 * 
 * This module provides:
 * - Mock HTTP server for testing URN registry and discovery
 * - Request handling for test scenarios
 * - Integration testing support
 * 
 * @deprecated For production use, import from packages/runtime/registry/server.mjs
 */

import { EventEmitter } from 'events';
import { 
  URNError, 
  URNFormatError, 
  URNResolutionError,
  generateRequestId,
  createLogEntry,
  DEFAULT_CONFIG
} from './urn-types.js';

import { createURNRegistry } from './urn-registry.js';
import { createAgentDiscoveryService } from './agent-discovery-service.js';

/**
 * API Server Configuration
 * @typedef {Object} APIServerConfig
 * @property {number} port - Server port
 * @property {string} host - Server host
 * @property {Object} cors - CORS configuration
 * @property {Object} rateLimit - Rate limiting configuration
 * @property {Object} registry - Registry configuration
 * @property {Object} discovery - Discovery service configuration
 * @property {boolean} enableLogging - Enable logging
 */

/**
 * HTTP Request Context
 * @typedef {Object} RequestContext
 * @property {string} method - HTTP method
 * @property {string} url - Request URL
 * @property {Object} headers - Request headers
 * @property {Object} query - Query parameters
 * @property {any} body - Request body
 * @property {string} ip - Client IP address
 */

/**
 * HTTP Response Context
 * @typedef {Object} ResponseContext
 * @property {number} statusCode - HTTP status code
 * @property {Object} headers - Response headers
 * @property {any} body - Response body
 */

/**
 * Registry API Server
 */
export class RegistryAPIServer extends EventEmitter {
  constructor(options = {}) {
    super();

    const {
      registryFactory = createURNRegistry,
      discoveryFactory = createAgentDiscoveryService,
      ...configOptions
    } = options;
    
    this.config = {
      port: configOptions.port || DEFAULT_CONFIG.port || 3001,
      host: configOptions.host || DEFAULT_CONFIG.host || 'localhost',
      cors: {
        origin: configOptions.cors?.origin || '*',
        methods: configOptions.cors?.methods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        headers: configOptions.cors?.headers || ['Content-Type', 'Authorization'],
        ...configOptions.cors
      },
      rateLimit: {
        windowMs: configOptions.rateLimit?.windowMs || 60000, // 1 minute
        max: configOptions.rateLimit?.max || 100, // 100 requests per window
        ...configOptions.rateLimit
      },
      registry: configOptions.registry || {},
      discovery: configOptions.discovery || {},
      enableLogging: configOptions.enableLogging !== false,
      ...configOptions
    };

    this.registryFactory = registryFactory;
    this.discoveryFactory = discoveryFactory;
    this.registry = registryFactory(this.config.registry);
    this.discoveryService = discoveryFactory(this.config.discovery);
    this.server = null;
    this.isRunning = false;
    this.requestCounts = new Map();
  }

  /**
   * Start the API server
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      throw new URNError('Server is already running');
    }

    const reqId = generateRequestId();
    
    try {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'api_server_start', {
          port: this.config.port,
          host: this.config.host
        });
        console.debug('[Registry API Server]', logEntry);
      }

      // Initialize services
      await this.registry.initialize();
      await this.discoveryService.initialize();

      // Start mock server (for testing only)
      await this._startMockServer();

      this.isRunning = true;
      this.emit('started', {
        port: this.config.port,
        host: this.config.host
      });

      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'api_server_started', {
          port: this.config.port,
          host: this.config.host
        });
        console.info('[Registry API Server]', logEntry);
      }
    } catch (error) {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'api_server_start_failed', {
          port: this.config.port,
          host: this.config.host,
          error: error.message
        });
        console.error('[Registry API Server]', logEntry);
      }

      throw new URNError(
        `Failed to start API server: ${error.message}`,
        error
      );
    }
  }

  /**
   * Stop the API server
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    const reqId = generateRequestId();
    
    try {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'api_server_stop', {});
        console.debug('[Registry API Server]', logEntry);
      }

      await this._stopMockServer();
      await this.discoveryService.shutdown();
      await this.registry.shutdown();

      this.isRunning = false;
      this.emit('stopped');

      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'api_server_stopped', {});
        console.info('[Registry API Server]', logEntry);
      }
    } catch (error) {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'api_server_stop_failed', {
          error: error.message
        });
        console.error('[Registry API Server]', logEntry);
      }

      throw new URNError(
        `Failed to stop API server: ${error.message}`,
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
        'GET /api/v1/agents',
        'POST /api/v1/agents',
        'GET /api/v1/agents/{urn}',
        'GET /api/v1/agents/domain/{domain}',
        'GET /api/v1/agents/capability/{capability}',
        'GET /api/v1/discover',
        'GET /api/v1/health',
        'GET /api/v1/stats'
      ]
    };
  }

  /**
   * Handle HTTP request
   * @param {RequestContext} request - HTTP request context
   * @returns {Promise<ResponseContext>} HTTP response context
   */
  async handleRequest(request) {
    const reqId = generateRequestId();
    
    try {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'api_request_received', {
          method: request.method,
          url: request.url,
          ip: request.ip
        });
        console.debug('[Registry API Server]', logEntry);
      }

      // Check rate limit
      if (!this._checkRateLimit(request.ip)) {
        return this._handleRateLimitExceeded(request);
      }

      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return this._handleCorsPreflight(request);
      }

      // Route requests
      const response = await this._routeRequest(request);

      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'api_request_success', {
          method: request.method,
          url: request.url,
          statusCode: response.statusCode
        });
        console.debug('[Registry API Server]', logEntry);
      }

      return response;
    } catch (error) {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'api_request_failed', {
          method: request.method,
          url: request.url,
          error: error.message
        });
        console.error('[Registry API Server]', logEntry);
      }

      return this._handleError(request, error);
    }
  }

  /**
   * Start mock server - TEST UTILITY ONLY
   * 
   * NOTE: This is NOT a production HTTP server.
   * For production registry HTTP server, use packages/runtime/registry/server.mjs
   * 
   * This mock server is used only for unit testing URN registry and discovery services.
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
            console.log(`[TEST] Mock Registry API Server on http://${this.config.host}:${this.config.port}`);
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
   * Route HTTP request to appropriate handler
   * @private
   * @param {RequestContext} request - HTTP request context
   * @returns {Promise<ResponseContext>} HTTP response context
   */
  async _routeRequest(request) {
    const { method, url } = request;

    // Health check
    if (url === '/api/v1/health') {
      return this._handleHealthCheck(request);
    }

    // Statistics
    if (url === '/api/v1/stats') {
      return this._handleStats(request);
    }

    // Agent operations
    if (url === '/api/v1/agents' && method === 'GET') {
      return this._handleListAgents(request);
    }

    if (url === '/api/v1/agents' && method === 'POST') {
      return this._handleRegisterAgent(request);
    }

    // List agents by domain
    const domainMatch = url.match(/^\/api\/v1\/agents\/domain\/(.+)$/);
    if (domainMatch && method === 'GET') {
      const domain = decodeURIComponent(domainMatch[1]);
      return this._handleListAgentsByDomain(request, domain);
    }

    // List agents by capability
    const capabilityMatch = url.match(/^\/api\/v1\/agents\/capability\/(.+)$/);
    if (capabilityMatch && method === 'GET') {
      const capability = decodeURIComponent(capabilityMatch[1]);
      return this._handleListAgentsByCapability(request, capability);
    }

    // Get agent by URN
    const urnMatch = url.match(/^\/api\/v1\/agents\/(.+)$/);
    if (urnMatch && method === 'GET') {
      const urn = decodeURIComponent(urnMatch[1]);
      return this._handleGetAgent(request, urn);
    }

    // Discovery endpoint
    if (url === '/api/v1/discover' && method === 'GET') {
      return this._handleDiscoverAgents(request);
    }

    // 404 for unknown routes
    return this._handleNotFound(request);
  }

  /**
   * Handle health check request
   * @private
   * @param {RequestContext} request - HTTP request context
   * @returns {ResponseContext} Response context
   */
  _handleHealthCheck(request) {
    const registryHealth = this.registry.getHealth();
    const discoveryHealth = this.discoveryService.getHealth();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': this.config.cors.origin
      },
      body: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          registry: registryHealth,
          discovery: discoveryHealth
        }
      }
    };
  }

  /**
   * Handle statistics request
   * @private
   * @param {RequestContext} request - HTTP request context
   * @returns {ResponseContext} Response context
   */
  _handleStats(request) {
    const registryStats = this.registry.getStats();
    const discoveryStats = this.discoveryService.getStats();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': this.config.cors.origin
      },
      body: {
        registry: registryStats,
        discovery: discoveryStats,
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString()
        }
      }
    };
  }

  /**
   * Handle list agents request
   * @private
   * @param {RequestContext} request - HTTP request context
   * @returns {Promise<ResponseContext>} Response context
   */
  async _handleListAgents(request) {
    try {
      const query = {
        limit: parseInt(request.query.limit) || 50,
        offset: parseInt(request.query.offset) || 0,
        sort: request.query.sort ? JSON.parse(request.query.sort) : undefined
      };

      const result = await this.discoveryService.discoverAgents(query);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': this.config.cors.origin
        },
        body: result
      };
    } catch (error) {
      throw new URNError(`Failed to list agents: ${error.message}`, error);
    }
  }

  /**
   * Handle register agent request
   * @private
   * @param {RequestContext} request - HTTP request context
   * @returns {Promise<ResponseContext>} Response context
   */
  async _handleRegisterAgent(request) {
    try {
      if (!request.body) {
        throw new URNError('Request body is required');
      }

      const result = await this.discoveryService.registerAgent(request.body);

      return {
        statusCode: 201,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': this.config.cors.origin
        },
        body: result
      };
    } catch (error) {
      if (error instanceof URNFormatError) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': this.config.cors.origin
          },
          body: {
            error: 'Invalid URN format',
            message: error.message
          }
        };
      }

      if (error instanceof URNResolutionError) {
        return {
          statusCode: 409,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': this.config.cors.origin
          },
          body: {
            error: 'Agent already exists',
            message: error.message
          }
        };
      }

      throw error;
    }
  }

  /**
   * Handle get agent request
   * @private
   * @param {RequestContext} request - HTTP request context
   * @param {string} urn - Agent URN
   * @returns {Promise<ResponseContext>} Response context
   */
  async _handleGetAgent(request, urn) {
    try {
      const agent = await this.discoveryService.getAgent(urn);

      if (!agent) {
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': this.config.cors.origin
          },
          body: {
            error: 'Agent not found',
            urn
          }
        };
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': this.config.cors.origin
        },
        body: agent
      };
    } catch (error) {
      if (error instanceof URNFormatError) {
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

      throw error;
    }
  }

  /**
   * Handle list agents by domain request
   * @private
   * @param {RequestContext} request - HTTP request context
   * @param {string} domain - Domain name
   * @returns {Promise<ResponseContext>} Response context
   */
  async _handleListAgentsByDomain(request, domain) {
    try {
      const result = await this.discoveryService.discoverByDomain(domain, {
        limit: parseInt(request.query.limit) || 50,
        offset: parseInt(request.query.offset) || 0
      });

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': this.config.cors.origin
        },
        body: result
      };
    } catch (error) {
      throw new URNError(`Failed to list agents by domain: ${error.message}`, error);
    }
  }

  /**
   * Handle list agents by capability request
   * @private
   * @param {RequestContext} request - HTTP request context
   * @param {string} capability - Capability name
   * @returns {Promise<ResponseContext>} Response context
   */
  async _handleListAgentsByCapability(request, capability) {
    try {
      const result = await this.discoveryService.discoverByCapability(capability, {
        limit: parseInt(request.query.limit) || 50,
        offset: parseInt(request.query.offset) || 0
      });

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': this.config.cors.origin
        },
        body: result
      };
    } catch (error) {
      throw new URNError(`Failed to list agents by capability: ${error.message}`, error);
    }
  }

  /**
   * Handle discover agents request
   * @private
   * @param {RequestContext} request - HTTP request context
   * @returns {Promise<ResponseContext>} Response context
   */
  async _handleDiscoverAgents(request) {
    try {
      const query = {
        domain: request.query.domain,
        capabilities: request.query.capabilities ? request.query.capabilities.split(',') : undefined,
        version: request.query.version,
        name: request.query.name,
        sort: request.query.sort ? JSON.parse(request.query.sort) : undefined,
        limit: parseInt(request.query.limit) || 50,
        offset: parseInt(request.query.offset) || 0,
        includeHealth: request.query.includeHealth === 'true'
      };

      // Remove undefined values
      Object.keys(query).forEach(key => {
        if (query[key] === undefined) {
          delete query[key];
        }
      });

      const result = await this.discoveryService.discoverAgents(query);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': this.config.cors.origin
        },
        body: result
      };
    } catch (error) {
      throw new URNError(`Failed to discover agents: ${error.message}`, error);
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
          'GET /api/v1/agents',
          'POST /api/v1/agents',
          'GET /api/v1/agents/{urn}',
          'GET /api/v1/agents/domain/{domain}',
          'GET /api/v1/agents/capability/{capability}',
          'GET /api/v1/discover',
          'GET /api/v1/health',
          'GET /api/v1/stats'
        ]
      }
    };
  }

  /**
   * Handle rate limit exceeded
   * @private
   * @param {RequestContext} request - HTTP request context
   * @returns {ResponseContext} Response context
   */
  _handleRateLimitExceeded(request) {
    return {
      statusCode: 429,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': this.config.cors.origin,
        'Retry-After': Math.ceil(this.config.rateLimit.windowMs / 1000)
      },
      body: {
        error: 'Rate Limit Exceeded',
        message: `Too many requests from ${request.ip}`,
        retryAfter: Math.ceil(this.config.rateLimit.windowMs / 1000)
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
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': this.config.cors.origin
      },
      body: {
        error: 'Internal Server Error',
        message: error.message,
        requestId: generateRequestId()
      }
    };
  }

  /**
   * Check rate limit for IP
   * @private
   * @param {string} ip - Client IP address
   * @returns {boolean} True if within rate limit
   */
  _checkRateLimit(ip) {
    const now = Date.now();
    const windowStart = now - this.config.rateLimit.windowMs;

    // Get or create request count for IP
    if (!this.requestCounts.has(ip)) {
      this.requestCounts.set(ip, []);
    }

    const requests = this.requestCounts.get(ip);
    
    // Remove old requests outside the window
    const validRequests = requests.filter(timestamp => timestamp > windowStart);
    this.requestCounts.set(ip, validRequests);

    // Check if within limit
    if (validRequests.length >= this.config.rateLimit.max) {
      return false;
    }

    // Add current request
    validRequests.push(now);
    this.requestCounts.set(ip, validRequests);

    return true;
  }
}

/**
 * Create registry API server with default configuration
 * @param {Object} options - Server options
 * @returns {RegistryAPIServer} Server instance
 */
export function createRegistryAPIServer(options = {}) {
  return new RegistryAPIServer(options);
}

/**
 * Convenience function for starting registry API server
 * @param {Object} [options] - Server options
 * @returns {Promise<RegistryAPIServer>} Started server instance
 */
export async function startRegistryAPIServer(options = {}) {
  const server = createRegistryAPIServer(options);
  await server.start();
  return server;
}
