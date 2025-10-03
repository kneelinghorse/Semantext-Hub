// context_state.js
// 4-Dimensional Context State Vector Implementation
// Maps context health to normalized [0,1]^4 space (Form, Function, Behavior, Context)

const ContextHealthMonitor = require('./context_health');

class ContextStateVector {
  constructor(config = {}) {
    this.healthMonitor = new ContextHealthMonitor(config.health);
    this.history = [];
    this.maxHistory = config.maxHistory || 100;

    // Viability region thresholds
    this.viabilityThreshold = config.viabilityThreshold || 0.4;

    // Dimension weights for overall state calculation
    this.dimensionWeights = {
      Form: config.weights?.form || 0.25,
      Function: config.weights?.function || 0.25,
      Behavior: config.weights?.behavior || 0.25,
      Context: config.weights?.context || 0.25
    };

    // Performance tracking
    this.calculationTimes = [];
  }

  /**
   * Calculate the 4D state vector for given context
   * @param {Object} context - The context to analyze
   * @returns {Object} 4D state vector with normalized values [0,1]
   */
  calculate(context) {
    const startTime = Date.now();
    context = context || {};
    // Get health assessment from Mission 1.1
    const healthAssessment = this.healthMonitor.assess(context);

    // Calculate each dimension
    const state = {
      Form: this.calculateForm(context, healthAssessment),
      Function: this.calculateFunction(context, healthAssessment),
      Behavior: this.calculateBehavior(context, healthAssessment),
      Context: this.calculateContext(context, healthAssessment),
      timestamp: Date.now(),
      healthAssessment: healthAssessment,
      calculationTime: 0
    };

    // Calculate overall state magnitude
    state.magnitude = this.calculateMagnitude(state);
    state.isViable = this.inViableRegion(state);

    state.calculationTime = Date.now() - startTime;
    this.recordCalculationTime(state.calculationTime);

    // Add to history
    this.addToHistory(state);

    return state;
  }

  /**
   * Form Dimension: Structure integrity and efficiency
   * Maps to schema compliance, size efficiency, structural health
   */
  calculateForm(context, health) {
    let formScore = 0;

    // Schema compliance (40% of Form)
    const schemaCompliance = this.assessSchemaCompliance(context);
    formScore += schemaCompliance * 0.4;

    // Size efficiency (30% of Form)
    const sizeEfficiency = this.assessSizeEfficiency(context);
    formScore += sizeEfficiency * 0.3;

    // Structural symmetry from health metrics (30% of Form)
    const structuralHealth = this.normalizeHealthMetric(health.metrics.symmetry, 'symmetry');
    formScore += structuralHealth * 0.3;

    return Math.max(0, Math.min(1, formScore));
  }

  /**
   * Function Dimension: Semantic relevance and intent preservation
   * Maps to meaning preservation, relevance, functional integrity
   */
  calculateFunction(context, health) {
    let functionScore = 0;

    // Semantic relevance (50% of Function)
    const semanticRelevance = this.assessSemanticRelevance(context);
    functionScore += semanticRelevance * 0.5;

    // Intent preservation (30% of Function)
    const intentPreservation = this.assessIntentPreservation(context);
    functionScore += intentPreservation * 0.3;

    // Functional momentum from health metrics (20% of Function)
    const functionalHealth = this.normalizeHealthMetric(health.metrics.momentum, 'momentum');
    functionScore += functionalHealth * 0.2;

    return Math.max(0, Math.min(1, functionScore));
  }

  /**
   * Behavior Dimension: Temporal performance patterns
   * Maps directly to Mission 1.1 temporal metrics
   */
  calculateBehavior(context, health) {
    let behaviorScore = 0;

    // Temporal Hysteresis (25% of Behavior)
    const hysteresisHealth = this.normalizeHealthMetric(health.metrics.hysteresis, 'hysteresis');
    behaviorScore += hysteresisHealth * 0.25;

    // Temporal Complexity (25% of Behavior)
    const complexityHealth = this.normalizeHealthMetric(health.metrics.complexity, 'complexity');
    behaviorScore += complexityHealth * 0.25;

    // Directional Momentum (25% of Behavior)
    const momentumHealth = this.normalizeHealthMetric(health.metrics.momentum, 'momentum');
    behaviorScore += momentumHealth * 0.25;

    // Performance efficiency (25% of Behavior)
    const performanceHealth = this.assessPerformanceHealth(health);
    behaviorScore += performanceHealth * 0.25;

    return Math.max(0, Math.min(1, behaviorScore));
  }

  /**
   * Context Dimension: Relational health and coupling balance
   * Maps to fairness, dependencies, relationships
   */
  calculateContext(context, health) {
    let contextScore = 0;

    // Queue Position Fairness (40% of Context)
    const fairnessHealth = this.normalizeHealthMetric(health.metrics.fairness, 'fairness');
    contextScore += fairnessHealth * 0.4;

    // Dependency health (30% of Context)
    const dependencyHealth = this.assessDependencyHealth(context);
    contextScore += dependencyHealth * 0.3;

    // Coupling balance (30% of Context)
    const couplingBalance = this.assessCouplingBalance(context);
    contextScore += couplingBalance * 0.3;

    return Math.max(0, Math.min(1, contextScore));
  }

  /**
   * Normalize health metrics to [0,1] scale
   * Inverts metrics where lower is better
   */
  normalizeHealthMetric(value, metricType) {
    if (typeof value !== 'number' || isNaN(value)) return 0.5;
    const thresholds = this.healthMonitor.thresholds.viability[metricType];

    if (!thresholds) return 0.5; // Default if no thresholds

    // For metrics where higher is better (momentum, fairness, symmetry)
    if (['momentum', 'fairness', 'symmetry'].includes(metricType)) {
      return Math.max(0, Math.min(1, (value - thresholds.min) / (thresholds.max - thresholds.min)));
    }

    // For metrics where lower is better (hysteresis, complexity)
    if (['hysteresis', 'complexity'].includes(metricType)) {
      return Math.max(0, Math.min(1, 1 - (value - thresholds.min) / (thresholds.max - thresholds.min)));
    }

    return 0.5;
  }

  /**
   * Assess schema compliance for Form dimension
   */
  assessSchemaCompliance(context) {
    if (!context || typeof context !== 'object') return 0;

    let compliance = 0;

    // Check for required structure elements
    if (context.working_memory) compliance += 0.3;
    if (context.working_memory?.domains) compliance += 0.3;
    if (context.working_memory?.session_count !== undefined) compliance += 0.2;
    if (context.working_memory?.last_session) compliance += 0.2;

    return compliance;
  }

  /**
   * Assess size efficiency for Form dimension
   */
  assessSizeEfficiency(context) {
    const sizeKB = JSON.stringify(context).length / 1024;
    const thresholds = this.healthMonitor.thresholds.contextSizeLimits;

    if (sizeKB <= thresholds.optimal) return 1.0;
    if (sizeKB <= thresholds.warn) return 0.8;
    if (sizeKB <= thresholds.critical) return 0.5;
    return 0.2;
  }

  /**
   * Assess semantic relevance for Function dimension
   */
  assessSemanticRelevance(context) {
    if (!context.working_memory?.domains) return 0.5;

    const domains = Object.values(context.working_memory.domains);
    const activeDomains = domains.filter(d => d.status === 'active');
    const totalFacts = domains.reduce((sum, d) => sum + (d.critical_facts?.length || 0), 0);

    // Higher relevance with more active domains and critical facts
    const activeRatio = activeDomains.length / Math.max(domains.length, 1);
    const factDensity = Math.min(1, totalFacts / 10); // Normalize to 0-1

    return (activeRatio * 0.6) + (factDensity * 0.4);
  }

  /**
   * Assess intent preservation for Function dimension
   */
  assessIntentPreservation(context) {
    if (!context.working_memory?.domains) return 0.5;

    const domains = Object.values(context.working_memory.domains);
    const decisionsCount = domains.reduce((sum, d) => sum + (d.decisions_made?.length || 0), 0);
    const filesCount = domains.reduce((sum, d) => sum + (d.files_created?.length || 0), 0);

    // Intent preserved through decisions and deliverables
    const decisionScore = Math.min(1, decisionsCount / 5);
    const deliverableScore = Math.min(1, filesCount / 3);

    return (decisionScore * 0.7) + (deliverableScore * 0.3);
  }

  /**
   * Assess performance health for Behavior dimension
   */
  assessPerformanceHealth(health) {
    const targetLatency = this.healthMonitor.thresholds.performanceTargets.assessmentLatency.target;
    const actualLatency = health.latency;

    if (actualLatency <= targetLatency) return 1.0;
    if (actualLatency <= targetLatency * 2) return 0.7;
    return 0.3;
  }

  /**
   * Assess dependency health for Context dimension
   */
  assessDependencyHealth(context) {
    if (!context.working_memory?.domains) return 0.5;

    const domains = Object.values(context.working_memory.domains);
    const healthyDomains = domains.filter(d =>
      d.status === 'active' || d.status === 'completed'
    );

    return healthyDomains.length / Math.max(domains.length, 1);
  }

  /**
   * Assess coupling balance for Context dimension
   */
  assessCouplingBalance(context) {
    if (!context.working_memory?.domains) return 0.5;

    const domains = Object.values(context.working_memory.domains);
    const domainSizes = domains.map(d =>
      (d.critical_facts?.length || 0) +
      (d.decisions_made?.length || 0) +
      (d.files_created?.length || 0)
    );

    if (domainSizes.length === 0) return 0.5;

    const mean = domainSizes.reduce((a, b) => a + b, 0) / domainSizes.length;
    const variance = domainSizes.reduce((sum, size) => sum + Math.pow(size - mean, 2), 0) / domainSizes.length;

    // Lower variance indicates better balance
    return Math.max(0, 1 - (variance / (mean * mean + 1)));
  }

  /**
   * Calculate overall state magnitude
   */
  calculateMagnitude(state) {
    return Math.sqrt(
      Math.pow(state.Form * this.dimensionWeights.Form, 2) +
      Math.pow(state.Function * this.dimensionWeights.Function, 2) +
      Math.pow(state.Behavior * this.dimensionWeights.Behavior, 2) +
      Math.pow(state.Context * this.dimensionWeights.Context, 2)
    );
  }

  /**
   * Check if state is in viable region
   */
  inViableRegion(state) {
    return state.Form >= this.viabilityThreshold &&
           state.Function >= this.viabilityThreshold &&
           state.Behavior >= this.viabilityThreshold &&
           state.Context >= this.viabilityThreshold;
  }

  /**
   * Add state to history
   */
  addToHistory(state) {
    this.history.push(state);

    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * Get state trajectory over time
   */
  getTrajectory(dimensions = ['Form', 'Function', 'Behavior', 'Context']) {
    return this.history.map(state => {
      const point = { timestamp: state.timestamp };
      dimensions.forEach(dim => {
        point[dim] = state[dim];
      });
      return point;
    });
  }

  /**
   * Calculate state velocity (rate of change)
   */
  calculateVelocity() {
    if (this.history.length < 2) return null;

    const current = this.history[this.history.length - 1];
    const previous = this.history[this.history.length - 2];
    const timeDelta = current.timestamp - previous.timestamp;

    if (timeDelta === 0) {
      return {
        Form: 0,
        Function: 0,
        Behavior: 0,
        Context: 0,
        magnitude: 0
      };
    }

    return {
      Form: (current.Form - previous.Form) / timeDelta * 1000, // per second
      Function: (current.Function - previous.Function) / timeDelta * 1000,
      Behavior: (current.Behavior - previous.Behavior) / timeDelta * 1000,
      Context: (current.Context - previous.Context) / timeDelta * 1000,
      magnitude: (current.magnitude - previous.magnitude) / timeDelta * 1000
    };
  }

  /**
   * Detect state patterns and anomalies
   */
  detectPatterns() {
    if (this.history.length < 10) return { patterns: [], anomalies: [] };

    const patterns = [];
    const anomalies = [];

    // Detect degradation patterns
    const recentStates = this.history.slice(-10);
    const degradingDimensions = [];

    ['Form', 'Function', 'Behavior', 'Context'].forEach(dim => {
      const values = recentStates.map(s => s[dim]);
      const trend = this.calculateTrend(values);

      if (trend < -0.1) {
        degradingDimensions.push(dim);
      }
    });

    if (degradingDimensions.length > 0) {
      patterns.push({
        type: 'degradation',
        dimensions: degradingDimensions,
        severity: degradingDimensions.length / 4
      });
    }

    // Detect oscillations
    const magnitudes = recentStates.map(s => s.magnitude);
    const oscillation = this.detectOscillation(magnitudes);

    if (oscillation.detected) {
      anomalies.push({
        type: 'oscillation',
        frequency: oscillation.frequency,
        amplitude: oscillation.amplitude
      });
    }

    return { patterns, anomalies };
  }

  /**
   * Calculate trend for a series of values
   */
  calculateTrend(values) {
    if (values.length < 2) return 0;

    const n = values.length;
    const sumX = n * (n - 1) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
    const sumX2 = n * (n - 1) * (2 * n - 1) / 6;

    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  /**
   * Detect oscillation in value series
   */
  detectOscillation(values) {
    if (values.length < 6) return { detected: false };

    // Simple peak/valley detection
    const peaks = [];
    const valleys = [];

    for (let i = 1; i < values.length - 1; i++) {
      if (values[i] > values[i-1] && values[i] > values[i+1]) {
        peaks.push(i);
      } else if (values[i] < values[i-1] && values[i] < values[i+1]) {
        valleys.push(i);
      }
    }

    const totalExtrema = peaks.length + valleys.length;

    if (totalExtrema >= 3) {
      const frequency = totalExtrema / values.length;
      const amplitude = peaks.length > 0 && valleys.length > 0 ?
        Math.abs(Math.max(...peaks.map(i => values[i])) - Math.min(...valleys.map(i => values[i]))) : 0;

      return {
        detected: frequency > 0.3, // Threshold for oscillation detection
        frequency,
        amplitude
      };
    }

    return { detected: false };
  }

  /**
   * Record calculation time for performance monitoring
   */
  recordCalculationTime(time) {
    this.calculationTimes.push(time);

    if (this.calculationTimes.length > 100) {
      this.calculationTimes.shift();
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats() {
    if (this.calculationTimes.length === 0) return null;

    const times = this.calculationTimes;
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);
    const min = Math.min(...times);

    return {
      averageMs: avg,
      maxMs: max,
      minMs: min,
      samples: times.length,
      targetMs: 50,
      meetingTarget: avg <= 50
    };
  }

  /**
   * Get diagnostic summary
   */
  getDiagnostics() {
    const latest = this.history[this.history.length - 1];
    const velocity = this.calculateVelocity();
    const patterns = this.detectPatterns();
    const performance = this.getPerformanceStats();

    return {
      currentState: latest ? {
        Form: latest.Form,
        Function: latest.Function,
        Behavior: latest.Behavior,
        Context: latest.Context,
        magnitude: latest.magnitude,
        isViable: latest.isViable
      } : null,
      velocity,
      patterns: patterns.patterns,
      anomalies: patterns.anomalies,
      performance,
      historySize: this.history.length,
      healthStatus: latest?.healthAssessment?.status
    };
  }
}

module.exports = ContextStateVector;
