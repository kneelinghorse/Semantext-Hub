// active_set_optimizer.js
// Active Set Optimizer for Mission 2.2
// Maintains <30KB active context through intelligent domain selection and memory management

const SmartCompressor = require('./smart_compressor');
const ContextStateVector = require('./context_state');

class ActiveSetOptimizer {
  constructor(config = {}) {
    this.config = {
      // Memory budget settings
      memory: {
        maxActiveSizeKB: config.memory?.maxActiveSizeKB || 30,
        reserveBufferKB: config.memory?.reserveBufferKB || 5, // Keep 5KB buffer
        targetUtilization: config.memory?.targetUtilization || 0.85, // Use 85% of budget
        emergencyThresholdKB: config.memory?.emergencyThresholdKB || 35,
        ...config.memory
      },

      // Domain state management
      domainStates: {
        active: { compressionRatio: 1.0, priority: 1.0 },
        related: { compressionRatio: 2.5, priority: 0.7 },
        inactive: { compressionRatio: 4.0, priority: 0.3 },
        archived: { compressionRatio: 10.0, priority: 0.1 },
        ...config.domainStates
      },

      // Optimization thresholds
      optimization: {
        accessWindowMs: config.optimization?.accessWindowMs || 300000, // 5 minutes
        promotionThreshold: config.optimization?.promotionThreshold || 3, // 3 accesses
        demotionThreshold: config.optimization?.demotionThreshold || 0.1, // 10% usage
        emergencyCompressionRatio: config.optimization?.emergencyCompressionRatio || 6.0,
        ...config.optimization
      }
    };

    // Initialize compressor and state vector
    this.compressor = new SmartCompressor(config.compressor);
    this.stateVector = new ContextStateVector(config.stateVector);

    // Active set management
    this.activeDomains = new Map();
    this.domainStates = new Map();
    this.accessHistory = new Map();
    this.compressionCache = new Map();

    // Performance tracking
    this.optimizationHistory = [];
    this.memoryUsageHistory = [];

    // Current memory usage
    this.currentMemoryUsage = {
      totalKB: 0,
      activeKB: 0,
      relatedKB: 0,
      inactiveKB: 0,
      archivedKB: 0
    };
  }

  /**
   * Optimize active set for given domains and current context
   * @param {Array} domains - Available domains to manage
   * @param {Object} currentContext - Current working context
   * @param {Object} accessPattern - Recent access patterns
   * @returns {Object} Optimization result with memory usage
   */
  optimizeActiveSet(domains, currentContext, accessPattern = {}) {
    const startTime = Date.now();

    try {
      // Step 1: Calculate current memory usage
      const initialMemory = this.calculateMemoryUsage(domains, currentContext);

      // Step 2: Update access patterns
      this.updateAccessPatterns(accessPattern);

      // Step 3: Classify domains by state
      const domainClassification = this.classifyDomains(domains, accessPattern);

      // Step 4: Check if optimization is needed
      const optimizationNeeded = this.isOptimizationNeeded(initialMemory);

      let result = {
        optimized: false,
        reason: 'Within memory budget',
        memoryUsage: initialMemory,
        domainStates: domainClassification,
        optimizationTime: Date.now() - startTime
      };

      if (optimizationNeeded.needed) {
        // Step 5: Apply optimization strategy
        const optimizationStrategy = this.selectOptimizationStrategy(
          optimizationNeeded,
          domainClassification,
          initialMemory
        );

        // Step 6: Execute optimization
        const optimizedDomains = this.executeOptimization(
          domains,
          domainClassification,
          optimizationStrategy
        );

        // Step 7: Calculate final memory usage
        const finalMemory = this.calculateMemoryUsage(optimizedDomains, currentContext);

        result = {
          optimized: true,
          reason: optimizationNeeded.reason,
          strategy: optimizationStrategy.name,
          initialMemory,
          finalMemory,
          memoryReduction: initialMemory.totalKB - finalMemory.totalKB,
          compressionRatio: initialMemory.totalKB / finalMemory.totalKB,
          domainStates: this.classifyDomains(optimizedDomains, accessPattern),
          optimizedDomains,
          optimizationTime: Date.now() - startTime
        };

        // Update internal state
        this.updateInternalState(optimizedDomains, result);
      }

      // Record optimization
      this.recordOptimization(result);

      return result;

    } catch (error) {
      throw new Error(`Active set optimization failed: ${error.message}`);
    }
  }

  /**
   * Calculate current memory usage across domains
   */
  calculateMemoryUsage(domains, currentContext) {
    const usage = {
      totalKB: 0,
      activeKB: 0,
      relatedKB: 0,
      inactiveKB: 0,
      archivedKB: 0,
      domains: {}
    };

    domains.forEach(domain => {
      const domainMemory = this.calculateDomainMemory(domain, currentContext);
      const state = this.getDomainState(domain.id);

      usage.totalKB += domainMemory;
      usage[state + 'KB'] += domainMemory;
      usage.domains[domain.id] = {
        sizeKB: domainMemory,
        state,
        files: domain.files.length
      };
    });

    return usage;
  }

  /**
   * Calculate memory usage for a single domain
   */
  calculateDomainMemory(domain, currentContext) {
    // Base domain size
    let baseSize = JSON.stringify(domain).length;

    // Add context data if this domain is active in current context
    if (currentContext?.working_memory?.domains?.[domain.id]) {
      const contextData = currentContext.working_memory.domains[domain.id];
      baseSize += JSON.stringify(contextData).length;
    }

    // Apply compression based on domain state
    const state = this.getDomainState(domain.id);
    const compressionRatio = this.config.domainStates[state]?.compressionRatio || 1.0;

    return (baseSize / 1024) / compressionRatio;
  }

  /**
   * Update access patterns for domains
   */
  updateAccessPatterns(accessPattern) {
    const now = Date.now();

    Object.entries(accessPattern).forEach(([domainId, accessData]) => {
      if (!this.accessHistory.has(domainId)) {
        this.accessHistory.set(domainId, []);
      }

      const history = this.accessHistory.get(domainId);

      // Add new access record
      history.push({
        timestamp: now,
        type: accessData.type || 'read',
        duration: accessData.duration || 0,
        operations: accessData.operations || 1
      });

      // Clean old access records (outside window)
      const cutoff = now - this.config.optimization.accessWindowMs;
      this.accessHistory.set(domainId,
        history.filter(record => record.timestamp > cutoff)
      );
    });
  }

  /**
   * Classify domains by their current state
   */
  classifyDomains(domains, accessPattern) {
    const classification = {
      active: [],
      related: [],
      inactive: [],
      archived: []
    };

    domains.forEach(domain => {
      const state = this.calculateDomainState(domain, accessPattern);
      classification[state].push(domain);
      this.domainStates.set(domain.id, state);
    });

    return classification;
  }

  /**
   * Calculate optimal state for a domain
   */
  calculateDomainState(domain, accessPattern) {
    const domainId = domain.id;
    const accessHistory = this.accessHistory.get(domainId) || [];
    const recentAccess = accessPattern[domainId];

    // Factor 1: Recent access frequency (40%)
    const accessScore = this.calculateAccessScore(accessHistory, recentAccess) * 0.4;

    // Factor 2: Domain importance (30%)
    const importanceScore = this.calculateImportanceScore(domain) * 0.3;

    // Factor 3: Dependency relationships (20%)
    const dependencyScore = this.calculateDependencyScore(domain) * 0.2;

    // Factor 4: Size efficiency (10%)
    const sizeScore = this.calculateSizeScore(domain) * 0.1;

    const totalScore = accessScore + importanceScore + dependencyScore + sizeScore;

    // Classify based on total score
    if (totalScore >= 0.75) return 'active';
    if (totalScore >= 0.5) return 'related';
    if (totalScore >= 0.25) return 'inactive';
    return 'archived';
  }

  /**
   * Calculate access score for a domain
   */
  calculateAccessScore(accessHistory, recentAccess) {
    const now = Date.now();
    const windowMs = this.config.optimization.accessWindowMs;

    // Score recent direct access higher
    if (recentAccess) {
      return Math.min(1.0, recentAccess.operations / 5);
    }

    // Score based on historical access patterns
    if (accessHistory.length === 0) return 0;

    const recentAccesses = accessHistory.filter(
      access => (now - access.timestamp) < windowMs / 2
    );

    const accessFrequency = recentAccesses.length / (windowMs / 60000); // per minute
    return Math.min(1.0, accessFrequency / this.config.optimization.promotionThreshold);
  }

  /**
   * Calculate importance score for a domain
   */
  calculateImportanceScore(domain) {
    let score = 0;

    // File count (larger domains might be more important)
    score += Math.min(0.3, domain.files.length / 20);

    // Keywords (domains with more keywords are more specific/important)
    score += Math.min(0.3, (domain.keywords?.length || 0) / 10);

    // Dependencies (domains with more dependencies are central)
    const totalDeps = (domain.dependencies?.internal?.length || 0) +
                     (domain.dependencies?.external?.length || 0);
    score += Math.min(0.4, totalDeps / 10);

    return score;
  }

  /**
   * Calculate dependency score for a domain
   */
  calculateDependencyScore(domain) {
    // Higher score for domains that other domains depend on
    const dependentCount = domain.dependents?.length || 0;
    const dependencyCount = (domain.dependencies?.internal?.length || 0);

    // Domains that are depended upon are more critical
    const dependentScore = Math.min(0.6, dependentCount / 5);

    // Domains with fewer dependencies are more independent
    const independenceScore = Math.max(0, 0.4 - (dependencyCount / 10));

    return dependentScore + independenceScore;
  }

  /**
   * Calculate size efficiency score for a domain
   */
  calculateSizeScore(domain) {
    const avgFileSize = domain.metrics?.averageFileSize || 1;
    const totalSize = domain.metrics?.totalSize || 1;

    // Prefer smaller, more focused domains
    const sizeEfficiency = Math.max(0, 1 - (totalSize / 100000)); // 100KB baseline
    const focusScore = Math.max(0, 1 - (avgFileSize / 10000)); // 10KB per file baseline

    return (sizeEfficiency + focusScore) / 2;
  }

  /**
   * Check if optimization is needed
   */
  isOptimizationNeeded(memoryUsage) {
    const maxSizeKB = this.config.memory.maxActiveSizeKB;
    const emergencyThresholdKB = this.config.memory.emergencyThresholdKB;
    const targetUtilization = this.config.memory.targetUtilization;

    if (memoryUsage.totalKB > emergencyThresholdKB) {
      return {
        needed: true,
        severity: 'emergency',
        reason: `Memory usage (${memoryUsage.totalKB}KB) exceeds emergency threshold (${emergencyThresholdKB}KB)`
      };
    }

    if (memoryUsage.totalKB > maxSizeKB) {
      return {
        needed: true,
        severity: 'critical',
        reason: `Memory usage (${memoryUsage.totalKB}KB) exceeds target (${maxSizeKB}KB)`
      };
    }

    if (memoryUsage.totalKB > (maxSizeKB * targetUtilization)) {
      return {
        needed: true,
        severity: 'warning',
        reason: `Memory usage (${memoryUsage.totalKB}KB) exceeds target utilization (${maxSizeKB * targetUtilization}KB)`
      };
    }

    return { needed: false };
  }

  /**
   * Select optimization strategy based on current situation
   */
  selectOptimizationStrategy(optimizationNeed, domainClassification, memoryUsage) {
    switch (optimizationNeed.severity) {
      case 'emergency':
        return {
          name: 'emergency_compression',
          aggressiveness: 0.9,
          targetReduction: 0.6, // Reduce by 60%
          preserveActive: true,
          archiveInactive: true
        };

      case 'critical':
        return {
          name: 'aggressive_optimization',
          aggressiveness: 0.7,
          targetReduction: 0.4, // Reduce by 40%
          preserveActive: true,
          compressRelated: true
        };

      case 'warning':
        return {
          name: 'standard_optimization',
          aggressiveness: 0.5,
          targetReduction: 0.2, // Reduce by 20%
          preserveActive: true,
          compressRelated: false
        };

      default:
        return {
          name: 'minimal_optimization',
          aggressiveness: 0.3,
          targetReduction: 0.1,
          preserveActive: true
        };
    }
  }

  /**
   * Execute optimization strategy
   */
  executeOptimization(domains, domainClassification, strategy) {
    const optimizedDomains = [];

    // Process each domain based on its classification and strategy
    Object.entries(domainClassification).forEach(([state, domainsInState]) => {
      domainsInState.forEach(domain => {
        const optimizedDomain = this.optimizeDomain(domain, state, strategy);
        optimizedDomains.push(optimizedDomain);
      });
    });

    return optimizedDomains;
  }

  /**
   * Optimize a single domain based on its state and strategy
   */
  optimizeDomain(domain, state, strategy) {
    const cacheKey = `${domain.id}_${state}_${strategy.aggressiveness}`;

    // Check compression cache first
    if (this.compressionCache.has(cacheKey)) {
      const cached = this.compressionCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 60000) { // 1 minute cache
        return cached.domain;
      }
    }

    let optimizedDomain = { ...domain };

    // Apply state-specific optimization
    switch (state) {
      case 'active':
        if (strategy.name === 'emergency_compression') {
          // Light compression even for active domains in emergency
          optimizedDomain = this.applyCompression(domain, 1.5);
        }
        break;

      case 'related':
        const relatedRatio = strategy.compressRelated ?
          this.config.domainStates.related.compressionRatio * strategy.aggressiveness :
          this.config.domainStates.related.compressionRatio;
        optimizedDomain = this.applyCompression(domain, relatedRatio);
        break;

      case 'inactive':
        const inactiveRatio = this.config.domainStates.inactive.compressionRatio *
          (1 + strategy.aggressiveness);
        optimizedDomain = this.applyCompression(domain, inactiveRatio);

        if (strategy.archiveInactive) {
          optimizedDomain = this.archiveDomain(optimizedDomain);
        }
        break;

      case 'archived':
        optimizedDomain = this.applyCompression(domain,
          this.config.domainStates.archived.compressionRatio * 2);
        break;
    }

    // Cache the result
    this.compressionCache.set(cacheKey, {
      domain: optimizedDomain,
      timestamp: Date.now()
    });

    return optimizedDomain;
  }

  /**
   * Apply compression to a domain
   */
  applyCompression(domain, compressionRatio) {
    try {
      const compressionResult = this.compressor.compress(domain, {
        targetRatio: compressionRatio,
        preserveCentrality: true
      });

      return {
        ...domain,
        compressed: true,
        compressionRatio: compressionResult.ratio,
        compressedSize: compressionResult.compressedSize,
        originalSize: compressionResult.originalSize,
        relevanceScore: compressionResult.relevanceScore,
        compressionMetadata: compressionResult.metadata
      };

    } catch (error) {
      // Fallback to original domain if compression fails
      console.warn(`Domain compression failed for ${domain.id}: ${error.message}`);
      return domain;
    }
  }

  /**
   * Archive a domain (extreme compression)
   */
  archiveDomain(domain) {
    return {
      id: domain.id,
      name: domain.name,
      type: domain.type,
      state: 'archived',
      summary: {
        fileCount: domain.files?.length || 0,
        totalSize: domain.metrics?.totalSize || 0,
        keywords: (domain.keywords || []).slice(0, 3),
        lastModified: Date.now()
      },
      archived: true,
      originalSize: JSON.stringify(domain).length
    };
  }

  /**
   * Get current domain state
   */
  getDomainState(domainId) {
    return this.domainStates.get(domainId) || 'inactive';
  }

  /**
   * Update internal state after optimization
   */
  updateInternalState(optimizedDomains, result) {
    // Update active domains
    this.activeDomains.clear();
    optimizedDomains.forEach(domain => {
      const state = this.getDomainState(domain.id);
      if (state === 'active') {
        this.activeDomains.set(domain.id, domain);
      }
    });

    // Update memory usage
    this.currentMemoryUsage = result.finalMemory || result.memoryUsage;

    // Record memory usage history
    this.memoryUsageHistory.push({
      timestamp: Date.now(),
      ...this.currentMemoryUsage
    });

    // Keep last 100 records
    if (this.memoryUsageHistory.length > 100) {
      this.memoryUsageHistory.shift();
    }
  }

  /**
   * Record optimization for performance tracking
   */
  recordOptimization(result) {
    this.optimizationHistory.push({
      timestamp: Date.now(),
      optimized: result.optimized,
      strategy: result.strategy || 'none',
      optimizationTime: result.optimizationTime,
      memoryReduction: result.memoryReduction || 0,
      compressionRatio: result.compressionRatio || 1.0
    });

    // Keep last 50 optimizations
    if (this.optimizationHistory.length > 50) {
      this.optimizationHistory.shift();
    }
  }

  /**
   * Get current memory status
   */
  getMemoryStatus() {
    const usage = this.currentMemoryUsage;
    const maxSizeKB = this.config.memory.maxActiveSizeKB;

    return {
      currentUsage: usage,
      budget: {
        maxSizeKB,
        usedKB: usage.totalKB,
        availableKB: maxSizeKB - usage.totalKB,
        utilizationPercent: (usage.totalKB / maxSizeKB) * 100
      },
      status: this.getMemoryStatusLevel(usage.totalKB, maxSizeKB),
      activeDomains: this.activeDomains.size,
      lastOptimization: this.optimizationHistory[this.optimizationHistory.length - 1]
    };
  }

  /**
   * Get memory status level
   */
  getMemoryStatusLevel(currentKB, maxKB) {
    const utilization = currentKB / maxKB;

    if (utilization > 1.0) return 'critical';
    if (utilization > 0.9) return 'warning';
    if (utilization > 0.7) return 'moderate';
    return 'optimal';
  }

  /**
   * Get performance diagnostics
   */
  getDiagnostics() {
    const recentOptimizations = this.optimizationHistory.slice(-10);
    const avgOptimizationTime = recentOptimizations.length > 0 ?
      recentOptimizations.reduce((sum, opt) => sum + opt.optimizationTime, 0) / recentOptimizations.length : 0;

    const recentMemoryUsage = this.memoryUsageHistory.slice(-10);

    return {
      memoryStatus: this.getMemoryStatus(),
      performance: {
        averageOptimizationTimeMs: avgOptimizationTime,
        optimizationCount: this.optimizationHistory.length,
        compressionCacheSize: this.compressionCache.size,
        accessHistorySize: this.accessHistory.size
      },
      recentOptimizations,
      memoryTrend: recentMemoryUsage.map(usage => ({
        timestamp: usage.timestamp,
        totalKB: usage.totalKB,
        activeKB: usage.activeKB
      })),
      configuration: this.config
    };
  }
}

module.exports = ActiveSetOptimizer;