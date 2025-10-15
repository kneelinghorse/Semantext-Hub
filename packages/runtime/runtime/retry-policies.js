/**
 * Retry Policies Implementation
 * 
 * Provides shared retry policies for A2A/MCP clients with exponential backoff,
 * jitter, and configurable retry strategies.
 */

import { EventEmitter } from 'events';
import { RetryError, TimeoutError } from './error-handler.js';

/**
 * Retry policy types
 */
export const RETRY_POLICIES = {
  EXPONENTIAL_BACKOFF: 'exponential_backoff',
  LINEAR_BACKOFF: 'linear_backoff',
  FIXED_DELAY: 'fixed_delay',
  IMMEDIATE: 'immediate'
};

/**
 * Default retry configuration
 */
export const DEFAULT_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,           // Base delay in milliseconds
  maxDelay: 30000,           // Maximum delay in milliseconds
  backoffMultiplier: 2,      // Exponential backoff multiplier
  jitter: true,              // Add jitter to prevent thundering herd
  jitterFactor: 0.1,         // Jitter factor (0-1)
  policy: RETRY_POLICIES.EXPONENTIAL_BACKOFF,
  enableLogging: true,
  enableMetrics: true
};

/**
 * Retry metrics
 */
export class RetryMetrics {
  constructor() {
    this.totalAttempts = 0;
    this.successfulAttempts = 0;
    this.failedAttempts = 0;
    this.retryAttempts = 0;
    this.totalRetryTime = 0;
    this.lastResetTime = Date.now();
  }

  /**
   * Record attempt
   * @param {boolean} success - Whether attempt was successful
   * @param {number} retryTime - Time spent on retries
   */
  recordAttempt(success, retryTime = 0) {
    this.totalAttempts++;
    this.totalRetryTime += retryTime;
    
    if (success) {
      this.successfulAttempts++;
    } else {
      this.failedAttempts++;
    }
  }

  /**
   * Record retry attempt
   */
  recordRetry() {
    this.retryAttempts++;
  }

  /**
   * Reset metrics
   */
  reset() {
    this.totalAttempts = 0;
    this.successfulAttempts = 0;
    this.failedAttempts = 0;
    this.retryAttempts = 0;
    this.totalRetryTime = 0;
    this.lastResetTime = Date.now();
  }

  /**
   * Get success rate
   * @returns {number} Success rate (0-1)
   */
  getSuccessRate() {
    if (this.totalAttempts === 0) return 0;
    return this.successfulAttempts / this.totalAttempts;
  }

  /**
   * Get average retry time
   * @returns {number} Average retry time in milliseconds
   */
  getAverageRetryTime() {
    if (this.retryAttempts === 0) return 0;
    return this.totalRetryTime / this.retryAttempts;
  }

  /**
   * Get metrics summary
   * @returns {Object} Metrics summary
   */
  getSummary() {
    return {
      totalAttempts: this.totalAttempts,
      successfulAttempts: this.successfulAttempts,
      failedAttempts: this.failedAttempts,
      retryAttempts: this.retryAttempts,
      successRate: this.getSuccessRate(),
      averageRetryTime: this.getAverageRetryTime(),
      totalRetryTime: this.totalRetryTime,
      lastResetTime: this.lastResetTime
    };
  }
}

/**
 * Retry policy implementation
 */
export class RetryPolicy extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.metrics = new RetryMetrics();
  }

  /**
   * Execute function with retry logic
   * @param {Function} fn - Function to execute
   * @param {Object} options - Retry options
   * @returns {Promise<any>} Function result
   */
  async execute(fn, options = {}) {
    const config = { ...this.config, ...options };
    const startTime = Date.now();
    let lastError;
    
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const result = await fn();
        
        // Record successful attempt
        const retryTime = Date.now() - startTime;
        this.metrics.recordAttempt(true, retryTime);
        
        if (this.config.enableLogging && attempt > 0) {
          console.log(`[RetryPolicy] Function succeeded on attempt ${attempt + 1}`);
        }
        
        this.emit('success', { attempt: attempt + 1, retryTime });
        return result;
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          this.metrics.recordAttempt(false, Date.now() - startTime);
          throw error;
        }
        
        // Don't retry on last attempt
        if (attempt >= config.maxRetries) {
          break;
        }
        
        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt, config);
        this.metrics.recordRetry();
        
        if (this.config.enableLogging) {
          console.log(`[RetryPolicy] Attempt ${attempt + 1} failed: ${error.message}, retrying in ${delay}ms`);
        }
        
        this.emit('retry', { attempt: attempt + 1, error, delay });
        
        // Wait before next attempt
        await this.sleep(delay);
      }
    }
    
    // All retries exhausted
    const retryTime = Date.now() - startTime;
    this.metrics.recordAttempt(false, retryTime);
    
    throw new RetryError(
      `Function failed after ${config.maxRetries + 1} attempts`,
      lastError,
      config.maxRetries + 1,
      { retryTime, attempts: config.maxRetries + 1 }
    );
  }

  /**
   * Calculate delay for retry attempt
   * @param {number} attempt - Attempt number (0-based)
   * @param {Object} config - Retry configuration
   * @returns {number} Delay in milliseconds
   */
  calculateDelay(attempt, config) {
    let delay;
    
    switch (config.policy) {
      case RETRY_POLICIES.EXPONENTIAL_BACKOFF:
        delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt),
          config.maxDelay
        );
        break;
        
      case RETRY_POLICIES.LINEAR_BACKOFF:
        delay = Math.min(
          config.baseDelay * (attempt + 1),
          config.maxDelay
        );
        break;
        
      case RETRY_POLICIES.FIXED_DELAY:
        delay = config.baseDelay;
        break;
        
      case RETRY_POLICIES.IMMEDIATE:
        delay = 0;
        break;
        
      default:
        delay = config.baseDelay;
    }
    
    // Add jitter if enabled
    if (config.jitter && delay > 0) {
      const jitterAmount = delay * config.jitterFactor;
      const jitter = (Math.random() - 0.5) * 2 * jitterAmount;
      delay = Math.max(0, delay + jitter);
    }
    
    return Math.round(delay);
  }

  /**
   * Check if error is retryable
   * @param {Error} error - Error to check
   * @returns {boolean} True if retryable
   */
  isRetryableError(error) {
    // Don't retry timeout errors, validation errors, or auth errors
    if (error instanceof TimeoutError || 
        error.name === 'ValidationError' || 
        error.name === 'AuthError') {
      return false;
    }
    
    // Don't retry if error has retryable: false
    if (error.retryable === false) {
      return false;
    }
    
    // Retry if error has retryable: true
    if (error.retryable === true) {
      return true;
    }
    
    // Default retry behavior based on error type
    return true;
  }

  /**
   * Sleep for specified duration
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get retry policy status
   * @returns {Object} Policy status
   */
  getStatus() {
    return {
      config: this.config,
      metrics: this.metrics.getSummary()
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics.reset();
  }
}

/**
 * Retry policy manager
 */
export class RetryPolicyManager {
  constructor(options = {}) {
    this.policies = new Map();
    this.defaultConfig = { ...DEFAULT_CONFIG, ...options };
    this.enableLogging = options.enableLogging !== false;
  }

  /**
   * Get or create retry policy
   * @param {string} policyName - Policy name
   * @param {Object} config - Policy configuration
   * @returns {RetryPolicy} Retry policy instance
   */
  getPolicy(policyName, config = {}) {
    if (!this.policies.has(policyName)) {
      const policyConfig = { ...this.defaultConfig, ...config };
      const policy = new RetryPolicy(policyConfig);
      
      // Set up event listeners
      policy.on('retry', (event) => {
        if (this.enableLogging) {
          console.log(`[RetryPolicyManager] ${policyName} retry attempt ${event.attempt}`);
        }
        this.emit('retry', { policyName, ...event });
      });
      
      policy.on('success', (event) => {
        if (this.enableLogging) {
          console.log(`[RetryPolicyManager] ${policyName} succeeded after ${event.attempt} attempts`);
        }
        this.emit('success', { policyName, ...event });
      });
      
      this.policies.set(policyName, policy);
    }
    
    return this.policies.get(policyName);
  }

  /**
   * Execute function with retry policy
   * @param {string} policyName - Policy name
   * @param {Function} fn - Function to execute
   * @param {Object} options - Execution options
   * @returns {Promise<any>} Function result
   */
  async execute(policyName, fn, options = {}) {
    const policy = this.getPolicy(policyName, options.config);
    return policy.execute(fn, options);
  }

  /**
   * Get status of all policies
   * @returns {Object} Status of all policies
   */
  getAllStatus() {
    const status = {};
    for (const [policyName, policy] of this.policies) {
      status[policyName] = policy.getStatus();
    }
    return status;
  }

  /**
   * Reset all policy metrics
   */
  resetAllMetrics() {
    for (const policy of this.policies.values()) {
      policy.resetMetrics();
    }
  }

  /**
   * Remove retry policy
   * @param {string} policyName - Policy name
   */
  removePolicy(policyName) {
    this.policies.delete(policyName);
  }

  /**
   * Clear all retry policies
   */
  clear() {
    this.policies.clear();
  }
}

/**
 * Predefined retry policies
 */
export const PREDEFINED_POLICIES = {
  /**
   * Fast retry policy for quick operations
   */
  FAST: {
    maxRetries: 2,
    baseDelay: 100,
    maxDelay: 1000,
    backoffMultiplier: 2,
    jitter: true,
    policy: RETRY_POLICIES.EXPONENTIAL_BACKOFF
  },

  /**
   * Standard retry policy for normal operations
   */
  STANDARD: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true,
    policy: RETRY_POLICIES.EXPONENTIAL_BACKOFF
  },

  /**
   * Slow retry policy for heavy operations
   */
  SLOW: {
    maxRetries: 5,
    baseDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
    policy: RETRY_POLICIES.EXPONENTIAL_BACKOFF
  },

  /**
   * Immediate retry policy for critical operations
   */
  IMMEDIATE: {
    maxRetries: 3,
    baseDelay: 0,
    maxDelay: 0,
    backoffMultiplier: 1,
    jitter: false,
    policy: RETRY_POLICIES.IMMEDIATE
  },

  /**
   * Linear retry policy for predictable delays
   */
  LINEAR: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 1,
    jitter: true,
    policy: RETRY_POLICIES.LINEAR_BACKOFF
  }
};

/**
 * Create retry policy instance
 * @param {Object} options - Policy options
 * @returns {RetryPolicy} Retry policy instance
 */
export function createRetryPolicy(options = {}) {
  return new RetryPolicy(options);
}

/**
 * Create retry policy manager
 * @param {Object} options - Manager options
 * @returns {RetryPolicyManager} Retry policy manager
 */
export function createRetryPolicyManager(options = {}) {
  return new RetryPolicyManager(options);
}

/**
 * Convenience function to execute with retry policy
 * @param {string} policyName - Policy name
 * @param {Function} fn - Function to execute
 * @param {Object} options - Options
 * @returns {Promise<any>} Function result
 */
export async function withRetryPolicy(policyName, fn, options = {}) {
  const manager = createRetryPolicyManager(options);
  return manager.execute(policyName, fn, options);
}

/**
 * Retry decorator for functions
 * @param {string} policyName - Policy name
 * @param {Object} options - Retry options
 * @returns {Function} Decorated function
 */
export function retry(policyName, options = {}) {
  const manager = createRetryPolicyManager(options);
  
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args) {
      return manager.execute(policyName, () => originalMethod.apply(this, args));
    };
    
    return descriptor;
  };
}

/**
 * Utility functions for retry policies
 */
export const RetryUtils = {
  /**
   * Create retry policy from predefined policy
   * @param {string} predefinedPolicy - Predefined policy name
   * @param {Object} overrides - Configuration overrides
   * @returns {Object} Retry policy configuration
   */
  fromPredefined(predefinedPolicy, overrides = {}) {
    const baseConfig = PREDEFINED_POLICIES[predefinedPolicy.toUpperCase()];
    if (!baseConfig) {
      throw new Error(`Unknown predefined policy: ${predefinedPolicy}`);
    }
    return { ...baseConfig, ...overrides };
  },

  /**
   * Calculate total retry time for given attempts
   * @param {number} attempts - Number of attempts
   * @param {Object} config - Retry configuration
   * @returns {number} Total retry time in milliseconds
   */
  calculateTotalRetryTime(attempts, config) {
    let totalTime = 0;
    for (let i = 0; i < attempts; i++) {
      totalTime += this.calculateDelay(i, config);
    }
    return totalTime;
  },

  /**
   * Calculate delay for specific attempt
   * @param {number} attempt - Attempt number
   * @param {Object} config - Retry configuration
   * @returns {number} Delay in milliseconds
   */
  calculateDelay(attempt, config) {
    const policy = new RetryPolicy(config);
    return policy.calculateDelay(attempt, config);
  },

  /**
   * Check if error should be retried
   * @param {Error} error - Error to check
   * @param {Object} config - Retry configuration
   * @returns {boolean} True if should retry
   */
  shouldRetry(error, config = {}) {
    const policy = new RetryPolicy(config);
    return policy.isRetryableError(error);
  }
};

/**
 * Export retry policy types for external use
 */
// RETRY_POLICIES is already exported above
