#!/usr/bin/env node

/**
 * Workbench preflight automation.
 *
 * Validates local dependencies, prepares required configuration,
 * runs registry health/backup checks, prunes artifacts according to
 * retention policies, and executes the curated showcase pipeline.
 *
 * Usage:
 *   node scripts/preflight/demo-preflight.mjs [options]
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

import { createConsole } from '../../src/cli/ux/console.js';
import { runRetentionGc } from '../cleanup/gc-artifacts.mjs';
import { openDb, getHealth } from '../../packages/runtime/registry/db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIN_NODE_MAJOR = 18;
const MIN_NPM_MAJOR = 9;
const API_KEY_FILENAME = 'registry.api-key';

const REQUIRED_SECURITY_CONFIGS = [
  path.join('app', 'config', 'security', 'delegation-policy.json'),
  path.join('app', 'config', 'security', 'signature-policy.json'),
  path.join('app', 'config', 'security', 'rate-limit.config.json')
];

const REQUIRED_SHOWCASE_MANIFESTS = [
  path.join('approved', 'demo-api', 'manifest.json'),
  path.join('approved', 'demo-event', 'manifest.json'),
  path.join('approved', 'demo-workflow', 'manifest.json')
];

const REQUIRED_DIRECTORIES = [
  path.join('artifacts', 'registry', 'backups'),
  path.join('artifacts', 'catalogs', 'showcase'),
  path.join('artifacts', 'graphs', 'showcase'),
  path.join('artifacts', 'diagrams')
];

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    workspace: process.cwd(),
    json: false,
    dryRun: false,
    ci: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '-w':
      case '--workspace':
        options.workspace = argv[index + 1];
        index += 1;
        break;
      case '--json':
        options.json = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--ci':
        options.ci = true;
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option: ${arg}`);
        }
        break;
    }
  }

  return options;
}

function printHelp() {
  const scriptRelative = path.relative(process.cwd(), __filename) || __filename;
  const lines = [
    `Usage: node ${scriptRelative} [options]`,
    '',
    'Options:',
    '  -w, --workspace <path>   Workspace root (defaults to current directory)',
    '      --dry-run            Skip mutating actions (generate summaries only)',
    '      --ci                 CI-friendly mode (skips generation, uses dry-run safeguards)',
    '      --json               Emit JSON summary (suppresses formatted console output)',
    '  -h, --help               Show this help message'
  ];
  lines.forEach((line) => console.log(line));
}

function resolveWorkspace(workspace) {
  const root = workspace ? path.resolve(workspace) : process.cwd();
  return root;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirectory(targetPath, { dryRun }) {
  if (dryRun) {
    return false;
  }
  await fs.mkdir(targetPath, { recursive: true });
  return true;
}

function versionParts(version) {
  const match = String(version ?? '')
    .trim()
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return { major: null, minor: null, patch: null };
  }
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10)
  };
}

function resolveRelative(base, target) {
  return path.relative(base, target) || '.';
}

function sanitizeTag(value) {
  return value.replace(/[^a-z0-9-]/gi, '-');
}

function nowIso() {
  return new Date().toISOString();
}

async function runCommand(command, args, { cwd, env, timeoutMs } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let killed = false;
    let timer = null;

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
    }
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    if (timeoutMs && Number.isFinite(timeoutMs)) {
      timer = setTimeout(() => {
        killed = true;
        child.kill('SIGKILL');
      }, timeoutMs);
    }

    const finalize = (result) => {
      if (timer) {
        clearTimeout(timer);
      }
      resolve({
        ok: result.ok,
        code: result.code,
        signal: result.signal ?? null,
        killed,
        stdout,
        stderr
      });
    };

    child.on('error', (error) => {
      finalize({ ok: false, code: null, signal: null, stderr: String(error) });
    });

    child.on('close', (code, signal) => {
      finalize({ ok: code === 0 && !killed, code, signal });
    });
  });
}

async function checkDependencies({ workspace, env }) {
  const details = {
    node: {
      version: process.versions.node,
      required: `>=${MIN_NODE_MAJOR}.x`,
      ok: false
    },
    npm: {
      version: null,
      required: `>=${MIN_NPM_MAJOR}.x`,
      ok: false
    },
    tar: {
      ok: false,
      version: null
    },
    sqlite3: {
      ok: false
    }
  };
  const issues = [];
  const warnings = [];

  const nodeVersionInfo = versionParts(details.node.version);
  if (nodeVersionInfo.major === null || nodeVersionInfo.major < MIN_NODE_MAJOR) {
    issues.push(
      `Node.js ${details.node.version} detected, requires ${details.node.required}`
    );
  } else {
    details.node.ok = true;
  }

  const npmResult = await runCommand('npm', ['--version'], { cwd: workspace, env });
  if (!npmResult.ok) {
    issues.push(
      npmResult.stderr?.trim()
        ? `npm --version failed: ${npmResult.stderr.trim()}`
        : 'npm is not available in PATH.'
    );
  } else {
    const candidate = npmResult.stdout.trim();
    details.npm.version = candidate;
    const parsed = versionParts(candidate);
    if (parsed.major === null || parsed.major < MIN_NPM_MAJOR) {
      issues.push(`npm ${candidate} detected, requires ${details.npm.required}`);
    } else {
      details.npm.ok = true;
    }
  }

  const tarResult = await runCommand('tar', ['--version'], {
    cwd: workspace,
    env
  });
  if (!tarResult.ok) {
    warnings.push(
      tarResult.stderr?.trim()
        ? `tar --version failed (backup step may fail): ${tarResult.stderr.trim()}`
        : 'tar command not available; registry backup will be skipped.'
    );
  } else {
    const firstLine = tarResult.stdout.split('\n').find((line) => line.trim().length > 0);
    details.tar.ok = true;
    details.tar.version = firstLine ?? tarResult.stdout.trim();
  }

  try {
    await import('sqlite3');
    details.sqlite3.ok = true;
  } catch (error) {
    issues.push(`sqlite3 dependency missing: ${error.message}`);
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? (warnings.length > 0 ? 'warn' : 'ok') : 'failed',
    issues,
    warnings,
    details
  };
}

async function ensureConfigs(context) {
  const { workspace, env, dryRun, ci } = context;
  const generated = {};
  const messages = [];
  const warnings = [];
  const issues = [];

  for (const relativePath of REQUIRED_DIRECTORIES) {
    const absolutePath = path.join(workspace, relativePath);
    const created = await ensureDirectory(absolutePath, { dryRun: dryRun || ci });
    if (created) {
      messages.push(`Created ${relativePath}`);
    }
  }

  for (const relativePath of REQUIRED_SECURITY_CONFIGS) {
    const absolutePath = path.join(workspace, relativePath);
    const exists = await pathExists(absolutePath);
    if (!exists) {
      issues.push(`Missing required security config: ${relativePath}`);
    }
  }

  const missingManifests = [];
  for (const relativePath of REQUIRED_SHOWCASE_MANIFESTS) {
    const absolutePath = path.join(workspace, relativePath);
    const exists = await pathExists(absolutePath);
    if (!exists) {
      missingManifests.push(relativePath);
    }
  }
  if (missingManifests.length > 0) {
    issues.push(
      `Curated showcase manifests missing: ${missingManifests
        .map((item) => item)
        .join(', ')}`
    );
  }

  const envApiKey =
    typeof env.REGISTRY_API_KEY === 'string' && env.REGISTRY_API_KEY.trim().length > 0
      ? env.REGISTRY_API_KEY.trim()
      : typeof process.env.REGISTRY_API_KEY === 'string' &&
          process.env.REGISTRY_API_KEY.trim().length > 0
        ? process.env.REGISTRY_API_KEY.trim()
        : null;

  const apiKeyPath = path.join(workspace, 'var', API_KEY_FILENAME);
  let effectiveApiKey = envApiKey;
  let apiKeySource = envApiKey ? 'environment' : null;

  if (!effectiveApiKey) {
    let fileKey = null;
    try {
      const payload = await fs.readFile(apiKeyPath, 'utf8');
      if (payload && payload.trim().length > 0) {
        fileKey = payload.trim();
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        warnings.push(`Unable to read ${resolveRelative(workspace, apiKeyPath)}: ${error.message}`);
      }
    }

    if (fileKey) {
      effectiveApiKey = fileKey;
      apiKeySource = resolveRelative(workspace, apiKeyPath);
      messages.push(`Loaded registry API key from ${apiKeySource}`);
    } else {
      effectiveApiKey = randomBytes(32).toString('hex');
      apiKeySource = 'generated';
      generated.registryApiKey = effectiveApiKey;
      const relativePath = resolveRelative(workspace, apiKeyPath);
      if (dryRun || ci) {
        messages.push(`Generated ephemeral registry API key (dry-run mode).`);
      } else {
        await ensureDirectory(path.dirname(apiKeyPath), { dryRun: false });
        await fs.writeFile(apiKeyPath, `${effectiveApiKey}\n`, 'utf8');
        messages.push(`Generated registry API key at ${relativePath}`);
        generated.registryApiKeyPath = relativePath;
      }
    }
  } else {
    messages.push('Using REGISTRY_API_KEY from environment.');
  }

  if (effectiveApiKey) {
    env.REGISTRY_API_KEY = effectiveApiKey;
  } else {
    issues.push('Unable to determine registry API key (generation failed).');
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? (warnings.length > 0 ? 'warn' : 'ok') : 'failed',
    issues,
    warnings,
    messages,
    details: {
      apiKeySource,
      generated,
      requiredConfigs: REQUIRED_SECURITY_CONFIGS,
      requiredManifests: REQUIRED_SHOWCASE_MANIFESTS
    }
  };
}

async function runRegistryHealth(context) {
  const { workspace } = context;
  const configPath = path.join(workspace, 'app', 'config', 'registry.config.json');
  let config = {};
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    config = JSON.parse(raw);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      return {
        ok: false,
        status: 'failed',
        issues: [`Failed to read registry config: ${error.message}`],
        details: { configPath: resolveRelative(workspace, configPath) }
      };
    }
  }

  const dbPath = config?.dbPath
    ? path.resolve(workspace, config.dbPath)
    : path.join(workspace, 'var', 'registry.sqlite');
  const pragmas = config?.pragmas ?? undefined;

  let db;
  try {
    db = await openDb({
      ...(config || {}),
      dbPath,
      pragmas
    });
    const health = await getHealth(db, {
      minFreeBytes: config?.health?.minFreeBytes
    });
    const issues = health.errors ?? [];
    const warnings = health.warnings ?? [];
    return {
      ok: health.status !== 'critical',
      status: health.status,
      issues,
      warnings,
      details: {
        dbPath: resolveRelative(workspace, dbPath),
        wal: health.wal,
        schemaVersion: health.schemaVersion,
        expectedSchemaVersion: health.expectedSchemaVersion,
        disk: health.disk
      }
    };
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      issues: [error.message ?? String(error)],
      details: {
        dbPath: resolveRelative(workspace, dbPath)
      }
    };
  } finally {
    if (db) {
      await db.close();
    }
  }
}

async function runRegistryBackup(context) {
  const { workspace, env, dryRun, ci } = context;

  const timestampTag = sanitizeTag(nowIso().replace(/[:.]/g, '-'));
  const tag = `preflight-${timestampTag}`;

  const args = [path.join('scripts', 'registry', 'backup.mjs'), '--tag', tag];
  let outputDir = null;

  if (dryRun || ci) {
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'preflight-backup-'));
    args.push('--out', outputDir);
  }

  const result = await runCommand('node', args, {
    cwd: workspace,
    env
  });

  let archivePath = null;
  if (result.stdout) {
    const match = result.stdout.match(/Registry backup created at (.+)$/m);
    if (match) {
      archivePath = match[1].trim();
    }
  }

  if (dryRun || ci) {
    if (outputDir) {
      try {
        await fs.rm(outputDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors in dry-run
      }
    }
  }

  if (!result.ok) {
    const errorMessage =
      result.stderr?.trim() || 'Registry backup command failed (non-zero exit).';
    return {
      ok: false,
      status: 'failed',
      issues: [errorMessage],
      details: {
        tag,
        archivePath
      }
    };
  }

  return {
    ok: true,
    status: 'ok',
    details: {
      tag,
      archivePath,
      dryRun: dryRun || ci
    }
  };
}

async function runRetention(context) {
  const { workspace, dryRun, ci } = context;
  const summary = await runRetentionGc({
    workspace,
    dryRun: dryRun || ci
  });

  const issues = summary.targets.flatMap((target) => target.errors ?? []);

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'ok' : 'failed',
    issues,
    details: {
      dryRun: summary.dryRun,
      reclaimedBytes: summary.dryRun ? summary.candidateBytes : summary.removedBytes,
      targets: summary.targets.length
    },
    summary
  };
}

async function runShowcase(context) {
  const { workspace, env, dryRun, ci } = context;
  const args = [path.join('scripts', 'demo', 'run-showcase.mjs')];
  if (dryRun || ci) {
    args.push('--dry-run');
  } else {
    args.push('--overwrite');
  }

  const result = await runCommand('node', args, {
    cwd: workspace,
    env
  });

  if (!result.ok) {
    const message =
      result.stderr?.trim() || result.stdout?.trim() || 'Showcase pipeline failed.';
    return {
      ok: false,
      status: 'failed',
      issues: [message]
    };
  }

  return {
    ok: true,
    status: dryRun || ci ? 'warn' : 'ok',
    warnings: dryRun || ci ? ['Showcase executed in dry-run mode (no artifacts written).'] : [],
    details: {
      dryRun: dryRun || ci
    }
  };
}

export async function runPreflight(options = {}) {
  const workspace = resolveWorkspace(options.workspace);
  const json = Boolean(options.json);
  const dryRun = Boolean(options.dryRun);
  const ci = Boolean(options.ci);
  const consoleUi = json ? null : createConsole();
  const env = { ...process.env };

  const context = {
    workspace,
    env,
    dryRun,
    ci
  };

  const summary = {
    ok: true,
    workspace,
    mode: ci ? 'ci' : dryRun ? 'dry-run' : 'default',
    steps: []
  };

  const steps = [
    {
      id: 'dependencies',
      label: 'Validate Node/npm toolchain',
      runner: checkDependencies
    },
    {
      id: 'configs',
      label: 'Ensure security configs and keys',
      runner: ensureConfigs
    },
    {
      id: 'registry-health',
      label: 'Run registry health check',
      runner: runRegistryHealth
    },
    {
      id: 'registry-backup',
      label: 'Create registry backup archive',
      runner: runRegistryBackup
    },
    {
      id: 'retention',
      label: 'Run artifact retention policies',
      runner: runRetention
    },
    {
      id: 'showcase',
      label: 'Execute curated showcase pipeline',
      runner: runShowcase
    }
  ];

  for (const step of steps) {
    let result;
    try {
      result = await step.runner(context);
    } catch (error) {
      result = {
        ok: false,
        status: 'failed',
        issues: [error.message ?? String(error)]
      };
    }

    const stepRecord = {
      id: step.id,
      label: step.label,
      ok: result.ok !== false,
      status: result.status ?? (result.ok === false ? 'failed' : 'ok'),
      warnings: result.warnings ?? [],
      issues: result.issues ?? [],
      details: result.details ?? {}
    };

    summary.steps.push(stepRecord);

    if (consoleUi) {
      if (!stepRecord.ok) {
        consoleUi.error(`${step.label} failed`, stepRecord.issues);
      } else if (stepRecord.status === 'warn' || stepRecord.warnings.length > 0) {
        consoleUi.warn(step.label, [...(stepRecord.warnings || []), ...(stepRecord.issues || [])]);
      } else {
        consoleUi.success(step.label);
      }
    }

    if (!stepRecord.ok) {
      summary.ok = false;
      if (!json) {
        consoleUi?.error('Preflight halted due to failures.');
      }
      break;
    }
  }

  return summary;
}

async function main() {
  let options;
  try {
    options = parseArgs();
  } catch (error) {
    console.error(error.message);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    printHelp();
    return;
  }

  try {
    const summary = await runPreflight(options);
    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else if (summary.ok) {
      console.log('');
      console.log('Preflight completed successfully.');
    }
    if (!summary.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message ?? String(error));
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] &&
  fileURLToPath(pathToFileURL(process.argv[1])) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await main();
}

