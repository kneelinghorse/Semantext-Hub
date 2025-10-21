import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let tempDir;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), '__ADAPTER_NAME__-'));
});

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

test('buildAdapter produces catalog artifacts', async () => {
  const moduleUrl = pathToFileURL(join(__dirname, '..', 'src', 'index.mjs')).href;
  const { buildAdapter } = await import(moduleUrl);

  const artifactsDir = join(tempDir, 'artifacts');
  const specPath = join(__dirname, '..', 'fixtures', '__SPEC_FILE__');

  const result = await buildAdapter({
    specPath,
    outDir: artifactsDir,
  });

  const catalogRaw = await readFile(join(result.outDir, 'catalog.json'), 'utf8');
  const catalog = JSON.parse(catalogRaw);

  assert.equal(catalog.adapter.name, '__ADAPTER_NAME__');
  assert.equal(catalog.adapter.type, '__ADAPTER_TYPE__');
  assert.ok(Array.isArray(catalog.capabilities));
  assert.equal(typeof catalog.summary.itemsCount, 'number');
});
