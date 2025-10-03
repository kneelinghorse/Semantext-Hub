// domain_manager.js
// Main Domain Management Engine for Mission 2.2
// Orchestrates domain discovery, dependency tracking, active set optimization, and smooth domain switching

const DomainDiscovery = require('./domain_discovery');
const DomainDependencies = require('./domain_dependencies');
const ActiveSetOptimizer = require('./active_set_optimizer');
const SmartCompressor = require('./smart_compressor');
const ContextStateVector = require('./context_state');

class DomainManager {
  constructor(config = {}) {
    this.config = {
      // Domain management settings
      domains: {
        autoDiscovery: config.domains?.autoDiscovery !== false,
        discoveryIntervalMs: config.domains?.discoveryIntervalMs || 3600000, // 1 hour
        maxActiveDomains: config.domains?.maxActiveDomains || 5,
        switchTimeoutMs: config.domains?.switchTimeoutMs || 5000,
        ...config.domains
      },

      // Memory management
      memory: {
        maxActiveSizeKB: config.memory?.maxActiveSizeKB || 30,
        targetUtilization: config.memory?.targetUtilization || 0.85,
        optimizationIntervalMs: config.memory?.optimizationIntervalMs || 60000, // 1 minute
        ...config.memory
      },

      // State preservation
      statePreservation: {
        enableHistory: config.statePreservation?.enableHistory !== false,
        maxHistorySize: config.statePreservation?.maxHistorySize || 100,
        preserveOnSwitch: config.statePreservation?.preserveOnSwitch !== false,
        ...config.statePreservation
      }
    };

    // Initialize components
    this.discovery = new DomainDiscovery(config.discovery);
    this.dependencies = new DomainDependencies(config.dependencies);
    this.optimizer = new ActiveSetOptimizer(config.optimizer);
    this.compressor = new SmartCompressor(config.compressor);
    this.stateVector = new ContextStateVector(config.stateVector);

    // Domain state management
    this.domains = new Map();
    this.activeDomains = new Set();
    this.currentDomain = null;
    this.domainHistory = [];
    this.projectPath = null;

    // Performance tracking
    this.switchHistory = [];
    this.optimizationSchedule = null;
    this.discoverySchedule = null;

    // Event handling
    this.eventListeners = new Map();

    // Initialize optimization schedule
    this.startOptimizationSchedule();
  }

  /**
   * Initialize domain manager with project analysis
   * @param {string} projectPath - Root path of the project to analyze
   * @param {Object} options - Initialization options
   * @returns {Object} Initialization result
   */
  async initialize(projectPath, options = {}) {
    const startTime = Date.now();

    try {
      this.projectPath = projectPath;

      // Step 1: Discover domains in the project
      this.emit('initialization_started', { projectPath, options });

      const discoveryResult = await this.discovery.discoverDomains(projectPath, {
        forceRefresh: options.forceRefresh,
        ...options.discovery
      });

      // Step 2: Build dependency mapping
      const dependencyAnalysis = this.dependencies.buildDependencyMap(
        discoveryResult.domains,
        discoveryResult.metadata.dependencyGraph
      );

      // Step 3: Initialize domains in manager
      this.initializeDomains(discoveryResult.domains, dependencyAnalysis);

      // Step 4: Perform initial optimization
      const initialContext = options.currentContext || this.createEmptyContext();
      const optimizationResult = this.optimizer.optimizeActiveSet(
        Array.from(this.domains.values()),
        initialContext
      );

      // Step 5: Set up automatic discovery if enabled
      if (this.config.domains.autoDiscovery) {
        this.startDiscoverySchedule();
      }

      const result = {
        success: true,
        domainsDiscovered: discoveryResult.domains.length,
        dependenciesAnalyzed: dependencyAnalysis.metrics.totalRelationships,
        initialOptimization: optimizationResult,
        projectPath,
        initializationTime: Date.now() - startTime,
        timestamp: Date.now()
      };

      this.emit('initialization_completed', result);
      return result;

    } catch (error) {
      const errorResult = {
        success: false,
        error: error.message,
        projectPath,
        initializationTime: Date.now() - startTime
      };

      this.emit('initialization_failed', errorResult);
      throw error;
    }
  }

  /**
   * Initialize domains in the manager
   */
  initializeDomains(discoveredDomains, dependencyAnalysis) {
    this.domains.clear();

    discoveredDomains.forEach(domain => {
      // Enhance domain with dependency information
      const enhancedDomain = {
        ...domain,
        dependencyInfo: dependencyAnalysis.dependencyGraph[domain.id] || {},
        relationships: this.getRelationshipsForDomain(domain.id, dependencyAnalysis.relationships),
        state: 'inactive',
        lastAccessed: null,
        loadedAt: null,
        accessCount: 0
      };

      this.domains.set(domain.id, enhancedDomain);
    });

    // Set initial active domains based on dependency analysis
    this.setInitialActiveDomains(dependencyAnalysis);
  }

  /**
   * Set initial active domains based on importance and dependencies
   */
  setInitialActiveDomains(dependencyAnalysis) {
    const maxActive = this.config.domains.maxActiveDomains;
    const candidates = Array.from(this.domains.values())
      .sort((a, b) => {
        // Sort by importance: file count, dependency count, centrality
        const scoreA = a.files.length + (a.dependencyInfo.dependents?.length || 0);
        const scoreB = b.files.length + (b.dependencyInfo.dependents?.length || 0);
        return scoreB - scoreA;
      })
      .slice(0, maxActive);

    candidates.forEach(domain => {
      this.activateDomain(domain.id, { silent: true });
    });
  }

  /**
   * Get relationships for a specific domain
   */
  getRelationshipsForDomain(domainId, relationshipsMap) {
    const relationships = [];

    Object.entries(relationshipsMap).forEach(([key, relationship]) => {
      if (relationship.sourceDomain === domainId || relationship.targetDomain === domainId) {
        relationships.push(relationship);
      }
    });

    return relationships;
  }

  /**
   * Switch to a specific domain with state preservation
   * @param {string} domainId - Target domain ID
   * @param {Object} context - Current context to preserve
   * @param {Object} options - Switch options
   * @returns {Object} Switch result
   */
  async switchToDomain(domainId, context = {}, options = {}) {
    const startTime = Date.now();

    try {
      // Validate domain exists
      if (!this.domains.has(domainId)) {
        throw new Error(`Domain ${domainId} not found`);
      }

      const targetDomain = this.domains.get(domainId);
      const previousDomain = this.currentDomain;

      this.emit('domain_switch_started', {
        from: previousDomain?.id,
        to: domainId,
        context
      });

      // Step 1: Preserve current state if enabled
      let preservedState = null;
      if (this.config.statePreservation.preserveOnSwitch && previousDomain) {
        preservedState = this.preserveCurrentState(context, previousDomain);
      }

      // Step 2: Prepare target domain
      const loadedDomain = await this.loadDomain(domainId, context, options);

      // Step 3: Update active set based on new domain
      const accessPattern = {
        [domainId]: {
          type: 'switch',
          operations: 1,
          timestamp: Date.now()
        }
      };

      const optimizationResult = this.optimizer.optimizeActiveSet(
        Array.from(this.domains.values()),
        context,
        accessPattern
      );

      // Step 4: Update domain state
      this.updateDomainAccess(domainId);
      this.currentDomain = loadedDomain;

      // Step 5: Build transition context
      const transitionContext = this.buildTransitionContext(
        previousDomain,
        loadedDomain,
        preservedState,
        context
      );

      const switchResult = {
        success: true,
        previousDomain: previousDomain?.id,
        currentDomain: domainId,
        transitionContext,
        preservedState,
        optimization: optimizationResult,
        switchTime: Date.now() - startTime,
        timestamp: Date.now()
      };

      // Record switch
      this.recordDomainSwitch(switchResult);

      this.emit('domain_switch_completed', switchResult);
      return switchResult;

    } catch (error) {
      const errorResult = {
        success: false,
        error: error.message,
        targetDomain: domainId,
        switchTime: Date.now() - startTime
      };

      this.emit('domain_switch_failed', errorResult);
      throw error;
    }
  }

  /**
   * Load a domain (decompress if needed)
   */
  async loadDomain(domainId, context, options = {}) {
    const domain = this.domains.get(domainId);

    // If domain is compressed, decompress it
    if (domain.compressed) {
      const decompressed = await this.decompressDomain(domain, context);
      this.domains.set(domainId, decompressed);
      return decompressed;
    }

    // Activate domain if not already active
    if (!this.activeDomains.has(domainId)) {
      this.activateDomain(domainId);
    }

    // Update load timestamp
    domain.loadedAt = Date.now();
    return domain;
  }

  /**
   * Decompress a domain
   */
  async decompressDomain(compressedDomain, context) {
    // For now, return the domain as-is since we store compression metadata
    // In a full implementation, this would use the compression metadata
    // to restore the domain to its original state

    return {
      ...compressedDomain,
      compressed: false,
      decompressedAt: Date.now(),
      state: 'active'
    };
  }

  /**
   * Activate a domain
   */
  activateDomain(domainId, options = {}) {
    const domain = this.domains.get(domainId);
    if (!domain) return false;

    // Check active domain limit
    if (this.activeDomains.size >= this.config.domains.maxActiveDomains) {
      // Deactivate least recently used domain
      this.deactivateLeastRecentlyUsed();
    }

    this.activeDomains.add(domainId);
    domain.state = 'active';
    domain.activatedAt = Date.now();

    // Enforce cap robustly in case no domain was deactivated above
    while (this.activeDomains.size > this.config.domains.maxActiveDomains) {
      this.deactivateLeastRecentlyUsed();
      if (this.activeDomains.size === 0) break; // Safety
    }

    if (!options.silent) {
      this.emit('domain_activated', { domainId, domain });
    }

    return true;
  }

  /**
   * Deactivate least recently used domain
   */
  deactivateLeastRecentlyUsed() {
    let oldestDomain = null;
    let oldestTime = Date.now();

    this.activeDomains.forEach(domainId => {
      const domain = this.domains.get(domainId);
      const lastAccess = domain.lastAccessed || domain.activatedAt || 0;

      if (lastAccess < oldestTime) {
        oldestTime = lastAccess;
        oldestDomain = domainId;
      }
    });

    if (!oldestDomain && this.activeDomains.size > 0) {
      // Fallback: arbitrarily pick first if timestamps were not comparable
      oldestDomain = this.activeDomains.values().next().value;
    }

    if (oldestDomain) {
      this.deactivateDomain(oldestDomain);
    }
  }

  /**
   * Deactivate a domain
   */
  deactivateDomain(domainId) {
    const domain = this.domains.get(domainId);
    if (!domain) return false;

    this.activeDomains.delete(domainId);
    domain.state = 'inactive';
    domain.deactivatedAt = Date.now();

    this.emit('domain_deactivated', { domainId, domain });
    return true;
  }

  /**
   * Update domain access tracking
   */
  updateDomainAccess(domainId) {
    const domain = this.domains.get(domainId);
    if (!domain) return;

    domain.lastAccessed = Date.now();
    domain.accessCount = (domain.accessCount || 0) + 1;

    // Update domain history
    if (this.config.statePreservation.enableHistory) {
      this.domainHistory.push({
        domainId,
        timestamp: Date.now(),
        accessCount: domain.accessCount
      });

      // Trim history if needed
      if (this.domainHistory.length > this.config.statePreservation.maxHistorySize) {
        this.domainHistory.shift();
      }
    }
  }

  /**
   * Preserve current state before switching
   */
  preserveCurrentState(context, currentDomain) {
    const stateVector = this.stateVector.calculate(context);

    return {
      domainId: currentDomain.id,
      context: JSON.parse(JSON.stringify(context)), // Deep clone
      stateVector,
      timestamp: Date.now(),
      memoryUsage: this.optimizer.getMemoryStatus()
    };
  }

  /**
   * Build transition context for smooth switching
   */
  buildTransitionContext(previousDomain, currentDomain, preservedState, baseContext) {
    const transitionContext = {
      ...baseContext,
      domainTransition: {
        from: previousDomain?.id,
        to: currentDomain.id,
        timestamp: Date.now(),
        preservedState
      }
    };

    // Add domain-specific context
    if (!transitionContext.working_memory) {
      transitionContext.working_memory = { domains: {} };
    }

    transitionContext.working_memory.domains[currentDomain.id] = {
      status: 'active',
      last_modified: Date.now(),
      critical_facts: currentDomain.keywords?.slice(0, 5) || [],
      files_created: currentDomain.files.map(f => f.path),
      decisions_made: [`Switched to ${currentDomain.name} domain`]
    };

    return transitionContext;
  }

  /**
   * Record domain switch for performance tracking
   */
  recordDomainSwitch(switchResult) {
    this.switchHistory.push(switchResult);

    // Keep last 100 switches
    if (this.switchHistory.length > 100) {
      this.switchHistory.shift();
    }
  }

  /**
   * Create empty context for initialization
   */
  createEmptyContext() {
    return {
      working_memory: {
        session_count: 1,
        last_session: Date.now(),
        domains: {}
      }
    };
  }

  /**
   * Get current domain information
   */
  getCurrentDomain() {
    return this.currentDomain;
  }

  /**
   * Get all domains with their current states
   */
  getAllDomains() {
    return Array.from(this.domains.values());
  }

  /**
   * Get active domains
   */
  getActiveDomains() {
    return Array.from(this.activeDomains).map(id => this.domains.get(id));
  }

  /**
   * Get domain by ID
   */
  getDomain(domainId) {
    return this.domains.get(domainId);
  }

  /**
   * Start optimization schedule
   */
  startOptimizationSchedule() {
    if (this.optimizationSchedule) {
      clearInterval(this.optimizationSchedule);
    }

    this.optimizationSchedule = setInterval(() => {
      this.performScheduledOptimization();
    }, this.config.memory.optimizationIntervalMs);
  }

  /**
   * Start discovery schedule
   */
  startDiscoverySchedule() {
    if (this.discoverySchedule) {
      clearInterval(this.discoverySchedule);
    }

    this.discoverySchedule = setInterval(() => {
      this.performScheduledDiscovery();
    }, this.config.domains.discoveryIntervalMs);
  }

  /**
   * Perform scheduled optimization
   */
  async performScheduledOptimization() {
    try {
      const context = this.createEmptyContext(); // Use minimal context for scheduled optimization
      const domains = Array.from(this.domains.values());

      const result = this.optimizer.optimizeActiveSet(domains, context);

      if (result.optimized) {
        this.emit('scheduled_optimization_completed', result);
      }
    } catch (error) {
      this.emit('scheduled_optimization_failed', { error: error.message });
    }
  }

  /**
   * Perform scheduled discovery
   */
  async performScheduledDiscovery() {
    if (!this.projectPath) return;

    try {
      const discoveryResult = await this.discovery.discoverDomains(this.projectPath, {
        forceRefresh: true
      });

      // Check if new domains were discovered
      const newDomains = discoveryResult.domains.filter(domain =>
        !this.domains.has(domain.id)
      );

      if (newDomains.length > 0) {
        this.emit('new_domains_discovered', {
          newDomains: newDomains.length,
          totalDomains: discoveryResult.domains.length
        });

        // Update domain definitions if needed
        // This could trigger a re-initialization
      }
    } catch (error) {
      this.emit('scheduled_discovery_failed', { error: error.message });
    }
  }

  /**
   * Event handling
   */
  on(event, listener) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(listener);
  }

  emit(event, data) {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.warn(`Event listener error for ${event}:`, error);
      }
    });
  }

  /**
   * Get comprehensive diagnostics
   */
  getDiagnostics() {
    const memoryStatus = this.optimizer.getMemoryStatus();
    const recentSwitches = this.switchHistory.slice(-10);

    return {
      domains: {
        total: this.domains.size,
        active: this.activeDomains.size,
        current: this.currentDomain?.id,
        maxActive: this.config.domains.maxActiveDomains
      },
      memory: memoryStatus,
      performance: {
        recentSwitches,
        averageSwitchTime: recentSwitches.length > 0 ?
          recentSwitches.reduce((sum, s) => sum + s.switchTime, 0) / recentSwitches.length : 0,
        totalSwitches: this.switchHistory.length
      },
      scheduling: {
        optimizationInterval: this.config.memory.optimizationIntervalMs,
        discoveryInterval: this.config.domains.discoveryIntervalMs,
        optimizationActive: !!this.optimizationSchedule,
        discoveryActive: !!this.discoverySchedule
      },
      components: {
        discovery: this.discovery.getDiagnostics(),
        dependencies: this.dependencies.getDiagnostics(),
        optimizer: this.optimizer.getDiagnostics(),
        compressor: this.compressor.getDiagnostics(),
        stateVector: this.stateVector.getDiagnostics()
      }
    };
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.optimizationSchedule) {
      clearInterval(this.optimizationSchedule);
      this.optimizationSchedule = null;
    }

    if (this.discoverySchedule) {
      clearInterval(this.discoverySchedule);
      this.discoverySchedule = null;
    }

    this.eventListeners.clear();
    this.emit('domain_manager_destroyed', { timestamp: Date.now() });
  }
}

module.exports = DomainManager;
