import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_ENTRY = path.resolve(__dirname, '../../cli/index.js');

async function runCli(args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_ENTRY, ...args], {
      cwd: options.cwd ?? path.resolve(__dirname, '../..'),
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

describe('sch CLI smoke tests', () => {
  test('prints top-level help', async () => {
    const result = await runCli(['--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Semantic Context Hub CLI');
    expect(result.stdout).toContain('protocol');
  });

  test('exposes perf status command', async () => {
    const result = await runCli(['perf', 'status', '--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Display performance status summary');
  });

  test('context status stub resolves without failure', async () => {
    const result = await runCli(['context', 'status']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('[stub]');
    expect(result.stdout).toContain('SCH-CLI-001');
    expect(result.stderr).toBe('');
  });
});
