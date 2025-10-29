/**
 * URN Resolver for Agent Discovery
 * 
 * Resolves agent URNs to metadata and capabilities with:
 * - URN parsing and validation
 * - Agent metadata resolution
 * - Capability discovery
 * - Caching with TTL
 * - Error handling and retry logic
 * - Comprehensive logging
 */

import { 
  URNError, 
  URNResolutionError, 
  URNFormatError,
  generateRequestId,
  createLogEntry,
  DEFAULT_CONFIG,
  parseAgentUrn,
  calculateRetryDelay
} from './urn-types.js';

/**
 * Agent Metadata
 * @typedef {Object} AgentMetadata
 * @property {string} urn - Agent URN
 * @property {string} name - Agent name
 * @property {string} version - Agent version
 * @property {string} description - Agent description
 * @property {Object} capabilities - Agent capabilities
 * @property {Object} endpoints - Agent endpoints
 * @property {string} lastUpdated - Last update timestamp
 */

/**
 * URN Resolution Result
 * @typedef {Object} URNResolutionResult
 * @property {AgentMetadata} metadata - Agent metadata
 * @property {Object} capabilities - Agent capabilities
 * @property {boolean} cached - Whether result was cached
 * @property {string} resolvedAt - Resolution timestamp
 */

/**
 * URN Resolver
 */
export class URNResolver {
  constructor(options = {}) {
    this.enableLogging = options.enableLogging !== false;
    this.cacheTtl = options.cacheTtl || DEFAULT_CONFIG.cacheTtl;
    this.maxRetries = options.maxRetries || DEFAULT_CONFIG.maxRetries;
    this.retryDelay = options.retryDelay || DEFAULT_CONFIG.retryDelay;
    this.retryBackoff = options.retryBackoff || DEFAULT_CONFIG.retryBackoff;
    this.logger = options.logger ?? null;
    
    // In-memory cache
    this.cache = new Map();
    this.cacheTimestamps = new Map();
  }

  /**
   * Resolve agent URN to metadata and capabilities
   * @param {string} urn - Agent URN
   * @param {Object} [options] - Resolution options
   * @returns {Promise<URNResolutionResult>} Resolution result
   */
  async resolveAgentUrn(urn, options = {}) {
    const reqId = generateRequestId();
    const useCache = options.useCache !== false;
    
    try {
      this._log('debug', reqId, 'urn_resolution_start', {
        urn,
        useCache
      });

      // Validate URN format
      this._validateUrnFormat(urn);

      // Check cache first
      if (useCache) {
        const cached = this._getCachedResult(urn);
        if (cached) {
          this._log('debug', reqId, 'urn_resolution_cached', {
            urn
          });
          return cached;
        }
      }

      // Resolve with retry logic
      const result = await this._resolveWithRetry(urn, reqId);

      // Cache result
      if (useCache) {
        this._cacheResult(urn, result);
      }

      this._log('debug', reqId, 'urn_resolution_success', {
        urn,
        agentName: result.metadata.name,
        capabilitiesCount: Object.keys(result.capabilities).length
      });

      return result;
    } catch (error) {
      this._log('error', reqId, 'urn_resolution_failed', {
        urn,
        error: error.message
      });

      if (error instanceof URNError) {
        throw error;
      }

      throw new URNResolutionError(
        `Failed to resolve URN ${urn}: ${error.message}`,
        error,
        urn
      );
    }
  }

  /**
   * Discover capabilities by domain
   * @param {string} domain - Agent domain
   * @param {Object} [options] - Discovery options
   * @returns {Promise<Array<AgentMetadata>>} List of agents in domain
   */
  async discoverCapabilities(domain, options = {}) {
    const reqId = generateRequestId();
    
    try {
      this._log('debug', reqId, 'capability_discovery_start', {
        domain
      });

      // For now, return mock data based on domain
      // In a real implementation, this would query a registry service
      const agents = await this._discoverAgentsByDomain(domain);

      this._log('debug', reqId, 'capability_discovery_success', {
        domain,
        agentsCount: agents.length
      });

      return agents;
    } catch (error) {
      this._log('error', reqId, 'capability_discovery_failed', {
        domain,
        error: error.message
      });

      throw new URNResolutionError(
        `Failed to discover capabilities for domain ${domain}: ${error.message}`,
        error,
        domain
      );
    }
  }

  /**
   * Clear cache for a specific URN or all URNs
   * @param {string} [urn] - Specific URN to clear, or undefined for all
   */
  clearCache(urn = undefined) {
    if (urn) {
      this.cache.delete(urn);
      this.cacheTimestamps.delete(urn);
    } else {
      this.cache.clear();
      this.cacheTimestamps.clear();
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
      oldestEntry: this._getOldestCacheEntry(),
      newestEntry: this._getNewestCacheEntry()
    };
  }

  /**
   * Validate URN format
   * @private
   * @param {string} urn - Agent URN
   */
  _validateUrnFormat(urn) {
    if (!urn || typeof urn !== 'string') {
      throw new URNFormatError('URN must be a non-empty string');
    }

    try {
      parseAgentUrn(urn);
    } catch (error) {
      throw new URNFormatError(`Invalid URN format: ${urn}`, error);
    }
  }

  /**
   * Resolve URN with retry logic
   * @private
   * @param {string} urn - Agent URN
   * @param {string} reqId - Request ID
   * @returns {Promise<URNResolutionResult>} Resolution result
   */
  async _resolveWithRetry(urn, reqId) {
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this._resolveSingleUrn(urn);
        
        return {
          metadata: result.metadata,
          capabilities: result.capabilities,
          cached: false,
          resolvedAt: new Date().toISOString()
        };
      } catch (error) {
        lastError = error;

        // Don't retry on format errors
        if (error instanceof URNFormatError) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt >= this.maxRetries) {
          break;
        }

        // Calculate delay and retry
        const delay = calculateRetryDelay(attempt, this.retryDelay, this.retryBackoff);
        
        this._log('warn', reqId, 'urn_resolution_retry', {
          urn,
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          delay,
          error: error.message
        });

        await this._sleep(delay);
      }
    }

    // All retries exhausted
    throw new URNResolutionError(
      `Failed to resolve URN ${urn} after ${this.maxRetries + 1} attempts`,
      lastError,
      urn
    );
  }

  /**
   * Resolve single URN (mock implementation)
   * @private
   * @param {string} urn - Agent URN
   * @returns {Promise<Object>} Resolution result
   */
  async _resolveSingleUrn(urn) {
    // Parse URN to extract components
    const agentInfo = parseAgentUrn(urn);
    
    // Mock resolution - in real implementation, this would query a registry
    await this._sleep(100); // Simulate network delay
    
    const mockCapabilities = this._generateMockCapabilities(agentInfo.domain);
    
    return {
      metadata: {
        urn: urn,
        name: agentInfo.name,
        version: agentInfo.version,
        description: `Mock agent ${agentInfo.name} in domain ${agentInfo.domain}`,
        capabilities: mockCapabilities,
        endpoints: {
          wellKnown: `/.well-known/agent-capabilities`,
          api: `/api/v1`
        },
        lastUpdated: new Date().toISOString()
      },
      capabilities: mockCapabilities
    };
  }

  /**
   * Discover agents by domain (mock implementation)
   * @private
   * @param {string} domain - Agent domain
   * @returns {Promise<Array<AgentMetadata>>} List of agents
   */
  async _discoverAgentsByDomain(domain) {
    // Mock discovery - in real implementation, this would query a registry
    await this._sleep(50); // Simulate network delay
    
    const mockAgents = [
      {
        urn: `urn:agent:${domain}:agent1@1.0.0`,
        name: 'agent1',
        version: '1.0.0',
        description: `Mock agent 1 in domain ${domain}`,
        capabilities: this._generateMockCapabilities(domain),
        endpoints: {
          wellKnown: `/.well-known/agent-capabilities`,
          api: `/api/v1`
        },
        lastUpdated: new Date().toISOString()
      },
      {
        urn: `urn:agent:${domain}:agent2@2.1.0`,
        name: 'agent2',
        version: '2.1.0',
        description: `Mock agent 2 in domain ${domain}`,
        capabilities: this._generateMockCapabilities(domain),
        endpoints: {
          wellKnown: `/.well-known/agent-capabilities`,
          api: `/api/v1`
        },
        lastUpdated: new Date().toISOString()
      }
    ];

    return mockAgents;
  }

  /**
   * Generate mock capabilities based on domain
   * @private
   * @param {string} domain - Agent domain
   * @returns {Object} Mock capabilities
   */
  _generateMockCapabilities(domain) {
    const baseCapabilities = {
      'data-processing': {
        type: 'service',
        description: 'Data processing capabilities',
        version: '1.0.0'
      },
      'api-client': {
        type: 'client',
        description: 'API client capabilities',
        version: '1.0.0'
      }
    };

    // Add domain-specific capabilities
    if (domain === 'ai') {
      baseCapabilities['ml-inference'] = {
        type: 'service',
        description: 'Machine learning inference',
        version: '1.0.0'
      };
    } else if (domain === 'data') {
      baseCapabilities['etl'] = {
        type: 'service',
        description: 'Extract, Transform, Load operations',
        version: '1.0.0'
      };
    }

    return baseCapabilities;
  }

  /**
   * Get cached result if valid
   * @private
   * @param {string} urn - Agent URN
   * @returns {URNResolutionResult|null} Cached result or null
   */
  _getCachedResult(urn) {
    const cached = this.cache.get(urn);
    const timestamp = this.cacheTimestamps.get(urn);
    
    if (!cached || !timestamp) {
      return null;
    }

    const age = Date.now() - timestamp;
    if (age > this.cacheTtl) {
      this.cache.delete(urn);
      this.cacheTimestamps.delete(urn);
      return null;
    }

    return {
      ...cached,
      cached: true
    };
  }

  /**
   * Cache resolution result
   * @private
   * @param {string} urn - Agent URN
   * @param {URNResolutionResult} result - Resolution result
   */
  _cacheResult(urn, result) {
    this.cache.set(urn, result);
    this.cacheTimestamps.set(urn, Date.now());
  }

  /**
   * Get oldest cache entry timestamp
   * @private
   * @returns {number|null} Oldest timestamp or null
   */
  _getOldestCacheEntry() {
    if (this.cacheTimestamps.size === 0) {
      return null;
    }
    return Math.min(...this.cacheTimestamps.values());
  }

  /**
   * Get newest cache entry timestamp
   * @private
   * @returns {number|null} Newest timestamp or null
   */
  _getNewestCacheEntry() {
    if (this.cacheTimestamps.size === 0) {
      return null;
    }
    return Math.max(...this.cacheTimestamps.values());
  }

  /**
   * Write structured log entry when logger is available
   * @private
   * @param {('debug'|'info'|'warn'|'error')} level - Log level
   * @param {string} reqId - Request identifier
   * @param {string} operation - Operation name
   * @param {Object} data - Additional context
   */
  _log(level, reqId, operation, data = {}) {
    if (!this.enableLogging || !this.logger || typeof this.logger[level] !== 'function') {
      return;
    }

    const logEntry = createLogEntry(reqId, operation, data);
    const { operation: _operation, ...context } = logEntry;
    this.logger[level](operation, context);
  }

  /**
   * Sleep utility for delays
   * @private
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create URN resolver with default configuration
 * @param {Object} options - Resolver options
 * @returns {URNResolver} Resolver instance
 */
export function createURNResolver(options = {}) {
  return new URNResolver(options);
}

/**
 * Convenience function for resolving agent URN
 * @param {string} urn - Agent URN
 * @param {Object} [options] - Resolution options
 * @returns {Promise<URNResolutionResult>} Resolution result
 */
export async function resolveAgentUrn(urn, options = {}) {
  const resolver = createURNResolver(options);
  return resolver.resolveAgentUrn(urn, options);
}

/**
 * Convenience function for discovering capabilities
 * @param {string} domain - Agent domain
 * @param {Object} [options] - Discovery options
 * @returns {Promise<Array<AgentMetadata>>} List of agents
 */
export async function discoverCapabilities(domain, options = {}) {
  const resolver = createURNResolver(options);
  return resolver.discoverCapabilities(domain, options);
}
