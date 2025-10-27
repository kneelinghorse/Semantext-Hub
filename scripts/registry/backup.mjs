#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { mkdir, access, copyFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_CONFIG_PATH = path.join(REPO_ROOT, 'app', 'config', 'registry.config.json');
const DEFAULT_DB_PATH = path.join(REPO_ROOT, 'var', 'registry.sqlite');
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, 'artifacts', 'registry', 'backups');
const DEFAULT_PROVENANCE_EXPORT = 'provenance.jsonl';

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--db':
        options.db = argv[++i];
        break;
      case '--config':
        options.config = argv[++i];
        break;
      case '--out':
      case '--output':
        options.output = argv[++i];
        break;
      case '--tag':
        options.tag = argv[++i];
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (arg && arg.startsWith('--')) {
          throw new Error(`Unknown option: ${arg}`);
        }
        break;
    }
  }
  return options;
}

function usage() {
  return `
Registry Backup Utility

Usage:
  node scripts/registry/backup.mjs [--db <path>] [--config <path>] [--out <dir>] [--tag <label>]

Options:
  --db <path>       Path to registry SQLite database (defaults to config/dbPath or var/registry.sqlite)
  --config <path>   Path to registry config JSON with dbPath (default: app/config/registry.config.json)
  --out <dir>       Output directory for archive (default: artifacts/registry/backups)
  --tag <label>     Optional label appended to archive filename
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
  } catch (error) {
    // Config is optional; fall back to default
  }

  return DEFAULT_DB_PATH;
}

async function ensureDirectory(dir) {
  await mkdir(dir, { recursive: true });
}

function sanitizeTimestamp(ts) {
  return ts.replace(/[:.]/g, '-');
}

async function exportProvenance(dbPath, destination) {
  let db;
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
      mode: sqlite3.OPEN_READONLY,
    });
    const rows = await db.all(
      `SELECT urn, envelope, payload_type AS payloadType, digest, issuer, committed_at AS committedAt,
              build_tool AS buildTool, inputs, outputs, created_at AS createdAt
       FROM provenance
       ORDER BY created_at ASC`,
    );
    if (!rows || rows.length === 0) {
      await writeFile(destination, '', 'utf8');
      return { count: 0 };
    }
    const lines = rows.map((row) => JSON.stringify(row));
    await writeFile(destination, `${lines.join('\n')}\n`, 'utf8');
    return { count: rows.length };
  } catch (error) {
    if (error?.message && /no such table/i.test(error.message)) {
      await writeFile(destination, '', 'utf8');
      return { count: 0 };
    }
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

async function copyIfExists(source, target) {
  try {
    await access(source, fs.constants.F_OK);
    await copyFile(source, target);
    return true;
  } catch {
    return false;
  }
}

async function createTarball(sourceDir, outputDir, baseName) {
  const archiveName = `${baseName}.tar.gz`;
  const archivePath = path.join(outputDir, archiveName);

  await new Promise((resolve, reject) => {
    const child = spawn(
      'tar',
      ['-czf', archivePath, '-C', sourceDir, '.'],
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

  return archivePath;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      process.exit(0);
    }

    const dbPath = await resolveDbPath(options);
    await access(dbPath, fs.constants.R_OK);

    const timestamp = sanitizeTimestamp(new Date().toISOString());
    const label = options.tag ? options.tag.replace(/\s+/g, '-') : null;
    const baseName = label
      ? `registry-backup-${timestamp}-${label}`
      : `registry-backup-${timestamp}`;

    const outputDir = options.output
      ? path.resolve(REPO_ROOT, options.output)
      : DEFAULT_OUTPUT_DIR;
    await ensureDirectory(outputDir);

    const stagingDir = path.join(outputDir, `${baseName}-staging`);
    await ensureDirectory(stagingDir);

    const dbFileName = path.basename(dbPath);
    const walFile = `${dbPath}-wal`;
    const shmFile = `${dbPath}-shm`;

    await copyIfExists(dbPath, path.join(stagingDir, dbFileName));
    const walCopied = await copyIfExists(walFile, path.join(stagingDir, path.basename(walFile)));
    const shmCopied = await copyIfExists(shmFile, path.join(stagingDir, path.basename(shmFile)));

    const provenancePath = path.join(stagingDir, DEFAULT_PROVENANCE_EXPORT);
    const provenanceSummary = await exportProvenance(dbPath, provenancePath);

    const metadata = {
      created_at: new Date().toISOString(),
      source_db: path.relative(REPO_ROOT, dbPath),
      files: {
        database: dbFileName,
        wal: walCopied ? path.basename(walFile) : null,
        shm: shmCopied ? path.basename(shmFile) : null,
        provenance: path.basename(provenancePath),
      },
      provenance_records: provenanceSummary.count,
    };
    await writeFile(
      path.join(stagingDir, 'metadata.json'),
      `${JSON.stringify(metadata, null, 2)}\n`,
      'utf8',
    );

    const archivePath = await createTarball(stagingDir, outputDir, baseName);
    await rm(stagingDir, { recursive: true, force: true });

    console.log(`✅ Registry backup created at ${path.relative(REPO_ROOT, archivePath)}`);
  } catch (error) {
    console.error(`❌ Registry backup failed: ${error.message}`);
    process.exitCode = 1;
  }
}

await main();
