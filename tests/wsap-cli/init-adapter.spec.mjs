import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { run } from '../../app/cli/init-adapter.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe('ossp init adapter CLI', () => {
  let tempRoot;
  let originalCwd;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempRoot = await mkdtemp(join(tmpdir(), 'init-adapter-'));
    process.chdir(tempRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
    jest.restoreAllMocks();
  });

  it('scaffolds an adapter with provided options and produces runnable artifacts', async () => {
    const specDir = join(tempRoot, 'specs');
    await mkdir(specDir, { recursive: true });
    const specPath = join(specDir, 'petstore.json');

    const openApiSpec = {
      openapi: '3.0.0',
      info: { title: 'Demo API', version: '1.0.0' },
      paths: {
        '/pets': {
          get: { summary: 'List pets', operationId: 'listPets' },
          post: { summary: 'Create pet', operationId: 'createPet' },
        },
      },
    };

    await writeFile(specPath, JSON.stringify(openApiSpec, null, 2), 'utf8');

    const logger = { log: jest.fn(), error: jest.fn() };
    const exitCode = await run(
      [
        'adapter',
        '--type',
        'api',
        '--name',
        'demo-openapi',
        '--spec',
        specPath,
        '--out',
        'demo-openapi',
        '--cap',
        'adapter.api.discover',
        '--cap',
        'adapter.api.normalize',
      ],
      { logger, cwd: tempRoot },
    );

    expect(exitCode).toBe(0);
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('Adapter "demo-openapi" (api) scaffolded'),
    );

    const adapterDir = join(tempRoot, 'demo-openapi');
    expect(await pathExists(adapterDir)).toBe(true);

    const readme = await readFile(join(adapterDir, 'README.md'), 'utf8');
    expect(readme).toContain('# Demo Openapi Adapter');
    expect(readme).toContain('Spec checksum:');

    const packageJson = JSON.parse(await readFile(join(adapterDir, 'package.json'), 'utf8'));
    expect(packageJson.name).toBe('@ossp/demo-openapi-adapter');
    expect(packageJson.scripts.build).toContain('--spec ./fixtures/petstore.json');

    const agentCard = JSON.parse(await readFile(join(adapterDir, 'agent.card.json'), 'utf8'));
    expect(agentCard.name).toBe('Demo Openapi');
    expect(agentCard.capabilities.tools).toHaveLength(2);
    expect(agentCard.metadata.spec).toBe('./fixtures/petstore.json');

    const fixturePath = join(adapterDir, 'fixtures', 'petstore.json');
    expect(await pathExists(fixturePath)).toBe(true);
    expect(await readFile(fixturePath, 'utf8')).toBe(await readFile(specPath, 'utf8'));

    const schemaMap = JSON.parse(await readFile(join(adapterDir, 'src', 'schema.map.json'), 'utf8'));
    expect(schemaMap.adapter).toBe('demo-openapi');
    expect(schemaMap.source).toBe('./fixtures/petstore.json');

    const moduleUrl = pathToFileURL(join(adapterDir, 'src', 'index.mjs')).href;
    const { buildAdapter } = await import(moduleUrl);
    const artifactsDir = join(tempRoot, 'artifacts');

    const buildResult = await buildAdapter({
      specPath: fixturePath,
      outDir: artifactsDir,
    });

    const catalog = JSON.parse(await readFile(join(buildResult.outDir, 'catalog.json'), 'utf8'));
    expect(catalog.adapter.name).toBe('demo-openapi');
    expect(catalog.adapter.type).toBe('api');
    expect(catalog.summary.itemsCount).toBeGreaterThan(0);
    expect(catalog.source.original.endsWith('petstore.json')).toBe(true);
  });
});
