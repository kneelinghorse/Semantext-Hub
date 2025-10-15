/**
 * Metrics Endpoint for MCP Server
 * 
 * Mission B9.1: Performance Optimization & Hardening
 * 
 * Provides /metrics JSON endpoint for observability and monitoring
 */

import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

/**
 * Metrics Endpoint Handler
 */
export class MetricsEndpoint extends EventEmitter {
  constructor(options = {}) {
    super();
    this.enableLogging = options.enableLogging !== false;
    this.enableMetrics = options.enableMetrics !== false;
    this.metricsPath = options.metricsPath || '/metrics';
    
    // Metrics storage
    this.metrics = {
      server: {
        startTime: Date.now(),
        uptime: 0,
        requests: {
          total: 0,
          successful: 0,
          failed: 0,
          byTool: new Map(),
          byOperation: new Map()
        },
        performance: {
          latency: {
            p50: 0,
            p95: 0,
            p99: 0,
            max: 0,
            samples: []
          },
          throughput: {
            requestsPerSecond: 0,
            peakRPS: 0,
            averageRPS: 0
          }
        }
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRatio: 0,
        byKey: new Map()
      },
      memory: {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0,
        heapUsedMB: 0,
        heapTotalMB: 0
      },
      discovery: {
        total: 0,
        cached: 0,
        failed: 0,
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
        failed: 0,
        latency: {
          p50: 0,
          p95: 0,
          p99: 0,
          samples: []
        }
      },
      a2a: {
        total: 0,
        successful: 0,
        failed: 0,
        latency: {
          p50: 0,
          p95: 0,
          p99: 0,
          samples: []
        }
      }
    };
    
    // Update intervals
    this.updateInterval = setInterval(() => this.updateMetrics(), 5000);
    this.throughputInterval = setInterval(() => this.updateThroughput(), 1000);
    
    // Request tracking
    this.requestTimes = [];
    this.lastRequestCount = 0;
  }

  /**
   * Handle metrics endpoint request
   * @param {Object} request - HTTP request
   * @param {Object} response - HTTP response
   */
  handleRequest(request, response) {
    if (request.url === this.metricsPath) {
      this.serveMetrics(response);
    } else {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  /**
   * Serve metrics as JSON
   * @param {Object} response - HTTP response
   */
  serveMetrics(response) {
    try {
      const metricsData = this.getMetrics();
      
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      response.end(JSON.stringify(metricsData, null, 2));
      
      if (this.enableLogging) {
        console.debug('[MetricsEndpoint] Served metrics');
      }
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Internal server error' }));
      
      if (this.enableLogging) {
        console.error('[MetricsEndpoint] Error serving metrics:', error);
      }
    }
  }

  /**
   * Record request metrics
   * @param {string} tool - Tool name
   * @param {string} operation - Operation type
   * @param {number} latency - Request latency in ms
   * @param {boolean} success - Whether request succeeded
   * @param {boolean} cached - Whether result was cached
   */
  recordRequest(tool, operation, latency, success, cached = false) {
    // Update server metrics
    this.metrics.server.requests.total++;
    if (success) {
      this.metrics.server.requests.successful++;
    } else {
      this.metrics.server.requests.failed++;
    }

    // Update tool-specific metrics
    if (!this.metrics.server.requests.byTool.has(tool)) {
      this.metrics.server.requests.byTool.set(tool, { total: 0, successful: 0, failed: 0 });
    }
    const toolMetrics = this.metrics.server.requests.byTool.get(tool);
    toolMetrics.total++;
    if (success) {
      toolMetrics.successful++;
    } else {
      toolMetrics.failed++;
    }

    // Update operation-specific metrics
    if (!this.metrics.server.requests.byOperation.has(operation)) {
      this.metrics.server.requests.byOperation.set(operation, { total: 0, successful: 0, failed: 0 });
    }
    const opMetrics = this.metrics.server.requests.byOperation.get(operation);
    opMetrics.total++;
    if (success) {
      opMetrics.successful++;
    } else {
      opMetrics.failed++;
    }

    // Update latency metrics
    this.metrics.server.performance.latency.samples.push(latency);
    if (this.metrics.server.performance.latency.samples.length > 1000) {
      this.metrics.server.performance.latency.samples = this.metrics.server.performance.latency.samples.slice(-1000);
    }
    this.updatePercentiles(this.metrics.server.performance.latency);

    // Update operation-specific latency
    if (operation === 'discovery') {
      this.metrics.discovery.total++;
      if (cached) this.metrics.discovery.cached++;
      if (!success) this.metrics.discovery.failed++;
      this.metrics.discovery.latency.samples.push(latency);
      if (this.metrics.discovery.latency.samples.length > 1000) {
        this.metrics.discovery.latency.samples = this.metrics.discovery.latency.samples.slice(-1000);
      }
      this.updatePercentiles(this.metrics.discovery.latency);
    } else if (operation === 'mcp') {
      this.metrics.mcp.total++;
      if (cached) this.metrics.mcp.cached++;
      if (!success) this.metrics.mcp.failed++;
      this.metrics.mcp.latency.samples.push(latency);
      if (this.metrics.mcp.latency.samples.length > 1000) {
        this.metrics.mcp.latency.samples = this.metrics.mcp.latency.samples.slice(-1000);
      }
      this.updatePercentiles(this.metrics.mcp.latency);
    } else if (operation === 'a2a') {
      this.metrics.a2a.total++;
      if (success) this.metrics.a2a.successful++;
      else this.metrics.a2a.failed++;
      this.metrics.a2a.latency.samples.push(latency);
      if (this.metrics.a2a.latency.samples.length > 1000) {
        this.metrics.a2a.latency.samples = this.metrics.a2a.latency.samples.slice(-1000);
      }
      this.updatePercentiles(this.metrics.a2a.latency);
    }

    // Track request times for throughput calculation
    this.requestTimes.push(Date.now());
    if (this.requestTimes.length > 1000) {
      this.requestTimes = this.requestTimes.slice(-1000);
    }
  }

  /**
   * Record cache metrics
   * @param {string} key - Cache key
   * @param {boolean} hit - Whether cache hit
   */
  recordCache(key, hit) {
    if (hit) {
      this.metrics.cache.hits++;
    } else {
      this.metrics.cache.misses++;
    }
    
    const total = this.metrics.cache.hits + this.metrics.cache.misses;
    this.metrics.cache.hitRatio = total > 0 ? this.metrics.cache.hits / total : 0;

    // Update key-specific metrics
    if (!this.metrics.cache.byKey.has(key)) {
      this.metrics.cache.byKey.set(key, { hits: 0, misses: 0 });
    }
    const keyMetrics = this.metrics.cache.byKey.get(key);
    if (hit) {
      keyMetrics.hits++;
    } else {
      keyMetrics.misses++;
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
   * Update memory metrics
   */
  updateMetrics() {
    const memUsage = process.memoryUsage();
    this.metrics.memory = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      heapUsedMB: memUsage.heapUsed / 1024 / 1024,
      heapTotalMB: memUsage.heapTotal / 1024 / 1024
    };

    // Update uptime
    this.metrics.server.uptime = Date.now() - this.metrics.server.startTime;

    // Emit memory warning if heap usage is high
    if (memUsage.heapUsed > 100 * 1024 * 1024) { // 100MB
      this.emit('memoryWarning', {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal
      });
    }
  }

  /**
   * Update throughput metrics
   */
  updateThroughput() {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    
    // Count requests in the last second
    const recentRequests = this.requestTimes.filter(time => time > oneSecondAgo);
    const currentRPS = recentRequests.length;
    
    // Update throughput metrics
    this.metrics.server.performance.throughput.requestsPerSecond = currentRPS;
    this.metrics.server.performance.throughput.peakRPS = Math.max(
      this.metrics.server.performance.throughput.peakRPS,
      currentRPS
    );
    
    // Calculate average RPS
    const totalRequests = this.metrics.server.requests.total;
    const uptimeSeconds = this.metrics.server.uptime / 1000;
    this.metrics.server.performance.throughput.averageRPS = uptimeSeconds > 0 ? totalRequests / uptimeSeconds : 0;
  }

  /**
   * Get comprehensive metrics
   * @returns {Object} Metrics data
   */
  getMetrics() {
    return {
      timestamp: new Date().toISOString(),
      server: {
        startTime: this.metrics.server.startTime,
        uptime: this.metrics.server.uptime,
        uptimeSeconds: this.metrics.server.uptime / 1000,
        requests: {
          total: this.metrics.server.requests.total,
          successful: this.metrics.server.requests.successful,
          failed: this.metrics.server.requests.failed,
          successRate: this.metrics.server.requests.total > 0 ? 
            this.metrics.server.requests.successful / this.metrics.server.requests.total : 0,
          byTool: Object.fromEntries(this.metrics.server.requests.byTool),
          byOperation: Object.fromEntries(this.metrics.server.requests.byOperation)
        },
        performance: {
          latency: {
            p50: this.metrics.server.performance.latency.p50,
            p95: this.metrics.server.performance.latency.p95,
            p99: this.metrics.server.performance.latency.p99,
            max: this.metrics.server.performance.latency.max,
            sampleCount: this.metrics.server.performance.latency.samples.length
          },
          throughput: this.metrics.server.performance.throughput
        }
      },
      cache: {
        hits: this.metrics.cache.hits,
        misses: this.metrics.cache.misses,
        hitRatio: this.metrics.cache.hitRatio,
        byKey: Object.fromEntries(this.metrics.cache.byKey)
      },
      memory: this.metrics.memory,
      discovery: {
        total: this.metrics.discovery.total,
        cached: this.metrics.discovery.cached,
        failed: this.metrics.discovery.failed,
        cacheRatio: this.metrics.discovery.total > 0 ? 
          this.metrics.discovery.cached / this.metrics.discovery.total : 0,
        latency: {
          p50: this.metrics.discovery.latency.p50,
          p95: this.metrics.discovery.latency.p95,
          p99: this.metrics.discovery.latency.p99,
          sampleCount: this.metrics.discovery.latency.samples.length
        }
      },
      mcp: {
        total: this.metrics.mcp.total,
        cached: this.metrics.mcp.cached,
        failed: this.metrics.mcp.failed,
        cacheRatio: this.metrics.mcp.total > 0 ? 
          this.metrics.mcp.cached / this.metrics.mcp.total : 0,
        latency: {
          p50: this.metrics.mcp.latency.p50,
          p95: this.metrics.mcp.latency.p95,
          p99: this.metrics.mcp.latency.p99,
          sampleCount: this.metrics.mcp.latency.samples.length
        }
      },
      a2a: {
        total: this.metrics.a2a.total,
        successful: this.metrics.a2a.successful,
        failed: this.metrics.a2a.failed,
        successRate: this.metrics.a2a.total > 0 ? 
          this.metrics.a2a.successful / this.metrics.a2a.total : 0,
        latency: {
          p50: this.metrics.a2a.latency.p50,
          p95: this.metrics.a2a.latency.p95,
          p99: this.metrics.a2a.latency.p99,
          sampleCount: this.metrics.a2a.latency.samples.length
        }
      },
      performance: {
        targets: {
          discoveryP95: 1000, // 1s
          mcpP95: 3000, // 3s
          maxHeapMB: 100
        },
        compliance: {
          discoveryP95: this.metrics.discovery.latency.p95 <= 1000,
          mcpP95: this.metrics.mcp.latency.p95 <= 3000,
          heapMB: this.metrics.memory.heapUsedMB <= 100
        }
      }
    };
  }

  /**
   * Get metrics summary for CI output
   * @returns {Object} Metrics summary
   */
  getSummary() {
    const metrics = this.getMetrics();
    return {
      timestamp: metrics.timestamp,
      uptime: metrics.server.uptimeSeconds,
      requests: {
        total: metrics.server.requests.total,
        successRate: metrics.server.requests.successRate,
        rps: metrics.server.performance.throughput.requestsPerSecond
      },
      latency: {
        p50: metrics.server.performance.latency.p50,
        p95: metrics.server.performance.latency.p95,
        p99: metrics.server.performance.latency.p99
      },
      memory: {
        heapUsedMB: metrics.memory.heapUsedMB,
        heapTotalMB: metrics.memory.heapTotalMB
      },
      cache: {
        hitRatio: metrics.cache.hitRatio
      },
      compliance: metrics.performance.compliance
    };
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      server: {
        startTime: Date.now(),
        uptime: 0,
        requests: { total: 0, successful: 0, failed: 0, byTool: new Map(), byOperation: new Map() },
        performance: { latency: { p50: 0, p95: 0, p99: 0, max: 0, samples: [] }, throughput: { requestsPerSecond: 0, peakRPS: 0, averageRPS: 0 } }
      },
      cache: { hits: 0, misses: 0, hitRatio: 0, byKey: new Map() },
      memory: { heapUsed: 0, heapTotal: 0, external: 0, rss: 0, heapUsedMB: 0, heapTotalMB: 0 },
      discovery: { total: 0, cached: 0, failed: 0, latency: { p50: 0, p95: 0, p99: 0, samples: [] } },
      mcp: { total: 0, cached: 0, failed: 0, latency: { p50: 0, p95: 0, p99: 0, samples: [] } },
      a2a: { total: 0, successful: 0, failed: 0, latency: { p50: 0, p95: 0, p99: 0, samples: [] } }
    };
    this.requestTimes = [];
    this.lastRequestCount = 0;
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    if (this.throughputInterval) {
      clearInterval(this.throughputInterval);
    }
  }
}

/**
 * Create metrics endpoint handler
 * @param {Object} options - Configuration options
 * @returns {MetricsEndpoint} Metrics endpoint instance
 */
export function createMetricsEndpoint(options = {}) {
  return new MetricsEndpoint(options);
}

export default MetricsEndpoint;
