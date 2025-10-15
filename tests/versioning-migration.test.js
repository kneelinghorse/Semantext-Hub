#!/usr/bin/env node

/**
 * Tests for Protocol Versioning and Migration Tools
 * 
 * Comprehensive test suite covering:
 * - Version header support in manifests
 * - Migration CLI functionality
 * - Diff report generation
 * - Versioned manifest loading
 * - Cross-protocol validation
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProtocolMigrationEngine } from '../packages/runtime/cli/commands/migrate.js';
import { VersionedManifestLoader } from '../packages/runtime/util/versioned-manifest-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Protocol Versioning and Migration Tools', () => {
  let migrationEngine;
  let manifestLoader;
  let testManifests;

  beforeAll(async () => {
    migrationEngine = new ProtocolMigrationEngine();
    manifestLoader = new VersionedManifestLoader();
    
    // Create test manifests
    testManifests = {
      apiV1: {
        version: 'v1.0',
        service: {
          name: 'test-api',
          version: '1.0.0'
        },
        interface: {
          endpoints: [
            {
              method: 'GET',
              path: '/users',
              summary: 'Get users'
            }
          ]
        }
      },
      apiV2: {
        version: 'v2.0',
        service: {
          name: 'test-api',
          version: '2.0.0',
          apiVersion: '2.0',
          deprecated: false
        },
        interface: {
          endpoints: [
            {
              method: 'GET',
              path: '/users',
              summary: 'Get users'
            },
            {
              method: 'POST',
              path: '/users',
              summary: 'Create user'
            }
          ]
        }
      },
      dataV1: {
        version: 'v1.0',
        dataset: {
          name: 'test-dataset',
          type: 'fact-table'
        },
        schema: {
          fields: {
            id: { type: 'string', required: true },
            name: { type: 'string', required: true }
          }
        }
      },
      dataV2: {
        version: 'v2.0',
        dataset: {
          name: 'test-dataset',
          type: 'fact-table'
        },
        schema: {
          fields: {
            id: { type: 'string', required: true },
            name: { type: 'string', required: true },
            email: { type: 'string', required: false }
          }
        }
      }
    };
  });

  describe('Version Header Support', () => {
    test('should accept valid version formats', () => {
      const validVersions = ['v1.0', 'v1.1', 'v2.0'];
      
      validVersions.forEach(version => {
        const manifest = { version, service: { name: 'test' } };
        const validation = manifestLoader.validateVersion(version);
        expect(validation.valid).toBe(true);
      });
    });

    test('should reject invalid version formats', () => {
      const invalidVersions = ['1.0', 'v1', 'v1.0.0', 'version1', ''];
      
      invalidVersions.forEach(version => {
        const validation = manifestLoader.validateVersion(version);
        expect(validation.valid).toBe(false);
        expect(validation.error).toBeDefined();
      });
    });

    test('should detect protocol types correctly', () => {
      expect(manifestLoader.detectProtocolType(testManifests.apiV1)).toBe('api');
      expect(manifestLoader.detectProtocolType(testManifests.dataV1)).toBe('data');
      
      const eventManifest = { event: { name: 'test' } };
      expect(manifestLoader.detectProtocolType(eventManifest)).toBe('event');
      
      const agentManifest = { agent: { id: 'test' } };
      expect(manifestLoader.detectProtocolType(agentManifest)).toBe('agent');
    });
  });

  describe('Migration Engine', () => {
    test('should generate accurate diff reports', () => {
      const diffReport = migrationEngine.generateDiffReport(
        testManifests.apiV1,
        testManifests.apiV2
      );

      expect(diffReport.summary.fromVersion).toBe('v1.0');
      expect(diffReport.summary.toVersion).toBe('v2.0');
      expect(diffReport.changes).toBeDefined();
      expect(Array.isArray(diffReport.changes)).toBe(true);
      // Should detect changes in service section (apiVersion, deprecated fields added)
      expect(diffReport.summary.modifications).toBeGreaterThan(0);
    });

    test('should detect breaking changes', () => {
      const breakingManifest = {
        version: 'v2.0',
        service: {
          name: 'test-api'
        },
        interface: {
          endpoints: [] // Removed endpoints - breaking change
        }
      };

      const diffReport = migrationEngine.generateDiffReport(
        testManifests.apiV1,
        breakingManifest
      );

      expect(diffReport.summary.breakingChanges).toBeGreaterThan(0);
      expect(diffReport.breakingChanges.length).toBeGreaterThan(0);
    });

    test('should transform manifests between versions', () => {
      const transformed = migrationEngine.transformManifest(
        testManifests.apiV1,
        'v1.0',
        'v2.0'
      );

      expect(transformed.version).toBe('v2.0');
      expect(transformed.service.apiVersion).toBe('2.0');
      expect(transformed.service.deprecated).toBe(false);
    });

    test('should validate manifest structure', () => {
      const validation = migrationEngine.validateManifest(testManifests.apiV1);
      expect(validation.errors).toBeDefined();
      expect(validation.warnings).toBeDefined();
      expect(Array.isArray(validation.errors)).toBe(true);
      expect(Array.isArray(validation.warnings)).toBe(true);
    });
  });

  describe('Versioned Manifest Loader', () => {
    test('should load manifests with version validation', async () => {
      // Create temporary test file
      const testFile = path.join(__dirname, 'temp-test-manifest.json');
      await fs.writeFile(testFile, JSON.stringify(testManifests.apiV1, null, 2));

      try {
        const result = await manifestLoader.loadManifest(testFile);
        
        expect(result.manifest).toBeDefined();
        expect(result.metadata.version).toBe('v1.0');
        expect(result.metadata.protocolType).toBe('api');
        expect(result.metadata.validation).toBeDefined();
      } finally {
        // Clean up
        await fs.unlink(testFile).catch(() => {});
      }
    });

    test('should handle missing version field', async () => {
      const manifestWithoutVersion = { service: { name: 'test' } };
      const testFile = path.join(__dirname, 'temp-no-version.json');
      await fs.writeFile(testFile, JSON.stringify(manifestWithoutVersion, null, 2));

      try {
        const result = await manifestLoader.loadManifest(testFile);
        expect(result.manifest.version).toBe('v1.0'); // Default version
      } finally {
        await fs.unlink(testFile).catch(() => {});
      }
    });

    test('should validate manifest structure by protocol type', () => {
      const apiValidation = manifestLoader.validateManifestStructure(
        testManifests.apiV1,
        'api'
      );
      expect(apiValidation.errors.length).toBe(0);

      const invalidApiManifest = { version: 'v1.0' }; // Missing service and interface
      const invalidValidation = manifestLoader.validateManifestStructure(
        invalidApiManifest,
        'api'
      );
      expect(invalidValidation.errors.length).toBeGreaterThan(0);
    });

    test('should extract URN references', () => {
      const manifestWithURNs = {
        version: 'v1.0',
        service: { name: 'test' },
        relationships: {
          dependencies: ['urn:proto:api:user-service@1.0'],
          consumers: ['urn:proto:workflow:user-onboarding@1.1']
        }
      };

      const urnRefs = manifestLoader.extractURNReferences(manifestWithURNs);
      expect(urnRefs.length).toBe(2);
      expect(urnRefs[0].urn).toBe('urn:proto:api:user-service@1.0');
      expect(urnRefs[1].urn).toBe('urn:proto:workflow:user-onboarding@1.1');
    });

    test('should validate cross-references', () => {
      const crossReferences = new Map([
        ['file1.json', [
          { urn: 'urn:proto:api:service1@1.0', path: 'relationships.dependencies' }
        ]],
        ['file2.json', [
          { urn: 'urn:proto:api:service2@1.0', path: 'relationships.dependencies' }
        ]]
      ]);

      const validation = manifestLoader.validateCrossReferences(crossReferences);
      expect(validation.issues).toBeDefined();
      expect(Array.isArray(validation.issues)).toBe(true);
    });

    test('should determine version compatibility', () => {
      const compatible = manifestLoader.getVersionCompatibility('v1.0', 'v1.1');
      expect(compatible.compatible).toBe(true);
      expect(compatible.migrationRequired).toBe(true);

      const incompatible = manifestLoader.getVersionCompatibility('v2.0', 'v1.0');
      expect(incompatible.compatible).toBe(false);
      expect(incompatible.breakingChanges).toBe(true);

      const sameVersion = manifestLoader.getVersionCompatibility('v1.0', 'v1.0');
      expect(sameVersion.compatible).toBe(true);
      expect(sameVersion.migrationRequired).toBe(false);
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete migration workflow', async () => {
      // Test the complete workflow: load -> validate -> migrate -> diff
      const testFile = path.join(__dirname, 'temp-migration-test.json');
      await fs.writeFile(testFile, JSON.stringify(testManifests.apiV1, null, 2));

      try {
        // Load manifest
        const loadResult = await manifestLoader.loadManifest(testFile);
        expect(loadResult.manifest.version).toBe('v1.0');

        // Transform to v2.0
        const transformed = migrationEngine.transformManifest(
          loadResult.manifest,
          'v1.0',
          'v2.0'
        );

        // Generate diff report
        const diffReport = migrationEngine.generateDiffReport(
          loadResult.manifest,
          transformed
        );

        expect(diffReport.summary.fromVersion).toBe('v1.0');
        expect(diffReport.summary.toVersion).toBe('v2.0');
        expect(transformed.version).toBe('v2.0');

      } finally {
        await fs.unlink(testFile).catch(() => {});
      }
    });

    test('should handle multiple manifest types', async () => {
      const manifests = [
        testManifests.apiV1,
        testManifests.dataV1
      ];

      const testFiles = [];
      try {
        // Create temporary files
        for (let i = 0; i < manifests.length; i++) {
          const testFile = path.join(__dirname, `temp-multi-${i}.json`);
          await fs.writeFile(testFile, JSON.stringify(manifests[i], null, 2));
          testFiles.push(testFile);
        }

        // Load manifest set
        const result = await manifestLoader.loadManifestSet(testFiles);
        
        expect(result.summary.total).toBe(2);
        expect(result.summary.loaded).toBe(2);
        expect(result.summary.errors).toBe(0);
        expect(result.manifests.length).toBe(2);

      } finally {
        // Clean up
        for (const file of testFiles) {
          await fs.unlink(file).catch(() => {});
        }
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid JSON gracefully', async () => {
      const testFile = path.join(__dirname, 'temp-invalid.json');
      await fs.writeFile(testFile, '{ invalid json }');

      try {
        await expect(manifestLoader.loadManifest(testFile))
          .rejects
          .toThrow('Failed to load manifest');
      } finally {
        await fs.unlink(testFile).catch(() => {});
      }
    });

    test('should handle missing files gracefully', async () => {
      const missingFile = path.join(__dirname, 'non-existent-file.json');
      
      await expect(manifestLoader.loadManifest(missingFile))
        .rejects
        .toThrow('Failed to load manifest');
    });

    test('should handle unsupported file formats', async () => {
      const testFile = path.join(__dirname, 'temp-test.txt');
      await fs.writeFile(testFile, 'plain text content');

      try {
        await expect(manifestLoader.loadManifest(testFile))
          .rejects
          .toThrow('Unsupported file format');
      } finally {
        await fs.unlink(testFile).catch(() => {});
      }
    });
  });
});

// Export for use in other test files
export {
  ProtocolMigrationEngine,
  VersionedManifestLoader
};
