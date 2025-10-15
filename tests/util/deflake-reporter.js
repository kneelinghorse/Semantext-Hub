#!/usr/bin/env node

/**
 * Deflake Test Reporter
 * 
 * Analyzes multiple deflake test runs and generates a comprehensive flakiness report.
 * Usage: node deflake-reporter.js
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DeflakeReporter {
  constructor() {
    this.resultsDir = path.join(__dirname, '../..');
    this.results = [];
    this.testStats = new Map();
  }

  async generateReport() {
    console.log('📊 Generating deflake report...');
    
    try {
      await this.loadResults();
      await this.analyzeResults();
      const report = this.generateSummary();
      await this.saveReport(report);
      
      console.log('✅ Deflake report generated successfully!');
      console.log(`📈 Overall flake rate: ${(report.summary.overallFailureRate * 100).toFixed(2)}%`);
      console.log(`🎯 Target: <1% (${report.summary.overallFailureRate < 0.01 ? 'PASSED' : 'FAILED'})`);
      
      if (report.flakyTests.length > 0) {
        console.log(`⚠️  Flaky tests detected: ${report.flakyTests.length}`);
        report.flakyTests.forEach(test => console.log(`   - ${test}`));
      } else {
        console.log('🎉 No flaky tests detected!');
      }
      
      return report;
    } catch (error) {
      console.error('❌ Failed to generate report:', error.message);
      process.exit(1);
    }
  }

  async loadResults() {
    try {
      const files = await fs.readdir(this.resultsDir);
      const resultFiles = files.filter(file => file.startsWith('deflake-results-') && file.endsWith('.json'));
      
      console.log(`📁 Found ${resultFiles.length} result files`);
      
      for (const file of resultFiles) {
        try {
          const filepath = path.join(this.resultsDir, file);
          const content = await fs.readFile(filepath, 'utf8');
          const result = JSON.parse(content);
          this.results.push(result);
        } catch (error) {
          console.warn(`⚠️  Failed to load ${file}:`, error.message);
        }
      }
      
      if (this.results.length === 0) {
        throw new Error('No deflake results found');
      }
      
      console.log(`📊 Loaded ${this.results.length} test runs`);
    } catch (error) {
      throw new Error(`Failed to load results: ${error.message}`);
    }
  }

  async analyzeResults() {
    console.log('🔍 Analyzing test results...');
    
    // Initialize test statistics
    for (const result of this.results) {
      for (const testResult of result.testResults) {
        if (!this.testStats.has(testResult.file)) {
          this.testStats.set(testResult.file, {
            totalRuns: 0,
            passedRuns: 0,
            failedRuns: 0,
            flakyRuns: 0,
            failureRate: 0,
            isFlaky: false,
            avgDuration: 0,
            durations: []
          });
        }
        
        const stats = this.testStats.get(testResult.file);
        stats.totalRuns++;
        stats.durations.push(result.duration);
        
        if (testResult.status === 'passed') {
          stats.passedRuns++;
        } else {
          stats.failedRuns++;
          if (testResult.flaky) {
            stats.flakyRuns++;
          }
        }
      }
    }
    
    // Calculate statistics
    for (const [testFile, stats] of this.testStats.entries()) {
      stats.failureRate = stats.totalRuns > 0 ? stats.failedRuns / stats.totalRuns : 0;
      stats.isFlaky = stats.failureRate > 0.1; // Consider flaky if >10% failure rate
      stats.avgDuration = stats.durations.reduce((sum, d) => sum + d, 0) / stats.durations.length;
    }
  }

  generateSummary() {
    const flakyTests = Array.from(this.testStats.entries())
      .filter(([_, stats]) => stats.isFlaky)
      .map(([testFile, _]) => testFile);
    
    let totalRuns = 0;
    let totalFailures = 0;
    
    for (const stats of this.testStats.values()) {
      totalRuns += stats.totalRuns;
      totalFailures += stats.failedRuns;
    }
    
    const overallFailureRate = totalRuns > 0 ? totalFailures / totalRuns : 0;
    
    // Calculate confidence intervals
    const confidenceInterval = this.calculateConfidenceInterval(overallFailureRate, totalRuns);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(flakyTests, overallFailureRate);
    
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalRuns,
        totalFailures,
        overallFailureRate,
        confidenceInterval,
        targetMet: overallFailureRate < 0.01,
        flakyTestsCount: flakyTests.length
      },
      flakyTests,
      testStats: Object.fromEntries(this.testStats),
      recommendations,
      rawResults: this.results
    };
  }

  calculateConfidenceInterval(failureRate, sampleSize) {
    if (sampleSize === 0) return { lower: 0, upper: 0, confidence: 0.95 };
    
    // Wilson score interval for binomial proportion
    const z = 1.96; // 95% confidence
    const n = sampleSize;
    const p = failureRate;
    
    const denominator = 1 + (z * z) / n;
    const center = (p + (z * z) / (2 * n)) / denominator;
    const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n) / denominator;
    
    return {
      lower: Math.max(0, center - margin),
      upper: Math.min(1, center + margin),
      confidence: 0.95
    };
  }

  generateRecommendations(flakyTests, overallFailureRate) {
    const recommendations = [];
    
    if (overallFailureRate >= 0.01) {
      recommendations.push({
        type: 'critical',
        message: `Overall flake rate ${(overallFailureRate * 100).toFixed(2)}% exceeds 1% target`,
        action: 'Investigate and fix flaky tests before merging'
      });
    }
    
    if (flakyTests.length > 0) {
      recommendations.push({
        type: 'warning',
        message: `${flakyTests.length} flaky tests detected`,
        action: 'Review and stabilize flaky tests'
      });
    }
    
    if (overallFailureRate < 0.005) {
      recommendations.push({
        type: 'success',
        message: `Excellent flake rate: ${(overallFailureRate * 100).toFixed(2)}%`,
        action: 'Maintain current testing practices'
      });
    }
    
    // Specific recommendations for common flaky patterns
    const commonPatterns = this.detectCommonPatterns();
    if (commonPatterns.length > 0) {
      recommendations.push({
        type: 'info',
        message: 'Common flaky patterns detected',
        action: 'Consider implementing test isolation and deterministic data generation',
        patterns: commonPatterns
      });
    }
    
    return recommendations;
  }

  detectCommonPatterns() {
    const patterns = [];
    
    // Check for timing-related flakiness
    const timingIssues = Array.from(this.testStats.entries())
      .filter(([_, stats]) => stats.isFlaky && stats.avgDuration > 5000)
      .map(([test, _]) => test);
    
    if (timingIssues.length > 0) {
      patterns.push({
        type: 'timing',
        description: 'Tests with high duration variability',
        count: timingIssues.length,
        examples: timingIssues.slice(0, 3)
      });
    }
    
    // Check for property test flakiness
    const propertyTestIssues = Array.from(this.testStats.entries())
      .filter(([test, stats]) => stats.isFlaky && test.includes('property'))
      .map(([test, _]) => test);
    
    if (propertyTestIssues.length > 0) {
      patterns.push({
        type: 'property',
        description: 'Property tests with flaky behavior',
        count: propertyTestIssues.length,
        examples: propertyTestIssues.slice(0, 3)
      });
    }
    
    return patterns;
  }

  async saveReport(report) {
    const reportPath = path.join(this.resultsDir, 'flakiness-report.json');
    
    try {
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      console.log(`📄 Report saved to flakiness-report.json`);
    } catch (error) {
      throw new Error(`Failed to save report: ${error.message}`);
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const reporter = new DeflakeReporter();
  reporter.generateReport().catch(error => {
    console.error('Deflake reporter failed:', error);
    process.exit(1);
  });
}

export { DeflakeReporter };
