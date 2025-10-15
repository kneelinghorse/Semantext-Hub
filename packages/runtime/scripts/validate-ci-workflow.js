#!/usr/bin/env node

/**
 * CI Workflow Validation Script
 * 
 * This script validates the CI workflow components for runtime integration testing.
 * It ensures all CI components are properly configured and functional.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { performance } from 'perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Validation configuration
const VALIDATION_CONFIG = {
  timeout: 30000, // 30 seconds
  retries: 3,
  performanceThresholds: {
    totalValidationTime: 10000,    // 10 seconds
    artifactCollectionTime: 5000,   // 5 seconds
    testExecutionTime: 15000,       // 15 seconds
    memoryUsage: 200 * 1024 * 1024 // 200MB
  },
  successCriteria: {
    minSuccessRate: 0.8, // 80% success rate
    minComponentsValidated: 5,
    minTestsPassed: 1
  }
};

/**
 * CI Workflow Validator Class
 */
class CIWorkflowValidator {
  constructor(config = VALIDATION_CONFIG) {
    this.config = config;
    this.results = {
      validation: {
        startTime: null,
        endTime: null,
        duration: 0,
        success: false,
        errors: []
      },
      steps: {},
      performance: {},
      summary: {}
    };
  }

  /**
   * Run complete CI workflow validation
   */
  async validate() {
    console.log('🚀 Starting CI Workflow Validation...\n');

    this.results.validation.startTime = performance.now();

    try {
      // Step 1: CI Workflow File Validation
      console.log('📋 Step 1: CI Workflow File Validation');
      this.results.steps.workflowFile = await this.validateWorkflowFile();

      // Step 2: Artifact Exporter Validation
      console.log('📋 Step 2: Artifact Exporter Validation');
      this.results.steps.artifactExporter = await this.validateArtifactExporter();

      // Step 3: Test Infrastructure Validation
      console.log('📋 Step 3: Test Infrastructure Validation');
      this.results.steps.testInfrastructure = await this.validateTestInfrastructure();

      // Step 4: Performance Validation
      console.log('📋 Step 4: Performance Validation');
      this.results.steps.performance = await this.validatePerformance();

      // Step 5: Documentation Validation
      console.log('📋 Step 5: Documentation Validation');
      this.results.steps.documentation = await this.validateDocumentation();

      // Generate summary
      this.results.summary = this.generateSummary();

      this.results.validation.endTime = performance.now();
      this.results.validation.duration = this.results.validation.endTime - this.results.validation.startTime;
      this.results.validation.success = this.results.summary.overallSuccess;

      console.log('\n✅ CI Workflow Validation Completed');
      this.printResults();

      return this.results;

    } catch (error) {
      this.results.validation.endTime = performance.now();
      this.results.validation.duration = this.results.validation.endTime - this.results.validation.startTime;
      this.results.validation.success = false;
      this.results.validation.errors.push(error.message);

      console.error('\n❌ CI Workflow Validation Failed');
      console.error(`Error: ${error.message}`);
      console.error(`Duration: ${this.results.validation.duration.toFixed(2)}ms`);

      return this.results;
    }
  }

  /**
   * Validate CI workflow file
   */
  async validateWorkflowFile() {
    const fs = await import('fs');
    const path = await import('path');
    
    try {
      const workflowPath = path.join(__dirname, '../../.github/workflows/runtime-integration.yml');
      const workflowExists = fs.existsSync(workflowPath);
      
      if (!workflowExists) {
        throw new Error('CI workflow file not found');
      }

      const workflowContent = fs.readFileSync(workflowPath, 'utf-8');
      const hasRequiredJobs = workflowContent.includes('runtime-integration') && 
                             workflowContent.includes('a2a-tests') &&
                             workflowContent.includes('mcp-tests') &&
                             workflowContent.includes('discovery-tests') &&
                             workflowContent.includes('e2e-tests');

      return {
        success: workflowExists && hasRequiredJobs,
        workflowExists,
        hasRequiredJobs,
        duration: 0,
        details: {
          path: workflowPath,
          size: workflowContent.length
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        duration: 0
      };
    }
  }

  /**
   * Validate artifact exporter
   */
  async validateArtifactExporter() {
    const fs = await import('fs');
    const path = await import('path');
    
    try {
      const exporterPath = path.join(__dirname, 'ci-artifact-exporter.js');
      const exporterExists = fs.existsSync(exporterPath);
      
      if (!exporterExists) {
        throw new Error('CI artifact exporter not found');
      }

      const exporterContent = fs.readFileSync(exporterPath, 'utf-8');
      const hasRequiredFeatures = exporterContent.includes('CIArtifactExporter') &&
                                 exporterContent.includes('collectFailureArtifacts') &&
                                 exporterContent.includes('collectA2AArtifacts') &&
                                 exporterContent.includes('collectMCPArtifacts');

      return {
        success: exporterExists && hasRequiredFeatures,
        exporterExists,
        hasRequiredFeatures,
        duration: 0,
        details: {
          path: exporterPath,
          size: exporterContent.length
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        duration: 0
      };
    }
  }

  /**
   * Validate test infrastructure
   */
  async validateTestInfrastructure() {
    const fs = await import('fs');
    const path = await import('path');
    
    try {
      const testDir = path.join(__dirname, '../tests/runtime');
      const testDirExists = fs.existsSync(testDir);
      
      if (!testDirExists) {
        throw new Error('Runtime tests directory not found');
      }

      const testFiles = fs.readdirSync(testDir).filter(file => file.endsWith('.test.js'));
      const hasRequiredTests = testFiles.some(file => file.includes('a2a')) &&
                              testFiles.some(file => file.includes('mcp')) &&
                              testFiles.some(file => file.includes('discovery'));

      return {
        success: testDirExists && hasRequiredTests,
        testDirExists,
        hasRequiredTests,
        testFiles: testFiles.length,
        duration: 0,
        details: {
          testFiles: testFiles
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        duration: 0
      };
    }
  }

  /**
   * Validate performance
   */
  async validatePerformance() {
    try {
      const memoryUsage = process.memoryUsage();
      const memoryMeetsThreshold = memoryUsage.heapUsed < this.config.performanceThresholds.memoryUsage;

      return {
        success: memoryMeetsThreshold,
        memoryUsage: memoryUsage.heapUsed,
        memoryMeetsThreshold,
        duration: 0,
        details: {
          rss: memoryUsage.rss,
          heapTotal: memoryUsage.heapTotal,
          heapUsed: memoryUsage.heapUsed,
          external: memoryUsage.external
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        duration: 0
      };
    }
  }

  /**
   * Validate documentation
   */
  async validateDocumentation() {
    const fs = await import('fs');
    const path = await import('path');
    
    try {
      const docsDir = path.join(__dirname, '../docs');
      const troubleshootingExists = fs.existsSync(path.join(docsDir, 'ci-troubleshooting.md'));
      const runtimeNotesExists = fs.existsSync(path.join(docsDir, 'runtime-integration-notes.md'));

      return {
        success: troubleshootingExists && runtimeNotesExists,
        troubleshootingExists,
        runtimeNotesExists,
        duration: 0,
        details: {
          docsDir,
          files: ['ci-troubleshooting.md', 'runtime-integration-notes.md']
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        duration: 0
      };
    }
  }

  /**
   * Generate validation summary
   */
  generateSummary() {
    const steps = this.results.steps;
    const stepResults = Object.values(steps);

    const overallSuccess = stepResults.every(step => step.success);
    const totalSteps = stepResults.length;
    const successfulSteps = stepResults.filter(step => step.success).length;
    const successRate = successfulSteps / totalSteps;

    // Check performance thresholds
    const performanceChecks = {
      memory: steps.performance?.memoryMeetsThreshold || false
    };

    const performancePassed = Object.values(performanceChecks).every(check => check);

    // Check success criteria
    const criteriaChecks = {
      minSuccessRate: successRate >= this.config.successCriteria.minSuccessRate,
      minComponentsValidated: successfulSteps >= this.config.successCriteria.minComponentsValidated,
      minTestsPassed: (steps.testInfrastructure?.testFiles || 0) >= this.config.successCriteria.minTestsPassed
    };

    const criteriaPassed = Object.values(criteriaChecks).every(check => check);

    return {
      overallSuccess: overallSuccess && performancePassed && criteriaPassed,
      stepSuccessRate: successRate,
      performancePassed,
      criteriaPassed,
      performanceChecks,
      criteriaChecks,
      totalSteps,
      successfulSteps,
      failedSteps: totalSteps - successfulSteps
    };
  }

  /**
   * Print validation results
   */
  printResults() {
    console.log('\n📊 CI Workflow Validation Results');
    console.log('=====================================');

    // Overall status
    const status = this.results.validation.success ? '✅ PASSED' : '❌ FAILED';
    console.log(`Overall Status: ${status}`);
    console.log(`Duration: ${this.results.validation.duration.toFixed(2)}ms`);

    // Step results
    console.log('\n📋 Step Results:');
    Object.entries(this.results.steps).forEach(([stepName, stepResult]) => {
      const stepStatus = stepResult.success ? '✅' : '❌';
      console.log(`  ${stepStatus} ${stepName}: ${stepResult.success ? 'PASSED' : 'FAILED'}`);
      
      if (stepResult.duration !== undefined) {
        console.log(`    Duration: ${stepResult.duration.toFixed(2)}ms`);
      }
      
      if (stepResult.error) {
        console.log(`    Error: ${stepResult.error}`);
      }
    });

    // Performance results
    console.log('\n⚡ Performance Results:');
    const performanceChecks = this.results.summary.performanceChecks;
    Object.entries(performanceChecks).forEach(([checkName, passed]) => {
      const checkStatus = passed ? '✅' : '❌';
      console.log(`  ${checkStatus} ${checkName}: ${passed ? 'PASSED' : 'FAILED'}`);
    });

    // Success criteria
    console.log('\n🎯 Success Criteria:');
    const criteriaChecks = this.results.summary.criteriaChecks;
    Object.entries(criteriaChecks).forEach(([criteriaName, passed]) => {
      const criteriaStatus = passed ? '✅' : '❌';
      console.log(`  ${criteriaStatus} ${criteriaName}: ${passed ? 'PASSED' : 'FAILED'}`);
    });

    // Summary
    console.log('\n📈 Summary:');
    console.log(`  Total Steps: ${this.results.summary.totalSteps}`);
    console.log(`  Successful Steps: ${this.results.summary.successfulSteps}`);
    console.log(`  Failed Steps: ${this.results.summary.failedSteps}`);
    console.log(`  Step Success Rate: ${(this.results.summary.stepSuccessRate * 100).toFixed(1)}%`);
    console.log(`  Performance Passed: ${this.results.summary.performancePassed ? 'YES' : 'NO'}`);
    console.log(`  Criteria Passed: ${this.results.summary.criteriaPassed ? 'YES' : 'NO'}`);

    // Errors
    if (this.results.validation.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.results.validation.errors.forEach(error => {
        console.log(`  - ${error}`);
      });
    }

    console.log('\n=====================================');
  }

  /**
   * Export results to JSON
   */
  async exportResults(outputPath) {
    const fs = await import('fs');
    const path = await import('path');
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(this.results, null, 2));
    console.log(`\n📄 Results exported to: ${outputPath}`);
  }
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);
  const outputPath = args[0] || join(__dirname, '../data/ci-validation-results.json');

  const validator = new CIWorkflowValidator();

  try {
    const results = await validator.validate();

    // Export results
    if (outputPath) {
      await validator.exportResults(outputPath);
    }

    // Exit with appropriate code
    process.exit(results.validation.success ? 0 : 1);

  } catch (error) {
    console.error('Validation script failed:', error.message);
    process.exit(1);
  }
}

// Run validation if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { CIWorkflowValidator };
