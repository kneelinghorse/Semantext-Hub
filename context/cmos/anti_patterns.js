// anti_patterns.js
// Core Anti-Pattern Detection Engine for Mission 3.1
// Integrates with all previous missions to detect and prevent context degradation

const ContextStateVector = require('./context_state');
const SmartCompressor = require('./smart_compressor');
const DomainManager = require('./domain_manager');
const RecoveryStrategies = require('./recovery_strategies');
const ContextAlerts = require('./context_alerts');

class AntiPatternDetector {
  constructor(stateVector, compressor, domainManager, config = {}) {
    // Core dependencies from previous missions
    this.stateVector = stateVector || new ContextStateVector();
    this.compressor = compressor || new SmartCompressor();
    this.domainManager = domainManager || new DomainManager();

    // Mission 3.1 components
    this.recoveryStrategies = new RecoveryStrategies(config.recovery);
    this.contextAlerts = new ContextAlerts(config.alerts);

    // Configuration with sensible defaults
    this.config = {
      thresholds: {
        temporalHysteresis: config.thresholds?.temporalHysteresis || 0.8,
        temporalComplexity: config.thresholds?.temporalComplexity || 0.7,
        memorySizeKB: config.thresholds?.memorySizeKB || 40,
        domainFileCount: config.thresholds?.domainFileCount || 50,
        stateOscillationThreshold: config.thresholds?.stateOscillationThreshold || 3,
        memoryGrowthRateThreshold: config.thresholds?.memoryGrowthRateThreshold || 0.2,
        emergencyCompressionTrigger: config.thresholds?.emergencyCompressionTrigger || 0.2,
        ...config.thresholds
      },

      monitoring: {
        intervalMs: config.monitoring?.intervalMs || 10000, // 10 seconds
        historySize: config.monitoring?.historySize || 100,
        enableContinuousMonitoring: config.monitoring?.enableContinuousMonitoring !== false,
        ...config.monitoring
      },

      recovery: {
        maxRecoveryAttempts: config.recovery?.maxRecoveryAttempts || 3,
        recoveryDelayMs: config.recovery?.recoveryDelayMs || 5000,
        enableAutoRecovery: config.recovery?.enableAutoRecovery !== false,
        aggressiveRecoveryMode: config.recovery?.aggressiveRecoveryMode || false,
        ...config.recovery
      },

      alerts: {
        enableAlerts: config.alerts?.enableAlerts !== false,
        escalationThreshold: config.alerts?.escalationThreshold || 2,
        maxActiveAlerts: config.alerts?.maxActiveAlerts || 10,
        alertTimeoutMs: config.alerts?.alertTimeoutMs || 300000, // 5 minutes
        ...config.alerts
      }
    };

    // Detection state
    this.detectionHistory = [];
    this.recoveryAttempts = new Map();
    this.monitoringInterval = null;
    this.lastDetectionRun = null;

    // Performance tracking
    this.detectionTimes = [];
    this.recoveryStats = {
      total: 0,
      successful: 0,
      failed: 0,
      byPattern: {}
    };

    // Event handling
    this.eventListeners = new Map();

    // Initialize continuous monitoring if enabled
    if (this.config.monitoring.enableContinuousMonitoring) {
      this.startContinuousMonitoring();
    }
  }

  /**
   * Main detection method - analyze context for anti-patterns
   * @param {Object} context - Context to analyze
   * @param {Object} options - Detection options
   * @returns {Promise<Object>} Detection result with patterns and recovery actions
   */
  async detectAntiPatterns(context, options = {}) {
    const startTime = Date.now();
    this.lastDetectionRun = startTime;

    try {
      // Calculate current state using Mission 1.2 ContextStateVector
      const state = this.stateVector.calculate(context);
      const memoryStatus = this.domainManager.optimizer.getMemoryStatus();

      // Detect all anti-patterns
      const detectedPatterns = [];

      // 1. Context Rot Detection (via Temporal Hysteresis)
      const contextRot = this.detectContextRot(state, context);
      if (contextRot) detectedPatterns.push(contextRot);

      // 2. Context Explosion Detection (via Memory + TDM)
      const contextExplosion = this.detectContextExplosion(state, memoryStatus, context);
      if (contextExplosion) detectedPatterns.push(contextExplosion);

      // 3. Memory Leak Detection
      const memoryLeak = this.detectMemoryLeak(memoryStatus, context);
      if (memoryLeak) detectedPatterns.push(memoryLeak);

      // 4. State Oscillation Detection
      const stateOscillation = this.detectStateOscillation(state, context);
      if (stateOscillation) detectedPatterns.push(stateOscillation);

      // 5. Domain Bloat Detection
      const domainBloat = this.detectDomainBloat(context);
      if (domainBloat) detectedPatterns.push(domainBloat);

      // 6. Compression Degradation Detection
      const compressionDegradation = this.detectCompressionDegradation(state, context);
      if (compressionDegradation) detectedPatterns.push(compressionDegradation);

      // Apply recovery strategies for detected patterns
      const recoveryResults = [];
      if (this.config.recovery.enableAutoRecovery) {
        for (const pattern of detectedPatterns) {
          const recovery = await this.applyRecoveryStrategy(pattern, context, options);
          if (recovery) recoveryResults.push(recovery);
        }
      }

      // Update detection history
      const detectionResult = {
        timestamp: startTime,
        patternsDetected: detectedPatterns.length,
        patterns: detectedPatterns,
        state,
        memoryStatus,
        recoveryResults,
        detectionTime: Date.now() - startTime,
        context: this.createContextSummary(context)
      };

      this.recordDetection(detectionResult);

      // Process alerts for detected patterns and recovery results
      const alertResult = this.contextAlerts.processDetectionResults(detectionResult, recoveryResults, options);
      detectionResult.alertResult = alertResult;

      // Emit events for monitoring
      if (detectedPatterns.length > 0) {
        this.emit('anti_patterns_detected', {
          patterns: detectedPatterns,
          recoveryResults,
          alertResult,
          severity: this.calculateOverallSeverity(detectedPatterns)
        });
      }

      return detectionResult;

    } catch (error) {
      const errorResult = {
        timestamp: startTime,
        error: error.message,
        detectionTime: Date.now() - startTime,
        patternsDetected: 0,
        patterns: []
      };

      this.emit('detection_error', errorResult);
      return errorResult;
    }
  }

  /**
   * Detect context rot via sustained Temporal Hysteresis breaches
   */
  detectContextRot(state, context) {
    const hysteresis = state.healthAssessment?.metrics?.hysteresis;
    if (typeof hysteresis !== 'number') return null;

    // Check current breach
    if (hysteresis <= this.config.thresholds.temporalHysteresis) return null;

    // Check sustained breach in history
    const recentStates = this.stateVector.history.slice(-5);
    const sustainedBreach = recentStates.length >= 3 &&
      recentStates.every(s => s.healthAssessment?.metrics?.hysteresis > this.config.thresholds.temporalHysteresis);

    if (!sustainedBreach) return null;

    return {
      type: 'context_rot',
      severity: this.calculateSeverity(hysteresis, this.config.thresholds.temporalHysteresis, 1.0),
      metrics: {
        currentHysteresis: hysteresis,
        threshold: this.config.thresholds.temporalHysteresis,
        sustainedFor: recentStates.length,
        affectedDimensions: this.getAffectedDimensions(state)
      },
      description: 'Context stability degraded - sustained high temporal hysteresis detected',
      recommendations: [
        'Apply state compression to reduce temporal complexity',
        'Archive stable domains to reduce active context',
        'Reset to last known stable state if degradation continues'
      ],
      timestamp: Date.now()
    };
  }

  /**
   * Detect context explosion via rapid TDM increase or memory threshold breach
   */
  detectContextExplosion(state, memoryStatus, context) {
    const complexity = state.healthAssessment?.metrics?.complexity;
    const currentMemoryKB = memoryStatus.currentUsage?.totalKB || 0;

    // Memory size explosion
    if (currentMemoryKB > this.config.thresholds.memorySizeKB) {
      return {
        type: 'context_explosion',
        subtype: 'memory_explosion',
        severity: this.calculateSeverity(currentMemoryKB, this.config.thresholds.memorySizeKB, this.config.thresholds.memorySizeKB * 2),
        metrics: {
          currentMemoryKB,
          threshold: this.config.thresholds.memorySizeKB,
          utilizationRatio: currentMemoryKB / this.config.thresholds.memorySizeKB,
          domains: memoryStatus.domains || {}
        },
        description: `Memory usage (${currentMemoryKB}KB) exceeded threshold (${this.config.thresholds.memorySizeKB}KB)`,
        recommendations: [
          'Trigger emergency compression',
          'Deactivate non-critical domains',
          'Archive completed domains',
          'Apply aggressive compression strategies'
        ],
        timestamp: Date.now()
      };
    }

    // Temporal complexity explosion
    if (typeof complexity === 'number' && complexity > this.config.thresholds.temporalComplexity) {
      const recentComplexity = this.stateVector.history.slice(-3).map(s => s.healthAssessment?.metrics?.complexity);
      const rapidIncrease = recentComplexity.length >= 2 &&
        recentComplexity[recentComplexity.length - 1] > recentComplexity[0] * 1.5;

      if (rapidIncrease) {
        return {
          type: 'context_explosion',
          subtype: 'complexity_explosion',
          severity: this.calculateSeverity(complexity, this.config.thresholds.temporalComplexity, 1.0),
          metrics: {
            currentComplexity: complexity,
            threshold: this.config.thresholds.temporalComplexity,
            recentTrend: recentComplexity,
            growthRate: recentComplexity.length >= 2 ?
              (recentComplexity[recentComplexity.length - 1] / recentComplexity[0]) - 1 : 0
          },
          description: 'Rapid increase in temporal complexity detected',
          recommendations: [
            'Apply immediate compression',
            'Simplify domain structure',
            'Remove temporal dependencies',
            'Reset to simpler state if needed'
          ],
          timestamp: Date.now()
        };
      }
    }

    return null;
  }

  /**
   * Detect memory leaks via growth trend analysis
   */
  detectMemoryLeak(memoryStatus, context) {
    if (this.detectionHistory.length < 10) return null;

    const recentMemory = this.detectionHistory.slice(-10).map(d => d.memoryStatus.currentUsage?.totalKB || 0);
    const growthTrend = this.calculateGrowthTrend(recentMemory);

    if (growthTrend > this.config.thresholds.memoryGrowthRateThreshold) {
      return {
        type: 'memory_leak',
        severity: this.calculateSeverity(growthTrend, this.config.thresholds.memoryGrowthRateThreshold, 1.0),
        metrics: {
          growthRate: growthTrend,
          threshold: this.config.thresholds.memoryGrowthRateThreshold,
          recentMemoryKB: recentMemory,
          projectedMemoryKB: recentMemory[recentMemory.length - 1] * (1 + growthTrend * 10),
          suspectedDomains: this.identifySuspectedLeakDomains(memoryStatus)
        },
        description: `Memory growing at ${(growthTrend * 100).toFixed(1)}% per measurement`,
        recommendations: [
          'Perform garbage collection on domains',
          'Remove orphaned references',
          'Apply compression to growing domains',
          'Investigate suspected leak sources'
        ],
        timestamp: Date.now()
      };
    }

    return null;
  }

  /**
   * Detect state oscillation patterns
   */
  detectStateOscillation(state, context) {
    if (this.stateVector.history.length < 6) return null;

    const patterns = this.stateVector.detectPatterns();
    const oscillationAnomaly = patterns.anomalies.find(a => a.type === 'oscillation');

    if (oscillationAnomaly && oscillationAnomaly.frequency > 0.3) {
      return {
        type: 'state_oscillation',
        severity: this.calculateSeverity(oscillationAnomaly.frequency, 0.3, 1.0),
        metrics: {
          frequency: oscillationAnomaly.frequency,
          amplitude: oscillationAnomaly.amplitude,
          detectedCycles: Math.floor(oscillationAnomaly.frequency * this.stateVector.history.length),
          affectedDimensions: this.identifyOscillatingDimensions()
        },
        description: `State oscillation detected with frequency ${oscillationAnomaly.frequency.toFixed(2)}`,
        recommendations: [
          'Apply state dampening strategies',
          'Stabilize oscillating domains',
          'Reduce feedback loops',
          'Implement state smoothing'
        ],
        timestamp: Date.now()
      };
    }

    return null;
  }

  /**
   * Detect domain bloat via file count and structure analysis
   */
  detectDomainBloat(context) {
    if (!context.working_memory?.domains) return null;

    const domains = Object.values(context.working_memory.domains);
    const bloatedDomains = domains.filter(domain => {
      const fileCount = domain.files_created?.length || 0;
      const factCount = domain.critical_facts?.length || 0;
      return fileCount > this.config.thresholds.domainFileCount || factCount > 20;
    });

    if (bloatedDomains.length > 0) {
      return {
        type: 'domain_bloat',
        severity: this.calculateSeverity(bloatedDomains.length, 1, domains.length),
        metrics: {
          bloatedDomains: bloatedDomains.length,
          totalDomains: domains.length,
          maxFiles: Math.max(...domains.map(d => d.files_created?.length || 0)),
          maxFacts: Math.max(...domains.map(d => d.critical_facts?.length || 0)),
          fileThreshold: this.config.thresholds.domainFileCount,
          worstDomains: bloatedDomains.map(d => ({
            status: d.status,
            files: d.files_created?.length || 0,
            facts: d.critical_facts?.length || 0
          }))
        },
        description: `${bloatedDomains.length} domains exceeded size thresholds`,
        recommendations: [
          'Split large domains into sub-domains',
          'Archive completed domain content',
          'Compress non-essential domain data',
          'Remove redundant files and facts'
        ],
        timestamp: Date.now()
      };
    }

    return null;
  }

  /**
   * Detect compression system degradation
   */
  detectCompressionDegradation(state, context) {
    const compressionStats = this.compressor.getPerformanceStats();
    if (!compressionStats) return null;

    const isUnderperforming = !compressionStats.meetingPerformanceTarget ||
                             !compressionStats.meetingRelevanceTarget ||
                             compressionStats.averageCompressionRatio < 2.0;

    if (isUnderperforming) {
      return {
        type: 'compression_degradation',
        severity: this.calculateCompressionSeverity(compressionStats),
        metrics: {
          averageRatio: compressionStats.averageCompressionRatio,
          averageRelevance: compressionStats.averageRelevanceScore,
          averageProcessingMs: compressionStats.averageProcessingMs,
          meetingTargets: {
            performance: compressionStats.meetingPerformanceTarget,
            relevance: compressionStats.meetingRelevanceTarget
          },
          totalCompressions: compressionStats.totalCompressions
        },
        description: 'Compression system performance degraded below acceptable levels',
        recommendations: [
          'Tune compression strategy parameters',
          'Clear compression history and reset',
          'Update compression thresholds',
          'Investigate compression algorithm efficiency'
        ],
        timestamp: Date.now()
      };
    }

    return null;
  }

  /**
   * Apply recovery strategy using the RecoveryStrategies module
   */
  async applyRecoveryStrategy(antiPattern, context, options = {}) {
    // Check recovery attempt limits
    const attempts = this.recoveryAttempts.get(antiPattern.type) || 0;
    if (attempts >= this.config.recovery.maxRecoveryAttempts) {
      return {
        success: false,
        reason: 'Maximum recovery attempts exceeded',
        antiPattern: antiPattern.type,
        attempts
      };
    }

    // Record recovery attempt
    this.recoveryAttempts.set(antiPattern.type, attempts + 1);

    try {
      // Use the sophisticated RecoveryStrategies module
      const dependencies = {
        compressor: this.compressor,
        domainManager: this.domainManager,
        stateVector: this.stateVector
      };

      const recovery = await this.recoveryStrategies.executeRecovery(
        antiPattern,
        context,
        dependencies,
        options
      );

      // Record recovery stats
      this.recordRecoveryResult(antiPattern.type, recovery.success);

      if (recovery.success) {
        // Reset attempt count on success
        this.recoveryAttempts.delete(antiPattern.type);
      }

      return {
        ...recovery,
        antiPattern: antiPattern.type,
        attempts: attempts + 1,
        timestamp: Date.now()
      };

    } catch (error) {
      this.recordRecoveryResult(antiPattern.type, false);

      return {
        success: false,
        error: error.message,
        antiPattern: antiPattern.type,
        attempts: attempts + 1,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Utility methods
   */

  calculateSeverity(value, threshold, maxValue) {
    if (value <= threshold) return 0;
    return Math.min(1, (value - threshold) / (maxValue - threshold));
  }

  calculateCompressionSeverity(stats) {
    let severity = 0;

    if (!stats.meetingPerformanceTarget) severity += 0.3;
    if (!stats.meetingRelevanceTarget) severity += 0.4;
    if (stats.averageCompressionRatio < 2.0) severity += 0.3;

    return Math.min(1, severity);
  }

  calculateOverallSeverity(patterns) {
    if (patterns.length === 0) return 0;

    const totalSeverity = patterns.reduce((sum, p) => sum + p.severity, 0);
    return Math.min(1, totalSeverity / patterns.length);
  }

  calculateGrowthTrend(values) {
    if (values.length < 2) return 0;

    const start = values[0];
    const end = values[values.length - 1];

    if (start === 0) return end > 0 ? 1 : 0;
    return (end - start) / start;
  }

  getAffectedDimensions(state) {
    const threshold = 0.4;
    return ['Form', 'Function', 'Behavior', 'Context'].filter(dim =>
      state[dim] < threshold
    );
  }

  identifyOscillatingDimensions() {
    if (this.stateVector.history.length < 6) return [];

    const recent = this.stateVector.history.slice(-6);
    const oscillating = [];

    ['Form', 'Function', 'Behavior', 'Context'].forEach(dim => {
      const values = recent.map(s => s[dim]);
      const variance = this.calculateVariance(values);
      if (variance > 0.1) {
        oscillating.push(dim);
      }
    });

    return oscillating;
  }

  identifySuspectedLeakDomains(memoryStatus) {
    if (!memoryStatus.domains) return [];

    return Object.entries(memoryStatus.domains)
      .filter(([id, usage]) => usage.sizeKB > 5)
      .map(([id, usage]) => id);
  }

  calculateVariance(values) {
    if (values.length === 0) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;

    return variance;
  }

  createContextSummary(context) {
    return {
      size: JSON.stringify(context).length,
      domains: Object.keys(context.working_memory?.domains || {}).length,
      sessionCount: context.working_memory?.session_count || 0
    };
  }

  recordDetection(result) {
    this.detectionHistory.push(result);
    this.detectionTimes.push(result.detectionTime);

    // Maintain history limits
    if (this.detectionHistory.length > this.config.monitoring.historySize) {
      this.detectionHistory.shift();
    }

    if (this.detectionTimes.length > 100) {
      this.detectionTimes.shift();
    }
  }

  recordRecoveryResult(patternType, success) {
    this.recoveryStats.total++;

    if (success) {
      this.recoveryStats.successful++;
    } else {
      this.recoveryStats.failed++;
    }

    if (!this.recoveryStats.byPattern[patternType]) {
      this.recoveryStats.byPattern[patternType] = { total: 0, successful: 0 };
    }

    this.recoveryStats.byPattern[patternType].total++;
    if (success) {
      this.recoveryStats.byPattern[patternType].successful++;
    }
  }

  /**
   * Continuous monitoring
   */
  startContinuousMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.performScheduledDetection();
    }, this.config.monitoring.intervalMs);
  }

  stopContinuousMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  async performScheduledDetection() {
    try {
      // Create minimal context for monitoring
      const context = this.createMinimalContext();
      const result = await this.detectAntiPatterns(context, { scheduled: true });

      if (result.patternsDetected > 0) {
        this.emit('scheduled_detection_completed', result);
      }
    } catch (error) {
      this.emit('scheduled_detection_failed', { error: error.message });
    }
  }

  createMinimalContext() {
    return {
      working_memory: {
        session_count: 1,
        domains: {}
      }
    };
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
   * Get performance and diagnostic information
   */
  getPerformanceStats() {
    if (this.detectionTimes.length === 0) return null;

    const avg = this.detectionTimes.reduce((a, b) => a + b, 0) / this.detectionTimes.length;
    const max = Math.max(...this.detectionTimes);
    const min = Math.min(...this.detectionTimes);

    return {
      averageDetectionMs: avg,
      maxDetectionMs: max,
      minDetectionMs: min,
      totalDetections: this.detectionHistory.length,
      detectionOverhead: avg,
      meetingTarget: avg <= 10, // 10ms target
      recoveryStats: this.recoveryStats,
      recoveryStrategiesStats: this.recoveryStrategies.getRecoveryStats(),
      alertsStats: this.contextAlerts.getAlertStatistics()
    };
  }

  getDiagnostics() {
    const performance = this.getPerformanceStats();
    const recentDetections = this.detectionHistory.slice(-10);

    return {
      performance,
      recentDetections,
      configuration: this.config,
      monitoring: {
        isActive: !!this.monitoringInterval,
        lastRun: this.lastDetectionRun,
        intervalMs: this.config.monitoring.intervalMs
      },
      recovery: {
        attemptsInProgress: this.recoveryAttempts.size,
        stats: this.recoveryStats
      },
      integrations: {
        stateVector: this.stateVector.getDiagnostics(),
        compressor: this.compressor.getDiagnostics(),
        domainManager: this.domainManager.getDiagnostics(),
        recoveryStrategies: this.recoveryStrategies.getDiagnostics(),
        contextAlerts: this.contextAlerts.getDiagnostics()
      }
    };
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.stopContinuousMonitoring();
    this.eventListeners.clear();
    this.recoveryAttempts.clear();

    // Cleanup integrated components
    if (this.recoveryStrategies) {
      // RecoveryStrategies doesn't have destroy method, but we could add one
    }

    if (this.contextAlerts && this.contextAlerts.destroy) {
      this.contextAlerts.destroy();
    }

    this.emit('anti_pattern_detector_destroyed', { timestamp: Date.now() });
  }
}

module.exports = AntiPatternDetector;