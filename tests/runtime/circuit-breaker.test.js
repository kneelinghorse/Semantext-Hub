/**
 * Circuit Breaker Tests
 * 
 * Tests for the circuit breaker implementation.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  CircuitBreaker,
  CircuitBreakerManager,
  CircuitBreakerMetrics,
  CIRCUIT_STATES,
  DEFAULT_CONFIG,
  createCircuitBreaker,
  createCircuitBreakerManager,
  withCircuitBreaker
} from '../../packages/runtime/runtime/circuit-breaker.js';
import { CircuitBreakerError } from '../../packages/runtime/runtime/error-handler.js';

describe('Circuit Breaker', () => {
  let circuitBreaker;

  beforeEach(() => {
    circuitBreaker = createCircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
      enableLogging: false,
      enableMetrics: true
    });
  });

  afterEach(() => {
    circuitBreaker.reset();
  });

  describe('Circuit Breaker States', () => {
    test('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CIRCUIT_STATES.CLOSED);
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    test('should transition to OPEN state after failure threshold', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Execute failing function multiple times
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState()).toBe(CIRCUIT_STATES.OPEN);
      expect(circuitBreaker.canExecute()).toBe(false);
      expect(failingFn).toHaveBeenCalledTimes(3);
    });

    test('should transition to HALF_OPEN state after timeout', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState()).toBe(CIRCUIT_STATES.OPEN);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Next execution should transition to half-open
      const successFn = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(successFn);

      expect(circuitBreaker.getState()).toBe(CIRCUIT_STATES.HALF_OPEN);
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    test('should transition to CLOSED state after success threshold in half-open', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      // Wait for timeout and transition to half-open
      await new Promise(resolve => setTimeout(resolve, 1100));
      await circuitBreaker.execute(successFn);

      expect(circuitBreaker.getState()).toBe(CIRCUIT_STATES.HALF_OPEN);

      // Execute successful function to reach success threshold
      await circuitBreaker.execute(successFn);

      expect(circuitBreaker.getState()).toBe(CIRCUIT_STATES.CLOSED);
      expect(circuitBreaker.canExecute()).toBe(true);
    });
  });

  describe('Circuit Breaker Execution', () => {
    test('should execute successful function in CLOSED state', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      const result = await circuitBreaker.execute(successFn);

      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState()).toBe(CIRCUIT_STATES.CLOSED);
    });

    test('should throw error when circuit is OPEN', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState()).toBe(CIRCUIT_STATES.OPEN);

      // Try to execute function when circuit is open
      await expect(circuitBreaker.execute(failingFn)).rejects.toThrow(CircuitBreakerError);
      expect(failingFn).toHaveBeenCalledTimes(3); // Should not execute again
    });

    test('should execute function in HALF_OPEN state', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      // Wait for timeout and transition to half-open
      await new Promise(resolve => setTimeout(resolve, 1100));
      const result = await circuitBreaker.execute(successFn);

      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState()).toBe(CIRCUIT_STATES.HALF_OPEN);
    });

    test('should reset failure count on successful execution', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Execute failing function twice
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState()).toBe(CIRCUIT_STATES.CLOSED);

      // Execute successful function
      await circuitBreaker.execute(successFn);

      expect(circuitBreaker.getState()).toBe(CIRCUIT_STATES.CLOSED);
      expect(circuitBreaker.getStatus().failureCount).toBe(0);
    });
  });

  describe('Circuit Breaker Metrics', () => {
    test('should track successful requests', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(successFn);

      const metrics = circuitBreaker.metrics.getSummary();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.successRate).toBe(1);
    });

    test('should track failed requests', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      try {
        await circuitBreaker.execute(failingFn);
      } catch (error) {
        // Expected to fail
      }

      const metrics = circuitBreaker.metrics.getSummary();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.successRate).toBe(0);
    });

    test('should track circuit opens and closes', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      let metrics = circuitBreaker.metrics.getSummary();
      expect(metrics.circuitOpens).toBe(1);
      expect(metrics.circuitCloses).toBe(0);

      // Wait for timeout and close the circuit
      await new Promise(resolve => setTimeout(resolve, 1100));
      await circuitBreaker.execute(successFn);
      await circuitBreaker.execute(successFn);

      metrics = circuitBreaker.metrics.getSummary();
      expect(metrics.circuitOpens).toBe(1);
      expect(metrics.circuitCloses).toBe(1);
    });

    test('should reset metrics', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(successFn);

      let metrics = circuitBreaker.metrics.getSummary();
      expect(metrics.totalRequests).toBe(1);

      circuitBreaker.metrics.reset();
      metrics = circuitBreaker.metrics.getSummary();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(0);
    });
  });

  describe('Circuit Breaker Status', () => {
    test('should return correct status', async () => {
      const status = circuitBreaker.getStatus();
      
      expect(status.state).toBe(CIRCUIT_STATES.CLOSED);
      expect(status.failureCount).toBe(0);
      expect(status.successCount).toBe(0);
      expect(status.lastFailureTime).toBeNull();
      expect(status.nextAttemptTime).toBeNull();
      expect(status.canExecute).toBe(true);
      expect(status.metrics).toBeDefined();
    });

    test('should return health status', () => {
      const health = circuitBreaker.getHealth();
      
      expect(health.status).toBe('healthy');
      expect(health.state).toBe(CIRCUIT_STATES.CLOSED);
      expect(health.canExecute).toBe(true);
      expect(health.failureRate).toBe(0);
      expect(health.recentFailures).toBe(0);
      expect(health.lastFailure).toBeNull();
    });

    test('should return degraded health when circuit is open', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      const health = circuitBreaker.getHealth();
      
      expect(health.status).toBe('degraded');
      expect(health.state).toBe(CIRCUIT_STATES.OPEN);
      expect(health.canExecute).toBe(false);
      expect(health.failureRate).toBeGreaterThan(0);
      expect(health.recentFailures).toBeGreaterThan(0);
      expect(health.lastFailure).toBeDefined();
    });
  });

  describe('Circuit Breaker History', () => {
    test('should track request history', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      await circuitBreaker.execute(successFn);
      
      try {
        await circuitBreaker.execute(failingFn);
      } catch (error) {
        // Expected to fail
      }

      const history = circuitBreaker.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].success).toBe(true);
      expect(history[1].success).toBe(false);
    });

    test('should track recent failures', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Execute failing function multiple times
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      const recentFailures = circuitBreaker.getRecentFailures();
      expect(recentFailures).toHaveLength(3);
      expect(recentFailures.every(failure => !failure.success)).toBe(true);
    });

    test('should limit history size', async () => {
      const successFn = jest.fn().mockResolvedValue('success');

      // Execute more requests than max history size
      for (let i = 0; i < 1500; i++) {
        await circuitBreaker.execute(successFn);
      }

      const history = circuitBreaker.getHistory();
      expect(history.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('Circuit Breaker Reset', () => {
    test('should reset circuit breaker to initial state', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState()).toBe(CIRCUIT_STATES.OPEN);

      // Reset circuit breaker
      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe(CIRCUIT_STATES.CLOSED);
      expect(circuitBreaker.getStatus().failureCount).toBe(0);
      expect(circuitBreaker.getStatus().successCount).toBe(0);
      expect(circuitBreaker.canExecute()).toBe(true);
    });
  });

  describe('Circuit Breaker Events', () => {
    test('should emit state change events', async () => {
      const stateChangeSpy = jest.fn();
      circuitBreaker.on('stateChange', stateChangeSpy);

      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(stateChangeSpy).toHaveBeenCalledWith({
        from: CIRCUIT_STATES.CLOSED,
        to: CIRCUIT_STATES.OPEN
      });
    });

    test('should emit success events', async () => {
      const successSpy = jest.fn();
      circuitBreaker.on('success', successSpy);

      const successFn = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(successFn);

      expect(successSpy).toHaveBeenCalledWith({
        requestId: expect.any(String),
        duration: expect.any(Number)
      });
    });

    test('should emit failure events', async () => {
      const failureSpy = jest.fn();
      circuitBreaker.on('failure', failureSpy);

      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      try {
        await circuitBreaker.execute(failingFn);
      } catch (error) {
        // Expected to fail
      }

      expect(failureSpy).toHaveBeenCalledWith({
        requestId: expect.any(String),
        duration: expect.any(Number),
        error: expect.any(Error)
      });
    });
  });
});

describe('Circuit Breaker Manager', () => {
  let manager;

  beforeEach(() => {
    manager = createCircuitBreakerManager({
      failureThreshold: 2,
      timeout: 500,
      enableLogging: false
    });
  });

  afterEach(() => {
    manager.clear();
  });

  describe('Circuit Breaker Management', () => {
    test('should get or create circuit breaker for service', () => {
      const breaker1 = manager.getBreaker('service1');
      const breaker2 = manager.getBreaker('service1');
      const breaker3 = manager.getBreaker('service2');

      expect(breaker1).toBe(breaker2); // Same instance
      expect(breaker1).not.toBe(breaker3); // Different instance
      expect(breaker1).toBeInstanceOf(CircuitBreaker);
      expect(breaker3).toBeInstanceOf(CircuitBreaker);
    });

    test('should execute function with circuit breaker protection', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      const result = await manager.execute('service1', successFn);

      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalledTimes(1);
    });

    test('should handle different services independently', async () => {
      const failingFn1 = jest.fn().mockRejectedValue(new Error('Service 1 unavailable'));
      const failingFn2 = jest.fn().mockRejectedValue(new Error('Service 2 unavailable'));

      // Open circuit for service1
      for (let i = 0; i < 2; i++) {
        try {
          await manager.execute('service1', failingFn1);
        } catch (error) {
          // Expected to fail
        }
      }

      // Service1 circuit should be open
      const breaker1 = manager.getBreaker('service1');
      expect(breaker1.getState()).toBe(CIRCUIT_STATES.OPEN);

      // Service2 circuit should still be closed
      const breaker2 = manager.getBreaker('service2');
      expect(breaker2.getState()).toBe(CIRCUIT_STATES.CLOSED);

      // Service2 should still execute
      await expect(manager.execute('service2', failingFn2)).rejects.toThrow('Service 2 unavailable');
    });
  });

  describe('Manager Status and Health', () => {
    test('should get status of all circuit breakers', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Open circuit for service1
      for (let i = 0; i < 2; i++) {
        try {
          await manager.execute('service1', failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      const allStatus = manager.getAllStatus();
      
      expect(allStatus.service1).toBeDefined();
      expect(allStatus.service1.state).toBe(CIRCUIT_STATES.OPEN);
      expect(allStatus.service1.canExecute).toBe(false);
    });

    test('should get health of all circuit breakers', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Open circuit for service1
      for (let i = 0; i < 2; i++) {
        try {
          await manager.execute('service1', failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      const allHealth = manager.getAllHealth();
      
      expect(allHealth.service1).toBeDefined();
      expect(allHealth.service1.status).toBe('degraded');
      expect(allHealth.service1.state).toBe(CIRCUIT_STATES.OPEN);
    });
  });

  describe('Manager Operations', () => {
    test('should reset all circuit breakers', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Open circuit for service1
      for (let i = 0; i < 2; i++) {
        try {
          await manager.execute('service1', failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      const breaker1 = manager.getBreaker('service1');
      expect(breaker1.getState()).toBe(CIRCUIT_STATES.OPEN);

      // Reset all circuit breakers
      manager.resetAll();

      expect(breaker1.getState()).toBe(CIRCUIT_STATES.CLOSED);
    });

    test('should remove circuit breaker', () => {
      const breaker1 = manager.getBreaker('service1');
      expect(breaker1).toBeDefined();

      manager.removeBreaker('service1');

      const breaker2 = manager.getBreaker('service1');
      expect(breaker2).not.toBe(breaker1); // New instance created
    });

    test('should clear all circuit breakers', () => {
      manager.getBreaker('service1');
      manager.getBreaker('service2');

      expect(manager.getAllStatus()).toHaveProperty('service1');
      expect(manager.getAllStatus()).toHaveProperty('service2');

      manager.clear();

      expect(manager.getAllStatus()).toEqual({});
    });
  });

  describe('Manager Events', () => {
    test('should emit state change events', async () => {
      const stateChangeSpy = jest.fn();
      manager.on('stateChange', stateChangeSpy);

      const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await manager.execute('service1', failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(stateChangeSpy).toHaveBeenCalledWith({
        serviceName: 'service1',
        from: CIRCUIT_STATES.CLOSED,
        to: CIRCUIT_STATES.OPEN
      });
    });
  });
});

describe('Convenience Functions', () => {
  test('should execute with circuit breaker using convenience function', async () => {
    const successFn = jest.fn().mockResolvedValue('success');
    const result = await withCircuitBreaker('test-service', successFn, {
      failureThreshold: 2,
      timeout: 500
    });

    expect(result).toBe('success');
    expect(successFn).toHaveBeenCalledTimes(1);
  });

  test('should handle errors with convenience function', async () => {
    const failingFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

    await expect(withCircuitBreaker('test-service', failingFn, {
      failureThreshold: 1,
      timeout: 100
    })).rejects.toThrow('Service unavailable');
  });
});

describe('Circuit Breaker Constants', () => {
  test('should export circuit breaker states', () => {
    expect(CIRCUIT_STATES.CLOSED).toBe('closed');
    expect(CIRCUIT_STATES.OPEN).toBe('open');
    expect(CIRCUIT_STATES.HALF_OPEN).toBe('half_open');
  });

  test('should export default configuration', () => {
    expect(DEFAULT_CONFIG.failureThreshold).toBe(5);
    expect(DEFAULT_CONFIG.successThreshold).toBe(3);
    expect(DEFAULT_CONFIG.timeout).toBe(60000);
    expect(DEFAULT_CONFIG.monitoringPeriod).toBe(10000);
  });
});
