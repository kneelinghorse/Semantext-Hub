import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirnameLocal = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirnameLocal, '../../cli/index.js');
const WORKSPACE = path.join(__dirnameLocal, '..', '..');

async function runCli(args: string[], options: { env?: NodeJS.ProcessEnv } = {}) {
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

describe('catalog CLI', () => {
  test('catalog list emits protocol summary as JSON', async () => {
    const result = await runCli(['catalog', 'list', '--workspace', WORKSPACE, '--format', 'json']);

    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(Array.isArray(parsed)).toBe(true);
    const names = parsed.map((entry: { name: string }) => entry.name);
    expect(names).toContain('Sample Customer API');
  });

  test('catalog view returns detailed manifest metadata', async () => {
    const result = await runCli([
      'catalog',
      'view',
      'Sample Customer API',
      '--workspace',
      WORKSPACE,
      '--format',
      'json'
    ]);

    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout.trim());
    expect(payload.name).toBe('Sample Customer API');
    expect(payload.manifest.metadata.name).toBe('Sample Customer API');
    expect(payload.manifest.relationships.depends_on).toContain(
      'urn:proto:data:sample.set/customer-db@v1.0.0'
    );
  });

  test('catalog generate-diagram writes Draw.io artifact and enforces overwrite rules', async () => {
    const outputPath = path.join(
      WORKSPACE,
      'artifacts',
      'diagrams',
      `catalog-test-${Date.now()}.drawio`
    );

    try {
      const generation = await runCli([
        'catalog',
        'generate-diagram',
        '--workspace',
        WORKSPACE,
        '--output',
        outputPath,
        '--overwrite'
      ]);

      expect(generation.code).toBe(0);
      const fileContents = await fs.readFile(outputPath, 'utf8');
      expect(fileContents).toContain('<mxfile');

      const failure = await runCli([
        'catalog',
        'generate-diagram',
        '--workspace',
        WORKSPACE,
        '--output',
        outputPath
      ]);

      expect(failure.code).not.toBe(0);
      expect(failure.stderr).toContain('overwrite');
    } finally {
      await fs.rm(outputPath, { force: true });
    }
  });
});
