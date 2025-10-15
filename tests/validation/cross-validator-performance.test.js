/**
 * Performance Tests for CrossValidator
 * Tests validation performance for 100+ protocols to ensure <1s target
 */

import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { CrossValidator, RuleType, Severity } from '../../packages/protocols/validation/cross-validator.js';
import { ProtocolGraph } from '../../packages/protocols/core/graph/protocol-graph.js';

describe('CrossValidator Performance Tests', () => {
  let graph;
  let validator;

  beforeEach(() => {
    graph = new ProtocolGraph();
    validator = new CrossValidator(graph);
  });

  /**
   * Generate test manifests for performance testing
   */
  function generateTestManifests(count) {
    const manifests = [];
    const protocolTypes = [
      'api', 'data', 'event', 'workflow', 'agent', 'ui', 'infra', 'obs',
      'iam', 'release', 'config', 'docs', 'metric', 'testing', 'integration',
      'ai', 'device', 'semantic'
    ];

    for (let i = 0; i < count; i++) {
      const protocolType = protocolTypes[i % protocolTypes.length];
      const urn = `urn:proto:${protocolType}:test-${i}@1.0.0`;
      
      const manifest = {
        metadata: { urn, version: '1.0.0' },
        // Add protocol-specific fields
        ...(protocolType === 'api' && {
          catalog: {
            endpoints: [
              { path: `/api/test-${i}`, method: 'GET' },
              { path: `/api/test-${i}/data`, method: 'POST' }
            ]
          }
        }),
        ...(protocolType === 'data' && {
          service: {
            entities: [
              { name: `entity-${i}`, schema: { type: 'object' } }
            ]
          }
        }),
        ...(protocolType === 'event' && {
          event: {
            channels: [
              { name: `channel-${i}`, type: 'topic' }
            ]
          }
        }),
        ...(protocolType === 'workflow' && {
          workflow: {
            steps: [
              { id: `step-${i}`, type: 'task' }
            ]
          }
        }),
        ...(protocolType === 'agent' && {
          agent: {
            capabilities: {
              tools: [
                { name: `tool-${i}`, description: `Test tool ${i}` }
              ]
            }
          }
        }),
        // Add cross-references to create dependency chains
        dependencies: {
          depends_on: i > 0 ? [`urn:proto:${protocolTypes[(i-1) % protocolTypes.length]}:test-${i-1}@1.0.0`] : []
        }
      };

      manifests.push(manifest);
      graph.addNode(urn, protocolType, manifest);
    }

    return manifests;
  }

  describe('Performance Benchmarks', () => {
    test('should validate 100 protocols in under 1 second', async () => {
      const manifests = generateTestManifests(100);
      
      const startTime = performance.now();
      
      for (const manifest of manifests) {
        const result = validator.validate(manifest);
        expect(result).toBeDefined();
        expect(result.valid).toBeDefined();
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      console.log(`Validated 100 protocols in ${totalTime.toFixed(2)}ms`);
      expect(totalTime).toBeLessThan(1000); // < 1 second
    });

    test('should validate 200 protocols in under 2 seconds', async () => {
      const manifests = generateTestManifests(200);
      
      const startTime = performance.now();
      
      for (const manifest of manifests) {
        const result = validator.validate(manifest);
        expect(result).toBeDefined();
        expect(result.valid).toBeDefined();
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      console.log(`Validated 200 protocols in ${totalTime.toFixed(2)}ms`);
      expect(totalTime).toBeLessThan(2000); // < 2 seconds
    });

    test('should handle complex dependency chains efficiently', async () => {
      const manifests = generateTestManifests(50);
      
      // Create circular dependencies for testing
      const circularManifest = {
        metadata: { urn: 'urn:proto:api:circular@1.0.0' },
        catalog: { endpoints: [{ path: '/circular', method: 'GET' }] },
        dependencies: {
          depends_on: ['urn:proto:data:test-49@1.0.0']
        }
      };
      
      // Add circular dependency
      const lastManifest = manifests[manifests.length - 1];
      lastManifest.dependencies.depends_on.push('urn:proto:api:circular@1.0.0');
      
      graph.addNode('urn:proto:api:circular@1.0.0', 'api', circularManifest);
      
      const startTime = performance.now();
      
      const result = validator.validate(circularManifest);
      
      const endTime = performance.now();
      const validationTime = endTime - startTime;
      
      console.log(`Circular dependency detection took ${validationTime.toFixed(2)}ms`);
      expect(validationTime).toBeLessThan(100); // < 100ms for circular detection
      expect(result.issues.warnings.length).toBeGreaterThan(0);
    });

    test('should cache protocol type extraction efficiently', async () => {
      const manifests = generateTestManifests(100);
      
      const startTime = performance.now();
      
      // First pass - populate cache
      for (const manifest of manifests) {
        validator._extractProtocolType(manifest);
      }
      
      // Second pass - should use cache
      for (const manifest of manifests) {
        validator._extractProtocolType(manifest);
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      console.log(`Protocol type extraction with caching took ${totalTime.toFixed(2)}ms`);
      expect(totalTime).toBeLessThan(50); // < 50ms with caching
    });

    test('should cache dependency resolution efficiently', async () => {
      const manifests = generateTestManifests(100);
      
      const startTime = performance.now();
      
      // First pass - populate cache
      for (const manifest of manifests) {
        const urn = manifest.metadata.urn;
        validator._getAllDependencies(urn);
      }
      
      // Second pass - should use cache
      for (const manifest of manifests) {
        const urn = manifest.metadata.urn;
        validator._getAllDependencies(urn);
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      console.log(`Dependency resolution with caching took ${totalTime.toFixed(2)}ms`);
      expect(totalTime).toBeLessThan(100); // < 100ms with caching
    });

    test('should handle URN validation efficiently', async () => {
      const manifests = generateTestManifests(100);
      
      const startTime = performance.now();
      
      for (const manifest of manifests) {
        const result = validator.validateURNReferences(manifest);
        expect(result).toBeDefined();
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      console.log(`URN validation for 100 protocols took ${totalTime.toFixed(2)}ms`);
      expect(totalTime).toBeLessThan(200); // < 200ms for URN validation
    });

    test('should handle integration conflict detection efficiently', async () => {
      const manifests = generateTestManifests(100);
      
      const startTime = performance.now();
      
      for (const manifest of manifests) {
        const result = validator.validateIntegrationConflicts(manifest);
        expect(result).toBeDefined();
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      console.log(`Integration conflict detection for 100 protocols took ${totalTime.toFixed(2)}ms`);
      expect(totalTime).toBeLessThan(500); // < 500ms for conflict detection
    });

    test('should provide performance metrics in validation results', async () => {
      const manifest = generateTestManifests(1)[0];
      
      const result = validator.validate(manifest);
      
      expect(result.performance).toBeDefined();
      expect(result.performance.validationTime).toBeGreaterThan(0);
      expect(result.performance.rulesExecuted).toBeGreaterThan(0);
      expect(result.performance.averageRuleTime).toBeGreaterThan(0);
      
      console.log(`Validation performance metrics:`, result.performance);
    });
  });

  describe('Memory Usage Tests', () => {
    test('should not leak memory during validation', async () => {
      const manifests = generateTestManifests(100);
      
      const initialMemory = process.memoryUsage();
      
      // Run validation multiple times
      for (let i = 0; i < 10; i++) {
        for (const manifest of manifests) {
          validator.validate(manifest);
        }
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      console.log(`Memory increase after 1000 validations: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
      
      // Memory increase should be reasonable (< 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    test('should clear caches when needed', async () => {
      const manifests = generateTestManifests(50);
      
      // Populate caches
      for (const manifest of manifests) {
        validator.validate(manifest);
      }
      
      expect(validator._protocolTypeCache.size).toBeGreaterThan(0);
      expect(validator._dependencyCache.size).toBeGreaterThan(0);
      
      // Clear caches
      validator._protocolTypeCache.clear();
      validator._dependencyCache.clear();
      validator._conflictCache.clear();
      
      expect(validator._protocolTypeCache.size).toBe(0);
      expect(validator._dependencyCache.size).toBe(0);
      expect(validator._conflictCache.size).toBe(0);
    });
  });
});
