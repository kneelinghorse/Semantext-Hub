// viability_regions.js
// Defines and manages healthy operating zones for 4D context state vector
// Provides viability region boundaries, zone classification, and adaptation

class ViabilityRegions {
  constructor(config = {}) {
    this.config = config;

    // Base viability thresholds for each dimension
    this.baseThresholds = {
      Form: config.form || {
        critical: 0.2,  // Below this: structural collapse
        warning: 0.4,   // Below this: degradation risk
        optimal: 0.7,   // Above this: excellent structure
        maximum: 1.0
      },
      Function: config.function || {
        critical: 0.3,
        warning: 0.5,
        optimal: 0.8,
        maximum: 1.0
      },
      Behavior: config.behavior || {
        critical: 0.25,
        warning: 0.45,
        optimal: 0.75,
        maximum: 1.0
      },
      Context: config.context || {
        critical: 0.35,
        warning: 0.5,
        optimal: 0.8,
        maximum: 1.0
      }
    };

    // Overall viability threshold (minimum for system viability)
    this.overallViabilityThreshold = config.overallThreshold || 0.4;

    // Zone definitions in 4D space
    this.zones = this.defineZones();

    // Adaptive thresholds (learn from usage patterns)
    this.adaptiveThresholds = { ...this.baseThresholds };
    this.adaptationHistory = [];
    this.adaptationEnabled = config.adaptationEnabled !== false;

    // Alert configurations
    this.alertConfig = {
      exitViableRegion: true,
      enterCriticalZone: true,
      rapidDegradation: true,
      thresholdCrossing: true,
      cooldownMs: config.alertCooldown || 30000
    };

    this.lastAlerts = new Map();
  }

  /**
   * Define 4D viability zones
   */
  defineZones() {
    return {
      // Crisis zone: immediate intervention required
      crisis: {
        name: 'Crisis',
        description: 'System failure imminent - immediate intervention required',
        condition: (state) => this.getMinDimension(state) < 0.2,
        priority: 1,
        color: '#FF0000',
        recommendations: [
          'Emergency reset required',
          'Save critical data immediately',
          'Activate recovery protocols'
        ]
      },

      // Critical zone: severe degradation
      critical: {
        name: 'Critical',
        description: 'Severe degradation - urgent action needed',
        condition: (state) => this.getMinDimension(state) < 0.35 && !this.zones.crisis.condition(state),
        priority: 2,
        color: '#FF4500',
        recommendations: [
          'Compress context immediately',
          'Identify degradation source',
          'Consider selective reset'
        ]
      },

      // Warning zone: degradation risk
      warning: {
        name: 'Warning',
        description: 'Degradation risk detected - monitor closely',
        condition: (state) => this.getMinDimension(state) < 0.5 && !this.inCriticalOrCrisis(state),
        priority: 3,
        color: '#FFA500',
        recommendations: [
          'Review recent changes',
          'Consider preventive compression',
          'Monitor trends closely'
        ]
      },

      // Viable zone: normal operation
      viable: {
        name: 'Viable',
        description: 'Normal operation - system stable',
        condition: (state) => this.getMinDimension(state) >= 0.4 && !this.inOptimalZone(state),
        priority: 4,
        color: '#32CD32',
        recommendations: [
          'Continue current operations',
          'Monitor for optimization opportunities'
        ]
      },

      // Optimal zone: excellent performance
      optimal: {
        name: 'Optimal',
        description: 'Excellent performance - system thriving',
        condition: (state) => this.getMinDimension(state) >= 0.7 && this.getAverageDimension(state) >= 0.8,
        priority: 5,
        color: '#00FF00',
        recommendations: [
          'Maintain current approach',
          'Document successful patterns',
          'Consider expansion'
        ]
      }
    };
  }

  /**
   * Classify state into viability zone
   */
  classifyState(state) {
    // Check zones in priority order
    const zoneOrder = ['crisis', 'critical', 'warning', 'optimal', 'viable'];

    for (const zoneName of zoneOrder) {
      const zone = this.zones[zoneName];
      if (zone.condition(state)) {
        return {
          zone: zoneName,
          info: zone,
          // Viability defined by overall threshold, independent of zone label
          isViable: this.getMinDimension(state) >= this.overallViabilityThreshold,
          requiresAction: ['crisis', 'critical', 'warning'].includes(zoneName)
        };
      }
    }

    // Fallback to viable if no other zone matches
    return {
      zone: 'viable',
      info: this.zones.viable,
      isViable: true,
      requiresAction: false
    };
  }

  /**
   * Check if state is in viable region
   */
  isViable(state) {
    const classification = this.classifyState(state);
    return classification.isViable;
  }

  /**
   * Calculate distance from viability boundary
   */
  calculateViabilityDistance(state) {
    const minDimension = this.getMinDimension(state);
    const threshold = this.overallViabilityThreshold;

    // Positive distance = inside viable region
    // Negative distance = outside viable region
    return minDimension - threshold;
  }

  /**
   * Calculate safety margin (how far from critical zones)
   */
  calculateSafetyMargin(state) {
    const minDimension = this.getMinDimension(state);
    const criticalThreshold = 0.35;

    return Math.max(0, minDimension - criticalThreshold);
  }

  /**
   * Detect zone transitions
   */
  detectTransition(previousState, currentState) {
    if (!previousState) return null;

    const prevZone = this.classifyState(previousState);
    const currZone = this.classifyState(currentState);

    if (prevZone.zone !== currZone.zone) {
      return {
        from: prevZone.zone,
        to: currZone.zone,
        direction: this.getTransitionDirection(prevZone.zone, currZone.zone),
        severity: this.getTransitionSeverity(prevZone.zone, currZone.zone),
        timestamp: Date.now()
      };
    }

    return null;
  }

  /**
   * Get transition direction (improving/degrading)
   */
  getTransitionDirection(fromZone, toZone) {
    const zoneRanking = { crisis: 1, critical: 2, warning: 3, viable: 4, optimal: 5 };
    const fromRank = zoneRanking[fromZone];
    const toRank = zoneRanking[toZone];

    if (toRank > fromRank) return 'improving';
    if (toRank < fromRank) return 'degrading';
    return 'stable';
  }

  /**
   * Get transition severity
   */
  getTransitionSeverity(fromZone, toZone) {
    const zoneRanking = { crisis: 1, critical: 2, warning: 3, viable: 4, optimal: 5 };
    const difference = Math.abs(zoneRanking[toZone] - zoneRanking[fromZone]);

    if (difference >= 3) return 'severe';
    if (difference >= 2) return 'moderate';
    return 'mild';
  }

  /**
   * Generate alerts based on state and transitions
   */
  generateAlerts(state, previousState = null) {
    const alerts = [];
    const now = Date.now();

    // Check for zone transitions
    const transition = this.detectTransition(previousState, state);
    if (transition && transition.direction === 'degrading') {
      const alertKey = `transition_${transition.from}_${transition.to}`;
      if (this.shouldAlert(alertKey, now)) {
        alerts.push({
          type: 'zone_transition',
          level: transition.severity === 'severe' ? 'critical' : 'warning',
          message: `Zone transition: ${transition.from} → ${transition.to}`,
          details: transition,
          timestamp: now
        });
      }
    }

    // Check for viability region exit
    const classification = this.classifyState(state);
    if (!classification.isViable && this.shouldAlert('viability_exit', now)) {
      alerts.push({
        type: 'viability_exit',
        level: 'warning',
        message: `System outside viable region: ${classification.zone}`,
        zone: classification.zone,
        recommendations: classification.info.recommendations,
        timestamp: now
      });
    }

    // Check for critical zone entry
    if (['crisis', 'critical'].includes(classification.zone) && this.shouldAlert('critical_zone', now)) {
      alerts.push({
        type: 'critical_zone',
        level: 'critical',
        message: `System in ${classification.zone} zone`,
        zone: classification.zone,
        recommendations: classification.info.recommendations,
        timestamp: now
      });
    }

    // Check for dimension-specific alerts
    this.checkDimensionAlerts(state, alerts, now);

    return alerts;
  }

  /**
   * Check dimension-specific alerts
   */
  checkDimensionAlerts(state, alerts, timestamp) {
    const dimensions = ['Form', 'Function', 'Behavior', 'Context'];

    dimensions.forEach(dim => {
      const value = state[dim];
      const thresholds = this.adaptiveThresholds[dim];

      if (value < thresholds.critical && this.shouldAlert(`${dim}_critical`, timestamp)) {
        alerts.push({
          type: 'dimension_critical',
          level: 'critical',
          message: `${dim} dimension critically low: ${value.toFixed(3)}`,
          dimension: dim,
          value,
          threshold: thresholds.critical,
          timestamp
        });
      } else if (value < thresholds.warning && this.shouldAlert(`${dim}_warning`, timestamp)) {
        alerts.push({
          type: 'dimension_warning',
          level: 'warning',
          message: `${dim} dimension below warning threshold: ${value.toFixed(3)}`,
          dimension: dim,
          value,
          threshold: thresholds.warning,
          timestamp
        });
      }
    });
  }

  /**
   * Check if alert should be sent (respects cooldown)
   */
  shouldAlert(alertKey, timestamp) {
    const lastAlert = this.lastAlerts.get(alertKey);
    if (!lastAlert) {
      this.lastAlerts.set(alertKey, timestamp);
      return true;
    }

    if (timestamp - lastAlert >= this.alertConfig.cooldownMs) {
      this.lastAlerts.set(alertKey, timestamp);
      return true;
    }

    return false;
  }

  /**
   * Adaptive threshold adjustment
   */
  adaptThresholds(stateHistory) {
    if (!this.adaptationEnabled || stateHistory.length < 20) return;

    const recentStates = stateHistory.slice(-50); // Last 50 states
    const dimensions = ['Form', 'Function', 'Behavior', 'Context'];

    dimensions.forEach(dim => {
      const values = recentStates.map(state => state[dim]);
      const stats = this.calculateStats(values);

      // Adjust thresholds based on observed distribution
      this.adjustDimensionThresholds(dim, stats);
    });

    this.recordAdaptation(stateHistory.length);
  }

  /**
   * Adjust thresholds for a dimension
   */
  adjustDimensionThresholds(dimension, stats) {
    const current = this.adaptiveThresholds[dimension];
    const base = this.baseThresholds[dimension];
    const learningRate = 0.1;

    // Don't adjust too far from base thresholds
    const maxDeviation = 0.15;

    // Adjust critical threshold based on p10 (10th percentile)
    const targetCritical = Math.max(stats.p10 * 0.8, base.critical - maxDeviation);
    current.critical = current.critical * (1 - learningRate) + targetCritical * learningRate;

    // Adjust warning threshold based on p25 (25th percentile)
    const targetWarning = Math.max(stats.p25 * 0.9, base.warning - maxDeviation);
    current.warning = current.warning * (1 - learningRate) + targetWarning * learningRate;

    // Adjust optimal threshold based on p75 (75th percentile)
    const targetOptimal = Math.min(stats.p75 * 1.1, base.optimal + maxDeviation);
    current.optimal = current.optimal * (1 - learningRate) + targetOptimal * learningRate;

    // Ensure thresholds maintain proper ordering
    current.critical = Math.min(current.critical, current.warning - 0.05);
    current.warning = Math.min(current.warning, current.optimal - 0.1);
    current.optimal = Math.min(current.optimal, 0.95);
  }

  /**
   * Calculate statistics for threshold adaptation
   */
  calculateStats(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    return {
      min: sorted[0],
      max: sorted[n - 1],
      mean: values.reduce((a, b) => a + b, 0) / n,
      median: sorted[Math.floor(n / 2)],
      p10: sorted[Math.floor(n * 0.1)],
      p25: sorted[Math.floor(n * 0.25)],
      p75: sorted[Math.floor(n * 0.75)],
      p90: sorted[Math.floor(n * 0.9)]
    };
  }

  /**
   * Record adaptation event
   */
  recordAdaptation(historySize) {
    this.adaptationHistory.push({
      timestamp: Date.now(),
      historySize,
      thresholds: JSON.parse(JSON.stringify(this.adaptiveThresholds))
    });

    // Keep only recent adaptations
    if (this.adaptationHistory.length > 10) {
      this.adaptationHistory.shift();
    }
  }

  /**
   * Helper functions
   */

  getMinDimension(state) {
    return Math.min(state.Form, state.Function, state.Behavior, state.Context);
  }

  getMaxDimension(state) {
    return Math.max(state.Form, state.Function, state.Behavior, state.Context);
  }

  getAverageDimension(state) {
    return (state.Form + state.Function + state.Behavior + state.Context) / 4;
  }

  inCriticalOrCrisis(state) {
    return this.zones.crisis.condition(state) || this.zones.critical.condition(state);
  }

  inOptimalZone(state) {
    return this.zones.optimal.condition(state);
  }

  /**
   * Get region boundaries for visualization
   */
  getRegionBoundaries() {
    return {
      dimensions: ['Form', 'Function', 'Behavior', 'Context'],
      thresholds: this.adaptiveThresholds,
      zones: Object.keys(this.zones).map(name => ({
        name,
        ...this.zones[name]
      }))
    };
  }

  /**
   * Export region configuration
   */
  exportConfiguration() {
    return {
      baseThresholds: this.baseThresholds,
      adaptiveThresholds: this.adaptiveThresholds,
      zones: this.zones,
      overallViabilityThreshold: this.overallViabilityThreshold,
      adaptationHistory: this.adaptationHistory,
      alertConfig: this.alertConfig
    };
  }

  /**
   * Import region configuration
   */
  importConfiguration(config) {
    if (config.baseThresholds) this.baseThresholds = config.baseThresholds;
    if (config.adaptiveThresholds) this.adaptiveThresholds = config.adaptiveThresholds;
    if (config.overallViabilityThreshold) this.overallViabilityThreshold = config.overallViabilityThreshold;
    if (config.adaptationHistory) this.adaptationHistory = config.adaptationHistory;
    if (config.alertConfig) this.alertConfig = { ...this.alertConfig, ...config.alertConfig };
  }

  /**
   * Reset to base configuration
   */
  resetToBase() {
    this.adaptiveThresholds = JSON.parse(JSON.stringify(this.baseThresholds));
    this.adaptationHistory = [];
    this.lastAlerts.clear();
  }

  /**
   * Get diagnostic information
   */
  getDiagnostics() {
    return {
      baseThresholds: this.baseThresholds,
      currentThresholds: this.adaptiveThresholds,
      adaptationEnabled: this.adaptationEnabled,
      adaptationCount: this.adaptationHistory.length,
      lastAdaptation: this.adaptationHistory[this.adaptationHistory.length - 1],
      activeAlerts: this.lastAlerts.size,
      zoneCount: Object.keys(this.zones).length
    };
  }
}

module.exports = ViabilityRegions;
