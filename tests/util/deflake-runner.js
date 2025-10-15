#!/usr/bin/env node

/**
 * Deflake Test Runner
 * 
 * Runs tests multiple times to detect flakiness and generate reports.
 * Usage: node deflake-runner.js [options]
 */

import { spawn } from 'child_process';
import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  testPathPattern: 'tests/property/**/*.test.js',
  maxRetries: 3,
  iteration: 1,
  iterations: 10,
  reportFlakiness: false,
  timeout: 30000,
  verbose: false
};

// Parse arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const value = args[i + 1];
    
    switch (key) {
      case 'testPathPattern':
        options.testPathPattern = value;
        i++;
        break;
      case 'maxRetries':
        options.maxRetries = parseInt(value);
        i++;
        break;
      case 'iteration':
        options.iteration = parseInt(value);
        i++;
        break;
      case 'iterations':
        options.iterations = parseInt(value);
        i++;
        break;
      case 'timeout':
        options.timeout = parseInt(value);
        i++;
        break;
      case 'reportFlakiness':
        options.reportFlakiness = value === 'true';
        i++;
        break;
      case 'verbose':
        options.verbose = true;
        break;
    }
  }
}

class DeflakeRunner {
  constructor(options) {
    this.options = options;
    this.results = [];
    this.flakyTests = new Set();
    this.startTime = performance.now();
  }

  async run() {
    console.log(`🚀 Starting deflake test run ${this.options.iteration}/${this.options.iterations}`);
    console.log(`📁 Test pattern: ${this.options.testPathPattern}`);
    console.log(`🔄 Max retries: ${this.options.maxRetries}`);
    console.log(`⏱️  Timeout: ${this.options.timeout}ms`);
    console.log('');

    try {
      const result = await this.runJestTests();
      this.results.push(result);
      
      if (this.options.reportFlakiness) {
        await this.saveResults();
      }
      
      const duration = performance.now() - this.startTime;
      console.log(`\n✅ Deflake run completed in ${(duration / 1000).toFixed(2)}s`);
      
      if (result.flakyTests.length > 0) {
        console.log(`⚠️  Detected ${result.flakyTests.length} flaky tests:`);
        result.flakyTests.forEach(test => console.log(`   - ${test}`));
      } else {
        console.log('🎉 No flaky tests detected!');
      }
      
      return result;
    } catch (error) {
      console.error('❌ Deflake run failed:', error.message);
      process.exit(1);
    }
  }

  async runJestTests() {
    return new Promise((resolve, reject) => {
      const jestArgs = [
        '--experimental-vm-modules',
        './node_modules/jest/bin/jest.js',
        '--testPathPattern', this.options.testPathPattern,
        '--maxWorkers', '1', // Run sequentially to avoid interference
        '--testTimeout', this.options.timeout.toString(),
        '--verbose',
        '--no-coverage', // Disable coverage for deflake runs
        '--passWithNoTests'
      ];

      if (this.options.verbose) {
        jestArgs.push('--verbose');
      }

      const jestProcess = spawn('node', jestArgs, {
        cwd: path.join(__dirname, '../..'),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          DEFLAKE_RUN: 'true',
          DEFLAKE_ITERATION: this.options.iteration.toString(),
          DEFLAKE_MAX_RETRIES: this.options.maxRetries.toString()
        }
      });

      let stdout = '';
      let stderr = '';

      jestProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        if (this.options.verbose) {
          process.stdout.write(output);
        }
      });

      jestProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        if (this.options.verbose) {
          process.stderr.write(output);
        }
      });

      jestProcess.on('close', (code) => {
        const result = this.parseJestOutput(stdout, stderr, code);
        resolve(result);
      });

      jestProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  parseJestOutput(stdout, stderr, exitCode) {
    const lines = stdout.split('\n');
    const testResults = [];
    const flakyTests = [];
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    // Parse test results
    for (const line of lines) {
      if (line.includes('PASS') && line.includes('.test.js')) {
        const match = line.match(/PASS\s+(.+\.test\.js)/);
        if (match) {
          testResults.push({
            file: match[1],
            status: 'passed',
            flaky: false
          });
          passedTests++;
        }
      } else if (line.includes('FAIL') && line.includes('.test.js')) {
        const match = line.match(/FAIL\s+(.+\.test\.js)/);
        if (match) {
          testResults.push({
            file: match[1],
            status: 'failed',
            flaky: true
          });
          failedTests++;
          flakyTests.push(match[1]);
        }
      }
    }

    // Extract total test count
    const totalMatch = stdout.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
    if (totalMatch) {
      totalTests = parseInt(totalMatch[3]);
      failedTests = parseInt(totalMatch[1]);
      passedTests = parseInt(totalMatch[2]);
    }

    const duration = performance.now() - this.startTime;
    const flakeRate = totalTests > 0 ? failedTests / totalTests : 0;

    return {
      iteration: this.options.iteration,
      timestamp: new Date().toISOString(),
      duration,
      totalTests,
      passedTests,
      failedTests,
      flakeRate,
      testResults,
      flakyTests,
      exitCode,
      stdout,
      stderr
    };
  }

  async saveResults() {
    const resultsDir = path.join(__dirname, '../..');
    const filename = `deflake-results-${this.options.iteration}.json`;
    const filepath = path.join(resultsDir, filename);

    try {
      await fs.writeFile(filepath, JSON.stringify(this.results[0], null, 2));
      console.log(`📊 Results saved to ${filename}`);
    } catch (error) {
      console.error('Failed to save results:', error.message);
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new DeflakeRunner(options);
  runner.run().catch(error => {
    console.error('Deflake runner failed:', error);
    process.exit(1);
  });
}

export { DeflakeRunner };
