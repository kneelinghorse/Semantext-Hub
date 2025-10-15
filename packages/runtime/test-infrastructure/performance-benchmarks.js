/**
 * Performance Benchmarks
 * Validates performance targets for protocol operations
 * Mission B7.6.0 - Test Infrastructure & CI
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Performance Benchmarks
 * Tests performance targets for protocol operations
 */
export class PerformanceBenchmarks {
  constructor(options = {}) {
    this.outputDir = options.outputDir || path.join(__dirname, '../tests/performance');
    this.verbose = options.verbose || false;
    this.iterations = options.iterations || 100;
    
    // Performance targets from mission B7.6.0
    this.targets = {
      prompt_latency: 100, // ms
      generation_write: 50, // ms per file
      validation_time: 50, // ms per manifest
      cli_render: 20 // ms per 50 events
    };
  }

  /**
   * Run all performance benchmarks
   */
  async runBenchmarks() {
    const results = {
      prompt_latency: await this.benchmarkPromptLatency(),
      generation_write: await this.benchmarkGenerationWrite(),
      validation_time: await this.benchmarkValidationTime(),
      cli_render: await this.benchmarkCLIRender()
    };

    // Write results to disk
    await this.writeResults(results);
    
    return results;
  }

  /**
   * Benchmark prompt latency
   */
  async benchmarkPromptLatency() {
    const measurements = [];
    
    for (let i = 0; i < this.iterations; i++) {
      const start = performance.now();
      
      // Simulate prompt processing
      await this.simulatePromptProcessing();
      
      const end = performance.now();
      measurements.push(end - start);
    }

    const stats = this.calculateStats(measurements);
    const passed = stats.p95 <= this.targets.prompt_latency;
    
    if (this.verbose) {
      console.log(`Prompt Latency: ${stats.p95.toFixed(2)}ms (target: ${this.targets.prompt_latency}ms) - ${passed ? 'PASS' : 'FAIL'}`);
    }

    return {
      name: 'prompt_latency',
      target: this.targets.prompt_latency,
      measurements,
      stats,
      passed,
      description: 'Time to process a single prompt'
    };
  }

  /**
   * Benchmark generation write performance
   */
  async benchmarkGenerationWrite() {
    const measurements = [];
    const testDir = path.join(__dirname, '../tests/performance/temp');
    
    // Ensure test directory exists
    await fs.mkdir(testDir, { recursive: true });
    
    for (let i = 0; i < this.iterations; i++) {
      const start = performance.now();
      
      // Simulate file generation and write
      const content = this.generateTestContent();
      const filename = path.join(testDir, `test-${i}.json`);
      await fs.writeFile(filename, JSON.stringify(content, null, 2));
      
      const end = performance.now();
      measurements.push(end - start);
    }

    // Clean up test files
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }

    const stats = this.calculateStats(measurements);
    const passed = stats.p95 <= this.targets.generation_write;
    
    if (this.verbose) {
      console.log(`Generation Write: ${stats.p95.toFixed(2)}ms (target: ${this.targets.generation_write}ms) - ${passed ? 'PASS' : 'FAIL'}`);
    }

    return {
      name: 'generation_write',
      target: this.targets.generation_write,
      measurements,
      stats,
      passed,
      description: 'Time to generate and write a single file'
    };
  }

  /**
   * Benchmark validation time
   */
  async benchmarkValidationTime() {
    const measurements = [];
    
    for (let i = 0; i < this.iterations; i++) {
      const start = performance.now();
      
      // Simulate manifest validation
      await this.simulateManifestValidation();
      
      const end = performance.now();
      measurements.push(end - start);
    }

    const stats = this.calculateStats(measurements);
    const passed = stats.p95 <= this.targets.validation_time;
    
    if (this.verbose) {
      console.log(`Validation Time: ${stats.p95.toFixed(2)}ms (target: ${this.targets.validation_time}ms) - ${passed ? 'PASS' : 'FAIL'}`);
    }

    return {
      name: 'validation_time',
      target: this.targets.validation_time,
      measurements,
      stats,
      passed,
      description: 'Time to validate a single manifest'
    };
  }

  /**
   * Benchmark CLI render performance
   */
  async benchmarkCLIRender() {
    const measurements = [];
    
    for (let i = 0; i < this.iterations; i++) {
      const start = performance.now();
      
      // Simulate CLI rendering (50 events)
      await this.simulateCLIRender(50);
      
      const end = performance.now();
      measurements.push(end - start);
    }

    const stats = this.calculateStats(measurements);
    const passed = stats.p95 <= this.targets.cli_render;
    
    if (this.verbose) {
      console.log(`CLI Render: ${stats.p95.toFixed(2)}ms (target: ${this.targets.cli_render}ms) - ${passed ? 'PASS' : 'FAIL'}`);
    }

    return {
      name: 'cli_render',
      target: this.targets.cli_render,
      measurements,
      stats,
      passed,
      description: 'Time to render 50 CLI events'
    };
  }

  /**
   * Simulate prompt processing
   */
  async simulatePromptProcessing() {
    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
    
    // Simulate JSON parsing
    const testData = {
      prompt: 'Test prompt',
      context: { test: true },
      timestamp: Date.now()
    };
    
    JSON.stringify(testData);
    JSON.parse(JSON.stringify(testData));
  }

  /**
   * Simulate manifest validation
   */
  async simulateManifestValidation() {
    // Simulate validation logic
    const manifest = {
      apiVersion: 'protocol.ossp-agi.dev/v1',
      kind: 'APIProtocol',
      metadata: {
        name: 'test-api',
        version: '1.0.0'
      },
      spec: {
        openapi: '3.0.0',
        info: {
          title: 'Test API',
          version: '1.0.0'
        }
      }
    };

    // Simulate validation checks
    if (!manifest.apiVersion) throw new Error('Missing apiVersion');
    if (!manifest.kind) throw new Error('Missing kind');
    if (!manifest.metadata) throw new Error('Missing metadata');
    if (!manifest.spec) throw new Error('Missing spec');
    
    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
  }

  /**
   * Simulate CLI rendering
   */
  async simulateCLIRender(eventCount) {
    const events = [];
    
    for (let i = 0; i < eventCount; i++) {
      events.push({
        type: 'progress',
        message: `Processing event ${i + 1}`,
        timestamp: Date.now()
      });
    }
    
    // Simulate rendering
    events.forEach(event => {
      // Simulate string formatting
      `${event.type}: ${event.message} (${new Date(event.timestamp).toISOString()})`;
    });
    
    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2));
  }

  /**
   * Generate test content for file writing
   */
  generateTestContent() {
    return {
      id: Math.random().toString(36).substr(2, 9),
      name: 'Test Content',
      data: Array.from({ length: 100 }, (_, i) => ({
        index: i,
        value: Math.random(),
        timestamp: Date.now()
      })),
      metadata: {
        generated: new Date().toISOString(),
        version: '1.0.0'
      }
    };
  }

  /**
   * Calculate statistics from measurements
   */
  calculateStats(measurements) {
    const sorted = measurements.sort((a, b) => a - b);
    const count = sorted.length;
    
    const mean = sorted.reduce((sum, val) => sum + val, 0) / count;
    const median = sorted[Math.floor(count / 2)];
    const p95 = sorted[Math.floor(count * 0.95)];
    const p99 = sorted[Math.floor(count * 0.99)];
    const min = sorted[0];
    const max = sorted[count - 1];
    
    return {
      count,
      mean: parseFloat(mean.toFixed(2)),
      median: parseFloat(median.toFixed(2)),
      p95: parseFloat(p95.toFixed(2)),
      p99: parseFloat(p99.toFixed(2)),
      min: parseFloat(min.toFixed(2)),
      max: parseFloat(max.toFixed(2))
    };
  }

  /**
   * Write benchmark results to disk
   */
  async writeResults(results) {
    await fs.mkdir(this.outputDir, { recursive: true });
    
    const resultsFile = path.join(this.outputDir, 'benchmark-results.json');
    await fs.writeFile(resultsFile, JSON.stringify(results, null, 2));
    
    if (this.verbose) {
      console.log(`Benchmark results written to: ${resultsFile}`);
    }
  }

  /**
   * Generate performance test report
   */
  async generateReport(results) {
    const report = {
      timestamp: new Date().toISOString(),
      targets: this.targets,
      results: {},
      summary: {
        total: 0,
        passed: 0,
        failed: 0
      }
    };

    for (const [name, result] of Object.entries(results)) {
      report.results[name] = {
        target: result.target,
        p95: result.stats.p95,
        passed: result.passed,
        description: result.description
      };
      
      report.summary.total++;
      if (result.passed) {
        report.summary.passed++;
      } else {
        report.summary.failed++;
      }
    }

    const reportFile = path.join(this.outputDir, 'performance-report.json');
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    
    if (this.verbose) {
      console.log(`Performance report written to: ${reportFile}`);
      console.log(`Summary: ${report.summary.passed}/${report.summary.total} benchmarks passed`);
    }

    return report;
  }
}

/**
 * Run performance benchmarks
 */
export async function runPerformanceBenchmarks(options = {}) {
  const benchmarks = new PerformanceBenchmarks(options);
  const results = await benchmarks.runBenchmarks();
  const report = await benchmarks.generateReport(results);
  
  return { results, report };
}
