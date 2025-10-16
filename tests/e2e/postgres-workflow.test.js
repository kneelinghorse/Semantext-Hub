/**
 * Postgres Workflow End-to-End Tests
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';

import { discoverCommand } from '../../packages/runtime/cli/commands/discover.js';
import { reviewCommand } from '../../packages/runtime/cli/commands/review.js';
import { approveCommand } from '../../packages/runtime/cli/commands/approve.js';

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

async function createTempArtifactsDir(prefix) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const artifactsDir = path.join(tmpDir, 'artifacts');
  await fs.ensureDir(artifactsDir);
  return { tmpDir, artifactsDir };
}

describe('Postgres discover → review → approve workflow', () => {
  let tmpContext;
  let originalUser;
  let runImporterMock;
  let validationResult;

  const sampleManifest = () => ({
    metadata: {
      status: 'draft',
      source: {
        type: 'postgres',
        imported_at: '2025-01-01T00:00:00Z'
      }
    },
    service: {
      name: 'analytics-db',
      urn: 'urn:proto:data:analytics-db/service',
      entities: [
        {
          id: 'urn:proto:data:analytics-db/entities/users',
          name: 'users',
          attributes: [
            { name: 'id', type: 'integer' },
            { name: 'email', type: 'text' }
          ]
        }
      ]
    },
    provenance: {
      importer: 'postgres-importer',
      imported_at: '2025-01-01T00:00:00Z'
    }
  });

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
    validationResult = undefined;
    process.exitCode = undefined;
  });

  test('runs full workflow with mocked importer', async () => {
    tmpContext = await createTempArtifactsDir('postgres-workflow-');
    const { artifactsDir } = tmpContext;

    runImporterMock = jest.fn(() => Promise.resolve(sampleManifest()));
    validationResult = createValidationResult();

    await discoverCommand('data', 'postgresql://localhost:5432/analytics', {
      output: artifactsDir,
      format: 'json',
      runImporter: runImporterMock
    });
    expect(runImporterMock).toHaveBeenCalledWith('postgres', 'postgresql://localhost:5432/analytics', expect.any(Object));
    expect(runImporterMock).toHaveBeenCalledTimes(1);

    const draftPath = path.join(artifactsDir, 'data-manifest.draft.json');
    expect(await fs.pathExists(draftPath)).toBe(true);

    const draftManifest = await fs.readJson(draftPath);
    expect(draftManifest.metadata.status).toBe('draft');
    expect(draftManifest.service).toBeDefined();
    expect(draftManifest.service.entities.length).toBeGreaterThan(0);

    const reviewExit = await withMockedExit(() => reviewCommand(draftPath, { validationResult }));
    expect(reviewExit).toHaveBeenCalledWith(0);

    await approveCommand(draftPath, { validationResult: createValidationResult() });

    const approvedPath = path.join(artifactsDir, 'data-manifest.approved.json');
    expect(await fs.pathExists(approvedPath)).toBe(true);

    const approvedManifest = await fs.readJson(approvedPath);
    expect(approvedManifest.metadata.status).toBe('approved');
    expect(approvedManifest.metadata.approved_at).toBeTruthy();
    expect(approvedManifest.metadata.state_history?.[0]).toMatchObject({
      from: 'draft',
      to: 'approved'
    });
  });

  test('requires force flag when validation errors exist', async () => {
    tmpContext = await createTempArtifactsDir('postgres-workflow-force-');
    const { artifactsDir } = tmpContext;
    const failingValidation = createValidationResult({
      combined: { valid: false, errors: [{ field: 'service', message: 'Invalid service configuration' }], warnings: [] },
      structural: {
        errors: [{ field: 'service.name', message: 'Service name is required' }],
        warnings: [],
        suggestions: []
      },
      cross: {
        issues: {
          errors: [{ message: 'Cross protocol mismatch' }],
          warnings: [],
          info: []
        }
      }
    });

    const invalidManifestPath = path.join(artifactsDir, 'data-manifest.draft.json');
    await fs.writeJson(invalidManifestPath, {
      metadata: { status: 'draft' },
      service: { name: '', entities: [] },
      provenance: { importer: 'postgres-importer', imported_at: '2025-01-01T00:00:00Z' }
    });

    const exitWithoutForce = await withMockedExit(
      () => approveCommand(invalidManifestPath, { validationResult: failingValidation }),
      { throwOnExit: true }
    );
    expect(exitWithoutForce).toHaveBeenCalledWith(1);

    // Force approval succeeds and produces approved manifest
    await approveCommand(invalidManifestPath, { force: true, validationResult: failingValidation });

    const approvedPath = path.join(artifactsDir, 'data-manifest.approved.json');
    expect(await fs.pathExists(approvedPath)).toBe(true);

    const approvedManifest = await fs.readJson(approvedPath);
    expect(approvedManifest.metadata.status).toBe('approved');
    expect(approvedManifest.metadata.state_history?.some(entry => entry.forced)).toBe(true);
  });
});
