/**
 * Workflow CLI Commands
 * Validate and simulate workflow definitions
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import WorkflowValidator from '../../workflow-library/validator.js';
import { WorkflowExecutor, ExecutionState } from '../../workflow-library/executor.js';

/**
 * Validate a workflow definition
 */
export async function validateWorkflow(workflowPath, options = {}) {
  try {
    console.log(chalk.blue(`\n📋 Validating workflow: ${workflowPath}\n`));

    // Read workflow file
    const content = await fs.readFile(workflowPath, 'utf-8');
    const workflow = JSON.parse(content);

    // Validate
    const validator = new WorkflowValidator();
    const startTime = Date.now();
    const result = validator.validate(workflow);
    const duration = Date.now() - startTime;

    // Display results
    if (result.valid) {
      console.log(chalk.green('✓ Workflow is valid'));
      console.log(chalk.gray(`  Validated in ${duration}ms`));
      console.log(chalk.gray(`  Workflow ID: ${workflow.workflowId}`));
      console.log(chalk.gray(`  Version: ${workflow.version}`));
      console.log(chalk.gray(`  Steps: ${workflow.steps.length}`));

      if (result.warnings && result.warnings.length > 0) {
        console.log(chalk.yellow(`\n⚠ Warnings (${result.warnings.length}):`));
        result.warnings.forEach((warning, i) => {
          console.log(chalk.yellow(`  ${i + 1}. ${warning.path}`));
          console.log(chalk.gray(`     ${warning.message}`));
        });
      }

      return { success: true, workflow };
    } else {
      console.log(chalk.red(`✗ Validation failed with ${result.errors.length} error(s)\n`));

      result.errors.forEach((error, i) => {
        console.log(chalk.red(`  ${i + 1}. ${error.path || '/'}`));
        console.log(chalk.gray(`     ${error.message}`));
      });

      if (result.warnings && result.warnings.length > 0) {
        console.log(chalk.yellow(`\n⚠ Warnings (${result.warnings.length}):`));
        result.warnings.forEach((warning, i) => {
          console.log(chalk.yellow(`  ${i + 1}. ${warning.path}`));
          console.log(chalk.gray(`     ${warning.message}`));
        });
      }

      return { success: false };
    }
  } catch (error) {
    console.error(chalk.red(`\n✗ Error validating workflow:`));
    console.error(chalk.red(`  ${error.message}`));
    return { success: false };
  }
}

/**
 * Simulate workflow execution
 */
export async function simulateWorkflow(workflowPath, options = {}) {
  try {
    console.log(chalk.blue(`\n🔄 Simulating workflow: ${workflowPath}\n`));

    // First validate
    const validationResult = await validateWorkflow(workflowPath, { quiet: true });
    if (!validationResult.success) {
      console.log(chalk.red('\n✗ Cannot simulate invalid workflow. Fix validation errors first.\n'));
      return { success: false };
    }

    const workflow = validationResult.workflow;
    const inputs = options.inputs ? JSON.parse(options.inputs) : {};

    // Create executor
    const executor = new WorkflowExecutor({ dryRun: true });

    // Track events
    const events = [];
    const stepTimes = new Map();

    executor.on('workflow:start', (event) => {
      console.log(chalk.cyan(`▶ Starting workflow: ${workflow.name}`));
      events.push({ type: 'workflow:start', ...event });
    });

    executor.on('step:start', (event) => {
      console.log(chalk.gray(`  ▸ Step: ${event.stepId} (${event.type})`));
      stepTimes.set(event.stepId, Date.now());
      events.push({ type: 'step:start', ...event });
    });

    executor.on('step:complete', (event) => {
      const duration = Date.now() - stepTimes.get(event.stepId);
      console.log(chalk.green(`  ✓ ${event.stepId} completed (${duration}ms)`));
      events.push({ type: 'step:complete', ...event });
    });

    executor.on('step:failed', (event) => {
      console.log(chalk.red(`  ✗ ${event.stepId} failed: ${event.error}`));
      events.push({ type: 'step:failed', ...event });
    });

    executor.on('step:skipped', (event) => {
      console.log(chalk.yellow(`  ⊘ ${event.stepId} skipped: ${event.reason}`));
      events.push({ type: 'step:skipped', ...event });
    });

    executor.on('step:retry', (event) => {
      console.log(chalk.yellow(`  ↻ ${event.stepId} retry ${event.attempt}/${event.maxAttempts} (backoff: ${event.backoff}ms)`));
      events.push({ type: 'step:retry', ...event });
    });

    executor.on('parallel:start', (event) => {
      console.log(chalk.cyan(`  ⇉ Parallel execution: ${event.branches} branches`));
      events.push({ type: 'parallel:start', ...event });
    });

    executor.on('parallel:complete', (event) => {
      console.log(chalk.green(`  ✓ Parallel execution completed (${event.duration}ms)`));
      events.push({ type: 'parallel:complete', ...event });
    });

    executor.on('parallel:failed', (event) => {
      console.log(chalk.red(`  ✗ Parallel execution failed: ${event.failed.join(', ')}`));
      events.push({ type: 'parallel:failed', ...event });
    });

    executor.on('conditional:matched', (event) => {
      console.log(chalk.cyan(`  ⟐ Condition matched: ${event.condition}`));
      events.push({ type: 'conditional:matched', ...event });
    });

    executor.on('conditional:default', (event) => {
      console.log(chalk.cyan(`  ⟐ Default case executed`));
      events.push({ type: 'conditional:default', ...event });
    });

    executor.on('compensation:start', (event) => {
      console.log(chalk.magenta(`  ↶ Starting compensation (${event.stackSize} steps)`));
      events.push({ type: 'compensation:start', ...event });
    });

    executor.on('compensation:step', (event) => {
      console.log(chalk.magenta(`  ↶ Compensating: ${event.stepId}`));
      events.push({ type: 'compensation:step', ...event });
    });

    executor.on('compensation:complete', (event) => {
      console.log(chalk.magenta(`  ✓ Compensation completed`));
      events.push({ type: 'compensation:complete', ...event });
    });

    executor.on('workflow:complete', (event) => {
      console.log(chalk.green(`\n✓ Workflow completed in ${event.duration}ms`));
      events.push({ type: 'workflow:complete', ...event });
    });

    executor.on('workflow:failed', (event) => {
      console.log(chalk.red(`\n✗ Workflow failed: ${event.error} (${event.duration}ms)`));
      events.push({ type: 'workflow:failed', ...event });
    });

    // Execute
    const startTime = Date.now();
    let context;
    let success = true;

    try {
      context = await executor.execute(workflow, inputs);
    } catch (error) {
      success = false;
      context = error.context || {};
    }

    const totalDuration = Date.now() - startTime;

    // Display summary
    console.log(chalk.blue('\n━━━ Simulation Summary ━━━\n'));
    console.log(chalk.gray(`  Status: ${success ? chalk.green('SUCCESS') : chalk.red('FAILED')}`));
    console.log(chalk.gray(`  Duration: ${totalDuration}ms`));
    console.log(chalk.gray(`  Steps executed: ${context.stepResults?.size || 0}`));
    console.log(chalk.gray(`  Events: ${events.length}`));

    if (options.verbose) {
      console.log(chalk.blue('\n━━━ Step Results ━━━\n'));
      if (context.stepResults) {
        for (const [stepId, result] of context.stepResults) {
          const statusSymbol = result.status === 'completed' ? '✓' : '✗';
          const statusColor = result.status === 'completed' ? chalk.green : chalk.red;
          console.log(statusColor(`  ${statusSymbol} ${stepId}: ${result.status} (${result.duration}ms)`));
          if (result.output && options.showOutputs) {
            console.log(chalk.gray(`     Output: ${JSON.stringify(result.output, null, 2).split('\n').join('\n     ')}`));
          }
        }
      }
    }

    if (options.trace) {
      console.log(chalk.blue('\n━━━ Execution Trace ━━━\n'));
      events.forEach((event, i) => {
        console.log(chalk.gray(`  ${i + 1}. ${event.type}: ${JSON.stringify(event, null, 2).split('\n').join('\n     ')}`));
      });
    }

    if (options.outputFile) {
      const report = {
        workflow: {
          workflowId: workflow.workflowId,
          name: workflow.name,
          version: workflow.version
        },
        simulation: {
          success,
          duration: totalDuration,
          stepsExecuted: context.stepResults?.size || 0,
          state: context.state || ExecutionState.FAILED
        },
        events,
        stepResults: context.stepResults ? Array.from(context.stepResults.entries()).map(([stepId, result]) => ({
          stepId,
          ...result
        })) : []
      };

      await fs.writeFile(options.outputFile, JSON.stringify(report, null, 2));
      console.log(chalk.gray(`\n  Report written to: ${options.outputFile}`));
    }

    console.log();
    return { success, context, events };

  } catch (error) {
    console.error(chalk.red(`\n✗ Error simulating workflow:`));
    console.error(chalk.red(`  ${error.message}`));
    if (options.verbose) {
      console.error(chalk.gray(error.stack));
    }
    return { success: false };
  }
}

/**
 * List example workflows
 */
export async function listExamples(options = {}) {
  try {
    // Examples live under app/workflow-library/examples relative to repo root
    const examplesDir = path.join(process.cwd(), 'app/workflow-library/examples');
    const files = await fs.readdir(examplesDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    console.log(chalk.blue('\n📚 Example Workflows:\n'));

    for (const file of jsonFiles) {
      const filePath = path.join(examplesDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const workflow = JSON.parse(content);

      console.log(chalk.cyan(`  • ${file}`));
      console.log(chalk.gray(`    Name: ${workflow.name}`));
      console.log(chalk.gray(`    ID: ${workflow.workflowId}`));
      console.log(chalk.gray(`    Description: ${workflow.description || 'N/A'}`));
      console.log(chalk.gray(`    Steps: ${workflow.steps.length}`));

      if (workflow.metadata?.tags) {
        console.log(chalk.gray(`    Tags: ${workflow.metadata.tags.join(', ')}`));
      }
      console.log();
    }

    return { success: true };
  } catch (error) {
    console.error(chalk.red(`\n✗ Error listing examples:`));
    console.error(chalk.red(`  ${error.message}`));
    return { success: false };
  }
}

/**
 * Main workflow command handler
 */
export async function workflowCommand(subcommand, workflowPath, options) {
  switch (subcommand) {
    case 'validate':
      return await validateWorkflow(workflowPath, options);

    case 'simulate':
      return await simulateWorkflow(workflowPath, options);

    case 'examples':
      return await listExamples(options);

    default:
      console.error(chalk.red(`\n✗ Unknown subcommand: ${subcommand}`));
      console.log(chalk.gray('\nAvailable subcommands:'));
      console.log(chalk.gray('  validate <workflow-file>  - Validate workflow definition'));
      console.log(chalk.gray('  simulate <workflow-file>  - Simulate workflow execution'));
      console.log(chalk.gray('  examples                  - List example workflows'));
      return { success: false };
  }
}
