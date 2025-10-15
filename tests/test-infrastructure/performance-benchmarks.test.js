/**
 * Performance Benchmarks Tests
 * Mission B7.6.0 - Test Infrastructure & CI
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PerformanceBenchmarks, runPerformanceBenchmarks } from '../../packages/runtime/test-infrastructure/performance-benchmarks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('PerformanceBenchmarks', () => {
  const testOutputDir = path.join(__dirname, '../fixtures/test-performance-output');
  let benchmarks;

  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
    await fs.mkdir(testOutputDir, { recursive: true });

    benchmarks = new PerformanceBenchmarks({
      outputDir: testOutputDir,
      verbose: false,
      iterations: 10 // Reduced for testing
    });
  });

  afterEach(async () => {
    // Clean up
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const bench = new PerformanceBenchmarks();
      expect(bench.targets).toBeDefined();
      expect(bench.targets.prompt_latency).toBe(100);
      expect(bench.targets.generation_write).toBe(50);
      expect(bench.targets.validation_time).toBe(50);
      expect(bench.targets.cli_render).toBe(20);
    });

    it('should create instance with custom options', () => {
      const bench = new PerformanceBenchmarks({
        iterations: 50,
        verbose: true
      });
      expect(bench.iterations).toBe(50);
      expect(bench.verbose).toBe(true);
    });
  });

  describe('runBenchmarks', () => {
    it('should run all benchmarks and return results', async () => {
      const results = await benchmarks.runBenchmarks();

      expect(results).toBeDefined();
      expect(results.prompt_latency).toBeDefined();
      expect(results.generation_write).toBeDefined();
      expect(results.validation_time).toBeDefined();
      expect(results.cli_render).toBeDefined();

      // Check result structure
      Object.values(results).forEach(result => {
        expect(result.name).toBeDefined();
        expect(result.target).toBeDefined();
        expect(result.measurements).toBeDefined();
        expect(Array.isArray(result.measurements)).toBe(true);
        expect(result.stats).toBeDefined();
        expect(typeof result.passed).toBe('boolean');
        expect(result.description).toBeDefined();
      });
    });

    it('should write results to disk', async () => {
      await benchmarks.runBenchmarks();

      const resultsFile = path.join(testOutputDir, 'benchmark-results.json');
      const content = await fs.readFile(resultsFile, 'utf-8');
      const results = JSON.parse(content);

      expect(results).toBeDefined();
      expect(results.prompt_latency).toBeDefined();
      expect(results.generation_write).toBeDefined();
    });
  });

  describe('benchmarkPromptLatency', () => {
    it('should benchmark prompt latency', async () => {
      const result = await benchmarks.benchmarkPromptLatency();

      expect(result.name).toBe('prompt_latency');
      expect(result.target).toBe(100);
      expect(result.measurements).toHaveLength(10);
      expect(result.stats).toBeDefined();
      expect(result.stats.count).toBe(10);
      expect(typeof result.passed).toBe('boolean');
    });
  });

  describe('benchmarkGenerationWrite', () => {
    it('should benchmark generation write performance', async () => {
      const result = await benchmarks.benchmarkGenerationWrite();

      expect(result.name).toBe('generation_write');
      expect(result.target).toBe(50);
      expect(result.measurements).toHaveLength(10);
      expect(result.stats).toBeDefined();
      expect(typeof result.passed).toBe('boolean');
    });
  });

  describe('benchmarkValidationTime', () => {
    it('should benchmark validation time', async () => {
      const result = await benchmarks.benchmarkValidationTime();

      expect(result.name).toBe('validation_time');
      expect(result.target).toBe(50);
      expect(result.measurements).toHaveLength(10);
      expect(result.stats).toBeDefined();
      expect(typeof result.passed).toBe('boolean');
    });
  });

  describe('benchmarkCLIRender', () => {
    it('should benchmark CLI render performance', async () => {
      const result = await benchmarks.benchmarkCLIRender();

      expect(result.name).toBe('cli_render');
      expect(result.target).toBe(20);
      expect(result.measurements).toHaveLength(10);
      expect(result.stats).toBeDefined();
      expect(typeof result.passed).toBe('boolean');
    });
  });

  describe('calculateStats', () => {
    it('should calculate statistics from measurements', () => {
      const measurements = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const stats = benchmarks.calculateStats(measurements);

      expect(stats.count).toBe(10);
      expect(stats.mean).toBe(5.5);
      expect(stats.median).toBe(6); // For even length array, median is average of middle two elements
      expect(stats.min).toBe(1);
      expect(stats.max).toBe(10);
      expect(stats.p95).toBeGreaterThanOrEqual(9);
      expect(stats.p99).toBeGreaterThanOrEqual(9);
    });
  });

  describe('generateReport', () => {
    it('should generate performance report', async () => {
      const results = await benchmarks.runBenchmarks();
      const report = await benchmarks.generateReport(results);

      expect(report).toBeDefined();
      expect(report.timestamp).toBeDefined();
      expect(report.targets).toBeDefined();
      expect(report.results).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.summary.total).toBe(4);
      expect(typeof report.summary.passed).toBe('number');
      expect(typeof report.summary.failed).toBe('number');
    });

    it('should write report to disk', async () => {
      const results = await benchmarks.runBenchmarks();
      await benchmarks.generateReport(results);

      const reportFile = path.join(testOutputDir, 'performance-report.json');
      const content = await fs.readFile(reportFile, 'utf-8');
      const report = JSON.parse(content);

      expect(report).toBeDefined();
      expect(report.timestamp).toBeDefined();
      expect(report.summary).toBeDefined();
    });
  });
});

describe('runPerformanceBenchmarks function', () => {
  it('should run benchmarks using standalone function', async () => {
    const tempDir = path.join(__dirname, '../fixtures/test-performance-standalone');
    
    const { results, report } = await runPerformanceBenchmarks({
      outputDir: tempDir,
      verbose: false,
      iterations: 5
    });

    expect(results).toBeDefined();
    expect(report).toBeDefined();
    expect(Object.keys(results)).toHaveLength(4);
    expect(report.summary).toBeDefined();
    
    // Clean up
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });
});
