import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { signJws } from '../../../app/libs/signing/jws.mjs';
import { createRegistryServer } from '../../../app/services/registry/server.mjs';

export const API_KEY = 'test-secret';
export const KEY_ID = 'test-key';

export const BASE_CARD = {
  id: 'agent.registry.test',
  name: 'Registry Test Agent',
  version: '1.0.0',
  capabilities: { tools: [], resources: [] },
  communication: {
    supported: ['http'],
    endpoints: { default: 'https://agents.example.com/registry-test' },
    transport: {},
  },
  authorization: { delegation_supported: false, signature_algorithm: null },
};

const cleanupFns = [];

export async function createRegistryTestContext(overrides = {}) {
  const { rateLimit: rateLimitOverrides, signaturePolicy, ...serverOverrides } = overrides;
  const workDir = await mkdtemp(join(tmpdir(), 'registry-service-'));
  const storePath = join(workDir, 'store.jsonl');
  const indexPath = join(workDir, 'index.urn.json');
  const capIndexPath = join(workDir, 'index.cap.json');
  const policyPath = join(workDir, 'signature-policy.json');

  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  const policy = signaturePolicy ?? {
    version: 1,
    requireSignature: true,
    keys: [
      {
        keyId: KEY_ID,
        algorithm: 'EdDSA',
        publicKey: publicKeyPem,
      },
    ],
  };
  await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`, 'utf8');

  const baseOptions = {
    apiKey: API_KEY,
    storePath,
    indexPath,
    capIndexPath,
    rateLimit: { windowMs: 60000, max: 5 },
    signaturePolicyPath: policyPath,
  };

  if (rateLimitOverrides) {
    baseOptions.rateLimit = { ...baseOptions.rateLimit, ...rateLimitOverrides };
  }

  const serverOptions = {
    ...baseOptions,
    ...serverOverrides,
  };
  if (!serverOverrides.signaturePolicyPath) {
    serverOptions.signaturePolicyPath = policyPath;
  }

  const serverContext = await createRegistryServer(serverOptions);

  cleanupFns.push(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  return {
    ...serverContext,
    storePath,
    indexPath,
    capIndexPath,
    policyPath,
    signCard: (card) =>
      signJws(card, { privateKey: privateKeyPem, keyId: KEY_ID, algorithm: 'EdDSA' }),
  };
}

export async function cleanupRegistryTestContexts() {
  while (cleanupFns.length > 0) {
    const fn = cleanupFns.pop();
    // eslint-disable-next-line no-await-in-loop
    await fn();
  }
}
