#!/usr/bin/env node

/**
 * Sync approved protocol manifests into artifacts/protocols for local registry loads.
 *
 * The registry loader defaults to scanning artifacts/protocols for *.json files.
 * This script copies every approved/<protocol>/manifest.json into that directory
 * so developers can hydrate the registry without manually curating files.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APPROVED_DIR = path.join(ROOT, 'approved');
const TARGET_DIR = path.join(ROOT, 'artifacts', 'protocols');

async function ensureDirectory(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function copyManifest(sourceDir, protocolName) {
  const sourcePath = path.join(sourceDir, 'manifest.json');
  const exists = await fs
    .access(sourcePath)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    return false;
  }

  const targetDir = path.join(TARGET_DIR, protocolName);
  await ensureDirectory(targetDir);

  const targetPath = path.join(targetDir, 'manifest.json');
  await fs.copyFile(sourcePath, targetPath);
  return true;
}

async function main() {
  const entries = await fs.readdir(APPROVED_DIR, { withFileTypes: true });
  const synced = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const protocolDir = path.join(APPROVED_DIR, entry.name);
    const success = await copyManifest(protocolDir, entry.name);
    if (success) {
      synced.push(entry.name);
    }
  }

  console.log(`Synced ${synced.length} protocol manifest${synced.length === 1 ? '' : 's'}:`);
  for (const name of synced) {
    console.log(`  • ${name}`);
  }
  if (synced.length === 0) {
    console.log('No manifest.json files found under approved/.');
  } else {
    console.log(`Output: ${TARGET_DIR}`);
  }
}

main().catch((error) => {
  console.error('Failed to sync approved protocol manifests:', error);
  process.exit(1);
});
