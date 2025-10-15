/**
 * Tests for MigrationSuggester
 */

import { MigrationSuggester, MigrationPatterns } from '../../packages/protocols/diff/migration-suggester.js';
import { DiffEngine, ChangeType, ImpactLevel } from '../../packages/protocols/diff/engine.js';

describe('MigrationSuggester', () => {
  let suggester;
  let diffEngine;

  beforeEach(() => {
    suggester = new MigrationSuggester();
    diffEngine = new DiffEngine();
  });

  describe('Endpoint Migration Suggestions', () => {
    test('should suggest migration for removed endpoint', () => {
      const oldManifest = {
        metadata: { kind: 'api', version: '1.0.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/users' }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'api', version: '2.0.0' },
        catalog: { endpoints: [] }
      };

      const diff = diffEngine.diff(oldManifest, newManifest);
      const guide = suggester.generateMigrationGuide(diff);

      expect(guide.suggestions.length).toBeGreaterThan(0);

      const endpointSuggestion = guide.suggestions.find(s =>
        s.pattern === MigrationPatterns.ENDPOINT_REPLACEMENT
      );
      expect(endpointSuggestion).toBeDefined();
      expect(endpointSuggestion.steps.length).toBeGreaterThan(0);
    });

    test('should include code examples when enabled', () => {
      const suggesterWithCode = new MigrationSuggester({
        includeCodeExamples: true
      });

      const oldManifest = {
        metadata: { kind: 'api', version: '1.0.0' },
        catalog: {
          endpoints: [
            { method: 'POST', path: '/users' }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'api', version: '2.0.0' },
        catalog: { endpoints: [] }
      };

      const diff = diffEngine.diff(oldManifest, newManifest);
      const guide = suggesterWithCode.generateMigrationGuide(diff);

      const endpointSuggestion = guide.suggestions.find(s =>
        s.pattern === MigrationPatterns.ENDPOINT_REPLACEMENT
      );

      expect(endpointSuggestion?.codeExamples?.length).toBeGreaterThan(0);
    });
  });

  describe('Field Migration Suggestions', () => {
    test('should suggest migration for removed field', () => {
      const oldManifest = {
        metadata: { kind: 'data', version: '1.0.0' },
        service: {
          tables: [
            {
              name: 'users',
              columns: [
                { name: 'email', type: 'varchar' }
              ]
            }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'data', version: '2.0.0' },
        service: {
          tables: [
            {
              name: 'users',
              columns: []
            }
          ]
        }
      };

      const diff = diffEngine.diff(oldManifest, newManifest);
      const guide = suggester.generateMigrationGuide(diff);

      const fieldSuggestion = guide.suggestions.find(s =>
        s.pattern === MigrationPatterns.FIELD_MAPPING
      );

      expect(fieldSuggestion).toBeDefined();
      expect(fieldSuggestion.steps.some(step => step.includes('Remove references'))).toBe(true);
    });

    test('should suggest migration for type changes', () => {
      const oldManifest = {
        metadata: { kind: 'data', version: '1.0.0' },
        service: {
          tables: [
            {
              name: 'users',
              columns: [
                { name: 'age', type: 'integer' }
              ]
            }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'data', version: '2.0.0' },
        service: {
          tables: [
            {
              name: 'users',
              columns: [
                { name: 'age', type: 'varchar' }
              ]
            }
          ]
        }
      };

      const diff = diffEngine.diff(oldManifest, newManifest);
      const guide = suggester.generateMigrationGuide(diff);

      const typeSuggestion = guide.suggestions.find(s =>
        s.pattern === MigrationPatterns.TYPE_CONVERSION
      );

      expect(typeSuggestion).toBeDefined();
      expect(typeSuggestion.steps.some(step => step.includes('Convert field type'))).toBe(true);
    });

    test('should prioritize required field additions', () => {
      const oldManifest = {
        metadata: { kind: 'api', version: '1.0.0' },
        catalog: {
          endpoints: [
            {
              method: 'POST',
              path: '/users',
              request: {
                properties: { name: { type: 'string' } },
                required: ['name']
              }
            }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'api', version: '2.0.0' },
        catalog: {
          endpoints: [
            {
              method: 'POST',
              path: '/users',
              request: {
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string' }
                },
                required: ['name', 'email']
              }
            }
          ]
        }
      };

      const diff = diffEngine.diff(oldManifest, newManifest);
      const guide = suggester.generateMigrationGuide(diff);

      const requiredSuggestion = guide.suggestions.find(s =>
        s.change.includes('required field')
      );

      expect(requiredSuggestion).toBeDefined();
      expect(requiredSuggestion.priority).toBeGreaterThan(80);
    });
  });

  describe('Authentication Migration', () => {
    test('should suggest auth migration', () => {
      const oldManifest = {
        metadata: { kind: 'api', version: '1.0.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/data', auth: 'basic' }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'api', version: '2.0.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/data', auth: 'oauth2' }
          ]
        }
      };

      const diff = diffEngine.diff(oldManifest, newManifest);
      const guide = suggester.generateMigrationGuide(diff);

      // Auth changes should be in suggestions (may not have pattern set)
      const authSuggestion = guide.suggestions.find(s =>
        s.path && s.path.includes('auth')
      );

      expect(authSuggestion).toBeDefined();
      expect(authSuggestion.steps.length).toBeGreaterThan(0);
    });
  });

  describe('Migration Strategy', () => {
    test('should recommend phased approach for high-risk changes', () => {
      const oldManifest = {
        metadata: { kind: 'api', version: '1.0.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/users' },
            { method: 'POST', path: '/users' },
            { method: 'DELETE', path: '/users/:id' }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'api', version: '2.0.0' },
        catalog: { endpoints: [] }
      };

      const diff = diffEngine.diff(oldManifest, newManifest);
      const breakingAnalysis = {
        riskScore: 85
      };

      const guide = suggester.generateMigrationGuide(diff, breakingAnalysis);

      expect(guide.strategy.approach).toBe('phased');
      expect(guide.strategy.phases.length).toBeGreaterThan(1);
    });

    test('should recommend direct approach for low-risk changes', () => {
      const oldManifest = {
        metadata: { kind: 'api', version: '1.0.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/users' }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'api', version: '1.1.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/users' },
            { method: 'POST', path: '/users' }
          ]
        }
      };

      const diff = diffEngine.diff(oldManifest, newManifest);
      const guide = suggester.generateMigrationGuide(diff);

      expect(guide.strategy.approach).toBe('simple');
    });
  });

  describe('Effort Estimation', () => {
    test('should estimate effort for breaking changes', () => {
      const oldManifest = {
        metadata: { kind: 'api', version: '1.0.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/users' },
            { method: 'POST', path: '/users' }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'api', version: '2.0.0' },
        catalog: { endpoints: [] }
      };

      const diff = diffEngine.diff(oldManifest, newManifest);
      const guide = suggester.generateMigrationGuide(diff);

      expect(guide.effort.estimatedHours).toBeGreaterThan(0);
      expect(guide.effort.complexity).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(guide.effort.complexity);
    });

    test('should classify high complexity correctly', () => {
      const oldManifest = {
        metadata: { kind: 'api', version: '1.0.0' },
        catalog: {
          endpoints: Array.from({ length: 10 }, (_, i) => ({
            method: 'GET',
            path: `/endpoint${i}`
          }))
        }
      };

      const newManifest = {
        metadata: { kind: 'api', version: '2.0.0' },
        catalog: { endpoints: [] }
      };

      const diff = diffEngine.diff(oldManifest, newManifest);
      const guide = suggester.generateMigrationGuide(diff);

      expect(guide.effort.complexity).toBe('high');
      expect(guide.effort.estimatedHours).toBeGreaterThan(16);
    });
  });

  describe('Confidence Scoring', () => {
    test('should filter suggestions by minimum confidence', () => {
      const highConfidenceSuggester = new MigrationSuggester({
        minConfidence: 0.9
      });

      const oldManifest = {
        metadata: { kind: 'api', version: '1.0.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/users' }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'api', version: '2.0.0' },
        catalog: { endpoints: [] }
      };

      const diff = diffEngine.diff(oldManifest, newManifest);
      const guide = highConfidenceSuggester.generateMigrationGuide(diff);

      // Should only include high-confidence suggestions
      guide.suggestions.forEach(s => {
        expect(s.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });
  });

  describe('Priority Sorting', () => {
    test('should sort suggestions by priority', () => {
      const oldManifest = {
        metadata: { kind: 'api', version: '1.0.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/users', auth: 'none' },
            { method: 'POST', path: '/data' }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'api', version: '2.0.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/users', auth: 'bearer' }
          ]
        }
      };

      const diff = diffEngine.diff(oldManifest, newManifest);
      const guide = suggester.generateMigrationGuide(diff);

      // Verify descending priority order
      for (let i = 0; i < guide.suggestions.length - 1; i++) {
        expect(guide.suggestions[i].priority).toBeGreaterThanOrEqual(
          guide.suggestions[i + 1].priority
        );
      }
    });
  });

  describe('Version Tracking', () => {
    test('should track version information', () => {
      const oldManifest = {
        metadata: { version: '1.2.3' }
      };

      const newManifest = {
        metadata: { version: '2.0.0' }
      };

      const diff = diffEngine.diff(oldManifest, newManifest);
      const guide = suggester.generateMigrationGuide(diff);

      expect(guide.version.from).toBe('1.2.3');
      expect(guide.version.to).toBe('2.0.0');
    });
  });
});
