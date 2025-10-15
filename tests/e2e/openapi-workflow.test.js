/**
 * OpenAPI Workflow End-to-End Tests
 */

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
// ESM/CJS-safe __dirname resolution
const __dirnameResolved = (typeof __dirname !== 'undefined')
  ? __dirname
  : (() => { const { fileURLToPath } = require('url'); const __filename = fileURLToPath(import.meta.url); return path.dirname(__filename); })();

const { discoverCommand } = require('../../packages/runtime/cli/commands/discover');
const { reviewCommand } = require('../../packages/runtime/cli/commands/review');
const { approveCommand } = require('../../packages/runtime/cli/commands/approve');
const { formatOutput } = require('../../packages/runtime/cli/utils/output');

const FIXTURES_DIR = path.join(__dirnameResolved, 'fixtures');
const PETSTORE_SPEC = path.join(FIXTURES_DIR, 'petstore-mini.json');

function withMockedExit(fn, { throwOnExit = false } = {}) {
  const originalExit = process.exit;
  const exitSignal = new Error('__process_exit__');
  const mockExit = jest.fn(() => {
    if (throwOnExit) {
      throw exitSignal;
    }
    return undefined;
  });
  process.exit = mockExit;

  return fn()
    .catch(error => {
      if (!throwOnExit || error !== exitSignal) {
        throw error;
      }
      return null;
    })
    .finally(() => {
      process.exit = originalExit;
    })
    .then(() => mockExit);
}

function createTempArtifactsDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix)).then(async dir => {
    const artifactsDir = path.join(dir, 'artifacts');
    await fs.ensureDir(artifactsDir);
    return { tmpDir: dir, artifactsDir };
  });
}

describe('OpenAPI discover → review → approve workflow', () => {
  let originalUser;
  let tmpContext;

  beforeAll(() => {
    originalUser = process.env.USER;
    process.env.USER = 'workflow-tester';
  });

  afterAll(() => {
    if (originalUser !== undefined) {
      process.env.USER = originalUser;
    } else {
      delete process.env.USER;
    }
  });

  afterEach(async () => {
    if (tmpContext) {
      await fs.remove(tmpContext.tmpDir);
      tmpContext = null;
    }
    process.exitCode = undefined;
  });

  test('runs full workflow for OpenAPI spec', async () => {
    tmpContext = await createTempArtifactsDir('openapi-workflow-');
    const { artifactsDir } = tmpContext;

    const manifest = await discoverCommand('api', PETSTORE_SPEC, {
      output: artifactsDir,
      format: 'json'
    });

    expect(manifest).toBeTruthy();
    expect(process.exitCode).toBeUndefined();

    const draftPath = path.join(artifactsDir, 'api-manifest.draft.json');
    const draftExists = await fs.pathExists(draftPath);
    expect(draftExists).toBe(true);

    const draftManifest = await fs.readJson(draftPath);
    expect(draftManifest.metadata.status).toBe('draft');
    expect(draftManifest.service).toBeDefined();
    expect(draftManifest.interface?.endpoints.length).toBeGreaterThan(0);
    expect(draftManifest.provenance).toBeDefined();

    const reviewExit = await withMockedExit(() => reviewCommand(draftPath, {}));
    expect(reviewExit).toHaveBeenCalledWith(0);

    await approveCommand(draftPath, {});

    const approvedPath = path.join(artifactsDir, 'api-manifest.approved.json');
    const approvedExists = await fs.pathExists(approvedPath);
    expect(approvedExists).toBe(true);

    const approvedManifest = await fs.readJson(approvedPath);
    expect(approvedManifest.metadata.status).toBe('approved');
    expect(approvedManifest.metadata.approved_at).toBeTruthy();
    expect(approvedManifest.metadata.approved_by).toBe('workflow-tester');
    expect(approvedManifest.metadata.state_history?.length).toBeGreaterThan(0);
  });

  test('handles malformed OpenAPI spec gracefully', async () => {
    tmpContext = await createTempArtifactsDir('openapi-workflow-invalid-');
    const { artifactsDir } = tmpContext;
    const invalidSpec = path.join(tmpContext.tmpDir, 'invalid.json');
    await fs.writeJson(invalidSpec, { info: { title: 'Broken' } });

    const manifest = await discoverCommand('api', invalidSpec, {
      output: artifactsDir,
      format: 'json'
    });

    expect(manifest).toBeTruthy();
    expect(manifest.metadata.status).toBe('error');
    expect(process.exitCode).toBe(1);

    const draftPath = path.join(artifactsDir, 'api-manifest.draft.json');
    expect(await fs.pathExists(draftPath)).toBe(true);
  });

  test('outputs plain JSON when running in CI mode', async () => {
    tmpContext = await createTempArtifactsDir('openapi-workflow-ci-');
    const { artifactsDir } = tmpContext;

    const manifest = await discoverCommand('api', PETSTORE_SPEC, {
      output: artifactsDir,
      format: 'json'
    });

    const formatted = formatOutput(manifest, 'json', true);
    expect(formatted.trim().startsWith('{')).toBe(true);
    expect(formatted).toContain('"metadata"');
  });
});
