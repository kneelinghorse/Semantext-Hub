import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'node:fs';
import path from 'node:path';

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

export async function getHealth(db) {
  const journalMode = await db.get("PRAGMA journal_mode;");
  const schemaVersion = await db.get("PRAGMA user_version;");
  return {
    driver: 'sqlite',
    wal: journalMode?.journal_mode === 'wal',
    path: db.config.filename,
    schemaVersion: schemaVersion?.user_version ?? null
  };
}

