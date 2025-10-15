/**
 * URN Registry for Agent Discovery
 * 
 * Provides persistent storage for agent metadata and capabilities with:
 * - File-based persistence for agent data
 * - URN indexing for fast lookups
 * - Agent registration and retrieval
 * - Registry statistics and health monitoring
 * - Structured error handling
 * - Comprehensive logging
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

import { 
  URNError, 
  URNFormatError, 
  URNResolutionError,
  generateRequestId,
  createLogEntry,
  DEFAULT_CONFIG
} from './urn-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Agent Registration Data
 * @typedef {Object} AgentData
 * @property {string} urn - Agent URN
 * @property {string} name - Agent name
 * @property {string} version - Agent version
 * @property {string} description - Agent description
 * @property {Object} capabilities - Agent capabilities
 * @property {Object} endpoints - Agent endpoints
 * @property {Object} [auth] - Authentication configuration
 * @property {string} registeredAt - Registration timestamp
 * @property {string} lastUpdated - Last update timestamp
 */

/**
 * Registry Configuration
 * @typedef {Object} RegistryConfig
 * @property {string} dataDir - Data directory path
 * @property {string} indexFile - Index file name
 * @property {string} agentsDir - Agents directory name
 * @property {boolean} enableLogging - Enable logging
 * @property {number} maxAgents - Maximum number of agents
 * @property {number} indexUpdateInterval - Index update interval in ms
 */

/**
 * Registry Statistics
 * @typedef {Object} RegistryStats
 * @property {number} totalAgents - Total number of registered agents
 * @property {number} domains - Number of unique domains
 * @property {number} capabilities - Total number of capabilities
 * @property {string} oldestAgent - Oldest agent registration
 * @property {string} newestAgent - Newest agent registration
 * @property {Object} domainStats - Statistics by domain
 * @property {Object} capabilityStats - Statistics by capability
 */

/**
 * URN Registry
 */
export class URNRegistry extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      dataDir: options.dataDir || join(__dirname, '../../data/registry'),
      indexFile: options.indexFile || 'index.json',
      agentsDir: options.agentsDir || 'agents',
      enableLogging: options.enableLogging !== false,
      maxAgents: options.maxAgents || 1000,
      indexUpdateInterval: options.indexUpdateInterval || 5000,
      ...options
    };

    this.index = new Map();
    this.domainIndex = new Map();
    this.capabilityIndex = new Map();
    this.stats = {
      totalAgents: 0,
      domains: 0,
      capabilities: 0,
      oldestAgent: null,
      newestAgent: null,
      domainStats: {},
      capabilityStats: {}
    };

    this.isInitialized = false;
    this.indexUpdateTimer = null;
  }

  /**
   * Initialize the registry
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    const reqId = generateRequestId();
    
    try {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'registry_init_start', {
          dataDir: this.config.dataDir
        });
        console.debug('[URN Registry]', logEntry);
      }

      // Ensure data directory exists
      await this._ensureDataDirectory();

      // Load existing index
      await this._loadIndex();

      // Start index update timer
      this._startIndexUpdateTimer();

      this.isInitialized = true;
      this.emit('initialized');

      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'registry_init_success', {
          totalAgents: this.stats.totalAgents,
          domains: this.stats.domains
        });
        console.info('[URN Registry]', logEntry);
      }
    } catch (error) {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'registry_init_failed', {
          error: error.message
        });
        console.error('[URN Registry]', logEntry);
      }

      throw new URNError(
        `Failed to initialize registry: ${error.message}`,
        error
      );
    }
  }

  /**
   * Register an agent
   * @param {AgentData} agentData - Agent data to register
   * @returns {Promise<Object>} Registration result
   */
  async registerAgent(agentData) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const reqId = generateRequestId();
    
    try {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'agent_registration_start', {
          agentUrn: agentData.urn
        });
        console.debug('[URN Registry]', logEntry);
      }

      // Validate agent data
      this._validateAgentData(agentData);

      // Check if agent already exists
      const existingAgent = this.index.get(agentData.urn);
      if (existingAgent) {
        throw new URNResolutionError(`Agent already registered: ${agentData.urn}`);
      }

      // Check registry capacity
      if (this.stats.totalAgents >= this.config.maxAgents) {
        throw new URNError(`Registry capacity exceeded: ${this.config.maxAgents} agents`);
      }

      // Add timestamps
      const now = new Date().toISOString();
      const registrationData = {
        ...agentData,
        registeredAt: now,
        lastUpdated: now
      };

      // Store agent data
      await this._storeAgentData(registrationData);

      // Update indexes
      this._updateIndexes(registrationData);

      // Update statistics
      this._updateStats(registrationData);

      this.emit('agentRegistered', {
        urn: agentData.urn,
        name: agentData.name,
        registeredAt: now
      });

      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'agent_registration_success', {
          agentUrn: agentData.urn,
          capabilitiesCount: Object.keys(agentData.capabilities || {}).length
        });
        console.info('[URN Registry]', logEntry);
      }

      return {
        success: true,
        urn: agentData.urn,
        registeredAt: now,
        message: 'Agent registered successfully'
      };
    } catch (error) {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'agent_registration_failed', {
          agentUrn: agentData.urn,
          error: error.message
        });
        console.error('[URN Registry]', logEntry);
      }

      if (error instanceof URNError) {
        throw error;
      }

      throw new URNError(
        `Failed to register agent: ${error.message}`,
        error
      );
    }
  }

  /**
   * Get agent by URN
   * @param {string} urn - Agent URN
   * @returns {Promise<AgentData|null>} Agent data or null if not found
   */
  async getAgent(urn) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const reqId = generateRequestId();
    
    try {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'agent_lookup_start', {
          agentUrn: urn
        });
        console.debug('[URN Registry]', logEntry);
      }

      // Validate URN format
      this._validateUrnFormat(urn);

      // Check index first
      const agentData = this.index.get(urn);
      if (!agentData) {
        if (this.config.enableLogging) {
          const logEntry = createLogEntry(reqId, 'agent_lookup_not_found', {
            agentUrn: urn
          });
          console.debug('[URN Registry]', logEntry);
        }
        return null;
      }

      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'agent_lookup_success', {
          agentUrn: urn,
          agentName: agentData.name
        });
        console.debug('[URN Registry]', logEntry);
      }

      return agentData;
    } catch (error) {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'agent_lookup_failed', {
          agentUrn: urn,
          error: error.message
        });
        console.error('[URN Registry]', logEntry);
      }

      if (error instanceof URNFormatError) {
        throw error;
      }

      throw new URNError(
        `Failed to get agent: ${error.message}`,
        error
      );
    }
  }

  /**
   * List agents by domain
   * @param {string} domain - Domain to filter by
   * @returns {Promise<AgentData[]>} List of agents in domain
   */
  async listAgentsByDomain(domain) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const reqId = generateRequestId();
    
    try {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'domain_lookup_start', {
          domain
        });
        console.debug('[URN Registry]', logEntry);
      }

      const agents = this.domainIndex.get(domain) || [];

      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'domain_lookup_success', {
          domain,
          agentsCount: agents.length
        });
        console.debug('[URN Registry]', logEntry);
      }

      return agents;
    } catch (error) {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'domain_lookup_failed', {
          domain,
          error: error.message
        });
        console.error('[URN Registry]', logEntry);
      }

      throw new URNError(
        `Failed to list agents by domain: ${error.message}`,
        error
      );
    }
  }

  /**
   * Search agents by capability
   * @param {string} capability - Capability to search for
   * @returns {Promise<AgentData[]>} List of agents with capability
   */
  async searchAgentsByCapability(capability) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const reqId = generateRequestId();
    
    try {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'capability_search_start', {
          capability
        });
        console.debug('[URN Registry]', logEntry);
      }

      const agents = this.capabilityIndex.get(capability) || [];

      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'capability_search_success', {
          capability,
          agentsCount: agents.length
        });
        console.debug('[URN Registry]', logEntry);
      }

      return agents;
    } catch (error) {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'capability_search_failed', {
          capability,
          error: error.message
        });
        console.error('[URN Registry]', logEntry);
      }

      throw new URNError(
        `Failed to search agents by capability: ${error.message}`,
        error
      );
    }
  }

  /**
   * Get registry statistics
   * @returns {RegistryStats} Registry statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Get registry health status
   * @returns {Object} Health status
   */
  getHealth() {
    return {
      status: 'healthy',
      isInitialized: this.isInitialized,
      totalAgents: this.stats.totalAgents,
      domains: this.stats.domains,
      capabilities: this.stats.capabilities,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Clear registry (for testing)
   * @returns {Promise<void>}
   */
  async clear() {
    const reqId = generateRequestId();
    
    try {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'registry_clear_start', {});
        console.debug('[URN Registry]', logEntry);
      }

      // Clear indexes
      this.index.clear();
      this.domainIndex.clear();
      this.capabilityIndex.clear();

      // Reset statistics
      this.stats = {
        totalAgents: 0,
        domains: 0,
        capabilities: 0,
        oldestAgent: null,
        newestAgent: null,
        domainStats: {},
        capabilityStats: {}
      };

      // Remove data files
      const agentsDir = join(this.config.dataDir, this.config.agentsDir);
      const indexFile = join(this.config.dataDir, this.config.indexFile);

      try {
        await fs.rmdir(agentsDir, { recursive: true });
      } catch (error) {
        // Directory might not exist
      }

      try {
        await fs.unlink(indexFile);
      } catch (error) {
        // File might not exist
      }

      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'registry_clear_success', {});
        console.info('[URN Registry]', logEntry);
      }
    } catch (error) {
      if (this.config.enableLogging) {
        const logEntry = createLogEntry(reqId, 'registry_clear_failed', {
          error: error.message
        });
        console.error('[URN Registry]', logEntry);
      }

      throw new URNError(
        `Failed to clear registry: ${error.message}`,
        error
      );
    }
  }

  /**
   * Shutdown the registry
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this.indexUpdateTimer) {
      clearInterval(this.indexUpdateTimer);
      this.indexUpdateTimer = null;
    }

    // Save index before shutdown
    await this._saveIndex();

    this.isInitialized = false;
    this.emit('shutdown');
  }

  /**
   * Ensure data directory exists
   * @private
   * @returns {Promise<void>}
   */
  async _ensureDataDirectory() {
    try {
      await fs.mkdir(this.config.dataDir, { recursive: true });
      await fs.mkdir(join(this.config.dataDir, this.config.agentsDir), { recursive: true });
    } catch (error) {
      throw new URNError(`Failed to create data directory: ${error.message}`, error);
    }
  }

  /**
   * Load index from file
   * @private
   * @returns {Promise<void>}
   */
  async _loadIndex() {
    const indexFile = join(this.config.dataDir, this.config.indexFile);
    
    try {
      const data = await fs.readFile(indexFile, 'utf8');
      const indexData = JSON.parse(data);
      
      // Restore indexes
      this.index = new Map(indexData.index || []);
      this.domainIndex = new Map(indexData.domainIndex || []);
      this.capabilityIndex = new Map(indexData.capabilityIndex || []);
      this.stats = indexData.stats || this.stats;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Index file doesn't exist, start fresh
        return;
      }
      throw new URNError(`Failed to load index: ${error.message}`, error);
    }
  }

  /**
   * Save index to file
   * @private
   * @returns {Promise<void>}
   */
  async _saveIndex() {
    const indexFile = join(this.config.dataDir, this.config.indexFile);
    
    try {
      const indexData = {
        index: Array.from(this.index.entries()),
        domainIndex: Array.from(this.domainIndex.entries()),
        capabilityIndex: Array.from(this.capabilityIndex.entries()),
        stats: this.stats,
        lastSaved: new Date().toISOString()
      };

      await fs.writeFile(indexFile, JSON.stringify(indexData, null, 2));
    } catch (error) {
      throw new URNError(`Failed to save index: ${error.message}`, error);
    }
  }

  /**
   * Store agent data to file
   * @private
   * @param {AgentData} agentData - Agent data
   * @returns {Promise<void>}
   */
  async _storeAgentData(agentData) {
    const filename = `${agentData.urn.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    const filepath = join(this.config.dataDir, this.config.agentsDir, filename);
    
    try {
      await fs.writeFile(filepath, JSON.stringify(agentData, null, 2));
    } catch (error) {
      throw new URNError(`Failed to store agent data: ${error.message}`, error);
    }
  }

  /**
   * Update indexes with agent data
   * @private
   * @param {AgentData} agentData - Agent data
   */
  _updateIndexes(agentData) {
    // Main index
    this.index.set(agentData.urn, agentData);

    // Domain index
    const domain = this._extractDomain(agentData.urn);
    if (!this.domainIndex.has(domain)) {
      this.domainIndex.set(domain, []);
    }
    this.domainIndex.get(domain).push(agentData);

    // Capability index
    if (agentData.capabilities) {
      for (const capability of Object.keys(agentData.capabilities)) {
        if (!this.capabilityIndex.has(capability)) {
          this.capabilityIndex.set(capability, []);
        }
        this.capabilityIndex.get(capability).push(agentData);
      }
    }
  }

  /**
   * Update statistics
   * @private
   * @param {AgentData} agentData - Agent data
   */
  _updateStats(agentData) {
    this.stats.totalAgents++;
    
    const domain = this._extractDomain(agentData.urn);
    if (!this.stats.domainStats[domain]) {
      this.stats.domainStats[domain] = 0;
      this.stats.domains++;
    }
    this.stats.domainStats[domain]++;

    if (agentData.capabilities) {
      for (const capability of Object.keys(agentData.capabilities)) {
        if (!this.stats.capabilityStats[capability]) {
          this.stats.capabilityStats[capability] = 0;
          this.stats.capabilities++;
        }
        this.stats.capabilityStats[capability]++;
      }
    }

    if (!this.stats.oldestAgent || agentData.registeredAt < this.stats.oldestAgent) {
      this.stats.oldestAgent = agentData.registeredAt;
    }
    if (!this.stats.newestAgent || agentData.registeredAt > this.stats.newestAgent) {
      this.stats.newestAgent = agentData.registeredAt;
    }
  }

  /**
   * Start index update timer
   * @private
   */
  _startIndexUpdateTimer() {
    this.indexUpdateTimer = setInterval(async () => {
      try {
        await this._saveIndex();
      } catch (error) {
        console.error('[URN Registry] Failed to save index:', error.message);
      }
    }, this.config.indexUpdateInterval);
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
   * Validate URN format
   * @private
   * @param {string} urn - Agent URN
   */
  _validateUrnFormat(urn) {
    const urnPattern = /^urn:agent:([^:]+):([^@]+)(?:@(.+))?$/;
    if (!urnPattern.test(urn)) {
      throw new URNFormatError(`Invalid URN format: ${urn}. Expected format: urn:agent:domain:name[@version]`);
    }
  }

  /**
   * Validate agent data
   * @private
   * @param {AgentData} agentData - Agent data
   */
  _validateAgentData(agentData) {
    if (!agentData) {
      throw new URNError('Agent data is required');
    }

    if (!agentData.urn) {
      throw new URNError('Agent URN is required');
    }

    if (!agentData.name) {
      throw new URNError('Agent name is required');
    }

    if (!agentData.version) {
      throw new URNError('Agent version is required');
    }

    if (!agentData.description) {
      throw new URNError('Agent description is required');
    }

    this._validateUrnFormat(agentData.urn);
  }
}

/**
 * Create URN registry with default configuration
 * @param {Object} options - Registry options
 * @returns {URNRegistry} Registry instance
 */
export function createURNRegistry(options = {}) {
  return new URNRegistry(options);
}

/**
 * Convenience function for registering an agent
 * @param {AgentData} agentData - Agent data to register
 * @param {Object} [options] - Registry options
 * @returns {Promise<Object>} Registration result
 */
export async function registerAgent(agentData, options = {}) {
  const registry = createURNRegistry(options);
  await registry.initialize();
  return registry.registerAgent(agentData);
}

/**
 * Convenience function for getting an agent
 * @param {string} urn - Agent URN
 * @param {Object} [options] - Registry options
 * @returns {Promise<AgentData|null>} Agent data or null if not found
 */
export async function getAgent(urn, options = {}) {
  const registry = createURNRegistry(options);
  await registry.initialize();
  return registry.getAgent(urn);
}
