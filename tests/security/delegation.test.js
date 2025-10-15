import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  createDelegationManifest,
  validateDelegationChain,
  isDelegationExpired,
  registerValidator,
  Validators
} from '../../packages/protocols/src/Identity & Access Protocol — v1.1.1.js';

describe('IAM Delegation Support', () => {
  describe('createDelegationManifest', () => {
    it('should create valid delegation manifest with required fields', () => {
      const manifest = createDelegationManifest(
        'urn:proto:agent:orchestrator@1.1.1',
        'urn:proto:agent:executor@1.1.1',
        ['payment.execute', 'payment.read'],
        3
      );

      expect(manifest.delegation).toBeDefined();
      expect(manifest.delegation.delegator_agent_urn).toBe('urn:proto:agent:orchestrator@1.1.1');
      expect(manifest.delegation.delegate_agent_urn).toBe('urn:proto:agent:executor@1.1.1');
      expect(manifest.delegation.scopes).toEqual(['payment.execute', 'payment.read']);
      expect(manifest.delegation.max_depth).toBe(3);
    });

    it('should enforce max_depth security constraint (≤5)', () => {
      const manifest = createDelegationManifest(
        'urn:proto:agent:a@1.1.1',
        'urn:proto:agent:b@1.1.1',
        ['scope:test'],
        10 // request depth > 5
      );

      expect(manifest.delegation.max_depth).toBe(5); // clamped to 5
    });

    it('should include optional expires_at', () => {
      const expiresAt = '2025-12-31T23:59:59Z';
      const manifest = createDelegationManifest(
        'urn:proto:agent:a@1.1.1',
        'urn:proto:agent:b@1.1.1',
        ['scope:test'],
        2,
        { expiresAt }
      );

      expect(manifest.delegation.expires_at).toBe(expiresAt);
    });

    it('should include optional constraints', () => {
      const manifest = createDelegationManifest(
        'urn:proto:agent:a@1.1.1',
        'urn:proto:agent:b@1.1.1',
        ['scope:test'],
        2,
        { constraints: { revoke_on_error: true } }
      );

      expect(manifest.delegation.constraints).toEqual({ revoke_on_error: true });
    });
  });

  describe('delegation.core validator', () => {
    let validator;

    beforeEach(() => {
      validator = Validators.get('delegation.core');
    });

    it('should validate valid delegation manifest', () => {
      const manifest = createDelegationManifest(
        'urn:proto:agent:a@1.1.1',
        'urn:proto:agent:b@1.1.1',
        ['scope:read', 'scope:write'],
        3
      );

      const result = validator(manifest);
      expect(result.ok).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should reject invalid delegator URN', () => {
      const manifest = {
        delegation: {
          delegator_agent_urn: 'invalid-urn',
          delegate_agent_urn: 'urn:proto:agent:b@1.1.1',
          scopes: ['scope:test'],
          max_depth: 2
        }
      };

      const result = validator(manifest);
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          path: 'delegation.delegator_agent_urn',
          msg: 'invalid agent URN'
        })
      );
    });

    it('should reject invalid delegate URN', () => {
      const manifest = {
        delegation: {
          delegator_agent_urn: 'urn:proto:agent:a@1.1.1',
          delegate_agent_urn: 'not-a-urn',
          scopes: ['scope:test'],
          max_depth: 2
        }
      };

      const result = validator(manifest);
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          path: 'delegation.delegate_agent_urn',
          msg: 'invalid agent URN'
        })
      );
    });

    it('should reject empty scopes array', () => {
      const manifest = {
        delegation: {
          delegator_agent_urn: 'urn:proto:agent:a@1.1.1',
          delegate_agent_urn: 'urn:proto:agent:b@1.1.1',
          scopes: [],
          max_depth: 2
        }
      };

      const result = validator(manifest);
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          path: 'delegation.scopes',
          msg: 'scopes must be non-empty array'
        })
      );
    });

    it('should reject max_depth > 5', () => {
      const manifest = {
        delegation: {
          delegator_agent_urn: 'urn:proto:agent:a@1.1.1',
          delegate_agent_urn: 'urn:proto:agent:b@1.1.1',
          scopes: ['scope:test'],
          max_depth: 6
        }
      };

      const result = validator(manifest);
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          path: 'delegation.max_depth',
          msg: 'delegation depth >5 increases security risk'
        })
      );
    });

    it('should reject max_depth < 1', () => {
      const manifest = {
        delegation: {
          delegator_agent_urn: 'urn:proto:agent:a@1.1.1',
          delegate_agent_urn: 'urn:proto:agent:b@1.1.1',
          scopes: ['scope:test'],
          max_depth: 0
        }
      };

      const result = validator(manifest);
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          path: 'delegation.max_depth',
          msg: 'max_depth must be ≥1'
        })
      );
    });

    it('should reject invalid expires_at timestamp', () => {
      const manifest = {
        delegation: {
          delegator_agent_urn: 'urn:proto:agent:a@1.1.1',
          delegate_agent_urn: 'urn:proto:agent:b@1.1.1',
          scopes: ['scope:test'],
          max_depth: 2,
          expires_at: 'not-a-valid-timestamp'
        }
      };

      const result = validator(manifest);
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          path: 'delegation.expires_at',
          msg: 'must be valid ISO8601 timestamp'
        })
      );
    });

    it('should skip validation if no delegation present', () => {
      const manifest = { identity: { id: 'user-123', type: 'human' } };
      const result = validator(manifest);
      expect(result.ok).toBe(true);
    });
  });

  describe('validateDelegationChain', () => {
    it('should validate simple A→B delegation chain', () => {
      const parentDelegation = createDelegationManifest(
        'urn:proto:agent:a@1.1.1',
        'urn:proto:agent:b@1.1.1',
        ['payment.execute', 'payment.read'],
        3
      );

      const childDelegation = createDelegationManifest(
        'urn:proto:agent:b@1.1.1',
        'urn:proto:agent:c@1.1.1',
        ['payment.read'],
        2
      );

      const result = validateDelegationChain(parentDelegation, childDelegation);
      expect(result.ok).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should validate A→B→C delegation chain', () => {
      const delegation1 = createDelegationManifest(
        'urn:proto:agent:a@1.1.1',
        'urn:proto:agent:b@1.1.1',
        ['scope:admin', 'scope:read', 'scope:write'],
        5
      );

      const delegation2 = createDelegationManifest(
        'urn:proto:agent:b@1.1.1',
        'urn:proto:agent:c@1.1.1',
        ['scope:read', 'scope:write'],
        4
      );

      const delegation3 = createDelegationManifest(
        'urn:proto:agent:c@1.1.1',
        'urn:proto:agent:d@1.1.1',
        ['scope:read'],
        3
      );

      const result1 = validateDelegationChain(delegation1, delegation2);
      expect(result1.ok).toBe(true);

      const result2 = validateDelegationChain(delegation2, delegation3);
      expect(result2.ok).toBe(true);
    });

    it('should reject child max_depth >= parent max_depth', () => {
      const parentDelegation = createDelegationManifest(
        'urn:proto:agent:a@1.1.1',
        'urn:proto:agent:b@1.1.1',
        ['scope:test'],
        2
      );

      const childDelegation = createDelegationManifest(
        'urn:proto:agent:b@1.1.1',
        'urn:proto:agent:c@1.1.1',
        ['scope:test'],
        2 // same as parent
      );

      const result = validateDelegationChain(parentDelegation, childDelegation);
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          path: 'delegation.max_depth',
          msg: 'child max_depth (2) must be < parent max_depth (2)'
        })
      );
    });

    it('should reject scope expansion (child has scope not in parent)', () => {
      const parentDelegation = createDelegationManifest(
        'urn:proto:agent:a@1.1.1',
        'urn:proto:agent:b@1.1.1',
        ['payment.read'],
        3
      );

      const childDelegation = createDelegationManifest(
        'urn:proto:agent:b@1.1.1',
        'urn:proto:agent:c@1.1.1',
        ['payment.read', 'payment.execute'], // added scope not in parent
        2
      );

      const result = validateDelegationChain(parentDelegation, childDelegation);
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          path: 'delegation.scopes',
          msg: "scope 'payment.execute' not permitted by parent delegation"
        })
      );
    });

    it('should allow scope narrowing (subset of parent scopes)', () => {
      const parentDelegation = createDelegationManifest(
        'urn:proto:agent:a@1.1.1',
        'urn:proto:agent:b@1.1.1',
        ['payment.execute', 'payment.read', 'payment.delete'],
        4
      );

      const childDelegation = createDelegationManifest(
        'urn:proto:agent:b@1.1.1',
        'urn:proto:agent:c@1.1.1',
        ['payment.read'], // subset of parent
        3
      );

      const result = validateDelegationChain(parentDelegation, childDelegation);
      expect(result.ok).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('max_depth=5 limit enforcement', () => {
    it('should enforce max_depth=5 at creation time', () => {
      const manifest = createDelegationManifest(
        'urn:proto:agent:a@1.1.1',
        'urn:proto:agent:b@1.1.1',
        ['scope:test'],
        100 // attempt to set > 5
      );

      expect(manifest.delegation.max_depth).toBe(5);
    });

    it('should reject validation for max_depth > 5', () => {
      const validator = Validators.get('delegation.core');
      const manifest = {
        delegation: {
          delegator_agent_urn: 'urn:proto:agent:a@1.1.1',
          delegate_agent_urn: 'urn:proto:agent:b@1.1.1',
          scopes: ['scope:test'],
          max_depth: 10
        }
      };

      const result = validator(manifest);
      expect(result.ok).toBe(false);
      expect(result.issues.some(i => i.path === 'delegation.max_depth')).toBe(true);
    });

    it('should allow max_depth=5 exactly', () => {
      const validator = Validators.get('delegation.core');
      const manifest = createDelegationManifest(
        'urn:proto:agent:a@1.1.1',
        'urn:proto:agent:b@1.1.1',
        ['scope:test'],
        5
      );

      const result = validator(manifest);
      expect(result.ok).toBe(true);
      expect(manifest.delegation.max_depth).toBe(5);
    });
  });

  describe('isDelegationExpired', () => {
    it('should return false for delegation without expires_at', () => {
      const manifest = createDelegationManifest(
        'urn:proto:agent:a@1.1.1',
        'urn:proto:agent:b@1.1.1',
        ['scope:test'],
        2
      );

      expect(isDelegationExpired(manifest)).toBe(false);
    });

    it('should return false for non-expired delegation', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString(); // +1 day
      const manifest = createDelegationManifest(
        'urn:proto:agent:a@1.1.1',
        'urn:proto:agent:b@1.1.1',
        ['scope:test'],
        2,
        { expiresAt: futureDate }
      );

      expect(isDelegationExpired(manifest)).toBe(false);
    });

    it('should return true for expired delegation', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString(); // -1 day
      const manifest = createDelegationManifest(
        'urn:proto:agent:a@1.1.1',
        'urn:proto:agent:b@1.1.1',
        ['scope:test'],
        2,
        { expiresAt: pastDate }
      );

      expect(isDelegationExpired(manifest)).toBe(true);
    });

    it('should accept custom now parameter', () => {
      const expiresAt = '2025-10-15T12:00:00Z';
      const manifest = createDelegationManifest(
        'urn:proto:agent:a@1.1.1',
        'urn:proto:agent:b@1.1.1',
        ['scope:test'],
        2,
        { expiresAt }
      );

      const beforeExpiry = new Date('2025-10-15T11:59:59Z');
      const afterExpiry = new Date('2025-10-15T12:00:01Z');

      expect(isDelegationExpired(manifest, beforeExpiry)).toBe(false);
      expect(isDelegationExpired(manifest, afterExpiry)).toBe(true);
    });
  });

  describe('Integration: Complete delegation scenarios', () => {
    it('should validate complete 5-level delegation chain', () => {
      const delegations = [];

      // Level 1: Root → Agent A
      delegations.push(createDelegationManifest(
        'urn:proto:agent:root@1.1.1',
        'urn:proto:agent:a@1.1.1',
        ['admin', 'read', 'write', 'execute'],
        5
      ));

      // Level 2: Agent A → Agent B
      delegations.push(createDelegationManifest(
        'urn:proto:agent:a@1.1.1',
        'urn:proto:agent:b@1.1.1',
        ['read', 'write', 'execute'],
        4
      ));

      // Level 3: Agent B → Agent C
      delegations.push(createDelegationManifest(
        'urn:proto:agent:b@1.1.1',
        'urn:proto:agent:c@1.1.1',
        ['read', 'execute'],
        3
      ));

      // Level 4: Agent C → Agent D
      delegations.push(createDelegationManifest(
        'urn:proto:agent:c@1.1.1',
        'urn:proto:agent:d@1.1.1',
        ['read'],
        2
      ));

      // Level 5: Agent D → Agent E
      delegations.push(createDelegationManifest(
        'urn:proto:agent:d@1.1.1',
        'urn:proto:agent:e@1.1.1',
        ['read'],
        1
      ));

      // Validate each level
      for (let i = 0; i < delegations.length - 1; i++) {
        const result = validateDelegationChain(delegations[i], delegations[i + 1]);
        expect(result.ok).toBe(true);
      }

      // Validate all manifests pass core validation
      const validator = Validators.get('delegation.core');
      for (const delegation of delegations) {
        const result = validator(delegation);
        expect(result.ok).toBe(true);
      }
    });

    it('should reject expired delegation in chain', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const expiredDelegation = createDelegationManifest(
        'urn:proto:agent:a@1.1.1',
        'urn:proto:agent:b@1.1.1',
        ['scope:test'],
        2,
        { expiresAt: pastDate }
      );

      expect(isDelegationExpired(expiredDelegation)).toBe(true);
    });
  });
});
