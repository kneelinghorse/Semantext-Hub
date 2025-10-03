// state_calculator.js
// Specialized normalization and calculation functions for 4D state vector
// Provides mathematical utilities for mapping raw context data to [0,1]^4 space

class StateCalculator {
  constructor(config = {}) {
    this.config = config;

    // Normalization constants
    this.normalizationConstants = {
      // Form dimension constants
      form: {
        maxExpectedSize: config.maxContextSizeKB || 100,
        minSchemaCompliance: 0.5,
        symmetryWeight: 0.8
      },

      // Function dimension constants
      function: {
        maxFactsPerDomain: config.maxFactsPerDomain || 20,
        maxDecisionsPerDomain: config.maxDecisionsPerDomain || 10,
        semanticThreshold: 0.6
      },

      // Behavior dimension constants
      behavior: {
        targetLatencyMs: config.targetLatencyMs || 50,
        maxAcceptableLatency: config.maxLatencyMs || 200,
        performanceWeight: 0.3
      },

      // Context dimension constants
      context: {
        maxDomains: config.maxDomains || 8,
        fairnessThreshold: 0.4,
        couplingWeight: 0.5
      }
    };

    // Sigmoid function parameters for smooth normalization
    this.sigmoidParams = {
      steepness: config.sigmoidSteepness || 10,
      midpoint: config.sigmoidMidpoint || 0.5
    };
  }

  /**
   * Normalize value to [0,1] using various strategies
   */

  /**
   * Linear normalization with bounds
   */
  linearNormalize(value, min, max, inverted = false) {
    if (max <= min) return 0.5;

    let normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));

    if (inverted) {
      normalized = 1 - normalized;
    }

    return normalized;
  }

  /**
   * Sigmoid normalization for smooth transitions
   */
  sigmoidNormalize(value, target, steepness = null) {
    const k = steepness || this.sigmoidParams.steepness;
    return 1 / (1 + Math.exp(-k * (value - target)));
  }

  /**
   * Logarithmic normalization for exponential relationships
   */
  logNormalize(value, base = Math.E, scale = 1) {
    if (value <= 0) return 0;
    return Math.max(0, Math.min(1, Math.log(value * scale) / Math.log(base * scale + 1)));
  }

  /**
   * Exponential decay normalization
   */
  exponentialNormalize(value, decayConstant = 1, inverted = false) {
    let normalized = 1 - Math.exp(-decayConstant * value);

    if (inverted) {
      normalized = Math.exp(-decayConstant * value);
    }

    return Math.max(0, Math.min(1, normalized));
  }

  /**
   * Form dimension calculation utilities
   */

  /**
   * Calculate schema compliance score
   */
  calculateSchemaCompliance(context) {
    const required = ['working_memory'];
    const recommended = ['working_memory.domains', 'working_memory.session_count', 'working_memory.last_session'];

    let score = 0;
    let maxScore = required.length + recommended.length;

    // Check required fields
    for (const field of required) {
      if (this.hasNestedProperty(context, field)) {
        score += 1;
      }
    }

    // Check recommended fields
    for (const field of recommended) {
      if (this.hasNestedProperty(context, field)) {
        score += 1;
      }
    }

    return score / maxScore;
  }

  /**
   * Calculate structural efficiency based on size and organization
   */
  calculateStructuralEfficiency(context) {
    const sizeKB = JSON.stringify(context).length / 1024;
    const constants = this.normalizationConstants.form;

    // Size efficiency (smaller is better for same content)
    const sizeEfficiency = this.exponentialNormalize(sizeKB / constants.maxExpectedSize, 2, true);

    // Organization efficiency (balanced domain sizes)
    const orgEfficiency = this.calculateOrganizationEfficiency(context);

    return (sizeEfficiency * 0.6) + (orgEfficiency * 0.4);
  }

  /**
   * Calculate organization efficiency
   */
  calculateOrganizationEfficiency(context) {
    if (!context.working_memory?.domains) return 0.5;

    const domains = Object.values(context.working_memory.domains);
    if (domains.length === 0) return 0.5;

    const domainSizes = domains.map(domain => this.calculateDomainSize(domain));

    // Calculate coefficient of variation (lower is better)
    const mean = domainSizes.reduce((a, b) => a + b, 0) / domainSizes.length;
    const variance = domainSizes.reduce((sum, size) => sum + Math.pow(size - mean, 2), 0) / domainSizes.length;
    const coefficientOfVariation = Math.sqrt(variance) / (mean + 1); // +1 to avoid division by zero

    // Lower CV means better organization
    return this.exponentialNormalize(coefficientOfVariation, 1, true);
  }

  /**
   * Function dimension calculation utilities
   */

  /**
   * Calculate semantic density and relevance
   */
  calculateSemanticRelevance(context) {
    if (!context.working_memory?.domains) return 0.5;

    const domains = Object.values(context.working_memory.domains);
    const constants = this.normalizationConstants.function;

    let totalRelevance = 0;
    let totalWeight = 0;

    domains.forEach(domain => {
      const weight = domain.status === 'active' ? 1.0 : 0.5;
      const factCount = domain.critical_facts?.length || 0;
      const decisionCount = domain.decisions_made?.length || 0;

      // Relevance based on content density
      const factRelevance = this.sigmoidNormalize(factCount, constants.maxFactsPerDomain / 2);
      const decisionRelevance = this.sigmoidNormalize(decisionCount, constants.maxDecisionsPerDomain / 2);

      const domainRelevance = (factRelevance * 0.6) + (decisionRelevance * 0.4);

      totalRelevance += domainRelevance * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? totalRelevance / totalWeight : 0.5;
  }

  /**
   * Calculate intent preservation through deliverables
   */
  calculateIntentPreservation(context) {
    if (!context.working_memory?.domains) return 0.5;

    const domains = Object.values(context.working_memory.domains);

    let preservationScore = 0;
    let domainCount = 0;

    domains.forEach(domain => {
      const decisions = domain.decisions_made?.length || 0;
      const files = domain.files_created?.length || 0;
      const facts = domain.critical_facts?.length || 0;

      // Intent preserved through actionable outcomes
      const actionableRatio = (decisions + files) / (facts + 1);
      const domainPreservation = this.sigmoidNormalize(actionableRatio, 0.5);

      preservationScore += domainPreservation;
      domainCount++;
    });

    return domainCount > 0 ? preservationScore / domainCount : 0.5;
  }

  /**
   * Behavior dimension calculation utilities
   */

  /**
   * Calculate performance efficiency from latency and throughput
   */
  calculatePerformanceEfficiency(healthAssessment) {
    const constants = this.normalizationConstants.behavior;
    const latency = healthAssessment.latency || 0;

    // Latency efficiency (lower is better)
    const latencyScore = this.linearNormalize(
      latency,
      0,
      constants.maxAcceptableLatency,
      true
    );

    // If we have historical data, calculate consistency
    const consistencyScore = this.calculatePerformanceConsistency(healthAssessment);

    return (latencyScore * 0.7) + (consistencyScore * 0.3);
  }

  /**
   * Calculate performance consistency
   */
  calculatePerformanceConsistency(healthAssessment) {
    // This would be enhanced with historical latency data
    // For now, use a simple heuristic based on current performance
    const latency = healthAssessment.latency || 0;
    const target = this.normalizationConstants.behavior.targetLatencyMs;

    const deviation = Math.abs(latency - target) / target;
    return this.exponentialNormalize(deviation, 2, true);
  }

  /**
   * Context dimension calculation utilities
   */

  /**
   * Calculate dependency health and balance
   */
  calculateDependencyHealth(context) {
    if (!context.working_memory?.domains) return 0.5;

    const domains = Object.values(context.working_memory.domains);
    const healthyStatuses = ['active', 'completed', 'archived'];

    const healthyDomains = domains.filter(domain =>
      healthyStatuses.includes(domain.status)
    );

    const healthRatio = healthyDomains.length / Math.max(domains.length, 1);

    // Apply sigmoid to create smooth transition around 0.8
    return this.sigmoidNormalize(healthRatio, 0.8);
  }

  /**
   * Calculate coupling balance between domains
   */
  calculateCouplingBalance(context) {
    if (!context.working_memory?.domains) return 0.5;

    const domains = Object.values(context.working_memory.domains);

    if (domains.length < 2) return 1.0; // Perfect balance with one domain

    // Calculate domain interconnectedness
    const domainSizes = domains.map(domain => this.calculateDomainSize(domain));
    const interconnectedness = this.calculateInterconnectedness(domains);

    // Balance is good when domains are similar size and moderately connected
    const sizeBalance = this.calculateSizeBalance(domainSizes);
    const connectionBalance = this.calculateConnectionBalance(interconnectedness);

    return (sizeBalance * 0.6) + (connectionBalance * 0.4);
  }

  /**
   * Helper functions
   */

  /**
   * Check if object has nested property
   */
  hasNestedProperty(obj, path) {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined || !current.hasOwnProperty(part)) {
        return false;
      }
      current = current[part];
    }

    return true;
  }

  /**
   * Calculate domain size based on content
   */
  calculateDomainSize(domain) {
    return (domain.critical_facts?.length || 0) +
           (domain.decisions_made?.length || 0) * 2 +
           (domain.files_created?.length || 0) * 3;
  }

  /**
   * Calculate interconnectedness between domains
   */
  calculateInterconnectedness(domains) {
    // Simple heuristic: domains with similar keywords are connected
    let connections = 0;
    let totalPossible = (domains.length * (domains.length - 1)) / 2;

    if (totalPossible === 0) return 0;

    for (let i = 0; i < domains.length; i++) {
      for (let j = i + 1; j < domains.length; j++) {
        if (this.domainsAreConnected(domains[i], domains[j])) {
          connections++;
        }
      }
    }

    return connections / totalPossible;
  }

  /**
   * Determine if two domains are connected
   */
  domainsAreConnected(domain1, domain2) {
    // Simple heuristic based on shared files or similar content
    const files1 = domain1.files_created || [];
    const files2 = domain2.files_created || [];

    // Check for shared files
    const sharedFiles = files1.filter(file => files2.includes(file));

    return sharedFiles.length > 0;
  }

  /**
   * Calculate size balance from array of sizes
   */
  calculateSizeBalance(sizes) {
    if (sizes.length < 2) return 1.0;

    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const variance = sizes.reduce((sum, size) => sum + Math.pow(size - mean, 2), 0) / sizes.length;
    const coefficientOfVariation = Math.sqrt(variance) / (mean + 1);

    return this.exponentialNormalize(coefficientOfVariation, 1, true);
  }

  /**
   * Calculate connection balance
   */
  calculateConnectionBalance(interconnectedness) {
    // Optimal interconnectedness is around 0.3-0.7 (moderate coupling)
    const optimal = 0.5;
    const deviation = Math.abs(interconnectedness - optimal);

    return this.exponentialNormalize(deviation * 2, 1, true);
  }

  /**
   * Advanced normalization functions
   */

  /**
   * Percentile-based normalization
   */
  percentileNormalize(value, percentiles) {
    // percentiles should be an object like { p25: 0.2, p50: 0.5, p75: 0.8 }
    if (value <= percentiles.p25) return 0.25;
    if (value <= percentiles.p50) return 0.25 + 0.25 * (value - percentiles.p25) / (percentiles.p50 - percentiles.p25);
    if (value <= percentiles.p75) return 0.5 + 0.25 * (value - percentiles.p50) / (percentiles.p75 - percentiles.p50);
    return 0.75 + 0.25 * Math.min(1, (value - percentiles.p75) / (percentiles.p75 * 0.5));
  }

  /**
   * Z-score normalization with sigmoid conversion
   */
  zScoreNormalize(value, mean, stdDev) {
    if (stdDev === 0) return 0.5;

    const zScore = (value - mean) / stdDev;

    // Convert z-score to [0,1] using sigmoid
    return this.sigmoidNormalize(zScore, 0, 1);
  }

  /**
   * Power law normalization for heavy-tailed distributions
   */
  powerLawNormalize(value, alpha = 2, scale = 1) {
    const scaledValue = value / scale;
    return 1 - Math.pow(1 + scaledValue, -alpha);
  }

  /**
   * Utility: Get normalization statistics for calibration
   */
  getNormalizationStats(values, method = 'linear') {
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;

    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean,
      median: sorted[Math.floor(sorted.length / 2)],
      stdDev: Math.sqrt(variance),
      p25: sorted[Math.floor(sorted.length * 0.25)],
      p75: sorted[Math.floor(sorted.length * 0.75)],
      range: sorted[sorted.length - 1] - sorted[0]
    };
  }

  /**
   * Validate normalization result
   */
  validateNormalization(value, dimension) {
    if (typeof value !== 'number' || isNaN(value)) {
      console.warn(`Invalid normalization result for ${dimension}: ${value}`);
      return 0.5; // Safe fallback
    }

    if (value < 0 || value > 1) {
      console.warn(`Normalization out of bounds for ${dimension}: ${value}`);
      return Math.max(0, Math.min(1, value)); // Clamp to bounds
    }

    return value;
  }
}

module.exports = StateCalculator;