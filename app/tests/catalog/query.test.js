/**
 * Tests for query helper functions
 * @module tests/catalog/query.test
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  buildSecondaryIndexes,
  queryByTag,
  queryByNamespace,
  queryByOwner,
  queryByPII,
  queryByType,
  queryByClassification,
  queryByGovernance,
  queryByTagsOR,
  queryDeprecated,
  queryByURNPattern,
  getCatalogStats
} from '../../src/catalog/query';

describe('Query Helper Functions', () => {
  /** @type {Map<string, import('../../src/catalog/schema').ArtifactManifest>} */
  let artifacts;

  beforeEach(() => {
    artifacts = new Map([
      [
        'urn:protocol:event:user.created:1.0.0',
        {
          urn: 'urn:protocol:event:user.created:1.0.0',
          name: 'user.created',
          version: '1.0.0',
          namespace: 'urn:protocol:event',
          type: 'event-protocol',
          manifest: 'https://example.com/user.created/manifest.json',
          dependencies: [],
          metadata: {
            tags: ['authentication', 'gdpr', 'production'],
            governance: {
              classification: 'confidential',
              owner: 'identity-team',
              pii: true,
              compliance: ['gdpr', 'ccpa']
            }
          }
        }
      ],
      [
        'urn:protocol:data:user:2.0.0',
        {
          urn: 'urn:protocol:data:user:2.0.0',
          name: 'user',
          version: '2.0.0',
          namespace: 'urn:protocol:data',
          type: 'data-protocol',
          manifest: 'https://example.com/user/manifest.json',
          dependencies: [],
          metadata: {
            tags: ['gdpr', 'production'],
            governance: {
              classification: 'confidential',
              owner: 'identity-team',
              pii: true,
              compliance: ['gdpr']
            }
          }
        }
      ],
      [
        'urn:protocol:api:user.service:1.0.0',
        {
          urn: 'urn:protocol:api:user.service:1.0.0',
          name: 'user.service',
          version: '1.0.0',
          namespace: 'urn:protocol:api',
          type: 'api-protocol',
          manifest: 'https://example.com/user.service/manifest.json',
          dependencies: [],
          metadata: {
            tags: ['production', 'public-api'],
            governance: {
              classification: 'internal',
              owner: 'api-team',
              pii: false
            },
            deprecated: true,
            deprecationMessage: 'Use v2 instead'
          }
        }
      ],
      [
        'urn:protocol:event:order.created:1.0.0',
        {
          urn: 'urn:protocol:event:order.created:1.0.0',
          name: 'order.created',
          version: '1.0.0',
          namespace: 'urn:protocol:event',
          type: 'event-protocol',
          manifest: 'https://example.com/order.created/manifest.json',
          dependencies: [],
          metadata: {
            tags: ['ecommerce', 'production'],
            governance: {
              classification: 'internal',
              owner: 'orders-team',
              pii: false
            }
          }
        }
      ]
    ]);
  });

  describe('buildSecondaryIndexes', () => {
    it('should build all secondary indexes', () => {
      const indexes = buildSecondaryIndexes(artifacts);

      expect(indexes.byNamespace.size).toBeGreaterThan(0);
      expect(indexes.byTag.size).toBeGreaterThan(0);
      expect(indexes.byOwner.size).toBeGreaterThan(0);
      expect(indexes.byType.size).toBeGreaterThan(0);
      expect(indexes.byClassification.size).toBeGreaterThan(0);
    });

    it('should index by namespace correctly', () => {
      const indexes = buildSecondaryIndexes(artifacts);

      const eventUrns = indexes.byNamespace.get('urn:protocol:event');
      expect(eventUrns?.size).toBe(2);
      expect(eventUrns?.has('urn:protocol:event:user.created:1.0.0')).toBe(true);
      expect(eventUrns?.has('urn:protocol:event:order.created:1.0.0')).toBe(true);
    });

    it('should index by tags correctly', () => {
      const indexes = buildSecondaryIndexes(artifacts);

      const prodUrns = indexes.byTag.get('production');
      expect(prodUrns?.size).toBe(4);

      const gdprUrns = indexes.byTag.get('gdpr');
      expect(gdprUrns?.size).toBe(2);
    });

    it('should index PII artifacts', () => {
      const indexes = buildSecondaryIndexes(artifacts);

      expect(indexes.byPII.size).toBe(2);
      expect(indexes.byPII.has('urn:protocol:event:user.created:1.0.0')).toBe(true);
      expect(indexes.byPII.has('urn:protocol:data:user:2.0.0')).toBe(true);
    });

    it('should index by type correctly', () => {
      const indexes = buildSecondaryIndexes(artifacts);

      const eventUrns = indexes.byType.get('event-protocol');
      expect(eventUrns?.size).toBe(2);

      const dataUrns = indexes.byType.get('data-protocol');
      expect(dataUrns?.size).toBe(1);

      const apiUrns = indexes.byType.get('api-protocol');
      expect(apiUrns?.size).toBe(1);
    });

    it('should index by classification correctly', () => {
      const indexes = buildSecondaryIndexes(artifacts);

      const confidentialUrns = indexes.byClassification.get('confidential');
      expect(confidentialUrns?.size).toBe(2);

      const internalUrns = indexes.byClassification.get('internal');
      expect(internalUrns?.size).toBe(2);
    });
  });

  describe('queryByTag', () => {
    it('should find artifacts by tag', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByTag('gdpr', indexes, artifacts);

      expect(result.count).toBe(2);
      expect(result.took).toBeGreaterThanOrEqual(0);
      expect(result.results.some(a => a.urn === 'urn:protocol:event:user.created:1.0.0')).toBe(true);
      expect(result.results.some(a => a.urn === 'urn:protocol:data:user:2.0.0')).toBe(true);
    });

    it('should return empty result for non-existent tag', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByTag('nonexistent', indexes, artifacts);

      expect(result.count).toBe(0);
      expect(result.results.length).toBe(0);
    });

    it('should complete in < 10ms for reasonable dataset', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByTag('production', indexes, artifacts);

      expect(result.took).toBeLessThan(10);
    });
  });

  describe('queryByNamespace', () => {
    it('should find artifacts by namespace', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByNamespace('urn:protocol:event', indexes, artifacts);

      expect(result.count).toBe(2);
      expect(result.results.every(a => a.namespace === 'urn:protocol:event')).toBe(true);
    });

    it('should return empty for non-existent namespace', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByNamespace('urn:protocol:nonexistent', indexes, artifacts);

      expect(result.count).toBe(0);
    });
  });

  describe('queryByOwner', () => {
    it('should find artifacts by owner', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByOwner('identity-team', indexes, artifacts);

      expect(result.count).toBe(2);
      expect(result.results.every(a => a.metadata.governance.owner === 'identity-team')).toBe(true);
    });

    it('should handle single-owner query', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByOwner('api-team', indexes, artifacts);

      expect(result.count).toBe(1);
      expect(result.results[0].urn).toBe('urn:protocol:api:user.service:1.0.0');
    });
  });

  describe('queryByPII', () => {
    it('should find PII artifacts', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByPII(true, indexes, artifacts);

      expect(result.count).toBe(2);
      expect(result.results.every(a => a.metadata.governance.pii === true)).toBe(true);
    });

    it('should find non-PII artifacts', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByPII(false, indexes, artifacts);

      expect(result.count).toBe(2);
      expect(result.results.every(a => a.metadata.governance.pii === false)).toBe(true);
    });
  });

  describe('queryByType', () => {
    it('should find artifacts by protocol type', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByType('event-protocol', indexes, artifacts);

      expect(result.count).toBe(2);
      expect(result.results.every(a => a.type === 'event-protocol')).toBe(true);
    });

    it('should handle different protocol types', () => {
      const indexes = buildSecondaryIndexes(artifacts);

      const dataResult = queryByType('data-protocol', indexes, artifacts);
      expect(dataResult.count).toBe(1);

      const apiResult = queryByType('api-protocol', indexes, artifacts);
      expect(apiResult.count).toBe(1);
    });
  });

  describe('queryByClassification', () => {
    it('should find artifacts by classification level', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByClassification('confidential', indexes, artifacts);

      expect(result.count).toBe(2);
      expect(result.results.every(a => a.metadata.governance.classification === 'confidential')).toBe(true);
    });

    it('should handle internal classification', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByClassification('internal', indexes, artifacts);

      expect(result.count).toBe(2);
    });
  });

  describe('queryByGovernance', () => {
    it('should handle complex query with multiple criteria', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByGovernance(
        {
          namespace: 'urn:protocol:event',
          pii: true,
          tags: ['gdpr']
        },
        indexes,
        artifacts
      );

      expect(result.count).toBe(1);
      expect(result.results[0].urn).toBe('urn:protocol:event:user.created:1.0.0');
    });

    it('should filter by namespace only', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByGovernance(
        { namespace: 'urn:protocol:event' },
        indexes,
        artifacts
      );

      expect(result.count).toBe(2);
    });

    it('should filter by owner and PII', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByGovernance(
        {
          owner: 'identity-team',
          pii: true
        },
        indexes,
        artifacts
      );

      expect(result.count).toBe(2);
    });

    it('should filter by classification', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByGovernance(
        { classification: 'confidential' },
        indexes,
        artifacts
      );

      expect(result.count).toBe(2);
    });

    it('should handle multiple tags (AND logic)', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByGovernance(
        { tags: ['production', 'gdpr'] },
        indexes,
        artifacts
      );

      expect(result.count).toBe(2);
    });

    it('should handle compliance filtering', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByGovernance(
        { compliance: ['gdpr'] },
        indexes,
        artifacts
      );

      expect(result.count).toBe(2);
    });

    it('should return empty set when no matches', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByGovernance(
        {
          namespace: 'urn:protocol:event',
          owner: 'nonexistent-team'
        },
        indexes,
        artifacts
      );

      expect(result.count).toBe(0);
    });

    it('should complete complex query in < 10ms', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByGovernance(
        {
          namespace: 'urn:protocol:event',
          pii: true,
          tags: ['production', 'gdpr']
        },
        indexes,
        artifacts
      );

      expect(result.took).toBeLessThan(10);
    });
  });

  describe('queryByTagsOR', () => {
    it('should find artifacts matching any tag', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByTagsOR(['authentication', 'ecommerce'], indexes, artifacts);

      expect(result.count).toBe(2);
    });

    it('should handle single tag', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByTagsOR(['public-api'], indexes, artifacts);

      expect(result.count).toBe(1);
    });

    it('should return empty for non-existent tags', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryByTagsOR(['nonexistent1', 'nonexistent2'], indexes, artifacts);

      expect(result.count).toBe(0);
    });
  });

  describe('queryDeprecated', () => {
    it('should find deprecated artifacts', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const result = queryDeprecated(indexes, artifacts);

      expect(result.count).toBe(1);
      expect(result.results[0].metadata.deprecated).toBe(true);
      expect(result.results[0].urn).toBe('urn:protocol:api:user.service:1.0.0');
    });

    it('should return empty when no deprecated artifacts', () => {
      const artifact = artifacts.get('urn:protocol:event:user.created:1.0.0');
      const noDeprecated = new Map([
        [
          'urn:protocol:event:user.created:1.0.0',
          artifact
        ]
      ]);
      const indexes = buildSecondaryIndexes(noDeprecated);
      const result = queryDeprecated(indexes, noDeprecated);

      expect(result.count).toBe(0);
    });
  });

  describe('queryByURNPattern', () => {
    it('should find artifacts by partial URN', () => {
      const result = queryByURNPattern('user', artifacts);

      expect(result.count).toBe(3);
      expect(result.results.every(a => a.urn.includes('user'))).toBe(true);
    });

    it('should find artifacts by version pattern', () => {
      const result = queryByURNPattern(':1.0.0', artifacts);

      expect(result.count).toBe(3);
    });

    it('should return empty for non-matching pattern', () => {
      const result = queryByURNPattern('nonexistent', artifacts);

      expect(result.count).toBe(0);
    });
  });

  describe('getCatalogStats', () => {
    it('should calculate accurate statistics', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const stats = getCatalogStats(indexes, artifacts);

      expect(stats.totalArtifacts).toBe(4);
      expect(stats.piiArtifacts).toBe(2);
      expect(stats.deprecatedArtifacts).toBe(1);
      expect(stats.totalTags).toBeGreaterThan(0);
      expect(stats.totalOwners).toBe(3);
      expect(stats.totalNamespaces).toBe(3);
    });

    it('should calculate byType correctly', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const stats = getCatalogStats(indexes, artifacts);

      expect(stats.byType['event-protocol']).toBe(2);
      expect(stats.byType['data-protocol']).toBe(1);
      expect(stats.byType['api-protocol']).toBe(1);
      expect(stats.byType['ui-protocol']).toBe(0);
    });

    it('should calculate byClassification correctly', () => {
      const indexes = buildSecondaryIndexes(artifacts);
      const stats = getCatalogStats(indexes, artifacts);

      expect(stats.byClassification['confidential']).toBe(2);
      expect(stats.byClassification['internal']).toBe(2);
      expect(stats.byClassification['public']).toBe(0);
      expect(stats.byClassification['restricted']).toBe(0);
    });

    it('should handle empty catalog', () => {
      const emptyArtifacts = new Map();
      const indexes = buildSecondaryIndexes(emptyArtifacts);
      const stats = getCatalogStats(indexes, emptyArtifacts);

      expect(stats.totalArtifacts).toBe(0);
      expect(stats.piiArtifacts).toBe(0);
      expect(stats.deprecatedArtifacts).toBe(0);
    });
  });

  describe('Performance Requirements', () => {
    it('should meet O(1) + O(m) performance for tag queries', () => {
      // Create larger dataset
      const largeArtifacts = new Map(artifacts);
      for (let i = 0; i < 1000; i++) {
        largeArtifacts.set(`urn:protocol:event:test${i}:1.0.0`, {
          urn: `urn:protocol:event:test${i}:1.0.0`,
          name: `test${i}`,
          version: '1.0.0',
          namespace: 'urn:protocol:event',
          type: 'event-protocol',
          manifest: `https://example.com/test${i}/manifest.json`,
          dependencies: [],
          metadata: {
            tags: ['production', 'test'],
            governance: {
              classification: 'internal',
              owner: 'test-team',
              pii: false
            }
          }
        });
      }

      const indexes = buildSecondaryIndexes(largeArtifacts);
      const result = queryByTag('production', indexes, largeArtifacts);

      expect(result.took).toBeLessThan(10);
      expect(result.count).toBeGreaterThan(1000);
    });
  });
});
