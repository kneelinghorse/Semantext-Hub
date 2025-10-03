// context_health.js
// Context Health Monitor for CMOS
// Self-contained health assessment using statistical metrics

const healthThresholds = require('./health_thresholds.json');

class ContextHealthMonitor {
  constructor(config = {}) {
    this.thresholds = config.thresholds || healthThresholds;
    
    // Track health history for trend analysis
    this.healthHistory = [];
    this.maxHistory = config.maxHistory || 100;
    
    // Viability region bounds
    this.viabilityRegion = this.thresholds.viability;
  }
  
  /**
   * Assess context health using statistical metrics
   * @param {Object} context - The context to assess
   * @returns {Object} Health assessment with metrics and status
   */
  assess(context) {
    const startTime = Date.now();
    
    // Prepare context for metric calculations
    const preparedContext = this.prepareContext(context);
    
    // Calculate all health metrics
    const assessment = {
      timestamp: new Date().toISOString(),
      metrics: {
        hysteresis: this.calculateHysteresis(preparedContext),
        complexity: this.calculateComplexity(preparedContext),
        momentum: this.calculateMomentum(preparedContext),
        fairness: this.calculateFairness(preparedContext),
        symmetry: this.calculateSymmetry(preparedContext)
      },
      latency: Date.now() - startTime
    };
    
    // Determine health status
    assessment.status = this.determineStatus(assessment.metrics);
    assessment.inViableRegion = this.isInViableRegion(assessment.metrics);
    assessment.alerts = this.generateAlerts(assessment.metrics);
    
    // Add to history
    this.addToHistory(assessment);
    
    // Calculate trend if we have history
    if (this.healthHistory.length > 1) {
      assessment.trend = this.calculateTrend();
    }
    
    return assessment;
  }
  
  /**
   * Prepare context for metric calculations
   */
  prepareContext(context) {
    // Convert context to time series format for metrics
    const observations = [];
    
    if (context.working_memory && context.working_memory.domains) {
      // Extract temporal data from domains
      Object.keys(context.working_memory.domains).forEach(domain => {
        const domainData = context.working_memory.domains[domain];
        observations.push({
          timestamp: Date.now(),
          value: this.calculateDomainComplexity(domainData),
          domain: domain,
          status: domainData.status
        });
      });
    }
    
    // Add context size as a metric
    const contextSize = JSON.stringify(context).length;
    observations.push({
      timestamp: Date.now(),
      value: contextSize / 1024, // Convert to KB
      metric: 'size_kb'
    });
    
    return {
      observations,
      metadata: {
        sessionCount: context.working_memory?.session_count || 0,
        lastSession: context.working_memory?.last_session,
        activeDomain: context.working_memory?.active_domain
      }
    };
  }
  
  /**
   * Calculate domain complexity for metric input
   */
  calculateDomainComplexity(domainData) {
    let complexity = 0;
    
    // Factor in number of facts, decisions, and files
    complexity += (domainData.critical_facts?.length || 0) * 2;
    complexity += (domainData.decisions_made?.length || 0) * 3;
    complexity += (domainData.files_created?.length || 0) * 1;
    
    // Status affects complexity
    if (domainData.status === 'active') complexity *= 1.5;
    
    return complexity;
  }
  
  /**
   * Calculate Hysteresis metric
   * Detects if context is crossing degradation thresholds
   */
  calculateHysteresis(context) {
    const size = context.observations.find(o => o.metric === 'size_kb')?.value || 0;
    const threshold = this.thresholds.metrics.hysteresis.warn;
    return size > threshold ? 1 : 0;
  }
  
  /**
   * Calculate Complexity metric
   * Measures context entropy/predictability using variance
   */
  calculateComplexity(context) {
    const values = context.observations.map(o => o.value);
    if (values.length === 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.min(1, variance / 100); // Normalize to 0-1
  }
  
  /**
   * Calculate Momentum metric
   * Tracks if context is improving or degrading over time
   */
  calculateMomentum(context) {
    const values = context.observations.map(o => o.value);
    if (values.length < 2) return 0.5;
    
    let increasing = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i] > values[i - 1]) increasing++;
    }
    return increasing / (values.length - 1);
  }
  
  /**
   * Calculate Fairness metric
   * Ensures balanced context updates using Gini coefficient
   */
  calculateFairness(context) {
    const values = context.observations.map(o => o.value).sort((a, b) => a - b);
    const n = values.length;
    if (n === 0) return 1;
    
    const mean = values.reduce((a, b) => a + b, 0) / n;
    if (mean === 0) return 1;
    
    let giniSum = 0;
    for (let i = 0; i < n; i++) {
      giniSum += (2 * (i + 1) - n - 1) * values[i];
    }
    
    return 1 - (giniSum / (n * n * mean));
  }
  
  /**
   * Calculate Symmetry metric
   * Detects asymmetric growth patterns that indicate potential explosion
   */
  calculateSymmetry(context) {
    const values = context.observations.map(o => o.value);
    const midpoint = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, midpoint);
    const secondHalf = values.slice(midpoint);

    if (firstHalf.length === 0 || secondHalf.length === 0) return 0.5;

    const firstMean = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondMean = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const denom = Math.max(firstMean, secondMean, 1e-9);
    const score = 1 - Math.abs(firstMean - secondMean) / denom;
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * Determine overall health status based on metrics
   */
  determineStatus(metrics) {
    const statuses = [];
    
    Object.keys(metrics).forEach(metric => {
      const value = metrics[metric];
      const thresholds = this.thresholds.metrics[metric];
      
      if (value >= thresholds.critical) {
        statuses.push('critical');
      } else if (value >= thresholds.warn) {
        statuses.push('warning');
      } else {
        statuses.push('healthy');
      }
    });
    
    // Return worst status
    if (statuses.includes('critical')) return 'critical';
    if (statuses.includes('warning')) return 'warning';
    return 'healthy';
  }
  
  /**
   * Check if metrics are within viability region
   */
  isInViableRegion(metrics) {
    const region = this.viabilityRegion;
    
    return Object.keys(metrics).every(metric => {
      const value = metrics[metric];
      const bounds = region[metric];
      return value >= bounds.min && value <= bounds.max;
    });
  }
  
  /**
   * Generate alerts based on metric values
   */
  generateAlerts(metrics) {
    const alerts = [];
    
    Object.keys(metrics).forEach(metric => {
      const value = metrics[metric];
      const thresholds = this.thresholds.metrics[metric];
      
      if (value >= thresholds.critical) {
        alerts.push({
          level: 'critical',
          metric,
          value,
          message: `${metric} is critically high: ${value.toFixed(3)}`,
          recommendation: this.getRecommendation(metric, 'critical')
        });
      } else if (value >= thresholds.warn) {
        alerts.push({
          level: 'warning',
          metric,
          value,
          message: `${metric} is elevated: ${value.toFixed(3)}`,
          recommendation: this.getRecommendation(metric, 'warning')
        });
      }
    });
    
    return alerts;
  }
  
  /**
   * Get recommendation for metric issues
   */
  getRecommendation(metric, level) {
    const recommendations = {
      hysteresis: {
        warning: 'Consider compressing inactive domains',
        critical: 'Immediate compression required - context degrading'
      },
      complexity: {
        warning: 'Simplify context structure - too much entropy',
        critical: 'Context becoming unpredictable - reset recommended'
      },
      momentum: {
        warning: 'Context trending negative - review recent changes',
        critical: 'Rapid degradation detected - intervention required'
      },
      fairness: {
        warning: 'Unbalanced updates detected - review domain priorities',
        critical: 'Severe imbalance - some domains being neglected'
      },
      symmetry: {
        warning: 'Asymmetric growth pattern - potential explosion',
        critical: 'Context explosion imminent - immediate action required'
      }
    };
    
    return recommendations[metric]?.[level] || 'Review metric threshold configuration';
  }
  
  /**
   * Add assessment to history
   */
  addToHistory(assessment) {
    this.healthHistory.push(assessment);
    
    // Trim history if too long
    if (this.healthHistory.length > this.maxHistory) {
      this.healthHistory.shift();
    }
  }
  
  /**
   * Calculate trend from health history
   */
  calculateTrend() {
    if (this.healthHistory.length < 2) return 'stable';
    
    // Compare last few assessments
    const recent = this.healthHistory.slice(-5);
    let improving = 0;
    let degrading = 0;
    
    for (let i = 1; i < recent.length; i++) {
      const prev = recent[i - 1];
      const curr = recent[i];
      
      // Compare momentum metric as primary indicator
      if (curr.metrics.momentum > prev.metrics.momentum) {
        improving++;
      } else if (curr.metrics.momentum < prev.metrics.momentum) {
        degrading++;
      }
    }
    
    if (improving > degrading) return 'improving';
    if (degrading > improving) return 'degrading';
    return 'stable';
  }
  
  /**
   * Get diagnostic summary
   */
  getDiagnostics() {
    const latest = this.healthHistory[this.healthHistory.length - 1];
    
    return {
      currentStatus: latest?.status || 'unknown',
      trend: this.calculateTrend(),
      alertCount: latest?.alerts?.length || 0,
      inViableRegion: latest?.inViableRegion || false,
      averageLatency: this.calculateAverageLatency(),
      historySize: this.healthHistory.length,
      recommendations: this.generateRecommendations()
    };
  }
  
  /**
   * Calculate average assessment latency
   */
  calculateAverageLatency() {
    if (this.healthHistory.length === 0) return 0;
    
    const latencies = this.healthHistory.map(h => h.latency);
    return latencies.reduce((a, b) => a + b, 0) / latencies.length;
  }
  
  /**
   * Generate overall recommendations
   */
  generateRecommendations() {
    const latest = this.healthHistory[this.healthHistory.length - 1];
    if (!latest) return [];
    
    const recommendations = [];
    
    // Check if outside viable region
    if (!latest.inViableRegion) {
      recommendations.push('Context outside viable region - consider reset or compression');
    }
    
    // Check for critical alerts
    const criticalAlerts = latest.alerts.filter(a => a.level === 'critical');
    if (criticalAlerts.length > 0) {
      recommendations.push('Critical alerts present - immediate action required');
    }
    
    // Check trend
    const trend = this.calculateTrend();
    if (trend === 'degrading') {
      recommendations.push('Context health degrading - review recent changes');
    }
    
    return recommendations;
  }
}

module.exports = ContextHealthMonitor;
