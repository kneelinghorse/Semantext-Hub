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
const repoRoot = path.join(__dirname, '../..');
const artifactsDir = path.join(repoRoot, 'artifacts', 'test');
const flakinessLogPath = path.join(artifactsDir, 'flakiness.jsonl');
const stripAnsi = (value) =>
  value
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\r/g, '');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  testPathPattern: 'tests/property/**/*.test.js',
  maxRetries: 3,
  iteration: 1,
  iterations: 10,
  reportFlakiness: true,
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
      case 'reportFlakiness': {
        if (value === 'false') {
          options.reportFlakiness = false;
          i++;
        } else if (value === 'true') {
          options.reportFlakiness = true;
          i++;
        } else {
          options.reportFlakiness = true;
        }
        break;
      }
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
        await this.saveResults(result);
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
    await fs.mkdir(artifactsDir, { recursive: true });
    return new Promise((resolve, reject) => {
      const resultsFile = path.join(artifactsDir, `deflake-results-${this.options.iteration}.json`);
      const jestArgs = [
        '--experimental-vm-modules',
        './node_modules/jest/bin/jest.js',
        '--testPathPattern', this.options.testPathPattern,
        '--maxWorkers', '1', // Run sequentially to avoid interference
        '--runInBand', // Force a single worker to ensure deterministic cleanup
        '--detectOpenHandles',
        '--forceExit',
        '--testTimeout', this.options.timeout.toString(),
        '--no-coverage', // Disable coverage for deflake runs
        '--json',
        '--outputFile', resultsFile,
        '--passWithNoTests',
      ];

      if (this.options.verbose) {
        jestArgs.push('--runInBand');
        jestArgs.push('--verbose');
      }

      const jestProcess = spawn('node', jestArgs, {
        cwd: repoRoot,
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

      jestProcess.on('close', async (code) => {
        try {
          let jestJson = null;
          try {
            const contents = await fs.readFile(resultsFile, 'utf8');
            jestJson = JSON.parse(contents);
          } catch (error) {
            if (code === 0) {
              console.warn('Unable to read Jest JSON results:', error.message);
            }
          } finally {
            await fs.rm(resultsFile, { force: true });
          }

          const result = this.parseJestOutput(stdout, stderr, code, jestJson);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      jestProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  parseJestOutput(stdout, stderr, exitCode, jestJson) {
    const lines = stdout.split('\n').map(stripAnsi);
    const testResults = [];
    const flakyTests = [];
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    if (jestJson) {
      totalTests = jestJson.numTotalTests ?? 0;
      passedTests = jestJson.numPassedTests ?? 0;
      failedTests = jestJson.numFailedTests ?? 0;

      for (const suite of jestJson.testResults ?? []) {
        const relativePath = suite.name ? path.relative(repoRoot, suite.name) : undefined;
        const suiteStatus = suite.status ?? 'unknown';

        testResults.push({
          file: relativePath ?? suite.name,
          status: suiteStatus,
          flaky: suiteStatus === 'failed',
        });

        for (const assertion of suite.assertionResults ?? []) {
          if (assertion.status === 'failed') {
            const identifier = assertion.fullName ?? assertion.title ?? 'unnamed-test';
            flakyTests.push(`${relativePath ?? suite.name} :: ${identifier}`);
          }
        }
      }
    } else {
      let suitePasses = 0;
      let suiteFailures = 0;

      for (const line of lines) {
        if (line.includes('PASS') && (line.includes('.test.') || line.includes('.spec.'))) {
          const match = line.match(/PASS\s+(.+\.(test|spec)\.(mjs|cjs|jsx?|tsx?))/);
          if (match) {
            testResults.push({
              file: match[1],
              status: 'passed',
              flaky: false
            });
            suitePasses++;
          }
        } else if (line.includes('FAIL') && (line.includes('.test.') || line.includes('.spec.'))) {
          const match = line.match(/FAIL\s+(.+\.(test|spec)\.(mjs|cjs|jsx?|tsx?))/);
          if (match) {
            testResults.push({
              file: match[1],
              status: 'failed',
              flaky: true
            });
            suiteFailures++;
            flakyTests.push(match[1]);
          }
        }
      }

      const summaryLine = lines.find(line => line.trim().startsWith('Tests:'));
      if (summaryLine) {
        const matchNumber = (pattern) => {
          const match = summaryLine.match(pattern);
          return match ? parseInt(match[1], 10) : 0;
        };

        failedTests = matchNumber(/(\d+)\s+failed/);
        passedTests = matchNumber(/(\d+)\s+passed/);
        const skippedTests = matchNumber(/(\d+)\s+skipped/);
        totalTests = matchNumber(/(\d+)\s+total/);

        if (totalTests === 0) {
          totalTests = passedTests + failedTests + skippedTests;
        }
      }

      if (totalTests === 0) {
        totalTests = suitePasses + suiteFailures;
      }
      if (passedTests === 0) {
        passedTests = totalTests - failedTests;
      }
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

  async saveResults(result) {
    const payload = {
      ts: result.timestamp,
      iteration: result.iteration,
      iterationOf: this.options.iterations,
      testPathPattern: this.options.testPathPattern,
      stats: {
        totalTests: result.totalTests,
        passedTests: result.passedTests,
        failedTests: result.failedTests,
        flakeRate: result.flakeRate,
      },
      flakyTests: result.flakyTests,
      durationMs: Math.round(result.duration),
      exitCode: result.exitCode,
    };

    try {
      await fs.mkdir(artifactsDir, { recursive: true });
      await fs.appendFile(flakinessLogPath, `${JSON.stringify(payload)}\n`);
      console.log(`📊 Flakiness metrics appended to ${path.relative(repoRoot, flakinessLogPath)}`);
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
