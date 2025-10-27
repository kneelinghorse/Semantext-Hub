#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { mkdir, access, rm, readFile, copyFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_CONFIG_PATH = path.join(REPO_ROOT, 'app', 'config', 'registry.config.json');
const DEFAULT_DB_PATH = path.join(REPO_ROOT, 'var', 'registry.sqlite');
const DEFAULT_LOG_PATH = path.join(REPO_ROOT, 'var', 'registry-provenance.jsonl');

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--archive':
      case '-a':
        options.archive = argv[++i];
        break;
      case '--db':
        options.db = argv[++i];
        break;
      case '--config':
        options.config = argv[++i];
        break;
      case '--log':
        options.log = argv[++i];
        break;
      case '--force':
        options.force = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (!options.archive && !arg.startsWith('--')) {
          options.archive = arg;
        } else if (arg && arg.startsWith('--')) {
          throw new Error(`Unknown option: ${arg}`);
        }
        break;
    }
  }
  return options;
}

function usage() {
  return `
Registry Restore Utility

Usage:
  node scripts/registry/restore.mjs --archive <file> [--db <path>] [--config <path>] [--log <path>] [--force]

Options:
  --archive <file>  Path to backup archive (.tar.gz)
  --db <path>       Destination registry database path (default: config/dbPath or var/registry.sqlite)
  --config <path>   Registry config JSON used to derive dbPath when --db not provided
  --log <path>      Destination provenance log path (default: var/registry-provenance.jsonl)
  --force           Overwrite existing database files
  --help            Show this help message
`.trim();
}

async function resolveDbPath({ db, config }) {
  if (db) {
    return path.resolve(REPO_ROOT, db);
  }

  const envDb = process.env.REGISTRY_DB_PATH || process.env.DB_PATH;
  if (envDb) {
    return path.resolve(REPO_ROOT, envDb);
  }

  const configPath = config
    ? path.resolve(REPO_ROOT, config)
    : DEFAULT_CONFIG_PATH;

  try {
    const raw = await fs.promises.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.dbPath) {
      return path.resolve(REPO_ROOT, parsed.dbPath);
    }
  } catch {
    // ignore config read failures
  }

  return DEFAULT_DB_PATH;
}

async function ensureDirectory(dir) {
  await mkdir(dir, { recursive: true });
}

async function extractArchive(archivePath, targetDir) {
  await ensureDirectory(targetDir);
  await new Promise((resolve, reject) => {
    const child = spawn(
      'tar',
      ['-xzf', archivePath, '-C', targetDir],
      { stdio: ['ignore', 'inherit', 'inherit'] },
    );
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tar exited with code ${code}`));
      }
    });
    child.on('error', reject);
  });
}

async function copyWithOverwrite(source, destination, overwrite) {
  await ensureDirectory(path.dirname(destination));
  if (!overwrite) {
    try {
      await access(destination, fs.constants.F_OK);
      throw new Error(`Destination already exists: ${destination}. Use --force to overwrite.`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  await copyFile(source, destination);
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      process.exit(0);
    }
    if (!options.archive) {
      console.error('❌ Missing required --archive <file> argument.');
      console.log(usage());
      process.exit(1);
      return;
    }

    const archivePath = path.resolve(REPO_ROOT, options.archive);
    await access(archivePath, fs.constants.R_OK);

    const dbPath = await resolveDbPath(options);
    const logPath = options.log
      ? path.resolve(REPO_ROOT, options.log)
      : DEFAULT_LOG_PATH;

    const tempDir = path.join(
      path.dirname(archivePath),
      `.registry-restore-${Date.now()}`,
    );

    await extractArchive(archivePath, tempDir);

    const metadataPath = path.join(tempDir, 'metadata.json');
    let metadata = null;
    try {
      const raw = await readFile(metadataPath, 'utf8');
      metadata = JSON.parse(raw);
    } catch {
      // metadata is optional but recommended
    }

    const dbFileName =
      metadata?.files?.database ||
      (await fs.promises.readdir(tempDir)).find((file) => file.endsWith('.sqlite'));

    if (!dbFileName) {
      throw new Error('Archive did not contain a *.sqlite database file.');
    }

    const extractedDbPath = path.join(tempDir, dbFileName);
    await copyWithOverwrite(extractedDbPath, dbPath, options.force);

    const walFileName = metadata?.files?.wal;
    const shmFileName = metadata?.files?.shm;
    if (walFileName) {
      const walSource = path.join(tempDir, walFileName);
      await copyWithOverwrite(walSource, `${dbPath}-wal`, true);
    }
    if (shmFileName) {
      const shmSource = path.join(tempDir, shmFileName);
      await copyWithOverwrite(shmSource, `${dbPath}-shm`, true);
    }

    const provenanceFileName = metadata?.files?.provenance || 'provenance.jsonl';
    const provenanceSource = path.join(tempDir, provenanceFileName);
    try {
      await access(provenanceSource, fs.constants.R_OK);
      await copyWithOverwrite(provenanceSource, logPath, true);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    if (metadata) {
      const auditLog = {
        restored_at: new Date().toISOString(),
        archive: path.relative(REPO_ROOT, archivePath),
        destination_db: path.relative(REPO_ROOT, dbPath),
        provenance_log: path.relative(REPO_ROOT, logPath),
        metadata,
      };
      await writeFile(
        path.join(tempDir, 'restore-report.json'),
        `${JSON.stringify(auditLog, null, 2)}\n`,
        'utf8',
      );
    }

    await rm(tempDir, { recursive: true, force: true });

    console.log(`✅ Registry restore complete. Database at ${path.relative(REPO_ROOT, dbPath)}`);
    console.log(`   Provenance log at ${path.relative(REPO_ROOT, logPath)}`);
  } catch (error) {
    console.error(`❌ Registry restore failed: ${error.message}`);
    process.exitCode = 1;
  }
}

await main();
