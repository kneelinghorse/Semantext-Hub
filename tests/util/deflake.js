/**
 * Deflake Harness Utility
 * 
 * Provides utilities to reduce test flakiness by:
 * - Retrying flaky tests with exponential backoff
 * - Detecting and reporting flaky patterns
 * - Providing deterministic test data generation
 * - Managing test isolation and cleanup
 */

import { performance } from 'perf_hooks';

/**
 * Configuration for deflake harness
 */
export class DeflakeConfig {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 100; // ms
    this.maxDelay = options.maxDelay || 5000; // ms
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.jitter = options.jitter !== false; // Add randomness to prevent thundering herd
    this.timeout = options.timeout || 30000; // ms
    this.flakeThreshold = options.flakeThreshold || 0.1; // 10% failure rate considered flaky
    this.minRuns = options.minRuns || 10; // Minimum runs to determine flakiness
  }
}

/**
 * Deflake harness for managing flaky tests
 */
export class DeflakeHarness {
  constructor(config = {}) {
    this.config = new DeflakeConfig(config);
    this.results = new Map(); // Track test results for flakiness analysis
    this.flakyTests = new Set(); // Track identified flaky tests
  }

  /**
   * Run a test function with retry logic for flakiness
   * @param {string} testName - Name of the test
   * @param {Function} testFn - Test function to run
   * @param {Object} options - Test-specific options
   * @returns {Promise<Object>} Test result
   */
  async runWithRetry(testName, testFn, options = {}) {
    const testConfig = { ...this.config, ...options };
    const startTime = performance.now();
    let lastError;
    let attempt = 0;

    while (attempt <= testConfig.maxRetries) {
      try {
        const result = await this.runWithTimeout(testFn, testConfig.timeout);
        const duration = performance.now() - startTime;
        
        this.recordResult(testName, {
          success: true,
          attempt: attempt + 1,
          duration,
          timestamp: new Date().toISOString()
        });

        return {
          success: true,
          result,
          attempts: attempt + 1,
          duration,
          flaky: this.isFlaky(testName)
        };
      } catch (error) {
        lastError = error;
        attempt++;
        
        this.recordResult(testName, {
          success: false,
          attempt,
          error: error.message,
          duration: performance.now() - startTime,
          timestamp: new Date().toISOString()
        });

        // Don't retry on certain error types
        if (this.isNonRetryableError(error)) {
          break;
        }

        // Wait before retry (except on last attempt)
        if (attempt <= testConfig.maxRetries) {
          const delay = this.calculateDelay(attempt, testConfig);
          await this.sleep(delay);
        }
      }
    }

    const duration = performance.now() - startTime;
    this.markAsFlaky(testName);

    return {
      success: false,
      error: lastError,
      attempts: attempt,
      duration,
      flaky: true
    };
  }

  /**
   * Run test with timeout
   * @param {Function} testFn - Test function
   * @param {number} timeout - Timeout in ms
   * @returns {Promise} Test result
   */
  async runWithTimeout(testFn, timeout) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Test timeout after ${timeout}ms`));
      }, timeout);

      try {
        const result = await testFn();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Calculate delay with exponential backoff and jitter
   * @param {number} attempt - Current attempt number
   * @param {DeflakeConfig} config - Configuration
   * @returns {number} Delay in ms
   */
  calculateDelay(attempt, config) {
    const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, config.maxDelay);
    
    if (config.jitter) {
      // Add ±25% jitter
      const jitterRange = cappedDelay * 0.25;
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      return Math.max(0, cappedDelay + jitter);
    }
    
    return cappedDelay;
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Record test result for flakiness analysis
   * @param {string} testName - Test name
   * @param {Object} result - Test result
   */
  recordResult(testName, result) {
    if (!this.results.has(testName)) {
      this.results.set(testName, []);
    }
    
    const testResults = this.results.get(testName);
    testResults.push(result);
    
    // Keep only recent results to prevent memory bloat
    if (testResults.length > 100) {
      testResults.splice(0, testResults.length - 100);
    }
  }

  /**
   * Check if a test is flaky based on historical results
   * @param {string} testName - Test name
   * @returns {boolean} True if test is flaky
   */
  isFlaky(testName) {
    const testResults = this.results.get(testName);
    if (!testResults || testResults.length < this.config.minRuns) {
      return false;
    }

    const recentResults = testResults.slice(-this.config.minRuns);
    const failureCount = recentResults.filter(r => !r.success).length;
    const failureRate = failureCount / recentResults.length;

    return failureRate > this.config.flakeThreshold;
  }

  /**
   * Mark a test as flaky
   * @param {string} testName - Test name
   */
  markAsFlaky(testName) {
    this.flakyTests.add(testName);
  }

  /**
   * Check if error should not be retried
   * @param {Error} error - Error to check
   * @returns {boolean} True if non-retryable
   */
  isNonRetryableError(error) {
    const nonRetryablePatterns = [
      /validation failed/i,
      /invalid input/i,
      /not found/i,
      /permission denied/i,
      /syntax error/i,
      /type error/i
    ];

    return nonRetryablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Get flakiness report for all tests
   * @returns {Object} Flakiness report
   */
  getFlakinessReport() {
    const report = {
      totalTests: this.results.size,
      flakyTests: Array.from(this.flakyTests),
      testStats: {},
      summary: {
        totalRuns: 0,
        totalFailures: 0,
        overallFailureRate: 0
      }
    };

    let totalRuns = 0;
    let totalFailures = 0;

    for (const [testName, results] of this.results.entries()) {
      const recentResults = results.slice(-this.config.minRuns);
      const failureCount = recentResults.filter(r => !r.success).length;
      const failureRate = recentResults.length > 0 ? failureCount / recentResults.length : 0;
      
      report.testStats[testName] = {
        totalRuns: results.length,
        recentRuns: recentResults.length,
        failures: failureCount,
        failureRate,
        isFlaky: this.isFlaky(testName),
        avgDuration: results.reduce((sum, r) => sum + (r.duration || 0), 0) / results.length
      };

      totalRuns += results.length;
      totalFailures += failureCount;
    }

    report.summary.totalRuns = totalRuns;
    report.summary.totalFailures = totalFailures;
    report.summary.overallFailureRate = totalRuns > 0 ? totalFailures / totalRuns : 0;

    return report;
  }

  /**
   * Reset all tracking data
   */
  reset() {
    this.results.clear();
    this.flakyTests.clear();
  }

  /**
   * Generate deterministic test data
   * @param {string} seed - Seed for deterministic generation
   * @param {Object} schema - Data schema
   * @returns {Object} Generated test data
   */
  generateDeterministicData(seed, schema) {
    // Simple deterministic generator based on seed
    const rng = this.createSeededRNG(seed);
    
    return this.generateFromSchema(schema, rng);
  }

  /**
   * Create seeded random number generator
   * @param {string} seed - Seed string
   * @returns {Function} RNG function
   */
  createSeededRNG(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return () => {
      hash = (hash * 9301 + 49297) % 233280;
      return hash / 233280;
    };
  }

  /**
   * Generate data from schema using RNG
   * @param {Object} schema - Data schema
   * @param {Function} rng - Random number generator
   * @returns {Object} Generated data
   */
  generateFromSchema(schema, rng) {
    const result = {};
    
    for (const [key, type] of Object.entries(schema)) {
      switch (type) {
        case 'string':
          result[key] = `test_${Math.floor(rng() * 10000)}`;
          break;
        case 'number':
          result[key] = Math.floor(rng() * 1000);
          break;
        case 'boolean':
          result[key] = rng() > 0.5;
          break;
        case 'array':
          result[key] = Array.from({ length: Math.floor(rng() * 5) + 1 }, () => 
            Math.floor(rng() * 100)
          );
          break;
        default:
          result[key] = null;
      }
    }
    
    return result;
  }

  /**
   * Create test isolation context
   * @param {Object} options - Isolation options
   * @returns {Object} Isolation context
   */
  createIsolationContext(options = {}) {
    const context = {
      id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startTime: performance.now(),
      cleanup: [],
      mocks: new Map(),
      ...options
    };

    // Add cleanup function
    context.addCleanup = (cleanupFn) => {
      context.cleanup.push(cleanupFn);
    };

    // Add mock
    context.addMock = (name, mockFn) => {
      context.mocks.set(name, mockFn);
    };

    // Get mock
    context.getMock = (name) => {
      return context.mocks.get(name);
    };

    return context;
  }

  /**
   * Cleanup isolation context
   * @param {Object} context - Isolation context
   */
  async cleanupIsolationContext(context) {
    for (const cleanupFn of context.cleanup) {
      try {
        await cleanupFn();
      } catch (error) {
        console.warn(`Cleanup failed: ${error.message}`);
      }
    }
  }
}

/**
 * Jest integration helper
 */
export class JestDeflakeIntegration {
  constructor(harness = new DeflakeHarness()) {
    this.harness = harness;
  }

  /**
   * Wrap Jest test with deflake functionality
   * @param {string} testName - Test name
   * @param {Function} testFn - Test function
   * @param {Object} options - Test options
   */
  async test(testName, testFn, options = {}) {
    const isolationContext = this.harness.createIsolationContext();
    
    try {
      const result = await this.harness.runWithRetry(testName, async () => {
        return await testFn(isolationContext);
      }, options);

      if (!result.success) {
        throw new Error(`Test failed after ${result.attempts} attempts: ${result.error.message}`);
      }

      return result.result;
    } finally {
      await this.harness.cleanupIsolationContext(isolationContext);
    }
  }

  /**
   * Get flakiness report
   * @returns {Object} Flakiness report
   */
  getReport() {
    return this.harness.getFlakinessReport();
  }
}

// Default instance for easy import
export const deflake = new DeflakeHarness();
export const jestDeflake = new JestDeflakeIntegration();

// Export utilities (classes already exported above)
