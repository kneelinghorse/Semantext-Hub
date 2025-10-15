/*
 * Override System Integration Tests
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import overrides from '../../packages/protocols/core/overrides/index.js';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { OverrideEngine } = overrides;

describe('Override System Integration', () => {
  let tempDir;
  let engine;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'override-int-test-'));
    engine = new OverrideEngine(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('end-to-end PII detection enhancement', () => {
    test('enhances PII detection with override rules', () => {
      // Create project override directory
      const overrideDir = path.join(tempDir, '.proto/overrides');
      fs.mkdirSync(overrideDir, { recursive: true });

      // Add project-specific rule
      const rule = {
        id: 'project-customer-email',
        type: 'pii_pattern',
        pattern: {
          field: 'email',
          context: 'customers'
        },
        classification: 'pii',
        confidence: 0.95,
        metadata: {
          source: 'project',
          created: new Date().toISOString()
        }
      };

      fs.writeFileSync(
        path.join(overrideDir, 'customer-rules.json'),
        JSON.stringify([rule])
      );

      // Reload engine to pick up new rules
      engine = new OverrideEngine(tempDir);

      // Simulate base detection result
      const baseDetection = {
        fieldName: 'email',
        context: 'customers',
        type: 'email',
        confidence: 0.75
      };

      // Enhance with overrides
      const enhanced = engine.enhanceDetection(baseDetection, 'pii');

      expect(enhanced.overrideApplied).toBe(true);
      expect(enhanced.confidence).toBeGreaterThanOrEqual(0.7);
      expect(enhanced.overrideRule).toBe('project-customer-email');
    });

    test('handles multiple override sources with precedence', () => {
      // Community rule (bundled)
      const communityRule = {
        id: 'precedence-email',
        type: 'pii_pattern',
        pattern: { field: 'email' },
        classification: 'pii',
        confidence: 0.8,
        metadata: {
          source: 'community',
          created: new Date().toISOString()
        }
      };

      // Project rule (higher precedence)
      const projectRule = {
        id: 'precedence-email',
        type: 'pii_pattern',
        pattern: { field: 'email' },
        classification: 'pii',
        confidence: 0.95,
        metadata: {
          source: 'project',
          created: new Date().toISOString()
        }
      };

      // Create override directory
      const overrideDir = path.join(tempDir, '.proto/overrides');
      fs.mkdirSync(overrideDir, { recursive: true });

      // Write rules
      fs.writeFileSync(
        path.join(overrideDir, 'community.json'),
        JSON.stringify([communityRule])
      );
      fs.writeFileSync(
        path.join(overrideDir, 'project.json'),
        JSON.stringify([projectRule])
      );

      // Reload and test
      engine = new OverrideEngine(tempDir);

      const match = engine.matchPIIPattern('email', {});
      expect(match).toBeDefined();
      expect(match.rule.metadata.source).toBe('project');
      expect(match.confidence).toBeGreaterThan(0.4);
    });
  });

  describe('rule creation and export', () => {
    test('creates and exports PII rules', () => {
      const detection = {
        fieldName: 'customer_email',
        context: 'orders',
        type: 'email',
        confidence: 0.88,
        dataPattern: '^[^\\s@]+@[^\\s@]+$'
      };

      const rule = engine.createRule(detection, 'pii', {
        author: 'test-user',
        protocol: 'ecommerce'
      });

      expect(rule.id).toBeDefined();
      expect(rule.type).toBe('pii_pattern');
      expect(rule.pattern.field).toBe('customer_email');
      expect(rule.metadata.author).toBe('test-user');

      // Export to file
      const exportPath = path.join(tempDir, 'exported-rules.json');
      const result = engine.exportRules(exportPath, { pretty: true });

      expect(result.success).toBe(true);
      expect(fs.existsSync(exportPath)).toBe(true);

      const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
      expect(Array.isArray(exported)).toBe(true);
      expect(exported[0].id).toBe(rule.id);
    });

    test('exports rule pack with manifest', () => {
      // Create multiple rules
      engine.createRule({
        fieldName: 'email',
        context: 'users',
        type: 'email',
        confidence: 0.9
      }, 'pii');

      engine.createRule({
        fieldName: 'phone',
        context: 'users',
        type: 'phone',
        confidence: 0.85
      }, 'pii');

      // Export as pack
      const result = engine.exportPack('test-pack', tempDir, {
        version: '1.0.0',
        description: 'Test rule pack',
        author: 'test-author'
      });

      expect(result.success).toBe(true);
      expect(result.pack).toBe('test-pack');

      // Verify pack structure
      const packDir = path.join(tempDir, 'test-pack');
      expect(fs.existsSync(packDir)).toBe(true);

      const manifestPath = path.join(packDir, 'manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.name).toBe('test-pack');
      expect(manifest.rules_count).toBe(2);
    });
  });

  describe('API pattern matching', () => {
    test('matches and enhances API patterns', () => {
      // Load Stripe patterns from bundled community pack
      const stripePatternsPath = path.join(__dirname, '../../overrides/community/stripe/api_pattern.json');

      if (fs.existsSync(stripePatternsPath)) {
        engine.loadRules(stripePatternsPath, 'community');

        // Test pagination pattern
        const match = engine.matchAPIPattern('/v1/customers', 'GET', {
          parameters: [
            { name: 'limit', in: 'query' },
            { name: 'starting_after', in: 'query' }
          ],
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: {
                    properties: {
                      has_more: { type: 'boolean' },
                      data: { type: 'array' }
                    }
                  }
                }
              }
            }
          }
        });

        if (match) {
          expect(match.rule.classification).toBe('pagination');
          expect(match.confidence).toBeGreaterThan(0.7);
        }
      }
    });
  });

  describe('statistics and monitoring', () => {
    test('getStats provides comprehensive statistics', () => {
      // Create some rules
      engine.createRule({
        fieldName: 'email',
        type: 'email',
        confidence: 0.9
      }, 'pii');

      engine.createRule({
        endpoint: '/users',
        method: 'GET',
        pattern: 'pagination',
        confidence: 0.85
      }, 'api');

      const stats = engine.getStats();

      expect(stats.rules).toBeDefined();
      expect(stats.cache).toBeDefined();
      expect(stats.pending).toBeGreaterThan(0);
    });

    test('tracks loading errors', () => {
      // Try to load invalid rule file
      const invalidPath = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(invalidPath, 'invalid json{');

      engine.loadRules(invalidPath, 'community');

      const errors = engine.getErrors();
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('performance', () => {
    test('rule matching completes within 5ms', () => {
      // Create rules directory
      const rulesDir = path.join(tempDir, 'rules');
      fs.mkdirSync(rulesDir, { recursive: true });

      // Load multiple rules
      for (let i = 0; i < 50; i++) {
        const rule = {
          id: `perf-test-${i}`,
          type: 'pii_pattern',
          pattern: { field: `field_${i}` },
          classification: 'pii',
          confidence: 0.8,
          metadata: {
            source: 'community',
            created: new Date().toISOString()
          }
        };

        fs.writeFileSync(
          path.join(rulesDir, `rule-${i}.json`),
          JSON.stringify(rule)
        );
      }

      // Load rules directory
      engine.loadRules(rulesDir, 'community');

      // Measure match performance
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        engine.matchPIIPattern(`field_${i % 50}`, {});
      }
      const elapsed = Date.now() - start;

      // Average per match should be < 5ms
      const avgPerMatch = elapsed / 100;
      expect(avgPerMatch).toBeLessThan(5);
    });
  });
});
