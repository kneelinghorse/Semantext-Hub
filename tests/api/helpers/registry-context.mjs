import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { signJws } from '../../../app/libs/signing/jws.mjs';
import { createEnvelope } from '../../../packages/runtime/security/dsse.mjs';
import { createProvenancePayload } from '../../../packages/runtime/security/provenance.mjs';
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
const PRIV_KEY_PATH = new URL('../../../fixtures/keys/priv.pem', import.meta.url);
const PUB_KEY_PATH = new URL('../../../fixtures/keys/pub.pem', import.meta.url);

export async function createRegistryTestContext(overrides = {}) {
  const {
    rateLimit: rateLimitOverrides,
    signaturePolicy,
    preloadStoreRecords = [],
    ...serverOverrides
  } = overrides;
  const workDir = await mkdtemp(join(tmpdir(), 'registry-service-'));
  const storePath = join(workDir, 'store.jsonl');
  const indexPath = join(workDir, 'index.urn.json');
  const capIndexPath = join(workDir, 'index.cap.json');
  const policyPath = join(workDir, 'signature-policy.json');

  const [publicKeyPem, privateKeyPem] = await Promise.all([
    readFile(PUB_KEY_PATH, 'utf8'),
    readFile(PRIV_KEY_PATH, 'utf8'),
  ]);

  const issuerEntry = {
    keyId: KEY_ID,
    algorithm: 'EdDSA',
    publicKey: publicKeyPem,
  };

  const policy = signaturePolicy ?? {
    version: 2,
    mode: 'enforce',
    requireSignature: true,
    allowedIssuers: [issuerEntry],
    keys: [issuerEntry],
  };
  await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`, 'utf8');

  if (preloadStoreRecords.length > 0) {
    const lines = preloadStoreRecords.map((entry) =>
      typeof entry === 'string' ? entry : JSON.stringify(entry)
    );
    await writeFile(storePath, `${lines.join('\n')}\n`, 'utf8');
  }

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

  const createProvenance = ({
    builderId = 'registry.test.builder',
    commit = `commit-${Date.now()}`,
    materials = [],
    buildTool = 'registry-test-suite',
    timestamp = new Date().toISOString(),
    inputs = [],
    outputs = [],
  } = {}) => {
    const payload = createProvenancePayload({
      builderId,
      commit,
      materials,
      buildTool,
      timestamp,
      inputs,
      outputs,
    });
    return createEnvelope('application/vnd.in-toto+json', payload, {
      key: privateKeyPem,
      alg: 'Ed25519',
      keyid: KEY_ID,
    });
  };

  return {
    ...serverContext,
    storePath,
    indexPath,
    capIndexPath,
    policyPath,
    publicKeyPem,
    privateKeyPem,
    signCard: (card) =>
      signJws(card, { privateKey: privateKeyPem, keyId: KEY_ID, algorithm: 'EdDSA' }),
    createProvenance,
  };
}

export async function cleanupRegistryTestContexts() {
  while (cleanupFns.length > 0) {
    const fn = cleanupFns.pop();
    // eslint-disable-next-line no-await-in-loop
    await fn();
  }
}
