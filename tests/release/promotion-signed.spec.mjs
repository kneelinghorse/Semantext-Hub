import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { run } from '../../app/cli/release-promote.mjs';
import { signJws } from '../../app/libs/signing/jws.mjs';

function computeDigest(content) {
  return createHash('sha256').update(typeof content === 'string' ? content : Buffer.from(content)).digest('base64url');
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

describe('release promotion CLI', () => {
  const KEY_ID = 'urn:proto:agent:release-signer@1';
  let tempDir;
  let artifactsDir;
  let manifestPath;
  let publicKeyPath;
  let privateKey;
  let sessionId;
  let nowIso;
  let logSpy;
  let errorSpy;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'release-promote-'));
    artifactsDir = path.join(tempDir, 'artifacts');
    await mkdir(artifactsDir, { recursive: true });
    manifestPath = path.join(tempDir, 'manifest.json');
    publicKeyPath = path.join(tempDir, 'signing.pub');

    const keyPair = generateKeyPairSync('ed25519');
    privateKey = keyPair.privateKey;
    const publicKeyPem = keyPair.publicKey.export({ format: 'pem', type: 'spki' });
    await writeFile(publicKeyPath, publicKeyPem, 'utf8');

    const baseManifest = {
      release: {
        version: '1.2.3',
        lifecycle: { status: 'canary_passed' },
      },
      strategy: { type: 'all_at_once' },
      rollback: { mode: 'manual' },
      changeset: [],
      relationships: {},
    };
    await writeJson(manifestPath, baseManifest);

    sessionId = 'session-promote-123';
    nowIso = '2025-10-16T22:00:00Z';

    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    await rm(tempDir, { recursive: true, force: true });
  });

  async function seedArtifact(fileName, content) {
    const artifactPath = path.join(artifactsDir, fileName);
    await writeFile(artifactPath, content, typeof content === 'string' ? 'utf8' : undefined);
    const digest = computeDigest(content);
    const payload = {
      artifact: fileName,
      path: fileName,
      sessionId,
      sha256: digest,
      signedAt: nowIso,
    };
    const envelope = signJws(payload, {
      privateKey,
      keyId: KEY_ID,
    });
    const signaturePath = `${artifactPath}.sig.json`;
    await writeJson(signaturePath, envelope);
    return { artifactPath, signaturePath, digest, envelope };
  }

  it('verifies signed artifacts and records attestations', async () => {
    const report = await seedArtifact('report.json', JSON.stringify({ ok: true }, null, 2));
    const diagram = await seedArtifact('diagram.drawio', '<diagram />');

    const exitCode = await run([
      '--manifest',
      manifestPath,
      '--artifact-root',
      artifactsDir,
      '--public-key',
      publicKeyPath,
      '--allowed-algs',
      'EdDSA',
      '--required-fields',
      'artifact,sha256,sessionId,signedAt',
    ]);

    expect(exitCode).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
    const [summary] = logSpy.mock.calls[0];
    expect(summary).toContain('Promotion verification:');
    expect(summary).toContain('report.json=ok');
    expect(summary).toContain('diagram.drawio=ok');

    const manifestRaw = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);
    expect(manifest.promotion?.status).toBe('verified');
    expect(manifest.promotion?.signers).toEqual([KEY_ID]);
    expect(manifest.promotion?.sessionIds).toEqual([sessionId]);
    expect(manifest.promotion?.artifacts).toEqual([
      {
        name: 'report.json',
        sha256: report.digest,
        keyId: KEY_ID,
        algorithm: 'EdDSA',
      },
      {
        name: 'diagram.drawio',
        sha256: diagram.digest,
        keyId: KEY_ID,
        algorithm: 'EdDSA',
      },
    ]);
    expect(manifest.promotion?.attestations).toHaveLength(2);
    expect(manifest.promotion?.attestations?.[0]?.spec).toBe('identity-access.signing.v1');
  });

  it('fails when signature payload and artifact digest diverge', async () => {
    await seedArtifact('report.json', JSON.stringify({ ok: true }, null, 2));
    const diagram = await seedArtifact('diagram.drawio', '<diagram />');

    await writeFile(diagram.artifactPath, '<diagram tampered />', 'utf8');

    const exitCode = await run([
      '--manifest',
      manifestPath,
      '--artifact-root',
      artifactsDir,
      '--public-key',
      publicKeyPath,
    ]);

    expect(exitCode).toBe(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    const errorLines = errorSpy.mock.calls.flat().join('\n');
    expect(errorLines).toContain('diagram.drawio');
    expect(errorLines).toContain('Digest mismatch');

    const manifestRaw = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);
    expect(manifest.promotion).toBeUndefined();
  });
});
