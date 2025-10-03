/**
 * Tests for URNCatalogIndex
 * @module tests/catalog/index.test
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { URNCatalogIndex } from '../../src/catalog/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('URNCatalogIndex', () => {
  /** @type {URNCatalogIndex} */
  let catalog;
  /** @type {import('../../src/catalog/schema').ArtifactManifest} */
  let sampleArtifact;

  beforeEach(() => {
    catalog = new URNCatalogIndex();

    sampleArtifact = {
      urn: 'urn:protocol:event:user.created:1.0.0',
      name: 'user.created',
      version: '1.0.0',
      namespace: 'urn:protocol:event',
      type: 'event-protocol',
      manifest: 'https://example.com/user.created/manifest.json',
      dependencies: ['urn:protocol:data:user:2.0.0'],
      metadata: {
        tags: ['authentication', 'gdpr'],
        governance: {
          classification: 'confidential',
          owner: 'identity-team',
          pii: true,
          compliance: ['gdpr', 'ccpa']
        }
      }
    };
  });

  describe('Basic Operations', () => {
    it('should start empty', () => {
      expect(catalog.size()).toBe(0);
    });

    it('should add artifact', () => {
      catalog.add(sampleArtifact);

      expect(catalog.size()).toBe(1);
      expect(catalog.has(sampleArtifact.urn)).toBe(true);
    });

    it('should get artifact by URN', () => {
      catalog.add(sampleArtifact);

      const retrieved = catalog.get(sampleArtifact.urn);

      expect(retrieved).toEqual(sampleArtifact);
    });

    it('should return undefined for non-existent URN', () => {
      const retrieved = catalog.get('urn:nonexistent:1.0.0');

      expect(retrieved).toBeUndefined();
    });

    it('should remove artifact', () => {
      catalog.add(sampleArtifact);
      const removed = catalog.remove(sampleArtifact.urn);

      expect(removed).toBe(true);
      expect(catalog.size()).toBe(0);
      expect(catalog.has(sampleArtifact.urn)).toBe(false);
    });

    it('should return false when removing non-existent artifact', () => {
      const removed = catalog.remove('urn:nonexistent:1.0.0');

      expect(removed).toBe(false);
    });

    it('should check if URN exists', () => {
      catalog.add(sampleArtifact);

      expect(catalog.has(sampleArtifact.urn)).toBe(true);
      expect(catalog.has('urn:nonexistent:1.0.0')).toBe(false);
    });

    it('should clear all artifacts', () => {
      catalog.add(sampleArtifact);
      catalog.add({
        ...sampleArtifact,
        urn: 'urn:protocol:event:user.updated:1.0.0',
        name: 'user.updated'
      });

      catalog.clear();

      expect(catalog.size()).toBe(0);
    });
  });

  describe('Query Methods', () => {
    beforeEach(() => {
      catalog.add(sampleArtifact);
      catalog.add({
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
            pii: true
          }
        }
      });
      catalog.add({
        urn: 'urn:protocol:api:user.service:1.0.0',
        name: 'user.service',
        version: '1.0.0',
        namespace: 'urn:protocol:api',
        type: 'api-protocol',
        manifest: 'https://example.com/user.service/manifest.json',
        dependencies: [],
        metadata: {
          tags: ['production'],
          governance: {
            classification: 'internal',
            owner: 'api-team',
            pii: false
          }
        }
      });
    });

    it('should find by tag', () => {
      const result = catalog.findByTag('gdpr');

      expect(result.count).toBe(2);
      expect(result.took).toBeGreaterThanOrEqual(0);
    });

    it('should find by namespace', () => {
      const result = catalog.findByNamespace('urn:protocol:event');

      expect(result.count).toBe(1);
      expect(result.results[0].urn).toBe('urn:protocol:event:user.created:1.0.0');
    });

    it('should find by owner', () => {
      const result = catalog.findByOwner('identity-team');

      expect(result.count).toBe(2);
    });

    it('should find by PII flag', () => {
      const withPII = catalog.findByPII(true);
      expect(withPII.count).toBe(2);

      const withoutPII = catalog.findByPII(false);
      expect(withoutPII.count).toBe(1);
    });

    it('should find by protocol type', () => {
      const result = catalog.findByType('event-protocol');

      expect(result.count).toBe(1);
      expect(result.results[0].type).toBe('event-protocol');
    });

    it('should find by classification', () => {
      const result = catalog.findByClassification('confidential');

      expect(result.count).toBe(2);
    });

    it('should handle complex governance queries', () => {
      const result = catalog.findByGovernance({
        owner: 'identity-team',
        pii: true,
        tags: ['gdpr']
      });

      expect(result.count).toBe(2);
    });

    it('should find by multiple tags (OR)', () => {
      const result = catalog.findByTagsOR(['authentication', 'production']);

      expect(result.count).toBe(3);
    });

    it('should find deprecated artifacts', () => {
      catalog.add({
        ...sampleArtifact,
        urn: 'urn:protocol:api:old.service:1.0.0',
        name: 'old.service',
        metadata: {
          ...sampleArtifact.metadata,
          deprecated: true,
          deprecationMessage: 'Use new service'
        }
      });

      const result = catalog.findDeprecated();

      expect(result.count).toBe(1);
    });

    it('should find by URN pattern', () => {
      const result = catalog.findByURNPattern('user');

      expect(result.count).toBe(3);
    });
  });

  describe('Graph Operations', () => {
    beforeEach(() => {
      // Create dependency chain: a -> b -> c -> d
      catalog.add({
        urn: 'urn:protocol:event:a:1.0.0',
        name: 'a',
        version: '1.0.0',
        namespace: 'urn:protocol:event',
        type: 'event-protocol',
        manifest: 'https://example.com/a/manifest.json',
        dependencies: ['urn:protocol:data:b:1.0.0'],
        metadata: {
          tags: [],
          governance: {
            classification: 'internal',
            owner: 'team-a',
            pii: false
          }
        }
      });
      catalog.add({
        urn: 'urn:protocol:data:b:1.0.0',
        name: 'b',
        version: '1.0.0',
        namespace: 'urn:protocol:data',
        type: 'data-protocol',
        manifest: 'https://example.com/b/manifest.json',
        dependencies: ['urn:protocol:api:c:1.0.0'],
        metadata: {
          tags: [],
          governance: {
            classification: 'internal',
            owner: 'team-b',
            pii: false
          }
        }
      });
      catalog.add({
        urn: 'urn:protocol:api:c:1.0.0',
        name: 'c',
        version: '1.0.0',
        namespace: 'urn:protocol:api',
        type: 'api-protocol',
        manifest: 'https://example.com/c/manifest.json',
        dependencies: ['urn:protocol:data:d:1.0.0'],
        metadata: {
          tags: [],
          governance: {
            classification: 'internal',
            owner: 'team-c',
            pii: false
          }
        }
      });
      catalog.add({
        urn: 'urn:protocol:data:d:1.0.0',
        name: 'd',
        version: '1.0.0',
        namespace: 'urn:protocol:data',
        type: 'data-protocol',
        manifest: 'https://example.com/d/manifest.json',
        dependencies: [],
        metadata: {
          tags: [],
          governance: {
            classification: 'internal',
            owner: 'team-d',
            pii: false
          }
        }
      });
    });

    it('should get dependency tree', () => {
      const tree = catalog.getDependencyTree('urn:protocol:event:a:1.0.0');

      expect(tree.size).toBe(4);
      expect(tree.has('urn:protocol:event:a:1.0.0')).toBe(true);
      expect(tree.has('urn:protocol:data:b:1.0.0')).toBe(true);
      expect(tree.has('urn:protocol:api:c:1.0.0')).toBe(true);
      expect(tree.has('urn:protocol:data:d:1.0.0')).toBe(true);
    });

    it('should find consumers', () => {
      const consumers = catalog.findConsumers('urn:protocol:data:d:1.0.0');

      expect(consumers.length).toBeGreaterThan(0);
    });

    it('should get build order', () => {
      const order = catalog.getBuildOrder('urn:protocol:event:a:1.0.0');

      expect(order.length).toBe(4);
      expect(order[0]).toBe('urn:protocol:data:d:1.0.0');
      expect(order[order.length - 1]).toBe('urn:protocol:event:a:1.0.0');

      // Verify build order is valid (dependencies before dependents)
      const dIndex = order.indexOf('urn:protocol:data:d:1.0.0');
      const cIndex = order.indexOf('urn:protocol:api:c:1.0.0');
      const bIndex = order.indexOf('urn:protocol:data:b:1.0.0');
      const aIndex = order.indexOf('urn:protocol:event:a:1.0.0');

      expect(dIndex).toBeLessThan(cIndex);
      expect(cIndex).toBeLessThan(bIndex);
      expect(bIndex).toBeLessThan(aIndex);
    });

    it('should get full build order', () => {
      const order = catalog.getFullBuildOrder();

      expect(order.length).toBe(4);
    });

    it('should detect no cycles in DAG', () => {
      const result = catalog.detectCycles();

      expect(result.hasCycle).toBe(false);
      expect(result.cycles.length).toBe(0);
    });

    it('should find path between nodes', () => {
      const path = catalog.findPath(
        'urn:protocol:event:a:1.0.0',
        'urn:protocol:data:d:1.0.0'
      );

      expect(path).not.toBeNull();
      expect(path?.length).toBe(4);
      expect(path?.[0]).toBe('urn:protocol:event:a:1.0.0');
      expect(path?.[3]).toBe('urn:protocol:data:d:1.0.0');
    });

    it('should return null when no path exists', () => {
      const path = catalog.findPath(
        'urn:protocol:data:d:1.0.0',
        'urn:protocol:event:a:1.0.0'
      );

      expect(path).toBeNull();
    });

    it('should get graph statistics', () => {
      const stats = catalog.getGraphStats();

      expect(stats.nodes).toBe(4);
      expect(stats.edges).toBe(3);
      expect(stats.avgDependencies).toBe(0.75);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      catalog.add(sampleArtifact);
      catalog.add({
        urn: 'urn:protocol:data:user:2.0.0',
        name: 'user',
        version: '2.0.0',
        namespace: 'urn:protocol:data',
        type: 'data-protocol',
        manifest: 'https://example.com/user/manifest.json',
        dependencies: [],
        metadata: {
          tags: ['gdpr'],
          governance: {
            classification: 'confidential',
            owner: 'identity-team',
            pii: true
          }
        }
      });
    });

    it('should get catalog statistics', () => {
      const stats = catalog.getStats();

      expect(stats.totalArtifacts).toBe(2);
      expect(stats.piiArtifacts).toBe(2);
      expect(stats.byType['event-protocol']).toBe(1);
      expect(stats.byType['data-protocol']).toBe(1);
      expect(stats.byClassification['confidential']).toBe(2);
    });
  });

  describe('Persistence', () => {
    const testFilePath = path.join(__dirname, 'test-catalog.json');

    afterEach(async () => {
      try {
        await fs.unlink(testFilePath);
      } catch (err) {
        // Ignore if file doesn't exist
      }
    });

    it('should save catalog to file', async () => {
      catalog.add(sampleArtifact);

      await catalog.save(testFilePath);

      const exists = await fs
        .access(testFilePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it('should load catalog from file', async () => {
      catalog.add(sampleArtifact);
      await catalog.save(testFilePath);

      const newCatalog = new URNCatalogIndex();
      await newCatalog.load(testFilePath);

      expect(newCatalog.size()).toBe(1);
      expect(newCatalog.get(sampleArtifact.urn)).toEqual(sampleArtifact);
    });

    it('should export to JSON string', () => {
      catalog.add(sampleArtifact);

      const json = catalog.toJSON();
      const parsed = JSON.parse(json);

      expect(parsed.version).toBe('1.0.0');
      expect(parsed.format).toBe('urn-catalog-v1');
      expect(Object.keys(parsed.artifacts).length).toBe(1);
    });

    it('should import from JSON string', () => {
      catalog.add(sampleArtifact);
      const json = catalog.toJSON();

      const newCatalog = new URNCatalogIndex();
      newCatalog.fromJSON(json);

      expect(newCatalog.size()).toBe(1);
      expect(newCatalog.get(sampleArtifact.urn)).toEqual(sampleArtifact);
    });

    it('should preserve indexes after save/load', async () => {
      catalog.add(sampleArtifact);
      await catalog.save(testFilePath);

      const newCatalog = new URNCatalogIndex();
      await newCatalog.load(testFilePath);

      const result = newCatalog.findByTag('gdpr');
      expect(result.count).toBe(1);
    });
  });

  describe('Performance Requirements', () => {
    it('should perform O(1) URN lookup in < 1ms', () => {
      // Add 10k artifacts
      for (let i = 0; i < 10000; i++) {
        catalog.add({
          urn: `urn:protocol:event:test${i}:1.0.0`,
          name: `test${i}`,
          version: '1.0.0',
          namespace: 'urn:protocol:event',
          type: 'event-protocol',
          manifest: `https://example.com/test${i}/manifest.json`,
          dependencies: [],
          metadata: {
            tags: ['test'],
            governance: {
              classification: 'internal',
              owner: 'test-team',
              pii: false
            }
          }
        });
      }

      const start = performance.now();
      catalog.get('urn:protocol:event:test5000:1.0.0');
      const took = performance.now() - start;

      expect(took).toBeLessThan(1);
    });

    it('should perform tag queries in < 10ms with 1000 results', () => {
      // Add artifacts with common tag
      for (let i = 0; i < 1000; i++) {
        catalog.add({
          urn: `urn:protocol:event:test${i}:1.0.0`,
          name: `test${i}`,
          version: '1.0.0',
          namespace: 'urn:protocol:event',
          type: 'event-protocol',
          manifest: `https://example.com/test${i}/manifest.json`,
          dependencies: [],
          metadata: {
            tags: ['production'],
            governance: {
              classification: 'internal',
              owner: 'test-team',
              pii: false
            }
          }
        });
      }

      const result = catalog.findByTag('production');

      expect(result.count).toBe(1000);
      expect(result.took).toBeLessThan(10);
    });

    it('should handle 10k artifacts without performance degradation', () => {
      const start = performance.now();

      for (let i = 0; i < 10000; i++) {
        catalog.add({
          urn: `urn:protocol:event:test${i}:1.0.0`,
          name: `test${i}`,
          version: '1.0.0',
          namespace: 'urn:protocol:event',
          type: 'event-protocol',
          manifest: `https://example.com/test${i}/manifest.json`,
          dependencies: [],
          metadata: {
            tags: ['test'],
            governance: {
              classification: 'internal',
              owner: 'test-team',
              pii: false
            }
          }
        });
      }

      const took = performance.now() - start;

      expect(catalog.size()).toBe(10000);
      expect(took).toBeLessThan(5000); // 5 seconds for 10k additions
    });
  });

  describe('Edge Cases', () => {
    it('should handle artifact with no dependencies', () => {
      const artifact = {
        ...sampleArtifact,
        dependencies: []
      };

      catalog.add(artifact);
      const tree = catalog.getDependencyTree(artifact.urn);

      expect(tree.size).toBe(1);
    });

    it('should handle artifact with no tags', () => {
      const artifact = {
        ...sampleArtifact,
        metadata: {
          ...sampleArtifact.metadata,
          tags: []
        }
      };

      catalog.add(artifact);
      const result = catalog.findByTag('nonexistent');

      expect(result.count).toBe(0);
    });

    it('should handle multiple additions of same artifact', () => {
      catalog.add(sampleArtifact);
      catalog.add(sampleArtifact); // Add again

      expect(catalog.size()).toBe(1); // Should not duplicate
    });

    it('should handle removal of artifact with dependents', () => {
      catalog.add({
        ...sampleArtifact,
        dependencies: []
      });
      catalog.add({
        urn: 'urn:protocol:event:dependent:1.0.0',
        name: 'dependent',
        version: '1.0.0',
        namespace: 'urn:protocol:event',
        type: 'event-protocol',
        manifest: 'https://example.com/dependent/manifest.json',
        dependencies: [sampleArtifact.urn],
        metadata: sampleArtifact.metadata
      });

      const removed = catalog.remove(sampleArtifact.urn);

      expect(removed).toBe(true);
      expect(catalog.size()).toBe(1);
    });
  });
});
