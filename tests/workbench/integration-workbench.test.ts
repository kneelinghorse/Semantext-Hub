import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

import WorkflowOrchestrator from '../../src/workbench/runtime/orchestrator.js';

const __dirnameLocal = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirnameLocal, '..', '..', 'cli', 'index.js');
const WORKSPACE = path.join(__dirnameLocal, '..', '..');

function runCli(args: string[], options: { env?: NodeJS.ProcessEnv } = {}) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const env = {
      ...process.env,
      FORCE_COLOR: '0',
      CI: '1',
      ...options.env
    };

    const child = spawn('node', [CLI_PATH, ...args], {
      cwd: WORKSPACE,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

describe('Integration Workbench orchestration', () => {
  test('WorkflowOrchestrator executes sequential and parallel steps', async () => {
    const orchestrator = new WorkflowOrchestrator();
    const workflow = {
      name: 'test-workflow',
      description: 'Synthetic API → Event → Data flow',
      concurrency: 4,
      steps: [
        {
          id: 'api-step',
          agent: 'api',
          params: { durationMs: 25 }
        },
        {
          id: 'fanout',
          name: 'fanout',
          parallel: [
            {
              id: 'event-step',
              agent: 'event',
              params: { durationMs: 20 }
            },
            {
              id: 'data-step',
              agent: 'data',
              params: { durationMs: 30 }
            }
          ]
        },
        {
          id: 'aggregate-step',
          agent: 'data',
          input: '{{api-step}}',
          params: { durationMs: 15 }
        }
      ]
    };

    const result = await orchestrator.run(workflow);

    expect(result.metrics.stepCount).toBe(4);
    expect(result.metrics.successCount).toBe(4);
    expect(result.metrics.latency.p95Ms).toBeLessThanOrEqual(2000);
    expect(result.metrics.maxConcurrent).toBeGreaterThanOrEqual(2);
    const aggregate = result.steps.find((step) => step.id === 'aggregate-step');
    expect(aggregate?.output).toBeTruthy();
  });

  test('CLI workbench run executes workflow definition and returns metrics', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-run-'));
    const workflowPath = path.join(tempDir, 'workflow.yaml');
    const workflowDefinition = {
      name: 'cli-workflow',
      concurrency: 3,
      steps: [
        { id: 'api-call', agent: 'api', params: { durationMs: 25 } },
        {
          id: 'parallel',
          name: 'parallel',
          parallel: [
            { id: 'emit', agent: 'event', params: { durationMs: 15 } },
            { id: 'write', agent: 'data', params: { durationMs: 18 } }
          ]
        },
        { id: 'final', agent: 'data', input: '{{api-call}}', params: { durationMs: 12 } }
      ]
    };
    await fs.writeFile(workflowPath, YAML.stringify(workflowDefinition), 'utf8');

    const result = await runCli(['workbench', 'run', '--workflow', workflowPath, '--format', 'json']);

    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.workflow.name).toBe('cli-workflow');
    expect(payload.metrics.stepCount).toBe(4);
    expect(payload.metrics.latency.p95Ms).toBeLessThanOrEqual(2000);
  });

  test('CLI workbench bench writes performance results', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-bench-'));
    const outputPath = path.join(tempDir, 'perf-results.json');

    const result = await runCli([
      'workbench',
      'bench',
      '--iterations',
      '2',
      '--output',
      outputPath,
      '--format',
      'json'
    ]);

    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.summary.runCount).toBe(2);
    expect(payload.metrics.latency.p95Ms).toBeLessThanOrEqual(2000);

    const reportContents = await fs.readFile(outputPath, 'utf8');
    const report = JSON.parse(reportContents);
    expect(report.summary.runCount).toBe(2);
  });
});
