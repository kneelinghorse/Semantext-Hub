/**
 * Tests for OpenAPI Extensions Handler
 * Focus on branch coverage for conditional logic and error handling
 */

import {
  VALUABLE_EXTENSIONS,
  extractExtensions,
  preserveValuedExtensions,
  hasPIIIndicators,
  isInternalOnly,
  extractRateLimitConfig,
  extractAuthConfig,
  extractDeprecationInfo,
  extractLifecycleInfo,
  extractStabilityLevel,
  mergeExtensions,
  normalizeExtensionKeys,
  getSecurityExtensions,
  getOperationalExtensions,
  getDomainExtensions,
  toManifestMetadata
} from '../../../packages/runtime/importers/openapi/extensions.js';

describe('OpenAPI Extensions Handler', () => {
  describe('extractExtensions', () => {
    it('should extract all x-* extensions from object', () => {
      const obj = {
        'x-pii': true,
        'x-rate-limit': { requests: 100 },
        'x-internal': false,
        'normalField': 'value',
        'x-auth-required': true
      };

      const result = extractExtensions(obj);

      expect(result).toEqual({
        'x-pii': true,
        'x-rate-limit': { requests: 100 },
        'x-internal': false,
        'x-auth-required': true
      });
    });

    it('should return empty object for null input', () => {
      const result = extractExtensions(null);
      expect(result).toEqual({});
    });

    it('should return empty object for undefined input', () => {
      const result = extractExtensions(undefined);
      expect(result).toEqual({});
    });

    it('should return empty object for non-object input', () => {
      const result = extractExtensions('string');
      expect(result).toEqual({});
    });

    it('should return empty object for object with no x-* keys', () => {
      const obj = {
        normalField: 'value',
        anotherField: 123
      };

      const result = extractExtensions(obj);
      expect(result).toEqual({});
    });
  });

  describe('preserveValuedExtensions', () => {
    it('should preserve only valuable extensions', () => {
      const obj = {
        'x-pii': true,
        'x-rate-limit': { requests: 100 },
        'x-custom': 'value',
        'x-internal': false,
        'x-unknown': 'ignored'
      };

      const result = preserveValuedExtensions(obj);

      expect(result).toEqual({
        'x-pii': true,
        'x-rate-limit': { requests: 100 },
        'x-internal': false
      });
    });

    it('should handle case-insensitive matching', () => {
      const obj = {
        'x-PII': true,
        'x-RATE-LIMIT': { requests: 100 },
        'x-Internal': false
      };

      const result = preserveValuedExtensions(obj);

      // The function preserves original key case but matches case-insensitively
      expect(result).toEqual({
        'x-PII': true,
        'x-RATE-LIMIT': { requests: 100 },
        'x-Internal': false
      });
    });

    it('should return empty object for no valuable extensions', () => {
      const obj = {
        'x-custom': 'value',
        'x-unknown': 'ignored'
      };

      const result = preserveValuedExtensions(obj);
      expect(result).toEqual({});
    });
  });

  describe('hasPIIIndicators', () => {
    it('should return true for PII indicators', () => {
      const extensions = {
        'x-pii': true,
        'x-custom': 'value'
      };

      const result = hasPIIIndicators(extensions);
      expect(result).toBe(true);
    });

    it('should return true for case-insensitive PII indicators', () => {
      const extensions = {
        'X-PII': true,
        'x-pii-data': 'sensitive'
      };

      const result = hasPIIIndicators(extensions);
      expect(result).toBe(true);
    });

    it('should return false for no PII indicators', () => {
      const extensions = {
        'x-rate-limit': { requests: 100 },
        'x-internal': false
      };

      const result = hasPIIIndicators(extensions);
      expect(result).toBe(false);
    });

    it('should return false for empty extensions', () => {
      const result = hasPIIIndicators({});
      expect(result).toBe(false);
    });
  });

  describe('isInternalOnly', () => {
    it('should return true for internal-only indicators', () => {
      const extensions = {
        'x-internal': true,
        'x-custom': 'value'
      };

      const result = isInternalOnly(extensions);
      expect(result).toBe(true);
    });

    it('should return true for case-insensitive internal indicators', () => {
      const extensions = {
        'X-INTERNAL': true,
        'x-internal-api': true
      };

      const result = isInternalOnly(extensions);
      expect(result).toBe(true);
    });

    it('should return false for non-internal extensions', () => {
      const extensions = {
        'x-internal': false,
        'x-rate-limit': { requests: 100 }
      };

      const result = isInternalOnly(extensions);
      expect(result).toBe(false);
    });

    it('should return false for no internal indicators', () => {
      const extensions = {
        'x-rate-limit': { requests: 100 },
        'x-pii': true
      };

      const result = isInternalOnly(extensions);
      expect(result).toBe(false);
    });
  });

  describe('extractRateLimitConfig', () => {
    it('should extract x-rate-limit config', () => {
      const extensions = {
        'x-rate-limit': { requests: 100, window: '1m' },
        'x-custom': 'value'
      };

      const result = extractRateLimitConfig(extensions);
      expect(result).toEqual({ requests: 100, window: '1m' });
    });

    it('should extract x-ratelimit config', () => {
      const extensions = {
        'x-ratelimit': { requests: 200, window: '1h' }
      };

      const result = extractRateLimitConfig(extensions);
      expect(result).toEqual({ requests: 200, window: '1h' });
    });

    it('should handle case-insensitive matching', () => {
      const extensions = {
        'X-RATE-LIMIT': { requests: 50 }
      };

      const result = extractRateLimitConfig(extensions);
      expect(result).toEqual({ requests: 50 });
    });

    it('should return null for no rate limit config', () => {
      const extensions = {
        'x-pii': true,
        'x-internal': false
      };

      const result = extractRateLimitConfig(extensions);
      expect(result).toBeNull();
    });
  });

  describe('extractAuthConfig', () => {
    it('should extract x-auth config', () => {
      const extensions = {
        'x-auth': { type: 'bearer' },
        'x-custom': 'value'
      };

      const result = extractAuthConfig(extensions);
      expect(result).toEqual({ 'x-auth': { type: 'bearer' } });
    });

    it('should extract x-auth-required config', () => {
      const extensions = {
        'x-auth-required': true
      };

      const result = extractAuthConfig(extensions);
      expect(result).toEqual({ 'x-auth-required': true });
    });

    it('should handle case-insensitive matching', () => {
      const extensions = {
        'X-AUTH': { type: 'api-key' }
      };

      const result = extractAuthConfig(extensions);
      expect(result).toEqual({ 'X-AUTH': { type: 'api-key' } });
    });

    it('should return null for no auth config', () => {
      const extensions = {
        'x-pii': true,
        'x-rate-limit': { requests: 100 }
      };

      const result = extractAuthConfig(extensions);
      expect(result).toBeNull();
    });
  });

  describe('extractDeprecationInfo', () => {
    it('should extract x-deprecation object', () => {
      const extensions = {
        'x-deprecation': {
          deprecated: true,
          sunset: '2024-12-31',
          replacement: '/v2/users'
        }
      };

      const result = extractDeprecationInfo(extensions);
      expect(result).toEqual({
        deprecated: true,
        sunset: '2024-12-31',
        replacement: '/v2/users'
      });
    });

    it('should extract x-deprecated boolean', () => {
      const extensions = {
        'x-deprecated': true
      };

      const result = extractDeprecationInfo(extensions);
      expect(result).toEqual({ deprecated: true });
    });

    it('should handle case-insensitive matching', () => {
      const extensions = {
        'X-DEPRECATION': { deprecated: true }
      };

      const result = extractDeprecationInfo(extensions);
      expect(result).toEqual({ deprecated: true });
    });

    it('should return null for no deprecation info', () => {
      const extensions = {
        'x-pii': true,
        'x-rate-limit': { requests: 100 }
      };

      const result = extractDeprecationInfo(extensions);
      expect(result).toBeNull();
    });
  });

  describe('extractLifecycleInfo', () => {
    it('should extract x-lifecycle info', () => {
      const extensions = {
        'x-lifecycle': { status: 'beta', since: '2024-01-01' }
      };

      const result = extractLifecycleInfo(extensions);
      expect(result).toEqual({ status: 'beta', since: '2024-01-01' });
    });

    it('should handle case-insensitive matching', () => {
      const extensions = {
        'X-LIFECYCLE': { status: 'stable' }
      };

      const result = extractLifecycleInfo(extensions);
      expect(result).toEqual({ status: 'stable' });
    });

    it('should return null for no lifecycle info', () => {
      const extensions = {
        'x-pii': true,
        'x-rate-limit': { requests: 100 }
      };

      const result = extractLifecycleInfo(extensions);
      expect(result).toBeNull();
    });
  });

  describe('extractStabilityLevel', () => {
    it('should extract x-stability level', () => {
      const extensions = {
        'x-stability': 'stable'
      };

      const result = extractStabilityLevel(extensions);
      expect(result).toBe('stable');
    });

    it('should extract x-experimental level', () => {
      const extensions = {
        'x-experimental': true
      };

      const result = extractStabilityLevel(extensions);
      expect(result).toBe('experimental');
    });

    it('should extract x-beta level', () => {
      const extensions = {
        'x-beta': true
      };

      const result = extractStabilityLevel(extensions);
      expect(result).toBe('beta');
    });

    it('should prioritize x-stability over boolean flags', () => {
      const extensions = {
        'x-stability': 'stable',
        'x-experimental': true
      };

      const result = extractStabilityLevel(extensions);
      expect(result).toBe('stable');
    });

    it('should return null for no stability info', () => {
      const extensions = {
        'x-pii': true,
        'x-rate-limit': { requests: 100 }
      };

      const result = extractStabilityLevel(extensions);
      expect(result).toBeNull();
    });
  });

  describe('mergeExtensions', () => {
    it('should merge multiple extension maps', () => {
      const ext1 = { 'x-pii': true };
      const ext2 = { 'x-rate-limit': { requests: 100 } };
      const ext3 = { 'x-internal': false };

      const result = mergeExtensions(ext1, ext2, ext3);

      expect(result).toEqual({
        'x-pii': true,
        'x-rate-limit': { requests: 100 },
        'x-internal': false
      });
    });

    it('should handle null/undefined inputs', () => {
      const ext1 = { 'x-pii': true };
      const ext2 = null;
      const ext3 = undefined;
      const ext4 = { 'x-rate-limit': { requests: 100 } };

      const result = mergeExtensions(ext1, ext2, ext3, ext4);

      expect(result).toEqual({
        'x-pii': true,
        'x-rate-limit': { requests: 100 }
      });
    });

    it('should handle non-object inputs', () => {
      const ext1 = { 'x-pii': true };
      const ext2 = 'string';
      const ext3 = 123;

      const result = mergeExtensions(ext1, ext2, ext3);

      expect(result).toEqual({
        'x-pii': true
      });
    });

    it('should return empty object for no valid inputs', () => {
      const result = mergeExtensions(null, undefined, 'string', 123);
      expect(result).toEqual({});
    });
  });

  describe('normalizeExtensionKeys', () => {
    it('should normalize extension keys to lowercase', () => {
      const extensions = {
        'X-PII': true,
        'X-RATE-LIMIT': { requests: 100 },
        'x-internal': false
      };

      const result = normalizeExtensionKeys(extensions);

      expect(result).toEqual({
        'x-pii': true,
        'x-rate-limit': { requests: 100 },
        'x-internal': false
      });
    });

    it('should handle empty extensions', () => {
      const result = normalizeExtensionKeys({});
      expect(result).toEqual({});
    });
  });

  describe('getSecurityExtensions', () => {
    it('should get security-related extensions', () => {
      const extensions = {
        'x-pii': true,
        'x-security': { level: 'high' },
        'x-auth': { type: 'bearer' },
        'x-compliance': 'gdpr',
        'x-gdpr': true,
        'x-hipaa': false,
        'x-pci': 'level1',
        'x-rate-limit': { requests: 100 }
      };

      const result = getSecurityExtensions(extensions);

      expect(result).toEqual({
        'x-pii': true,
        'x-security': { level: 'high' },
        'x-auth': { type: 'bearer' },
        'x-compliance': 'gdpr',
        'x-gdpr': true,
        'x-hipaa': false,
        'x-pci': 'level1'
      });
    });

    it('should handle case-insensitive matching', () => {
      const extensions = {
        'X-PII': true,
        'X-SECURITY': { level: 'high' },
        'x-rate-limit': { requests: 100 }
      };

      const result = getSecurityExtensions(extensions);

      expect(result).toEqual({
        'X-PII': true,
        'X-SECURITY': { level: 'high' }
      });
    });

    it('should return empty object for no security extensions', () => {
      const extensions = {
        'x-rate-limit': { requests: 100 },
        'x-internal': false
      };

      const result = getSecurityExtensions(extensions);
      expect(result).toEqual({});
    });
  });

  describe('getOperationalExtensions', () => {
    it('should get operational extensions', () => {
      const extensions = {
        'x-rate-limit': { requests: 100 },
        'x-timeout': 30000,
        'x-retry': { max: 3 },
        'x-cache': { ttl: 3600 },
        'x-idempotent': true,
        'x-cost': 0.01,
        'x-quota': { daily: 1000 },
        'x-pii': true
      };

      const result = getOperationalExtensions(extensions);

      expect(result).toEqual({
        'x-rate-limit': { requests: 100 },
        'x-timeout': 30000,
        'x-retry': { max: 3 },
        'x-cache': { ttl: 3600 },
        'x-idempotent': true,
        'x-cost': 0.01,
        'x-quota': { daily: 1000 }
      });
    });

    it('should handle case-insensitive matching', () => {
      const extensions = {
        'X-RATE-LIMIT': { requests: 100 },
        'X-TIMEOUT': 30000
      };

      const result = getOperationalExtensions(extensions);

      expect(result).toEqual({
        'X-RATE-LIMIT': { requests: 100 },
        'X-TIMEOUT': 30000
      });
    });

    it('should return empty object for no operational extensions', () => {
      const extensions = {
        'x-pii': true,
        'x-internal': false
      };

      const result = getOperationalExtensions(extensions);
      expect(result).toEqual({});
    });
  });

  describe('getDomainExtensions', () => {
    it('should get domain/organizational extensions', () => {
      const extensions = {
        'x-domain': 'user-management',
        'x-team': 'backend',
        'x-owner': 'john.doe@example.com',
        'x-tier': 'gold',
        'x-sla': '99.9%',
        'x-environment': 'production',
        'x-region': 'us-west-2',
        'x-pii': true
      };

      const result = getDomainExtensions(extensions);

      expect(result).toEqual({
        'x-domain': 'user-management',
        'x-team': 'backend',
        'x-owner': 'john.doe@example.com',
        'x-tier': 'gold',
        'x-sla': '99.9%',
        'x-environment': 'production',
        'x-region': 'us-west-2'
      });
    });

    it('should handle case-insensitive matching', () => {
      const extensions = {
        'X-DOMAIN': 'user-management',
        'X-TEAM': 'backend'
      };

      const result = getDomainExtensions(extensions);

      expect(result).toEqual({
        'X-DOMAIN': 'user-management',
        'X-TEAM': 'backend'
      });
    });

    it('should return empty object for no domain extensions', () => {
      const extensions = {
        'x-pii': true,
        'x-rate-limit': { requests: 100 }
      };

      const result = getDomainExtensions(extensions);
      expect(result).toEqual({});
    });
  });

  describe('toManifestMetadata', () => {
    it('should convert extensions to manifest metadata with lifecycle', () => {
      const extensions = {
        'x-lifecycle': { status: 'beta', since: '2024-01-01' },
        'x-pii': true,
        'x-rate-limit': { requests: 100 },
        'x-domain': 'user-management'
      };

      const result = toManifestMetadata(extensions);

      expect(result).toEqual({
        lifecycle: { status: 'beta', since: '2024-01-01' },
        security: { 'x-pii': true },
        operational: { 'x-rate-limit': { requests: 100 } },
        domain: { 'x-domain': 'user-management' }
      });
    });

    it('should convert extensions to manifest metadata with deprecation', () => {
      const extensions = {
        'x-deprecation': { deprecated: true, sunset: '2024-12-31' },
        'x-pii': true
      };

      const result = toManifestMetadata(extensions);

      expect(result).toEqual({
        lifecycle: { status: 'deprecated', deprecated: true, sunset: '2024-12-31' },
        security: { 'x-pii': true }
      });
    });

    it('should convert extensions to manifest metadata with stability', () => {
      const extensions = {
        'x-experimental': true,
        'x-pii': true
      };

      const result = toManifestMetadata(extensions);

      expect(result).toEqual({
        lifecycle: { status: 'experimental' },
        security: { 'x-pii': true }
      });
    });

    it('should handle extensions with remaining valuable extensions', () => {
      const extensions = {
        'x-pii': true,
        'x-webhook': { url: 'https://example.com/webhook' },
        'x-custom': 'ignored'
      };

      const result = toManifestMetadata(extensions);

      expect(result).toEqual({
        security: { 'x-pii': true },
        extensions: { 'x-webhook': { url: 'https://example.com/webhook' } }
      });
    });

    it('should return empty object for no valuable extensions', () => {
      const extensions = {
        'x-custom': 'ignored',
        'x-unknown': 'also ignored'
      };

      const result = toManifestMetadata(extensions);
      expect(result).toEqual({});
    });
  });

  describe('VALUABLE_EXTENSIONS', () => {
    it('should contain expected valuable extension prefixes', () => {
      expect(VALUABLE_EXTENSIONS).toContain('x-pii');
      expect(VALUABLE_EXTENSIONS).toContain('x-rate-limit');
      expect(VALUABLE_EXTENSIONS).toContain('x-internal');
      expect(VALUABLE_EXTENSIONS).toContain('x-auth');
      expect(VALUABLE_EXTENSIONS).toContain('x-deprecation');
      expect(VALUABLE_EXTENSIONS).toContain('x-lifecycle');
      expect(VALUABLE_EXTENSIONS).toContain('x-stability');
      expect(VALUABLE_EXTENSIONS).toContain('x-experimental');
      expect(VALUABLE_EXTENSIONS).toContain('x-beta');
      expect(VALUABLE_EXTENSIONS).toContain('x-webhook');
      expect(VALUABLE_EXTENSIONS).toContain('x-callback');
      expect(VALUABLE_EXTENSIONS).toContain('x-streaming');
      expect(VALUABLE_EXTENSIONS).toContain('x-cache');
      expect(VALUABLE_EXTENSIONS).toContain('x-idempotent');
      expect(VALUABLE_EXTENSIONS).toContain('x-retry');
      expect(VALUABLE_EXTENSIONS).toContain('x-timeout');
      expect(VALUABLE_EXTENSIONS).toContain('x-cost');
      expect(VALUABLE_EXTENSIONS).toContain('x-billing');
      expect(VALUABLE_EXTENSIONS).toContain('x-quota');
      expect(VALUABLE_EXTENSIONS).toContain('x-region');
      expect(VALUABLE_EXTENSIONS).toContain('x-environment');
      expect(VALUABLE_EXTENSIONS).toContain('x-compliance');
      expect(VALUABLE_EXTENSIONS).toContain('x-gdpr');
      expect(VALUABLE_EXTENSIONS).toContain('x-hipaa');
      expect(VALUABLE_EXTENSIONS).toContain('x-pci');
    });
  });
});
