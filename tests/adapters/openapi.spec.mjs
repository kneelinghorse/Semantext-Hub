import { afterEach, beforeEach, test, expect } from '@jest/globals';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let tempDir;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'adapter-openapi-'));
});

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

test('openapi adapter builds catalog', async () => {
  const moduleUrl = pathToFileURL(
    join(__dirname, '..', '..', 'app', 'adapters', 'openapi', 'src', 'index.mjs'),
  ).href;
  const { buildAdapter } = await import(moduleUrl);

  const artifactsDir = join(tempDir, 'artifacts');
  const specPath = join(
    __dirname,
    '..',
    '..',
    'app',
    'adapters',
    'openapi',
    'fixtures',
    'spec.json',
  );

  const result = await buildAdapter({ specPath, outDir: artifactsDir });

  const catalogRaw = await readFile(join(result.outDir, 'catalog.json'), 'utf8');
  const catalog = JSON.parse(catalogRaw);

  expect(catalog.adapter.name).toBe('openapi');
  expect(catalog.adapter.type).toBe('api');
  expect(Array.isArray(catalog.capabilities)).toBe(true);
  expect(typeof catalog.summary.itemsCount).toBe('number');
});
