/**
 * OpenAPI Workflow End-to-End Tests
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { discoverCommand } from '../../packages/runtime/cli/commands/discover.js';
import { reviewCommand } from '../../packages/runtime/cli/commands/review.js';
import { approveCommand } from '../../packages/runtime/cli/commands/approve.js';
import { formatOutput } from '../../packages/runtime/cli/utils/output.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const PETSTORE_SPEC = path.join(FIXTURES_DIR, 'petstore-mini.json');

function createOpenAPIManifest() {
  return {
    metadata: {
      status: 'draft',
      name: 'petstore-mini'
    },
    interface: {
      endpoints: [
        {
          method: 'GET',
          path: '/pets',
          summary: 'List pets'
        }
      ]
    },
    service: {
      name: 'petstore-service',
      version: '1.0.0'
    },
    provenance: {
      importer: 'openapi-test-importer',
      imported_at: new Date().toISOString()
    }
  };
}

function createValidationResult(overrides = {}) {
  const base = {
    structural: { errors: [], warnings: [], suggestions: [] },
    cross: { issues: { errors: [], warnings: [], info: [] } },
    combined: { valid: true, errors: [], warnings: [] },
    diff: {
      summary: {
        totalChanges: 0,
        breaking: 0,
        nonBreaking: 0,
        compatible: 0,
        internal: 0,
        hasBreakingChanges: false
      },
      changes: { breaking: [] }
    },
    breaking: {
      hasBreakingChanges: false,
      riskScore: 0,
      downstreamImpact: { totalAffected: 0, criticalPath: false },
      recommendation: { level: 'none', actions: [] }
    },
    migration: {
      required: false,
      blockers: [],
      warnings: [],
      suggestions: [],
      effort: { estimatedHours: 0, complexity: 'low', confidence: 1 }
    },
    graph: { nodes: 0, edges: 0, cache: { hitRatio: 1 } },
    context: { loadErrors: [] }
  };

  return {
    ...base,
    ...overrides,
    structural: { ...base.structural, ...(overrides.structural || {}) },
    cross: {
      ...base.cross,
      ...(overrides.cross || {}),
      issues: {
        ...base.cross.issues,
        ...((overrides.cross && overrides.cross.issues) || {})
      }
    },
    combined: { ...base.combined, ...(overrides.combined || {}) },
    diff: {
      ...base.diff,
      ...(overrides.diff || {}),
      summary: { ...base.diff.summary, ...((overrides.diff && overrides.diff.summary) || {}) },
      changes: { ...base.diff.changes, ...((overrides.diff && overrides.diff.changes) || {}) }
    },
    breaking: { ...base.breaking, ...(overrides.breaking || {}) },
    migration: { ...base.migration, ...(overrides.migration || {}) },
    graph: { ...base.graph, ...(overrides.graph || {}) },
    context: { ...base.context, ...(overrides.context || {}) }
  };
}

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
  let runImporterMock;
  let validationResult;

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
    if (runImporterMock) {
      runImporterMock.mockReset();
      runImporterMock = null;
    }
    process.exitCode = undefined;
  });

  test('runs full workflow for OpenAPI spec', async () => {
    tmpContext = await createTempArtifactsDir('openapi-workflow-');
    const { artifactsDir } = tmpContext;
    runImporterMock = jest.fn(() => Promise.resolve(createOpenAPIManifest()));
    validationResult = createValidationResult();

    const manifest = await discoverCommand('api', PETSTORE_SPEC, {
      output: artifactsDir,
      format: 'json',
      runImporter: runImporterMock
    });

    expect(manifest).toBeTruthy();
    expect(process.exitCode).toBeUndefined();
    expect(runImporterMock).toHaveBeenCalledWith('openapi', PETSTORE_SPEC, expect.any(Object));
    expect(runImporterMock).toHaveBeenCalledTimes(1);

    const draftPath = path.join(artifactsDir, 'api-manifest.draft.json');
    const draftExists = await fs.pathExists(draftPath);
    expect(draftExists).toBe(true);

    const draftManifest = await fs.readJson(draftPath);
    expect(draftManifest.metadata.status).toBe('draft');
    expect(draftManifest.service).toBeDefined();
    expect(draftManifest.interface?.endpoints.length).toBeGreaterThan(0);
    expect(draftManifest.provenance).toBeDefined();

    const reviewExit = await withMockedExit(() => reviewCommand(draftPath, { validationResult }));
    expect(reviewExit).toHaveBeenCalledWith(0);

    await approveCommand(draftPath, { validationResult });

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
    runImporterMock = jest.fn()
      .mockImplementationOnce(() => Promise.resolve({
        metadata: { status: 'error', name: 'broken' },
        provenance: { importer: 'openapi-test-importer' }
      }));

    const manifest = await discoverCommand('api', invalidSpec, {
      output: artifactsDir,
      format: 'json',
      runImporter: runImporterMock
    });

    expect(manifest).toBeTruthy();
    expect(manifest.metadata.status).toBe('error');
    expect(process.exitCode).toBe(1);
    expect(runImporterMock).toHaveBeenCalledWith('openapi', invalidSpec, expect.any(Object));

    const draftPath = path.join(artifactsDir, 'api-manifest.draft.json');
    expect(await fs.pathExists(draftPath)).toBe(true);
  });

  test('outputs plain JSON when running in CI mode', async () => {
    tmpContext = await createTempArtifactsDir('openapi-workflow-ci-');
    const { artifactsDir } = tmpContext;
    runImporterMock = jest.fn(() => Promise.resolve(createOpenAPIManifest()));

    const manifest = await discoverCommand('api', PETSTORE_SPEC, {
      output: artifactsDir,
      format: 'json',
      runImporter: runImporterMock
    });

    const formatted = formatOutput(manifest, 'json', true);
    expect(formatted.trim().startsWith('{')).toBe(true);
    expect(formatted).toContain('"metadata"');
  });
});
