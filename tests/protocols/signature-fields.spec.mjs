import { generateKeyPairSync } from 'node:crypto';

import { signJws, verifyJws } from '../../app/libs/signing/jws.mjs';
import { createAPIProtocol } from '../../packages/protocols/src/api_protocol_v_1_1_1.js';
import { createIntegrationProtocol, createRegistryRecord } from '../../packages/protocols/src/Integration Protocol — v1.1.1.js';

async function importCjsModule(path) {
  const previousModule = globalThis.module;
  const previousExports = globalThis.exports;
  const cjsModule = { exports: {} };
  globalThis.module = cjsModule;
  globalThis.exports = cjsModule.exports;
  try {
    await import(path);
    return cjsModule.exports;
  } finally {
    globalThis.module = previousModule;
    globalThis.exports = previousExports;
  }
}

const eventModule = await importCjsModule('../../packages/protocols/src/event_protocol_v_1_1_1.js');
const dataModule = await importCjsModule('../../packages/protocols/src/data_protocol_v_1_1_1.js');
const releaseModule = await importCjsModule('../../packages/protocols/src/Release:Deployment Protocol — v1.1.1.js');
const docsModule = await importCjsModule('../../packages/protocols/src/Documentation Protocol — v1.1.1.js');

const { createEventProtocol } = eventModule;
const { createDataProtocol } = dataModule;
const { createReleaseProtocol } = releaseModule;
const { createDocsProtocol, renderProvenanceFooter } = docsModule;

const KEY_ID = 'urn:proto:agent:test-signer@1';
const { publicKey, privateKey } = generateKeyPairSync('ed25519');

function signCard(card) {
  return signJws(card, { privateKey, keyId: KEY_ID });
}

describe('protocol signature fields', () => {
  test('API manifest preserves signature envelope', () => {
    const card = { urn: 'urn:proto:api:billing@1.0.0', kind: 'api' };
    const sig = signCard(card);

    const api = createAPIProtocol({
      service: { name: 'billing' },
      interface: { endpoints: [{ method: 'GET', path: '/v1/ping' }] },
      sig,
    });

    expect(api.manifest().sig).toEqual(sig);
    const verification = verifyJws(sig, { publicKey, expectedPayload: card });
    expect(verification.valid).toBe(true);
  });

  test('Event manifest accepts signature envelope', () => {
    const card = { urn: 'urn:proto:event:payment.completed@1.0.0', kind: 'event' };
    const sig = signCard(card);
    const event = createEventProtocol({
      event: { name: 'payment.completed' },
      schema: { format: 'json-schema', payload: {}, fields: [] },
      sig,
    });

    expect(event.manifest().sig).toEqual(sig);
    expect(verifyJws(sig, { publicKey, expectedPayload: card }).valid).toBe(true);
  });

  test('Data manifest accepts signature envelope', () => {
    const card = { urn: 'urn:proto:data:warehouse.dataset@1.0.0', kind: 'data' };
    const sig = signCard(card);
    const data = createDataProtocol({
      dataset: { name: 'warehouse.dataset' },
      schema: { fields: { id: { type: 'string', required: true } } },
      sig,
    });

    expect(data.manifest().sig).toEqual(sig);
    expect(verifyJws(sig, { publicKey, expectedPayload: card }).valid).toBe(true);
  });

  test('Integration registry record captures card and signature', () => {
    const card = { urn: 'urn:proto:integration:sync@1.0.0', kind: 'integration' };
    const sig = signCard(card);
    const manifest = {
      integration: { id: 'sync', name: 'Sync', direction: 'pull', mode: 'batch' },
      source: { kind_urns: { data: 'urn:proto:data:source@1.0.0#dataset' } },
      destination: { kind_urns: { api: 'urn:proto:api:target@1.0.0#/resource' } },
      mapping: { rules: [{ from: 'source.id', to: 'target.id' }] },
      transport: { batch: { schedule: 'daily', expression: '0 0 * * *' } },
      governance: { policy: { classification: 'internal' } },
      relationships: {},
      sig,
    };

    const integration = createIntegrationProtocol(manifest);
    expect(integration.manifest().sig).toEqual(sig);

    const record = createRegistryRecord(manifest, sig);
    expect(record.card).not.toBe(manifest);
    expect(record.card.integration.id).toBe('sync');
    expect(record.sig).toEqual(sig);
    expect(Object.isFrozen(record)).toBe(true);
    expect(verifyJws(sig, { publicKey, expectedPayload: card }).valid).toBe(true);
  });

  test('Release manifest tracks attestation signatures', () => {
    const attestationCard = { urn: 'urn:proto:release:1.0.0', kind: 'release', step: 'qa-approved' };
    const attestation = signCard(attestationCard);
    const release = createReleaseProtocol({
      release: {
        version: '1.0.0',
        lifecycle: { status: 'planned' },
        attestations: [attestation],
      },
      strategy: { type: 'all_at_once' },
      rollback: { mode: 'manual' },
      changeset: [],
      relationships: {},
    });

    const manifest = release.manifest();
    expect(Array.isArray(manifest.release.attestations)).toBe(true);
    expect(manifest.release.attestations[0]).toEqual(attestation);
    expect(verifyJws(attestation, { publicKey, expectedPayload: attestationCard }).valid).toBe(true);
  });

  test('Documentation provenance footer renders signature context', () => {
    const card = { urn: 'urn:proto:docs:guide@1.0.0', kind: 'docs' };
    const sig = signCard(card);
    const docs = createDocsProtocol({
      documentation: { id: 'guide', title: 'Docs' },
      structure: { sections: [{ id: 'intro', title: 'Intro', body: 'Welcome.' }] },
      sig,
    });

    const skeleton = docs.generateDocsSkeleton();
    expect(skeleton).toContain('Signed by');
    const footer = renderProvenanceFooter(sig);
    expect(footer).toContain('digest');
    expect(verifyJws(sig, { publicKey, expectedPayload: card }).valid).toBe(true);
  });
});
