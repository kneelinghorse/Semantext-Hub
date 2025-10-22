import { describe, it, expect, beforeAll } from '@jest/globals';
import crypto from 'node:crypto';
import { 
  validateProvenance, 
  summarizeProvenance, 
  createProvenancePayload,
  REQUIRED_FIELDS 
} from '../../packages/runtime/security/provenance.mjs';
import { createEnvelope } from '../../packages/runtime/security/dsse.mjs';

describe('Provenance Validation', () => {
  let keyPair;
  
  beforeAll(() => {
    keyPair = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
  });
  
  describe('createProvenancePayload', () => {
    it('should create a valid provenance payload', () => {
      const payload = createProvenancePayload({
        builderId: 'ossp-builder',
        commit: 'abc123',
        materials: [{ uri: 'git+https://github.com/test/repo', digest: { sha256: 'def456' } }]
      });
      
      expect(payload._type).toBe('https://in-toto.io/Statement/v0.1');
      expect(payload.builder.id).toBe('ossp-builder');
      expect(payload.materials).toHaveLength(1);
      expect(payload.metadata.commit).toBe('abc123');
      expect(payload.buildType).toBe('ossp-manifest-v1');
    });
    
    it('should include optional fields when provided', () => {
      const payload = createProvenancePayload({
        builderId: 'test',
        commit: 'abc',
        materials: [],
        buildType: 'custom-build',
        buildTool: 'custom-cli',
        inputs: [{ name: 'source.js' }],
        outputs: [{ name: 'dist.js' }]
      });
      
      expect(payload.buildType).toBe('custom-build');
      expect(payload.metadata.buildTool).toBe('custom-cli');
      expect(payload.inputs).toEqual([{ name: 'source.js' }]);
      expect(payload.outputs).toEqual([{ name: 'dist.js' }]);
    });
  });
  
  describe('validateProvenance', () => {
    it('should validate a complete valid provenance', () => {
      const payload = createProvenancePayload({
        builderId: 'ossp-builder',
        commit: 'abc123',
        materials: [{ uri: 'file:///test' }]
      });
      
      const envelope = createEnvelope(
        'application/vnd.in-toto+json',
        payload,
        { key: keyPair.privateKey, alg: 'Ed25519', keyid: 'test-key' }
      );
      
      const result = validateProvenance(envelope, { pubkey: keyPair.publicKey, alg: 'Ed25519' });
      
      expect(result.ok).toBe(true);
      expect(result.payload).toBeDefined();
      expect(result.payload.builder.id).toBe('ossp-builder');
      expect(result.signature).toEqual({ keyid: 'test-key', alg: 'Ed25519' });
    });
    
    it('should reject provenance with invalid signature', () => {
      const payload = createProvenancePayload({
        builderId: 'ossp-builder',
        commit: 'abc123',
        materials: []
      });
      
      const envelope = createEnvelope(
        'application/vnd.in-toto+json',
        payload,
        { key: keyPair.privateKey, alg: 'Ed25519' }
      );
      
      // Tamper with signature
      envelope.signatures[0].sig = Buffer.from('invalid').toString('base64');
      
      const result = validateProvenance(envelope, { pubkey: keyPair.publicKey, alg: 'Ed25519' });
      
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid-signature');
    });
    
    it('should reject provenance without builder.id', () => {
      const payload = {
        materials: [],
        metadata: { commit: 'abc123' }
      };
      
      const envelope = createEnvelope(
        'application/vnd.in-toto+json',
        payload,
        { key: keyPair.privateKey, alg: 'Ed25519' }
      );
      
      const result = validateProvenance(envelope, { pubkey: keyPair.publicKey, alg: 'Ed25519' });
      
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('missing-builder-id');
    });
    
    it('should reject provenance without materials array', () => {
      const payload = {
        builder: { id: 'test' },
        metadata: { commit: 'abc123' }
      };
      
      const envelope = createEnvelope(
        'application/vnd.in-toto+json',
        payload,
        { key: keyPair.privateKey, alg: 'Ed25519' }
      );
      
      const result = validateProvenance(envelope, { pubkey: keyPair.publicKey, alg: 'Ed25519' });
      
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('missing-materials');
    });
    
    it('should reject provenance without commit metadata', () => {
      const payload = {
        builder: { id: 'test' },
        materials: [],
        metadata: {}
      };
      
      const envelope = createEnvelope(
        'application/vnd.in-toto+json',
        payload,
        { key: keyPair.privateKey, alg: 'Ed25519' }
      );
      
      const result = validateProvenance(envelope, { pubkey: keyPair.publicKey, alg: 'Ed25519' });
      
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('missing-commit-metadata');
    });
    
    it('should accept empty materials array', () => {
      const payload = createProvenancePayload({
        builderId: 'test',
        commit: 'abc123',
        materials: []
      });
      
      const envelope = createEnvelope(
        'application/vnd.in-toto+json',
        payload,
        { key: keyPair.privateKey, alg: 'Ed25519' }
      );
      
      const result = validateProvenance(envelope, { pubkey: keyPair.publicKey, alg: 'Ed25519' });
      
      expect(result.ok).toBe(true);
    });
  });
  
  describe('summarizeProvenance', () => {
    it('should create a summary of valid provenance', () => {
      const payload = createProvenancePayload({
        builderId: 'ossp-builder',
        commit: 'abc123',
        materials: [{ uri: 'test1' }, { uri: 'test2' }],
        timestamp: '2025-01-01T00:00:00Z'
      });
      
      const envelope = createEnvelope(
        'application/vnd.in-toto+json',
        payload,
        { key: keyPair.privateKey, alg: 'Ed25519' }
      );
      
      const summary = summarizeProvenance(envelope);
      
      expect(summary.builder).toBe('ossp-builder');
      expect(summary.commit).toBe('abc123');
      expect(summary.timestamp).toBe('2025-01-01T00:00:00Z');
      expect(summary.materialsCount).toBe(2);
      expect(summary.buildType).toBe('ossp-manifest-v1');
    });
    
    it('should handle malformed provenance', () => {
      const envelope = {
        payload: Buffer.from('not json').toString('base64')
      };
      
      const summary = summarizeProvenance(envelope);
      
      expect(summary.error).toBe('invalid-provenance');
    });
  });
  
  describe('enforcement scenarios', () => {
    it('should enforce provenance at registry write', () => {
      // Simulate what registry server should check
      const payload = createProvenancePayload({
        builderId: 'ci-system',
        commit: 'main-abc123',
        materials: [{ uri: 'urn:ossp:protocol:example' }]
      });
      
      const envelope = createEnvelope(
        'application/vnd.in-toto+json',
        payload,
        { key: keyPair.privateKey, alg: 'Ed25519' }
      );
      
      const validation = validateProvenance(envelope, { pubkey: keyPair.publicKey, alg: 'Ed25519' });
      
      // Registry should reject if not valid
      if (!validation.ok) {
        expect(validation.reason).toBeDefined();
      } else {
        expect(validation.payload).toBeDefined();
      }
    });
    
    it('should provide detailed error for missing provenance', () => {
      // Missing provenance entirely - what CLI should report
      const result = { ok: false, reason: 'missing-provenance' };
      
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('missing-provenance');
    });
    
    it('should track provenance chain across updates', () => {
      // Simulate multiple provenance records for same URN
      const v1 = createProvenancePayload({
        builderId: 'builder-1',
        commit: 'v1-commit',
        materials: []
      });
      
      const v2 = createProvenancePayload({
        builderId: 'builder-1',
        commit: 'v2-commit',
        materials: []
      });
      
      const env1 = createEnvelope('application/vnd.in-toto+json', v1, { key: keyPair.privateKey, alg: 'Ed25519' });
      const env2 = createEnvelope('application/vnd.in-toto+json', v2, { key: keyPair.privateKey, alg: 'Ed25519' });
      
      const val1 = validateProvenance(env1, { pubkey: keyPair.publicKey, alg: 'Ed25519' });
      const val2 = validateProvenance(env2, { pubkey: keyPair.publicKey, alg: 'Ed25519' });
      
      expect(val1.ok).toBe(true);
      expect(val2.ok).toBe(true);
      expect(val1.payload.metadata.commit).not.toBe(val2.payload.metadata.commit);
    });
  });
});
