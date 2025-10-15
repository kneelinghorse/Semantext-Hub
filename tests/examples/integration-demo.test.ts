import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __dirnameLocal = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.join(__dirnameLocal, '..', '..');
const CLI_PATH = path.join(APP_ROOT, 'cli', 'index.js');

function runCli(args: string[]) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      cwd: APP_ROOT,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        CI: '1'
      },
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

describe('Integration demo workflow documentation', () => {
  const workflowPath = path.join(APP_ROOT, 'examples', 'integration', 'workbench-demo.yaml');
  const docPath = path.join(APP_ROOT, 'docs', 'dev', 'examples', 'integration-demo.md');
  const drawioPath = path.join(APP_ROOT, 'artifacts', 'examples', 'integration-diagram.drawio');
  const cytoscapePath = path.join(APP_ROOT, 'artifacts', 'examples', 'integration-diagram.json');

  test('workflow definition models API → Event → Data fan-out', async () => {
    const contents = await fs.readFile(workflowPath, 'utf8');
    const definition = YAML.parse(contents);

    expect(definition.name).toBe('integration-workbench-demo');
    expect(Array.isArray(definition.steps)).toBe(true);

    const parallelStep = definition.steps.find((step: Record<string, unknown>) => Boolean(step.parallel));
    expect(parallelStep).toBeDefined();
    expect(Array.isArray(parallelStep?.parallel)).toBe(true);
    const agentKinds = new Set(
      parallelStep?.parallel?.map((entry: Record<string, string>) => entry.agent) ?? []
    );
    expect(agentKinds.has('event')).toBe(true);
    expect(agentKinds.has('data')).toBe(true);

    const terminalStep = definition.steps[definition.steps.length - 1];
    expect(terminalStep.agent).toBe('data');
  });

  test('workbench CLI executes the integration demo workflow', async () => {
    const { code, stdout, stderr } = await runCli([
      'workbench',
      'run',
      '--workflow',
      './examples/integration/workbench-demo.yaml',
      '--format',
      'json'
    ]);

    expect(stderr).toBe('');
    expect(code).toBe(0);
    const payload = JSON.parse(stdout.trim());
    expect(payload.workflow.name).toBe('integration-workbench-demo');
    expect(payload.metrics.stepCount).toBe(6);
    expect(payload.metrics.latency.p95Ms).toBeLessThanOrEqual(2000);
    expect(payload.steps.some((step: { id: string }) => step.id === 'emit-order-received')).toBe(true);
  });

  test('documentation references existing visualization artifacts', async () => {
    const docContents = await fs.readFile(docPath, 'utf8');
    expect(docContents).toContain('integration-diagram.drawio');
    expect(docContents).toContain('integration-diagram.json');

    await expect(fs.access(drawioPath)).resolves.toBeUndefined();

    const cytoscapeContents = await fs.readFile(cytoscapePath, 'utf8');
    const cytoscapeGraph = JSON.parse(cytoscapeContents);
    expect(Array.isArray(cytoscapeGraph.elements.nodes)).toBe(true);
    expect(cytoscapeGraph.elements.nodes.length).toBeGreaterThanOrEqual(5);
    expect(cytoscapeGraph.elements.edges.some((edge: { data: { relationship: string } }) => edge.data.relationship === 'fanout')).toBe(true);
  });
});
