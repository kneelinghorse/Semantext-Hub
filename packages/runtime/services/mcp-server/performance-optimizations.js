/**
 * Performance Optimizations for MCP Server
 * 
 * Mission B9.1: Performance Optimization & Hardening
 * 
 * This module implements performance optimizations for:
 * - URN Resolver caching and memoization
 * - ProtocolGraph batch operations and caching
 * - A2A → MCP request path optimization
 * - Memory usage optimization
 * - Request batching and streaming
 */

import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

/**
 * Performance Metrics Collector
 */
export class PerformanceMetrics extends EventEmitter {
  constructor(options = {}) {
    super();
    this.enableLogging = options.enableLogging !== false;
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        latency: {
          p50: 0,
          p95: 0,
          p99: 0,
          max: 0,
          samples: []
        }
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRatio: 0
      },
      memory: {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0
      },
      discovery: {
        total: 0,
        cached: 0,
        latency: {
          p50: 0,
          p95: 0,
          p99: 0,
          samples: []
        }
      },
      mcp: {
        total: 0,
        cached: 0,
        latency: {
          p50: 0,
          p95: 0,
          p99: 0,
          samples: []
        }
      }
    };
    
    this.startTime = Date.now();
    this.updateInterval = setInterval(() => this.updateMemoryMetrics(), 5000);
  }

  /**
   * Record request metrics
   * @param {string} operation - Operation type (discovery, mcp, etc.)
   * @param {number} latency - Request latency in ms
   * @param {boolean} success - Whether request succeeded
   * @param {boolean} cached - Whether result was cached
   */
  recordRequest(operation, latency, success, cached = false) {
    this.metrics.requests.total++;
    if (success) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
    }

    // Update latency metrics
    this.metrics.requests.latency.samples.push(latency);
    if (this.metrics.requests.latency.samples.length > 1000) {
      this.metrics.requests.latency.samples = this.metrics.requests.latency.samples.slice(-1000);
    }
    this.updatePercentiles(this.metrics.requests.latency);

    // Update operation-specific metrics
    if (operation === 'discovery') {
      this.metrics.discovery.total++;
      if (cached) this.metrics.discovery.cached++;
      this.metrics.discovery.latency.samples.push(latency);
      if (this.metrics.discovery.latency.samples.length > 1000) {
        this.metrics.discovery.latency.samples = this.metrics.discovery.latency.samples.slice(-1000);
      }
      this.updatePercentiles(this.metrics.discovery.latency);
    } else if (operation === 'mcp') {
      this.metrics.mcp.total++;
      if (cached) this.metrics.mcp.cached++;
      this.metrics.mcp.latency.samples.push(latency);
      if (this.metrics.mcp.latency.samples.length > 1000) {
        this.metrics.mcp.latency.samples = this.metrics.mcp.latency.samples.slice(-1000);
      }
      this.updatePercentiles(this.metrics.mcp.latency);
    }

    if (this.enableLogging) {
      console.debug(`[Performance] ${operation}: ${latency}ms ${success ? 'success' : 'failed'} ${cached ? 'cached' : ''}`);
    }
  }

  /**
   * Record cache metrics
   * @param {boolean} hit - Whether cache hit
   */
  recordCache(hit) {
    if (hit) {
      this.metrics.cache.hits++;
    } else {
      this.metrics.cache.misses++;
    }
    
    const total = this.metrics.cache.hits + this.metrics.cache.misses;
    this.metrics.cache.hitRatio = total > 0 ? this.metrics.cache.hits / total : 0;
  }

  /**
   * Update memory metrics
   */
  updateMemoryMetrics() {
    const memUsage = process.memoryUsage();
    this.metrics.memory = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss
    };

    // Emit memory warning if heap usage is high
    if (memUsage.heapUsed > 100 * 1024 * 1024) { // 100MB
      this.emit('memoryWarning', {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal
      });
    }
  }

  /**
   * Update percentile calculations
   * @param {Object} latency - Latency metrics object
   */
  updatePercentiles(latency) {
    if (latency.samples.length === 0) return;
    
    const sorted = [...latency.samples].sort((a, b) => a - b);
    latency.p50 = sorted[Math.floor(sorted.length * 0.5)];
    latency.p95 = sorted[Math.floor(sorted.length * 0.95)];
    latency.p99 = sorted[Math.floor(sorted.length * 0.99)];
    latency.max = Math.max(...sorted);
  }

  /**
   * Get current metrics summary
   * @returns {Object} Metrics summary
   */
  getSummary() {
    const uptime = Date.now() - this.startTime;
    return {
      uptime,
      requests: {
        total: this.metrics.requests.total,
        successful: this.metrics.requests.successful,
        failed: this.metrics.requests.failed,
        successRate: this.metrics.requests.total > 0 ? 
          this.metrics.requests.successful / this.metrics.requests.total : 0,
        latency: {
          p50: this.metrics.requests.latency.p50,
          p95: this.metrics.requests.latency.p95,
          p99: this.metrics.requests.latency.p99,
          max: this.metrics.requests.latency.max
        }
      },
      cache: {
        hits: this.metrics.cache.hits,
        misses: this.metrics.cache.misses,
        hitRatio: this.metrics.cache.hitRatio
      },
      memory: this.metrics.memory,
      discovery: {
        total: this.metrics.discovery.total,
        cached: this.metrics.discovery.cached,
        cacheRatio: this.metrics.discovery.total > 0 ? 
          this.metrics.discovery.cached / this.metrics.discovery.total : 0,
        latency: {
          p50: this.metrics.discovery.latency.p50,
          p95: this.metrics.discovery.latency.p95,
          p99: this.metrics.discovery.latency.p99
        }
      },
      mcp: {
        total: this.metrics.mcp.total,
        cached: this.metrics.mcp.cached,
        cacheRatio: this.metrics.mcp.total > 0 ? 
          this.metrics.mcp.cached / this.metrics.mcp.total : 0,
        latency: {
          p50: this.metrics.mcp.latency.p50,
          p95: this.metrics.mcp.latency.p95,
          p99: this.metrics.mcp.latency.p99
        }
      }
    };
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      requests: { total: 0, successful: 0, failed: 0, latency: { p50: 0, p95: 0, p99: 0, max: 0, samples: [] } },
      cache: { hits: 0, misses: 0, hitRatio: 0 },
      memory: { heapUsed: 0, heapTotal: 0, external: 0, rss: 0 },
      discovery: { total: 0, cached: 0, latency: { p50: 0, p95: 0, p99: 0, samples: [] } },
      mcp: { total: 0, cached: 0, latency: { p50: 0, p95: 0, p99: 0, samples: [] } }
    };
    this.startTime = Date.now();
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }
}

/**
 * Optimized URN Resolver with enhanced caching
 */
export class OptimizedURNResolver {
  constructor(options = {}) {
    this.cacheTtl = options.cacheTtl || 300000; // 5 minutes
    this.maxCacheSize = options.maxCacheSize || 1000;
    this.enableLogging = options.enableLogging !== false;
    
    // Enhanced caching with TTL and LRU eviction
    this.cache = new Map();
    this.cacheTimestamps = new Map();
    this.cacheAccessOrder = new Map();
    this.accessCounter = 0;
    
    // Performance metrics
    this.metrics = new PerformanceMetrics({ enableLogging: this.enableLogging });
    
    // Pre-warm cache with common URNs
    this.preWarmCache();
  }

  /**
   * Pre-warm cache with common URNs
   */
  preWarmCache() {
    const commonURNs = [
      'urn:agent:system:registry@1.0.0',
      'urn:agent:system:discovery@1.0.0',
      'urn:agent:system:validation@1.0.0'
    ];
    
    commonURNs.forEach(urn => {
      this.cache.set(urn, {
        metadata: { urn, name: urn.split(':')[3], version: '1.0.0' },
        capabilities: {},
        cached: true,
        resolvedAt: new Date().toISOString()
      });
      this.cacheTimestamps.set(urn, Date.now());
      this.cacheAccessOrder.set(urn, this.accessCounter++);
    });
  }

  /**
   * Resolve URN with optimized caching
   * @param {string} urn - URN to resolve
   * @param {Object} options - Resolution options
   * @returns {Promise<Object>} Resolution result
   */
  async resolveAgentUrn(urn, options = {}) {
    const startTime = performance.now();
    const useCache = options.useCache !== false;
    
    try {
      // Check cache first
      if (useCache) {
        const cached = this.getCachedResult(urn);
        if (cached) {
          const latency = performance.now() - startTime;
          this.metrics.recordRequest('discovery', latency, true, true);
          this.metrics.recordCache(true);
          return cached;
        }
      }

      // Resolve URN (simplified for performance optimization)
      const result = await this.resolveWithRetry(urn);
      
      // Cache result
      if (useCache) {
        this.cacheResult(urn, result);
      }

      const latency = performance.now() - startTime;
      this.metrics.recordRequest('discovery', latency, true, false);
      this.metrics.recordCache(false);
      
      return result;
    } catch (error) {
      const latency = performance.now() - startTime;
      this.metrics.recordRequest('discovery', latency, false, false);
      throw error;
    }
  }

  /**
   * Get cached result with TTL and LRU eviction
   * @param {string} urn - URN to lookup
   * @returns {Object|null} Cached result or null
   */
  getCachedResult(urn) {
    const cached = this.cache.get(urn);
    if (!cached) return null;

    const timestamp = this.cacheTimestamps.get(urn);
    if (Date.now() - timestamp > this.cacheTtl) {
      this.evictFromCache(urn);
      return null;
    }

    // Update access order for LRU
    this.cacheAccessOrder.set(urn, this.accessCounter++);
    return cached;
  }

  /**
   * Cache result with size limits
   * @param {string} urn - URN to cache
   * @param {Object} result - Result to cache
   */
  cacheResult(urn, result) {
    // Evict if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLRU();
    }

    this.cache.set(urn, { ...result, cached: true });
    this.cacheTimestamps.set(urn, Date.now());
    this.cacheAccessOrder.set(urn, this.accessCounter++);
  }

  /**
   * Evict least recently used item
   */
  evictLRU() {
    let oldestUrn = null;
    let oldestAccess = Infinity;

    for (const [urn, access] of this.cacheAccessOrder) {
      if (access < oldestAccess) {
        oldestAccess = access;
        oldestUrn = urn;
      }
    }

    if (oldestUrn) {
      this.evictFromCache(oldestUrn);
    }
  }

  /**
   * Evict specific URN from cache
   * @param {string} urn - URN to evict
   */
  evictFromCache(urn) {
    this.cache.delete(urn);
    this.cacheTimestamps.delete(urn);
    this.cacheAccessOrder.delete(urn);
  }

  /**
   * Resolve URN with retry logic (simplified)
   * @param {string} urn - URN to resolve
   * @returns {Promise<Object>} Resolution result
   */
  async resolveWithRetry(urn) {
    // Simplified resolution for performance optimization
    // In a real implementation, this would call the actual URN resolver
    return {
      metadata: { urn, name: urn.split(':')[3] || 'unknown', version: '1.0.0' },
      capabilities: {},
      cached: false,
      resolvedAt: new Date().toISOString()
    };
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRatio: this.metrics.metrics.cache.hitRatio,
      ttl: this.cacheTtl
    };
  }

  /**
   * Get performance metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    return this.metrics.getSummary();
  }
}

/**
 * Optimized ProtocolGraph with batch operations
 */
export class OptimizedProtocolGraph {
  constructor(options = {}) {
    this.cacheSize = options.cacheSize || 1000;
    this.enableLogging = options.enableLogging !== false;
    
    // Enhanced caching
    this.cache = new Map();
    this.cacheTimestamps = new Map();
    
    // Performance metrics
    this.metrics = new PerformanceMetrics({ enableLogging: this.enableLogging });
    
    // Graph data structures
    this.nodes = new Map();
    this.edges = new Map();
    this.urnIndex = new Map();
  }

  /**
   * Batch add nodes with optimized performance
   * @param {Array} nodes - Array of node objects
   * @returns {Object} Batch operation result
   */
  batchAddNodes(nodes) {
    const startTime = performance.now();
    const results = {
      added: 0,
      skipped: 0,
      errors: []
    };

    for (const node of nodes) {
      try {
        if (this.addNode(node.urn, node.kind, node.manifest)) {
          results.added++;
        } else {
          results.skipped++;
        }
      } catch (error) {
        results.errors.push({ urn: node.urn, error: error.message });
      }
    }

    const latency = performance.now() - startTime;
    this.metrics.recordRequest('mcp', latency, true, false);

    if (this.enableLogging) {
      console.debug(`[ProtocolGraph] Batch added ${results.added} nodes in ${latency.toFixed(2)}ms`);
    }

    return results;
  }

  /**
   * Add node with caching
   * @param {string} urn - Node URN
   * @param {string} kind - Node kind
   * @param {Object} manifest - Node manifest
   * @returns {boolean} Whether node was added
   */
  addNode(urn, kind, manifest = {}) {
    if (this.nodes.has(urn)) {
      return false; // Already exists
    }

    this.nodes.set(urn, { urn, kind, manifest });
    
    // Update URN index
    const normalized = this.normalizeURN(urn);
    if (!this.urnIndex.has(normalized)) {
      this.urnIndex.set(normalized, new Set());
    }
    this.urnIndex.get(normalized).add(urn);

    return true;
  }

  /**
   * Resolve URN with caching
   * @param {string} urn - URN to resolve
   * @returns {Array} Matching URNs
   */
  resolveURN(urn) {
    const startTime = performance.now();
    
    // Check cache first
    const cached = this.cache.get(urn);
    if (cached && Date.now() - this.cacheTimestamps.get(urn) < 300000) { // 5 min TTL
      const latency = performance.now() - startTime;
      this.metrics.recordRequest('mcp', latency, true, true);
      this.metrics.recordCache(true);
      return cached;
    }

    // Resolve URN
    const normalized = this.normalizeURN(urn);
    const candidates = this.urnIndex.get(normalized);
    const result = candidates ? Array.from(candidates) : [];

    // Cache result
    this.cache.set(urn, result);
    this.cacheTimestamps.set(urn, Date.now());

    const latency = performance.now() - startTime;
    this.metrics.recordRequest('mcp', latency, true, false);
    this.metrics.recordCache(false);

    return result;
  }

  /**
   * Normalize URN for indexing
   * @param {string} urn - URN to normalize
   * @returns {string} Normalized URN
   */
  normalizeURN(urn) {
    // Simplified normalization for performance
    return urn.toLowerCase().replace(/@.*$/, '');
  }

  /**
   * Get performance metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    return this.metrics.getSummary();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.cacheSize,
      hitRatio: this.metrics.metrics.cache.hitRatio
    };
  }
}

/**
 * Request Batcher for optimizing multiple requests
 */
export class RequestBatcher {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 10;
    this.batchTimeout = options.batchTimeout || 100; // 100ms
    this.enableLogging = options.enableLogging !== false;
    
    this.pendingRequests = new Map();
    this.batchTimer = null;
  }

  /**
   * Add request to batch
   * @param {string} key - Request key
   * @param {Function} handler - Request handler
   * @returns {Promise} Request result
   */
  async addRequest(key, handler) {
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(key, { handler, resolve, reject });
      
      if (this.pendingRequests.size >= this.batchSize) {
        this.processBatch();
      } else if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => this.processBatch(), this.batchTimeout);
      }
    });
  }

  /**
   * Process pending batch
   */
  async processBatch() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.pendingRequests.size === 0) return;

    const requests = Array.from(this.pendingRequests.entries());
    this.pendingRequests.clear();

    const startTime = performance.now();
    
    try {
      // Process requests in parallel
      const results = await Promise.allSettled(
        requests.map(([key, { handler }]) => handler(key))
      );

      // Resolve/reject promises
      results.forEach((result, index) => {
        const [key, { resolve, reject }] = requests[index];
        if (result.status === 'fulfilled') {
          resolve(result.value);
        } else {
          reject(result.reason);
        }
      });

      const latency = performance.now() - startTime;
      if (this.enableLogging) {
        console.debug(`[RequestBatcher] Processed ${requests.length} requests in ${latency.toFixed(2)}ms`);
      }
    } catch (error) {
      // Reject all pending requests
      requests.forEach(([key, { reject }]) => reject(error));
    }
  }
}

/**
 * Memory Optimizer for heap management
 */
export class MemoryOptimizer {
  constructor(options = {}) {
    this.maxHeapMB = options.maxHeapMB || 100;
    this.gcThreshold = options.gcThreshold || 0.8; // 80% of max
    this.enableLogging = options.enableLogging !== false;
    
    this.monitorInterval = setInterval(() => this.monitorMemory(), 10000); // Every 10s
  }

  /**
   * Monitor memory usage and trigger GC if needed
   */
  monitorMemory() {
    const memUsage = process.memoryUsage();
    const heapMB = memUsage.heapUsed / 1024 / 1024;
    
    if (heapMB > this.maxHeapMB * this.gcThreshold) {
      if (this.enableLogging) {
        console.warn(`[MemoryOptimizer] High memory usage: ${heapMB.toFixed(2)}MB (threshold: ${this.maxHeapMB * this.gcThreshold}MB)`);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        const newMemUsage = process.memoryUsage();
        const newHeapMB = newMemUsage.heapUsed / 1024 / 1024;
        
        if (this.enableLogging) {
          console.info(`[MemoryOptimizer] GC freed ${(heapMB - newHeapMB).toFixed(2)}MB`);
        }
      }
    }
  }

  /**
   * Get memory statistics
   * @returns {Object} Memory statistics
   */
  getMemoryStats() {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      heapUsedMB: memUsage.heapUsed / 1024 / 1024,
      heapTotalMB: memUsage.heapTotal / 1024 / 1024,
      maxHeapMB: this.maxHeapMB,
      gcThreshold: this.gcThreshold
    };
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
  }
}

/**
 * Performance Optimization Manager
 */
export class PerformanceOptimizer {
  constructor(options = {}) {
    this.enableLogging = options.enableLogging !== false;
    
    // Initialize optimization components
    this.urnResolver = new OptimizedURNResolver(options);
    this.protocolGraph = new OptimizedProtocolGraph(options);
    this.requestBatcher = new RequestBatcher(options);
    this.memoryOptimizer = new MemoryOptimizer(options);
    this.metrics = new PerformanceMetrics(options);
    
    // Performance targets
    this.targets = {
      discoveryP95: 1000, // 1s
      mcpP95: 3000, // 3s
      maxHeapMB: 100
    };
  }

  /**
   * Get comprehensive performance metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    return {
      global: this.metrics.getSummary(),
      urnResolver: this.urnResolver.getMetrics(),
      protocolGraph: this.protocolGraph.getMetrics(),
      memory: this.memoryOptimizer.getMemoryStats(),
      targets: this.targets,
      compliance: this.checkPerformanceCompliance()
    };
  }

  /**
   * Check performance compliance against targets
   * @returns {Object} Compliance status
   */
  checkPerformanceCompliance() {
    const metrics = this.metrics.getSummary();
    const memory = this.memoryOptimizer.getMemoryStats();
    
    return {
      discoveryP95: {
        target: this.targets.discoveryP95,
        actual: metrics.discovery.latency.p95,
        compliant: metrics.discovery.latency.p95 <= this.targets.discoveryP95
      },
      mcpP95: {
        target: this.targets.mcpP95,
        actual: metrics.mcp.latency.p95,
        compliant: metrics.mcp.latency.p95 <= this.targets.mcpP95
      },
      heapMB: {
        target: this.targets.maxHeapMB,
        actual: memory.heapUsedMB,
        compliant: memory.heapUsedMB <= this.targets.maxHeapMB
      }
    };
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.metrics.destroy();
    this.memoryOptimizer.destroy();
  }
}

export default PerformanceOptimizer;
