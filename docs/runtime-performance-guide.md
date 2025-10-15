# Runtime Performance Optimization Guide

This guide provides comprehensive performance optimization recommendations for the OSSP-AGI runtime components, including caching strategies, connection pooling, monitoring, and tuning guidelines.

## Table of Contents

- [Performance Overview](#performance-overview)
- [Caching Strategies](#caching-strategies)
- [Connection Management](#connection-management)
- [Circuit Breaker Tuning](#circuit-breaker-tuning)
- [Retry Policy Optimization](#retry-policy-optimization)
- [Memory Management](#memory-management)
- [Network Optimization](#network-optimization)
- [Monitoring and Metrics](#monitoring-and-metrics)
- [Performance Testing](#performance-testing)
- [Troubleshooting Performance Issues](#troubleshooting-performance-issues)

## Performance Overview

### Performance Characteristics

The runtime components have different performance characteristics:

- **Agent Discovery**: Fast local operations with optional caching
- **A2A Communication**: Network-bound with retry and circuit breaker overhead
- **MCP Tool Execution**: Process-bound with connection lifecycle overhead
- **Error Handling**: Minimal overhead with structured logging
- **Circuit Breaker**: <10ms overhead per operation
- **Retry Policies**: Variable delay based on backoff strategy

### Performance Targets

| Component | Target Latency | Target Throughput | Target Memory |
|-----------|----------------|-------------------|---------------|
| Agent Discovery | <100ms | 1000 req/s | <50MB |
| A2A Communication | <500ms | 100 req/s | <100MB |
| MCP Tool Execution | <1000ms | 50 req/s | <200MB |
| Circuit Breaker | <10ms | 10000 req/s | <10MB |
| Retry Policy | <5ms | 10000 req/s | <5MB |

### Performance Bottlenecks

Common performance bottlenecks and their solutions:

1. **Network Latency**: Use connection pooling and caching
2. **Process Spawning**: Reuse MCP connections
3. **Memory Leaks**: Implement proper cleanup
4. **CPU Usage**: Optimize algorithms and data structures
5. **Disk I/O**: Use in-memory caching

## Caching Strategies

### Discovery Service Caching

Configure discovery service caching for optimal performance:

```javascript
// examples/discovery-caching.js
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';

class DiscoveryCachingOptimization {
  constructor() {
    this.discovery = null;
  }
  
  async initialize() {
    this.discovery = createAgentDiscoveryService({
      enableCaching: true,
      cacheTtl: 300000, // 5 minutes
      maxResults: 1000,
      enableLogging: true
    });
    
    await this.discovery.initialize();
  }
  
  // Warm up cache with common queries
  async warmUpCache() {
    const commonQueries = [
      { domain: 'ai' },
      { domain: 'data' },
      { domain: 'api' },
      { capabilities: ['ml-inference'] },
      { capabilities: ['etl'] }
    ];
    
    for (const query of commonQueries) {
      try {
        await this.discovery.discoverAgents(query);
        console.log(`Warmed up cache for query:`, query);
      } catch (error) {
        console.warn(`Failed to warm up cache for query:`, query, error.message);
      }
    }
  }
  
  // Get cache statistics
  getCacheStats() {
    const stats = this.discovery.getStats();
    return {
      cacheSize: stats.cacheSize,
      cacheHitRate: stats.cacheHitRate,
      totalQueries: stats.totalQueries || 0,
      cacheMisses: stats.cacheMisses || 0
    };
  }
  
  // Clear cache when needed
  clearCache() {
    this.discovery.clearCache();
    console.log('Discovery cache cleared');
  }
  
  // Optimize cache TTL based on usage patterns
  optimizeCacheTTL() {
    const stats = this.getCacheStats();
    
    if (stats.cacheHitRate > 0.8) {
      // High hit rate, increase TTL
      console.log('High cache hit rate, consider increasing TTL');
    } else if (stats.cacheHitRate < 0.3) {
      // Low hit rate, decrease TTL
      console.log('Low cache hit rate, consider decreasing TTL');
    }
  }
}

// Usage
const cachingOptimization = new DiscoveryCachingOptimization();
await cachingOptimization.initialize();

// Warm up cache
await cachingOptimization.warmUpCache();

// Monitor cache performance
setInterval(() => {
  const stats = cachingOptimization.getCacheStats();
  console.log('Cache stats:', stats);
  cachingOptimization.optimizeCacheTTL();
}, 60000); // Check every minute
```

### A2A Client Caching

Implement response caching for A2A requests:

```javascript
// examples/a2a-caching.js
import { createA2AClient } from '../app/runtime/a2a-client.js';

class A2ACachingOptimization {
  constructor() {
    this.a2aClient = null;
    this.responseCache = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
  }
  
  async initialize() {
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true,
      timeout: 10000,
      maxRetries: 3
    });
  }
  
  // Cache key generation
  generateCacheKey(agentUrn, route, options) {
    const key = `${agentUrn}:${route}:${JSON.stringify(options)}`;
    return Buffer.from(key).toString('base64');
  }
  
  // Cached request with TTL
  async cachedRequest(agentUrn, route, options, ttl = 60000) {
    const cacheKey = this.generateCacheKey(agentUrn, route, options);
    const now = Date.now();
    
    // Check cache
    if (this.responseCache.has(cacheKey)) {
      const cached = this.responseCache.get(cacheKey);
      if (now - cached.timestamp < ttl) {
        this.cacheStats.hits++;
        console.log('Cache hit for:', cacheKey);
        return cached.data;
      } else {
        // Expired, remove from cache
        this.responseCache.delete(cacheKey);
        this.cacheStats.evictions++;
      }
    }
    
    // Cache miss, make request
    this.cacheStats.misses++;
    console.log('Cache miss for:', cacheKey);
    
    try {
      const result = await this.a2aClient.request(agentUrn, route, options);
      
      // Cache successful response
      this.responseCache.set(cacheKey, {
        data: result,
        timestamp: now
      });
      
      // Implement cache size limit
      if (this.responseCache.size > 1000) {
        const oldestKey = this.responseCache.keys().next().value;
        this.responseCache.delete(oldestKey);
        this.cacheStats.evictions++;
      }
      
      return result;
    } catch (error) {
      // Don't cache errors
      throw error;
    }
  }
  
  // Get cache statistics
  getCacheStats() {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    const hitRate = total > 0 ? this.cacheStats.hits / total : 0;
    
    return {
      ...this.cacheStats,
      total,
      hitRate,
      cacheSize: this.responseCache.size
    };
  }
  
  // Clear cache
  clearCache() {
    this.responseCache.clear();
    this.cacheStats = { hits: 0, misses: 0, evictions: 0 };
    console.log('A2A cache cleared');
  }
}

// Usage
const a2aCaching = new A2ACachingOptimization();
await a2aCaching.initialize();

// Use cached requests
const response = await a2aCaching.cachedRequest(
  'urn:agent:ai:ml-agent@1.0.0',
  '/api/inference',
  { method: 'POST', body: { input: 'test' } },
  300000 // 5 minutes TTL
);

// Monitor cache performance
setInterval(() => {
  const stats = a2aCaching.getCacheStats();
  console.log('A2A cache stats:', stats);
}, 60000);
```

### MCP Client Connection Pooling

Implement connection pooling for MCP clients:

```javascript
// examples/mcp-connection-pooling.js
import { createMCPClient } from '../app/runtime/mcp-client.js';

class MCPConnectionPool {
  constructor(options = {}) {
    this.options = {
      maxConnections: options.maxConnections || 5,
      idleTimeout: options.idleTimeout || 300000, // 5 minutes
      connectionTimeout: options.connectionTimeout || 10000,
      ...options
    };
    
    this.connections = new Map();
    this.availableConnections = new Set();
    this.connectionStats = {
      created: 0,
      reused: 0,
      closed: 0,
      errors: 0
    };
  }
  
  async getConnection(endpoint) {
    // Check for available connection
    if (this.availableConnections.has(endpoint)) {
      const connection = this.connections.get(endpoint);
      if (connection && connection.isConnected()) {
        this.connectionStats.reused++;
        console.log('Reusing MCP connection for:', endpoint);
        return connection;
      } else {
        // Remove invalid connection
        this.availableConnections.delete(endpoint);
        this.connections.delete(endpoint);
      }
    }
    
    // Check connection limit
    if (this.connections.size >= this.options.maxConnections) {
      // Close oldest connection
      const oldestEndpoint = this.connections.keys().next().value;
      await this.closeConnection(oldestEndpoint);
    }
    
    // Create new connection
    try {
      const connection = createMCPClient({
        endpoint,
        enableLogging: true,
        timeout: this.options.connectionTimeout
      });
      
      await connection.open();
      
      this.connections.set(endpoint, connection);
      this.availableConnections.add(endpoint);
      this.connectionStats.created++;
      
      console.log('Created new MCP connection for:', endpoint);
      return connection;
    } catch (error) {
      this.connectionStats.errors++;
      console.error('Failed to create MCP connection:', error.message);
      throw error;
    }
  }
  
  async releaseConnection(endpoint) {
    const connection = this.connections.get(endpoint);
    if (connection && connection.isConnected()) {
      this.availableConnections.add(endpoint);
      console.log('Released MCP connection for:', endpoint);
    }
  }
  
  async closeConnection(endpoint) {
    const connection = this.connections.get(endpoint);
    if (connection) {
      try {
        await connection.close();
        this.connectionStats.closed++;
        console.log('Closed MCP connection for:', endpoint);
      } catch (error) {
        console.error('Error closing MCP connection:', error.message);
      }
      
      this.connections.delete(endpoint);
      this.availableConnections.delete(endpoint);
    }
  }
  
  async closeAllConnections() {
    for (const [endpoint, connection] of this.connections) {
      await this.closeConnection(endpoint);
    }
  }
  
  getStats() {
    return {
      ...this.connectionStats,
      activeConnections: this.connections.size,
      availableConnections: this.availableConnections.size,
      maxConnections: this.options.maxConnections
    };
  }
  
  // Cleanup idle connections
  startIdleCleanup() {
    setInterval(() => {
      for (const [endpoint, connection] of this.connections) {
        const lastUsed = connection.lastUsed || Date.now();
        if (Date.now() - lastUsed > this.options.idleTimeout) {
          console.log('Cleaning up idle connection:', endpoint);
          this.closeConnection(endpoint);
        }
      }
    }, 60000); // Check every minute
  }
}

// Usage
const connectionPool = new MCPConnectionPool({
  maxConnections: 10,
  idleTimeout: 300000
});

// Start idle cleanup
connectionPool.startIdleCleanup();

// Use connection pool
const connection = await connectionPool.getConnection('npx @modelcontextprotocol/server-filesystem');
const tools = await connection.listTools();
await connectionPool.releaseConnection('npx @modelcontextprotocol/server-filesystem');

// Monitor connection pool
setInterval(() => {
  const stats = connectionPool.getStats();
  console.log('Connection pool stats:', stats);
}, 60000);
```

## Connection Management

### HTTP Connection Pooling

Optimize HTTP connections for A2A communication:

```javascript
// examples/http-connection-pooling.js
import { createA2AClient } from '../app/runtime/a2a-client.js';

class HTTPConnectionOptimization {
  constructor() {
    this.a2aClient = null;
    this.connectionStats = {
      totalRequests: 0,
      connectionReuses: 0,
      newConnections: 0,
      connectionErrors: 0
    };
  }
  
  async initialize() {
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true,
      timeout: 10000,
      maxRetries: 3,
      // Enable connection pooling
      keepAlive: true,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000
    });
  }
  
  // Batch requests to same endpoint
  async batchRequests(requests) {
    const batches = new Map();
    
    // Group requests by endpoint
    for (const request of requests) {
      const endpoint = this.extractEndpoint(request.agentUrn);
      if (!batches.has(endpoint)) {
        batches.set(endpoint, []);
      }
      batches.get(endpoint).push(request);
    }
    
    // Execute batches
    const results = [];
    for (const [endpoint, batch] of batches) {
      try {
        const batchResults = await Promise.allSettled(
          batch.map(req => this.a2aClient.request(req.agentUrn, req.route, req.options))
        );
        results.push(...batchResults);
      } catch (error) {
        console.error(`Batch request failed for endpoint ${endpoint}:`, error.message);
        results.push(...batch.map(() => ({ status: 'rejected', reason: error })));
      }
    }
    
    return results;
  }
  
  extractEndpoint(agentUrn) {
    // Extract endpoint from URN (simplified)
    const parts = agentUrn.split(':');
    return `${parts[2]}-${parts[3]}`;
  }
  
  // Connection health check
  async healthCheck() {
    try {
      const startTime = Date.now();
      const response = await this.a2aClient.request(
        'urn:agent:health:check@1.0.0',
        '/health',
        { method: 'GET', timeout: 5000 }
      );
      const latency = Date.now() - startTime;
      
      return {
        healthy: response.status === 200,
        latency,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  getStats() {
    return {
      ...this.connectionStats,
      connectionReuseRate: this.connectionStats.totalRequests > 0 
        ? this.connectionStats.connectionReuses / this.connectionStats.totalRequests 
        : 0
    };
  }
}

// Usage
const httpOptimization = new HTTPConnectionOptimization();
await httpOptimization.initialize();

// Batch requests
const requests = [
  { agentUrn: 'urn:agent:ai:ml-agent@1.0.0', route: '/api/inference', options: { method: 'POST', body: { input: 'test1' } } },
  { agentUrn: 'urn:agent:ai:ml-agent@1.0.0', route: '/api/inference', options: { method: 'POST', body: { input: 'test2' } } },
  { agentUrn: 'urn:agent:data:etl-agent@1.0.0', route: '/api/process', options: { method: 'POST', body: { data: 'test' } } }
];

const results = await httpOptimization.batchRequests(requests);
console.log('Batch results:', results);

// Health check
const health = await httpOptimization.healthCheck();
console.log('Connection health:', health);
```

### MCP Process Management

Optimize MCP process lifecycle management:

```javascript
// examples/mcp-process-management.js
import { createMCPClient } from '../app/runtime/mcp-client.js';

class MCPProcessOptimization {
  constructor() {
    this.clients = new Map();
    this.processStats = {
      spawned: 0,
      reused: 0,
      killed: 0,
      errors: 0
    };
  }
  
  async getClient(endpoint) {
    // Check for existing client
    if (this.clients.has(endpoint)) {
      const client = this.clients.get(endpoint);
      if (client.isConnected()) {
        this.processStats.reused++;
        console.log('Reusing MCP process for:', endpoint);
        return client;
      } else {
        // Remove disconnected client
        this.clients.delete(endpoint);
      }
    }
    
    // Create new client
    try {
      const client = createMCPClient({
        endpoint,
        enableLogging: true,
        timeout: 15000
      });
      
      await client.open();
      this.clients.set(endpoint, client);
      this.processStats.spawned++;
      
      console.log('Spawned new MCP process for:', endpoint);
      return client;
    } catch (error) {
      this.processStats.errors++;
      console.error('Failed to spawn MCP process:', error.message);
      throw error;
    }
  }
  
  async closeClient(endpoint) {
    const client = this.clients.get(endpoint);
    if (client) {
      try {
        await client.close();
        this.processStats.killed++;
        console.log('Killed MCP process for:', endpoint);
      } catch (error) {
        console.error('Error killing MCP process:', error.message);
      }
      
      this.clients.delete(endpoint);
    }
  }
  
  async closeAllClients() {
    for (const [endpoint, client] of this.clients) {
      await this.closeClient(endpoint);
    }
  }
  
  // Process health monitoring
  async monitorProcessHealth() {
    const healthChecks = [];
    
    for (const [endpoint, client] of this.clients) {
      try {
        const startTime = Date.now();
        const tools = await client.listTools();
        const latency = Date.now() - startTime;
        
        healthChecks.push({
          endpoint,
          healthy: true,
          latency,
          toolCount: tools.length
        });
      } catch (error) {
        healthChecks.push({
          endpoint,
          healthy: false,
          error: error.message
        });
      }
    }
    
    return healthChecks;
  }
  
  getStats() {
    return {
      ...this.processStats,
      activeProcesses: this.clients.size,
      processReuseRate: this.processStats.spawned > 0 
        ? this.processStats.reused / this.processStats.spawned 
        : 0
    };
  }
  
  // Cleanup inactive processes
  startProcessCleanup() {
    setInterval(async () => {
      const healthChecks = await this.monitorProcessHealth();
      
      for (const health of healthChecks) {
        if (!health.healthy) {
          console.log('Cleaning up unhealthy process:', health.endpoint);
          await this.closeClient(health.endpoint);
        }
      }
    }, 300000); // Check every 5 minutes
  }
}

// Usage
const processOptimization = new MCPProcessOptimization();

// Start process cleanup
processOptimization.startProcessCleanup();

// Use optimized process management
const client = await processOptimization.getClient('npx @modelcontextprotocol/server-filesystem');
const tools = await client.listTools();

// Monitor process health
const health = await processOptimization.monitorProcessHealth();
console.log('Process health:', health);

// Get stats
const stats = processOptimization.getStats();
console.log('Process stats:', stats);
```

## Circuit Breaker Tuning

### Circuit Breaker Configuration

Optimize circuit breaker settings for different scenarios:

```javascript
// examples/circuit-breaker-tuning.js
import { createCircuitBreaker } from '../app/runtime/circuit-breaker.js';

class CircuitBreakerOptimization {
  constructor() {
    this.circuitBreakers = new Map();
    this.performanceMetrics = new Map();
  }
  
  // Create optimized circuit breaker for different service types
  createOptimizedCircuitBreaker(serviceType, options = {}) {
    const configs = {
      // Fast, reliable services
      'fast-reliable': {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 30000,
        enableLogging: true,
        enableMetrics: true
      },
      
      // Slow, reliable services
      'slow-reliable': {
        failureThreshold: 2,
        successThreshold: 1,
        timeout: 60000,
        enableLogging: true,
        enableMetrics: true
      },
      
      // Fast, unreliable services
      'fast-unreliable': {
        failureThreshold: 5,
        successThreshold: 3,
        timeout: 30000,
        enableLogging: true,
        enableMetrics: true
      },
      
      // Slow, unreliable services
      'slow-unreliable': {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 120000,
        enableLogging: true,
        enableMetrics: true
      },
      
      // Critical services
      'critical': {
        failureThreshold: 2,
        successThreshold: 1,
        timeout: 30000,
        enableLogging: true,
        enableMetrics: true
      }
    };
    
    const config = { ...configs[serviceType], ...options };
    const circuitBreaker = createCircuitBreaker(config);
    
    this.circuitBreakers.set(serviceType, circuitBreaker);
    this.performanceMetrics.set(serviceType, {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      circuitOpens: 0,
      averageLatency: 0
    });
    
    return circuitBreaker;
  }
  
  // Execute with performance tracking
  async executeWithTracking(serviceType, operation) {
    const circuitBreaker = this.circuitBreakers.get(serviceType);
    const metrics = this.performanceMetrics.get(serviceType);
    
    if (!circuitBreaker || !metrics) {
      throw new Error(`Circuit breaker not found for service type: ${serviceType}`);
    }
    
    const startTime = Date.now();
    metrics.totalRequests++;
    
    try {
      const result = await circuitBreaker.execute(operation);
      const latency = Date.now() - startTime;
      
      metrics.successfulRequests++;
      metrics.averageLatency = (metrics.averageLatency + latency) / 2;
      
      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      
      metrics.failedRequests++;
      metrics.averageLatency = (metrics.averageLatency + latency) / 2;
      
      // Check if circuit opened
      const status = circuitBreaker.getStatus();
      if (status.state === 'OPEN') {
        metrics.circuitOpens++;
      }
      
      throw error;
    }
  }
  
  // Adaptive circuit breaker tuning
  adaptCircuitBreakerSettings(serviceType) {
    const metrics = this.performanceMetrics.get(serviceType);
    const circuitBreaker = this.circuitBreakers.get(serviceType);
    
    if (!metrics || !circuitBreaker) {
      return;
    }
    
    const failureRate = metrics.totalRequests > 0 
      ? metrics.failedRequests / metrics.totalRequests 
      : 0;
    
    const currentConfig = circuitBreaker.getStatus().config;
    
    // Adjust settings based on performance
    if (failureRate > 0.5) {
      // High failure rate, be more conservative
      console.log(`High failure rate (${failureRate.toFixed(2)}) for ${serviceType}, adjusting circuit breaker`);
      
      if (currentConfig.failureThreshold > 2) {
        currentConfig.failureThreshold--;
      }
      if (currentConfig.timeout < 120000) {
        currentConfig.timeout += 30000;
      }
    } else if (failureRate < 0.1) {
      // Low failure rate, be more aggressive
      console.log(`Low failure rate (${failureRate.toFixed(2)}) for ${serviceType}, adjusting circuit breaker`);
      
      if (currentConfig.failureThreshold < 10) {
        currentConfig.failureThreshold++;
      }
      if (currentConfig.timeout > 30000) {
        currentConfig.timeout -= 15000;
      }
    }
  }
  
  // Get performance metrics
  getPerformanceMetrics() {
    const metrics = {};
    
    for (const [serviceType, data] of this.performanceMetrics) {
      const circuitBreaker = this.circuitBreakers.get(serviceType);
      const status = circuitBreaker ? circuitBreaker.getStatus() : null;
      
      metrics[serviceType] = {
        ...data,
        failureRate: data.totalRequests > 0 ? data.failedRequests / data.totalRequests : 0,
        successRate: data.totalRequests > 0 ? data.successfulRequests / data.totalRequests : 0,
        circuitState: status ? status.state : 'unknown',
        circuitCanExecute: status ? status.canExecute : false
      };
    }
    
    return metrics;
  }
  
  // Start adaptive tuning
  startAdaptiveTuning() {
    setInterval(() => {
      for (const serviceType of this.circuitBreakers.keys()) {
        this.adaptCircuitBreakerSettings(serviceType);
      }
    }, 300000); // Adjust every 5 minutes
  }
}

// Usage
const circuitBreakerOptimization = new CircuitBreakerOptimization();

// Create optimized circuit breakers
const fastReliableCB = circuitBreakerOptimization.createOptimizedCircuitBreaker('fast-reliable');
const slowReliableCB = circuitBreakerOptimization.createOptimizedCircuitBreaker('slow-reliable');
const criticalCB = circuitBreakerOptimization.createOptimizedCircuitBreaker('critical');

// Start adaptive tuning
circuitBreakerOptimization.startAdaptiveTuning();

// Use with tracking
try {
  const result = await circuitBreakerOptimization.executeWithTracking('fast-reliable', async () => {
    // Your operation here
    return 'success';
  });
  console.log('Operation successful:', result);
} catch (error) {
  console.error('Operation failed:', error.message);
}

// Monitor performance
setInterval(() => {
  const metrics = circuitBreakerOptimization.getPerformanceMetrics();
  console.log('Circuit breaker metrics:', metrics);
}, 60000);
```

## Retry Policy Optimization

### Retry Policy Configuration

Optimize retry policies for different operation types:

```javascript
// examples/retry-policy-optimization.js
import { createRetryPolicy, PREDEFINED_POLICIES } from '../app/runtime/retry-policies.js';

class RetryPolicyOptimization {
  constructor() {
    this.retryPolicies = new Map();
    this.performanceMetrics = new Map();
  }
  
  // Create optimized retry policy for different operation types
  createOptimizedRetryPolicy(operationType, options = {}) {
    const configs = {
      // Network operations
      'network': {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        jitter: true,
        policy: 'EXPONENTIAL_BACKOFF'
      },
      
      // Database operations
      'database': {
        maxRetries: 2,
        baseDelay: 500,
        maxDelay: 5000,
        backoffMultiplier: 1.5,
        jitter: true,
        policy: 'EXPONENTIAL_BACKOFF'
      },
      
      // File operations
      'file': {
        maxRetries: 1,
        baseDelay: 200,
        maxDelay: 1000,
        backoffMultiplier: 1.2,
        jitter: false,
        policy: 'FIXED_DELAY'
      },
      
      // API calls
      'api': {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 15000,
        backoffMultiplier: 2,
        jitter: true,
        policy: 'EXPONENTIAL_BACKOFF'
      },
      
      // Critical operations
      'critical': {
        maxRetries: 5,
        baseDelay: 500,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitter: true,
        policy: 'EXPONENTIAL_BACKOFF'
      }
    };
    
    const config = { ...configs[operationType], ...options };
    const retryPolicy = createRetryPolicy(config);
    
    this.retryPolicies.set(operationType, retryPolicy);
    this.performanceMetrics.set(operationType, {
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      averageRetryTime: 0,
      maxRetryTime: 0
    });
    
    return retryPolicy;
  }
  
  // Execute with performance tracking
  async executeWithTracking(operationType, operation) {
    const retryPolicy = this.retryPolicies.get(operationType);
    const metrics = this.performanceMetrics.get(operationType);
    
    if (!retryPolicy || !metrics) {
      throw new Error(`Retry policy not found for operation type: ${operationType}`);
    }
    
    const startTime = Date.now();
    metrics.totalAttempts++;
    
    try {
      const result = await retryPolicy.execute(operation);
      const totalTime = Date.now() - startTime;
      
      metrics.successfulAttempts++;
      metrics.averageRetryTime = (metrics.averageRetryTime + totalTime) / 2;
      metrics.maxRetryTime = Math.max(metrics.maxRetryTime, totalTime);
      
      return result;
    } catch (error) {
      const totalTime = Date.now() - startTime;
      
      metrics.failedAttempts++;
      metrics.averageRetryTime = (metrics.averageRetryTime + totalTime) / 2;
      metrics.maxRetryTime = Math.max(metrics.maxRetryTime, totalTime);
      
      throw error;
    }
  }
  
  // Adaptive retry policy tuning
  adaptRetryPolicySettings(operationType) {
    const metrics = this.performanceMetrics.get(operationType);
    const retryPolicy = this.retryPolicies.get(operationType);
    
    if (!metrics || !retryPolicy) {
      return;
    }
    
    const successRate = metrics.totalAttempts > 0 
      ? metrics.successfulAttempts / metrics.totalAttempts 
      : 0;
    
    const status = retryPolicy.getStatus();
    const currentConfig = status.config;
    
    // Adjust settings based on performance
    if (successRate < 0.5) {
      // Low success rate, increase retries
      console.log(`Low success rate (${successRate.toFixed(2)}) for ${operationType}, adjusting retry policy`);
      
      if (currentConfig.maxRetries < 10) {
        currentConfig.maxRetries++;
      }
      if (currentConfig.baseDelay < 5000) {
        currentConfig.baseDelay += 500;
      }
    } else if (successRate > 0.9) {
      // High success rate, decrease retries
      console.log(`High success rate (${successRate.toFixed(2)}) for ${operationType}, adjusting retry policy`);
      
      if (currentConfig.maxRetries > 1) {
        currentConfig.maxRetries--;
      }
      if (currentConfig.baseDelay > 500) {
        currentConfig.baseDelay -= 250;
      }
    }
  }
  
  // Get performance metrics
  getPerformanceMetrics() {
    const metrics = {};
    
    for (const [operationType, data] of this.performanceMetrics) {
      metrics[operationType] = {
        ...data,
        successRate: data.totalAttempts > 0 ? data.successfulAttempts / data.totalAttempts : 0,
        failureRate: data.totalAttempts > 0 ? data.failedAttempts / data.totalAttempts : 0
      };
    }
    
    return metrics;
  }
  
  // Start adaptive tuning
  startAdaptiveTuning() {
    setInterval(() => {
      for (const operationType of this.retryPolicies.keys()) {
        this.adaptRetryPolicySettings(operationType);
      }
    }, 300000); // Adjust every 5 minutes
  }
}

// Usage
const retryPolicyOptimization = new RetryPolicyOptimization();

// Create optimized retry policies
const networkRetryPolicy = retryPolicyOptimization.createOptimizedRetryPolicy('network');
const databaseRetryPolicy = retryPolicyOptimization.createOptimizedRetryPolicy('database');
const apiRetryPolicy = retryPolicyOptimization.createOptimizedRetryPolicy('api');

// Start adaptive tuning
retryPolicyOptimization.startAdaptiveTuning();

// Use with tracking
try {
  const result = await retryPolicyOptimization.executeWithTracking('network', async () => {
    // Your operation here
    return 'success';
  });
  console.log('Operation successful:', result);
} catch (error) {
  console.error('Operation failed:', error.message);
}

// Monitor performance
setInterval(() => {
  const metrics = retryPolicyOptimization.getPerformanceMetrics();
  console.log('Retry policy metrics:', metrics);
}, 60000);
```

## Memory Management

### Memory Optimization

Implement memory optimization strategies:

```javascript
// examples/memory-optimization.js
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

class MemoryOptimization {
  constructor() {
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
    this.memoryStats = {
      initialMemory: process.memoryUsage(),
      peakMemory: process.memoryUsage(),
      gcCount: 0
    };
  }
  
  async initialize() {
    // Initialize with memory optimization
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true,
      cacheTtl: 300000, // 5 minutes
      maxResults: 1000
    });
    await this.discovery.initialize();
    
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true,
      timeout: 10000,
      maxRetries: 3
    });
    
    this.mcpClient = createMCPClient({
      endpoint: process.env.MCP_ENDPOINT || 'npx @modelcontextprotocol/server-filesystem',
      enableLogging: true,
      timeout: 15000
    });
    
    // Start memory monitoring
    this.startMemoryMonitoring();
  }
  
  // Memory monitoring
  startMemoryMonitoring() {
    setInterval(() => {
      const currentMemory = process.memoryUsage();
      
      // Update peak memory
      if (currentMemory.heapUsed > this.memoryStats.peakMemory.heapUsed) {
        this.memoryStats.peakMemory = currentMemory;
      }
      
      // Check for memory leaks
      const memoryGrowth = currentMemory.heapUsed - this.memoryStats.initialMemory.heapUsed;
      const memoryGrowthRate = memoryGrowth / this.memoryStats.initialMemory.heapUsed;
      
      if (memoryGrowthRate > 0.5) {
        console.warn('High memory growth detected:', {
          current: currentMemory,
          growth: memoryGrowth,
          growthRate: memoryGrowthRate
        });
        
        // Trigger garbage collection if available
        if (global.gc) {
          global.gc();
          this.memoryStats.gcCount++;
          console.log('Garbage collection triggered');
        }
      }
      
      // Log memory stats
      console.log('Memory usage:', {
        heapUsed: Math.round(currentMemory.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(currentMemory.heapTotal / 1024 / 1024) + 'MB',
        external: Math.round(currentMemory.external / 1024 / 1024) + 'MB',
        rss: Math.round(currentMemory.rss / 1024 / 1024) + 'MB'
      });
    }, 30000); // Check every 30 seconds
  }
  
  // Memory cleanup
  async cleanup() {
    console.log('Starting memory cleanup...');
    
    // Clear discovery cache
    if (this.discovery) {
      this.discovery.clearCache();
    }
    
    // Close MCP connections
    if (this.mcpClient && this.mcpClient.isConnected()) {
      await this.mcpClient.close();
    }
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
      this.memoryStats.gcCount++;
    }
    
    console.log('Memory cleanup completed');
  }
  
  // Memory-efficient batch processing
  async processBatch(items, batchSize = 100) {
    const results = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      try {
        const batchResults = await Promise.allSettled(
          batch.map(item => this.processItem(item))
        );
        
        results.push(...batchResults);
        
        // Cleanup between batches
        if (i % (batchSize * 10) === 0) {
          await this.cleanup();
        }
      } catch (error) {
        console.error('Batch processing error:', error.message);
      }
    }
    
    return results;
  }
  
  async processItem(item) {
    // Process individual item
    return item;
  }
  
  // Get memory statistics
  getMemoryStats() {
    const currentMemory = process.memoryUsage();
    const memoryGrowth = currentMemory.heapUsed - this.memoryStats.initialMemory.heapUsed;
    
    return {
      current: currentMemory,
      initial: this.memoryStats.initialMemory,
      peak: this.memoryStats.peakMemory,
      growth: memoryGrowth,
      growthRate: memoryGrowth / this.memoryStats.initialMemory.heapUsed,
      gcCount: this.memoryStats.gcCount
    };
  }
}

// Usage
const memoryOptimization = new MemoryOptimization();
await memoryOptimization.initialize();

// Process large dataset in batches
const largeDataset = Array.from({ length: 10000 }, (_, i) => ({ id: i, data: `item-${i}` }));
const results = await memoryOptimization.processBatch(largeDataset, 100);

// Monitor memory
setInterval(() => {
  const stats = memoryOptimization.getMemoryStats();
  console.log('Memory stats:', stats);
}, 60000);
```

## Network Optimization

### Network Performance Tuning

Optimize network performance for runtime components:

```javascript
// examples/network-optimization.js
import { createA2AClient } from '../app/runtime/a2a-client.js';

class NetworkOptimization {
  constructor() {
    this.a2aClient = null;
    this.networkStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      totalBytes: 0
    };
  }
  
  async initialize() {
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true,
      timeout: 10000,
      maxRetries: 3,
      // Network optimization settings
      keepAlive: true,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
      // Compression
      compress: true,
      // Connection pooling
      agent: {
        keepAlive: true,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: 60000
      }
    });
    
    // Start network monitoring
    this.startNetworkMonitoring();
  }
  
  // Network monitoring
  startNetworkMonitoring() {
    setInterval(() => {
      const stats = this.getNetworkStats();
      console.log('Network stats:', stats);
      
      // Check for performance issues
      if (stats.averageLatency > 1000) {
        console.warn('High average latency detected:', stats.averageLatency + 'ms');
      }
      
      if (stats.failureRate > 0.1) {
        console.warn('High failure rate detected:', stats.failureRate);
      }
    }, 60000); // Check every minute
  }
  
  // Optimized request with tracking
  async optimizedRequest(agentUrn, route, options) {
    const startTime = Date.now();
    this.networkStats.totalRequests++;
    
    try {
      const response = await this.a2aClient.request(agentUrn, route, options);
      const latency = Date.now() - startTime;
      
      this.networkStats.successfulRequests++;
      this.networkStats.averageLatency = (this.networkStats.averageLatency + latency) / 2;
      this.networkStats.minLatency = Math.min(this.networkStats.minLatency, latency);
      this.networkStats.maxLatency = Math.max(this.networkStats.maxLatency, latency);
      
      // Estimate response size
      const responseSize = JSON.stringify(response).length;
      this.networkStats.totalBytes += responseSize;
      
      return response;
    } catch (error) {
      const latency = Date.now() - startTime;
      
      this.networkStats.failedRequests++;
      this.networkStats.averageLatency = (this.networkStats.averageLatency + latency) / 2;
      this.networkStats.minLatency = Math.min(this.networkStats.minLatency, latency);
      this.networkStats.maxLatency = Math.max(this.networkStats.maxLatency, latency);
      
      throw error;
    }
  }
  
  // Connection pooling optimization
  async optimizeConnectionPool() {
    const stats = this.getNetworkStats();
    
    if (stats.averageLatency > 500) {
      console.log('High latency detected, optimizing connection pool');
      
      // Increase connection pool size
      if (this.a2aClient.agent) {
        this.a2aClient.agent.maxSockets = Math.min(100, this.a2aClient.agent.maxSockets + 10);
        this.a2aClient.agent.maxFreeSockets = Math.min(20, this.a2aClient.agent.maxFreeSockets + 5);
      }
    }
    
    if (stats.failureRate > 0.05) {
      console.log('High failure rate detected, adjusting timeout');
      
      // Increase timeout
      this.a2aClient.defaultTimeout = Math.min(30000, this.a2aClient.defaultTimeout + 5000);
    }
  }
  
  // Get network statistics
  getNetworkStats() {
    const total = this.networkStats.totalRequests;
    const successRate = total > 0 ? this.networkStats.successfulRequests / total : 0;
    const failureRate = total > 0 ? this.networkStats.failedRequests / total : 0;
    const averageBytes = total > 0 ? this.networkStats.totalBytes / total : 0;
    
    return {
      ...this.networkStats,
      successRate,
      failureRate,
      averageBytes,
      minLatency: this.networkStats.minLatency === Infinity ? 0 : this.networkStats.minLatency
    };
  }
  
  // Start network optimization
  startNetworkOptimization() {
    setInterval(() => {
      this.optimizeConnectionPool();
    }, 300000); // Optimize every 5 minutes
  }
}

// Usage
const networkOptimization = new NetworkOptimization();
await networkOptimization.initialize();

// Start network optimization
networkOptimization.startNetworkOptimization();

// Use optimized requests
const response = await networkOptimization.optimizedRequest(
  'urn:agent:ai:ml-agent@1.0.0',
  '/api/inference',
  { method: 'POST', body: { input: 'test' } }
);

// Monitor network performance
setInterval(() => {
  const stats = networkOptimization.getNetworkStats();
  console.log('Network performance:', stats);
}, 60000);
```

## Monitoring and Metrics

### Performance Metrics Collection

Implement comprehensive performance metrics collection:

```javascript
// examples/performance-metrics.js
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

class PerformanceMetrics {
  constructor() {
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
    this.metrics = {
      discovery: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatency: 0,
        cacheHits: 0,
        cacheMisses: 0
      },
      a2a: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatency: 0,
        circuitBreakerOpens: 0,
        retryAttempts: 0
      },
      mcp: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatency: 0,
        connectionFailures: 0,
        toolExecutions: 0
      },
      system: {
        memoryUsage: 0,
        cpuUsage: 0,
        uptime: 0
      }
    };
  }
  
  async initialize() {
    // Initialize runtime components
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true
    });
    await this.discovery.initialize();
    
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true
    });
    
    this.mcpClient = createMCPClient({
      endpoint: process.env.MCP_ENDPOINT || 'npx @modelcontextprotocol/server-filesystem',
      enableLogging: true
    });
    
    // Start metrics collection
    this.startMetricsCollection();
  }
  
  // Start metrics collection
  startMetricsCollection() {
    // Collect system metrics
    setInterval(() => {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      this.metrics.system.memoryUsage = memoryUsage.heapUsed;
      this.metrics.system.cpuUsage = cpuUsage.user + cpuUsage.system;
      this.metrics.system.uptime = process.uptime();
    }, 1000);
    
    // Collect component metrics
    setInterval(() => {
      this.collectComponentMetrics();
    }, 5000);
  }
  
  // Collect component metrics
  collectComponentMetrics() {
    // Discovery metrics
    if (this.discovery) {
      const discoveryStats = this.discovery.getStats();
      this.metrics.discovery.cacheHits = discoveryStats.cacheHits || 0;
      this.metrics.discovery.cacheMisses = discoveryStats.cacheMisses || 0;
    }
    
    // A2A metrics
    if (this.a2aClient) {
      const circuitBreakerStatus = this.a2aClient.circuitBreaker.getStatus();
      this.metrics.a2a.circuitBreakerOpens = circuitBreakerStatus.circuitOpens || 0;
      
      const retryPolicyStatus = this.a2aClient.retryPolicy.getStatus();
      this.metrics.a2a.retryAttempts = retryPolicyStatus.totalAttempts || 0;
    }
    
    // MCP metrics
    if (this.mcpClient) {
      const mcpState = this.mcpClient.getState();
      this.metrics.mcp.connectionFailures = mcpState.reconnectAttempts || 0;
    }
  }
  
  // Track discovery request
  async trackDiscoveryRequest(operation) {
    const startTime = Date.now();
    this.metrics.discovery.totalRequests++;
    
    try {
      const result = await operation();
      const latency = Date.now() - startTime;
      
      this.metrics.discovery.successfulRequests++;
      this.metrics.discovery.averageLatency = (this.metrics.discovery.averageLatency + latency) / 2;
      
      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      
      this.metrics.discovery.failedRequests++;
      this.metrics.discovery.averageLatency = (this.metrics.discovery.averageLatency + latency) / 2;
      
      throw error;
    }
  }
  
  // Track A2A request
  async trackA2ARequest(operation) {
    const startTime = Date.now();
    this.metrics.a2a.totalRequests++;
    
    try {
      const result = await operation();
      const latency = Date.now() - startTime;
      
      this.metrics.a2a.successfulRequests++;
      this.metrics.a2a.averageLatency = (this.metrics.a2a.averageLatency + latency) / 2;
      
      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      
      this.metrics.a2a.failedRequests++;
      this.metrics.a2a.averageLatency = (this.metrics.a2a.averageLatency + latency) / 2;
      
      throw error;
    }
  }
  
  // Track MCP request
  async trackMCPRequest(operation) {
    const startTime = Date.now();
    this.metrics.mcp.totalRequests++;
    
    try {
      const result = await operation();
      const latency = Date.now() - startTime;
      
      this.metrics.mcp.successfulRequests++;
      this.metrics.mcp.averageLatency = (this.metrics.mcp.averageLatency + latency) / 2;
      this.metrics.mcp.toolExecutions++;
      
      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      
      this.metrics.mcp.failedRequests++;
      this.metrics.mcp.averageLatency = (this.metrics.mcp.averageLatency + latency) / 2;
      
      throw error;
    }
  }
  
  // Get performance summary
  getPerformanceSummary() {
    const summary = {
      timestamp: new Date().toISOString(),
      components: {}
    };
    
    // Calculate success rates
    for (const [component, metrics] of Object.entries(this.metrics)) {
      if (component === 'system') continue;
      
      const total = metrics.totalRequests;
      const successRate = total > 0 ? metrics.successfulRequests / total : 0;
      const failureRate = total > 0 ? metrics.failedRequests / total : 0;
      
      summary.components[component] = {
        ...metrics,
        successRate,
        failureRate,
        throughput: total / (this.metrics.system.uptime || 1)
      };
    }
    
    // System metrics
    summary.system = {
      ...this.metrics.system,
      memoryUsageMB: Math.round(this.metrics.system.memoryUsage / 1024 / 1024),
      uptimeHours: Math.round(this.metrics.system.uptime / 3600)
    };
    
    return summary;
  }
  
  // Export metrics for monitoring systems
  exportMetrics() {
    const summary = this.getPerformanceSummary();
    
    // Format for Prometheus
    const prometheusMetrics = [];
    
    for (const [component, metrics] of Object.entries(summary.components)) {
      prometheusMetrics.push(`# HELP runtime_${component}_requests_total Total number of ${component} requests`);
      prometheusMetrics.push(`# TYPE runtime_${component}_requests_total counter`);
      prometheusMetrics.push(`runtime_${component}_requests_total ${metrics.totalRequests}`);
      
      prometheusMetrics.push(`# HELP runtime_${component}_latency_seconds Average ${component} latency`);
      prometheusMetrics.push(`# TYPE runtime_${component}_latency_seconds gauge`);
      prometheusMetrics.push(`runtime_${component}_latency_seconds ${metrics.averageLatency / 1000}`);
      
      prometheusMetrics.push(`# HELP runtime_${component}_success_rate ${component} success rate`);
      prometheusMetrics.push(`# TYPE runtime_${component}_success_rate gauge`);
      prometheusMetrics.push(`runtime_${component}_success_rate ${metrics.successRate}`);
    }
    
    return prometheusMetrics.join('\n');
  }
}

// Usage
const performanceMetrics = new PerformanceMetrics();
await performanceMetrics.initialize();

// Use with tracking
const agents = await performanceMetrics.trackDiscoveryRequest(async () => {
  return await performanceMetrics.discovery.discoverAgents({ domain: 'ai' });
});

const response = await performanceMetrics.trackA2ARequest(async () => {
  return await performanceMetrics.a2aClient.request(
    'urn:agent:ai:ml-agent@1.0.0',
    '/api/inference',
    { method: 'POST', body: { input: 'test' } }
  );
});

// Get performance summary
const summary = performanceMetrics.getPerformanceSummary();
console.log('Performance summary:', summary);

// Export metrics
const metrics = performanceMetrics.exportMetrics();
console.log('Prometheus metrics:', metrics);
```

## Performance Testing

### Load Testing

Implement load testing for runtime components:

```javascript
// examples/load-testing.js
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

class LoadTesting {
  constructor() {
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
    this.testResults = {
      discovery: [],
      a2a: [],
      mcp: []
    };
  }
  
  async initialize() {
    // Initialize runtime components
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true
    });
    await this.discovery.initialize();
    
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true
    });
    
    this.mcpClient = createMCPClient({
      endpoint: process.env.MCP_ENDPOINT || 'npx @modelcontextprotocol/server-filesystem',
      enableLogging: true
    });
  }
  
  // Discovery load test
  async testDiscoveryLoad(concurrency = 10, duration = 60000) {
    console.log(`Starting discovery load test: ${concurrency} concurrent requests for ${duration}ms`);
    
    const startTime = Date.now();
    const promises = [];
    
    for (let i = 0; i < concurrency; i++) {
      promises.push(this.runDiscoveryTest(duration));
    }
    
    const results = await Promise.all(promises);
    
    // Aggregate results
    const aggregated = this.aggregateResults(results);
    console.log('Discovery load test results:', aggregated);
    
    return aggregated;
  }
  
  async runDiscoveryTest(duration) {
    const results = [];
    const startTime = Date.now();
    
    while (Date.now() - startTime < duration) {
      const testStart = Date.now();
      
      try {
        await this.discovery.discoverAgents({ domain: 'ai' });
        const latency = Date.now() - testStart;
        results.push({ success: true, latency });
      } catch (error) {
        const latency = Date.now() - testStart;
        results.push({ success: false, latency, error: error.message });
      }
    }
    
    return results;
  }
  
  // A2A load test
  async testA2ALoad(concurrency = 5, duration = 60000) {
    console.log(`Starting A2A load test: ${concurrency} concurrent requests for ${duration}ms`);
    
    const startTime = Date.now();
    const promises = [];
    
    for (let i = 0; i < concurrency; i++) {
      promises.push(this.runA2ATest(duration));
    }
    
    const results = await Promise.all(promises);
    
    // Aggregate results
    const aggregated = this.aggregateResults(results);
    console.log('A2A load test results:', aggregated);
    
    return aggregated;
  }
  
  async runA2ATest(duration) {
    const results = [];
    const startTime = Date.now();
    
    while (Date.now() - startTime < duration) {
      const testStart = Date.now();
      
      try {
        await this.a2aClient.request(
          'urn:agent:ai:ml-agent@1.0.0',
          '/api/inference',
          { method: 'POST', body: { input: 'test' } }
        );
        const latency = Date.now() - testStart;
        results.push({ success: true, latency });
      } catch (error) {
        const latency = Date.now() - testStart;
        results.push({ success: false, latency, error: error.message });
      }
    }
    
    return results;
  }
  
  // MCP load test
  async testMCPLoad(concurrency = 3, duration = 60000) {
    console.log(`Starting MCP load test: ${concurrency} concurrent requests for ${duration}ms`);
    
    const startTime = Date.now();
    const promises = [];
    
    for (let i = 0; i < concurrency; i++) {
      promises.push(this.runMCPTest(duration));
    }
    
    const results = await Promise.all(promises);
    
    // Aggregate results
    const aggregated = this.aggregateResults(results);
    console.log('MCP load test results:', aggregated);
    
    return aggregated;
  }
  
  async runMCPTest(duration) {
    const results = [];
    const startTime = Date.now();
    
    while (Date.now() - startTime < duration) {
      const testStart = Date.now();
      
      try {
        const isConnected = this.mcpClient.isConnected();
        if (!isConnected) {
          await this.mcpClient.open();
        }
        
        await this.mcpClient.executeTool('read_file', { path: '/test.txt' });
        const latency = Date.now() - testStart;
        results.push({ success: true, latency });
      } catch (error) {
        const latency = Date.now() - testStart;
        results.push({ success: false, latency, error: error.message });
      }
    }
    
    return results;
  }
  
  // Aggregate test results
  aggregateResults(results) {
    const allResults = results.flat();
    const successful = allResults.filter(r => r.success);
    const failed = allResults.filter(r => !r.success);
    
    const latencies = allResults.map(r => r.latency);
    const averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);
    
    const successRate = allResults.length > 0 ? successful.length / allResults.length : 0;
    const throughput = allResults.length / 60; // requests per second
    
    return {
      totalRequests: allResults.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      successRate,
      averageLatency,
      minLatency,
      maxLatency,
      throughput,
      errors: failed.map(f => f.error)
    };
  }
  
  // Run comprehensive load test
  async runComprehensiveLoadTest() {
    console.log('Starting comprehensive load test...');
    
    const results = {};
    
    // Test discovery
    results.discovery = await this.testDiscoveryLoad(10, 30000);
    
    // Test A2A
    results.a2a = await this.testA2ALoad(5, 30000);
    
    // Test MCP
    results.mcp = await this.testMCPLoad(3, 30000);
    
    // Overall summary
    const summary = {
      timestamp: new Date().toISOString(),
      results,
      overall: {
        totalRequests: Object.values(results).reduce((sum, r) => sum + r.totalRequests, 0),
        averageSuccessRate: Object.values(results).reduce((sum, r) => sum + r.successRate, 0) / Object.keys(results).length,
        averageLatency: Object.values(results).reduce((sum, r) => sum + r.averageLatency, 0) / Object.keys(results).length
      }
    };
    
    console.log('Comprehensive load test summary:', summary);
    return summary;
  }
}

// Usage
const loadTesting = new LoadTesting();
await loadTesting.initialize();

// Run comprehensive load test
const results = await loadTesting.runComprehensiveLoadTest();
console.log('Load test completed:', results);
```

## Troubleshooting Performance Issues

### Performance Diagnostics

Implement performance diagnostics and troubleshooting:

```javascript
// examples/performance-diagnostics.js
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

class PerformanceDiagnostics {
  constructor() {
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
    this.diagnostics = {
      system: {},
      components: {},
      recommendations: []
    };
  }
  
  async initialize() {
    // Initialize runtime components
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true
    });
    await this.discovery.initialize();
    
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true
    });
    
    this.mcpClient = createMCPClient({
      endpoint: process.env.MCP_ENDPOINT || 'npx @modelcontextprotocol/server-filesystem',
      enableLogging: true
    });
  }
  
  // Run comprehensive diagnostics
  async runDiagnostics() {
    console.log('Running performance diagnostics...');
    
    // System diagnostics
    await this.diagnoseSystem();
    
    // Component diagnostics
    await this.diagnoseComponents();
    
    // Generate recommendations
    this.generateRecommendations();
    
    console.log('Diagnostics completed');
    return this.diagnostics;
  }
  
  // System diagnostics
  async diagnoseSystem() {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    this.diagnostics.system = {
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };
    
    // Check for system issues
    if (memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
      this.diagnostics.recommendations.push({
        type: 'memory',
        severity: 'warning',
        message: 'High memory usage detected',
        recommendation: 'Consider implementing memory cleanup or increasing available memory'
      });
    }
    
    if (cpuUsage.user + cpuUsage.system > 1000000) { // 1 second
      this.diagnostics.recommendations.push({
        type: 'cpu',
        severity: 'warning',
        message: 'High CPU usage detected',
        recommendation: 'Consider optimizing algorithms or reducing concurrency'
      });
    }
  }
  
  // Component diagnostics
  async diagnoseComponents() {
    // Discovery diagnostics
    await this.diagnoseDiscovery();
    
    // A2A diagnostics
    await this.diagnoseA2A();
    
    // MCP diagnostics
    await this.diagnoseMCP();
  }
  
  async diagnoseDiscovery() {
    const startTime = Date.now();
    
    try {
      const result = await this.discovery.discoverAgents({ domain: 'ai' });
      const latency = Date.now() - startTime;
      
      const stats = this.discovery.getStats();
      const health = this.discovery.getHealth();
      
      this.diagnostics.components.discovery = {
        latency,
        success: true,
        stats,
        health,
        cacheHitRate: stats.cacheHitRate || 0
      };
      
      // Check for performance issues
      if (latency > 1000) {
        this.diagnostics.recommendations.push({
          type: 'discovery',
          severity: 'warning',
          message: 'High discovery latency',
          recommendation: 'Consider enabling caching or optimizing registry queries'
        });
      }
      
      if (stats.cacheHitRate < 0.3) {
        this.diagnostics.recommendations.push({
          type: 'discovery',
          severity: 'info',
          message: 'Low cache hit rate',
          recommendation: 'Consider increasing cache TTL or warming up cache'
        });
      }
    } catch (error) {
      this.diagnostics.components.discovery = {
        success: false,
        error: error.message
      };
      
      this.diagnostics.recommendations.push({
        type: 'discovery',
        severity: 'error',
        message: 'Discovery service failure',
        recommendation: 'Check registry configuration and network connectivity'
      });
    }
  }
  
  async diagnoseA2A() {
    const startTime = Date.now();
    
    try {
      const response = await this.a2aClient.request(
        'urn:agent:ai:ml-agent@1.0.0',
        '/health',
        { method: 'GET', timeout: 5000 }
      );
      const latency = Date.now() - startTime;
      
      const circuitBreakerStatus = this.a2aClient.circuitBreaker.getStatus();
      const retryPolicyStatus = this.a2aClient.retryPolicy.getStatus();
      
      this.diagnostics.components.a2a = {
        latency,
        success: true,
        status: response.status,
        circuitBreaker: circuitBreakerStatus,
        retryPolicy: retryPolicyStatus
      };
      
      // Check for performance issues
      if (latency > 2000) {
        this.diagnostics.recommendations.push({
          type: 'a2a',
          severity: 'warning',
          message: 'High A2A latency',
          recommendation: 'Consider optimizing network settings or increasing timeout'
        });
      }
      
      if (circuitBreakerStatus.state === 'OPEN') {
        this.diagnostics.recommendations.push({
          type: 'a2a',
          severity: 'error',
          message: 'Circuit breaker is open',
          recommendation: 'Check target service health and adjust circuit breaker settings'
        });
      }
    } catch (error) {
      this.diagnostics.components.a2a = {
        success: false,
        error: error.message
      };
      
      this.diagnostics.recommendations.push({
        type: 'a2a',
        severity: 'error',
        message: 'A2A communication failure',
        recommendation: 'Check network connectivity and target service availability'
      });
    }
  }
  
  async diagnoseMCP() {
    const startTime = Date.now();
    
    try {
      const isConnected = this.mcpClient.isConnected();
      if (!isConnected) {
        await this.mcpClient.open();
      }
      
      const tools = await this.mcpClient.listTools();
      const latency = Date.now() - startTime;
      
      const state = this.mcpClient.getState();
      
      this.diagnostics.components.mcp = {
        latency,
        success: true,
        connected: state.connected,
        toolCount: tools.length,
        state
      };
      
      // Check for performance issues
      if (latency > 3000) {
        this.diagnostics.recommendations.push({
          type: 'mcp',
          severity: 'warning',
          message: 'High MCP latency',
          recommendation: 'Consider optimizing MCP server configuration or connection pooling'
        });
      }
      
      if (state.reconnectAttempts > 3) {
        this.diagnostics.recommendations.push({
          type: 'mcp',
          severity: 'warning',
          message: 'Multiple MCP reconnection attempts',
          recommendation: 'Check MCP server stability and network connectivity'
        });
      }
    } catch (error) {
      this.diagnostics.components.mcp = {
        success: false,
        error: error.message
      };
      
      this.diagnostics.recommendations.push({
        type: 'mcp',
        severity: 'error',
        message: 'MCP connection failure',
        recommendation: 'Check MCP server availability and configuration'
      });
    }
  }
  
  // Generate recommendations
  generateRecommendations() {
    const recommendations = this.diagnostics.recommendations;
    
    // Sort by severity
    recommendations.sort((a, b) => {
      const severityOrder = { error: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
    
    // Add general recommendations
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'general',
        severity: 'info',
        message: 'No performance issues detected',
        recommendation: 'Continue monitoring performance metrics'
      });
    }
    
    this.diagnostics.recommendations = recommendations;
  }
  
  // Get diagnostics report
  getDiagnosticsReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalIssues: this.diagnostics.recommendations.length,
        criticalIssues: this.diagnostics.recommendations.filter(r => r.severity === 'error').length,
        warnings: this.diagnostics.recommendations.filter(r => r.severity === 'warning').length,
        info: this.diagnostics.recommendations.filter(r => r.severity === 'info').length
      },
      system: this.diagnostics.system,
      components: this.diagnostics.components,
      recommendations: this.diagnostics.recommendations
    };
    
    return report;
  }
}

// Usage
const diagnostics = new PerformanceDiagnostics();
await diagnostics.initialize();

// Run diagnostics
const results = await diagnostics.runDiagnostics();

// Get diagnostics report
const report = diagnostics.getDiagnosticsReport();
console.log('Performance diagnostics report:', JSON.stringify(report, null, 2));
```

## Best Practices Summary

### 1. Caching Strategies
- Enable caching for frequently accessed data
- Use appropriate cache TTL based on data freshness requirements
- Implement cache warming for common queries
- Monitor cache hit rates and adjust settings accordingly

### 2. Connection Management
- Use connection pooling for external services
- Implement connection health checks
- Monitor connection reuse rates
- Clean up idle connections regularly

### 3. Circuit Breaker Tuning
- Adjust failure thresholds based on service characteristics
- Monitor circuit breaker states and failure rates
- Implement adaptive tuning based on performance metrics
- Use different settings for different service types

### 4. Retry Policy Optimization
- Configure retry policies based on operation types
- Use exponential backoff with jitter
- Monitor retry success rates
- Implement adaptive retry policy tuning

### 5. Memory Management
- Monitor memory usage and growth patterns
- Implement memory cleanup strategies
- Use batch processing for large datasets
- Force garbage collection when necessary

### 6. Network Optimization
- Optimize connection pool settings
- Use compression for large responses
- Monitor network latency and failure rates
- Implement adaptive network tuning

### 7. Monitoring and Metrics
- Collect comprehensive performance metrics
- Monitor success rates, latencies, and throughput
- Set up alerts for performance degradation
- Export metrics for external monitoring systems

### 8. Performance Testing
- Implement load testing for all components
- Test under various load conditions
- Monitor performance under stress
- Use test results to optimize configurations

### 9. Troubleshooting
- Implement performance diagnostics
- Monitor system and component health
- Generate performance recommendations
- Use diagnostics to identify bottlenecks

This performance optimization guide provides comprehensive strategies and examples for optimizing the OSSP-AGI runtime components for maximum performance and reliability.
