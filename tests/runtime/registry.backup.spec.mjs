import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { mkdtemp, rm, readFile, access, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCHEMA_PATH = fileURLToPath(new URL('../../scripts/db/schema.sql', import.meta.url));

async function runNodeScript(scriptPath, args, cwd) {
  await execFileAsync('node', [scriptPath, ...args], {
    cwd,
    env: {
      ...process.env,
    },
  });
}

describe('registry backup utilities', () => {
  let workspaceDir;

  beforeAll(async () => {
    workspaceDir = await mkdtemp(path.join(tmpdir(), 'registry-backup-'));
  });

  afterAll(async () => {
    if (workspaceDir) {
      await rm(workspaceDir, { recursive: true, force: true });
    }
  });

  it('creates a backup archive and restores registry data with provenance log', async () => {
    const dbPath = path.join(workspaceDir, 'registry.sqlite');
    const backupDir = path.join(workspaceDir, 'backups');
    const restoreDir = path.join(workspaceDir, 'restore');
    const provenanceLogPath = path.join(restoreDir, 'registry-provenance.jsonl');

    await rm(backupDir, { recursive: true, force: true });
    await rm(restoreDir, { recursive: true, force: true });

    // Seed a registry database with schema + sample data
    const db = await open({ filename: dbPath, driver: sqlite3.Database });
    const schemaSql = await readFile(SCHEMA_PATH, 'utf8');
    await db.exec(schemaSql);

    const sampleManifest = {
      urn: 'urn:proto:test:backup',
      body: JSON.stringify({ id: 'backup-test', version: '1.0.0' }),
    };
    const manifestDigest = createHash('sha256').update(sampleManifest.body).digest('hex');

    await db.run(
      'INSERT INTO manifests (urn, body, digest, issuer) VALUES (?, ?, ?, ?)',
      [sampleManifest.urn, sampleManifest.body, manifestDigest, 'acme:test'],
    );

    const provenanceEnvelope = JSON.stringify({
      kind: 'test-provenance',
      subject: sampleManifest.urn,
    });

    await db.run(
      `INSERT INTO provenance
        (urn, envelope, payload_type, digest, issuer, committed_at, build_tool, inputs, outputs)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sampleManifest.urn,
        provenanceEnvelope,
        'application/vnd.in-toto+json',
        manifestDigest,
        'builder:example',
        '2025-10-27T16:30:00Z',
        'unit-test',
        JSON.stringify([{ uri: 'git+https://example.com/repo.git', digest: 'abc123' }]),
        JSON.stringify([{ uri: sampleManifest.urn, digest: manifestDigest }]),
      ],
    );

    await db.close();

    // Run backup script
    await runNodeScript(
      'scripts/registry/backup.mjs',
      ['--db', dbPath, '--out', backupDir, '--tag', 'jest'],
      REPO_ROOT,
    );

    const backupFiles = await readdir(backupDir);
    const archiveName = backupFiles.find((file) => file.endsWith('.tar.gz'));
    expect(archiveName).toBeDefined();
    const archivePath = path.join(backupDir, archiveName);

    // Verify metadata inside archive mentions provenance count
    const { stdout: metadataRaw } = await execFileAsync('tar', ['-xOf', archivePath, 'metadata.json'], {
      cwd: REPO_ROOT,
    });
    const metadata = JSON.parse(metadataRaw.toString('utf8'));
    expect(metadata.provenance_records).toBe(1);

    // Remove original database to ensure restore recreates it
    await rm(dbPath, { force: true });

    // Run restore script
    await runNodeScript(
      'scripts/registry/restore.mjs',
      ['--archive', archivePath, '--db', path.join(restoreDir, 'registry.sqlite'), '--log', provenanceLogPath, '--force'],
      REPO_ROOT,
    );

    // Validate restored database contents
    const restoredDb = await open({
      filename: path.join(restoreDir, 'registry.sqlite'),
      driver: sqlite3.Database,
      mode: sqlite3.OPEN_READONLY,
    });
    const manifestRow = await restoredDb.get('SELECT urn, body, digest, issuer FROM manifests');
    expect(manifestRow).toMatchObject({
      urn: sampleManifest.urn,
      body: sampleManifest.body,
      digest: manifestDigest,
      issuer: 'acme:test',
    });

    const provenanceRow = await restoredDb.get(
      'SELECT urn, envelope, payload_type AS payloadType, issuer FROM provenance',
    );
    expect(provenanceRow).toMatchObject({
      urn: sampleManifest.urn,
      envelope: provenanceEnvelope,
      payloadType: 'application/vnd.in-toto+json',
      issuer: 'builder:example',
    });
    await restoredDb.close();

    // Provenance log should exist and contain exported record
    await access(provenanceLogPath);
    const logContents = await readFile(provenanceLogPath, 'utf8');
    const [logLine] = logContents.trim().split('\n');
    const parsedLog = JSON.parse(logLine);
    expect(parsedLog).toMatchObject({
      urn: sampleManifest.urn,
      digest: manifestDigest,
      issuer: 'builder:example',
    });
  });
});
