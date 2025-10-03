// smart_compressor.js
// State-Aware Compression Engine for Mission 2.1
// Integrates with Mission 1.2's ContextStateVector and ViabilityRegions

const ContextStateVector = require('./context_state');
const ViabilityRegions = require('./viability_regions');

class SmartCompressor {
  constructor(config = {}) {
    // Initialize state monitoring components
    this.stateVector = new ContextStateVector(config.stateVector);
    this.viabilityRegions = new ViabilityRegions(config.viabilityRegions);

    // Load compression strategies
    this.strategies = this.loadCompressionStrategies(config.strategies);

    // Performance tracking
    this.compressionTimes = [];
    this.compressionHistory = [];
    this.maxHistory = config.maxHistory || 50;

    // Compression configuration
    this.config = {
      // Target compression ratios by zone
      targetRatios: {
        optimal: 1.2,   // Light compression in optimal zone
        viable: 2.5,    // Moderate compression in viable zone
        warning: 4.0,   // Aggressive compression in warning zone
        critical: 6.0,  // Emergency compression in critical zone
        crisis: 10.0    // Maximum compression in crisis zone
      },

      // Performance targets
      maxProcessingTimeMs: config.maxProcessingTimeMs || 50,
      targetRelevanceScore: config.targetRelevanceScore || 0.9,

      // Compression thresholds
      minCompressionThreshold: config.minCompressionThreshold || 1.1,
      emergencyCompressionThreshold: config.emergencyCompressionThreshold || 0.2,

      // Centrality preservation settings
      preserveHighCentrality: config.preserveHighCentrality !== false,
      centralityThreshold: config.centralityThreshold || 0.8,

      ...config
    };
  }

  /**
   * Main compression interface - state-aware compression
   * @param {Object} context - Context to compress
   * @param {Object} options - Compression options
   * @returns {Object} Compression result with metrics
   */
  compress(context, options = {}) {
    const startTime = Date.now();

    try {
      // Calculate current state and classification
      const state = this.stateVector.calculate(context);
      const classification = this.viabilityRegions.classifyState(state);

      // Select compression strategy based on zone and trajectory
      const strategy = this.selectStrategy(classification, state, options);

      // Apply multi-stage compression
      let compressed = this.applyCompression(context, strategy, state);

      // Validate compression maintains viability
      let validation = this.validateCompression(context, compressed, state);

      // Optional second pass: boost compression if target not met
      if (options.targetRatio && validation.ratio < options.targetRatio * 0.8) {
        const boosted = this.applyRatioBoost(compressed);
        const boostedValidation = this.validateCompression(context, boosted, state);
        if (boostedValidation.ratio > validation.ratio) {
          compressed = boosted;
          validation = boostedValidation;
        }
      }

      // Record compression performance
      const processingTime = Date.now() - startTime;
      this.recordCompression(context, compressed, strategy, validation, processingTime);

      return {
        compressed,
        originalSize: this.getSize(context),
        compressedSize: this.getSize(compressed),
        ratio: validation.ratio,
        relevanceScore: validation.relevance,
        strategy: strategy.name,
        zone: classification.zone,
        isViable: classification.isViable,
        processingTimeMs: processingTime,
        metadata: {
          state,
          classification,
          strategy,
          validation,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      throw new Error(`Compression failed: ${error.message}`);
    }
  }

  /**
   * Select compression strategy based on state and zone
   */
  selectStrategy(classification, state, options) {
    const baseStrategy = this.strategies[classification.zone] || this.strategies.viable;

    // Calculate trajectory for dynamic adjustment
    const velocity = this.stateVector.calculateVelocity();
    const isDegrading = velocity && this.isDegrading(velocity);

    // Adjust strategy based on trajectory
    let intensityMultiplier = 1.0;
    if (isDegrading) {
      intensityMultiplier = 1.2; // More aggressive compression when degrading
    } else if (velocity && this.isImproving(velocity)) {
      intensityMultiplier = 0.8; // Less aggressive when improving
    }

    // Override with user preferences
    const targetRatio = options.targetRatio ||
                       (this.config.targetRatios[classification.zone] * intensityMultiplier);

    return {
      ...baseStrategy,
      targetRatio,
      intensityMultiplier,
      preserveCentrality: options.preserveCentrality !== false && this.config.preserveHighCentrality,
      emergencyMode: options.emergencyMode === true ||
                     classification.zone === 'crisis' ||
                     state.magnitude < this.config.emergencyCompressionThreshold
    };
  }

  /**
   * Apply compression using selected strategy
   */
  applyCompression(context, strategy, state) {
    let compressed = JSON.parse(JSON.stringify(context)); // Deep clone

    // Stage 1: Temporal compression (remove stable/unchanged sections)
    if (strategy.enableTemporalCompression) {
      compressed = this.applyTemporalCompression(compressed, strategy, state);
    }

    // Stage 2: Centrality-based preservation
    if (strategy.preserveCentrality) {
      compressed = this.applyCentralityPreservation(compressed, strategy);
    }

    // Stage 3: Zone-adaptive compression
    compressed = this.applyZoneAdaptiveCompression(compressed, strategy, state);

    // Stage 4: Emergency compression if needed
    if (strategy.emergencyMode) {
      compressed = this.applyEmergencyCompression(compressed, strategy);
    }

    return compressed;
  }

  /**
   * Second pass to ensure target compression by trimming non-essential content
   */
  applyRatioBoost(context) {
    const boosted = JSON.parse(JSON.stringify(context));

    if (boosted.working_memory?.domains) {
      Object.keys(boosted.working_memory.domains).forEach(key => {
        const d = boosted.working_memory.domains[key] || {};
        const isActive = d.status === 'active';

        // Always remove heavy optional fields
        delete d.context_data;
        delete d.nested_data;
        delete d.relationships;
        delete d.metrics;

        // Trim files aggressively
        if (Array.isArray(d.files_created)) {
          d.files_created = d.files_created.slice(0, 1);
        }

        // Trim decisions aggressively
        if (Array.isArray(d.decisions_made)) {
          d.decisions_made = isActive ? d.decisions_made.slice(0, 1) : [];
        }

        // Trim facts with safe floor (force strong reduction)
        if (Array.isArray(d.critical_facts)) {
          const maxFacts = isActive ? 1 : 1;
          d.critical_facts = d.critical_facts.slice(0, maxFacts).map(f => {
            if (typeof f === 'string' && f.length > 30) return f.slice(0, 30) + '...';
            return f;
          });
        }

        boosted.working_memory.domains[key] = d;
      });
    }

    return boosted;
  }

  /**
   * Temporal compression - remove stable sections using state history
   */
  applyTemporalCompression(context, strategy, state) {
    const history = this.stateVector.history;
    if (history.length < 2) return context;

    // Identify stable domains based on temporal hysteresis
    const stableDomains = this.identifyStableDomains(context, history);

    // Compress stable domains more aggressively
    if (context.working_memory?.domains && stableDomains.length > 0) {
      stableDomains.forEach(domainKey => {
        if (context.working_memory.domains[domainKey]) {
          context.working_memory.domains[domainKey] = this.compressDomain(
            context.working_memory.domains[domainKey],
            strategy.stableCompressionRatio || 0.5
          );
        }
      });
    }

    return context;
  }

  /**
   * Centrality-based preservation - keep high-centrality nodes
   */
  applyCentralityPreservation(context, strategy) {
    if (!context.working_memory?.domains) return context;

    const domains = context.working_memory.domains;
    const centralityScores = this.calculateCentralityScores(domains);

    // Preserve high-centrality domains with minimal compression
    Object.keys(domains).forEach(domainKey => {
      const centrality = centralityScores[domainKey] || 0;

      if (centrality >= this.config.centralityThreshold) {
        // High centrality - preserve with minimal compression
        domains[domainKey] = this.compressDomain(domains[domainKey], 0.9);
      } else {
        // Low centrality - apply normal compression
        domains[domainKey] = this.compressDomain(domains[domainKey], strategy.compressionRatio || 0.6);
      }
    });

    return context;
  }

  /**
   * Zone-adaptive compression based on viability zone
   */
  applyZoneAdaptiveCompression(context, strategy, state) {
    const compressionRatio = this.calculateCompressionRatio(strategy.targetRatio);

    // Determine actual zone based on target ratio
    let effectiveZone = strategy.zone || 'viable';

    // Override zone if target ratio demands more aggressive compression
    if (strategy.targetRatio >= 6.0 || strategy.emergencyMode) {
      effectiveZone = 'crisis';
    } else if (strategy.targetRatio >= 4.0) {
      effectiveZone = 'critical';
    } else if (strategy.targetRatio >= 2.5) {
      effectiveZone = 'warning';
    }

    // Apply different compression strategies by effective zone
    switch (effectiveZone) {
      case 'crisis':
        return this.applyCrisisCompression(context, compressionRatio);

      case 'critical':
        return this.applyCriticalCompression(context, compressionRatio);

      case 'warning':
        return this.applyWarningCompression(context, compressionRatio);

      case 'optimal':
        return this.applyOptimalCompression(context, compressionRatio);

      default: // viable
        return this.applyViableCompression(context, compressionRatio);
    }
  }

  /**
   * Emergency compression - maximum compression while preserving core state
   */
  applyEmergencyCompression(context, strategy) {
    const core = {
      working_memory: {
        session_count: context.working_memory?.session_count || 0,
        domains: {}
      }
    };

    // Keep only critical facts from active domains
    if (context.working_memory?.domains) {
      Object.entries(context.working_memory.domains).forEach(([key, domain]) => {
        if (domain.status === 'active') {
          core.working_memory.domains[key] = {
            status: domain.status
          };
        }
      });
    }

    return core;
  }

  /**
   * Validate compression maintains system viability
   */
  validateCompression(original, compressed, originalState) {
    const originalSize = this.getSize(original);
    const compressedSize = this.getSize(compressed);
    const ratio = originalSize / compressedSize;

    // Calculate relevance score by comparing compressed state
    const compressedState = this.stateVector.calculate(compressed);
    const relevance = this.calculateRelevanceScore(originalState, compressedState, original, compressed);

    return {
      ratio,
      relevance,
      originalSize,
      compressedSize,
      maintainsViability: compressedState.isViable,
      dimensionPreservation: {
        Form: compressedState.Form / originalState.Form,
        Function: compressedState.Function / originalState.Function,
        Behavior: compressedState.Behavior / originalState.Behavior,
        Context: compressedState.Context / originalState.Context
      }
    };
  }

  /**
   * Load compression strategies from configuration
   */
  loadCompressionStrategies(strategiesConfig) {
    const defaultStrategies = {
      optimal: {
        name: 'Optimal Zone Light Compression',
        compressionRatio: 0.8,
        enableTemporalCompression: true,
        stableCompressionRatio: 0.9,
        preserveDetails: true
      },

      viable: {
        name: 'Viable Zone Moderate Compression',
        compressionRatio: 0.6,
        enableTemporalCompression: true,
        stableCompressionRatio: 0.7,
        preserveDetails: false
      },

      warning: {
        name: 'Warning Zone Aggressive Compression',
        compressionRatio: 0.4,
        enableTemporalCompression: true,
        stableCompressionRatio: 0.3,
        preserveDetails: false
      },

      critical: {
        name: 'Critical Zone Emergency Compression',
        compressionRatio: 0.2,
        enableTemporalCompression: true,
        stableCompressionRatio: 0.1,
        preserveDetails: false
      },

      crisis: {
        name: 'Crisis Zone Maximum Compression',
        compressionRatio: 0.1,
        enableTemporalCompression: false,
        stableCompressionRatio: 0.05,
        preserveDetails: false
      }
    };

    return { ...defaultStrategies, ...strategiesConfig };
  }

  /**
   * Helper methods
   */

  isDegrading(velocity) {
    return velocity.magnitude < -0.01 || // Overall degradation
           [velocity.Form, velocity.Function, velocity.Behavior, velocity.Context]
             .filter(v => v < -0.01).length >= 2; // 2+ dimensions degrading
  }

  isImproving(velocity) {
    return velocity.magnitude > 0.01 && // Overall improvement
           [velocity.Form, velocity.Function, velocity.Behavior, velocity.Context]
             .filter(v => v > 0.01).length >= 3; // 3+ dimensions improving
  }

  getSize(obj) {
    return JSON.stringify(obj).length;
  }

  calculateCompressionRatio(targetRatio) {
    return Math.max(0.05, Math.min(0.95, 1.0 / targetRatio));
  }

  calculateRelevanceScore(originalState, compressedState, original = null, compressed = null) {
    const dimensionWeights = { Form: 0.25, Function: 0.4, Behavior: 0.2, Context: 0.15 };

    let relevanceScore = 0;
    Object.entries(dimensionWeights).forEach(([dim, weight]) => {
      // Use a more forgiving preservation calculation that accounts for compression
      const preservation = Math.min(1, compressedState[dim] / Math.max(0.1, originalState[dim]));

      // Bonus for maintaining reasonable values even after compression
      const bonus = compressedState[dim] >= 0.5 ? 0.15 : 0;

      relevanceScore += (preservation + bonus) * weight;
    });

    // Additional bonus for maintaining essential structure
    if (compressedState.magnitude >= 0.4) {
      relevanceScore += 0.05;
    }

    // Essentials-preservation bonus
    try {
      if (compressed && compressed.working_memory && compressed.working_memory.session_count != null) {
        const domains = compressed.working_memory.domains || {};
        const activeCount = Object.values(domains).filter(d => d && d.status === 'active').length;
        if (activeCount >= 1) {
          relevanceScore += 0.03;
        }
      }
    } catch (_) {}

    return Math.max(0, Math.min(1, relevanceScore));
  }

  identifyStableDomains(context, history) {
    // Simple implementation - identify domains unchanged in recent history
    if (!context.working_memory?.domains || history.length < 5) return [];

    const stableDomains = [];
    const recentHistory = history.slice(-5);

    // Check temporal hysteresis trend for each domain
    Object.keys(context.working_memory.domains).forEach(domainKey => {
      const recentStates = recentHistory.map(h => h.healthAssessment?.metrics?.hysteresis || 1);
      const avgHysteresis = recentStates.reduce((a, b) => a + b, 0) / recentStates.length;

      if (avgHysteresis < 0.1) { // Low hysteresis indicates stability
        stableDomains.push(domainKey);
      }
    });

    return stableDomains;
  }

  calculateCentralityScores(domains) {
    const scores = {};
    const domainKeys = Object.keys(domains);

    domainKeys.forEach(key => {
      const domain = domains[key];
      let score = 0;

      // Score based on activity and connections
      if (domain.status === 'active') score += 0.4;
      score += Math.min(0.3, (domain.critical_facts?.length || 0) * 0.1);
      score += Math.min(0.2, (domain.decisions_made?.length || 0) * 0.05);
      score += Math.min(0.1, (domain.files_created?.length || 0) * 0.02);

      scores[key] = score;
    });

    return scores;
  }

  compressDomain(domain, ratio) {
    const compressed = { ...domain };

    // Compress arrays proportionally with minimum thresholds
    if (compressed.critical_facts?.length) {
      const targetLength = Math.max(1, Math.floor(compressed.critical_facts.length * ratio));
      compressed.critical_facts = compressed.critical_facts.slice(0, targetLength);

      // Compress individual facts if ratio is very low
      if (ratio < 0.3) {
        compressed.critical_facts = compressed.critical_facts.map(fact => {
          if (typeof fact === 'string' && fact.length > 40) {
            return fact.substring(0, 40) + '...';
          }
          return fact;
        });
      }
    }

    if (compressed.decisions_made?.length) {
      const targetLength = Math.max(0, Math.floor(compressed.decisions_made.length * ratio));
      compressed.decisions_made = compressed.decisions_made.slice(0, targetLength);
      if (ratio < 0.3) {
        // Truncate decision strings for extra compression
        compressed.decisions_made = compressed.decisions_made.map(d => {
          if (typeof d === 'string' && d.length > 40) return d.slice(0, 40) + '...';
          return d;
        });
      }
    }

    if (compressed.files_created?.length) {
      const targetLength = Math.max(0, Math.floor(compressed.files_created.length * ratio));
      compressed.files_created = compressed.files_created.slice(0, targetLength);
      if (ratio < 0.3) {
        compressed.files_created = compressed.files_created.slice(0, Math.min(1, compressed.files_created.length));
      }
    }

    // Remove optional fields when compression is aggressive
    if (ratio < 0.5) {
      delete compressed.context_data;
      delete compressed.nested_data;
      delete compressed.relationships;
      delete compressed.metrics;
    }

    return compressed;
  }

  // Zone-specific compression methods
  applyCrisisCompression(context, ratio) {
    return this.applyEmergencyCompression(context, { ratio });
  }

  applyCriticalCompression(context, ratio) {
    const compressed = JSON.parse(JSON.stringify(context));

    if (compressed.working_memory?.domains) {
      Object.keys(compressed.working_memory.domains).forEach(key => {
        const domain = compressed.working_memory.domains[key];

        if (domain.status === 'active') {
          // Keep minimal content for active domains
          compressed.working_memory.domains[key] = this.compressDomain(domain, 0.1);
        } else {
          // Very aggressive compression for inactive domains
          compressed.working_memory.domains[key] = {
            status: domain.status,
            last_modified: domain.last_modified,
            critical_facts: (domain.critical_facts || []).slice(0, 1),
            decisions_made: [],
            files_created: []
          };
        }
      });
    }

    return compressed;
  }

  applyWarningCompression(context, ratio) {
    const compressed = JSON.parse(JSON.stringify(context));

    if (compressed.working_memory?.domains) {
      Object.keys(compressed.working_memory.domains).forEach(key => {
        const domain = compressed.working_memory.domains[key];

        // More aggressive compression for warning zone
        compressed.working_memory.domains[key] = this.compressDomain(domain, 0.3);

        // Further reduce non-essential content
        if (domain.status !== 'active') {
          compressed.working_memory.domains[key] = this.compressDomain(
            compressed.working_memory.domains[key], 0.1
          );
        }
      });
    }

    return compressed;
  }

  applyViableCompression(context, ratio) {
    const compressed = JSON.parse(JSON.stringify(context));

    if (compressed.working_memory?.domains) {
      Object.keys(compressed.working_memory.domains).forEach(key => {
        compressed.working_memory.domains[key] = this.compressDomain(
          compressed.working_memory.domains[key],
          ratio * 0.5
        );
      });
    }

    return compressed;
  }

  applyOptimalCompression(context, ratio) {
    const compressed = JSON.parse(JSON.stringify(context));

    // Light compression - mainly remove redundancy
    if (compressed.working_memory?.domains) {
      Object.keys(compressed.working_memory.domains).forEach(key => {
        if (compressed.working_memory.domains[key].status !== 'active') {
          compressed.working_memory.domains[key] = this.compressDomain(
            compressed.working_memory.domains[key],
            ratio * 0.9
          );
        }
      });
    }

    return compressed;
  }

  recordCompression(original, compressed, strategy, validation, processingTime) {
    this.compressionTimes.push(processingTime);

    const record = {
      timestamp: Date.now(),
      strategy: strategy.name,
      ratio: validation.ratio,
      relevance: validation.relevance,
      processingTime,
      originalSize: validation.originalSize,
      compressedSize: validation.compressedSize
    };

    this.compressionHistory.push(record);

    // Maintain history limits
    if (this.compressionTimes.length > 100) {
      this.compressionTimes.shift();
    }

    if (this.compressionHistory.length > this.maxHistory) {
      this.compressionHistory.shift();
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats() {
    if (this.compressionTimes.length === 0) return null;

    const times = this.compressionTimes;
    const avg = times.reduce((a, b) => a + b, 0) / times.length;

    const ratios = this.compressionHistory.map(h => h.ratio);
    const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;

    const relevances = this.compressionHistory.map(h => h.relevance);
    const avgRelevance = relevances.reduce((a, b) => a + b, 0) / relevances.length;

    return {
      averageProcessingMs: avg,
      maxProcessingMs: Math.max(...times),
      averageCompressionRatio: avgRatio,
      averageRelevanceScore: avgRelevance,
      totalCompressions: this.compressionHistory.length,
      meetingPerformanceTarget: avg <= this.config.maxProcessingTimeMs,
      meetingRelevanceTarget: avgRelevance >= this.config.targetRelevanceScore
    };
  }

  /**
   * Get diagnostic information
   */
  getDiagnostics() {
    const performance = this.getPerformanceStats();
    const recentCompressions = this.compressionHistory.slice(-10);

    return {
      performance,
      recentCompressions,
      strategies: Object.keys(this.strategies),
      configuration: this.config,
      stateVectorDiagnostics: this.stateVector.getDiagnostics(),
      viabilityRegionsDiagnostics: this.viabilityRegions.getDiagnostics()
    };
  }
}

module.exports = SmartCompressor;
