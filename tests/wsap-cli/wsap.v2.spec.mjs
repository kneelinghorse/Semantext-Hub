import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

import { runWsap } from '../../app/cli/wsap.mjs';
import { verifyJws } from '../../app/libs/signing/jws.mjs';

describe('wsap v2 multi-agent orchestration', () => {
  let tempRoot;

  beforeAll(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), 'wsap-v2-'));
  });

  afterAll(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  test('registers signed agents, executes A2A, and emits signed artifacts', async () => {
    const result = await runWsap({
      artifactRoot: tempRoot,
      open: false,
    });

    // eslint-disable-next-line no-console
    expect(result.success).toBe(true);

    const registry = result.multiAgent?.registry;
    expect(registry).toBeDefined();
    expect(registry.agents?.length ?? 0).toBeGreaterThanOrEqual(3);
    for (const agent of registry.agents) {
      expect(agent.verification?.status).toBe('verified');
    }

    const a2aCalls = result.multiAgent?.a2a ?? [];
    // Expect at least one URN and capability call per agent
    expect(a2aCalls.length).toBeGreaterThanOrEqual((registry.agents?.length ?? 0) * 2);
    for (const call of a2aCalls) {
      expect(call.durationMs).not.toBeNull();
      expect(call.correlationId).toBeTruthy();
    }

    const reportPath = result.artifacts.reportJson;
    expect(reportPath).toBeTruthy();
    await expect(stat(reportPath)).resolves.toBeDefined();
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    expect(report.registry?.agents?.length).toBe(registry.agents.length);
    expect(report.a2a?.length).toBe(a2aCalls.length);

    const publicKeyPath = result.artifacts.signingPublicKey;
    expect(publicKeyPath).toBeTruthy();
    const publicKey = await readFile(publicKeyPath, 'utf8');

    const verifySignature = async (artifactPath, signaturePath, expectedArtifactLabel) => {
      expect(signaturePath).toBeTruthy();
      await expect(stat(signaturePath)).resolves.toBeDefined();

      const envelope = JSON.parse(await readFile(signaturePath, 'utf8'));
      const verification = verifyJws(envelope, { publicKey });
      expect(verification.valid).toBe(true);

      const descriptor = verification.payload;
      expect(descriptor.artifact).toBe(expectedArtifactLabel);
      expect(descriptor.sessionId).toBe(result.sessionId);

      const artifactBuffer = await readFile(artifactPath);
      const digest = createHash('sha256').update(artifactBuffer).digest('base64url');
      expect(descriptor.sha256).toBe(digest);
    };

    await verifySignature(reportPath, result.artifacts.reportSignature, 'report.json');

    const diagramPath = result.artifacts.drawioDiagram;
    expect(diagramPath).toBeTruthy();
    await expect(stat(diagramPath)).resolves.toBeDefined();
    await verifySignature(diagramPath, result.artifacts.diagramSignature, 'diagram.drawio');
  });
});
