#!/usr/bin/env node

/**
 * Database migration script
 * Applies schema.sql to the database
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../../packages/runtime/registry/db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, 'schema.sql');

async function migrate() {
  console.log('🔄 Running database migration...');
  
  if (!fs.existsSync(schemaPath)) {
    console.error(`❌ Schema file not found: ${schemaPath}`);
    process.exit(1);
  }
  
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const db = await openDb();
  
  console.log(`📄 Applying schema from: ${schemaPath}`);
  console.log(`📦 Database: ${db.config.filename}`);
  
  try {
    await db.exec(schema);
    console.log('✅ Migration completed successfully');
    
    // Show table list
    const tables = await db.all(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    console.log(`\n📊 Tables in database:`);
    tables.forEach(t => console.log(`  - ${t.name}`));
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

export { migrate };
