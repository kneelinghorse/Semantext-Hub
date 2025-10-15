#!/usr/bin/env node

/**
 * CI Artifact Exporter
 * 
 * This script collects and exports artifacts when CI tests fail, including:
 * - Test logs and error messages
 * - Agent Capability Manifests (ACM)
 * - Request/response samples from A2A/MCP operations
 * - Performance metrics and timing data
 * - Coverage reports
 * - Debug information
 */

import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import { promises as fs } from 'fs';
import { performance } from 'perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CONFIG = {
  artifactsDir: join(__dirname, '../artifacts'),
  maxArtifactSize: 50 * 1024 * 1024, // 50MB
  maxFiles: 1000,
  verbose: false,
  collectTypes: {
    failures: true,
    a2a: true,
    mcp: true,
    discovery: true,
    e2e: true,
    performance: true
  }
};

/**
 * CI Artifact Exporter Class
 */
class CIArtifactExporter {
  constructor(config = CONFIG) {
    this.config = config;
    this.collectedArtifacts = [];
    this.startTime = performance.now();
  }

  /**
   * Main export function
   */
  async exportArtifacts(options = {}) {
    console.log('🔍 CI Artifact Exporter Starting...\n');

    try {
      // Parse command line arguments
      this.parseArguments(options);

      // Create artifacts directory
      await this.createArtifactsDirectory();

      // Collect different types of artifacts
      if (this.config.collectTypes.failures) {
        await this.collectFailureArtifacts();
      }

      if (this.config.collectTypes.a2a) {
        await this.collectA2AArtifacts();
      }

      if (this.config.collectTypes.mcp) {
        await this.collectMCPArtifacts();
      }

      if (this.config.collectTypes.discovery) {
        await this.collectDiscoveryArtifacts();
      }

      if (this.config.collectTypes.e2e) {
        await this.collectE2EArtifacts();
      }

      if (this.config.collectTypes.performance) {
        await this.collectPerformanceArtifacts();
      }

      // Generate summary report
      await this.generateSummaryReport();

      const duration = performance.now() - this.startTime;
      console.log(`\n✅ CI Artifact Export Completed in ${duration.toFixed(2)}ms`);
      console.log(`📁 Collected ${this.collectedArtifacts.length} artifacts`);

      return this.collectedArtifacts;

    } catch (error) {
      console.error('❌ CI Artifact Export Failed:', error.message);
      throw error;
    }
  }

  /**
   * Parse command line arguments
   */
  parseArguments(options) {
    const args = process.argv.slice(2);
    
    // Parse flags
    this.config.verbose = args.includes('--verbose') || options.verbose;
    this.config.collectTypes.failures = args.includes('--collect-failures') || options.collectFailures;
    this.config.collectTypes.a2a = args.includes('--collect-a2a') || options.collectA2A;
    this.config.collectTypes.mcp = args.includes('--collect-mcp') || options.collectMCP;
    this.config.collectTypes.discovery = args.includes('--collect-discovery') || options.collectDiscovery;
    this.config.collectTypes.e2e = args.includes('--collect-e2e') || options.collectE2E;
    this.config.collectTypes.performance = args.includes('--collect-performance') || options.collectPerformance;

    if (this.config.verbose) {
      console.log('🔧 Configuration:', JSON.stringify(this.config, null, 2));
    }
  }

  /**
   * Create artifacts directory
   */
  async createArtifactsDirectory() {
    try {
      await fs.mkdir(this.config.artifactsDir, { recursive: true });
      if (this.config.verbose) {
        console.log(`📁 Created artifacts directory: ${this.config.artifactsDir}`);
      }
    } catch (error) {
      console.error('Failed to create artifacts directory:', error.message);
      throw error;
    }
  }

  /**
   * Collect failure artifacts
   */
  async collectFailureArtifacts() {
    console.log('📋 Collecting failure artifacts...');

    const failureArtifacts = [];

    try {
      // Collect test results
      const testResultsPath = join(__dirname, '../test-results');
      if (await this.pathExists(testResultsPath)) {
        const testResults = await this.collectDirectory(testResultsPath, 'test-results');
        failureArtifacts.push(...testResults);
      }

      // Collect coverage reports
      const coveragePath = join(__dirname, '../coverage');
      if (await this.pathExists(coveragePath)) {
        const coverage = await this.collectDirectory(coveragePath, 'coverage');
        failureArtifacts.push(...coverage);
      }

      // Collect Jest cache
      const jestCachePath = join(__dirname, '../node_modules/.cache/jest');
      if (await this.pathExists(jestCachePath)) {
        const jestCache = await this.collectDirectory(jestCachePath, 'jest-cache');
        failureArtifacts.push(...jestCache);
      }

      // Collect error logs
      await this.collectErrorLogs(failureArtifacts);

      this.collectedArtifacts.push(...failureArtifacts);

      if (this.config.verbose) {
        console.log(`  ✅ Collected ${failureArtifacts.length} failure artifacts`);
      }

    } catch (error) {
      console.error('Failed to collect failure artifacts:', error.message);
    }
  }

  /**
   * Collect A2A artifacts
   */
  async collectA2AArtifacts() {
    console.log('📋 Collecting A2A artifacts...');

    const a2aArtifacts = [];

    try {
      // Collect A2A client logs
      const a2aLogsPath = join(__dirname, '../runtime/a2a-logs');
      if (await this.pathExists(a2aLogsPath)) {
        const a2aLogs = await this.collectDirectory(a2aLogsPath, 'a2a-logs');
        a2aArtifacts.push(...a2aLogs);
      }

      // Collect A2A request/response samples
      const a2aSamplesPath = join(__dirname, '../runtime/a2a-samples');
      if (await this.pathExists(a2aSamplesPath)) {
        const a2aSamples = await this.collectDirectory(a2aSamplesPath, 'a2a-samples');
        a2aArtifacts.push(...a2aSamples);
      }

      // Collect A2A test artifacts
      const a2aTestPath = join(__dirname, '../tests/runtime/a2a-artifacts');
      if (await this.pathExists(a2aTestPath)) {
        const a2aTestArtifacts = await this.collectDirectory(a2aTestPath, 'a2a-test-artifacts');
        a2aArtifacts.push(...a2aTestArtifacts);
      }

      this.collectedArtifacts.push(...a2aArtifacts);

      if (this.config.verbose) {
        console.log(`  ✅ Collected ${a2aArtifacts.length} A2A artifacts`);
      }

    } catch (error) {
      console.error('Failed to collect A2A artifacts:', error.message);
    }
  }

  /**
   * Collect MCP artifacts
   */
  async collectMCPArtifacts() {
    console.log('📋 Collecting MCP artifacts...');

    const mcpArtifacts = [];

    try {
      // Collect MCP client logs
      const mcpLogsPath = join(__dirname, '../runtime/mcp-logs');
      if (await this.pathExists(mcpLogsPath)) {
        const mcpLogs = await this.collectDirectory(mcpLogsPath, 'mcp-logs');
        mcpArtifacts.push(...mcpLogs);
      }

      // Collect MCP tool execution samples
      const mcpSamplesPath = join(__dirname, '../runtime/mcp-samples');
      if (await this.pathExists(mcpSamplesPath)) {
        const mcpSamples = await this.collectDirectory(mcpSamplesPath, 'mcp-samples');
        mcpArtifacts.push(...mcpSamples);
      }

      // Collect MCP test artifacts
      const mcpTestPath = join(__dirname, '../tests/runtime/mcp-artifacts');
      if (await this.pathExists(mcpTestPath)) {
        const mcpTestArtifacts = await this.collectDirectory(mcpTestPath, 'mcp-test-artifacts');
        mcpArtifacts.push(...mcpTestArtifacts);
      }

      this.collectedArtifacts.push(...mcpArtifacts);

      if (this.config.verbose) {
        console.log(`  ✅ Collected ${mcpArtifacts.length} MCP artifacts`);
      }

    } catch (error) {
      console.error('Failed to collect MCP artifacts:', error.message);
    }
  }

  /**
   * Collect discovery artifacts
   */
  async collectDiscoveryArtifacts() {
    console.log('📋 Collecting discovery artifacts...');

    const discoveryArtifacts = [];

    try {
      // Collect ACM manifests
      const acmPath = join(__dirname, '../runtime/acm-manifests');
      if (await this.pathExists(acmPath)) {
        const acmManifests = await this.collectDirectory(acmPath, 'acm-manifests');
        discoveryArtifacts.push(...acmManifests);
      }

      // Collect URN registry data
      const urnRegistryPath = join(__dirname, '../runtime/urn-registry');
      if (await this.pathExists(urnRegistryPath)) {
        const urnRegistry = await this.collectDirectory(urnRegistryPath, 'urn-registry');
        discoveryArtifacts.push(...urnRegistry);
      }

      // Collect well-known server logs
      const wellKnownPath = join(__dirname, '../runtime/well-known-logs');
      if (await this.pathExists(wellKnownPath)) {
        const wellKnownLogs = await this.collectDirectory(wellKnownPath, 'well-known-logs');
        discoveryArtifacts.push(...wellKnownLogs);
      }

      // Collect discovery test artifacts
      const discoveryTestPath = join(__dirname, '../tests/runtime/discovery-artifacts');
      if (await this.pathExists(discoveryTestPath)) {
        const discoveryTestArtifacts = await this.collectDirectory(discoveryTestPath, 'discovery-test-artifacts');
        discoveryArtifacts.push(...discoveryTestArtifacts);
      }

      this.collectedArtifacts.push(...discoveryArtifacts);

      if (this.config.verbose) {
        console.log(`  ✅ Collected ${discoveryArtifacts.length} discovery artifacts`);
      }

    } catch (error) {
      console.error('Failed to collect discovery artifacts:', error.message);
    }
  }

  /**
   * Collect E2E artifacts
   */
  async collectE2EArtifacts() {
    console.log('📋 Collecting E2E artifacts...');

    const e2eArtifacts = [];

    try {
      // Collect E2E validation results
      const e2eResultsPath = join(__dirname, '../data');
      if (await this.pathExists(e2eResultsPath)) {
        const e2eResults = await this.collectDirectory(e2eResultsPath, 'e2e-results');
        e2eArtifacts.push(...e2eResults);
      }

      // Collect E2E demo artifacts
      const e2eDemoPath = join(__dirname, '../examples/e2e-artifacts');
      if (await this.pathExists(e2eDemoPath)) {
        const e2eDemoArtifacts = await this.collectDirectory(e2eDemoPath, 'e2e-demo-artifacts');
        e2eArtifacts.push(...e2eDemoArtifacts);
      }

      // Collect E2E test artifacts
      const e2eTestPath = join(__dirname, '../tests/e2e/e2e-artifacts');
      if (await this.pathExists(e2eTestPath)) {
        const e2eTestArtifacts = await this.collectDirectory(e2eTestPath, 'e2e-test-artifacts');
        e2eArtifacts.push(...e2eTestArtifacts);
      }

      this.collectedArtifacts.push(...e2eArtifacts);

      if (this.config.verbose) {
        console.log(`  ✅ Collected ${e2eArtifacts.length} E2E artifacts`);
      }

    } catch (error) {
      console.error('Failed to collect E2E artifacts:', error.message);
    }
  }

  /**
   * Collect performance artifacts
   */
  async collectPerformanceArtifacts() {
    console.log('📋 Collecting performance artifacts...');

    const performanceArtifacts = [];

    try {
      // Collect performance benchmark results
      const perfResultsPath = join(__dirname, '../runtime/performance-results');
      if (await this.pathExists(perfResultsPath)) {
        const perfResults = await this.collectDirectory(perfResultsPath, 'performance-results');
        performanceArtifacts.push(...perfResults);
      }

      // Collect performance test artifacts
      const perfTestPath = join(__dirname, '../tests/performance/performance-artifacts');
      if (await this.pathExists(perfTestPath)) {
        const perfTestArtifacts = await this.collectDirectory(perfTestPath, 'performance-test-artifacts');
        performanceArtifacts.push(...perfTestArtifacts);
      }

      // Collect memory usage logs
      await this.collectMemoryUsageLogs(performanceArtifacts);

      this.collectedArtifacts.push(...performanceArtifacts);

      if (this.config.verbose) {
        console.log(`  ✅ Collected ${performanceArtifacts.length} performance artifacts`);
      }

    } catch (error) {
      console.error('Failed to collect performance artifacts:', error.message);
    }
  }

  /**
   * Collect error logs
   */
  async collectErrorLogs(artifacts) {
    try {
      // Collect console error logs
      const errorLog = {
        type: 'error-log',
        name: 'console-errors.log',
        content: this.captureConsoleErrors(),
        timestamp: new Date().toISOString()
      };

      artifacts.push(errorLog);

      // Collect system error logs
      const systemErrorLog = {
        type: 'system-error-log',
        name: 'system-errors.log',
        content: this.captureSystemErrors(),
        timestamp: new Date().toISOString()
      };

      artifacts.push(systemErrorLog);

    } catch (error) {
      console.error('Failed to collect error logs:', error.message);
    }
  }

  /**
   * Collect memory usage logs
   */
  async collectMemoryUsageLogs(artifacts) {
    try {
      const memoryUsage = process.memoryUsage();
      const memoryLog = {
        type: 'memory-usage',
        name: 'memory-usage.json',
        content: JSON.stringify({
          rss: memoryUsage.rss,
          heapTotal: memoryUsage.heapTotal,
          heapUsed: memoryUsage.heapUsed,
          external: memoryUsage.external,
          arrayBuffers: memoryUsage.arrayBuffers,
          timestamp: new Date().toISOString()
        }, null, 2),
        timestamp: new Date().toISOString()
      };

      artifacts.push(memoryLog);

    } catch (error) {
      console.error('Failed to collect memory usage logs:', error.message);
    }
  }

  /**
   * Collect directory contents
   */
  async collectDirectory(sourcePath, artifactType) {
    const artifacts = [];

    try {
      const files = await fs.readdir(sourcePath, { withFileTypes: true });

      for (const file of files) {
        if (artifacts.length >= this.config.maxFiles) {
          console.warn(`⚠️ Reached maximum file limit (${this.config.maxFiles})`);
          break;
        }

        const filePath = join(sourcePath, file.name);

        if (file.isDirectory()) {
          const subArtifacts = await this.collectDirectory(filePath, artifactType);
          artifacts.push(...subArtifacts);
        } else {
          const artifact = await this.collectFile(filePath, artifactType);
          if (artifact) {
            artifacts.push(artifact);
          }
        }
      }

    } catch (error) {
      console.error(`Failed to collect directory ${sourcePath}:`, error.message);
    }

    return artifacts;
  }

  /**
   * Collect individual file
   */
  async collectFile(filePath, artifactType) {
    try {
      const stats = await fs.stat(filePath);
      
      // Skip files that are too large
      if (stats.size > this.config.maxArtifactSize) {
        console.warn(`⚠️ Skipping large file: ${filePath} (${stats.size} bytes)`);
        return null;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = filePath.replace(__dirname, '');

      return {
        type: artifactType,
        name: basename(filePath),
        path: relativePath,
        content,
        size: stats.size,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`Failed to collect file ${filePath}:`, error.message);
      return null;
    }
  }

  /**
   * Capture console errors
   */
  captureConsoleErrors() {
    const errors = [];
    
    // Capture recent console errors (this is a simplified implementation)
    errors.push('Console errors captured during CI run');
    errors.push(`Timestamp: ${new Date().toISOString()}`);
    errors.push('Note: Detailed console error capture requires integration with test runners');
    
    return errors.join('\n');
  }

  /**
   * Capture system errors
   */
  captureSystemErrors() {
    const errors = [];
    
    // Capture system-level errors
    errors.push('System errors captured during CI run');
    errors.push(`Timestamp: ${new Date().toISOString()}`);
    errors.push('Note: Detailed system error capture requires integration with system monitoring');
    
    return errors.join('\n');
  }

  /**
   * Generate summary report
   */
  async generateSummaryReport() {
    console.log('📊 Generating summary report...');

    const summary = {
      exportTimestamp: new Date().toISOString(),
      duration: performance.now() - this.startTime,
      totalArtifacts: this.collectedArtifacts.length,
      artifactTypes: {},
      totalSize: 0,
      errors: []
    };

    // Analyze artifacts
    for (const artifact of this.collectedArtifacts) {
      // Count by type
      if (!summary.artifactTypes[artifact.type]) {
        summary.artifactTypes[artifact.type] = 0;
      }
      summary.artifactTypes[artifact.type]++;

      // Calculate total size
      if (artifact.size) {
        summary.totalSize += artifact.size;
      }
    }

    // Write summary to file
    const summaryPath = join(this.config.artifactsDir, 'ci-artifact-summary.json');
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

    // Write detailed artifact list
    const artifactListPath = join(this.config.artifactsDir, 'ci-artifact-list.json');
    await fs.writeFile(artifactListPath, JSON.stringify(this.collectedArtifacts, null, 2));

    if (this.config.verbose) {
      console.log('📊 Summary Report:');
      console.log(`  Total Artifacts: ${summary.totalArtifacts}`);
      console.log(`  Total Size: ${(summary.totalSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Duration: ${summary.duration.toFixed(2)}ms`);
      console.log(`  Artifact Types: ${Object.keys(summary.artifactTypes).join(', ')}`);
    }

    return summary;
  }

  /**
   * Check if path exists
   */
  async pathExists(path) {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  const exporter = new CIArtifactExporter();

  try {
    const artifacts = await exporter.exportArtifacts();
    console.log(`\n🎯 CI Artifact Export completed successfully`);
    console.log(`📁 ${artifacts.length} artifacts collected`);
    process.exit(0);

  } catch (error) {
    console.error('❌ CI Artifact Export failed:', error.message);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { CIArtifactExporter };
