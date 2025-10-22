/**
 * Security Enforcement Tests - Sprint 19.3
 * Verifies signature and delegation enforcement with auditable denials
 */

import { describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import path from 'path';
import fs from 'fs';
import { generateKeyPairSync } from 'crypto';
import { signJws } from '../../app/libs/signing/jws.mjs';

let verifySignature, isSignatureRequired, getAllowedKeyIds;
let authorize;

const TEST_POLICY_DIR = path.resolve(process.cwd(), 'tests/security/_tmp');
const SIGNATURE_POLICY_PATH = path.join(TEST_POLICY_DIR, 'signature-policy.json');
const DELEGATION_POLICY_PATH = path.join(TEST_POLICY_DIR, 'delegation-policy.json');
const SIGNATURE_AUDIT_PATH = path.join(TEST_POLICY_DIR, 'signature-audit.jsonl');
const DELEGATION_AUDIT_PATH = path.join(TEST_POLICY_DIR, 'delegation-audit.jsonl');

// Generate test keys
const testKeyPair = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const unauthorizedKeyPair = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

describe('Signature Enforcement (enforce mode)', () => {
  beforeAll(async () => {
    // Setup test policies
    fs.mkdirSync(TEST_POLICY_DIR, { recursive: true });
    
    // Create enforce-mode signature policy
    const signaturePolicy = {
      version: 2,
      mode: 'enforce',
      requireSignature: true,
      exemptions: ['seeds/**', 'tests/**'],
      allowedIssuers: [
        {
          keyId: 'test-key-v1',
          publicKey: testKeyPair.publicKey,
          comment: 'Test signing key'
        }
      ],
      algorithms: ['EdDSA', 'ES256'],
      validation: {
        checkExpiration: true,
        maxAgeDays: 90
      }
    };
    fs.writeFileSync(SIGNATURE_POLICY_PATH, JSON.stringify(signaturePolicy, null, 2));
    
    // Set environment variables
    process.env.SIGNATURE_POLICY_PATH = SIGNATURE_POLICY_PATH;
    process.env.SIGNATURE_AUDIT_LOG = SIGNATURE_AUDIT_PATH;
    
    // Dynamic import after env is set
    const sigModule = await import('../../packages/runtime/security/signature.mjs');
    verifySignature = sigModule.verifySignature;
    isSignatureRequired = sigModule.isSignatureRequired;
    getAllowedKeyIds = sigModule.getAllowedKeyIds;
  });

  afterEach(() => {
    // Clean audit logs between tests
    try { fs.unlinkSync(SIGNATURE_AUDIT_PATH); } catch {}
  });

  it('denies unsigned manifest write with reason="unsigned"', async () => {
    const result = await verifySignature(null, {
      resourcePath: 'protocols/user-api.json',
      operation: 'write'
    });
    
    expect(result.ok).toBe(false);
    expect(result.errorReason).toBe('unsigned');
    
    // Verify audit trail
    const audit = fs.readFileSync(SIGNATURE_AUDIT_PATH, 'utf-8').trim().split('\n');
    const entry = JSON.parse(audit[audit.length - 1]);
    expect(entry.result).toBe('denied');
    expect(entry.reason).toBe('unsigned');
    expect(entry.resource).toBe('protocols/user-api.json');
  });

  it('denies manifest with invalid signature', async () => {
    const payload = { apiVersion: 'v1', kind: 'Protocol' };
    const envelope = signJws(payload, {
      privateKey: unauthorizedKeyPair.privateKey,
      keyId: 'unknown-key',
      algorithm: 'EdDSA'
    });
    
    const result = await verifySignature(envelope, {
      resourcePath: 'protocols/user-api.json',
      operation: 'write'
    });
    
    expect(result.ok).toBe(false);
    expect(result.errorReason).toBe('unknown_issuer');
    
    // Verify audit
    const audit = fs.readFileSync(SIGNATURE_AUDIT_PATH, 'utf-8').trim().split('\n');
    const entry = JSON.parse(audit[audit.length - 1]);
    expect(entry.result).toBe('denied');
    expect(entry.keyId).toBe('unknown-key');
  });

  it('allows manifest with valid signature from allowed issuer', async () => {
    const payload = { apiVersion: 'v1', kind: 'Protocol', metadata: { name: 'test' } };
    const envelope = signJws(payload, {
      privateKey: testKeyPair.privateKey,
      keyId: 'test-key-v1',
      algorithm: 'EdDSA'
    });
    
    const result = await verifySignature(envelope, {
      resourcePath: 'protocols/user-api.json',
      operation: 'write'
    });
    
    expect(result.ok).toBe(true);
    expect(result.details.keyId).toBe('test-key-v1');
    
    // Verify audit
    const audit = fs.readFileSync(SIGNATURE_AUDIT_PATH, 'utf-8').trim().split('\n');
    const entry = JSON.parse(audit[audit.length - 1]);
    expect(entry.result).toBe('allowed');
    expect(entry.reason).toBe('valid_signature');
  });

  it('exempts seeds/** from signature requirement', async () => {
    const result = await verifySignature(null, {
      resourcePath: 'seeds/openapi/github.json',
      operation: 'write'
    });
    
    expect(result.ok).toBe(true);
    
    // Verify audit shows exemption
    const audit = fs.readFileSync(SIGNATURE_AUDIT_PATH, 'utf-8').trim().split('\n');
    const entry = JSON.parse(audit[audit.length - 1]);
    expect(entry.reason).toBe('exempted');
  });

  it('denies signature with unsupported algorithm', async () => {
    const payload = { test: 'data' };
    const envelope = signJws(payload, {
      privateKey: testKeyPair.privateKey,
      keyId: 'test-key-v1',
      algorithm: 'EdDSA'
    });
    
    // Manually change algorithm to unsupported one
    envelope.header.alg = 'RS256';
    
    const result = await verifySignature(envelope, {
      resourcePath: 'protocols/test.json',
      operation: 'write'
    });
    
    expect(result.ok).toBe(false);
    expect(result.errorReason).toBe('unsupported_algorithm');
  });

  it('returns list of allowed key IDs', async () => {
    const keyIds = await getAllowedKeyIds();
    expect(keyIds).toContain('test-key-v1');
  });

  it('checks if signature is required for path', async () => {
    const req1 = await isSignatureRequired('protocols/test.json');
    expect(req1.required).toBe(true);
    expect(req1.reason).toBe('enforced');
    
    const req2 = await isSignatureRequired('seeds/test.json');
    expect(req2.required).toBe(false);
    expect(req2.reason).toBe('exempted');
  });
});

describe('Delegation Enforcement (enforce mode)', () => {
  beforeAll(async () => {
    // Create enforce-mode delegation policy
    const delegationPolicy = {
      version: 2,
      mode: 'enforce',
      exemptions: ['seeds/**'],
      agents: {
        'mcp:codex': {
          allow: ['registry:read', 'registry:write', 'resolve:read'],
          resources: ['urn:protocol:*']
        },
        'cli:local': {
          allow: ['registry:read', 'resolve:read'],
          resources: ['urn:protocol:*']
        },
        'ci:builder': {
          allow: ['registry:read', 'registry:write', 'catalog:build'],
          resources: ['urn:protocol:*']
        }
      },
      resources: ['urn:protocol:api:*', 'urn:protocol:event:*'],
      audit: {
        logAllRequests: true
      }
    };
    fs.writeFileSync(DELEGATION_POLICY_PATH, JSON.stringify(delegationPolicy, null, 2));
    
    process.env.DELEGATION_POLICY_PATH = DELEGATION_POLICY_PATH;
    process.env.DELEGATION_AUDIT_LOG = DELEGATION_AUDIT_PATH;
    
    // Dynamic import
    const iamModule = await import('../../packages/runtime/security/iam.mjs');
    authorize = iamModule.authorize;
  });

  afterEach(() => {
    try { fs.unlinkSync(DELEGATION_AUDIT_PATH); } catch {}
  });

  it('denies action outside allowlist with reason', async () => {
    const decision = await authorize('cli:local', 'registry:write', 'urn:protocol:api:users');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('capability_not_allowed');
    expect(decision.mode).toBe('enforce');
    
    // Verify audit entry
    const audit = fs.readFileSync(DELEGATION_AUDIT_PATH, 'utf-8').trim().split('\n');
    const entry = JSON.parse(audit[audit.length - 1]);
    expect(entry.allowed).toBe(false);
    expect(entry.mode).toBe('enforce');
    expect(entry.agent).toBe('cli:local');
    expect(entry.capability).toBe('registry:write');
    expect(entry.resource).toBe('urn:protocol:api:users');
    expect(entry.reason).toBe('capability_not_allowed');
  });

  it('allows action within allowlist', async () => {
    const decision = await authorize('mcp:codex', 'registry:write', 'urn:protocol:api:users');
    
    expect(decision.allowed).toBe(true);
    expect(decision.mode).toBe('enforce');
    
    // Verify audit
    const audit = fs.readFileSync(DELEGATION_AUDIT_PATH, 'utf-8').trim().split('\n');
    const entry = JSON.parse(audit[audit.length - 1]);
    expect(entry.allowed).toBe(true);
    expect(entry.effective).toBe(true);
  });

  it('logs agentId, capability, resource, and reason in audit', async () => {
    const decision = await authorize('unknown:agent', 'dangerous:action', 'urn:protocol:test:resource');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('capability_not_allowed');
    
    const audit = fs.readFileSync(DELEGATION_AUDIT_PATH, 'utf-8').trim().split('\n');
    const entry = JSON.parse(audit[audit.length - 1]);
    
    expect(entry).toHaveProperty('agent', 'unknown:agent');
    expect(entry).toHaveProperty('capability', 'dangerous:action');
    expect(entry).toHaveProperty('resource', 'urn:protocol:test:resource');
    expect(entry).toHaveProperty('reason');
    expect(entry).toHaveProperty('ts');
    expect(entry.allowed).toBe(false);
  });

  it('allows multiple capabilities for same agent', async () => {
    await authorize('mcp:codex', 'registry:read', 'urn:protocol:api:users');
    await authorize('mcp:codex', 'registry:write', 'urn:protocol:api:users');
    await authorize('mcp:codex', 'resolve:read', 'urn:protocol:api:users');
    
    const audit = fs.readFileSync(DELEGATION_AUDIT_PATH, 'utf-8').trim().split('\n');
    expect(audit.length).toBe(3);
    
    const entries = audit.map(line => JSON.parse(line));
    expect(entries.every(e => e.allowed)).toBe(true);
  });

  it('denies resource pattern mismatch', async () => {
    // ci:builder can access urn:protocol:*, but policy resources filter includes only api and event
    const decision = await authorize('mcp:codex', 'registry:read', 'urn:something:else:resource');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('resource_not_matched');

    const audit = fs.readFileSync(DELEGATION_AUDIT_PATH, 'utf-8').trim().split('\n');
    const entry = JSON.parse(audit[audit.length - 1]);
    expect(entry.reason).toBe('resource_not_matched');
  });
});

describe('Combined Signature + Delegation Flow', () => {
  it('requires both valid signature AND delegation for writes', async () => {
    // Step 1: Check signature
    const payload = { apiVersion: 'v1', kind: 'Protocol', metadata: { name: 'test' } };
    const envelope = signJws(payload, {
      privateKey: testKeyPair.privateKey,
      keyId: 'test-key-v1',
      algorithm: 'EdDSA'
    });
    
    const sigResult = await verifySignature(envelope, {
      resourcePath: 'protocols/test-api.json',
      operation: 'write'
    });
    expect(sigResult.ok).toBe(true);
    
    // Step 2: Check delegation
    const authResult = await authorize('mcp:codex', 'registry:write', 'urn:protocol:api:test');
    expect(authResult.allowed).toBe(true);
    
    // Both checks passed -> write would succeed
  });

  it('blocks write if signature valid but delegation denied', async () => {
    const payload = { test: 'data' };
    const envelope = signJws(payload, {
      privateKey: testKeyPair.privateKey,
      keyId: 'test-key-v1',
      algorithm: 'EdDSA'
    });
    
    const sigResult = await verifySignature(envelope, {
      resourcePath: 'protocols/test.json',
      operation: 'write'
    });
    expect(sigResult.ok).toBe(true);
    
    // But delegation fails
    const denied = await authorize('cli:local', 'registry:write', 'urn:protocol:api:test');
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('capability_not_allowed');
  });

  it('blocks write if delegation allowed but signature invalid', async () => {
    // Delegation would pass
    const authResult = await authorize('mcp:codex', 'registry:write', 'urn:protocol:api:test');
    expect(authResult.allowed).toBe(true);
    
    // But signature fails
    const sigResult = await verifySignature(null, {
      resourcePath: 'protocols/test.json',
      operation: 'write'
    });
    expect(sigResult.ok).toBe(false);
  });
});

describe('Audit Trail Verification', () => {
  it('creates machine-readable JSONL entries for all denials', async () => {
    // Generate multiple denials
    await verifySignature(null, { resourcePath: 'proto/test1.json', operation: 'write' });
    
    const denied = await authorize('cli:local', 'registry:delete', 'urn:protocol:api:test');
    expect(denied.allowed).toBe(false);
    
    await verifySignature(null, { resourcePath: 'proto/test2.json', operation: 'write' });
    
    // Check signature audit
    const sigAudit = fs.readFileSync(SIGNATURE_AUDIT_PATH, 'utf-8').trim().split('\n');
    expect(sigAudit.length).toBeGreaterThanOrEqual(2);
    
    const sigEntries = sigAudit.map(line => JSON.parse(line));
    sigEntries.forEach(entry => {
      expect(entry).toHaveProperty('ts');
      expect(entry).toHaveProperty('result');
      expect(entry).toHaveProperty('reason');
    });
    
    // Check delegation audit
    const delAudit = fs.readFileSync(DELEGATION_AUDIT_PATH, 'utf-8').trim().split('\n');
    expect(delAudit.length).toBeGreaterThanOrEqual(1);
    
    const delEntries = delAudit.map(line => JSON.parse(line));
    delEntries.forEach(entry => {
      expect(entry).toHaveProperty('ts');
      expect(entry).toHaveProperty('agent');
      expect(entry).toHaveProperty('capability');
      expect(entry).toHaveProperty('resource');
      expect(entry).toHaveProperty('reason');
    });
  });

  it('includes all required fields in denial entries', async () => {
    await verifySignature(null, {
      resourcePath: 'protocols/critical.json',
      operation: 'write'
    });
    
    const audit = fs.readFileSync(SIGNATURE_AUDIT_PATH, 'utf-8').trim().split('\n');
    const entry = JSON.parse(audit[audit.length - 1]);
    
    expect(entry).toMatchObject({
      result: 'denied',
      reason: 'unsigned',
      operation: 'write',
      resource: 'protocols/critical.json',
      mode: 'enforce'
    });
    expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
  });
});

