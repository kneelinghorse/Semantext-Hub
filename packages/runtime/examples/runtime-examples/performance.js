#!/usr/bin/env node

/**
 * Performance Example
 * 
 * This example demonstrates performance optimization techniques including:
 * - Caching strategies
 * - Connection pooling
 * - Retry policies
 * - Circuit breakers
 * - Performance monitoring
 * - Metrics collection
 */

import { createCircuitBreaker, CIRCUIT_STATES } from '../../runtime/circuit-breaker.js';
import { createRetryPolicy, RETRY_POLICIES } from '../../runtime/retry-policies.js';
import { createStructuredLogger, LOG_LEVELS } from '../../runtime/structured-logger.js';

async function performanceExample() {
  console.log('=== Performance Example ===\n');
  
  // Initialize performance components
  console.log('1. Initializing performance components...');
  
  const logger = createStructuredLogger({
    level: LOG_LEVELS.INFO,
    enableConsole: true,
    enableMetrics: true
  });
  
  const circuitBreaker = createCircuitBreaker({
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
    enableLogging: true,
    enableMetrics: true
  });
  
  const retryPolicy = createRetryPolicy({
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true,
    policy: RETRY_POLICIES.EXPONENTIAL_BACKOFF,
    enableLogging: true,
    enableMetrics: true
  });
  
  console.log('✓ Performance components initialized\n');
  
  // Caching demonstration
  console.log('2. Caching demonstration...');
  
  const cache = new Map();
  const cacheStats = {
    hits: 0,
    misses: 0,
    sets: 0
  };
  
  // Simple cache implementation
  function getCached(key) {
    if (cache.has(key)) {
      cacheStats.hits++;
      return cache.get(key);
    }
    cacheStats.misses++;
    return null;
  }
  
  function setCached(key, value, ttl = 60000) {
    cache.set(key, {
      value,
      expires: Date.now() + ttl
    });
    cacheStats.sets++;
  }
  
  // Simulate expensive operation
  async function expensiveOperation(key) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate 1s operation
    return `result-for-${key}`;
  }
  
  // Test caching
  const testKey = 'test-key';
  
  console.log('✓ Testing cache performance...');
  
  // First call - cache miss
  const start1 = Date.now();
  let result = getCached(testKey);
  if (!result) {
    result = await expensiveOperation(testKey);
    setCached(testKey, result);
  }
  const duration1 = Date.now() - start1;
  console.log(`  First call (cache miss): ${duration1}ms`);
  
  // Second call - cache hit
  const start2 = Date.now();
  result = getCached(testKey);
  if (!result) {
    result = await expensiveOperation(testKey);
    setCached(testKey, result);
  }
  const duration2 = Date.now() - start2;
  console.log(`  Second call (cache hit): ${duration2}ms`);
  
  console.log('✓ Cache performance:');
  console.log(`  Cache hits: ${cacheStats.hits}`);
  console.log(`  Cache misses: ${cacheStats.misses}`);
  console.log(`  Cache hit rate: ${(cacheStats.hits / (cacheStats.hits + cacheStats.misses) * 100).toFixed(2)}%`);
  console.log(`  Performance improvement: ${((duration1 - duration2) / duration1 * 100).toFixed(2)}%`);
  console.log('');
  
  // Connection pooling simulation
  console.log('3. Connection pooling simulation...');
  
  class ConnectionPool {
    constructor(maxConnections = 10) {
      this.maxConnections = maxConnections;
      this.connections = [];
      this.activeConnections = 0;
      this.waitingQueue = [];
    }
    
    async getConnection() {
      if (this.activeConnections < this.maxConnections) {
        this.activeConnections++;
        const connection = {
          id: `conn-${Date.now()}`,
          createdAt: Date.now()
        };
        this.connections.push(connection);
        return connection;
      }
      
      // Pool is full, wait for connection
      return new Promise((resolve) => {
        this.waitingQueue.push(resolve);
      });
    }
    
    releaseConnection(connection) {
      const index = this.connections.indexOf(connection);
      if (index > -1) {
        this.connections.splice(index, 1);
        this.activeConnections--;
        
        // Serve waiting request if any
        if (this.waitingQueue.length > 0) {
          const resolve = this.waitingQueue.shift();
          resolve(connection);
        }
      }
    }
    
    getStats() {
      return {
        maxConnections: this.maxConnections,
        activeConnections: this.activeConnections,
        availableConnections: this.maxConnections - this.activeConnections,
        waitingRequests: this.waitingQueue.length
      };
    }
  }
  
  const pool = new ConnectionPool(5);
  
  // Simulate concurrent requests
  const requests = [];
  for (let i = 0; i < 10; i++) {
    requests.push(async () => {
      const connection = await pool.getConnection();
      console.log(`  Request ${i + 1}: Got connection ${connection.id}`);
      
      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 500));
      
      pool.releaseConnection(connection);
      console.log(`  Request ${i + 1}: Released connection ${connection.id}`);
    });
  }
  
  console.log('✓ Testing connection pooling...');
  const poolStart = Date.now();
  await Promise.all(requests.map(req => req()));
  const poolDuration = Date.now() - poolStart;
  
  const poolStats = pool.getStats();
  console.log('✓ Connection pool performance:');
  console.log(`  Total duration: ${poolDuration}ms`);
  console.log(`  Max connections: ${poolStats.maxConnections}`);
  console.log(`  Active connections: ${poolStats.activeConnections}`);
  console.log(`  Available connections: ${poolStats.availableConnections}`);
  console.log(`  Waiting requests: ${poolStats.waitingRequests}`);
  console.log('');
  
  // Circuit breaker performance
  console.log('4. Circuit breaker performance...');
  
  let failureCount = 0;
  const totalRequests = 20;
  
  console.log('✓ Testing circuit breaker performance...');
  
  for (let i = 0; i < totalRequests; i++) {
    try {
      await circuitBreaker.execute(async () => {
        // Simulate failures for first 5 requests
        if (i < 5) {
          failureCount++;
          throw new Error(`Simulated failure ${i + 1}`);
        }
        
        // Simulate success for remaining requests
        await new Promise(resolve => setTimeout(resolve, 100));
        return `success-${i + 1}`;
      });
      
      console.log(`  Request ${i + 1}: Success`);
    } catch (error) {
      console.log(`  Request ${i + 1}: Failed - ${error.message}`);
    }
  }
  
  const circuitStats = circuitBreaker.getStatus();
  console.log('✓ Circuit breaker performance:');
  console.log(`  Total requests: ${totalRequests}`);
  console.log(`  Failures: ${failureCount}`);
  console.log(`  Circuit state: ${circuitStats.state}`);
  console.log(`  Can execute: ${circuitStats.canExecute}`);
  console.log(`  Failure count: ${circuitStats.failureCount}`);
  console.log(`  Success count: ${circuitStats.successCount}`);
  console.log('');
  
  // Retry policy performance
  console.log('5. Retry policy performance...');
  
  let retryAttempts = 0;
  const retryStart = Date.now();
  
  try {
    await retryPolicy.execute(async () => {
      retryAttempts++;
      console.log(`  Retry attempt ${retryAttempts}`);
      
      // Simulate failure for first 2 attempts
      if (retryAttempts < 3) {
        throw new Error(`Simulated retry failure ${retryAttempts}`);
      }
      
      return 'success';
    });
    
    console.log('✓ Retry policy succeeded');
  } catch (error) {
    console.log('⚠ Retry policy exhausted all retries');
  }
  
  const retryDuration = Date.now() - retryStart;
  const retryStats = retryPolicy.getStatus();
  
  console.log('✓ Retry policy performance:');
  console.log(`  Total attempts: ${retryAttempts}`);
  console.log(`  Total duration: ${retryDuration}ms`);
  console.log(`  Average delay: ${retryDuration / retryAttempts}ms`);
  console.log(`  Max retries: ${retryStats.config.maxRetries}`);
  console.log(`  Base delay: ${retryStats.config.baseDelay}ms`);
  console.log(`  Max delay: ${retryStats.config.maxDelay}ms`);
  console.log('');
  
  // Performance monitoring
  console.log('6. Performance monitoring...');
  
  const performanceMonitor = {
    measurements: [],
    
    startMeasurement(name) {
      return {
        name,
        startTime: Date.now(),
        startMemory: process.memoryUsage()
      };
    },
    
    endMeasurement(measurement) {
      const endTime = Date.now();
      const endMemory = process.memoryUsage();
      
      const result = {
        name: measurement.name,
        duration: endTime - measurement.startTime,
        memoryDelta: {
          rss: endMemory.rss - measurement.startMemory.rss,
          heapUsed: endMemory.heapUsed - measurement.startMemory.heapUsed,
          heapTotal: endMemory.heapTotal - measurement.startMemory.heapTotal,
          external: endMemory.external - measurement.startMemory.external
        }
      };
      
      this.measurements.push(result);
      return result;
    },
    
    getSummary() {
      const total = this.measurements.length;
      if (total === 0) return null;
      
      const avgDuration = this.measurements.reduce((sum, m) => sum + m.duration, 0) / total;
      const avgMemoryDelta = this.measurements.reduce((sum, m) => sum + m.memoryDelta.heapUsed, 0) / total;
      
      return {
        totalMeasurements: total,
        averageDuration: avgDuration,
        averageMemoryDelta: avgMemoryDelta,
        measurements: this.measurements
      };
    }
  };
  
  // Test performance monitoring
  console.log('✓ Testing performance monitoring...');
  
  const measurement1 = performanceMonitor.startMeasurement('operation-1');
  await new Promise(resolve => setTimeout(resolve, 200));
  const result1 = performanceMonitor.endMeasurement(measurement1);
  
  const measurement2 = performanceMonitor.startMeasurement('operation-2');
  await new Promise(resolve => setTimeout(resolve, 300));
  const result2 = performanceMonitor.endMeasurement(measurement2);
  
  console.log('✓ Performance monitoring results:');
  console.log(`  Operation 1: ${result1.duration}ms, ${result1.memoryDelta.heapUsed} bytes`);
  console.log(`  Operation 2: ${result2.duration}ms, ${result2.memoryDelta.heapUsed} bytes`);
  
  const summary = performanceMonitor.getSummary();
  console.log('✓ Performance summary:');
  console.log(`  Total measurements: ${summary.totalMeasurements}`);
  console.log(`  Average duration: ${summary.averageDuration.toFixed(2)}ms`);
  console.log(`  Average memory delta: ${summary.averageMemoryDelta.toFixed(2)} bytes`);
  console.log('');
  
  // Metrics collection
  console.log('7. Metrics collection...');
  
  const metrics = {
    requests: 0,
    errors: 0,
    responseTime: [],
    memoryUsage: [],
    
    recordRequest(duration) {
      this.requests++;
      this.responseTime.push(duration);
    },
    
    recordError() {
      this.errors++;
    },
    
    recordMemoryUsage() {
      const usage = process.memoryUsage();
      this.memoryUsage.push({
        timestamp: Date.now(),
        rss: usage.rss,
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
        external: usage.external
      });
    },
    
    getSummary() {
      const avgResponseTime = this.responseTime.length > 0 
        ? this.responseTime.reduce((sum, time) => sum + time, 0) / this.responseTime.length 
        : 0;
      
      const errorRate = this.requests > 0 ? (this.errors / this.requests) * 100 : 0;
      
      return {
        totalRequests: this.requests,
        totalErrors: this.errors,
        errorRate: errorRate,
        averageResponseTime: avgResponseTime,
        memorySamples: this.memoryUsage.length
      };
    }
  };
  
  // Simulate metrics collection
  console.log('✓ Simulating metrics collection...');
  
  for (let i = 0; i < 10; i++) {
    const start = Date.now();
    
    try {
      // Simulate request
      await new Promise(resolve => setTimeout(resolve, Math.random() * 200));
      
      const duration = Date.now() - start;
      metrics.recordRequest(duration);
      
      // Simulate occasional error
      if (Math.random() < 0.1) {
        metrics.recordError();
      }
      
      // Record memory usage
      metrics.recordMemoryUsage();
      
    } catch (error) {
      metrics.recordError();
    }
  }
  
  const metricsSummary = metrics.getSummary();
  console.log('✓ Metrics summary:');
  console.log(`  Total requests: ${metricsSummary.totalRequests}`);
  console.log(`  Total errors: ${metricsSummary.totalErrors}`);
  console.log(`  Error rate: ${metricsSummary.errorRate.toFixed(2)}%`);
  console.log(`  Average response time: ${metricsSummary.averageResponseTime.toFixed(2)}ms`);
  console.log(`  Memory samples: ${metricsSummary.memorySamples}`);
  console.log('');
  
  // Performance recommendations
  console.log('8. Performance recommendations...');
  
  console.log('✓ Performance optimization recommendations:');
  console.log('  1. Use caching for frequently accessed data');
  console.log('  2. Implement connection pooling for database connections');
  console.log('  3. Use circuit breakers to prevent cascade failures');
  console.log('  4. Implement retry policies with exponential backoff');
  console.log('  5. Monitor performance metrics continuously');
  console.log('  6. Use structured logging for debugging');
  console.log('  7. Implement health checks for dependencies');
  console.log('  8. Use batch operations when possible');
  console.log('  9. Optimize memory usage and garbage collection');
  console.log('  10. Use compression for large data transfers');
  console.log('');
  
  console.log('=== Example completed successfully ===');
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  performanceExample().catch(error => {
    console.error('Example failed:', error);
    process.exit(1);
  });
}

export { performanceExample };
