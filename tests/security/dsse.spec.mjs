import { describe, it, expect, beforeAll } from '@jest/globals';
import crypto from 'node:crypto';
import { createEnvelope, verifyEnvelope, parsePayload } from '../../packages/runtime/security/dsse.mjs';

describe('DSSE Envelope', () => {
  let keyPair;
  
  beforeAll(() => {
    // Generate Ed25519 key pair for testing
    keyPair = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
  });
  
  describe('createEnvelope', () => {
    it('should create a valid DSSE envelope with Ed25519', () => {
      const payload = {
        builder: { id: 'test-builder' },
        materials: [{ uri: 'file:///test', digest: { sha256: 'abc123' } }],
        metadata: { commit: 'abc123', timestamp: '2025-01-01T00:00:00Z' }
      };
      
      const envelope = createEnvelope(
        'application/vnd.in-toto+json',
        payload,
        { key: keyPair.privateKey, alg: 'Ed25519', keyid: 'test-key-1' }
      );
      
      expect(envelope).toBeDefined();
      expect(envelope.payloadType).toBe('application/vnd.in-toto+json');
      expect(envelope.payload).toBeDefined();
      expect(envelope.signatures).toHaveLength(1);
      expect(envelope.signatures[0].keyid).toBe('test-key-1');
      expect(envelope.signatures[0].sig).toBeDefined();
      expect(envelope.signatures[0].alg).toBe('Ed25519');
    });
    
    it('should encode payload as base64', () => {
      const payload = { test: 'data' };
      const envelope = createEnvelope(
        'application/json',
        payload,
        { key: keyPair.privateKey, alg: 'Ed25519' }
      );
      
      const decoded = Buffer.from(envelope.payload, 'base64').toString('utf8');
      expect(JSON.parse(decoded)).toEqual(payload);
    });
    
    it('should throw error for unsupported algorithm', () => {
      expect(() => {
        createEnvelope('application/json', {}, { key: keyPair.privateKey, alg: 'RSA' });
      }).toThrow('Unsupported algorithm');
    });
  });
  
  describe('verifyEnvelope', () => {
    it('should verify a valid envelope', () => {
      const payload = {
        builder: { id: 'test-builder' },
        materials: [],
        metadata: { commit: 'abc123' }
      };
      
      const envelope = createEnvelope(
        'application/vnd.in-toto+json',
        payload,
        { key: keyPair.privateKey, alg: 'Ed25519' }
      );
      
      const result = verifyEnvelope(envelope, { pubkey: keyPair.publicKey, alg: 'Ed25519' });
      
      expect(result.ok).toBe(true);
      expect(result.errorReason).toBeNull();
      expect(result.alg).toBe('Ed25519');
      expect(result.keyid).toBe('local');
    });
    
    it('should reject envelope with invalid signature', () => {
      const payload = { test: 'data' };
      const envelope = createEnvelope(
        'application/json',
        payload,
        { key: keyPair.privateKey, alg: 'Ed25519' }
      );
      
      // Tamper with signature
      envelope.signatures[0].sig = Buffer.from('invalid').toString('base64');
      
      const result = verifyEnvelope(envelope, { pubkey: keyPair.publicKey, alg: 'Ed25519' });
      
      expect(result.ok).toBe(false);
      expect(result.errorReason).toBe('invalid-signature');
    });
    
    it('should reject envelope with tampered payload', () => {
      const payload = { test: 'data' };
      const envelope = createEnvelope(
        'application/json',
        payload,
        { key: keyPair.privateKey, alg: 'Ed25519' }
      );
      
      // Tamper with payload
      envelope.payload = Buffer.from(JSON.stringify({ test: 'tampered' })).toString('base64');
      
      const result = verifyEnvelope(envelope, { pubkey: keyPair.publicKey, alg: 'Ed25519' });
      
      expect(result.ok).toBe(false);
      expect(result.errorReason).toBe('invalid-signature');
    });
    
    it('should reject malformed envelope', () => {
      const result = verifyEnvelope({}, { pubkey: keyPair.publicKey, alg: 'Ed25519' });
      
      expect(result.ok).toBe(false);
      expect(result.errorReason).toBe('malformed-envelope');
    });
    
    it('should reject envelope with wrong key', () => {
      const otherKeyPair = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
      
      const payload = { test: 'data' };
      const envelope = createEnvelope(
        'application/json',
        payload,
        { key: keyPair.privateKey, alg: 'Ed25519' }
      );
      
      const result = verifyEnvelope(envelope, { pubkey: otherKeyPair.publicKey, alg: 'Ed25519' });
      
      expect(result.ok).toBe(false);
      expect(result.errorReason).toBe('invalid-signature');
    });
  });
  
  describe('parsePayload', () => {
    it('should parse payload from envelope', () => {
      const payload = { test: 'data', number: 42 };
      const envelope = createEnvelope(
        'application/json',
        payload,
        { key: keyPair.privateKey, alg: 'Ed25519' }
      );
      
      const parsed = parsePayload(envelope);
      expect(parsed).toEqual(payload);
    });
  });
  
  describe('ES256 support', () => {
    let ecKeyPair;
    
    beforeAll(() => {
      // Generate EC key pair for ES256
      ecKeyPair = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
    });
    
    it('should create and verify envelope with ES256', () => {
      const payload = { test: 'data' };
      const envelope = createEnvelope(
        'application/json',
        payload,
        { key: ecKeyPair.privateKey, alg: 'ES256', keyid: 'ec-key' }
      );
      
      const result = verifyEnvelope(envelope, { pubkey: ecKeyPair.publicKey, alg: 'ES256' });
      
      expect(result.ok).toBe(true);
      expect(result.errorReason).toBeNull();
      expect(result.alg).toBe('ES256');
      expect(result.keyid).toBe('ec-key');
    });
  });
});
