/**
 * Property/Fuzz Tests for Catalog Index Adapter
 * 
 * Tests catalog import operations with random inputs to ensure robustness
 * and catch edge cases that might cause flakiness.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { CatalogIndexAdapter, createCatalogAdapter } from '../../../packages/protocols/core/registration/adapters/catalog-index.mjs';
import { URNCatalogIndex } from '../../../packages/protocols/src/catalog/index.js';
import { deflake } from '../../util/deflake.js';

describe('Catalog Index Adapter Property Tests', () => {
  let adapter;
  let catalogIndex;
  let isolationContext;

  beforeEach(() => {
    catalogIndex = new URNCatalogIndex();
    adapter = new CatalogIndexAdapter(catalogIndex);
    isolationContext = deflake.createIsolationContext();
  });

  describe('Conflict Detection Properties', () => {
    it('should always reject null/undefined URNs', async () => {
      for (let i = 0; i < 50; i++) {
        const testData = deflake.generateDeterministicData(`null_urn_${i}`, {
          urn: 'null'
        });

        let urn;
        if (testData.urn === 'null') {
          urn = null;
        } else {
          urn = undefined;
        }

        const result = adapter.checkConflict(urn);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('URN is required');
        expect(result.checkTime).toBeDefined();
        expect(result.checkTime).toBeLessThan(5); // Performance target
      }
    });

    it('should always detect conflicts for existing URNs', async () => {
      // Pre-populate catalog with some URNs
      const existingUrns = [];
      for (let i = 0; i < 20; i++) {
        const urn = `urn:proto:api:test.com/service${i}@1.0.0`;
        const manifest = {
          urn,
          type: 'api',
          namespace: 'test.com',
          metadata: {
            governance: { version: '1.0.0' },
            tags: ['test']
          }
        };
        catalogIndex.add(manifest);
        existingUrns.push(urn);
      }

      for (let i = 0; i < 50; i++) {
        const urn = existingUrns[i % existingUrns.length];
        const result = adapter.checkConflict(urn);

        expect(result.conflict).toBe(true);
        expect(result.existingUrn).toBe(urn);
        expect(result.existingManifest).toBeDefined();
        expect(result.checkTime).toBeLessThan(5); // Performance target
        expect(result.message).toContain('already registered');
      }
    });

    it('should always pass conflict check for non-existing URNs', async () => {
      for (let i = 0; i < 100; i++) {
        const urn = `urn:proto:api:test.com/nonexistent${i}@1.0.0`;
        const result = adapter.checkConflict(urn);

        expect(result.conflict).toBe(false);
        expect(result.urn).toBe(urn);
        expect(result.checkTime).toBeLessThan(5); // Performance target
      }
    });

    it('should always handle invalid URN formats gracefully', async () => {
      const invalidUrns = [
        'not-a-urn',
        'urn:invalid',
        'urn:proto:',
        'urn:proto:api:',
        'urn:proto:api:test.com',
        'urn:proto:api:test.com/service',
        'urn:proto:api:test.com/service@',
        'urn:proto:api:test.com/service@1',
        'urn:proto:api:test.com/service@1.0',
        '',
        null,
        undefined,
        {},
        [],
        123
      ];

      for (let i = 0; i < invalidUrns.length; i++) {
        const urn = invalidUrns[i];
        const result = adapter.checkConflict(urn);

        if (urn === null || urn === undefined) {
          expect(result.valid).toBe(false);
          expect(result.error).toBe('URN is required');
        } else {
          // Should not throw, but may or may not detect conflict
          expect(result).toBeDefined();
          expect(result.checkTime).toBeDefined();
        }
      }
    });
  });

  describe('Manifest Validation Properties', () => {
    it('should always reject null/undefined manifests', async () => {
      for (let i = 0; i < 50; i++) {
        const testData = deflake.generateDeterministicData(`null_manifest_${i}`, {
          manifest: 'null'
        });

        let manifest;
        if (testData.manifest === 'null') {
          manifest = null;
        } else {
          manifest = undefined;
        }

        const result = adapter.validateManifest(manifest);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Manifest is required');
      }
    });

    it('should always reject manifests missing required fields', async () => {
      const incompleteManifests = [
        {}, // Empty object
        { urn: 'urn:proto:api:test.com/service@1.0.0' }, // Missing type
        { type: 'api' }, // Missing urn
        { urn: 'urn:proto:api:test.com/service@1.0.0', type: 'api' }, // Missing namespace
        { urn: 'urn:proto:api:test.com/service@1.0.0', type: 'api', namespace: 'test.com' }, // Missing metadata
        { urn: 'urn:proto:api:test.com/service@1.0.0', type: 'api', namespace: 'test.com', metadata: {} }, // Missing governance
        { urn: 'urn:proto:api:test.com/service@1.0.0', type: 'api', namespace: 'test.com', metadata: { governance: {} } }, // Missing tags
        { urn: 'urn:proto:api:test.com/service@1.0.0', type: 'api', namespace: 'test.com', metadata: { governance: {}, tags: 'not-array' } } // Invalid tags
      ];

      for (let i = 0; i < incompleteManifests.length; i++) {
        const manifest = incompleteManifests[i];
        const result = adapter.validateManifest(manifest);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it('should always accept valid manifests', async () => {
      for (let i = 0; i < 100; i++) {
        const testData = deflake.generateDeterministicData(`valid_manifest_${i}`, {
          urn: 'string',
          type: 'string',
          namespace: 'string'
        });

        const manifest = {
          urn: `urn:proto:api:test.com/service${i}@1.0.0`,
          type: 'api',
          namespace: 'test.com',
          metadata: {
            governance: { version: '1.0.0' },
            tags: ['test', 'api']
          }
        };

        const result = adapter.validateManifest(manifest);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }
    });

    it('should always validate URN format in manifests', async () => {
      const invalidUrnManifests = [
        { urn: 'not-a-urn', type: 'api', namespace: 'test.com', metadata: { governance: {}, tags: [] } },
        { urn: 'urn:invalid', type: 'api', namespace: 'test.com', metadata: { governance: {}, tags: [] } },
        { urn: 'urn:proto:api:test.com/service@', type: 'api', namespace: 'test.com', metadata: { governance: {}, tags: [] } },
        { urn: '', type: 'api', namespace: 'test.com', metadata: { governance: {}, tags: [] } },
        { urn: null, type: 'api', namespace: 'test.com', metadata: { governance: {}, tags: [] } },
        { urn: undefined, type: 'api', namespace: 'test.com', metadata: { governance: {}, tags: [] } }
      ];

      for (let i = 0; i < invalidUrnManifests.length; i++) {
        const manifest = invalidUrnManifests[i];
        const result = adapter.validateManifest(manifest);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Manifest must have a URN');
      }
    });
  });

  describe('Registration Eligibility Properties', () => {
    it('should always reject invalid manifests for registration', async () => {
      for (let i = 0; i < 50; i++) {
        const invalidManifest = {
          // Missing required fields
          type: 'api'
        };

        const result = adapter.canRegister(invalidManifest);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('Manifest validation failed');
        expect(result.errors).toBeDefined();
        expect(result.checkTime).toBeDefined();
      }
    });

    it('should always reject conflicting URNs for registration', async () => {
      // Pre-register a manifest
      const existingManifest = {
        urn: 'urn:proto:api:test.com/existing@1.0.0',
        type: 'api',
        namespace: 'test.com',
        metadata: {
          governance: { version: '1.0.0' },
          tags: ['test']
        }
      };
      catalogIndex.add(existingManifest);

      for (let i = 0; i < 20; i++) {
        const conflictingManifest = {
          urn: 'urn:proto:api:test.com/existing@1.0.0', // Same URN
          type: 'api',
          namespace: 'test.com',
          metadata: {
            governance: { version: '1.0.0' },
            tags: ['test']
          }
        };

        const result = adapter.canRegister(conflictingManifest);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('URN conflict detected');
        expect(result.conflict).toBeDefined();
        expect(result.conflict.conflict).toBe(true);
      }
    });

    it('should always allow valid non-conflicting manifests', async () => {
      for (let i = 0; i < 100; i++) {
        const manifest = {
          urn: `urn:proto:api:test.com/service${i}@1.0.0`,
          type: 'api',
          namespace: 'test.com',
          metadata: {
            governance: { version: '1.0.0' },
            tags: ['test']
          }
        };

        const result = adapter.canRegister(manifest);
        expect(result.allowed).toBe(true);
        expect(result.urn).toBe(manifest.urn);
        expect(result.checkTime).toBeDefined();
      }
    });
  });

  describe('Registration Operations Properties', () => {
    it('should always register valid manifests successfully', async () => {
      for (let i = 0; i < 100; i++) {
        const manifest = {
          urn: `urn:proto:api:test.com/service${i}@1.0.0`,
          type: 'api',
          namespace: 'test.com',
          metadata: {
            governance: { version: '1.0.0' },
            tags: ['test']
          }
        };

        const result = adapter.register(manifest);
        expect(result.success).toBe(true);
        expect(result.urn).toBe(manifest.urn);
        expect(result.registeredAt).toBeDefined();
        expect(result.registrationTime).toBeDefined();
        expect(result.registrationTime).toBeLessThan(50); // Performance target

        // Verify it was actually registered
        expect(adapter.has(manifest.urn)).toBe(true);
        expect(adapter.get(manifest.urn)).toBeDefined();
      }
    });

    it('should always fail registration for invalid manifests', async () => {
      for (let i = 0; i < 50; i++) {
        const invalidManifest = {
          // Missing required fields
          type: 'api'
        };

        const result = adapter.register(invalidManifest);
        expect(result.success).toBe(false);
        expect(result.reason).toBe('Manifest validation failed');
        expect(result.errors).toBeDefined();
      }
    });

    it('should always fail registration for conflicting URNs', async () => {
      // Pre-register a manifest
      const existingManifest = {
        urn: 'urn:proto:api:test.com/conflict@1.0.0',
        type: 'api',
        namespace: 'test.com',
        metadata: {
          governance: { version: '1.0.0' },
          tags: ['test']
        }
      };
      catalogIndex.add(existingManifest);

      for (let i = 0; i < 20; i++) {
        const conflictingManifest = {
          urn: 'urn:proto:api:test.com/conflict@1.0.0',
          type: 'api',
          namespace: 'test.com',
          metadata: {
            governance: { version: '1.0.0' },
            tags: ['test']
          }
        };

        const result = adapter.register(conflictingManifest);
        expect(result.success).toBe(false);
        expect(result.reason).toBe('URN conflict detected');
        expect(result.conflict).toBeDefined();
      }
    });
  });

  describe('Unregistration Properties', () => {
    it('should always unregister existing URNs successfully', async () => {
      // Pre-register some manifests
      const urns = [];
      for (let i = 0; i < 50; i++) {
        const urn = `urn:proto:api:test.com/service${i}@1.0.0`;
        const manifest = {
          urn,
          type: 'api',
          namespace: 'test.com',
          metadata: {
            governance: { version: '1.0.0' },
            tags: ['test']
          }
        };
        catalogIndex.add(manifest);
        urns.push(urn);
      }

      for (let i = 0; i < urns.length; i++) {
        const urn = urns[i];
        const result = adapter.unregister(urn);

        expect(result.success).toBe(true);
        expect(result.urn).toBe(urn);
        expect(result.unregisteredAt).toBeDefined();
        expect(result.unregistrationTime).toBeDefined();

        // Verify it was actually unregistered
        expect(adapter.has(urn)).toBe(false);
        expect(adapter.get(urn)).toBeUndefined();
      }
    });

    it('should always handle unregistration of non-existing URNs', async () => {
      for (let i = 0; i < 50; i++) {
        const urn = `urn:proto:api:test.com/nonexistent${i}@1.0.0`;
        const result = adapter.unregister(urn);

        expect(result.success).toBe(false);
        expect(result.urn).toBe(urn);
        expect(result.unregisteredAt).toBeDefined();
        expect(result.unregistrationTime).toBeDefined();
      }
    });
  });

  describe('Query Operations Properties', () => {
    it('should always find manifests by namespace', async () => {
      // Pre-register manifests with different namespaces
      const namespaces = ['test.com', 'example.org', 'demo.net'];
      for (let i = 0; i < 30; i++) {
        const namespace = namespaces[i % namespaces.length];
        const manifest = {
          urn: `urn:proto:api:${namespace}/service${i}@1.0.0`,
          type: 'api',
          namespace,
          metadata: {
            governance: { version: '1.0.0' },
            tags: ['test']
          }
        };
        catalogIndex.add(manifest);
      }

      for (let i = 0; i < namespaces.length; i++) {
        const namespace = namespaces[i];
        const result = adapter.findByNamespace(namespace);

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(10); // 30 total / 3 namespaces = 10 each
        result.forEach(manifest => {
          expect(manifest.namespace).toBe(namespace);
        });
      }
    });

    it('should always find manifests by type', async () => {
      // Pre-register manifests with different types
      const types = ['api', 'data', 'event'];
      for (let i = 0; i < 30; i++) {
        const type = types[i % types.length];
        const manifest = {
          urn: `urn:proto:${type}:test.com/service${i}@1.0.0`,
          type,
          namespace: 'test.com',
          metadata: {
            governance: { version: '1.0.0' },
            tags: ['test']
          }
        };
        catalogIndex.add(manifest);
      }

      for (let i = 0; i < types.length; i++) {
        const type = types[i];
        const result = adapter.findByType(type);

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(10); // 30 total / 3 types = 10 each
        result.forEach(manifest => {
          expect(manifest.type).toBe(type);
        });
      }
    });

    it('should always return correct catalog statistics', async () => {
      // Pre-register some manifests
      for (let i = 0; i < 25; i++) {
        const manifest = {
          urn: `urn:proto:api:test.com/service${i}@1.0.0`,
          type: 'api',
          namespace: 'test.com',
          metadata: {
            governance: { version: '1.0.0' },
            tags: ['test']
          }
        };
        catalogIndex.add(manifest);
      }

      const stats = adapter.getStats();
      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');

      const size = adapter.size();
      expect(size).toBe(25);

      const urns = adapter.listURNs();
      expect(Array.isArray(urns)).toBe(true);
      expect(urns.length).toBe(25);

      const manifests = adapter.listAll();
      expect(Array.isArray(manifests)).toBe(true);
      expect(manifests.length).toBe(25);
    });
  });

  describe('Dependency Management Properties', () => {
    it('should always check dependencies correctly', async () => {
      // Pre-register some manifests
      const baseManifests = [];
      for (let i = 0; i < 10; i++) {
        const urn = `urn:proto:api:test.com/base${i}@1.0.0`;
        const manifest = {
          urn,
          type: 'api',
          namespace: 'test.com',
          metadata: {
            governance: { version: '1.0.0' },
            tags: ['test']
          }
        };
        catalogIndex.add(manifest);
        baseManifests.push(urn);
      }

      for (let i = 0; i < 20; i++) {
        const manifest = {
          urn: `urn:proto:api:test.com/service${i}@1.0.0`,
          type: 'api',
          namespace: 'test.com',
          metadata: {
            governance: { version: '1.0.0' },
            tags: ['test']
          },
          dependencies: [
            baseManifests[i % baseManifests.length], // Some exist
            `urn:proto:api:test.com/nonexistent${i}@1.0.0` // Some don't
          ]
        };

        const result = adapter.checkDependencies(manifest);
        expect(result).toBeDefined();
        expect(result.totalDependencies).toBe(2);
        expect(result.found).toBe(1);
        expect(result.missing).toBe(1);
        expect(result.missingURNs).toContain(`urn:proto:api:test.com/nonexistent${i}@1.0.0`);
        expect(result.allExist).toBe(false);
      }
    });

    it('should always detect circular dependencies', async () => {
      // Create circular dependency
      const manifest1 = {
        urn: 'urn:proto:api:test.com/service1@1.0.0',
        type: 'api',
        namespace: 'test.com',
        metadata: {
          governance: { version: '1.0.0' },
          tags: ['test']
        },
        dependencies: ['urn:proto:api:test.com/service2@1.0.0']
      };

      const manifest2 = {
        urn: 'urn:proto:api:test.com/service2@1.0.0',
        type: 'api',
        namespace: 'test.com',
        metadata: {
          governance: { version: '1.0.0' },
          tags: ['test']
        },
        dependencies: ['urn:proto:api:test.com/service1@1.0.0']
      };

      catalogIndex.add(manifest1);
      catalogIndex.add(manifest2);

      for (let i = 0; i < 10; i++) {
        const result = adapter.detectCycles();
        expect(result).toBeDefined();
        expect(result.hasCycles).toBe(true);
        expect(result.cycles).toBeDefined();
        expect(Array.isArray(result.cycles)).toBe(true);
        expect(result.cycles.length).toBeGreaterThan(0);
      }
    });

    it('should always find consumers correctly', async () => {
      // Pre-register base manifest
      const baseUrn = 'urn:proto:api:test.com/base@1.0.0';
      const baseManifest = {
        urn: baseUrn,
        type: 'api',
        namespace: 'test.com',
        metadata: {
          governance: { version: '1.0.0' },
          tags: ['test']
        }
      };
      catalogIndex.add(baseManifest);

      // Register consumers
      for (let i = 0; i < 10; i++) {
        const consumerManifest = {
          urn: `urn:proto:api:test.com/consumer${i}@1.0.0`,
          type: 'api',
          namespace: 'test.com',
          metadata: {
            governance: { version: '1.0.0' },
            tags: ['test']
          },
          dependencies: [baseUrn]
        };
        catalogIndex.add(consumerManifest);
      }

      for (let i = 0; i < 5; i++) {
        const consumers = adapter.findConsumers(baseUrn);
        expect(Array.isArray(consumers)).toBe(true);
        expect(consumers.length).toBe(10);
        consumers.forEach(consumer => {
          expect(consumer.dependencies).toContain(baseUrn);
        });
      }
    });
  });

  describe('Performance Properties', () => {
    it('should always complete operations within performance targets', async () => {
      // Pre-register many manifests
      for (let i = 0; i < 1000; i++) {
        const manifest = {
          urn: `urn:proto:api:test.com/service${i}@1.0.0`,
          type: 'api',
          namespace: 'test.com',
          metadata: {
            governance: { version: '1.0.0' },
            tags: ['test']
          }
        };
        catalogIndex.add(manifest);
      }

      for (let i = 0; i < 50; i++) {
        const startTime = performance.now();
        
        // Test conflict check performance
        const conflictResult = adapter.checkConflict(`urn:proto:api:test.com/service${i}@1.0.0`);
        const conflictTime = performance.now() - startTime;
        expect(conflictTime).toBeLessThan(5); // <5ms target

        // Test registration performance
        const manifest = {
          urn: `urn:proto:api:test.com/newservice${i}@1.0.0`,
          type: 'api',
          namespace: 'test.com',
          metadata: {
            governance: { version: '1.0.0' },
            tags: ['test']
          }
        };
        
        const regStartTime = performance.now();
        const regResult = adapter.register(manifest);
        const regTime = performance.now() - regStartTime;
        expect(regTime).toBeLessThan(50); // <50ms target
        expect(regResult.success).toBe(true);
      }
    });

    it('should always handle large catalogs efficiently', async () => {
      // Create large catalog
      for (let i = 0; i < 5000; i++) {
        const manifest = {
          urn: `urn:proto:api:test.com/service${i}@1.0.0`,
          type: 'api',
          namespace: 'test.com',
          metadata: {
            governance: { version: '1.0.0' },
            tags: ['test']
          }
        };
        catalogIndex.add(manifest);
      }

      const startTime = performance.now();
      
      // Test various operations
      const stats = adapter.getStats();
      const size = adapter.size();
      const urns = adapter.listURNs();
      const manifests = adapter.listAll();
      
      const duration = performance.now() - startTime;
      
      expect(stats).toBeDefined();
      expect(size).toBe(5000);
      expect(urns.length).toBe(5000);
      expect(manifests.length).toBe(5000);
      expect(duration).toBeLessThan(1000); // Should handle large catalog within 1s
    });
  });

  describe('Concurrency Properties', () => {
    it('should handle concurrent registrations safely', async () => {
      for (let i = 0; i < 5; i++) {
        const registrations = Array.from({ length: 20 }, (_, j) => {
          const manifest = {
            urn: `urn:proto:api:test.com/concurrent${i}_${j}@1.0.0`,
            type: 'api',
            namespace: 'test.com',
            metadata: {
              governance: { version: '1.0.0' },
              tags: ['test']
            }
          };
          return adapter.register(manifest);
        });

        const results = await Promise.all(registrations);
        
        expect(results).toHaveLength(20);
        results.forEach((result, j) => {
          expect(result.success).toBe(true);
          expect(result.urn).toBe(`urn:proto:api:test.com/concurrent${i}_${j}@1.0.0`);
        });
      }
    });

    it('should handle concurrent queries safely', async () => {
      // Pre-register manifests
      for (let i = 0; i < 100; i++) {
        const manifest = {
          urn: `urn:proto:api:test.com/service${i}@1.0.0`,
          type: 'api',
          namespace: 'test.com',
          metadata: {
            governance: { version: '1.0.0' },
            tags: ['test']
          }
        };
        catalogIndex.add(manifest);
      }

      for (let i = 0; i < 5; i++) {
        const queries = Array.from({ length: 10 }, (_, j) => {
          return adapter.findByNamespace('test.com');
        });

        const results = await Promise.all(queries);
        
        expect(results).toHaveLength(10);
        results.forEach(result => {
          expect(Array.isArray(result)).toBe(true);
          expect(result.length).toBe(100);
        });
      }
    });
  });
});
