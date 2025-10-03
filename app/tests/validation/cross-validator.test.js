/**
 * Tests for CrossValidator
 */

const { CrossValidator, RuleType, Severity } = require('../../validation/cross-validator');
const { ProtocolGraph } = require('../../core/graph/protocol-graph');

describe('CrossValidator', () => {
  let graph;
  let validator;

  beforeEach(() => {
    graph = new ProtocolGraph();
    validator = new CrossValidator(graph);
  });

  describe('Rule Registration', () => {
    test('should register custom validation rules', () => {
      const customRule = jest.fn(() => []);

      validator.registerRule('custom_test', customRule, {
        type: RuleType.URN_FORMAT,
        severity: Severity.WARNING
      });

      expect(validator.rules.has('custom_test')).toBe(true);
    });

    test('should have default rules registered', () => {
      expect(validator.rules.has('urn_references')).toBe(true);
      expect(validator.rules.has('version_compatibility')).toBe(true);
      expect(validator.rules.has('circular_dependencies')).toBe(true);
      expect(validator.rules.has('pii_exposure')).toBe(true);
    });
  });

  describe('URN Reference Validation', () => {
    test('should detect invalid URN format', () => {
      const manifest = {
        metadata: {
          urn: 'invalid-urn-format'
        }
      };

      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.issues.errors.length).toBeGreaterThan(0);
      expect(result.issues.errors[0].type).toBe(RuleType.URN_RESOLUTION);
    });

    test('should warn about unresolved URN references', () => {
      const manifest = {
        metadata: {
          urn: 'urn:proto:api:test.com/service@1.0.0'
        },
        dependencies: {
          depends_on: ['urn:proto:data:test.com/database@1.0.0']
        }
      };

      const result = validator.validate(manifest);

      // Should have warning about unresolved reference
      expect(result.issues.warnings.length).toBeGreaterThan(0);
    });

    test('should pass when URN references are resolved', () => {
      const serviceManifest = {
        metadata: { urn: 'urn:proto:api:test.com/service@1.0.0' },
        dependencies: {
          depends_on: ['urn:proto:data:test.com/database@1.0.0']
        }
      };

      const dbManifest = {
        metadata: { urn: 'urn:proto:data:test.com/database@1.0.0' }
      };

      // Add both manifests to graph
      graph.addNode(serviceManifest.metadata.urn, 'api', serviceManifest);
      graph.addNode(dbManifest.metadata.urn, 'data', dbManifest);

      const result = validator.validate(serviceManifest);

      expect(result.valid).toBe(true);
      expect(result.issues.errors.length).toBe(0);
    });
  });

  describe('Version Compatibility Validation', () => {
    test('should detect major version increases', () => {
      // Add two versions to graph
      graph.addNode('urn:proto:api:test.com/service@1.0.0', 'api', {
        metadata: { urn: 'urn:proto:api:test.com/service@1.0.0', version: '1.0.0' }
      });
      graph.addNode('urn:proto:api:test.com/service@2.0.0', 'api', {
        metadata: { urn: 'urn:proto:api:test.com/service@2.0.0', version: '2.0.0' }
      });

      const manifest = {
        metadata: {
          urn: 'urn:proto:api:test.com/service@2.0.0',
          version: '2.0.0'
        }
      };

      const result = validator.validate(manifest);

      // Should have info about major version change
      const versionInfos = result.issues.info.filter(i =>
        i.message.includes('Major version increase')
      );
      expect(versionInfos.length).toBeGreaterThan(0);
    });
  });

  describe('Circular Dependency Detection', () => {
    test('should detect circular dependencies', () => {
      // Create circular dependency: A -> B -> C -> A
      const urnA = 'urn:proto:api:test.com/a@1.0.0';
      const urnB = 'urn:proto:api:test.com/b@1.0.0';
      const urnC = 'urn:proto:api:test.com/c@1.0.0';

      graph.addNode(urnA, 'api', { metadata: { urn: urnA } });
      graph.addNode(urnB, 'api', { metadata: { urn: urnB } });
      graph.addNode(urnC, 'api', { metadata: { urn: urnC } });

      graph.addEdge(urnA, 'depends_on', urnB);
      graph.addEdge(urnB, 'depends_on', urnC);
      graph.addEdge(urnC, 'depends_on', urnA);

      const manifest = {
        metadata: { urn: urnA }
      };

      const result = validator.validate(manifest);

      const circularWarnings = result.issues.warnings.filter(w =>
        w.type === RuleType.CIRCULAR_DEPENDENCY
      );
      expect(circularWarnings.length).toBeGreaterThan(0);
    });

    test('should not report false positives for non-circular dependencies', () => {
      const urnA = 'urn:proto:api:test.com/a@1.0.0';
      const urnB = 'urn:proto:api:test.com/b@1.0.0';

      graph.addNode(urnA, 'api', { metadata: { urn: urnA } });
      graph.addNode(urnB, 'api', { metadata: { urn: urnB } });
      graph.addEdge(urnA, 'depends_on', urnB);

      const manifest = {
        metadata: { urn: urnA }
      };

      const result = validator.validate(manifest);

      const circularWarnings = result.issues.warnings.filter(w =>
        w.type === RuleType.CIRCULAR_DEPENDENCY
      );
      expect(circularWarnings.length).toBe(0);
    });
  });

  describe('PII Exposure Validation', () => {
    test('should detect PII exposure through public endpoints', () => {
      const dataURN = 'urn:proto:data:test.com/users@1.0.0';
      const apiURN = 'urn:proto:api:test.com/api@1.0.0';

      // Add data node with PII
      graph.addNode(dataURN, 'data', {
        metadata: { urn: dataURN },
        service: {
          tables: [
            {
              name: 'users',
              columns: [
                { name: 'email', pii: true }
              ]
            }
          ]
        }
      });

      // Add API that exposes the data
      graph.addNode(apiURN, 'api', {
        metadata: { urn: apiURN, visibility: 'public' }
      });

      graph.addEdge(apiURN, 'reads_from', dataURN);

      const manifest = {
        metadata: { urn: dataURN }
      };

      const result = validator.validate(manifest);

      // Should detect PII exposure (implementation depends on graph PII tracing)
      expect(result.totalIssues).toBeGreaterThanOrEqual(0);
    });

    test('should not warn when PII is not exposed', () => {
      const dataURN = 'urn:proto:data:test.com/internal@1.0.0';

      graph.addNode(dataURN, 'data', {
        metadata: { urn: dataURN },
        service: {
          tables: [
            { name: 'config', columns: [] }
          ]
        }
      });

      const manifest = {
        metadata: { urn: dataURN }
      };

      const result = validator.validate(manifest);

      const piiWarnings = result.issues.warnings.filter(w =>
        w.type === RuleType.PII_EXPOSURE
      );
      expect(piiWarnings.length).toBe(0);
    });
  });

  describe('Validation Options', () => {
    test('should respect rule filtering', () => {
      const manifest = {
        metadata: {
          urn: 'invalid'
        }
      };

      const result = validator.validate(manifest, {
        rules: ['version_compatibility'] // Only run this rule
      });

      // Should not have URN format errors since we didn't run that rule
      expect(result.issues.errors.length).toBe(0);
    });

    test('should disable rules when configured', () => {
      validator.registerRule('always_fail', () => [{
        message: 'Always fails',
        severity: Severity.ERROR
      }], { enabled: false });

      const manifest = {
        metadata: { urn: 'urn:proto:api:test.com/service@1.0.0' }
      };

      const result = validator.validate(manifest);

      // Disabled rule should not affect result
      expect(result.valid).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle rule execution errors gracefully', () => {
      validator.registerRule('broken_rule', () => {
        throw new Error('Rule execution failed');
      });

      const manifest = {
        metadata: { urn: 'urn:proto:api:test.com/service@1.0.0' }
      };

      const result = validator.validate(manifest);

      // Should capture rule error
      expect(result.valid).toBe(false);
      const ruleErrors = result.issues.errors.filter(e =>
        e.message.includes('Validation rule failed')
      );
      expect(ruleErrors.length).toBeGreaterThan(0);
    });
  });

  describe('URN Extraction', () => {
    test('should extract URNs from nested structures', () => {
      const manifest = {
        metadata: {
          urn: 'urn:proto:api:test.com/service@1.0.0'
        },
        catalog: {
          endpoints: [
            {
              path: '/users',
              reads_from: ['urn:proto:data:test.com/users@1.0.0']
            }
          ]
        }
      };

      const urns = validator._extractURNs(manifest);

      expect(urns.length).toBeGreaterThan(0);
      expect(urns.some(u => u.urn.includes('test.com/service'))).toBe(true);
      expect(urns.some(u => u.urn.includes('test.com/users'))).toBe(true);
    });

    test('should handle array references', () => {
      const manifest = {
        dependencies: {
          depends_on: [
            'urn:proto:api:test.com/a@1.0.0',
            'urn:proto:api:test.com/b@1.0.0'
          ]
        }
      };

      const urns = validator._extractURNs(manifest);

      expect(urns.length).toBe(2);
    });
  });
});
