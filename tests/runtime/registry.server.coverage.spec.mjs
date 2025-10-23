import { afterEach, describe, expect, it } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createServer } from '../../packages/runtime/registry/server.mjs';

const cleanupDirs = [];

afterEach(async () => {
  while (cleanupDirs.length > 0) {
    const dir = cleanupDirs.pop();
    // eslint-disable-next-line no-await-in-loop
    await rm(dir, { recursive: true, force: true });
  }
});

async function createTempDbPath(prefix = 'registry-coverage-') {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  cleanupDirs.push(dir);
  return path.join(dir, 'registry.sqlite');
}

describe('Registry server configuration edge cases', () => {
  it('falls back to defaults when rate limit config file is missing', async () => {
    const dbPath = await createTempDbPath();
    const app = await createServer({
      apiKey: 'coverage-key',
      dbPath,
      rateLimitConfigPath: '/path/that/does/not/exist.json',
      requireProvenance: false,
      provenanceKeys: [],
      provenanceKeyPath: '/path/that/does/not/exist.pem',
    });

    try {
      const rateLimitConfig = app.get('rateLimitConfigRaw');
      expect(rateLimitConfig).toEqual({});
      const verifier = app.get('provenanceVerifier');
      expect(Array.isArray(verifier)).toBe(true);
      expect(verifier.length).toBe(0);
    } finally {
      const db = app.get('db');
      if (db) {
        await db.close();
      }
    }
  });

  it('merges custom pragmas into registry configuration', async () => {
    const dbPath = await createTempDbPath();
    const app = await createServer({
      apiKey: 'coverage-key',
      dbPath,
      requireProvenance: false,
      provenanceKeys: [],
      pragmas: { synchronous: 'OFF' },
    });

    try {
      const registryConfig = app.get('registryConfig');
      expect(registryConfig.pragmas.synchronous).toBe('OFF');
    } finally {
      const db = app.get('db');
      if (db) {
        await db.close();
      }
    }
  });

  it('throws when provenance verifier entries are missing pubkey', async () => {
    const dbPath = await createTempDbPath();
    await expect(
      createServer({
        apiKey: 'coverage-key',
        dbPath,
        requireProvenance: false,
        provenanceKeys: [{}],
      }),
    ).rejects.toThrow('Provenance verifier entry requires a `pubkey`.');
  });

  it('throws when provenance enforcement enabled without any keys', async () => {
    const dbPath = await createTempDbPath();
    await expect(
      createServer({
        apiKey: 'coverage-key',
        dbPath,
        requireProvenance: true,
        provenanceKeys: [],
        provenanceKeyPath: '/path/that/does/not/exist.pem',
      }),
    ).rejects.toThrow(/Failed to load provenance verification key/);
  });

  it('fails fast when API key is missing', async () => {
    const dbPath = await createTempDbPath();
    await expect(
      createServer({
        apiKey: '',
        dbPath,
        requireProvenance: false,
        provenanceKeys: [],
      }),
    ).rejects.toThrow('Registry API key must be provided');
  });
});
