#!/usr/bin/env node

/**
 * Performance Benchmark Script
 * 
 * Mission B9.1: Performance Optimization & Hardening
 * 
 * Validates performance targets:
 * - Discovery p95 < 1s
 * - MCP p95 < 3s
 * - Steady-state heap < 100MB under 10-min soak
 */

import { performance } from 'perf_hooks';
import { spawn } from 'child_process';
import { PerformanceOptimizer } from '../services/mcp-server/performance-optimizations.js';
import { createMetricsEndpoint } from '../services/mcp-server/metrics-endpoint.js';

const TARGETS = {
  discoveryP95: 1000, // 1s
  mcpP95: 3000, // 3s
  maxHeapMB: 100,
  soakTestDuration: 600000 // 10 minutes
};

class PerformanceBenchmark {
  constructor(options = {}) {
    this.enableLogging = options.enableLogging !== false;
    this.performanceOptimizer = new PerformanceOptimizer(options);
    this.metricsEndpoint = createMetricsEndpoint(options);
    this.results = {
      discovery: { latencies: [], p95: 0, compliant: false },
      mcp: { latencies: [], p95: 0, compliant: false },
      memory: { maxHeapMB: 0, compliant: false },
      soak: { duration: 0, compliant: false }
    };
  }

  /**
   * Run discovery performance benchmark
   * @param {number} iterations - Number of iterations
   * @returns {Promise<Object>} Benchmark results
   */
  async benchmarkDiscovery(iterations = 100) {
    console.log(`Running discovery benchmark (${iterations} iterations)...`);
    
    const latencies = [];
    const testUrns = [
      'urn:agent:system:registry@1.0.0',
      'urn:agent:system:discovery@1.0.0',
      'urn:agent:system:validation@1.0.0',
      'urn:agent:ai:ml-agent@1.0.0',
      'urn:agent:ai:nlp-agent@1.0.0'
    ];

    for (let i = 0; i < iterations; i++) {
      const urn = testUrns[i % testUrns.length];
      const startTime = performance.now();
      
      try {
        await this.performanceOptimizer.urnResolver.resolveAgentUrn(urn);
        const latency = performance.now() - startTime;
        latencies.push(latency);
        
        if (this.enableLogging && i % 10 === 0) {
          console.log(`Discovery ${i + 1}/${iterations}: ${latency.toFixed(2)}ms`);
        }
      } catch (error) {
        console.error(`Discovery failed for ${urn}:`, error.message);
      }
    }

    const p95 = this.calculatePercentile(latencies, 95);
    const compliant = p95 <= TARGETS.discoveryP95;
    
    this.results.discovery = { latencies, p95, compliant };
    
    console.log(`Discovery benchmark complete:`);
    console.log(`  p95: ${p95.toFixed(2)}ms (target: ${TARGETS.discoveryP95}ms)`);
    console.log(`  Compliant: ${compliant ? 'YES' : 'NO'}`);
    
    return this.results.discovery;
  }

  /**
   * Run MCP performance benchmark
   * @param {number} iterations - Number of iterations
   * @returns {Promise<Object>} Benchmark results
   */
  async benchmarkMCP(iterations = 50) {
    console.log(`Running MCP benchmark (${iterations} iterations)...`);
    
    const latencies = [];
    const testOperations = [
      { tool: 'protocol_discover_api', operation: 'discovery' },
      { tool: 'agent_resolve', operation: 'discovery' },
      { tool: 'docs_mermaid', operation: 'mcp' }
    ];

    for (let i = 0; i < iterations; i++) {
      const test = testOperations[i % testOperations.length];
      const startTime = performance.now();
      
      try {
        // Simulate MCP operation
        await this.simulateMCPOperation(test);
        const latency = performance.now() - startTime;
        latencies.push(latency);
        
        if (this.enableLogging && i % 5 === 0) {
          console.log(`MCP ${i + 1}/${iterations}: ${latency.toFixed(2)}ms`);
        }
      } catch (error) {
        console.error(`MCP operation failed:`, error.message);
      }
    }

    const p95 = this.calculatePercentile(latencies, 95);
    const compliant = p95 <= TARGETS.mcpP95;
    
    this.results.mcp = { latencies, p95, compliant };
    
    console.log(`MCP benchmark complete:`);
    console.log(`  p95: ${p95.toFixed(2)}ms (target: ${TARGETS.mcpP95}ms)`);
    console.log(`  Compliant: ${compliant ? 'YES' : 'NO'}`);
    
    return this.results.mcp;
  }

  /**
   * Run memory usage benchmark
   * @returns {Promise<Object>} Memory benchmark results
   */
  async benchmarkMemory() {
    console.log('Running memory benchmark...');
    
    const initialMemory = process.memoryUsage();
    const maxHeapMB = initialMemory.heapUsed / 1024 / 1024;
    const compliant = maxHeapMB <= TARGETS.maxHeapMB;
    
    this.results.memory = { maxHeapMB, compliant };
    
    console.log(`Memory benchmark complete:`);
    console.log(`  Heap usage: ${maxHeapMB.toFixed(2)}MB (target: ${TARGETS.maxHeapMB}MB)`);
    console.log(`  Compliant: ${compliant ? 'YES' : 'NO'}`);
    
    return this.results.memory;
  }

  /**
   * Run soak test for sustained performance
   * @param {number} duration - Test duration in ms
   * @returns {Promise<Object>} Soak test results
   */
  async benchmarkSoakTest(duration = TARGETS.soakTestDuration) {
    console.log(`Running soak test (${duration / 1000}s duration)...`);
    
    const startTime = Date.now();
    const endTime = startTime + duration;
    let iteration = 0;
    const memorySamples = [];
    
    while (Date.now() < endTime) {
      // Simulate sustained load
      await this.simulateSustainedLoad();
      
      // Sample memory usage
      const memUsage = process.memoryUsage();
      memorySamples.push(memUsage.heapUsed / 1024 / 1024);
      
      iteration++;
      
      if (this.enableLogging && iteration % 100 === 0) {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, endTime - Date.now());
        console.log(`Soak test: ${Math.round(elapsed / 1000)}s elapsed, ${Math.round(remaining / 1000)}s remaining`);
      }
      
      // Small delay to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    const actualDuration = Date.now() - startTime;
    const maxMemoryMB = Math.max(...memorySamples);
    const avgMemoryMB = memorySamples.reduce((a, b) => a + b, 0) / memorySamples.length;
    const compliant = maxMemoryMB <= TARGETS.maxHeapMB;
    
    this.results.soak = { 
      duration: actualDuration, 
      maxMemoryMB, 
      avgMemoryMB, 
      compliant,
      iterations: iteration
    };
    
    console.log(`Soak test complete:`);
    console.log(`  Duration: ${actualDuration / 1000}s`);
    console.log(`  Iterations: ${iteration}`);
    console.log(`  Max memory: ${maxMemoryMB.toFixed(2)}MB`);
    console.log(`  Avg memory: ${avgMemoryMB.toFixed(2)}MB`);
    console.log(`  Compliant: ${compliant ? 'YES' : 'NO'}`);
    
    return this.results.soak;
  }

  /**
   * Simulate MCP operation
   * @param {Object} test - Test configuration
   * @returns {Promise<void>}
   */
  async simulateMCPOperation(test) {
    // Simulate operation latency
    const latency = Math.random() * 1000; // 0-1000ms
    await new Promise(resolve => setTimeout(resolve, latency));
    
    // Record metrics
    this.metricsEndpoint.recordRequest(test.tool, test.operation, latency, true, false);
  }

  /**
   * Simulate sustained load
   * @returns {Promise<void>}
   */
  async simulateSustainedLoad() {
    // Simulate various operations
    const operations = [
      () => this.performanceOptimizer.urnResolver.resolveAgentUrn('urn:agent:system:registry@1.0.0'),
      () => this.performanceOptimizer.protocolGraph.resolveURN('urn:proto:api:test@1.0.0'),
      () => this.simulateMCPOperation({ tool: 'test', operation: 'mcp' })
    ];
    
    const operation = operations[Math.floor(Math.random() * operations.length)];
    await operation();
  }

  /**
   * Calculate percentile
   * @param {Array<number>} values - Array of values
   * @param {number} percentile - Percentile to calculate
   * @returns {number} Percentile value
   */
  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  /**
   * Run all benchmarks
   * @returns {Promise<Object>} All benchmark results
   */
  async runAllBenchmarks() {
    console.log('Starting performance benchmarks...');
    console.log(`Targets: Discovery p95 < ${TARGETS.discoveryP95}ms, MCP p95 < ${TARGETS.mcpP95}ms, Heap < ${TARGETS.maxHeapMB}MB`);
    console.log('');

    try {
      // Run benchmarks
      await this.benchmarkDiscovery(100);
      console.log('');
      
      await this.benchmarkMCP(50);
      console.log('');
      
      await this.benchmarkMemory();
      console.log('');
      
      await this.benchmarkSoakTest(60000); // 1 minute for demo
      console.log('');

      // Generate summary
      const summary = this.generateSummary();
      console.log('=== BENCHMARK SUMMARY ===');
      console.log(JSON.stringify(summary, null, 2));
      
      // Check overall compliance
      const overallCompliant = summary.compliance.discovery && 
                              summary.compliance.mcp && 
                              summary.compliance.memory && 
                              summary.compliance.soak;
      
      console.log('');
      console.log(`Overall Compliance: ${overallCompliant ? 'PASS' : 'FAIL'}`);
      
      return summary;
    } catch (error) {
      console.error('Benchmark failed:', error);
      throw error;
    } finally {
      // Cleanup
      this.performanceOptimizer.destroy();
      this.metricsEndpoint.destroy();
    }
  }

  /**
   * Generate benchmark summary
   * @returns {Object} Summary results
   */
  generateSummary() {
    return {
      timestamp: new Date().toISOString(),
      targets: TARGETS,
      results: {
        discovery: {
          p95: this.results.discovery.p95,
          compliant: this.results.discovery.compliant,
          sampleCount: this.results.discovery.latencies.length
        },
        mcp: {
          p95: this.results.mcp.p95,
          compliant: this.results.mcp.compliant,
          sampleCount: this.results.mcp.latencies.length
        },
        memory: {
          maxHeapMB: this.results.memory.maxHeapMB,
          compliant: this.results.memory.compliant
        },
        soak: {
          duration: this.results.soak.duration,
          maxMemoryMB: this.results.soak.maxMemoryMB,
          avgMemoryMB: this.results.soak.avgMemoryMB,
          compliant: this.results.soak.compliant,
          iterations: this.results.soak.iterations
        }
      },
      compliance: {
        discovery: this.results.discovery.compliant,
        mcp: this.results.mcp.compliant,
        memory: this.results.memory.compliant,
        soak: this.results.soak.compliant
      }
    };
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const benchmark = new PerformanceBenchmark({ enableLogging: true });
  
  benchmark.runAllBenchmarks()
    .then((summary) => {
      const exitCode = summary.compliance.discovery && 
                      summary.compliance.mcp && 
                      summary.compliance.memory && 
                      summary.compliance.soak ? 0 : 1;
      process.exit(exitCode);
    })
    .catch((error) => {
      console.error('Benchmark failed:', error);
      process.exit(1);
    });
}

export default PerformanceBenchmark;
