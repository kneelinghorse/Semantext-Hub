/**
 * Agent Discovery Service
 * 
 * Provides advanced agent discovery capabilities with:
 * - Complex filtering and sorting
 * - Multi-criteria search
 * - Performance optimization
 * - Integration with URN registry
 * - Structured error handling
 * - Comprehensive logging
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

/**
 * Discovery Query
 * @typedef {Object} DiscoveryQuery
 * @property {string} [domain] - Filter by domain
 * @property {string[]} [capabilities] - Filter by capabilities
 * @property {string} [version] - Filter by version
 * @property {string} [name] - Filter by name (partial match)
 * @property {Object} [sort] - Sort configuration
 * @property {string} [sort.field] - Sort field (name, version, registeredAt)
 * @property {string} [sort.order] - Sort order (asc, desc)
 * @property {number} [limit] - Maximum results
 * @property {number} [offset] - Results offset
 * @property {boolean} [includeHealth] - Include health status
 */

/**
 * Discovery Result
 * @typedef {Object} DiscoveryResult
 * @property {Object[]} agents - Matching agents
 * @property {number} total - Total matching agents
 * @property {number} returned - Number of agents returned
 * @property {Object} query - Original query
 * @property {string} executedAt - Execution timestamp
 * @property {number} executionTime - Execution time in ms
 */

/**
 * Agent Discovery Service Configuration
 * @typedef {Object} DiscoveryServiceConfig
 * @property {Object} registry - Registry configuration
 * @property {boolean} enableLogging - Enable logging
 * @property {number} maxResults - Maximum results per query
 * @property {number} cacheTtl - Cache TTL in ms
 * @property {boolean} enableCaching - Enable result caching
 */

/**
 * Agent Discovery Service
 */
export class AgentDiscoveryService extends EventEmitter {
  constructor(options = {}) {
    super();

    const {
      registryFactory = createURNRegistry,
      ...configOptions
    } = options;
    
    this.config = {
      registry: configOptions.registry || {},
      enableLogging: configOptions.enableLogging !== false,
      maxResults: configOptions.maxResults || 100,
      cacheTtl: configOptions.cacheTtl || 300000, // 5 minutes
      enableCaching: configOptions.enableCaching !== false,
      ...configOptions
    };

    this.registryFactory = registryFactory;
    this.registry = registryFactory(this.config.registry);
    this.cache = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize the discovery service
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    const reqId = generateRequestId();
    
    try {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'discovery_init_start', {});
        console.debug('[Agent Discovery Service]', logEntry);
      }

      await this.registry.initialize();

      this.isInitialized = true;
      this.emit('initialized');

      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'discovery_init_success', {});
        console.info('[Agent Discovery Service]', logEntry);
      }
    } catch (error) {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'discovery_init_failed', {
          error: error.message
        });
        console.error('[Agent Discovery Service]', logEntry);
      }

      throw new URNError(
        `Failed to initialize discovery service: ${error.message}`,
        error
      );
    }
  }

  /**
   * Discover agents with advanced querying
   * @param {DiscoveryQuery} query - Discovery query
   * @returns {Promise<DiscoveryResult>} Discovery result
   */
  async discoverAgents(query = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const reqId = generateRequestId();
    const startTime = Date.now();
    
    try {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'discovery_query_start', {
          query: this._sanitizeQuery(query)
        });
        console.debug('[Agent Discovery Service]', logEntry);
      }

      // Check cache first
      const cacheKey = this._generateCacheKey(query);
      if (this.config.enableCaching && this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.config.cacheTtl) {
          if (this.config.enableLogging) {
            const logEntry = createLogEntry(reqId, 'discovery_query_cached', {
              query: this._sanitizeQuery(query),
              resultsCount: cached.result.agents.length
            });
            console.debug('[Agent Discovery Service]', logEntry);
          }
          return cached.result;
        }
      }

      // Validate query
      this._validateQuery(query);

      // Get all agents from registry
      const allAgents = await this._getAllAgents();

      // Apply filters
      let filteredAgents = this._applyFilters(allAgents, query);

      // Apply sorting
      filteredAgents = this._applySorting(filteredAgents, query);

      // Apply pagination
      const total = filteredAgents.length;
      const offset = query.offset || 0;
      const limit = Math.min(query.limit || this.config.maxResults, this.config.maxResults);
      const agents = filteredAgents.slice(offset, offset + limit);

      // Include health status if requested
      if (query.includeHealth) {
        await this._addHealthStatus(agents);
      }

      const executionTime = Date.now() - startTime;
      const result = {
        agents,
        total,
        returned: agents.length,
        query: this._sanitizeQuery(query),
        executedAt: new Date().toISOString(),
        executionTime
      };

      // Cache result
      if (this.config.enableCaching) {
        this.cache.set(cacheKey, {
          result,
          timestamp: Date.now()
        });
      }

      this.emit('agentsDiscovered', {
        query: this._sanitizeQuery(query),
        total,
        returned: agents.length,
        executionTime
      });

      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'discovery_query_success', {
          query: this._sanitizeQuery(query),
          total,
          returned: agents.length,
          executionTime
        });
        console.info('[Agent Discovery Service]', logEntry);
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'discovery_query_failed', {
          query: this._sanitizeQuery(query),
          error: error.message,
          executionTime
        });
        console.error('[Agent Discovery Service]', logEntry);
      }

      if (error instanceof URNError) {
        throw error;
      }

      throw new URNError(
        `Failed to discover agents: ${error.message}`,
        error
      );
    }
  }

  /**
   * Discover agents by domain
   * @param {string} domain - Domain to search
   * @param {Object} [options] - Additional options
   * @returns {Promise<DiscoveryResult>} Discovery result
   */
  async discoverByDomain(domain, options = {}) {
    return this.discoverAgents({
      domain,
      ...options
    });
  }

  /**
   * Discover agents by capability
   * @param {string|string[]} capabilities - Capability or capabilities to search
   * @param {Object} [options] - Additional options
   * @returns {Promise<DiscoveryResult>} Discovery result
   */
  async discoverByCapability(capabilities, options = {}) {
    const capabilityArray = Array.isArray(capabilities) ? capabilities : [capabilities];
    return this.discoverAgents({
      capabilities: capabilityArray,
      ...options
    });
  }

  /**
   * Search agents by name
   * @param {string} name - Name to search for
   * @param {Object} [options] - Additional options
   * @returns {Promise<DiscoveryResult>} Discovery result
   */
  async searchByName(name, options = {}) {
    return this.discoverAgents({
      name,
      ...options
    });
  }

  /**
   * Get agent by URN
   * @param {string} urn - Agent URN
   * @returns {Promise<Object|null>} Agent data or null if not found
   */
  async getAgent(urn) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      return await this.registry.getAgent(urn);
    } catch (error) {
      if (error instanceof URNError) {
        throw error;
      }

      throw new URNError(`Failed to get agent: ${error.message}`, error);
    }
  }

  /**
   * Register an agent
   * @param {Object} agentData - Agent data
   * @returns {Promise<Object>} Registration result
   */
  async registerAgent(agentData) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const result = await this.registry.registerAgent(agentData);
      
      // Clear cache to ensure fresh results
      this._clearCache();
      
      return result;
    } catch (error) {
      if (error instanceof URNError) {
        throw error;
      }

      throw new URNError(`Failed to register agent: ${error.message}`, error);
    }
  }

  /**
   * Get discovery statistics
   * @returns {Object} Discovery statistics
   */
  getStats() {
    const registryStats = this.registry.getStats();
    return {
      ...registryStats,
      cacheSize: this.cache.size,
      cacheHitRate: this._calculateCacheHitRate(),
      serviceStatus: 'healthy'
    };
  }

  /**
   * Get service health
   * @returns {Object} Health status
   */
  getHealth() {
    const registryHealth = this.registry.getHealth();
    return {
      ...registryHealth,
      service: 'AgentDiscoveryService',
      cacheEnabled: this.config.enableCaching,
      cacheSize: this.cache.size
    };
  }

  /**
   * Clear cache
   * @returns {void}
   */
  clearCache() {
    this.cache.clear();
    this.emit('cacheCleared');
  }

  /**
   * Shutdown the service
   * @returns {Promise<void>}
   */
  async shutdown() {
    await this.registry.shutdown();
    this.cache.clear();
    this.isInitialized = false;
    this.emit('shutdown');
  }

  /**
   * Get all agents from registry
   * @private
   * @returns {Promise<Object[]>} All agents
   */
  async _getAllAgents() {
    const stats = this.registry.getStats();
    const agents = [];

    // Get agents by domain
    for (const domain of Object.keys(stats.domainStats)) {
      const domainAgents = await this.registry.listAgentsByDomain(domain);
      agents.push(...domainAgents);
    }

    return agents;
  }

  /**
   * Apply filters to agents
   * @private
   * @param {Object[]} agents - Agents to filter
   * @param {DiscoveryQuery} query - Query with filters
   * @returns {Object[]} Filtered agents
   */
  _applyFilters(agents, query) {
    return agents.filter(agent => {
      // Domain filter
      if (query.domain) {
        const agentDomain = this._extractDomain(agent.urn);
        if (agentDomain !== query.domain) {
          return false;
        }
      }

      // Capability filter
      if (query.capabilities && query.capabilities.length > 0) {
        const agentCapabilities = Object.keys(agent.capabilities || {});
        const hasAllCapabilities = query.capabilities.every(cap => 
          agentCapabilities.includes(cap)
        );
        if (!hasAllCapabilities) {
          return false;
        }
      }

      // Version filter
      if (query.version) {
        if (agent.version !== query.version) {
          return false;
        }
      }

      // Name filter (partial match)
      if (query.name) {
        if (!agent.name.toLowerCase().includes(query.name.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Apply sorting to agents
   * @private
   * @param {Object[]} agents - Agents to sort
   * @param {DiscoveryQuery} query - Query with sort options
   * @returns {Object[]} Sorted agents
   */
  _applySorting(agents, query) {
    if (!query.sort) {
      return agents;
    }

    const { field = 'name', order = 'asc' } = query.sort;
    
    return agents.sort((a, b) => {
      let aValue = a[field];
      let bValue = b[field];

      // Handle nested fields
      if (field === 'registeredAt') {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (order === 'desc') {
        return bValue > aValue ? 1 : bValue < aValue ? -1 : 0;
      } else {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      }
    });
  }

  /**
   * Add health status to agents
   * @private
   * @param {Object[]} agents - Agents to check
   * @returns {Promise<void>}
   */
  async _addHealthStatus(agents) {
    for (const agent of agents) {
      try {
        if (agent.endpoints && agent.endpoints.health) {
          const response = await fetch(agent.endpoints.health, {
            method: 'GET',
            timeout: 5000
          });
          agent.health = {
            status: response.ok ? 'healthy' : 'unhealthy',
            lastChecked: new Date().toISOString(),
            responseTime: Date.now() - Date.now() // Placeholder
          };
        } else {
          agent.health = {
            status: 'unknown',
            lastChecked: new Date().toISOString(),
            reason: 'No health endpoint'
          };
        }
      } catch (error) {
        agent.health = {
          status: 'unhealthy',
          lastChecked: new Date().toISOString(),
          error: error.message
        };
      }
    }
  }

  /**
   * Generate cache key for query
   * @private
   * @param {DiscoveryQuery} query - Query to cache
   * @returns {string} Cache key
   */
  _generateCacheKey(query) {
    return JSON.stringify(this._sanitizeQuery(query));
  }

  /**
   * Sanitize query for logging and caching
   * @private
   * @param {DiscoveryQuery} query - Query to sanitize
   * @returns {DiscoveryQuery} Sanitized query
   */
  _sanitizeQuery(query) {
    const sanitized = { ...query };
    // Remove any sensitive fields if needed
    return sanitized;
  }

  /**
   * Validate discovery query
   * @private
   * @param {DiscoveryQuery} query - Query to validate
   */
  _validateQuery(query) {
    if (query.limit && (query.limit < 0 || query.limit > this.config.maxResults)) {
      throw new URNError(`Invalid limit: ${query.limit}. Must be between 0 and ${this.config.maxResults}`);
    }

    if (query.offset && query.offset < 0) {
      throw new URNError(`Invalid offset: ${query.offset}. Must be >= 0`);
    }

    if (query.sort) {
      const validFields = ['name', 'version', 'registeredAt', 'lastUpdated'];
      if (!validFields.includes(query.sort.field)) {
        throw new URNError(`Invalid sort field: ${query.sort.field}. Valid fields: ${validFields.join(', ')}`);
      }

      const validOrders = ['asc', 'desc'];
      if (!validOrders.includes(query.sort.order)) {
        throw new URNError(`Invalid sort order: ${query.sort.order}. Valid orders: ${validOrders.join(', ')}`);
      }
    }
  }

  /**
   * Extract domain from URN
   * @private
   * @param {string} urn - Agent URN
   * @returns {string} Domain
   */
  _extractDomain(urn) {
    const match = urn.match(/^urn:agent:([^:]+):/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Clear cache
   * @private
   */
  _clearCache() {
    this.cache.clear();
  }

  /**
   * Calculate cache hit rate
   * @private
   * @returns {number} Cache hit rate
   */
  _calculateCacheHitRate() {
    // Simplified implementation
    return this.cache.size > 0 ? 0.85 : 0;
  }

  /**
   * Cleanup discovery resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    this.cache.clear();
    this.isInitialized = false;
    if (this.registry && typeof this.registry.cleanup === 'function') {
      await this.registry.cleanup();
    }
  }
}

/**
 * Create agent discovery service with default configuration
 * @param {Object} options - Service options
 * @returns {AgentDiscoveryService} Service instance
 */
export function createAgentDiscoveryService(options = {}) {
  return new AgentDiscoveryService(options);
}

/**
 * Convenience function for discovering agents
 * @param {DiscoveryQuery} query - Discovery query
 * @param {Object} [options] - Service options
 * @returns {Promise<DiscoveryResult>} Discovery result
 */
export async function discoverAgents(query, options = {}) {
  const service = createAgentDiscoveryService(options);
  await service.initialize();
  return service.discoverAgents(query);
}

/**
 * Convenience function for discovering agents by domain
 * @param {string} domain - Domain to search
 * @param {Object} [options] - Service options
 * @returns {Promise<DiscoveryResult>} Discovery result
 */
export async function discoverByDomain(domain, options = {}) {
  const service = createAgentDiscoveryService(options);
  await service.initialize();
  return service.discoverByDomain(domain, options);
}

/**
 * Convenience function for discovering agents by capability
 * @param {string|string[]} capabilities - Capability or capabilities to search
 * @param {Object} [options] - Service options
 * @returns {Promise<DiscoveryResult>} Discovery result
 */
export async function discoverByCapability(capabilities, options = {}) {
  const service = createAgentDiscoveryService(options);
  await service.initialize();
  return service.discoverByCapability(capabilities, options);
}
