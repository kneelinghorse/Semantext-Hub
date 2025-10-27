/**
 * Preflight automation smoke tests.
 *
 * Exercises the runPreflight helper in dry-run mode to ensure the orchestrated
 * workflow completes successfully without mutating the repository.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runPreflight } from '../../scripts/preflight/demo-preflight.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(path.join(__dirname, '..', '..'));

describe('demo preflight script', () => {
  const originalEnvKey = process.env.REGISTRY_API_KEY;

  beforeAll(() => {
    jest.setTimeout(60000);
    delete process.env.REGISTRY_API_KEY;
  });

  afterAll(() => {
    if (typeof originalEnvKey === 'string') {
      process.env.REGISTRY_API_KEY = originalEnvKey;
    } else {
      delete process.env.REGISTRY_API_KEY;
    }
  });

  test('runPreflight succeeds in dry-run mode', async () => {
    const summary = await runPreflight({
      workspace: WORKSPACE_ROOT,
      dryRun: true,
      json: true
    });

    expect(summary).toBeDefined();
    expect(summary.ok).toBe(true);

    const dependencyStep = summary.steps.find((step) => step.id === 'dependencies');
    expect(dependencyStep?.ok).toBe(true);

    const backupStep = summary.steps.find((step) => step.id === 'registry-backup');
    expect(backupStep?.details?.dryRun).toBe(true);

    const showcaseStep = summary.steps.find((step) => step.id === 'showcase');
    expect(showcaseStep?.details?.dryRun).toBe(true);
  });
});
