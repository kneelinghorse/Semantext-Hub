#!/usr/bin/env node

import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createConsole } from '../../src/cli/ux/console.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_VERSION = 'v0.25';

export const PROVIDERS = {
  github: {
    name: 'GitHub REST API',
    manifest: ['approved', 'external', 'github', 'manifest.json'],
    diagram: ['artifacts', 'diagrams', 'external-github.drawio'],
    telemetry: ['artifacts', 'perf', 'external-github.jsonl'],
    spec: 'https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json'
  },
  stripe: {
    name: 'Stripe Payments API',
    manifest: ['approved', 'external', 'stripe', 'manifest.json'],
    diagram: ['artifacts', 'diagrams', 'external-stripe.drawio'],
    telemetry: ['artifacts', 'perf', 'external-stripe.jsonl'],
    spec: 'https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json'
  }
};

function withDefaults(options = {}) {
  return {
    workspace: options.workspace ?? process.cwd(),
    providers: options.providers ?? Object.keys(PROVIDERS),
    overwrite: options.overwrite ?? false,
    dryRun: options.dryRun ?? false,
    version: options.version ?? DEFAULT_VERSION,
    help: options.help ?? false
  };
}

function parseArgs(argv) {
  const options = withDefaults();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--workspace':
      case '-w':
        options.workspace = path.resolve(argv[++index]);
        break;
      case '--providers':
        options.providers = argv[++index].split(',').map((value) => value.trim()).filter(Boolean);
        break;
      case '--overwrite':
        options.overwrite = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--version':
        options.version = argv[++index];
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`External Spec Pipeline\n\nUsage: node scripts/demo/run-external.mjs [options]\n\nOptions:\n  -w, --workspace <path>  Workspace root (defaults to current directory)\n      --providers list     Comma separated list (github,stripe)\n      --version <tag>      Launch bundle version (defaults to ${DEFAULT_VERSION})\n      --overwrite          Replace existing artifacts in the target dir\n      --dry-run            Validate inputs but skip writing artifacts\n  -h, --help               Show this help message\n`);
}

async function ensureDirectory(targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
}

async function readJson(filePath) {
  const buffer = await fs.readFile(filePath, 'utf8');
  return JSON.parse(buffer);
}

export async function runExternalPipeline(options = {}) {
  const args = withDefaults(options);
  const consoleUi = createConsole();
  const workspace = args.workspace ?? process.cwd();
  const selectedProviders = args.providers.filter((provider) => Object.hasOwn(PROVIDERS, provider));
  const launchDir = path.join(workspace, 'artifacts', 'launch', args.version);

  if (selectedProviders.length === 0) {
    throw new Error('No valid providers supplied. Supported providers: github,stripe');
  }

  consoleUi.info(`Workspace: ${workspace}`);
  consoleUi.info(`Launch bundle: ${launchDir}`);

  await ensureDirectory(launchDir);

  const results = [];
  const exclusiveFlag = fsConstants.COPYFILE_EXCL ?? 0;
  const cloneFlag = fsConstants.COPYFILE_FICLONE_FORCE ?? 0;

  for (const provider of selectedProviders) {
    const config = PROVIDERS[provider];
    const manifestPath = path.join(workspace, ...config.manifest);
    const diagramPath = path.join(workspace, ...config.diagram);
    const telemetryPath = path.join(workspace, ...config.telemetry);

    await fs.access(manifestPath);
    await fs.access(diagramPath);
    await fs.access(telemetryPath);

    const manifest = await readJson(manifestPath);

    if (args.dryRun) {
      results.push({
        provider,
        name: config.name,
        manifest: manifestPath,
        diagram: diagramPath,
        telemetry: telemetryPath,
        targets: {
          manifest: path.join(launchDir, provider, 'manifest.json'),
          diagram: path.join(launchDir, 'diagrams', path.basename(diagramPath)),
          telemetry: path.join(launchDir, 'telemetry', path.basename(telemetryPath))
        },
        copied: false
      });
      continue;
    }

    const providerDir = path.join(launchDir, provider);
    const diagramDir = path.join(launchDir, 'diagrams');
    const telemetryDir = path.join(launchDir, 'telemetry');

    await Promise.all([
      ensureDirectory(providerDir),
      ensureDirectory(diagramDir),
      ensureDirectory(telemetryDir)
    ]);

    const destinationPath = path.join(providerDir, 'manifest.json');
    const diagramDestination = path.join(diagramDir, path.basename(diagramPath));
    const telemetryDestination = path.join(telemetryDir, path.basename(telemetryPath));

    if (args.overwrite) {
      try {
        await fs.copyFile(manifestPath, destinationPath, cloneFlag);
      } catch (error) {
        if (error.code === 'ENOSYS' || error.code === 'ERR_FS_COPYFILE_IMPLIES_OTHER' || cloneFlag === 0) {
          await fs.copyFile(manifestPath, destinationPath);
        } else {
          throw error;
        }
      }
    } else {
      try {
        await fs.copyFile(manifestPath, destinationPath, exclusiveFlag);
      } catch (error) {
        if (error.code === 'EEXIST') {
          consoleUi.warn(`Existing manifest preserved: ${destinationPath}`);
        } else {
          throw error;
        }
      }
    }

    const copyOptions = args.overwrite ? undefined : exclusiveFlag;

    for (const [source, target, label] of [
      [diagramPath, diagramDestination, 'diagram'],
      [telemetryPath, telemetryDestination, 'telemetry']
    ]) {
      try {
        if (args.overwrite) {
          try {
            await fs.copyFile(source, target, cloneFlag);
          } catch (error) {
            if (error.code === 'ENOSYS' || error.code === 'ERR_FS_COPYFILE_IMPLIES_OTHER' || cloneFlag === 0) {
              await fs.copyFile(source, target);
            } else {
              throw error;
            }
          }
        } else {
          await fs.copyFile(source, target, copyOptions);
        }
      } catch (error) {
        if (!args.overwrite && error.code === 'EEXIST') {
          consoleUi.warn(`Existing ${label} preserved: ${target}`);
        } else {
          throw error;
        }
      }
    }

    results.push({
      provider,
      name: config.name,
      manifest: destinationPath,
      diagram: diagramDestination,
      telemetry: telemetryDestination,
      targets: {
        manifest: destinationPath,
        diagram: diagramDestination,
        telemetry: telemetryDestination
      },
      copied: true
    });
  }

  const summary = results.map((entry) => {
    const status = entry.copied ? 'copied' : 'validated';
    return `${entry.name} (${entry.provider}) — ${status}`;
  });

  if (args.dryRun) {
    consoleUi.success('External spec validation succeeded', summary);
  } else {
    consoleUi.success('External spec artifacts ready', summary);
    consoleUi.info(`Launch directory: ${launchDir}`);
  }

  return { launchDir, results };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  await runExternalPipeline(args);
}

main().catch((error) => {
  const consoleUi = createConsole();
  consoleUi.error('External spec pipeline failed', [error.message ?? String(error)]);
  process.exitCode = 1;
});
