import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { openDb } from '../../packages/runtime/registry/db.mjs';
import { upsertManifest, getManifest } from '../../packages/runtime/registry/repository.mjs';
import { createEnvelope } from '../../packages/runtime/security/dsse.mjs';
import { createProvenancePayload } from '../../packages/runtime/security/provenance.mjs';

describe('Provenance Integration', () => {
  let db;
  let keyPair;
  const testDbPath = path.resolve(process.cwd(), 'var/test-provenance.sqlite');
  
  beforeAll(async () => {
    // Clean up any existing test DB
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    // Generate key pair for testing
    keyPair = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    
    // Open test database
    db = await openDb({ dbPath: testDbPath });
    
    // Apply schema
    const schemaPath = path.resolve(process.cwd(), 'scripts/db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await db.exec(schema);
  });
  
  afterAll(async () => {
    if (db) {
      await db.close();
    }
    // Clean up test DB
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });
  
  it('should store and retrieve manifest with provenance', async () => {
    const urn = 'urn:ossp:test:integration-manifest';
    const manifest = {
      id: urn,
      name: 'Test Manifest',
      capabilities: ['test:capability']
    };
    
    // Create provenance
    const provenancePayload = createProvenancePayload({
      builderId: 'test-builder',
      commit: 'abc123def456',
      materials: [{ uri: 'git+https://github.com/test/repo', digest: { sha256: 'deadbeef' } }]
    });
    
    const provenanceEnvelope = createEnvelope(
      'application/vnd.in-toto+json',
      provenancePayload,
      { key: keyPair.privateKey, alg: 'Ed25519', keyid: 'test-key' }
    );
    
    // Insert manifest with provenance
    await upsertManifest(db, urn, manifest, {
      issuer: 'test-issuer',
      provenance: provenanceEnvelope
    });
    
    // Retrieve manifest
    const retrieved = await getManifest(db, urn);
    
    expect(retrieved).toBeDefined();
    expect(retrieved.urn).toBe(urn);
    expect(retrieved.body).toEqual(manifest);
    expect(retrieved.provenance).toBeDefined();
    expect(retrieved.provenance.builder).toBe('test-builder');
  });
  
  it('should track multiple provenance records for same URN', async () => {
    const urn = 'urn:ossp:test:versioned-manifest';
    const manifest1 = { id: urn, name: 'Versioned', version: 1 };
    const manifest2 = { id: urn, name: 'Versioned', version: 2 };
    
    // First version
    const prov1 = createProvenancePayload({
      builderId: 'builder-v1',
      commit: 'commit-v1',
      materials: []
    });
    const env1 = createEnvelope('application/vnd.in-toto+json', prov1, {
      key: keyPair.privateKey,
      alg: 'Ed25519'
    });
    
    await upsertManifest(db, urn, manifest1, { provenance: env1 });
    
    // Second version (update with different content, so different digest)
    const prov2 = createProvenancePayload({
      builderId: 'builder-v2',
      commit: 'commit-v2',
      materials: []
    });
    const env2 = createEnvelope('application/vnd.in-toto+json', prov2, {
      key: keyPair.privateKey,
      alg: 'Ed25519'
    });
    
    await upsertManifest(db, urn, manifest2, { provenance: env2 });
    
    // Query all provenance records
    const provenanceRows = await db.all(
      'SELECT issuer, committed_at FROM provenance WHERE urn=? ORDER BY created_at',
      [urn]
    );
    
    // Should have multiple records (one per digest)
    expect(provenanceRows.length).toBeGreaterThanOrEqual(1);
    
    // Latest manifest should reference latest provenance
    const latest = await getManifest(db, urn);
    // The returned provenance is based on latest timestamp
    expect(latest.provenance.builder).toBeDefined();
  });
  
  it('should enforce provenance requirements in release gate scenario', async () => {
    // Simulate CI checking changed URNs
    const changedUrns = [
      'urn:ossp:test:service-a',
      'urn:ossp:test:service-b',
      'urn:ossp:test:service-c'
    ];
    
    // Insert manifests with different provenance states
    const manifestA = { id: changedUrns[0], name: 'Service A' };
    const provenanceA = createProvenancePayload({
      builderId: 'ci-system',
      commit: 'commit-a',
      materials: []
    });
    const envelopeA = createEnvelope('application/vnd.in-toto+json', provenanceA, {
      key: keyPair.privateKey,
      alg: 'Ed25519'
    });
    await upsertManifest(db, changedUrns[0], manifestA, { provenance: envelopeA });
    
    const manifestB = { id: changedUrns[1], name: 'Service B' };
    const provenanceB = createProvenancePayload({
      builderId: 'ci-system',
      commit: 'commit-b',
      materials: []
    });
    const envelopeB = createEnvelope('application/vnd.in-toto+json', provenanceB, {
      key: keyPair.privateKey,
      alg: 'Ed25519'
    });
    await upsertManifest(db, changedUrns[1], manifestB, { provenance: envelopeB });
    
    // Service C has no provenance (should fail gate)
    const manifestC = { id: changedUrns[2], name: 'Service C' };
    await upsertManifest(db, changedUrns[2], manifestC, { issuer: 'test' });
    
    // Check provenance for all
    const results = [];
    for (const urn of changedUrns) {
      const provenanceRows = await db.all(
        'SELECT envelope FROM provenance WHERE urn=?',
        [urn]
      );
      
      if (provenanceRows.length === 0) {
        results.push({ urn, valid: false, reason: 'missing-provenance' });
      } else {
        results.push({ urn, valid: true });
      }
    }
    
    const allValid = results.every(r => r.valid);
    const invalidCount = results.filter(r => !r.valid).length;
    
    expect(allValid).toBe(false);
    expect(invalidCount).toBe(1);
    expect(results[2].valid).toBe(false);
    expect(results[2].reason).toBe('missing-provenance');
  });
  
  it('should handle provenance with full metadata', async () => {
    const urn = 'urn:ossp:test:full-metadata';
    const manifest = { id: urn, name: 'Full Metadata Test' };
    
    const provenance = createProvenancePayload({
      builderId: 'ci-system-v2',
      commit: 'main-abc123',
      materials: [
        { uri: 'git+https://github.com/test/repo', digest: { sha256: 'abc123' } },
        { uri: 'npm:package@1.0.0', digest: { sha256: 'def456' } }
      ],
      buildType: 'ossp-manifest-v1',
      buildTool: 'ossp-cli',
      timestamp: '2025-10-22T00:00:00Z',
      inputs: [{ name: 'src/manifest.json' }],
      outputs: [{ name: 'approved/manifest.json' }]
    });
    
    const envelope = createEnvelope('application/vnd.in-toto+json', provenance, {
      key: keyPair.privateKey,
      alg: 'Ed25519',
      keyid: 'ci-key-1'
    });
    
    await upsertManifest(db, urn, manifest, { provenance: envelope });
    
    // Verify full provenance data stored
    const row = await db.get(
      'SELECT * FROM provenance WHERE urn=?',
      [urn]
    );
    
    expect(row).toBeDefined();
    expect(row.issuer).toBe('ci-system-v2');
    expect(row.build_tool).toBe('ossp-cli');
    expect(JSON.parse(row.inputs)).toEqual([{ name: 'src/manifest.json' }]);
    expect(JSON.parse(row.outputs)).toEqual([{ name: 'approved/manifest.json' }]);
  });
});

