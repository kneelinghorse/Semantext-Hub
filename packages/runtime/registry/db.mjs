import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { statfs } from 'node:fs/promises';

export const REGISTRY_SCHEMA_VERSION = 1;
const DEFAULT_MIN_FREE_BYTES = 256 * 1024 * 1024; // 256 MB

function toBigInt(value) {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.max(0, Math.floor(value)));
  }
  return BigInt(0);
}

async function getDiskInfo(dbPath) {
  const directory = path.dirname(dbPath);
  try {
    const stats = await statfs(directory);
    const blockSize = toBigInt(stats.bsize ?? 0);
    const totalBlocks = toBigInt(stats.blocks ?? 0);
    const availableBlocks = toBigInt(stats.bavail ?? stats.blocks ?? 0);
    const freeBytes = blockSize * availableBlocks;
    const totalBytes = blockSize * totalBlocks;
    return {
      path: directory,
      freeBytes: Number(freeBytes),
      totalBytes: Number(totalBytes),
    };
  } catch (error) {
    return {
      path: directory,
      error: error?.message ?? 'Unable to compute disk statistics',
    };
  }
}

export async function openDb(cfg = {}) {
  const dbPath = cfg.dbPath || path.resolve(process.cwd(), 'var/registry.sqlite');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec("PRAGMA journal_mode=WAL;");
  await db.exec("PRAGMA synchronous=NORMAL;");

  if (cfg.pragmas && typeof cfg.pragmas === 'object') {
    for (const [name, value] of Object.entries(cfg.pragmas)) {
      await db.exec(`PRAGMA ${name}=${value};`);
    }
  }
  return db;
}

export async function getHealth(db, options = {}) {
  const journalMode = await db.get("PRAGMA journal_mode;");
  const schemaVersion = await db.get("PRAGMA user_version;");
  const walMode = String(journalMode?.journal_mode || '').toLowerCase();
  const walEnabled = walMode === 'wal';
  const currentSchema = schemaVersion?.user_version ?? null;
  const disk = await getDiskInfo(db.config.filename);

  const warnings = [];
  const errors = [];

  if (!walEnabled) {
    warnings.push('SQLite journal_mode is not WAL; crash recovery safety is reduced.');
  }

  if (currentSchema === null) {
    errors.push('Unable to determine registry schema version (PRAGMA user_version returned null).');
  } else if (currentSchema !== REGISTRY_SCHEMA_VERSION) {
    errors.push(
      `Registry schema version ${currentSchema} does not match expected ${REGISTRY_SCHEMA_VERSION}.`,
    );
  }

  let diskInfo = null;
  if (disk?.error) {
    warnings.push(`Disk health unavailable: ${disk.error}`);
  } else if (typeof disk?.freeBytes === 'number') {
    const candidateMinFree = Number(options.minFreeBytes);
    const thresholdBytes =
      Number.isFinite(candidateMinFree) && candidateMinFree >= 0
        ? candidateMinFree
        : DEFAULT_MIN_FREE_BYTES;
    const healthy = disk.freeBytes >= thresholdBytes;
    if (!healthy) {
      warnings.push(
        `Available disk space ${Math.round(disk.freeBytes / (1024 * 1024))}MB is below threshold ${Math.round(thresholdBytes / (1024 * 1024))}MB.`,
      );
    }
    diskInfo = {
      path: disk.path,
      freeBytes: disk.freeBytes,
      freeMegabytes: Math.round(disk.freeBytes / (1024 * 1024)),
      totalBytes: disk.totalBytes ?? null,
      thresholdBytes,
      healthy,
    };
  }

  const status = errors.length > 0 ? 'critical' : warnings.length > 0 ? 'warn' : 'ok';

  return {
    driver: 'sqlite',
    path: db.config.filename,
    wal: walEnabled,
    journalMode: walMode || null,
    schemaVersion: currentSchema,
    expectedSchemaVersion: REGISTRY_SCHEMA_VERSION,
    status,
    warnings,
    errors,
    disk: diskInfo,
  };
}
