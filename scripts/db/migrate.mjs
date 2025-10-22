#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { openDb } from '../../packages/runtime/registry/db.mjs';

const SRC_DIR = path.resolve(process.cwd(), 'var/file-store');  // legacy
const CFG_PATH = path.resolve(process.cwd(), 'app/config/registry.config.json');
const REPORT_PATH = path.resolve(process.cwd(), 'artifacts/db/registry-migration-report.json');

const walk = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).flatMap(f => {
  const p = path.join(dir, f);
  const s = fs.statSync(p);
  return s.isDirectory() ? walk(p) : [p];
}) : [];

function isManifestPath(p) {
  return /\.json$/i.test(p);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

(async () => {
  const DB_CFG = fs.existsSync(CFG_PATH) 
    ? JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'))
    : {};
    
  const schema = fs.readFileSync(path.resolve(process.cwd(), 'scripts/db/schema.sql'), 'utf8');
  
  const db = await openDb(DB_CFG);
  await db.exec(schema);
  
  console.log('[migrate] Schema initialized');

  let files = [];
  let imported = 0;
  let importErrors = 0;

  if (fs.existsSync(SRC_DIR)) {
    files = walk(SRC_DIR).filter(isManifestPath);
    
    for (const file of files) {
      try {
        const body = fs.readFileSync(file, 'utf8');
        const urn = path.basename(file, '.json');
        const digest = sha256(body);
        
        await db.run(
          `INSERT OR REPLACE INTO manifests(urn, body, digest) VALUES(?,?,?)`,
          [urn, body, digest]
        );
        
        // Extract and store capabilities
        try {
          const j = JSON.parse(body);
          if (Array.isArray(j?.capabilities)) {
            for (const cap of j.capabilities) {
              await db.run("INSERT OR IGNORE INTO capabilities(urn,cap) VALUES(?,?)", [urn, String(cap)]);
            }
          }
        } catch {}
        
        imported++;
      } catch (err) {
        console.error(`[migrate] Failed to import ${file}:`, err.message);
        importErrors++;
      }
    }
    console.log(`[migrate] Imported ${imported}/${files.length} manifests from file-store`);
  } else {
    console.log('[migrate] No legacy file-store found at', SRC_DIR);
  }

  const manifestCount = (await db.get('SELECT COUNT(*) AS count FROM manifests'))?.count ?? 0;
  const schemaVersion = (await db.get('PRAGMA user_version;'))?.user_version ?? null;
  const integrityOk =
    (files.length === 0 || manifestCount === files.length) && importErrors === 0 && imported === files.length;

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  const manifestParity = files.length === 0 ? null : manifestCount === files.length;

  const report = {
    generated_at: new Date().toISOString(),
    source: {
      path: SRC_DIR,
      manifests: files.length,
    },
    target: {
      path: DB_CFG.dbPath || path.resolve(process.cwd(), 'var/registry.sqlite'),
      manifests: manifestCount,
    },
    imported,
    importErrors,
    schemaVersion,
    integrity: {
      manifestParity,
      errorFree: importErrors === 0,
    },
    status: integrityOk ? 'ok' : 'error',
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log('[migrate] Wrote report to', REPORT_PATH);
  
  await db.close();
  console.log('[migrate] Migration complete');

  if (!integrityOk) {
    console.error('[migrate] ERROR: Migration did not preserve parity with legacy file-store');
    process.exit(1);
  }
})().catch((e) => {
  console.error('[migrate] ERROR:', e);
  process.exit(1);
});
