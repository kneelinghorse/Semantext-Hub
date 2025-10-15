#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';

import { createConsole } from '../../src/cli/ux/console.js';
import WorkflowOrchestrator from '../../src/workbench/runtime/orchestrator.js';

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadWorkflowDefinition(workflowPath) {
  const exists = await fileExists(workflowPath);
  if (!exists) {
    throw new Error(`Workflow definition not found: ${workflowPath}`);
  }

  const raw = await fs.readFile(workflowPath, 'utf8');
  if (!raw.trim()) {
    throw new Error('Workflow definition file is empty.');
  }

  if (workflowPath.endsWith('.json')) {
    return JSON.parse(raw);
  }

  return YAML.parse(raw);
}

function formatStepSummary(step) {
  const status = step.status === 'ok' ? '✓' : '✖';
  const latency = `${step.durationMs}ms`;
  const label = step.group ? `${step.id} (${step.group})` : step.id;
  return `${status} ${label} – ${latency}`;
}

async function writeOutputFile(outputPath, summary) {
  const resolved = path.resolve(outputPath);
  const directory = path.extname(resolved) ? path.dirname(resolved) : resolved;

  await fs.mkdir(directory, { recursive: true });
  const filePath = path.extname(resolved) ? resolved : path.join(resolved, 'workflow-summary.json');
  await fs.writeFile(filePath, JSON.stringify(summary, null, 2), 'utf8');

  return filePath;
}

export async function workbenchRunCommand(options = {}) {
  const consoleUi = createConsole();
  const workflowPath = options.workflow ? path.resolve(options.workflow) : undefined;
  const format = String(options.format ?? 'text').toLowerCase();
  const failFast = Boolean(options.failFast ?? false);

  if (!workflowPath) {
    consoleUi.error('Missing required --workflow option.', [
      'Provide a YAML/JSON workflow definition file.',
      'Example: app-cli workbench run --workflow ./examples/workflow.yaml'
    ]);
    process.exitCode = 1;
    return null;
  }

  const spinner = format === 'json' ? null : consoleUi.spinner('Executing integration workflow...');
  if (spinner) {
    spinner.start();
  }

  try {
    const definition = await loadWorkflowDefinition(workflowPath);
    const orchestrator = new WorkflowOrchestrator();
    const summary = await orchestrator.run(definition, { failFast });

    if (spinner) {
      spinner.succeed(
        `Workflow "${summary.workflow.name}" completed in ${summary.metrics.totalDurationMs}ms`
      );
    }

    if (options.output) {
      const outputFile = await writeOutputFile(options.output, summary);
      consoleUi.info(`Saved workflow summary to ${outputFile}`);
    }

    if (format === 'json') {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      consoleUi.success('Integration workflow executed successfully.', [
        `Steps: ${summary.metrics.successCount}/${summary.metrics.stepCount} succeeded`,
        `p95 latency: ${summary.metrics.latency.p95Ms}ms`,
        `Max concurrency: ${summary.metrics.maxConcurrent}`
      ]);

      for (const step of summary.steps) {
        consoleUi.info(formatStepSummary(step));
      }
    }

    return summary;
  } catch (error) {
    if (spinner) {
      spinner.fail('Workflow execution failed.');
    }

    const message = error instanceof Error ? error.message : String(error);
    consoleUi.error('Integration workflow failed.', [message]);
    if (error instanceof Error && error.cause instanceof Error) {
      consoleUi.error('Underlying error details:', [error.cause.message]);
    }
    process.exitCode = 1;
    return null;
  }
}

export default {
  workbenchRunCommand
};
