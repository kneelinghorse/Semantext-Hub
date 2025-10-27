#!/usr/bin/env node

/**
 * Garbage-collection utility for performance artifacts and logs.
 *
 * Reads retention policies from app/config/retention.json and prunes
 * directories/files according to age, size, and minimum keep thresholds.
 *
 * Usage:
 *   node scripts/cleanup/gc-artifacts.mjs [--workspace <path>] [--config <path>] [--dry-run] [--json]
 */

import { readFile, readdir, stat, rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Execute retention workflow and return a structured summary.
 * @param {Object} options
 * @param {string} [options.workspace] - Workspace root (defaults to cwd).
 * @param {string} [options.configPath] - Optional override for retention config path.
 * @param {boolean} [options.dryRun=false] - When true, no deletions are performed.
 * @param {number} [options.now=Date.now()] - Reference timestamp for age calculations.
 * @returns {Promise<Object>} summary
 */
export async function runRetentionGc({
  workspace = process.cwd(),
  configPath,
  dryRun = false,
  now = Date.now()
} = {}) {
  const workspaceRoot = resolve(workspace);
  const resolvedConfigPath = configPath
    ? resolve(workspaceRoot, configPath)
    : resolve(workspaceRoot, 'app/config/retention.json');

  const config = await loadConfig(resolvedConfigPath);
  const defaults = config.defaults ?? {};
  const targets = Array.isArray(config.targets) ? config.targets : [];

  const targetSummaries = [];
  for (const rawTarget of targets) {
    const summary = await processTarget({
      workspaceRoot,
      rawTarget,
      defaults,
      dryRun,
      now
    });
    targetSummaries.push(summary);
  }

  const candidateBytes = targetSummaries.reduce(
    (total, target) => total + target.candidateBytes,
    0
  );
  const removedBytes = targetSummaries.reduce(
    (total, target) => total + target.removedBytes,
    0
  );

  return {
    dryRun,
    workspace: workspaceRoot,
    configPath: resolvedConfigPath,
    candidateBytes,
    removedBytes,
    targets: targetSummaries
  };
}

async function loadConfig(configPath) {
  let payload;
  try {
    payload = await readFile(configPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        `Retention config not found at ${configPath}. ` +
          'Create app/config/retention.json to define policies.'
      );
    }
    throw error;
  }

  try {
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed.targets)) {
      throw new Error('Retention config must include a "targets" array.');
    }
    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse retention config ${configPath}: ${error.message}`);
  }
}

async function processTarget({ workspaceRoot, rawTarget, defaults, dryRun, now }) {
  const targetId = rawTarget.id ?? rawTarget.path ?? 'unknown-target';
  const targetPath = rawTarget.path;
  if (!targetPath) {
    return {
      id: targetId,
      path: null,
      exists: false,
      skipped: true,
      messages: ['Target is missing required "path" property.'],
      scannedEntries: 0,
      keptEntries: 0,
      candidateEntries: [],
      removedEntries: [],
      candidateBytes: 0,
      removedBytes: 0,
      protectedEntries: [],
      errors: ['Target path missing']
    };
  }

  const resolvedPath = resolve(workspaceRoot, targetPath);
  const protect = new Set([
    ...(Array.isArray(defaults.protect) ? defaults.protect : []),
    ...(Array.isArray(rawTarget.protect) ? rawTarget.protect : [])
  ].map((item) => normalizeRelative(item)));

  const keepLatest = coerceNumber(rawTarget.keepLatest, defaults.keepLatest, 0);
  const maxAgeDays = coerceNumber(rawTarget.maxAgeDays, defaults.maxAgeDays, null);
  const maxTotalSizeMB = coerceNumber(
    rawTarget.maxTotalSizeMB,
    defaults.maxTotalSizeMB,
    null
  );
  const maxEntries = coerceNumber(rawTarget.maxEntries, defaults.maxEntries, null);

  const summary = {
    id: targetId,
    path: relative(workspaceRoot, resolvedPath) || '.',
    exists: false,
    skipped: false,
    dryRun,
    keepLatest,
    maxAgeDays,
    maxTotalSizeMB,
    maxEntries,
    scannedEntries: 0,
    keptEntries: 0,
    candidateEntries: [],
    removedEntries: [],
    candidateBytes: 0,
    removedBytes: 0,
    protectedEntries: [...protect],
    messages: [],
    errors: []
  };

  let dirEntries;
  try {
    dirEntries = await readdir(resolvedPath, { withFileTypes: true });
    summary.exists = true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      summary.skipped = true;
      summary.messages.push(`Path ${summary.path} not found; skipping.`);
      return summary;
    }
    summary.skipped = true;
    summary.errors.push(`Failed to read directory ${resolvedPath}: ${error.message}`);
    return summary;
  }

  const entries = [];
  for (const dirent of dirEntries) {
    if (dirent.name === '.' || dirent.name === '..') {
      continue;
    }
    const entryPath = join(resolvedPath, dirent.name);
    const descriptor = await describeEntry(entryPath, dirent);
    descriptor.relativeToTarget = normalizeRelative(
      relative(resolvedPath, descriptor.path)
    );
    descriptor.relativeToWorkspace = normalizeRelative(
      relative(workspaceRoot, descriptor.path)
    );
    entries.push(descriptor);
  }

  entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  summary.scannedEntries = entries.length;

  const keepSet = new Set(
    entries.slice(0, keepLatest).map((entry) => entry.relativeToTarget)
  );

  const candidateMap = new Map();
  const addCandidate = (entry, reason) => {
    if (keepSet.has(entry.relativeToTarget) || protect.has(entry.relativeToTarget)) {
      return;
    }
    const key = entry.relativeToTarget;
    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        entry,
        reasons: new Set()
      });
    }
    candidateMap.get(key).reasons.add(reason);
  };

  if (maxAgeDays !== null) {
    const maxAgeMs = maxAgeDays * MS_PER_DAY;
    for (const entry of entries) {
      if (keepSet.has(entry.relativeToTarget) || protect.has(entry.relativeToTarget)) {
        continue;
      }
      const age = now - entry.mtimeMs;
      if (age > maxAgeMs) {
        addCandidate(entry, `age>${maxAgeDays}d`);
      }
    }
  }

  if (maxEntries !== null && entries.length > maxEntries) {
    const overflow = entries.slice(maxEntries);
    for (const entry of overflow) {
      addCandidate(entry, `entries>${maxEntries}`);
    }
  }

  const totalBytes = entries.reduce((total, entry) => total + entry.size, 0);
  const candidateInitialBytes = Array.from(candidateMap.values()).reduce(
    (total, item) => total + item.entry.size,
    0
  );

  const maxTotalSizeBytes =
    maxTotalSizeMB !== null ? maxTotalSizeMB * 1024 * 1024 : null;

  if (maxTotalSizeBytes !== null) {
    let bytesAfterInitial = totalBytes - candidateInitialBytes;
    if (bytesAfterInitial > maxTotalSizeBytes) {
      const eligibleForSize = entries
        .filter((entry) => {
          const key = entry.relativeToTarget;
          if (keepSet.has(key) || protect.has(key)) {
            return false;
          }
          return !candidateMap.has(key);
        })
        .sort((a, b) => a.mtimeMs - b.mtimeMs); // oldest first

      for (const entry of eligibleForSize) {
        if (bytesAfterInitial <= maxTotalSizeBytes) {
          break;
        }
        addCandidate(entry, `size>${maxTotalSizeMB}MB`);
        bytesAfterInitial -= entry.size;
      }
    }
  }

  const finalCandidates = Array.from(candidateMap.values()).map(
    ({ entry, reasons }) => ({
      entry,
      reasons: Array.from(reasons).sort()
    })
  );

  finalCandidates.sort((a, b) => a.entry.mtimeMs - b.entry.mtimeMs);

  summary.candidateEntries = finalCandidates.map(({ entry, reasons }) => ({
    path: entry.relativeToWorkspace,
    sizeBytes: entry.size,
    reasons
  }));
  summary.candidateBytes = finalCandidates.reduce(
    (total, candidate) => total + candidate.entry.size,
    0
  );

  const removedPaths = [];
  let removedBytes = 0;
  const removalErrors = [];

  for (const candidate of finalCandidates) {
    const targetPathForRemoval = candidate.entry.path;
    if (dryRun) {
      continue;
    }
    try {
      await rm(targetPathForRemoval, { recursive: candidate.entry.isDirectory, force: true });
      removedPaths.push(candidate.entry.relativeToWorkspace);
      removedBytes += candidate.entry.size;
    } catch (error) {
      removalErrors.push(
        `Failed to remove ${candidate.entry.relativeToWorkspace}: ${error.message}`
      );
    }
  }

  summary.removedEntries = removedPaths;
  summary.removedBytes = removedBytes;
  if (removalErrors.length > 0) {
    summary.errors.push(...removalErrors);
  }

  summary.keptEntries = entries.length - finalCandidates.length;

  if (finalCandidates.length === 0) {
    summary.messages.push(
      `No retention actions required for ${summary.path}. (scanned ${entries.length} entries)`
    );
  } else if (dryRun) {
    summary.messages.push(
      `Dry run: ${finalCandidates.length} entries would be removed from ${summary.path}, ` +
        `reclaiming ~${formatBytes(summary.candidateBytes)}.`
    );
  } else {
    summary.messages.push(
      `Removed ${removedPaths.length} entries from ${summary.path}, reclaimed ` +
        `${formatBytes(removedBytes)}.`
    );
  }

  if (protect.size > 0) {
    summary.messages.push(
      `Protected entries (${protect.size}) retained: ${Array.from(protect).join(', ')}`
    );
  }

  return summary;
}

async function describeEntry(entryPath, dirent) {
  const descriptor = {
    name: dirent.name,
    path: entryPath,
    size: 0,
    mtimeMs: 0,
    isDirectory: dirent.isDirectory()
  };

  if (dirent.isDirectory()) {
    const aggregate = await aggregateDirectory(entryPath);
    descriptor.size = aggregate.size;
    descriptor.mtimeMs = aggregate.mtimeMs;
  } else {
    const stats = await stat(entryPath);
    descriptor.size = stats.size;
    descriptor.mtimeMs = stats.mtimeMs;
  }

  return descriptor;
}

async function aggregateDirectory(directoryPath) {
  let totalSize = 0;
  let latestMtimeMs = 0;

  const stack = [directoryPath];
  while (stack.length > 0) {
    const current = stack.pop();
    const stats = await stat(current);
    if (stats.mtimeMs > latestMtimeMs) {
      latestMtimeMs = stats.mtimeMs;
    }

    if (stats.isDirectory()) {
      const children = await readdir(current, { withFileTypes: true });
      for (const child of children) {
        const childPath = join(current, child.name);
        if (child.isDirectory()) {
          stack.push(childPath);
        } else {
          const childStats = await stat(childPath);
          totalSize += childStats.size;
          if (childStats.mtimeMs > latestMtimeMs) {
            latestMtimeMs = childStats.mtimeMs;
          }
        }
      }
    } else {
      totalSize += stats.size;
    }
  }

  return {
    size: totalSize,
    mtimeMs: latestMtimeMs
  };
}

function coerceNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }
    const numberValue = Number(value);
    if (!Number.isNaN(numberValue)) {
      return numberValue;
    }
  }
  return null;
}

function normalizeRelative(pathname) {
  if (!pathname) {
    return '';
  }
  return pathname.split('\\').join('/');
}

function formatBytes(bytes) {
  if (bytes === 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function parseArguments(argv = process.argv.slice(2)) {
  const options = {
    workspace: process.cwd(),
    dryRun: false,
    json: false,
    configPath: null,
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
      case '-c':
      case '--config':
        options.configPath = argv[index + 1];
        index += 1;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option: ${arg}`);
        }
    }
  }

  return options;
}

function printHelp() {
  const scriptPath = fileURLToPath(import.meta.url);
  const scriptName = relative(process.cwd(), scriptPath) || scriptPath;
  const usage = [
    `Usage: node ${scriptName} [options]`,
    '',
    'Options:',
    '  -w, --workspace <path>   Workspace root (defaults to current directory)',
    '  -c, --config <path>      Override retention config path (relative to workspace)',
    '      --dry-run            Preview actions without deleting files',
    '      --json               Emit summary as JSON (suppresses console messages)',
    '  -h, --help               Show this help message'
  ];
  usage.forEach((line) => console.log(line));
}

export function logSummary(summary) {
  for (const target of summary.targets) {
    for (const message of target.messages) {
      console.log(message);
    }
    if (target.candidateEntries.length > 0 && summary.dryRun) {
      console.log(
        `  Candidates (${target.candidateEntries.length}): ${target.candidateEntries
          .map((entry) => `${entry.path} (${formatBytes(entry.sizeBytes)})`)
          .join(', ')}`
      );
    }
    if (target.errors.length > 0) {
      target.errors.forEach((error) => console.error(error));
    }
  }

  const label = summary.dryRun ? 'would reclaim' : 'reclaimed';
  console.log(
    `${summary.dryRun ? 'Dry run:' : 'Completed:'} ${formatBytes(summary.dryRun ? summary.candidateBytes : summary.removedBytes)} ${label} across ${summary.targets.length} target(s).`
  );
}

async function main() {
  let options;
  try {
    options = parseArguments();
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
    const summary = await runRetentionGc({
      workspace: options.workspace,
      configPath: options.configPath,
      dryRun: options.dryRun
    });

    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    logSummary(summary);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

const directInvocation =
  process.argv[1] &&
  resolve(process.cwd(), process.argv[1]) === fileURLToPath(import.meta.url);

if (directInvocation) {
  await main();
}
