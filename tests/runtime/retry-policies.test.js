/**
 * Retry Policies Tests
 * 
 * Tests for the retry policies implementation.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  RetryPolicy,
  RetryPolicyManager,
  RetryMetrics,
  RETRY_POLICIES,
  DEFAULT_CONFIG,
  PREDEFINED_POLICIES,
  createRetryPolicy,
  createRetryPolicyManager,
  withRetryPolicy,
  RetryUtils
} from '../../packages/runtime/runtime/retry-policies.js';
import { RetryError, TimeoutError } from '../../packages/runtime/runtime/error-handler.js';

describe('Retry Policy', () => {
  let retryPolicy;

  beforeEach(() => {
    retryPolicy = createRetryPolicy({
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 2,
      jitter: false,
      policy: RETRY_POLICIES.EXPONENTIAL_BACKOFF,
      enableLogging: false,
      enableMetrics: true
    });
  });

  afterEach(() => {
    retryPolicy.resetMetrics();
  });

  describe('Retry Policy Execution', () => {
    test('should execute successful function without retries', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      const result = await retryPolicy.execute(successFn);

      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalledTimes(1);
    });

    test('should retry failed function and eventually succeed', async () => {
      const failingFn = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue('success');

      const result = await retryPolicy.execute(failingFn);

      expect(result).toBe('success');
      expect(failingFn).toHaveBeenCalledTimes(3);
    });

    test('should throw RetryError after max retries exhausted', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Permanent failure'));

      await expect(retryPolicy.execute(failingFn)).rejects.toThrow(RetryError);
      expect(failingFn).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    test('should not retry non-retryable errors', async () => {
      const authError = new Error('Authentication failed');
      authError.name = 'AuthError';
      
      const failingFn = jest.fn().mockRejectedValue(authError);

      await expect(retryPolicy.execute(failingFn)).rejects.toThrow('Authentication failed');
      expect(failingFn).toHaveBeenCalledTimes(1); // No retries
    });

    test('should respect retryable flag on errors', async () => {
      const retryableError = new Error('Retryable error');
      retryableError.retryable = true;
      
      const nonRetryableError = new Error('Non-retryable error');
      nonRetryableError.retryable = false;

      const retryableFn = jest.fn().mockRejectedValue(retryableError);
      const nonRetryableFn = jest.fn().mockRejectedValue(nonRetryableError);

      await expect(retryPolicy.execute(retryableFn)).rejects.toThrow(RetryError);
      expect(retryableFn).toHaveBeenCalledTimes(4); // Retried

      await expect(retryPolicy.execute(nonRetryableFn)).rejects.toThrow('Non-retryable error');
      expect(nonRetryableFn).toHaveBeenCalledTimes(1); // Not retried
    });
  });

  describe('Retry Delay Calculation', () => {
    test('should calculate exponential backoff delay', () => {
      const delay1 = retryPolicy.calculateDelay(0, retryPolicy.config);
      const delay2 = retryPolicy.calculateDelay(1, retryPolicy.config);
      const delay3 = retryPolicy.calculateDelay(2, retryPolicy.config);

      expect(delay1).toBe(100); // baseDelay
      expect(delay2).toBe(200); // baseDelay * backoffMultiplier
      expect(delay3).toBe(400); // baseDelay * backoffMultiplier^2
    });

    test('should respect max delay limit', () => {
      const config = { ...retryPolicy.config, maxDelay: 150 };
      const delay = retryPolicy.calculateDelay(5, config);

      expect(delay).toBeLessThanOrEqual(150);
    });

    test('should calculate linear backoff delay', () => {
      const config = { ...retryPolicy.config, policy: RETRY_POLICIES.LINEAR_BACKOFF };
      const delay1 = retryPolicy.calculateDelay(0, config);
      const delay2 = retryPolicy.calculateDelay(1, config);
      const delay3 = retryPolicy.calculateDelay(2, config);

      expect(delay1).toBe(100); // baseDelay
      expect(delay2).toBe(200); // baseDelay * 2
      expect(delay3).toBe(300); // baseDelay * 3
    });

    test('should calculate fixed delay', () => {
      const config = { ...retryPolicy.config, policy: RETRY_POLICIES.FIXED_DELAY };
      const delay1 = retryPolicy.calculateDelay(0, config);
      const delay2 = retryPolicy.calculateDelay(1, config);
      const delay3 = retryPolicy.calculateDelay(2, config);

      expect(delay1).toBe(100); // baseDelay
      expect(delay2).toBe(100); // baseDelay
      expect(delay3).toBe(100); // baseDelay
    });

    test('should calculate immediate delay', () => {
      const config = { ...retryPolicy.config, policy: RETRY_POLICIES.IMMEDIATE };
      const delay1 = retryPolicy.calculateDelay(0, config);
      const delay2 = retryPolicy.calculateDelay(1, config);

      expect(delay1).toBe(0);
      expect(delay2).toBe(0);
    });

    test('should add jitter when enabled', () => {
      const config = { ...retryPolicy.config, jitter: true, jitterFactor: 0.1 };
      const delays = [];

      // Calculate multiple delays to test jitter
      for (let i = 0; i < 10; i++) {
        delays.push(retryPolicy.calculateDelay(1, config));
      }

      // All delays should be different due to jitter
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe('Retry Policy Metrics', () => {
    test('should track successful attempts', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      await retryPolicy.execute(successFn);

      const metrics = retryPolicy.metrics.getSummary();
      expect(metrics.totalAttempts).toBe(1);
      expect(metrics.successfulAttempts).toBe(1);
      expect(metrics.failedAttempts).toBe(0);
      expect(metrics.successRate).toBe(1);
    });

    test('should track failed attempts', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Permanent failure'));

      try {
        await retryPolicy.execute(failingFn);
      } catch (error) {
        // Expected to fail
      }

      const metrics = retryPolicy.metrics.getSummary();
      expect(metrics.totalAttempts).toBe(4); // Initial + 3 retries
      expect(metrics.successfulAttempts).toBe(0);
      expect(metrics.failedAttempts).toBe(4);
      expect(metrics.successRate).toBe(0);
    });

    test('should track retry attempts', async () => {
      const failingFn = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue('success');

      await retryPolicy.execute(failingFn);

      const metrics = retryPolicy.metrics.getSummary();
      expect(metrics.retryAttempts).toBe(2);
      expect(metrics.totalRetryTime).toBeGreaterThan(0);
    });

    test('should calculate average retry time', async () => {
      const failingFn = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue('success');

      await retryPolicy.execute(failingFn);

      const metrics = retryPolicy.metrics.getSummary();
      expect(metrics.averageRetryTime).toBeGreaterThan(0);
    });

    test('should reset metrics', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      await retryPolicy.execute(successFn);

      let metrics = retryPolicy.metrics.getSummary();
      expect(metrics.totalAttempts).toBe(1);

      retryPolicy.resetMetrics();
      metrics = retryPolicy.metrics.getSummary();
      expect(metrics.totalAttempts).toBe(0);
      expect(metrics.successfulAttempts).toBe(0);
      expect(metrics.failedAttempts).toBe(0);
    });
  });

  describe('Retry Policy Status', () => {
    test('should return policy status', () => {
      const status = retryPolicy.getStatus();
      
      expect(status.config).toBeDefined();
      expect(status.metrics).toBeDefined();
      expect(status.config.maxRetries).toBe(3);
      expect(status.config.baseDelay).toBe(100);
    });
  });

  describe('Retry Policy Events', () => {
    test('should emit retry events', async () => {
      const retrySpy = jest.fn();
      retryPolicy.on('retry', retrySpy);

      const failingFn = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue('success');

      await retryPolicy.execute(failingFn);

      expect(retrySpy).toHaveBeenCalledWith({
        attempt: 1,
        error: expect.any(Error),
        delay: expect.any(Number)
      });
    });

    test('should emit success events', async () => {
      const successSpy = jest.fn();
      retryPolicy.on('success', successSpy);

      const successFn = jest.fn().mockResolvedValue('success');
      await retryPolicy.execute(successFn);

      expect(successSpy).toHaveBeenCalledWith({
        attempt: 1,
        retryTime: expect.any(Number)
      });
    });
  });
});

describe('Retry Policy Manager', () => {
  let manager;

  beforeEach(() => {
    manager = createRetryPolicyManager({
      maxRetries: 2,
      baseDelay: 50,
      enableLogging: false
    });
  });

  afterEach(() => {
    manager.clear();
  });

  describe('Policy Management', () => {
    test('should get or create retry policy', () => {
      const policy1 = manager.getPolicy('policy1');
      const policy2 = manager.getPolicy('policy1');
      const policy3 = manager.getPolicy('policy2');

      expect(policy1).toBe(policy2); // Same instance
      expect(policy1).not.toBe(policy3); // Different instance
      expect(policy1).toBeInstanceOf(RetryPolicy);
      expect(policy3).toBeInstanceOf(RetryPolicy);
    });

    test('should execute function with retry policy', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      const result = await manager.execute('policy1', successFn);

      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalledTimes(1);
    });

    test('should handle different policies independently', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Permanent failure'));

      // Policy1 should fail after retries
      await expect(manager.execute('policy1', failingFn)).rejects.toThrow(RetryError);

      // Policy2 should also fail independently
      await expect(manager.execute('policy2', failingFn)).rejects.toThrow(RetryError);
    });
  });

  describe('Manager Status', () => {
    test('should get status of all policies', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Permanent failure'));

      try {
        await manager.execute('policy1', failingFn);
      } catch (error) {
        // Expected to fail
      }

      const allStatus = manager.getAllStatus();
      
      expect(allStatus.policy1).toBeDefined();
      expect(allStatus.policy1.config).toBeDefined();
      expect(allStatus.policy1.metrics).toBeDefined();
    });
  });

  describe('Manager Operations', () => {
    test('should reset all policy metrics', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      await manager.execute('policy1', successFn);

      let allStatus = manager.getAllStatus();
      expect(allStatus.policy1.metrics.totalAttempts).toBe(1);

      manager.resetAllMetrics();

      allStatus = manager.getAllStatus();
      expect(allStatus.policy1.metrics.totalAttempts).toBe(0);
    });

    test('should remove retry policy', () => {
      const policy1 = manager.getPolicy('policy1');
      expect(policy1).toBeDefined();

      manager.removePolicy('policy1');

      const policy2 = manager.getPolicy('policy1');
      expect(policy2).not.toBe(policy1); // New instance created
    });

    test('should clear all retry policies', () => {
      manager.getPolicy('policy1');
      manager.getPolicy('policy2');

      expect(manager.getAllStatus()).toHaveProperty('policy1');
      expect(manager.getAllStatus()).toHaveProperty('policy2');

      manager.clear();

      expect(manager.getAllStatus()).toEqual({});
    });
  });

  describe('Manager Events', () => {
    test('should emit retry events', async () => {
      const retrySpy = jest.fn();
      manager.on('retry', retrySpy);

      const failingFn = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue('success');

      await manager.execute('policy1', failingFn);

      expect(retrySpy).toHaveBeenCalledWith({
        policyName: 'policy1',
        attempt: 1,
        error: expect.any(Error),
        delay: expect.any(Number)
      });
    });

    test('should emit success events', async () => {
      const successSpy = jest.fn();
      manager.on('success', successSpy);

      const successFn = jest.fn().mockResolvedValue('success');
      await manager.execute('policy1', successFn);

      expect(successSpy).toHaveBeenCalledWith({
        policyName: 'policy1',
        attempt: 1,
        retryTime: expect.any(Number)
      });
    });
  });
});

describe('Predefined Policies', () => {
  test('should have correct FAST policy configuration', () => {
    expect(PREDEFINED_POLICIES.FAST.maxRetries).toBe(2);
    expect(PREDEFINED_POLICIES.FAST.baseDelay).toBe(100);
    expect(PREDEFINED_POLICIES.FAST.maxDelay).toBe(1000);
    expect(PREDEFINED_POLICIES.FAST.policy).toBe(RETRY_POLICIES.EXPONENTIAL_BACKOFF);
  });

  test('should have correct STANDARD policy configuration', () => {
    expect(PREDEFINED_POLICIES.STANDARD.maxRetries).toBe(3);
    expect(PREDEFINED_POLICIES.STANDARD.baseDelay).toBe(1000);
    expect(PREDEFINED_POLICIES.STANDARD.maxDelay).toBe(10000);
    expect(PREDEFINED_POLICIES.STANDARD.policy).toBe(RETRY_POLICIES.EXPONENTIAL_BACKOFF);
  });

  test('should have correct SLOW policy configuration', () => {
    expect(PREDEFINED_POLICIES.SLOW.maxRetries).toBe(5);
    expect(PREDEFINED_POLICIES.SLOW.baseDelay).toBe(2000);
    expect(PREDEFINED_POLICIES.SLOW.maxDelay).toBe(30000);
    expect(PREDEFINED_POLICIES.SLOW.policy).toBe(RETRY_POLICIES.EXPONENTIAL_BACKOFF);
  });

  test('should have correct IMMEDIATE policy configuration', () => {
    expect(PREDEFINED_POLICIES.IMMEDIATE.maxRetries).toBe(3);
    expect(PREDEFINED_POLICIES.IMMEDIATE.baseDelay).toBe(0);
    expect(PREDEFINED_POLICIES.IMMEDIATE.maxDelay).toBe(0);
    expect(PREDEFINED_POLICIES.IMMEDIATE.policy).toBe(RETRY_POLICIES.IMMEDIATE);
  });

  test('should have correct LINEAR policy configuration', () => {
    expect(PREDEFINED_POLICIES.LINEAR.maxRetries).toBe(3);
    expect(PREDEFINED_POLICIES.LINEAR.baseDelay).toBe(1000);
    expect(PREDEFINED_POLICIES.LINEAR.maxDelay).toBe(10000);
    expect(PREDEFINED_POLICIES.LINEAR.policy).toBe(RETRY_POLICIES.LINEAR_BACKOFF);
  });
});

describe('Convenience Functions', () => {
  test('should execute with retry policy using convenience function', async () => {
    const successFn = jest.fn().mockResolvedValue('success');
    const result = await withRetryPolicy('test-policy', successFn, {
      maxRetries: 2,
      baseDelay: 50
    });

    expect(result).toBe('success');
    expect(successFn).toHaveBeenCalledTimes(1);
  });

  test('should handle errors with convenience function', async () => {
    const failingFn = jest.fn().mockRejectedValue(new Error('Permanent failure'));

    await expect(withRetryPolicy('test-policy', failingFn, {
      maxRetries: 1,
      baseDelay: 10
    })).rejects.toThrow(RetryError);
  });
});

describe('Retry Utils', () => {
  test('should create retry policy from predefined policy', () => {
    const config = RetryUtils.fromPredefined('FAST', { maxRetries: 5 });
    
    expect(config.maxRetries).toBe(5); // Override
    expect(config.baseDelay).toBe(100); // From FAST policy
    expect(config.policy).toBe(RETRY_POLICIES.EXPONENTIAL_BACKOFF);
  });

  test('should throw error for unknown predefined policy', () => {
    expect(() => {
      RetryUtils.fromPredefined('UNKNOWN');
    }).toThrow('Unknown predefined policy: UNKNOWN');
  });

  test('should calculate total retry time', () => {
    const config = {
      baseDelay: 100,
      backoffMultiplier: 2,
      maxDelay: 1000,
      policy: RETRY_POLICIES.EXPONENTIAL_BACKOFF
    };

    const totalTime = RetryUtils.calculateTotalRetryTime(3, config);
    
    // Should be approximately 100 + 200 + 400 = 700ms
    expect(totalTime).toBeGreaterThan(600);
    expect(totalTime).toBeLessThan(800);
  });

  test('should calculate delay for specific attempt', () => {
    const config = {
      baseDelay: 100,
      backoffMultiplier: 2,
      maxDelay: 1000,
      policy: RETRY_POLICIES.EXPONENTIAL_BACKOFF
    };

    const delay0 = RetryUtils.calculateDelay(0, config);
    const delay1 = RetryUtils.calculateDelay(1, config);
    const delay2 = RetryUtils.calculateDelay(2, config);

    expect(delay0).toBe(100);
    expect(delay1).toBe(200);
    expect(delay2).toBe(400);
  });

  test('should check if error should be retried', () => {
    const retryableError = new Error('Network error');
    const nonRetryableError = new Error('Authentication failed');
    nonRetryableError.name = 'AuthError';

    expect(RetryUtils.shouldRetry(retryableError)).toBe(true);
    expect(RetryUtils.shouldRetry(nonRetryableError)).toBe(false);
  });
});

describe('Retry Policy Constants', () => {
  test('should export retry policy types', () => {
    expect(RETRY_POLICIES.EXPONENTIAL_BACKOFF).toBe('exponential_backoff');
    expect(RETRY_POLICIES.LINEAR_BACKOFF).toBe('linear_backoff');
    expect(RETRY_POLICIES.FIXED_DELAY).toBe('fixed_delay');
    expect(RETRY_POLICIES.IMMEDIATE).toBe('immediate');
  });

  test('should export default configuration', () => {
    expect(DEFAULT_CONFIG.maxRetries).toBe(3);
    expect(DEFAULT_CONFIG.baseDelay).toBe(1000);
    expect(DEFAULT_CONFIG.maxDelay).toBe(30000);
    expect(DEFAULT_CONFIG.backoffMultiplier).toBe(2);
    expect(DEFAULT_CONFIG.policy).toBe(RETRY_POLICIES.EXPONENTIAL_BACKOFF);
  });
});
