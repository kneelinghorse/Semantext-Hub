#!/usr/bin/env node

/**
 * E2E Workflow Validation Script
 * 
 * This script validates the complete end-to-end workflow for multi-agent execution,
 * including agent discovery, A2A communication, MCP tool execution, and performance validation.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { performance } from 'perf_hooks';
import { MultiAgentE2EDemo } from '../examples/multi-agent-e2e-demo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Validation configuration
const VALIDATION_CONFIG = {
  timeout: 30000, // 30 seconds
  retries: 3,
  performanceThresholds: {
    endToEndLatency: 5000,    // 5 seconds
    discoveryLatency: 1000,   // 1 second
    a2aLatency: 2000,         // 2 seconds
    mcpLatency: 3000,         // 3 seconds
    memoryUsage: 100 * 1024 * 1024 // 100MB
  },
  successCriteria: {
    minSuccessRate: 0.8, // 80% success rate
    minAgentsDiscovered: 1,
    minWorkflowsCompleted: 1
  }
};

/**
 * E2E Workflow Validator Class
 */
class E2EWorkflowValidator {
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
   * Run complete E2E validation
   */
  async validate() {
    console.log('🚀 Starting E2E Workflow Validation...\n');

    this.results.validation.startTime = performance.now();

    try {
      // Step 1: Agent Discovery Validation
      console.log('📋 Step 1: Agent Discovery Validation');
      this.results.steps.discovery = await this.validateAgentDiscovery();

      // Step 2: A2A Communication Validation
      console.log('📋 Step 2: A2A Communication Validation');
      this.results.steps.a2a = await this.validateA2ACommunication();

      // Step 3: MCP Tool Execution Validation
      console.log('📋 Step 3: MCP Tool Execution Validation');
      this.results.steps.mcp = await this.validateMCPToolExecution();

      // Step 4: End-to-End Workflow Validation
      console.log('📋 Step 4: End-to-End Workflow Validation');
      this.results.steps.workflow = await this.validateEndToEndWorkflow();

      // Step 5: Error Handling Validation
      console.log('📋 Step 5: Error Handling Validation');
      this.results.steps.errorHandling = await this.validateErrorHandling();

      // Step 6: Performance Validation
      console.log('📋 Step 6: Performance Validation');
      this.results.steps.performance = await this.validatePerformance();

      // Generate summary
      this.results.summary = this.generateSummary();

      this.results.validation.endTime = performance.now();
      this.results.validation.duration = this.results.validation.endTime - this.results.validation.startTime;
      this.results.validation.success = this.results.summary.overallSuccess;

      console.log('\n✅ E2E Workflow Validation Completed');
      this.printResults();

      return this.results;

    } catch (error) {
      this.results.validation.endTime = performance.now();
      this.results.validation.duration = this.results.validation.endTime - this.results.validation.startTime;
      this.results.validation.success = false;
      this.results.validation.errors.push(error.message);

      console.error('\n❌ E2E Workflow Validation Failed');
      console.error(`Error: ${error.message}`);
      console.error(`Duration: ${this.results.validation.duration.toFixed(2)}ms`);

      return this.results;
    }
  }

  /**
   * Validate agent discovery
   */
  async validateAgentDiscovery() {
    const demo = new MultiAgentE2EDemo();
    
    try {
      await demo.initialize();
      const result = await demo.step1AgentDiscovery();

      return {
        success: result.success,
        agentsDiscovered: result.agentsDiscovered,
        duration: result.duration,
        meetsThreshold: result.duration < this.config.performanceThresholds.discoveryLatency,
        details: result
      };

    } finally {
      await demo.cleanup();
    }
  }

  /**
   * Validate A2A communication
   */
  async validateA2ACommunication() {
    const demo = new MultiAgentE2EDemo();
    
    try {
      await demo.initialize();
      const result = await demo.step2A2ACommunication();

      return {
        success: result.success,
        totalRequests: result.metrics.totalRequests,
        successfulRequests: result.metrics.successfulRequests,
        failedRequests: result.metrics.failedRequests,
        duration: result.metrics.duration,
        meetsThreshold: result.metrics.duration < this.config.performanceThresholds.a2aLatency,
        successRate: result.metrics.successfulRequests / result.metrics.totalRequests,
        details: result
      };

    } finally {
      await demo.cleanup();
    }
  }

  /**
   * Validate MCP tool execution
   */
  async validateMCPToolExecution() {
    const demo = new MultiAgentE2EDemo();
    
    try {
      await demo.initialize();
      const result = await demo.step3MCPToolExecution();

      return {
        success: result.success,
        totalExecutions: result.metrics.totalExecutions,
        successfulExecutions: result.metrics.successfulExecutions,
        failedExecutions: result.metrics.failedExecutions,
        duration: result.metrics.duration,
        meetsThreshold: result.metrics.duration < this.config.performanceThresholds.mcpLatency,
        successRate: result.metrics.successfulExecutions / result.metrics.totalExecutions,
        details: result
      };

    } finally {
      await demo.cleanup();
    }
  }

  /**
   * Validate end-to-end workflow
   */
  async validateEndToEndWorkflow() {
    const demo = new MultiAgentE2EDemo();
    
    try {
      await demo.initialize();
      const result = await demo.step4EndToEndValidation();

      return {
        success: result.success,
        totalWorkflows: result.metrics.totalWorkflows,
        successfulWorkflows: result.metrics.successfulWorkflows,
        failedWorkflows: result.metrics.failedWorkflows,
        duration: result.metrics.duration,
        meetsThreshold: result.metrics.duration < this.config.performanceThresholds.endToEndLatency,
        successRate: result.metrics.successfulWorkflows / result.metrics.totalWorkflows,
        details: result
      };

    } finally {
      await demo.cleanup();
    }
  }

  /**
   * Validate error handling
   */
  async validateErrorHandling() {
    const demo = new MultiAgentE2EDemo();
    
    try {
      await demo.initialize();
      const result = await demo.step5ErrorHandlingValidation();

      return {
        success: result.success,
        totalTests: result.metrics.totalTests,
        successfulTests: result.metrics.successfulTests,
        failedTests: result.metrics.failedTests,
        duration: result.metrics.duration,
        successRate: result.metrics.successfulTests / result.metrics.totalTests,
        details: result
      };

    } finally {
      await demo.cleanup();
    }
  }

  /**
   * Validate performance
   */
  async validatePerformance() {
    const demo = new MultiAgentE2EDemo();
    
    try {
      await demo.initialize();
      const result = await demo.step6PerformanceValidation();

      // Check memory usage
      const memoryUsage = process.memoryUsage();
      const memoryMeetsThreshold = memoryUsage.heapUsed < this.config.performanceThresholds.memoryUsage;

      return {
        success: result.success,
        totalTests: result.metrics.totalTests,
        successfulTests: result.metrics.successfulTests,
        failedTests: result.metrics.failedTests,
        duration: result.metrics.duration,
        memoryUsage: memoryUsage.heapUsed,
        memoryMeetsThreshold,
        successRate: result.metrics.successfulTests / result.metrics.totalTests,
        details: result
      };

    } finally {
      await demo.cleanup();
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
      discovery: steps.discovery?.meetsThreshold || false,
      a2a: steps.a2a?.meetsThreshold || false,
      mcp: steps.mcp?.meetsThreshold || false,
      workflow: steps.workflow?.meetsThreshold || false,
      memory: steps.performance?.memoryMeetsThreshold || false
    };

    const performancePassed = Object.values(performanceChecks).every(check => check);

    // Check success criteria
    const criteriaChecks = {
      minSuccessRate: successRate >= this.config.successCriteria.minSuccessRate,
      minAgentsDiscovered: (steps.discovery?.agentsDiscovered || 0) >= this.config.successCriteria.minAgentsDiscovered,
      minWorkflowsCompleted: (steps.workflow?.successfulWorkflows || 0) >= this.config.successCriteria.minWorkflowsCompleted
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
    console.log('\n📊 E2E Workflow Validation Results');
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
      
      if (stepResult.successRate !== undefined) {
        console.log(`    Success Rate: ${(stepResult.successRate * 100).toFixed(1)}%`);
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
  const outputPath = args[0] || join(__dirname, '../data/validation-results.json');

  const validator = new E2EWorkflowValidator();

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

export { E2EWorkflowValidator };
