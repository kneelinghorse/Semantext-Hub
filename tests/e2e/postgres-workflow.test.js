/**
 * Postgres Workflow End-to-End Tests
 */

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

jest.mock('../../packages/runtime/importers/postgres/importer', () => {
  const importMock = jest.fn();
  const PostgresImporter = jest.fn().mockImplementation(() => ({
    import: importMock
  }));
  PostgresImporter.__importMock = importMock;
  return { PostgresImporter };
});

const { discoverCommand } = require('../../packages/runtime/cli/commands/discover');
const { reviewCommand } = require('../../packages/runtime/cli/commands/review');
const { approveCommand } = require('../../packages/runtime/cli/commands/approve');
const { PostgresImporter } = require('../../packages/runtime/importers/postgres/importer');

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
    PostgresImporter.__importMock.mockReset();
    process.exitCode = undefined;
  });

  test('runs full workflow with mocked importer', async () => {
    tmpContext = await createTempArtifactsDir('postgres-workflow-');
    const { artifactsDir } = tmpContext;

    PostgresImporter.__importMock.mockResolvedValue(sampleManifest());

    await discoverCommand('data', 'postgresql://localhost:5432/analytics', {
      output: artifactsDir,
      format: 'json'
    });

    const draftPath = path.join(artifactsDir, 'data-manifest.draft.json');
    expect(await fs.pathExists(draftPath)).toBe(true);

    const draftManifest = await fs.readJson(draftPath);
    expect(draftManifest.metadata.status).toBe('draft');
    expect(draftManifest.service).toBeDefined();
    expect(draftManifest.service.entities.length).toBeGreaterThan(0);

    const reviewExit = await withMockedExit(() => reviewCommand(draftPath, {}));
    expect(reviewExit).toHaveBeenCalledWith(0);

    await approveCommand(draftPath, {});

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

    const invalidManifestPath = path.join(artifactsDir, 'data-manifest.draft.json');
    await fs.writeJson(invalidManifestPath, {
      metadata: { status: 'draft' },
      service: { name: '', entities: [] },
      provenance: { importer: 'postgres-importer', imported_at: '2025-01-01T00:00:00Z' }
    });

    const exitWithoutForce = await withMockedExit(
      () => approveCommand(invalidManifestPath, {}),
      { throwOnExit: true }
    );
    expect(exitWithoutForce).toHaveBeenCalledWith(1);

    // Force approval succeeds and produces approved manifest
    await approveCommand(invalidManifestPath, { force: true });

    const approvedPath = path.join(artifactsDir, 'data-manifest.approved.json');
    expect(await fs.pathExists(approvedPath)).toBe(true);

    const approvedManifest = await fs.readJson(approvedPath);
    expect(approvedManifest.metadata.status).toBe('approved');
    expect(approvedManifest.metadata.state_history?.some(entry => entry.forced)).toBe(true);
  });
});
