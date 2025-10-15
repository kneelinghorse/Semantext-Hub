import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(_execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper: ensure a clean directory
async function rimraf(dir: string) {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {}
}

describe('CLI Scaffold Smoke', () => {
  const outRoot = path.join(__dirname, '../../artifacts/scaffold-smoke');

  beforeAll(async () => {
    await fs.mkdir(outRoot, { recursive: true });
  });

  afterAll(async () => {
    // keep artifacts for inspection if needed
  });

  test('dry-run preview redacts tokens/keys', async () => {
    const { executeScaffoldCommand } = await import('../../packages/runtime/cli/commands/scaffold.js');

    const logs: string[] = [];
    const origLog = console.log;
    try {
      // Capture console output
      console.log = (...args: any[]) => {
        logs.push(args.map(String).join(' '));
      };

      const secret = 'ghp_abcdefghijklmnopqrstuvwxyzABCDEF0123456789';
      await executeScaffoldCommand({
        type: 'api',
        name: 'SmokePreviewAPI',
        output: outRoot,
        description: `test token ${secret}`,
        dryRun: true,
        write: false,
        includeImporter: false,
        includeTests: false,
        trace: false,
        verbose: false,
      });

      const full = logs.join('\n');
      expect(full).not.toContain(secret);
      expect(full).toContain('[REDACTED]');
      expect(full).toContain('Preview (redacted):');
    } finally {
      console.log = origLog;
    }
  });

  test('write generates ESM-sane skeletons for api/data/event', async () => {
    const { executeScaffoldCommand } = await import('../../packages/runtime/cli/commands/scaffold.js');

    for (const type of ['api', 'data', 'event'] as const) {
      const name = `Smoke_${type.toUpperCase()}_${Date.now()}`;
      const outDir = path.join(outRoot, `${type}-${Date.now()}`);
      await rimraf(outDir);

      const res = await executeScaffoldCommand({
        type,
        name,
        output: outDir,
        write: true,
        dryRun: false,
        includeImporter: true,
        includeTests: true,
        trace: false,
        verbose: false,
      });

      // Expect files exist
      const manifestPath = path.join(outDir, 'manifests', `${name}.json`);
      const importerFile = path.join(outDir, 'importers', `${name.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase()}-importer.js`);
      const testFile = path.join(outDir, 'tests', `${name.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase()}-importer.test.js`);

      await expect(fs.access(manifestPath)).resolves.toBeUndefined();
      await expect(fs.access(importerFile)).resolves.toBeUndefined();
      await expect(fs.access(testFile)).resolves.toBeUndefined();

      // Validate test import path references the importers folder (ESM relative import)
      const testContent = await fs.readFile(testFile, 'utf-8');
      expect(testContent).toMatch(/from '\.\.\/importers\//);

      // Syntax check files (node --check)
      await execFile('node', ['--check', importerFile]);
      await execFile('node', ['--check', testFile]);

      // Dynamic import importer to ensure ESM compiles
      const mod = await import(pathToFileURL(importerFile).href);
      expect(mod).toBeTruthy();
      expect(mod.default).toBeTruthy();
    }
  });
});

