#!/usr/bin/env node

/**
 * Workflow Simulate Runner
 * 
 * Lightweight CLI tool for executing workflow definitions locally.
 * Provides simulation capabilities for testing and debugging workflows.
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { WorkflowContext } from '../workflow/types.js';
import { defaultRegistry } from '../workflow/adapter-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    file: null,
    trace: null,
    verbose: false,
    dryRun: false,
    output: 'stdout'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--file':
      case '-f':
        options.file = args[++i];
        break;
      case '--trace':
      case '-t':
        options.trace = args[++i];
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--dry-run':
      case '-d':
        options.dryRun = true;
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        if (!options.file && !arg.startsWith('-')) {
          options.file = arg;
        }
        break;
    }
  }

  return options;
}

/**
 * Print help information
 */
function printHelp() {
  console.log(`
Workflow Simulate Runner

Usage: workflow-run [options] <workflow-file>

Options:
  -f, --file <file>     Workflow definition file (JSON/YAML)
  -t, --trace <id>      Trace ID for execution
  -v, --verbose         Verbose output
  -d, --dry-run         Validate workflow without execution
  -o, --output <file>   Output file (default: stdout)
  -h, --help            Show this help

Examples:
  workflow-run ping.json
  workflow-run --file workflows/api-test.json --trace api-test-001
  workflow-run --dry-run complex-workflow.json
`);
}

/**
 * Load workflow definition from file
 */
async function loadWorkflow(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    
    // Try to parse as JSON first
    try {
      return JSON.parse(content);
    } catch (jsonError) {
      // If JSON fails, try YAML (basic implementation)
      if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        throw new Error('YAML support not implemented. Please use JSON format.');
      }
      throw jsonError;
    }
  } catch (error) {
    throw new Error(`Failed to load workflow file: ${error.message}`);
  }
}

/**
 * Validate workflow definition
 */
function validateWorkflow(workflow) {
  const errors = [];

  if (!workflow) {
    errors.push('Workflow definition is required');
    return { isValid: false, errors };
  }

  if (!workflow.name) {
    errors.push('Workflow name is required');
  }

  if (!workflow.steps || !Array.isArray(workflow.steps)) {
    errors.push('Workflow steps array is required');
  } else if (workflow.steps.length === 0) {
    errors.push('Workflow must have at least one step');
  } else {
    workflow.steps.forEach((step, index) => {
      if (!step.name) {
        errors.push(`Step ${index}: name is required`);
      }
      if (!step.adapter) {
        errors.push(`Step ${index}: adapter is required`);
      }
      if (!step.input) {
        errors.push(`Step ${index}: input is required`);
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Execute workflow step
 */
async function executeStep(step, context, stepIndex) {
  const startTime = Date.now();
  
  try {
    console.log(`  Executing step ${stepIndex + 1}: ${step.name} (${step.adapter})`);
    
    const result = await defaultRegistry.executeStep(step.adapter, context, step.input);
    
    const duration = Date.now() - startTime;
    console.log(`  ✓ Step ${stepIndex + 1} completed in ${duration}ms`);
    
    return {
      step: step.name,
      adapter: step.adapter,
      success: true,
      result,
      duration,
      error: null
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`  ✗ Step ${stepIndex + 1} failed in ${duration}ms: ${error.message}`);
    
    return {
      step: step.name,
      adapter: step.adapter,
      success: false,
      result: null,
      duration,
      error: error.message
    };
  }
}

/**
 * Execute workflow
 */
async function executeWorkflow(workflow, options) {
  const context = new WorkflowContext({
    traceId: options.trace || `trace_${Date.now()}`,
    sessionId: `session_${Date.now()}`,
    metadata: {
      workflow: workflow.name,
      version: workflow.version || '1.0.0',
      runner: 'workflow-run'
    }
  });

  console.log(`Executing workflow: ${workflow.name}`);
  console.log(`Trace ID: ${context.traceId}`);
  console.log(`Steps: ${workflow.steps.length}`);
  
  if (options.verbose) {
    console.log(`Available adapters: ${defaultRegistry.listAdapters().join(', ')}`);
  }

  const results = [];
  let success = true;

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    const stepResult = await executeStep(step, context, i);
    results.push(stepResult);
    
    if (!stepResult.success) {
      success = false;
      if (workflow.stopOnError !== false) {
        console.log(`Workflow stopped due to step failure`);
        break;
      }
    }
  }

  const totalDuration = context.getElapsedTime();
  console.log(`\nWorkflow ${success ? 'completed' : 'failed'} in ${totalDuration}ms`);

  return {
    workflow: workflow.name,
    traceId: context.traceId,
    success,
    totalDuration,
    stepCount: workflow.steps.length,
    results,
    context: context.metadata
  };
}

/**
 * Output results
 */
async function outputResults(results, options) {
  const output = {
    timestamp: new Date().toISOString(),
    ...results
  };

  if (options.output === 'stdout') {
    console.log('\n=== EXECUTION RESULTS ===');
    console.log(JSON.stringify(output, null, 2));
  } else {
    await fs.writeFile(options.output, JSON.stringify(output, null, 2));
    console.log(`Results written to: ${options.output}`);
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    const options = parseArgs();
    
    if (!options.file) {
      console.error('Error: Workflow file is required');
      printHelp();
      process.exit(1);
    }

    // Check if file exists
    if (!await fs.pathExists(options.file)) {
      console.error(`Error: Workflow file not found: ${options.file}`);
      process.exit(1);
    }

    // Load workflow
    const workflow = await loadWorkflow(options.file);
    
    // Validate workflow
    const validation = validateWorkflow(workflow);
    if (!validation.isValid) {
      console.error('Workflow validation failed:');
      validation.errors.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }

    console.log(`✓ Workflow validation passed`);

    if (options.dryRun) {
      console.log('Dry run completed successfully');
      process.exit(0);
    }

    // Execute workflow
    const results = await executeWorkflow(workflow, options);
    
    // Output results
    await outputResults(results, options);
    
    // Exit with appropriate code
    process.exit(results.success ? 0 : 1);

  } catch (error) {
    console.error(`Error: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
