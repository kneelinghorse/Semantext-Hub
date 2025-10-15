/*
 * Override Schema Tests
 */

import schemaMod from '../../packages/protocols/core/overrides/schema.js';
const {
  validateRule,
  calculateDecay,
  calculateEffectiveConfidence,
  getPrecedence,
  PRECEDENCE
} = schemaMod;

describe('Override Schema', () => {
  describe('validateRule', () => {
    test('validates a valid PII pattern rule', () => {
      const rule = {
        id: 'test-email',
        type: 'pii_pattern',
        pattern: {
          field: 'email',
          context: 'users'
        },
        classification: 'pii',
        confidence: 0.9,
        metadata: {
          source: 'community',
          created: '2025-01-15T00:00:00Z'
        }
      };

      const result = validateRule(rule);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('rejects rule with missing required fields', () => {
      const rule = {
        id: 'test-incomplete',
        type: 'pii_pattern'
        // Missing pattern, classification, confidence
      };

      const result = validateRule(rule);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('rejects rule with invalid type', () => {
      const rule = {
        id: 'test-invalid-type',
        type: 'invalid_type',
        pattern: { field: 'test' },
        classification: 'pii',
        confidence: 0.8
      };

      const result = validateRule(rule);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid rule type'))).toBe(true);
    });

    test('rejects rule with confidence out of range', () => {
      const rule = {
        id: 'test-bad-confidence',
        type: 'pii_pattern',
        pattern: { field: 'test' },
        classification: 'pii',
        confidence: 1.5
      };

      const result = validateRule(rule);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('confidence'))).toBe(true);
    });

    test('validates API pattern rule', () => {
      const rule = {
        id: 'test-pagination',
        type: 'api_pattern',
        pattern: {
          endpoint: '/users',
          method: 'GET',
          parameters: ['page', 'limit']
        },
        classification: 'pagination',
        confidence: 0.85
      };

      const result = validateRule(rule);
      expect(result.valid).toBe(true);
    });
  });

  describe('calculateDecay', () => {
    test('returns 1.0 for rules less than 30 days old', () => {
      const recent = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      expect(calculateDecay(recent)).toBe(1.0);
    });

    test('returns 0.9 for rules 30-60 days old', () => {
      const aging = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
      expect(calculateDecay(aging)).toBe(0.9);
    });

    test('returns 0.8 for rules 60-90 days old', () => {
      const old = new Date(Date.now() - 75 * 24 * 60 * 60 * 1000).toISOString();
      expect(calculateDecay(old)).toBe(0.8);
    });

    test('returns 0.7 for rules over 90 days old', () => {
      const veryOld = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
      expect(calculateDecay(veryOld)).toBe(0.7);
    });

    test('handles missing date gracefully', () => {
      expect(calculateDecay(null)).toBe(0.7);
    });
  });

  describe('calculateEffectiveConfidence', () => {
    test('applies temporal decay to confidence', () => {
      const rule = {
        confidence: 0.9,
        metadata: {
          created: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()
        }
      };

      const effective = calculateEffectiveConfidence(rule);
      expect(effective).toBeCloseTo(0.9 * 0.9, 2);
    });

    test('applies verification boost', () => {
      const rule = {
        confidence: 0.8,
        metadata: {
          created: new Date().toISOString(),
          verified_by: 100
        }
      };

      const effective = calculateEffectiveConfidence(rule);
      // Base: 0.8, boost: min(100 * 0.005, 0.10) = 0.10
      expect(effective).toBeCloseTo(0.9, 2);
    });

    test('caps confidence at 1.0', () => {
      const rule = {
        confidence: 0.95,
        metadata: {
          created: new Date().toISOString(),
          verified_by: 200
        }
      };

      const effective = calculateEffectiveConfidence(rule);
      expect(effective).toBeLessThanOrEqual(1.0);
    });
  });

  describe('getPrecedence', () => {
    test('returns correct precedence for project', () => {
      expect(getPrecedence('project')).toBe(PRECEDENCE.PROJECT);
      expect(getPrecedence('PROJECT')).toBe(PRECEDENCE.PROJECT);
    });

    test('returns correct precedence for organization', () => {
      expect(getPrecedence('organization')).toBe(PRECEDENCE.ORGANIZATION);
    });

    test('returns correct precedence for community', () => {
      expect(getPrecedence('community')).toBe(PRECEDENCE.COMMUNITY);
    });

    test('defaults to community precedence', () => {
      expect(getPrecedence('unknown')).toBe(PRECEDENCE.COMMUNITY);
      expect(getPrecedence(null)).toBe(PRECEDENCE.COMMUNITY);
    });

    test('precedence order is correct', () => {
      expect(PRECEDENCE.PROJECT).toBeGreaterThan(PRECEDENCE.ORGANIZATION);
      expect(PRECEDENCE.ORGANIZATION).toBeGreaterThan(PRECEDENCE.COMMUNITY);
    });
  });
});
