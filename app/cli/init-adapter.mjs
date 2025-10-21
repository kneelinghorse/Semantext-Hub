#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { access, readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import process from 'node:process';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import inquirer from 'inquirer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');
const TEMPLATE_ROOT = resolve(APP_ROOT, 'templates', 'adapter');

const EXIT_OK = 0;
const EXIT_FAIL = 1;

const SUPPORTED_TYPES = new Set(['api', 'event', 'data']);

const TYPE_META = {
  api: {
    title: 'API',
    description: 'Generate HTTP/OpenAPI catalog manifests and normalize REST operations.',
    defaultCapabilities: ['adapter.api.discover', 'adapter.api.normalize'],
    readmeHint: 'HTTP endpoints',
    schemaHint: {
      from: '$.paths[*]',
      to: '$.catalog.http.endpoints[]',
      description: 'Map OpenAPI path+method pairs to catalog HTTP endpoints.',
    },
  },
  event: {
    title: 'Event',
    description: 'Normalize AsyncAPI channels and stream events into the catalog.',
    defaultCapabilities: ['adapter.event.discover', 'adapter.event.normalize'],
    readmeHint: 'event streams',
    schemaHint: {
      from: '$.channels[*]',
      to: '$.catalog.events.channels[]',
      description: 'Map AsyncAPI channels to catalog event channels.',
    },
  },
  data: {
    title: 'Data',
    description: 'Extract relational/warehouse schemas and load catalog entities.',
    defaultCapabilities: ['adapter.data.discover', 'adapter.data.extract'],
    readmeHint: 'database entities',
    schemaHint: {
      from: '$.tables[*]',
      to: '$.catalog.data.entities[]',
      description: 'Map table definitions to catalog data entities.',
    },
  },
};

function toDisplayName(name) {
  return name
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function sanitizeName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Adapter name must be a non-empty string.');
  }
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!/^[a-z][a-z0-9-]+$/.test(normalized)) {
    throw new Error(
      'Adapter name must start with a letter and contain only lowercase letters, numbers, or dashes.',
    );
  }
  return normalized;
}

function uniqueCapabilities(capabilities) {
  const items = Array.isArray(capabilities) ? capabilities : [];
  const unique = [];
  const seen = new Set();
  for (const raw of items) {
    if (typeof raw !== 'string') {
      continue;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    if (seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    unique.push(trimmed);
  }
  return unique;
}

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isRemoteSpec(specInput) {
  return typeof specInput === 'string' && /^https?:\/\//i.test(specInput.trim());
}

async function loadSpecBuffer(specInput, { fetchImpl }) {
  if (isRemoteSpec(specInput)) {
    const response = await fetchImpl(specInput);
    if (!response.ok) {
      const summary = `${response.status} ${response.statusText ?? ''}`.trim();
      throw new Error(`Failed to fetch spec from ${specInput}: ${summary}`);
    }
    const text = await response.text();
    return Buffer.from(text, 'utf8');
  }

  const absolute = resolve(specInput);
  if (!(await pathExists(absolute))) {
    throw new Error(`Spec path not found: ${absolute}`);
  }
  return readFile(absolute);
}

function detectSpecFileName(specInput) {
  if (isRemoteSpec(specInput)) {
    try {
      const url = new URL(specInput);
      const pathname = url.pathname.split('/').filter(Boolean).pop();
      if (pathname) {
        return basename(pathname);
      }
    } catch {
      // fall through
    }
    return 'spec.json';
  }
  return basename(specInput);
}

function computeChecksum(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function ensureDirectory(targetDir, { force }) {
  if (!(await pathExists(targetDir))) {
    await mkdir(targetDir, { recursive: true });
    return;
  }

  const stats = await stat(targetDir);
  if (!stats.isDirectory()) {
    throw new Error(`Target path exists and is not a directory: ${targetDir}`);
  }

  const entries = await readdir(targetDir);
  if (entries.length > 0 && !force) {
    throw new Error(
      `Target directory ${targetDir} is not empty. Re-run with --force to overwrite scaffold files.`,
    );
  }
}

function printHelp() {
  console.log(`Usage: ossp init adapter [options]

Options:
  --type <api|event|data>     Adapter category to scaffold
  --name <id>                 Adapter identifier (kebab-case)
  --display-name <text>       Human-friendly display name
  --description <text>        Description for README and agent card
  --spec <path|url>           Source spec path or URL (copied into fixtures)
  --out <dir>                 Output directory (default: ./app/adapters/<name>)
  --cap <value>               Capability entry (repeatable)
  --force                     Overwrite existing files in target directory
  --non-interactive           Fail instead of prompting for missing values
  --help                      Show this help text

Docs:
  app/docs/authoring/guide-v2.md#validation
  app/docs/adapters/cookbook.md
`);
}

function parseArgs(argv) {
  const tokens = [...argv];
  while (tokens[0] === 'init' || tokens[0] === 'adapter') {
    tokens.shift();
  }

  const options = {
    capabilities: [],
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    switch (token) {
      case '--type':
        options.type = tokens[++index];
        break;
      case '--name':
        options.name = tokens[++index];
        break;
      case '--display-name':
        options.displayName = tokens[++index];
        break;
      case '--description':
        options.description = tokens[++index];
        break;
      case '--spec':
        options.spec = tokens[++index];
        break;
      case '--out':
        options.out = tokens[++index];
        break;
      case '--cap':
      case '--capability': {
        const value = tokens[++index];
        if (value?.includes(',')) {
          options.capabilities.push(...value.split(','));
        } else {
          options.capabilities.push(value);
        }
        break;
      }
      case '--force':
        options.force = true;
        break;
      case '--non-interactive':
        options.nonInteractive = true;
        break;
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

function requireInteractive(options, field) {
  if (options.nonInteractive) {
    throw new Error(`Missing required option: --${field}`);
  }
}

async function resolveType(options, { promptImpl }) {
  let { type } = options;
  if (type && SUPPORTED_TYPES.has(type)) {
    return type;
  }

  if (type && !SUPPORTED_TYPES.has(type)) {
    throw new Error(
      `Invalid type "${type}". Supported values: ${[...SUPPORTED_TYPES].join(', ')}.`,
    );
  }

  requireInteractive(options, 'type');
  const answer = await promptImpl({
    type: 'list',
    name: 'type',
    message: 'Select adapter type',
    choices: [
      { name: 'API (OpenAPI, REST)', value: 'api' },
      { name: 'Event (AsyncAPI, streaming)', value: 'event' },
      { name: 'Data (databases, warehouses)', value: 'data' },
    ],
  });
  return answer.type;
}

async function resolveName(options, { promptImpl }) {
  if (options.name) {
    return sanitizeName(options.name);
  }

  requireInteractive(options, 'name');
  const answer = await promptImpl({
    type: 'input',
    name: 'name',
    message: 'Adapter name (kebab-case)',
    validate: (value) => {
      try {
        sanitizeName(value);
        return true;
      } catch (error) {
        return error.message;
      }
    },
  });
  return sanitizeName(answer.name);
}

async function resolveSpec(options, { promptImpl, cwd, fetchImpl }) {
  if (!options.spec) {
    requireInteractive(options, 'spec');
    const answer = await promptImpl({
      type: 'input',
      name: 'spec',
      message: 'Path or URL to source spec',
      validate: async (value) => {
        if (!value?.trim()) {
          return 'Spec path or URL is required.';
        }
        if (isRemoteSpec(value)) {
          return true;
        }
        const resolved = resolve(cwd, value);
        if (!(await pathExists(resolved))) {
          return `Spec file not found at ${resolved}`;
        }
        return true;
      },
    });
    options.spec = answer.spec;
  }

  const candidate = options.spec;
  const absolute = isRemoteSpec(candidate) ? candidate : resolve(cwd, candidate);
  const buffer = await loadSpecBuffer(absolute, { fetchImpl });
  const checksum = computeChecksum(buffer);
  const fileName = detectSpecFileName(candidate);
  const extension = extname(fileName).replace(/^\./, '') || 'json';

  return {
    original: candidate,
    resolved: absolute,
    buffer,
    checksum,
    fileName,
    extension,
    isRemote: isRemoteSpec(candidate),
  };
}

async function resolveCapabilities(options, { promptImpl, type }) {
  const provided = uniqueCapabilities(options.capabilities);
  if (provided.length > 0) {
    return provided;
  }

  const defaults = TYPE_META[type].defaultCapabilities;
  requireInteractive(options, 'cap');

  const answer = await promptImpl({
    type: 'checkbox',
    name: 'capabilities',
    message: 'Select capabilities to register',
    default: defaults,
    choices: defaults.map((capability) => ({
      name: capability,
      value: capability,
      checked: true,
    })),
    validate: (values) => (values.length === 0 ? 'Select at least one capability.' : true),
  });

  const merged = uniqueCapabilities(answer.capabilities);
  if (merged.length === 0) {
    throw new Error('At least one capability is required.');
  }
  return merged;
}

async function resolveOutDir(options, { promptImpl, cwd, adapterName }) {
  if (options.out) {
    return resolve(cwd, options.out);
  }

  const defaultPath = resolve(cwd, 'app', 'adapters', adapterName);
  if (options.nonInteractive) {
    return defaultPath;
  }

  const answer = await promptImpl({
    type: 'input',
    name: 'outDir',
    message: 'Output directory',
    default: defaultPath,
  });

  return resolve(cwd, answer.outDir ?? defaultPath);
}

function buildReplacements(context) {
  const capabilitiesJson = JSON.stringify(context.capabilities, null, 2);
  const capabilityListMarkdown = context.capabilities
    .map((capability) => `- \`${capability}\` — Implements ${context.typeMeta.readmeHint} workflows.`)
    .join('\n');

  return {
    __ADAPTER_NAME__: context.adapterName,
    __ADAPTER_DISPLAY_NAME__: context.displayName,
    __ADAPTER_TYPE__: context.type,
    __ADAPTER_DESCRIPTION__: context.description,
    __PACKAGE_NAME__: context.packageName,
    __URN__: context.urn,
    __CAPABILITIES_JSON__: capabilitiesJson,
    __CAPABILITIES_LIST__: capabilityListMarkdown,
    __SPEC_RELATIVE_PATH__: `./fixtures/${context.spec.fileName}`,
    __SPEC_FILE__: context.spec.fileName,
    __OUTPUT_RELATIVE_PATH__: context.defaultArtifactPath,
    __GENERATED_AT__: context.generatedAt,
    __CHECKSUM__: context.spec.checksum,
    __TYPE_TITLE__: context.typeMeta.title,
    __SCHEMA_MAP_FROM__: context.typeMeta.schemaHint.from,
    __SCHEMA_MAP_TO__: context.typeMeta.schemaHint.to,
    __SCHEMA_MAP_DESCRIPTION__: context.typeMeta.schemaHint.description,
  };
}

function applyReplacements(input, replacements) {
  let output = input;
  for (const [token, value] of Object.entries(replacements)) {
    output = output.split(token).join(value);
  }
  return output;
}

async function copyTemplate(context, replacements) {
  const sourceDir = resolve(TEMPLATE_ROOT, context.type);
  if (!(await pathExists(sourceDir))) {
    throw new Error(`Template directory missing for type "${context.type}" (${sourceDir})`);
  }

  async function traverse(srcDir, destDir) {
    const entries = await readdir(srcDir, { withFileTypes: true });
    await mkdir(destDir, { recursive: true });
    for (const entry of entries) {
      const srcPath = join(srcDir, entry.name);
      const targetName = entry.name.endsWith('.tpl') ? entry.name.slice(0, -4) : entry.name;
      const destPath = join(destDir, targetName);
      if (entry.isDirectory()) {
        await traverse(srcPath, destPath);
      } else {
        const raw = await readFile(srcPath, 'utf8');
        const rendered = applyReplacements(raw, replacements);
        await writeFile(destPath, rendered, 'utf8');
      }
    }
  }

  await traverse(sourceDir, context.outDir);
}

async function writeSpecFixture(context) {
  const fixturesDir = join(context.outDir, 'fixtures');
  await mkdir(fixturesDir, { recursive: true });
  const target = join(fixturesDir, context.spec.fileName);
  await writeFile(target, context.spec.buffer);
  return target;
}

async function writeAgentCard(context) {
  const cardPath = join(context.outDir, 'agent.card.json');
  const card = {
    id: context.urn,
    urn: context.urn,
    name: context.displayName,
    version: '0.1.0',
    description: context.description,
    tags: [context.type, 'adapter'],
    capabilities: {
      tags: [context.type, 'adapter'],
      tools: context.capabilities.map((capability) => ({
        name: capability,
        capability,
        description: `Implements ${capability} for ${context.displayName}.`,
        urn: `urn:capability:${capability}`,
        tags: [context.type, 'adapter'],
      })),
    },
    communication: {
      supported: ['http'],
      endpoints: {
        default: 'http://localhost:0',
        http: 'http://localhost:0',
      },
    },
    authorization: {
      type: 'none',
      scopes: [],
    },
    metadata: {
      generated_at: context.generatedAt,
      spec: `./fixtures/${context.spec.fileName}`,
      spec_checksum: context.spec.checksum,
      wizard: 'ossp init adapter',
    },
  };

  await writeFile(cardPath, `${JSON.stringify(card, null, 2)}\n`, 'utf8');
}

async function scaffoldAdapter(context) {
  const replacements = buildReplacements(context);
  await ensureDirectory(context.outDir, { force: context.force });
  await copyTemplate(context, replacements);
  await writeSpecFixture(context);
  await writeAgentCard(context);
}

async function resolveContext(options, overrides) {
  const promptImpl = overrides.promptImpl ?? inquirer.prompt;
  const fetchImpl = overrides.fetchImpl ?? global.fetch ?? (async () => {
    throw new Error('Fetch API not available in this environment.');
  });
  const cwd = overrides.cwd ?? process.cwd();
  const now = overrides.now ?? (() => new Date());

  const type = await resolveType(options, { promptImpl });
  const adapterName = await resolveName(options, { promptImpl });
  const displayName =
    options.displayName ??
    (options.nonInteractive ? toDisplayName(adapterName) : toDisplayName(adapterName));
  const description =
    options.description ??
    `${TYPE_META[type].title} adapter scaffolded for ${displayName} using OSSP wizard.`;

  const spec = await resolveSpec(options, { promptImpl, cwd, fetchImpl });
  const capabilities =
    (await resolveCapabilities(options, { promptImpl, type })) ??
    TYPE_META[type].defaultCapabilities;

  if (capabilities.length === 0) {
    throw new Error('At least one capability is required to scaffold an adapter.');
  }

  const outDir = await resolveOutDir(options, { promptImpl, cwd, adapterName });
  const generatedAt = now().toISOString();

  return {
    type,
    typeMeta: TYPE_META[type],
    adapterName,
    displayName,
    description,
    spec,
    capabilities,
    outDir,
    force: Boolean(options.force),
    packageName: `@ossp/${adapterName}-adapter`,
    urn: `urn:adapter:${type}:${adapterName}@0.1.0`,
    generatedAt,
    defaultArtifactPath: `../../artifacts/adapters/${adapterName}`,
  };
}

export async function run(argv = process.argv.slice(2), overrides = {}) {
  const logger = overrides.logger ?? console;

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    logger.error(error.message);
    printHelp();
    return EXIT_FAIL;
  }

  if (options.help) {
    printHelp();
    return EXIT_OK;
  }

  try {
    const context = await resolveContext(options, overrides);
    await scaffoldAdapter(context);
    const relativePath = resolve(overrides.cwd ?? process.cwd(), context.outDir);
    logger.log(
      `Adapter "${context.adapterName}" (${context.type}) scaffolded at ${relativePath}`,
    );
    logger.log(`  • Spec copied to fixtures/${context.spec.fileName}`);
    logger.log(`  • Agent card ready at agent.card.json`);
    return EXIT_OK;
  } catch (error) {
    logger.error(`[ossp:init:adapter] ${error.message}`);
    if (overrides.verbose) {
      logger.error(error.stack);
    }
    return EXIT_FAIL;
  }
}

const moduleEntryPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === moduleEntryPath) {
  const args = process.argv.slice(2);
  run(args).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error);
      process.exitCode = EXIT_FAIL;
    },
  );
}
