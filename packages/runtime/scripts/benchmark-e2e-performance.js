#!/usr/bin/env node

/**
 * E2E Performance Benchmarking Script
 * 
 * This script benchmarks the performance of the multi-agent E2E workflow,
 * including latency, throughput, memory usage, and success rates.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { performance } from 'perf_hooks';
import { MultiAgentE2EDemo } from '../examples/multi-agent-e2e-demo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Benchmark configuration
const BENCHMARK_CONFIG = {
  iterations: 10,
  warmupIterations: 2,
  timeout: 60000, // 60 seconds per iteration
  concurrency: 1,
  performanceThresholds: {
    endToEndLatency: 5000,    // 5 seconds
    discoveryLatency: 1000,   // 1 second
    a2aLatency: 2000,         // 2 seconds
    mcpLatency: 3000,         // 3 seconds
    memoryUsage: 100 * 1024 * 1024, // 100MB
    successRate: 0.8 // 80%
  },
  output: {
    format: 'json', // 'json', 'csv', 'table'
    file: null // null for console output
  }
};

/**
 * E2E Performance Benchmarker Class
 */
class E2EPerformanceBenchmarker {
  constructor(config = BENCHMARK_CONFIG) {
    this.config = config;
    this.results = {
      benchmark: {
        startTime: null,
        endTime: null,
        duration: 0,
        iterations: 0,
        warmupIterations: 0,
        concurrency: 0
      },
      iterations: [],
      statistics: {},
      performance: {},
      summary: {}
    };
  }

  /**
   * Run performance benchmark
   */
  async benchmark() {
    console.log('🚀 Starting E2E Performance Benchmark...\n');
    console.log(`Configuration:`);
    console.log(`  Iterations: ${this.config.iterations}`);
    console.log(`  Warmup Iterations: ${this.config.warmupIterations}`);
    console.log(`  Concurrency: ${this.config.concurrency}`);
    console.log(`  Timeout: ${this.config.timeout}ms\n`);

    this.results.benchmark.startTime = performance.now();
    this.results.benchmark.iterations = this.config.iterations;
    this.results.benchmark.warmupIterations = this.config.warmupIterations;
    this.results.benchmark.concurrency = this.config.concurrency;

    try {
      // Warmup iterations
      if (this.config.warmupIterations > 0) {
        console.log('🔥 Running warmup iterations...');
        for (let i = 0; i < this.config.warmupIterations; i++) {
          console.log(`  Warmup ${i + 1}/${this.config.warmupIterations}`);
          await this.runIteration(i, true);
        }
        console.log('✅ Warmup completed\n');
      }

      // Main benchmark iterations
      console.log('📊 Running benchmark iterations...');
      for (let i = 0; i < this.config.iterations; i++) {
        console.log(`  Iteration ${i + 1}/${this.config.iterations}`);
        const iterationResult = await this.runIteration(i, false);
        this.results.iterations.push(iterationResult);
      }

      // Calculate statistics
      this.results.statistics = this.calculateStatistics();
      this.results.performance = this.analyzePerformance();
      this.results.summary = this.generateSummary();

      this.results.benchmark.endTime = performance.now();
      this.results.benchmark.duration = this.results.benchmark.endTime - this.results.benchmark.startTime;

      console.log('\n✅ E2E Performance Benchmark Completed');
      this.printResults();

      return this.results;

    } catch (error) {
      this.results.benchmark.endTime = performance.now();
      this.results.benchmark.duration = this.results.benchmark.endTime - this.results.benchmark.startTime;

      console.error('\n❌ E2E Performance Benchmark Failed');
      console.error(`Error: ${error.message}`);
      console.error(`Duration: ${this.results.benchmark.duration.toFixed(2)}ms`);

      throw error;
    }
  }

  /**
   * Run a single benchmark iteration
   */
  async runIteration(iterationIndex, isWarmup = false) {
    const startTime = performance.now();
    const demo = new MultiAgentE2EDemo();

    try {
      await demo.initialize();
      const summary = await demo.runDemo();
      const endTime = performance.now();

      const iterationResult = {
        iteration: iterationIndex + 1,
        isWarmup,
        startTime,
        endTime,
        duration: endTime - startTime,
        success: summary.success,
        correlationId: summary.correlationId,
        timestamp: summary.timestamp,
        performanceMetrics: summary.performanceMetrics,
        steps: summary.steps
      };

      if (!isWarmup) {
        console.log(`    Duration: ${iterationResult.duration.toFixed(2)}ms`);
        console.log(`    Success: ${iterationResult.success ? 'YES' : 'NO'}`);
      }

      return iterationResult;

    } finally {
      await demo.cleanup();
    }
  }

  /**
   * Calculate benchmark statistics
   */
  calculateStatistics() {
    const iterations = this.results.iterations;
    if (iterations.length === 0) {
      return {};
    }

    // Duration statistics
    const durations = iterations.map(i => i.duration);
    const durationStats = {
      min: Math.min(...durations),
      max: Math.max(...durations),
      mean: durations.reduce((a, b) => a + b, 0) / durations.length,
      median: this.calculateMedian(durations),
      p95: this.calculatePercentile(durations, 95),
      p99: this.calculatePercentile(durations, 99),
      stdDev: this.calculateStandardDeviation(durations)
    };

    // Success rate
    const successfulIterations = iterations.filter(i => i.success).length;
    const successRate = successfulIterations / iterations.length;

    // Performance metrics statistics
    const performanceStats = {};
    const metricKeys = ['discovery', 'a2a', 'mcp', 'workflow', 'errorHandling', 'performance'];

    metricKeys.forEach(key => {
      const values = iterations
        .map(i => i.performanceMetrics[key]?.duration)
        .filter(v => v !== undefined);

      if (values.length > 0) {
        performanceStats[key] = {
          min: Math.min(...values),
          max: Math.max(...values),
          mean: values.reduce((a, b) => a + b, 0) / values.length,
          median: this.calculateMedian(values),
          p95: this.calculatePercentile(values, 95),
          p99: this.calculatePercentile(values, 99),
          stdDev: this.calculateStandardDeviation(values)
        };
      }
    });

    return {
      totalIterations: iterations.length,
      successfulIterations,
      failedIterations: iterations.length - successfulIterations,
      successRate,
      duration: durationStats,
      performance: performanceStats
    };
  }

  /**
   * Analyze performance against thresholds
   */
  analyzePerformance() {
    const stats = this.results.statistics;
    const thresholds = this.config.performanceThresholds;

    return {
      endToEndLatency: {
        threshold: thresholds.endToEndLatency,
        actual: stats.duration?.mean || 0,
        passed: (stats.duration?.mean || 0) < thresholds.endToEndLatency,
        p95Passed: (stats.duration?.p95 || 0) < thresholds.endToEndLatency
      },
      discoveryLatency: {
        threshold: thresholds.discoveryLatency,
        actual: stats.performance?.discovery?.mean || 0,
        passed: (stats.performance?.discovery?.mean || 0) < thresholds.discoveryLatency
      },
      a2aLatency: {
        threshold: thresholds.a2aLatency,
        actual: stats.performance?.a2a?.mean || 0,
        passed: (stats.performance?.a2a?.mean || 0) < thresholds.a2aLatency
      },
      mcpLatency: {
        threshold: thresholds.mcpLatency,
        actual: stats.performance?.mcp?.mean || 0,
        passed: (stats.performance?.mcp?.mean || 0) < thresholds.mcpLatency
      },
      successRate: {
        threshold: thresholds.successRate,
        actual: stats.successRate || 0,
        passed: (stats.successRate || 0) >= thresholds.successRate
      }
    };
  }

  /**
   * Generate benchmark summary
   */
  generateSummary() {
    const stats = this.results.statistics;
    const performance = this.results.performance;

    const allPerformancePassed = Object.values(performance).every(p => p.passed);
    const overallSuccess = stats.successRate >= this.config.performanceThresholds.successRate && allPerformancePassed;

    return {
      overallSuccess,
      performancePassed: allPerformancePassed,
      successRatePassed: stats.successRate >= this.config.performanceThresholds.successRate,
      totalIterations: stats.totalIterations,
      successfulIterations: stats.successfulIterations,
      failedIterations: stats.failedIterations,
      successRate: stats.successRate,
      averageDuration: stats.duration?.mean || 0,
      p95Duration: stats.duration?.p95 || 0,
      p99Duration: stats.duration?.p99 || 0
    };
  }

  /**
   * Print benchmark results
   */
  printResults() {
    console.log('\n📊 E2E Performance Benchmark Results');
    console.log('=====================================');

    // Overall status
    const status = this.results.summary.overallSuccess ? '✅ PASSED' : '❌ FAILED';
    console.log(`Overall Status: ${status}`);
    console.log(`Total Duration: ${this.results.benchmark.duration.toFixed(2)}ms`);

    // Iteration summary
    console.log('\n📈 Iteration Summary:');
    console.log(`  Total Iterations: ${this.results.summary.totalIterations}`);
    console.log(`  Successful Iterations: ${this.results.summary.successfulIterations}`);
    console.log(`  Failed Iterations: ${this.results.summary.failedIterations}`);
    console.log(`  Success Rate: ${(this.results.summary.successRate * 100).toFixed(1)}%`);

    // Duration statistics
    console.log('\n⏱️  Duration Statistics:');
    const durationStats = this.results.statistics.duration;
    if (durationStats) {
      console.log(`  Mean: ${durationStats.mean.toFixed(2)}ms`);
      console.log(`  Median: ${durationStats.median.toFixed(2)}ms`);
      console.log(`  Min: ${durationStats.min.toFixed(2)}ms`);
      console.log(`  Max: ${durationStats.max.toFixed(2)}ms`);
      console.log(`  P95: ${durationStats.p95.toFixed(2)}ms`);
      console.log(`  P99: ${durationStats.p99.toFixed(2)}ms`);
      console.log(`  Std Dev: ${durationStats.stdDev.toFixed(2)}ms`);
    }

    // Performance analysis
    console.log('\n⚡ Performance Analysis:');
    Object.entries(this.results.performance).forEach(([metricName, metric]) => {
      const status = metric.passed ? '✅' : '❌';
      console.log(`  ${status} ${metricName}:`);
      console.log(`    Threshold: ${metric.threshold}ms`);
      console.log(`    Actual: ${metric.actual.toFixed(2)}ms`);
      console.log(`    Passed: ${metric.passed ? 'YES' : 'NO'}`);
    });

    // Performance metrics breakdown
    console.log('\n📊 Performance Metrics Breakdown:');
    const performanceStats = this.results.statistics.performance;
    Object.entries(performanceStats).forEach(([metricName, stats]) => {
      console.log(`  ${metricName}:`);
      console.log(`    Mean: ${stats.mean.toFixed(2)}ms`);
      console.log(`    Median: ${stats.median.toFixed(2)}ms`);
      console.log(`    P95: ${stats.p95.toFixed(2)}ms`);
      console.log(`    P99: ${stats.p99.toFixed(2)}ms`);
    });

    // Summary
    console.log('\n🎯 Summary:');
    console.log(`  Overall Success: ${this.results.summary.overallSuccess ? 'YES' : 'NO'}`);
    console.log(`  Performance Passed: ${this.results.summary.performancePassed ? 'YES' : 'NO'}`);
    console.log(`  Success Rate Passed: ${this.results.summary.successRatePassed ? 'YES' : 'NO'}`);
    console.log(`  Average Duration: ${this.results.summary.averageDuration.toFixed(2)}ms`);
    console.log(`  P95 Duration: ${this.results.summary.p95Duration.toFixed(2)}ms`);
    console.log(`  P99 Duration: ${this.results.summary.p99Duration.toFixed(2)}ms`);

    console.log('\n=====================================');
  }

  /**
   * Export results to file
   */
  async exportResults(outputPath) {
    const fs = await import('fs');
    const path = await import('path');
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const format = this.config.output.format || 'json';
    
    if (format === 'json') {
      fs.writeFileSync(outputPath, JSON.stringify(this.results, null, 2));
    } else if (format === 'csv') {
      const csv = this.generateCSV();
      fs.writeFileSync(outputPath, csv);
    } else if (format === 'table') {
      const table = this.generateTable();
      fs.writeFileSync(outputPath, table);
    }

    console.log(`\n📄 Results exported to: ${outputPath}`);
  }

  /**
   * Generate CSV output
   */
  generateCSV() {
    const iterations = this.results.iterations;
    if (iterations.length === 0) {
      return '';
    }

    const headers = [
      'iteration',
      'duration',
      'success',
      'discovery_duration',
      'a2a_duration',
      'mcp_duration',
      'workflow_duration',
      'error_handling_duration',
      'performance_duration'
    ];

    const rows = iterations.map(iteration => [
      iteration.iteration,
      iteration.duration,
      iteration.success,
      iteration.performanceMetrics.discovery?.duration || 0,
      iteration.performanceMetrics.a2a?.duration || 0,
      iteration.performanceMetrics.mcp?.duration || 0,
      iteration.performanceMetrics.workflow?.duration || 0,
      iteration.performanceMetrics.errorHandling?.duration || 0,
      iteration.performanceMetrics.performance?.duration || 0
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  /**
   * Generate table output
   */
  generateTable() {
    const iterations = this.results.iterations;
    if (iterations.length === 0) {
      return 'No iterations to display';
    }

    const table = [
      'Iteration | Duration (ms) | Success | Discovery | A2A | MCP | Workflow | Error | Performance',
      '----------|---------------|---------|-----------|-----|-----|----------|-------|------------'
    ];

    iterations.forEach(iteration => {
      const row = [
        iteration.iteration.toString().padStart(9),
        iteration.duration.toFixed(2).padStart(13),
        (iteration.success ? 'YES' : 'NO').padStart(7),
        (iteration.performanceMetrics.discovery?.duration || 0).toFixed(2).padStart(9),
        (iteration.performanceMetrics.a2a?.duration || 0).toFixed(2).padStart(3),
        (iteration.performanceMetrics.mcp?.duration || 0).toFixed(2).padStart(3),
        (iteration.performanceMetrics.workflow?.duration || 0).toFixed(2).padStart(8),
        (iteration.performanceMetrics.errorHandling?.duration || 0).toFixed(2).padStart(5),
        (iteration.performanceMetrics.performance?.duration || 0).toFixed(2).padStart(11)
      ].join(' | ');

      table.push(row);
    });

    return table.join('\n');
  }

  /**
   * Calculate median
   */
  calculateMedian(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  /**
   * Calculate percentile
   */
  calculatePercentile(values, percentile) {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  /**
   * Calculate standard deviation
   */
  calculateStandardDeviation(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  const config = { ...BENCHMARK_CONFIG };
  let outputPath = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--iterations' && i + 1 < args.length) {
      config.iterations = parseInt(args[i + 1]);
      i++;
    } else if (arg === '--warmup' && i + 1 < args.length) {
      config.warmupIterations = parseInt(args[i + 1]);
      i++;
    } else if (arg === '--concurrency' && i + 1 < args.length) {
      config.concurrency = parseInt(args[i + 1]);
      i++;
    } else if (arg === '--timeout' && i + 1 < args.length) {
      config.timeout = parseInt(args[i + 1]);
      i++;
    } else if (arg === '--output' && i + 1 < args.length) {
      outputPath = args[i + 1];
      i++;
    } else if (arg === '--format' && i + 1 < args.length) {
      config.output.format = args[i + 1];
      i++;
    }
  }

  // Set default output path if not provided
  if (!outputPath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    outputPath = join(__dirname, `../data/benchmark-results-${timestamp}.json`);
  }

  const benchmarker = new E2EPerformanceBenchmarker(config);

  try {
    const results = await benchmarker.benchmark();

    // Export results
    await benchmarker.exportResults(outputPath);

    // Exit with appropriate code
    process.exit(results.summary.overallSuccess ? 0 : 1);

  } catch (error) {
    console.error('Benchmark script failed:', error.message);
    process.exit(1);
  }
}

// Run benchmark if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { E2EPerformanceBenchmarker };
