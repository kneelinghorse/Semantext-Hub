/**
 * Circuit Breaker Implementation
 * 
 * Provides circuit breaker pattern for preventing cascading failures in distributed systems.
 * Supports failure-rate based tripping, half-open recovery, and configurable thresholds.
 */

import { EventEmitter } from 'events';
import { CircuitBreakerError } from './error-handler.js';

/**
 * Circuit breaker states
 */
export const CIRCUIT_STATES = {
  CLOSED: 'closed',     // Normal operation
  OPEN: 'open',         // Circuit is open, failing fast
  HALF_OPEN: 'half_open' // Testing if service has recovered
};

/**
 * Circuit breaker configuration
 */
export const DEFAULT_CONFIG = {
  failureThreshold: 5,        // Number of failures before opening circuit
  successThreshold: 3,        // Number of successes in half-open to close circuit
  timeout: 60000,             // Timeout before attempting half-open (ms)
  monitoringPeriod: 10000,    // Period for calculating failure rate (ms)
  enableMetrics: true,        // Enable metrics collection
  enableLogging: true         // Enable logging
};

/**
 * Circuit breaker metrics
 */
export class CircuitBreakerMetrics {
  constructor() {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.timeouts = 0;
    this.circuitOpens = 0;
    this.circuitCloses = 0;
    this.lastResetTime = Date.now();
  }

  /**
   * Record successful request
   */
  recordSuccess() {
    this.totalRequests++;
    this.successfulRequests++;
  }

  /**
   * Record failed request
   */
  recordFailure() {
    this.totalRequests++;
    this.failedRequests++;
  }

  /**
   * Record timeout
   */
  recordTimeout() {
    this.totalRequests++;
    this.timeouts++;
  }

  /**
   * Record circuit open
   */
  recordCircuitOpen() {
    this.circuitOpens++;
  }

  /**
   * Record circuit close
   */
  recordCircuitClose() {
    this.circuitCloses++;
  }

  /**
   * Reset metrics
   */
  reset() {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.timeouts = 0;
    this.lastResetTime = Date.now();
  }

  /**
   * Get failure rate
   * @returns {number} Failure rate (0-1)
   */
  getFailureRate() {
    if (this.totalRequests === 0) return 0;
    return this.failedRequests / this.totalRequests;
  }

  /**
   * Get success rate
   * @returns {number} Success rate (0-1)
   */
  getSuccessRate() {
    if (this.totalRequests === 0) return 0;
    return this.successfulRequests / this.totalRequests;
  }

  /**
   * Get metrics summary
   * @returns {Object} Metrics summary
   */
  getSummary() {
    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      timeouts: this.timeouts,
      circuitOpens: this.circuitOpens,
      circuitCloses: this.circuitCloses,
      failureRate: this.getFailureRate(),
      successRate: this.getSuccessRate(),
      lastResetTime: this.lastResetTime
    };
  }
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.state = CIRCUIT_STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.metrics = new CircuitBreakerMetrics();
    this.requestHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Execute function with circuit breaker protection
   * @param {Function} fn - Function to execute
   * @param {Object} options - Execution options
   * @returns {Promise<any>} Function result
   */
  async execute(fn, options = {}) {
    const startTime = Date.now();
    const requestId = options.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Check if circuit is open
      if (this.state === CIRCUIT_STATES.OPEN) {
        if (Date.now() < this.nextAttemptTime) {
          throw new CircuitBreakerError(
            'Circuit breaker is open',
            null,
            this.state,
            { requestId, nextAttemptTime: this.nextAttemptTime }
          );
        }
        
        // Transition to half-open
        this._transitionToHalfOpen();
      }

      // Execute the function
      const result = await fn();
      
      // Record success
      this._recordSuccess(requestId, Date.now() - startTime);
      
      return result;
    } catch (error) {
      // Record failure
      this._recordFailure(error, requestId, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Check if circuit breaker allows requests
   * @returns {boolean} True if requests are allowed
   */
  canExecute() {
    if (this.state === CIRCUIT_STATES.CLOSED) {
      return true;
    }
    
    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      return true;
    }
    
    if (this.state === CIRCUIT_STATES.OPEN) {
      return Date.now() >= this.nextAttemptTime;
    }
    
    return false;
  }

  /**
   * Get current state
   * @returns {string} Current state
   */
  getState() {
    return this.state;
  }

  /**
   * Get circuit breaker status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      canExecute: this.canExecute(),
      metrics: this.metrics.getSummary()
    };
  }

  /**
   * Reset circuit breaker to closed state
   */
  reset() {
    this.state = CIRCUIT_STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.metrics.reset();
    this.requestHistory = [];
    
    if (this.config.enableLogging) {
      console.log('[CircuitBreaker] Circuit breaker reset');
    }
    
    this.emit('reset');
  }

  /**
   * Record successful request
   * @private
   * @param {string} requestId - Request ID
   * @param {number} duration - Request duration
   */
  _recordSuccess(requestId, duration) {
    this.successCount++;
    this.metrics.recordSuccess();

    // If we are in CLOSED state, a successful execution should
    // clear any accumulated failure count
    if (this.state === CIRCUIT_STATES.CLOSED && this.failureCount > 0) {
      this.failureCount = 0;
    }
    
    // Add to history
    this._addToHistory({
      requestId,
      success: true,
      duration,
      timestamp: Date.now()
    });
    
    // In half-open state, check if we should close circuit
    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      if (this.successCount >= this.config.successThreshold) {
        this._transitionToClosed();
      }
    }
    
    if (this.config.enableLogging) {
      console.log(`[CircuitBreaker] Request ${requestId} succeeded (${duration}ms)`);
    }
    
    this.emit('success', { requestId, duration });
  }

  /**
   * Record failed request
   * @private
   * @param {Error} error - Error that occurred
   * @param {string} requestId - Request ID
   * @param {number} duration - Request duration
   */
  _recordFailure(error, requestId, duration) {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.metrics.recordFailure();
    
    // Add to history
    this._addToHistory({
      requestId,
      success: false,
      duration,
      timestamp: Date.now(),
      error: error.message
    });
    
    // Check if we should open circuit
    if (this.state === CIRCUIT_STATES.CLOSED || this.state === CIRCUIT_STATES.HALF_OPEN) {
      if (this.failureCount >= this.config.failureThreshold) {
        this._transitionToOpen();
      }
    }
    
    if (this.config.enableLogging) {
      console.log(`[CircuitBreaker] Request ${requestId} failed: ${error.message} (${duration}ms)`);
    }
    
    this.emit('failure', { requestId, duration, error });
  }

  /**
   * Transition to closed state
   * @private
   */
  _transitionToClosed() {
    const previousState = this.state;
    this.state = CIRCUIT_STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = null;
    this.metrics.recordCircuitClose();
    
    if (this.config.enableLogging) {
      console.log(`[CircuitBreaker] Circuit breaker closed (was ${previousState})`);
    }
    
    this.emit('stateChange', {
      from: previousState,
      to: CIRCUIT_STATES.CLOSED
    });
  }

  /**
   * Transition to open state
   * @private
   */
  _transitionToOpen() {
    const previousState = this.state;
    this.state = CIRCUIT_STATES.OPEN;
    this.nextAttemptTime = Date.now() + this.config.timeout;
    this.metrics.recordCircuitOpen();
    
    if (this.config.enableLogging) {
      console.log(`[CircuitBreaker] Circuit breaker opened (was ${previousState}), next attempt at ${new Date(this.nextAttemptTime).toISOString()}`);
    }
    
    this.emit('stateChange', {
      from: previousState,
      to: CIRCUIT_STATES.OPEN
    });
  }

  /**
   * Transition to half-open state
   * @private
   */
  _transitionToHalfOpen() {
    const previousState = this.state;
    this.state = CIRCUIT_STATES.HALF_OPEN;
    this.successCount = 0;
    this.failureCount = 0;
    
    if (this.config.enableLogging) {
      console.log(`[CircuitBreaker] Circuit breaker half-open (was ${previousState})`);
    }
    
    this.emit('stateChange', {
      from: previousState,
      to: CIRCUIT_STATES.HALF_OPEN
    });
  }

  /**
   * Add request to history
   * @private
   * @param {Object} request - Request data
   */
  _addToHistory(request) {
    this.requestHistory.push(request);
    
    // Trim history if needed
    if (this.requestHistory.length > this.maxHistorySize) {
      this.requestHistory = this.requestHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get request history
   * @param {number} limit - Limit number of requests
   * @returns {Array} Request history
   */
  getHistory(limit = 50) {
    return this.requestHistory.slice(-limit);
  }

  /**
   * Get recent failures
   * @param {number} limit - Limit number of failures
   * @returns {Array} Recent failures
   */
  getRecentFailures(limit = 10) {
    return this.requestHistory
      .filter(req => !req.success)
      .slice(-limit);
  }

  /**
   * Check if circuit breaker is healthy
   * @returns {boolean} True if healthy
   */
  isHealthy() {
    return this.state === CIRCUIT_STATES.CLOSED;
  }

  /**
   * Get health status
   * @returns {Object} Health status
   */
  getHealth() {
    const metrics = this.metrics.getSummary();
    const recentFailures = this.getRecentFailures(5);
    
    return {
      status: this.isHealthy() ? 'healthy' : 'degraded',
      state: this.state,
      canExecute: this.canExecute(),
      failureRate: metrics.failureRate,
      recentFailures: recentFailures.length,
      lastFailure: recentFailures.length > 0 ? recentFailures[recentFailures.length - 1].timestamp : null
    };
  }
}

/**
 * Circuit breaker manager for multiple services
 */
export class CircuitBreakerManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.breakers = new Map();
    this.defaultConfig = { ...DEFAULT_CONFIG, ...options };
    this.enableLogging = options.enableLogging !== false;
  }

  /**
   * Get or create circuit breaker for service
   * @param {string} serviceName - Service name
   * @param {Object} config - Circuit breaker config
   * @returns {CircuitBreaker} Circuit breaker instance
   */
  getBreaker(serviceName, config = {}) {
    if (!this.breakers.has(serviceName)) {
      const breakerConfig = { ...this.defaultConfig, ...config };
      const breaker = new CircuitBreaker(breakerConfig);
      
      // Set up event listeners
      breaker.on('stateChange', (event) => {
        if (this.enableLogging) {
          console.log(`[CircuitBreakerManager] ${serviceName} state changed: ${event.from} -> ${event.to}`);
        }
        this.emit('stateChange', { serviceName, ...event });
      });
      
      this.breakers.set(serviceName, breaker);
    }
    
    return this.breakers.get(serviceName);
  }

  /**
   * Execute function with circuit breaker protection
   * @param {string} serviceName - Service name
   * @param {Function} fn - Function to execute
   * @param {Object} options - Execution options
   * @returns {Promise<any>} Function result
   */
  async execute(serviceName, fn, options = {}) {
    const breaker = this.getBreaker(serviceName, options.config);
    return breaker.execute(fn, options);
  }

  /**
   * Get status of all circuit breakers
   * @returns {Object} Status of all breakers
   */
  getAllStatus() {
    const status = {};
    for (const [serviceName, breaker] of this.breakers) {
      status[serviceName] = breaker.getStatus();
    }
    return status;
  }

  /**
   * Get health of all circuit breakers
   * @returns {Object} Health of all breakers
   */
  getAllHealth() {
    const health = {};
    for (const [serviceName, breaker] of this.breakers) {
      health[serviceName] = breaker.getHealth();
    }
    return health;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Remove circuit breaker
   * @param {string} serviceName - Service name
   */
  removeBreaker(serviceName) {
    this.breakers.delete(serviceName);
  }

  /**
   * Clear all circuit breakers
   */
  clear() {
    this.breakers.clear();
  }
}

/**
 * Create circuit breaker instance
 * @param {Object} options - Circuit breaker options
 * @returns {CircuitBreaker} Circuit breaker instance
 */
export function createCircuitBreaker(options = {}) {
  return new CircuitBreaker(options);
}

/**
 * Create circuit breaker manager
 * @param {Object} options - Manager options
 * @returns {CircuitBreakerManager} Circuit breaker manager
 */
export function createCircuitBreakerManager(options = {}) {
  return new CircuitBreakerManager(options);
}

/**
 * Convenience function to execute with circuit breaker
 * @param {string} serviceName - Service name
 * @param {Function} fn - Function to execute
 * @param {Object} options - Options
 * @returns {Promise<any>} Function result
 */
export async function withCircuitBreaker(serviceName, fn, options = {}) {
  const manager = createCircuitBreakerManager(options);
  return manager.execute(serviceName, fn, options);
}

/**
 * Circuit breaker decorator for functions
 * @param {string} serviceName - Service name
 * @param {Object} options - Circuit breaker options
 * @returns {Function} Decorated function
 */
export function circuitBreaker(serviceName, options = {}) {
  const manager = createCircuitBreakerManager(options);
  
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args) {
      return manager.execute(serviceName, () => originalMethod.apply(this, args));
    };
    
    return descriptor;
  };
}

/**
 * Export circuit breaker states for external use
 */
// CIRCUIT_STATES is already exported above
