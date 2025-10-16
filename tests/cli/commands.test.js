/**
 * CLI Commands Tests
 *
 * Tests for discover, review, and approve commands
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

import * as discoverModule from '../../packages/runtime/cli/commands/discover.js';
import { reviewCommand } from '../../packages/runtime/cli/commands/review.js';
import { approveCommand } from '../../packages/runtime/cli/commands/approve.js';
import { governanceCommand } from '../../packages/runtime/cli/commands/governance.js';
import { formatOutput } from '../../packages/runtime/cli/utils/output.js';
import { isCI } from '../../packages/runtime/cli/utils/detect-ci.js';

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  discoverCommand,
  detectSourceType,
  determineManifestType,
  generateOutputFilename
} = discoverModule;

const TEST_OUTPUT_DIR = path.join(__dirname, '../../..', 'test-artifacts');

let logSpy;
let errorSpy;
let warnSpy;
let logOutput;
let errorOutput;
let warnOutput;
let runImporterMock;
let validationResult;

beforeAll(async () => {
  await fs.ensureDir(TEST_OUTPUT_DIR);
});

beforeEach(() => {
  logOutput = [];
  errorOutput = [];
  warnOutput = [];

  logSpy = jest.spyOn(console, 'log').mockImplementation((...args) => {
    logOutput.push(args.join(' '));
  });
  errorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
    errorOutput.push(args.join(' '));
  });
  warnSpy = jest.spyOn(console, 'warn').mockImplementation((...args) => {
    warnOutput.push(args.join(' '));
  });

  runImporterMock = jest.fn().mockResolvedValue({ metadata: { status: 'draft' }, provenance: {}, interface: {} });
  validationResult = {
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
  process.exitCode = undefined;
});

afterEach(async () => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  warnSpy.mockRestore();
  await fs.emptyDir(TEST_OUTPUT_DIR);
  process.exitCode = undefined;
});

afterAll(async () => {
  await fs.remove(TEST_OUTPUT_DIR);
});

describe('discover command helpers', () => {
  test('detectSourceType recognises supported sources', () => {
    expect(detectSourceType('postgresql://user:pass@localhost/db')).toBe('postgres');
    expect(detectSourceType('https://petstore.swagger.io/v2/swagger.json')).toBe('openapi-url');
    expect(detectSourceType('./spec.yaml')).toBe('openapi');
  });

  test('detectSourceType throws for unsupported sources', () => {
    expect(() => detectSourceType('ftp://example.com')).toThrow('Could not detect source type');
  });

  test('determineManifestType infers type when set to auto', () => {
    expect(determineManifestType('auto', 'openapi')).toBe('api');
    expect(determineManifestType('auto', 'postgres')).toBe('data');
  });

  test('determineManifestType validates unsupported types', () => {
    expect(() => determineManifestType('event', 'openapi')).toThrow('Event discovery requires AsyncAPI specification');
    expect(() => determineManifestType('graph', 'openapi')).toThrow('Unsupported contract type');
  });

  test('generateOutputFilename produces draft naming convention', () => {
    expect(generateOutputFilename('api', 'json')).toBe('api-manifest.draft.json');
    expect(generateOutputFilename('data', 'yaml')).toBe('data-manifest.draft.yaml');
  });
});

describe('discover command', () => {
  const apiManifest = {
    metadata: { name: 'petstore', status: 'draft' },
    catalog: { type: 'api', endpoints: [] },
    provenance: { importer: 'OpenAPIImporter' }
  };

  const dataManifest = {
    metadata: { name: 'analytics', status: 'draft' },
    catalog: { type: 'database', schemas: [] },
    provenance: { importer: 'PostgresImporter' }
  };

  test('writes manifest for OpenAPI discovery', async () => {
    runImporterMock.mockResolvedValueOnce(apiManifest);

    const manifest = await discoverCommand('api', './openapi.json', {
      output: TEST_OUTPUT_DIR,
      format: 'json',
      runImporter: runImporterMock
    });

    const outputPath = path.join(TEST_OUTPUT_DIR, 'api-manifest.draft.json');
    const exists = await fs.pathExists(outputPath);
    const saved = await fs.readJson(outputPath);

    expect(runImporterMock).toHaveBeenCalledWith('openapi', './openapi.json', expect.any(Object));
    expect(runImporterMock).toHaveBeenCalledTimes(1);
    expect(manifest).toEqual(expect.objectContaining({ metadata: expect.any(Object) }));
    expect(exists).toBe(true);
    expect(saved.provenance.tool).toBe('protocol-discover');
    expect(saved.provenance.source_location).toBe('./openapi.json');
    expect(process.exitCode).toBeUndefined();
    expect(logOutput.some(msg => msg.includes('Manifest saved'))).toBe(true);
  });

  test('writes manifest for Postgres discovery', async () => {
    runImporterMock.mockResolvedValueOnce(dataManifest);

    const manifest = await discoverCommand('data', 'postgresql://localhost:5432/db', {
      output: TEST_OUTPUT_DIR,
      format: 'json',
      runImporter: runImporterMock
    });

    const outputPath = path.join(TEST_OUTPUT_DIR, 'data-manifest.draft.json');
    const saved = await fs.readJson(outputPath);

    expect(runImporterMock).toHaveBeenCalledWith('postgres', 'postgresql://localhost:5432/db', expect.any(Object));
    expect(manifest.catalog.type).toBe('database');
    expect(saved.provenance.tool).toBe('protocol-discover');
    expect(saved.metadata.status).toBe('draft');
  });

  test('handles importer errors gracefully', async () => {
    runImporterMock.mockRejectedValueOnce(new Error('network failure'));

    const manifest = await discoverCommand('api', './broken.json', {
      output: TEST_OUTPUT_DIR,
      format: 'json',
      runImporter: runImporterMock
    });

    expect(manifest).toBeNull();
    expect(process.exitCode).toBe(1);
    expect(errorOutput.some(msg => msg.includes('network failure')) || errorOutput.some(msg => msg.includes('Discovery failed'))).toBe(true);
  });
});

describe('governance command', () => {
  test('generates governance document from manifests', async () => {
    const manifestDir = TEST_OUTPUT_DIR;
    const manifestPath = path.join(manifestDir, 'sample-manifest.json');

    const manifest = {
      metadata: {
        urn: 'urn:proto:api:test.com/service@1.0.0',
        name: 'Test Service',
        status: 'approved',
        kind: 'api'
      },
      catalog: {
        type: 'api',
        endpoints: []
      },
      interface: {
        endpoints: []
      }
    };

    await fs.writeJson(manifestPath, manifest);

    const outputPath = path.join(manifestDir, 'GOVERNANCE.md');
    const result = await governanceCommand({
      output: outputPath,
      manifests: manifestDir,
      sections: 'overview,architecture'
    });

    expect(result).toBeTruthy();
    expect(await fs.pathExists(outputPath)).toBe(true);
    const content = await fs.readFile(outputPath, 'utf8');
    expect(content).toContain('# Protocol Governance');
    expect(process.exitCode).toBeUndefined();
    expect(logOutput.some(msg => msg.includes('GOVERNANCE.md generated'))).toBe(true);
  });
});

describe('review command', () => {
  test('fails with non-existent manifest', async () => {
    const manifestPath = path.join(TEST_OUTPUT_DIR, 'missing.json');

    const originalExit = process.exit;
    process.exit = jest.fn();

    await reviewCommand(manifestPath, {});

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(errorOutput.some(msg => msg.includes('not found'))).toBe(true);

    process.exit = originalExit;
  });

  test('reads existing draft manifest', async () => {
    const manifestPath = path.join(TEST_OUTPUT_DIR, 'test-manifest.draft.json');
    const manifest = {
      metadata: {
        status: 'draft',
        urn: 'urn:proto:api:test.com/service@1.0.0',
        kind: 'api',
        source: { type: 'openapi', imported_at: '2025-01-01T00:00:00Z' },
        version: '1.0.0'
      },
      catalog: {
        type: 'rest',
        urn: 'urn:proto:api:test.com/service',
        endpoints: [
          {
            id: 'urn:proto:api.endpoint:test.com/service/list-users@1.0.0',
            pattern: '/users',
            method: 'GET'
          }
        ]
      },
      provenance: {
        importer: 'test-suite',
        imported_at: '2025-01-01T00:00:00Z'
      }
    };

    await fs.writeJson(manifestPath, manifest);

    const originalExit = process.exit;
    process.exit = jest.fn();

    await reviewCommand(manifestPath, { validationResult });

    expect(logOutput.some(msg => msg.includes('draft'))).toBe(true);
    expect(process.exit).toHaveBeenCalledWith(0);

    process.exit = originalExit;
  });
});

describe('approve command', () => {
  test('fails with non-existent manifest', async () => {
    const manifestPath = path.join(TEST_OUTPUT_DIR, 'missing.json');
    const originalExit = process.exit;
    process.exit = jest.fn();

    await approveCommand(manifestPath, {});

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(errorOutput.some(msg => msg.includes('not found'))).toBe(true);

    process.exit = originalExit;
  });

  test('warns when manifest is already approved', async () => {
    const manifestPath = path.join(TEST_OUTPUT_DIR, 'approved.json');
    const manifest = {
      metadata: { status: 'approved' },
      catalog: { type: 'database' }
    };

    await fs.writeJson(manifestPath, manifest);

    await approveCommand(manifestPath, {});

    expect(warnOutput.some(msg => msg.includes('already approved'))).toBe(true);
  });

  test('requires force flag for error manifests', async () => {
    const manifestPath = path.join(TEST_OUTPUT_DIR, 'error.json');
    const manifest = {
      metadata: { status: 'error' },
      catalog: { type: 'database' }
    };

    await fs.writeJson(manifestPath, manifest);

    const originalExit = process.exit;
    process.exit = jest.fn();

    const failingValidation = {
      ...validationResult,
      combined: { valid: false, errors: [{ message: 'Blocking error' }], warnings: [] },
      structural: {
        ...validationResult.structural,
        errors: [{ field: 'catalog', message: 'Catalog missing required configuration' }]
      },
      cross: {
        issues: {
          ...validationResult.cross.issues,
          errors: [{ message: 'Cross-protocol mismatch detected' }],
          warnings: [],
          info: []
        }
      }
    };

    await approveCommand(manifestPath, { force: false, validationResult: failingValidation });

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(errorOutput.some(msg => msg.includes('Cannot approve'))).toBe(true);

    process.exit = originalExit;
  });
});

describe('utilities', () => {
  test('detects CI environment flag', () => {
    const originalCI = process.env.CI;

    process.env.CI = 'true';
    expect(isCI()).toBe(true);

    delete process.env.CI;
    expect(isCI()).toBe(false);

    if (originalCI !== undefined) {
      process.env.CI = originalCI;
    }
  });

  test('formats output as JSON when YAML library unavailable', () => {
    const manifest = { test: 'data' };

    const json = formatOutput(manifest, 'json', false);
    expect(json).toContain('"test"');

    const yamlFallback = formatOutput(manifest, 'yaml', false);
    expect(yamlFallback.includes('"test"') || yamlFallback.includes('test:')).toBe(true);
  });
});
