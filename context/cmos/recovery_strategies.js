// recovery_strategies.js
// Automated Recovery Mechanisms for Mission 3.1
// Provides sophisticated recovery strategies for each anti-pattern type

class RecoveryStrategies {
  constructor(config = {}) {
    this.config = {
      // Recovery timing
      immediateRecoveryMs: config.immediateRecoveryMs || 1000,
      delayedRecoveryMs: config.delayedRecoveryMs || 5000,

      // Recovery aggressiveness levels
      conservativeThreshold: config.conservativeThreshold || 0.3,
      moderateThreshold: config.moderateThreshold || 0.6,
      aggressiveThreshold: config.aggressiveThreshold || 0.8,

      // Safety limits
      maxCompressionRatio: config.maxCompressionRatio || 10.0,
      minPreservationRatio: config.minPreservationRatio || 0.1,
      maxDomainSplit: config.maxDomainSplit || 5,

      // Recovery validation
      enableValidation: config.enableValidation !== false,
      validationTimeout: config.validationTimeout || 10000,

      ...config
    };

    // Recovery state tracking
    this.recoveryHistory = [];
    this.activeRecoveries = new Map();
    this.recoveryMetrics = {
      total: 0,
      successful: 0,
      failed: 0,
      byStrategy: {},
      byPattern: {}
    };
  }

  /**
   * Execute recovery strategy based on anti-pattern type and severity
   * @param {Object} antiPattern - Detected anti-pattern
   * @param {Object} context - Current context
   * @param {Object} dependencies - Required dependencies (compressor, domainManager, etc.)
   * @param {Object} options - Recovery options
   * @returns {Promise<Object>} Recovery result
   */
  async executeRecovery(antiPattern, context, dependencies, options = {}) {
    const recoveryId = `${antiPattern.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      // Mark recovery as active
      this.activeRecoveries.set(recoveryId, {
        type: antiPattern.type,
        severity: antiPattern.severity,
        startTime,
        status: 'in_progress'
      });

      // Select and execute recovery strategy
      let result;
      switch (antiPattern.type) {
        case 'context_rot':
          result = await this.recoverContextRot(antiPattern, context, dependencies, options);
          break;
        case 'context_explosion':
          result = await this.recoverContextExplosion(antiPattern, context, dependencies, options);
          break;
        case 'memory_leak':
          result = await this.recoverMemoryLeak(antiPattern, context, dependencies, options);
          break;
        case 'state_oscillation':
          result = await this.recoverStateOscillation(antiPattern, context, dependencies, options);
          break;
        case 'domain_bloat':
          result = await this.recoverDomainBloat(antiPattern, context, dependencies, options);
          break;
        case 'compression_degradation':
          result = await this.recoverCompressionDegradation(antiPattern, context, dependencies, options);
          break;
        default:
          result = await this.genericRecovery(antiPattern, context, dependencies, options);
      }

      // Validate recovery if enabled
      if (this.config.enableValidation && result.success) {
        const validation = await this.validateRecovery(result, context, dependencies);
        result.validation = validation;
        result.validated = validation.passed;
      }

      // Record recovery completion
      const completedRecovery = {
        id: recoveryId,
        type: antiPattern.type,
        severity: antiPattern.severity,
        strategy: result.strategy,
        success: result.success,
        duration: Date.now() - startTime,
        result,
        timestamp: Date.now()
      };

      this.recordRecoveryCompletion(completedRecovery);
      this.activeRecoveries.delete(recoveryId);

      return {
        ...result,
        recoveryId,
        duration: completedRecovery.duration
      };

    } catch (error) {
      // Record recovery failure
      const failedRecovery = {
        id: recoveryId,
        type: antiPattern.type,
        severity: antiPattern.severity,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };

      this.recordRecoveryCompletion(failedRecovery);
      this.activeRecoveries.delete(recoveryId);

      return {
        success: false,
        error: error.message,
        recoveryId,
        duration: failedRecovery.duration,
        strategy: 'error_fallback'
      };
    }
  }

  /**
   * Recover from context rot using state compression and stabilization
   */
  async recoverContextRot(antiPattern, context, dependencies, options) {
    const { compressor, stateVector, domainManager } = dependencies;
    const severity = antiPattern.severity;

    // Strategy selection based on severity
    if (severity < this.config.conservativeThreshold) {
      return this.conservativeRotRecovery(context, compressor, stateVector);
    } else if (severity < this.config.moderateThreshold) {
      return this.moderateRotRecovery(context, compressor, domainManager);
    } else {
      return this.aggressiveRotRecovery(context, compressor, domainManager, stateVector);
    }
  }

  async conservativeRotRecovery(context, compressor, stateVector) {
    // Light compression to reduce temporal complexity
    const compressionResult = compressor.compress(context, {
      targetRatio: 2.0,
      preserveCentrality: true,
      emergencyMode: false
    });

    return {
      success: compressionResult.ratio >= 1.5,
      strategy: 'conservative_compression',
      action: 'light_compression',
      compressionRatio: compressionResult.ratio,
      preservedRelevance: compressionResult.relevanceScore,
      description: `Applied conservative compression (${compressionResult.ratio.toFixed(1)}x)`
    };
  }

  async moderateRotRecovery(context, compressor, domainManager) {
    // Moderate compression + domain archival
    const compressionResult = compressor.compress(context, {
      targetRatio: 3.5,
      preserveCentrality: true,
      emergencyMode: false
    });

    // Archive least recently used domains
    const activeDomains = domainManager.getActiveDomains();
    const lruDomains = activeDomains
      .filter(d => d.lastAccessed && Date.now() - d.lastAccessed > 600000) // 10 minutes
      .sort((a, b) => a.lastAccessed - b.lastAccessed);

    let archivedCount = 0;
    const maxToArchive = Math.min(2, lruDomains.length);

    for (let i = 0; i < maxToArchive; i++) {
      if (domainManager.deactivateDomain(lruDomains[i].id)) {
        archivedCount++;
      }
    }

    return {
      success: compressionResult.ratio >= 2.0 || archivedCount > 0,
      strategy: 'moderate_compression_archival',
      action: 'compression_and_archival',
      compressionRatio: compressionResult.ratio,
      archivedDomains: archivedCount,
      description: `Compression (${compressionResult.ratio.toFixed(1)}x) + archived ${archivedCount} domains`
    };
  }

  async aggressiveRotRecovery(context, compressor, domainManager, stateVector) {
    // Emergency compression + state reset
    const emergencyResult = compressor.compress(context, {
      targetRatio: 6.0,
      preserveCentrality: false,
      emergencyMode: true
    });

    // Reset state vector history to clear temporal artifacts
    const historyBackup = [...stateVector.history];
    stateVector.history = stateVector.history.slice(-5); // Keep only recent history

    // Deactivate all but most critical domain
    const activeDomains = domainManager.getActiveDomains();
    const criticalDomain = activeDomains.find(d => d.state === 'active') || activeDomains[0];

    let deactivatedCount = 0;
    activeDomains.forEach(domain => {
      if (domain.id !== criticalDomain?.id) {
        if (domainManager.deactivateDomain(domain.id)) {
          deactivatedCount++;
        }
      }
    });

    return {
      success: emergencyResult.ratio >= 4.0,
      strategy: 'aggressive_emergency_recovery',
      action: 'emergency_compression_and_reset',
      compressionRatio: emergencyResult.ratio,
      historyReset: historyBackup.length - stateVector.history.length,
      deactivatedDomains: deactivatedCount,
      criticalDomain: criticalDomain?.id,
      description: `Emergency recovery: ${emergencyResult.ratio.toFixed(1)}x compression, reset history, kept ${criticalDomain?.name || 'none'}`
    };
  }

  /**
   * Recover from context explosion using emergency compression and domain management
   */
  async recoverContextExplosion(antiPattern, context, dependencies, options) {
    const { compressor, domainManager } = dependencies;
    const isMemoryExplosion = antiPattern.subtype === 'memory_explosion';
    const isComplexityExplosion = antiPattern.subtype === 'complexity_explosion';

    if (isMemoryExplosion) {
      return this.recoverMemoryExplosion(context, compressor, domainManager, antiPattern);
    } else if (isComplexityExplosion) {
      return this.recoverComplexityExplosion(context, compressor, domainManager, antiPattern);
    }

    // Generic explosion recovery
    return this.recoverGenericExplosion(context, compressor, domainManager, antiPattern);
  }

  async recoverMemoryExplosion(context, compressor, domainManager, antiPattern) {
    const currentMemoryKB = antiPattern.metrics.currentMemoryKB;
    const threshold = antiPattern.metrics.threshold;
    const overageRatio = currentMemoryKB / threshold;

    // Calculate required compression ratio to get back under threshold
    const requiredRatio = Math.min(this.config.maxCompressionRatio, overageRatio * 1.2);

    const emergencyResult = compressor.compress(context, {
      targetRatio: requiredRatio,
      emergencyMode: true,
      preserveCentrality: overageRatio < 2.0 // Only preserve centrality if not severely over
    });

    // If compression insufficient, start deactivating domains
    let deactivatedDomains = 0;
    if (emergencyResult.compressedSize > threshold * 1024) {
      const activeDomains = domainManager.getActiveDomains()
        .sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0)); // LRU first

      const targetSize = threshold * 0.8 * 1024; // 80% of threshold
      let currentSize = emergencyResult.compressedSize;

      for (const domain of activeDomains) {
        if (currentSize <= targetSize) break;
        if (domainManager.deactivateDomain(domain.id)) {
          deactivatedDomains++;
          currentSize *= 0.9; // Estimate 10% size reduction per domain
        }
      }
    }

    return {
      success: emergencyResult.compressedSize <= threshold * 1024 * 1.1, // Allow 10% overage
      strategy: 'memory_explosion_recovery',
      action: 'emergency_compression_and_deactivation',
      originalMemoryKB: currentMemoryKB,
      targetMemoryKB: threshold,
      finalMemoryKB: emergencyResult.compressedSize / 1024,
      compressionRatio: emergencyResult.ratio,
      deactivatedDomains,
      description: `Emergency compression (${emergencyResult.ratio.toFixed(1)}x) + deactivated ${deactivatedDomains} domains`
    };
  }

  async recoverComplexityExplosion(context, compressor, domainManager, antiPattern) {
    const currentComplexity = antiPattern.metrics.currentComplexity;
    const growthRate = antiPattern.metrics.growthRate;

    // Aggressive complexity reduction
    const simplificationResult = this.simplifyContextStructure(context);

    // Apply compression optimized for complexity reduction
    const compressionResult = compressor.compress(simplificationResult.context, {
      targetRatio: 4.0,
      enableTemporalCompression: true,
      emergencyMode: growthRate > 1.0
    });

    return {
      success: compressionResult.ratio >= 3.0,
      strategy: 'complexity_explosion_recovery',
      action: 'structural_simplification_and_compression',
      originalComplexity: currentComplexity,
      simplificationSteps: simplificationResult.steps,
      compressionRatio: compressionResult.ratio,
      description: `Simplified structure (${simplificationResult.steps} steps) + compression (${compressionResult.ratio.toFixed(1)}x)`
    };
  }

  async recoverGenericExplosion(context, compressor, domainManager, antiPattern) {
    // Generic explosion strategy: aggressive compression
    const result = compressor.compress(context, {
      targetRatio: 5.0,
      emergencyMode: true,
      preserveCentrality: false
    });

    return {
      success: result.ratio >= 3.0,
      strategy: 'generic_explosion_recovery',
      action: 'aggressive_compression',
      compressionRatio: result.ratio,
      description: `Aggressive compression achieved ${result.ratio.toFixed(1)}x ratio`
    };
  }

  /**
   * Recover from memory leaks using garbage collection and domain cleanup
   */
  async recoverMemoryLeak(antiPattern, context, dependencies, options) {
    const { domainManager } = dependencies;
    const growthRate = antiPattern.metrics.growthRate;
    const suspectedDomains = antiPattern.metrics.suspectedDomains;

    // Phase 1: Garbage collection
    const gcResult = this.performGarbageCollection(context, suspectedDomains);

    // Phase 2: Domain cleanup based on leak severity
    let cleanupResult = { domainsCleaned: 0, memoryFreed: 0 };
    if (growthRate > 0.5) { // High growth rate
      cleanupResult = this.performDomainCleanup(context, domainManager, suspectedDomains);
    }

    // Phase 3: Orphan reference removal
    const orphanResult = this.removeOrphanedReferences(context);

    const totalMemoryFreed = gcResult.memoryFreed + cleanupResult.memoryFreed + orphanResult.memoryFreed;

    return {
      success: totalMemoryFreed > 0,
      strategy: 'memory_leak_recovery',
      action: 'garbage_collection_and_cleanup',
      memoryFreed: totalMemoryFreed,
      garbageCollected: gcResult.itemsCollected,
      domainsCleanedUp: cleanupResult.domainsCleaned,
      orphansRemoved: orphanResult.orphansRemoved,
      description: `Freed ${totalMemoryFreed.toFixed(1)}KB via GC and cleanup`
    };
  }

  /**
   * Recover from state oscillation using dampening and stabilization
   */
  async recoverStateOscillation(antiPattern, context, dependencies, options) {
    const { stateVector } = dependencies;
    const frequency = antiPattern.metrics.frequency;
    const amplitude = antiPattern.metrics.amplitude;
    const affectedDimensions = antiPattern.metrics.affectedDimensions;

    // Apply dampening strategies based on oscillation characteristics
    const dampeningResult = this.applyOscillationDampening(context, stateVector, {
      frequency,
      amplitude,
      affectedDimensions
    });

    // Stabilize state history
    const stabilizationResult = this.stabilizeStateHistory(stateVector, affectedDimensions);

    return {
      success: dampeningResult.applied && stabilizationResult.stabilized,
      strategy: 'state_oscillation_recovery',
      action: 'dampening_and_stabilization',
      dampeningFactor: dampeningResult.factor,
      stabilizedDimensions: stabilizationResult.dimensionsStabilized,
      historyAdjustments: stabilizationResult.adjustments,
      description: `Applied dampening (factor: ${dampeningResult.factor}) and stabilized ${stabilizationResult.dimensionsStabilized} dimensions`
    };
  }

  /**
   * Recover from domain bloat using splitting and compression
   */
  async recoverDomainBloat(antiPattern, context, dependencies, options) {
    const { domainManager, compressor } = dependencies;
    const bloatedDomains = antiPattern.metrics.bloatedDomains;
    const worstDomains = antiPattern.metrics.worstDomains;

    // Strategy: Split large domains and compress aggressively
    const splittingResult = this.splitBloatedDomains(context, worstDomains);

    // Compress remaining large domains
    const compressionResult = compressor.compress(splittingResult.context, {
      targetRatio: 3.0,
      preserveCentrality: true
    });

    return {
      success: splittingResult.domainsSplit > 0 || compressionResult.ratio >= 2.0,
      strategy: 'domain_bloat_recovery',
      action: 'domain_splitting_and_compression',
      domainsSplit: splittingResult.domainsSplit,
      compressionRatio: compressionResult.ratio,
      originalBloatedCount: bloatedDomains,
      description: `Split ${splittingResult.domainsSplit} domains and applied ${compressionResult.ratio.toFixed(1)}x compression`
    };
  }

  /**
   * Recover from compression degradation by resetting and retuning
   */
  async recoverCompressionDegradation(antiPattern, context, dependencies, options) {
    const { compressor } = dependencies;
    const metrics = antiPattern.metrics;

    // Reset compression system state
    compressor.compressionHistory = [];
    compressor.compressionTimes = [];

    // Retune compression strategies
    const retuningResult = this.retuneCompressionStrategies(compressor, metrics);

    // Test new compression settings
    const testResult = compressor.compress(context, {
      targetRatio: 2.5,
      preserveCentrality: true
    });

    return {
      success: testResult.ratio >= 2.0 && testResult.relevanceScore >= 0.8,
      strategy: 'compression_degradation_recovery',
      action: 'reset_and_retune',
      retuningSteps: retuningResult.steps,
      testCompressionRatio: testResult.ratio,
      testRelevanceScore: testResult.relevanceScore,
      description: `Reset compression system and retuned ${retuningResult.steps} parameters`
    };
  }

  /**
   * Generic recovery fallback
   */
  async genericRecovery(antiPattern, context, dependencies, options) {
    const { compressor } = dependencies;

    // Apply moderate compression as fallback
    const result = compressor.compress(context, {
      targetRatio: 2.5,
      preserveCentrality: true
    });

    return {
      success: result.ratio >= 1.5,
      strategy: 'generic_fallback_recovery',
      action: 'moderate_compression',
      compressionRatio: result.ratio,
      description: `Fallback compression achieved ${result.ratio.toFixed(1)}x ratio`
    };
  }

  /**
   * Helper methods for recovery operations
   */

  simplifyContextStructure(context) {
    const simplified = JSON.parse(JSON.stringify(context));
    let steps = 0;

    if (simplified.working_memory?.domains) {
      Object.keys(simplified.working_memory.domains).forEach(key => {
        const domain = simplified.working_memory.domains[key];

        // Simplify arrays
        if (domain.critical_facts?.length > 8) {
          domain.critical_facts = domain.critical_facts.slice(0, 5);
          steps++;
        }

        if (domain.decisions_made?.length > 5) {
          domain.decisions_made = domain.decisions_made.slice(0, 3);
          steps++;
        }

        if (domain.files_created?.length > 10) {
          domain.files_created = domain.files_created.slice(0, 5);
          steps++;
        }

        // Remove complex nested structures
        if (domain.context_data || domain.nested_data) {
          delete domain.context_data;
          delete domain.nested_data;
          steps++;
        }
      });
    }

    return { context: simplified, steps };
  }

  performGarbageCollection(context, suspectedDomains = []) {
    let memoryFreed = 0;
    let itemsCollected = 0;

    if (context.working_memory?.domains) {
      Object.keys(context.working_memory.domains).forEach(key => {
        const domain = context.working_memory.domains[key];

        // Remove null/undefined references
        if (domain.critical_facts) {
          const before = domain.critical_facts.length;
          domain.critical_facts = domain.critical_facts.filter(fact => fact != null && fact !== '');
          itemsCollected += before - domain.critical_facts.length;
        }

        // Clean empty arrays and objects
        if (domain.files_created?.length === 0) {
          delete domain.files_created;
          itemsCollected++;
        }

        if (domain.decisions_made?.length === 0) {
          delete domain.decisions_made;
          itemsCollected++;
        }

        // Estimate memory freed (rough approximation)
        memoryFreed += itemsCollected * 0.1; // 0.1KB per item
      });
    }

    return { memoryFreed, itemsCollected };
  }

  performDomainCleanup(context, domainManager, suspectedDomains) {
    let domainsCleaned = 0;
    let memoryFreed = 0;

    if (context.working_memory?.domains) {
      Object.keys(context.working_memory.domains).forEach(key => {
        const domain = context.working_memory.domains[key];

        // Clean completed domains aggressively
        if (domain.status === 'completed') {
          const sizeBefore = JSON.stringify(domain).length;

          // Keep only essential information
          const cleaned = {
            status: domain.status,
            last_modified: domain.last_modified,
            critical_facts: (domain.critical_facts || []).slice(0, 1),
            files_created: (domain.files_created || []).slice(0, 1),
            decisions_made: []
          };

          context.working_memory.domains[key] = cleaned;

          const sizeAfter = JSON.stringify(cleaned).length;
          memoryFreed += (sizeBefore - sizeAfter) / 1024;
          domainsCleaned++;
        }
      });
    }

    return { domainsCleaned, memoryFreed };
  }

  removeOrphanedReferences(context) {
    let orphansRemoved = 0;
    let memoryFreed = 0;

    // Remove orphaned properties at root level
    const orphanKeys = ['temp_data', 'cache', 'temporary', '_internal'];
    orphanKeys.forEach(key => {
      if (context[key]) {
        delete context[key];
        orphansRemoved++;
        memoryFreed += 0.5; // Estimate
      }
    });

    return { orphansRemoved, memoryFreed };
  }

  applyOscillationDampening(context, stateVector, oscillationMetrics) {
    const { frequency, amplitude, affectedDimensions } = oscillationMetrics;

    // Calculate dampening factor based on oscillation characteristics
    const dampeningFactor = Math.min(0.9, 0.5 + (amplitude * frequency));

    // Apply dampening to state vector history
    if (stateVector.history.length >= 3) {
      const recent = stateVector.history.slice(-3);

      // Smooth out oscillations in affected dimensions
      affectedDimensions.forEach(dim => {
        const values = recent.map(s => s[dim]);
        const smoothed = this.applySmoothingFilter(values, dampeningFactor);

        // Update recent history with smoothed values
        recent.forEach((state, i) => {
          state[dim] = smoothed[i];
        });
      });
    }

    return { applied: true, factor: dampeningFactor };
  }

  stabilizeStateHistory(stateVector, affectedDimensions) {
    let adjustments = 0;

    if (stateVector.history.length >= 5) {
      const recent = stateVector.history.slice(-5);

      // Apply stability correction to reduce variance
      affectedDimensions.forEach(dim => {
        const values = recent.map(s => s[dim]);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = this.calculateVariance(values);

        if (variance > 0.1) {
          // Apply variance reduction
          recent.forEach(state => {
            const diff = state[dim] - mean;
            state[dim] = mean + (diff * 0.7); // Reduce deviation by 30%
          });
          adjustments++;
        }
      });
    }

    return {
      stabilized: adjustments > 0,
      dimensionsStabilized: adjustments,
      adjustments
    };
  }

  splitBloatedDomains(context, worstDomains) {
    let domainsSplit = 0;

    if (context.working_memory?.domains) {
      Object.keys(context.working_memory.domains).forEach(key => {
        const domain = context.working_memory.domains[key];

        // Split domains with too many files
        if (domain.files_created?.length > 15) {
          const half = Math.ceil(domain.files_created.length / 2);
          domain.files_created = domain.files_created.slice(0, half);
          domainsSplit++;
        }

        // Split domains with too many facts
        if (domain.critical_facts?.length > 15) {
          const half = Math.ceil(domain.critical_facts.length / 2);
          domain.critical_facts = domain.critical_facts.slice(0, half);
        }
      });
    }

    return { context, domainsSplit };
  }

  retuneCompressionStrategies(compressor, metrics) {
    let steps = 0;

    // Adjust compression ratios based on performance
    if (metrics.averageRatio < 2.0) {
      // Increase target ratios
      Object.keys(compressor.config.targetRatios).forEach(zone => {
        compressor.config.targetRatios[zone] *= 1.2;
      });
      steps++;
    }

    // Adjust relevance thresholds
    if (metrics.averageRelevance < 0.8) {
      compressor.config.targetRelevanceScore = Math.max(0.7, metrics.averageRelevance - 0.1);
      steps++;
    }

    // Adjust performance thresholds
    if (metrics.averageProcessingMs > 100) {
      compressor.config.maxProcessingTimeMs = metrics.averageProcessingMs * 1.5;
      steps++;
    }

    return { steps };
  }

  applySmoothingFilter(values, factor) {
    if (values.length < 2) return values;

    const smoothed = [values[0]];
    for (let i = 1; i < values.length; i++) {
      smoothed[i] = smoothed[i - 1] * (1 - factor) + values[i] * factor;
    }

    return smoothed;
  }

  calculateVariance(values) {
    if (values.length < 2) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;

    return variance;
  }

  /**
   * Validate recovery effectiveness
   */
  async validateRecovery(recoveryResult, context, dependencies) {
    const { stateVector } = dependencies;

    try {
      // Recalculate state after recovery
      const newState = stateVector.calculate(context);

      // Basic validation checks
      const checks = {
        stateImproved: newState.magnitude > 0.4,
        dimensionsViable: newState.isViable,
        compressionEffective: recoveryResult.compressionRatio ? recoveryResult.compressionRatio >= 1.5 : true,
        noNewDegradation: newState.healthAssessment?.status !== 'critical'
      };

      const passedChecks = Object.values(checks).filter(check => check).length;
      const totalChecks = Object.keys(checks).length;

      return {
        passed: passedChecks >= totalChecks * 0.75, // 75% pass rate
        score: passedChecks / totalChecks,
        checks,
        newState: {
          magnitude: newState.magnitude,
          isViable: newState.isViable,
          dimensions: {
            Form: newState.Form,
            Function: newState.Function,
            Behavior: newState.Behavior,
            Context: newState.Context
          }
        }
      };
    } catch (error) {
      return {
        passed: false,
        score: 0,
        error: error.message
      };
    }
  }

  /**
   * Record recovery completion for metrics
   */
  recordRecoveryCompletion(recovery) {
    this.recoveryHistory.push(recovery);

    // Update metrics
    this.recoveryMetrics.total++;
    if (recovery.success) {
      this.recoveryMetrics.successful++;
    } else {
      this.recoveryMetrics.failed++;
    }

    // Update strategy metrics
    const strategy = recovery.result?.strategy || 'unknown';
    if (!this.recoveryMetrics.byStrategy[strategy]) {
      this.recoveryMetrics.byStrategy[strategy] = { total: 0, successful: 0 };
    }
    this.recoveryMetrics.byStrategy[strategy].total++;
    if (recovery.success) {
      this.recoveryMetrics.byStrategy[strategy].successful++;
    }

    // Update pattern metrics
    if (!this.recoveryMetrics.byPattern[recovery.type]) {
      this.recoveryMetrics.byPattern[recovery.type] = { total: 0, successful: 0 };
    }
    this.recoveryMetrics.byPattern[recovery.type].total++;
    if (recovery.success) {
      this.recoveryMetrics.byPattern[recovery.type].successful++;
    }

    // Maintain history size
    if (this.recoveryHistory.length > 100) {
      this.recoveryHistory.shift();
    }
  }

  /**
   * Get recovery statistics and diagnostics
   */
  getRecoveryStats() {
    const successRate = this.recoveryMetrics.total > 0 ?
      this.recoveryMetrics.successful / this.recoveryMetrics.total : 0;

    const averageDuration = this.recoveryHistory.length > 0 ?
      this.recoveryHistory.reduce((sum, r) => sum + r.duration, 0) / this.recoveryHistory.length : 0;

    return {
      total: this.recoveryMetrics.total,
      successful: this.recoveryMetrics.successful,
      failed: this.recoveryMetrics.failed,
      successRate,
      averageDuration,
      byStrategy: this.recoveryMetrics.byStrategy,
      byPattern: this.recoveryMetrics.byPattern,
      activeRecoveries: this.activeRecoveries.size,
      recentRecoveries: this.recoveryHistory.slice(-10)
    };
  }

  getDiagnostics() {
    return {
      configuration: this.config,
      statistics: this.getRecoveryStats(),
      activeRecoveries: Array.from(this.activeRecoveries.values()),
      capabilities: {
        supportedPatterns: [
          'context_rot',
          'context_explosion',
          'memory_leak',
          'state_oscillation',
          'domain_bloat',
          'compression_degradation'
        ],
        strategies: [
          'conservative_compression',
          'moderate_compression_archival',
          'aggressive_emergency_recovery',
          'memory_explosion_recovery',
          'complexity_explosion_recovery',
          'memory_leak_recovery',
          'state_oscillation_recovery',
          'domain_bloat_recovery',
          'compression_degradation_recovery'
        ]
      }
    };
  }
}

module.exports = RecoveryStrategies;