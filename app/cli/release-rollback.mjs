#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');
const DEFAULT_MANIFEST_PATH = resolve(APP_ROOT, 'protocols', 'release', 'manifest.extend.json');

const EXIT_OK = 0;
const EXIT_FAIL = 1;

const DEFAULT_MANIFEST_STATE = Object.freeze({
  annotations: {},
  audit: [],
});

function cloneDefaultManifest() {
  return {
    annotations: {},
    audit: [],
  };
}

export async function loadManifestExtend(manifestPath = DEFAULT_MANIFEST_PATH) {
  try {
    const payload = await readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(payload);
    const manifest = {
      annotations: typeof parsed.annotations === 'object' && parsed.annotations !== null
        ? { ...parsed.annotations }
        : {},
      audit: Array.isArray(parsed.audit) ? [...parsed.audit] : [],
    };
    return manifest;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return cloneDefaultManifest();
    }
    throw error;
  }
}

export async function writeManifestExtend(manifestPath, manifest) {
  const normalized = {
    annotations:
      typeof manifest.annotations === 'object' && manifest.annotations !== null
        ? manifest.annotations
        : DEFAULT_MANIFEST_STATE.annotations,
    audit: Array.isArray(manifest.audit) ? manifest.audit : DEFAULT_MANIFEST_STATE.audit,
  };

  await mkdir(dirname(manifestPath), { recursive: true });
  const serialized = `${JSON.stringify(normalized, null, 2)}\n`;
  await writeFile(manifestPath, serialized, 'utf8');
  return normalized;
}

export async function recordRollback({
  manifestPath = DEFAULT_MANIFEST_PATH,
  correlationId,
  reason,
  agent = 'ossp.release.rollback',
  stats,
} = {}) {
  const manifest = await loadManifestExtend(manifestPath);
  const entry = {
    ts: new Date().toISOString(),
    action: 'rollback',
    correlationId: correlationId ?? randomUUID(),
    reason: reason ?? 'Release canary breach detected',
    agent,
  };
  if (stats && typeof stats === 'object' && Object.keys(stats).length > 0) {
    entry.stats = stats;
  }
  manifest.audit.push(entry);
  await writeManifestExtend(manifestPath, manifest);
  return entry;
}

function parseArgs(argv) {
  const options = {
    manifest: DEFAULT_MANIFEST_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case '--manifest':
        options.manifest = resolve(process.cwd(), argv[++index]);
        break;
      case '--reason':
        options.reason = argv[++index];
        break;
      case '--correlation':
        options.correlation = argv[++index];
        break;
      case '--agent':
        options.agent = argv[++index];
        break;
      case '--stats':
        {
          const raw = argv[++index];
          try {
            const parsed = JSON.parse(raw);
            options.stats = parsed;
          } catch (error) {
            throw new Error(`Failed to parse --stats JSON: ${error.message}`);
          }
        }
        break;
      case '--json':
        options.json = true;
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

function printHelp() {
  console.log(`Usage: ossp release rollback [options]

Options:
  --manifest <path>      Override manifest.extend.json path
  --reason <text>        Reason for rollback entry
  --correlation <id>     Correlation identifier to store with audit entry
  --agent <name>         Agent or subsystem performing rollback
  --stats <json>         Additional JSON payload describing metrics
  --json                 Emit JSON output
  -h, --help             Show this help message
`);
}

export async function run(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    return EXIT_FAIL;
  }

  if (options.help) {
    printHelp();
    return EXIT_OK;
  }

  let entry;
  try {
    entry = await recordRollback({
      manifestPath: options.manifest ?? DEFAULT_MANIFEST_PATH,
      correlationId: options.correlation,
      reason: options.reason,
      agent: options.agent,
      stats: options.stats,
    });
  } catch (error) {
    console.error(`Rollback failed: ${error.message}`);
    return EXIT_FAIL;
  }

  if (options.json) {
    console.log(JSON.stringify({ status: 'recorded', entry }, null, 2));
  } else {
    console.log(
      `Rollback recorded (correlationId=${entry.correlationId}, reason=${entry.reason})`,
    );
  }

  return EXIT_OK;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then((code) => {
    process.exitCode = code;
  });
}
