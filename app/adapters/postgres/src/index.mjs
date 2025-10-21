#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import process from 'node:process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ADAPTER_NAME = 'postgres';
const ADAPTER_TYPE = 'data';
const DEFAULT_CAPABILITIES = [
  "adapter.data.discover",
  "adapter.data.extract"
];
const PACKAGE_VERSION = '0.1.0';

const __dirname = dirname(fileURLToPath(import.meta.url));

function isRemoteSpec(specPath) {
  return typeof specPath === 'string' && /^https?:\/\//i.test(specPath);
}

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function checksum(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function detectFileName(specPath) {
  if (isRemoteSpec(specPath)) {
    try {
      const url = new URL(specPath);
      const segment = url.pathname.split('/').filter(Boolean).pop();
      if (segment) {
        return basename(segment);
      }
    } catch {
      // ignore
    }
    return 'remote-spec.json';
  }
  return basename(specPath);
}

async function fetchRemoteSpec(specPath) {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch API unavailable; upgrade Node.js or provide a local spec path.');
  }
  const response = await fetch(specPath);
  if (!response.ok) {
    const reason = `${response.status} ${response.statusText ?? ''}`.trim();
    throw new Error(`Failed to fetch spec from ${specPath}: ${reason}`);
  }
  const text = await response.text();
  return Buffer.from(text, 'utf8');
}

async function readSpec(specPath) {
  if (isRemoteSpec(specPath)) {
    return fetchRemoteSpec(specPath);
  }
  const absolute = resolve(specPath);
  if (!(await pathExists(absolute))) {
    throw new Error(`Spec file not found: ${absolute}`);
  }
  return readFile(absolute);
}

async function parseSpec(buffer, fileName) {
  const raw = buffer.toString('utf8');
  try {
    return { data: JSON.parse(raw), format: 'json' };
  } catch {
    if (!fileName.endsWith('.yaml') && !fileName.endsWith('.yml')) {
      // Try YAML anyway in case JSON parse failed.
    }
    try {
      const { default: YAML } = await import('yaml');
      return { data: YAML.parse(raw), format: 'yaml' };
    } catch (error) {
      throw new Error(`Unable to parse spec (${fileName}): ${error.message}`);
    }
  }
}

function summarizeApi(spec) {
  const operations = [];
  if (spec?.paths && typeof spec.paths === 'object') {
    for (const [pathKey, methods] of Object.entries(spec.paths)) {
      if (!methods || typeof methods !== 'object') {
        continue;
      }
      for (const [method, definition] of Object.entries(methods)) {
        if (!definition || typeof definition !== 'object') {
          continue;
        }
        operations.push({
          method: method.toUpperCase(),
          path: pathKey,
          operationId: definition.operationId ?? null,
          summary: definition.summary ?? null,
        });
      }
    }
  }

  return {
    title: spec?.info?.title ?? 'Postgres DDL Reference',
    version: spec?.info?.version ?? null,
    itemsCount: operations.length,
    operations,
  };
}

function summarizeEvent(spec) {
  const channels = [];
  if (spec?.channels && typeof spec.channels === 'object') {
    for (const [channel, definition] of Object.entries(spec.channels)) {
      if (!definition || typeof definition !== 'object') {
        continue;
      }
      channels.push({
        channel,
        description: definition.description ?? null,
        publish: Boolean(definition.publish),
        subscribe: Boolean(definition.subscribe),
      });
    }
  }

  return {
    title: spec?.info?.title ?? 'Postgres DDL Reference',
    version: spec?.info?.version ?? null,
    itemsCount: channels.length,
    channels,
  };
}

function summarizeData(spec) {
  const entities = [];

  if (Array.isArray(spec?.tables)) {
    for (const table of spec.tables) {
      entities.push({
        name: table?.name ?? table?.id ?? 'unknown',
        columns: Array.isArray(table?.columns) ? table.columns.length : null,
        description: table?.description ?? null,
      });
    }
  } else if (spec?.schema && typeof spec.schema === 'object') {
    for (const [name, definition] of Object.entries(spec.schema)) {
      entities.push({
        name,
        columns: Array.isArray(definition?.columns) ? definition.columns.length : null,
        description: definition?.description ?? null,
      });
    }
  }

  return {
    title: spec?.name ?? spec?.info?.title ?? 'Postgres DDL Reference',
    version: spec?.version ?? null,
    itemsCount: entities.length,
    entities,
  };
}

function summarizeSpec(spec, type) {
  switch (type) {
    case 'api':
      return summarizeApi(spec);
    case 'event':
      return summarizeEvent(spec);
    case 'data':
      return summarizeData(spec);
    default:
      return {
        title: 'Postgres DDL Reference',
        version: null,
        itemsCount: 0,
      };
  }
}

export async function buildAdapter({
  specPath,
  outDir,
  capabilities = DEFAULT_CAPABILITIES,
  adapterName = ADAPTER_NAME,
  adapterType = ADAPTER_TYPE,
} = {}) {
  if (!specPath) {
    throw new Error('specPath is required.');
  }
  if (!outDir) {
    throw new Error('outDir is required.');
  }

  const resolvedOut = resolve(outDir);
  await mkdir(resolvedOut, { recursive: true });

  const specBuffer = await readSpec(specPath);
  const specFileName = detectFileName(specPath);
  const { data: spec, format } = await parseSpec(specBuffer, specFileName.toLowerCase());
  const specChecksum = checksum(specBuffer);
  const summary = summarizeSpec(spec, adapterType);
  const generatedAt = new Date().toISOString();

  const catalog = {
    adapter: {
      name: adapterName,
      type: adapterType,
      version: PACKAGE_VERSION,
    },
    source: {
      original: specPath,
      stored: specFileName,
      format,
      checksum: specChecksum,
      bytes: specBuffer.length,
    },
    capabilities,
    summary,
    generated_at: generatedAt,
  };

  const catalogPath = join(resolvedOut, 'catalog.json');
  const summaryPath = join(resolvedOut, 'summary.json');
  const copiedSpecPath = join(resolvedOut, specFileName);

  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        status: 'ok',
        generated_at: generatedAt,
        adapter: catalog.adapter,
        metrics: {
          items: summary.itemsCount,
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  await writeFile(copiedSpecPath, specBuffer);

  return {
    outDir: resolvedOut,
    catalogPath,
    summaryPath,
    specPath: copiedSpecPath,
    details: catalog,
  };
}

function parseArgs(argv) {
  const options = {
    capabilities: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case '--spec':
        options.spec = argv[++index];
        break;
      case '--out':
        options.out = argv[++index];
        break;
      case '--cap':
      case '--capability': {
        const value = argv[++index];
        if (value?.includes(',')) {
          options.capabilities.push(...value.split(','));
        } else {
          options.capabilities.push(value);
        }
        break;
      }
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node src/index.mjs --spec <path|url> [--out <dir>]

Options:
  --spec <path|url>        Source specification to normalize (required)
  --out <dir>              Output directory for catalog artifacts (default: ./artifacts)
  --cap <value>            Override capabilities (repeatable)
  --help                   Show this help text
`);
}

export async function run(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    printHelp();
    return 1;
  }

  if (options.help) {
    printHelp();
    return 0;
  }

  const specPath = options.spec ?? './fixtures/minimal.json';
  const outDir = options.out ?? '../../artifacts/adapters/postgres';
  const capabilities =
    options.capabilities.length > 0 ? options.capabilities : DEFAULT_CAPABILITIES;

  try {
    const result = await buildAdapter({
      specPath,
      outDir,
      capabilities,
    });
    console.log(
      `Catalog fragment generated at ${result.catalogPath} (items: ${result.details.summary.itemsCount})`,
    );
    return 0;
  } catch (error) {
    console.error(`[adapter:${ADAPTER_NAME}] ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}
