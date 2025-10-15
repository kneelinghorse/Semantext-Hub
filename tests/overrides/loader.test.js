/*
 * Override Loader Tests
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
import loaderMod from '../../packages/protocols/core/overrides/loader.js';
const { RuleLoader } = loaderMod;

describe('RuleLoader', () => {
  let tempDir;
  let loader;

  beforeEach(() => {
    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'override-test-'));
    loader = new RuleLoader();
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('loadFromFile', () => {
    test('loads valid single rule from file', () => {
      const rule = {
        id: 'test-rule',
        type: 'pii_pattern',
        pattern: { field: 'email' },
        classification: 'pii',
        confidence: 0.9
      };

      const filePath = path.join(tempDir, 'rules.json');
      fs.writeFileSync(filePath, JSON.stringify(rule));

      const count = loader.loadFromFile(filePath, 'community');
      expect(count).toBe(1);
      expect(loader.getRuleById('test-rule')).toBeDefined();
    });

    test('loads array of rules from file', () => {
      const rules = [
        {
          id: 'rule-1',
          type: 'pii_pattern',
          pattern: { field: 'email' },
          classification: 'pii',
          confidence: 0.9
        },
        {
          id: 'rule-2',
          type: 'pii_pattern',
          pattern: { field: 'phone' },
          classification: 'pii',
          confidence: 0.85
        }
      ];

      const filePath = path.join(tempDir, 'rules.json');
      fs.writeFileSync(filePath, JSON.stringify(rules));

      const count = loader.loadFromFile(filePath, 'community');
      expect(count).toBe(2);
      expect(loader.getRuleById('rule-1')).toBeDefined();
      expect(loader.getRuleById('rule-2')).toBeDefined();
    });

    test('handles invalid JSON gracefully', () => {
      const filePath = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(filePath, 'invalid json{');

      const count = loader.loadFromFile(filePath);
      expect(count).toBe(0);
      expect(loader.getErrors().length).toBeGreaterThan(0);
    });

    test('validates rules and reports errors', () => {
      const invalidRule = {
        id: 'invalid',
        type: 'invalid_type'
        // Missing required fields
      };

      const filePath = path.join(tempDir, 'invalid-rule.json');
      fs.writeFileSync(filePath, JSON.stringify(invalidRule));

      const count = loader.loadFromFile(filePath);
      expect(count).toBe(0);
      expect(loader.getErrors().length).toBeGreaterThan(0);
    });

    test('sets source metadata if not provided', () => {
      const rule = {
        id: 'test-source',
        type: 'pii_pattern',
        pattern: { field: 'test' },
        classification: 'pii',
        confidence: 0.8
      };

      const filePath = path.join(tempDir, 'source.json');
      fs.writeFileSync(filePath, JSON.stringify(rule));

      loader.loadFromFile(filePath, 'organization');
      const loaded = loader.getRuleById('test-source');

      expect(loaded.metadata.source).toBe('organization');
    });
  });

  describe('loadFromDirectory', () => {
    test('loads rules from directory recursively', () => {
      // Create directory structure
      const subDir = path.join(tempDir, 'subdir');
      fs.mkdirSync(subDir);

      const rule1 = {
        id: 'dir-rule-1',
        type: 'pii_pattern',
        pattern: { field: 'email' },
        classification: 'pii',
        confidence: 0.9
      };

      const rule2 = {
        id: 'dir-rule-2',
        type: 'pii_pattern',
        pattern: { field: 'phone' },
        classification: 'pii',
        confidence: 0.85
      };

      fs.writeFileSync(path.join(tempDir, 'rule1.json'), JSON.stringify(rule1));
      fs.writeFileSync(path.join(subDir, 'rule2.json'), JSON.stringify(rule2));

      const count = loader.loadFromDirectory(tempDir, 'community');
      expect(count).toBe(2);
      expect(loader.getRuleById('dir-rule-1')).toBeDefined();
      expect(loader.getRuleById('dir-rule-2')).toBeDefined();
    });

    test('ignores non-JSON files', () => {
      fs.writeFileSync(path.join(tempDir, 'readme.txt'), 'Not a rule file');

      const rule = {
        id: 'json-only',
        type: 'pii_pattern',
        pattern: { field: 'test' },
        classification: 'pii',
        confidence: 0.8
      };

      fs.writeFileSync(path.join(tempDir, 'rule.json'), JSON.stringify(rule));

      const count = loader.loadFromDirectory(tempDir);
      expect(count).toBe(1);
    });

    test('returns 0 for non-existent directory', () => {
      const count = loader.loadFromDirectory('/non/existent/path');
      expect(count).toBe(0);
    });
  });

  describe('precedence handling', () => {
    test('project rules override community rules', () => {
      const communityRule = {
        id: 'precedence-test',
        type: 'pii_pattern',
        pattern: { field: 'email' },
        classification: 'pii',
        confidence: 0.8,
        metadata: { source: 'community' }
      };

      const projectRule = {
        id: 'precedence-test',
        type: 'pii_pattern',
        pattern: { field: 'email' },
        classification: 'pii',
        confidence: 0.95,
        metadata: { source: 'project' }
      };

      loader.addRule(communityRule);
      loader.addRule(projectRule);

      const loaded = loader.getRuleById('precedence-test');
      expect(loaded.confidence).toBe(0.95);
      expect(loaded.metadata.source).toBe('project');
    });

    test('organization rules override community rules', () => {
      const communityRule = {
        id: 'org-test',
        type: 'pii_pattern',
        pattern: { field: 'email' },
        classification: 'pii',
        confidence: 0.8,
        metadata: { source: 'community' }
      };

      const orgRule = {
        id: 'org-test',
        type: 'pii_pattern',
        pattern: { field: 'email' },
        classification: 'pii',
        confidence: 0.9,
        metadata: { source: 'organization' }
      };

      loader.addRule(communityRule);
      loader.addRule(orgRule);

      const loaded = loader.getRuleById('org-test');
      expect(loaded.metadata.source).toBe('organization');
    });

    test('uses higher confidence when precedence is equal', () => {
      const rule1 = {
        id: 'confidence-test',
        type: 'pii_pattern',
        pattern: { field: 'email' },
        classification: 'pii',
        confidence: 0.8,
        metadata: { source: 'community', created: new Date().toISOString() }
      };

      const rule2 = {
        id: 'confidence-test',
        type: 'pii_pattern',
        pattern: { field: 'email' },
        classification: 'pii',
        confidence: 0.95,
        metadata: { source: 'community', created: new Date().toISOString() }
      };

      loader.addRule(rule1);
      loader.addRule(rule2);

      const loaded = loader.getRuleById('confidence-test');
      expect(loaded.confidence).toBe(0.95);
    });
  });

  describe('rule indexing', () => {
    test('indexes rules by type', () => {
      const piiRule = {
        id: 'pii-1',
        type: 'pii_pattern',
        pattern: { field: 'email' },
        classification: 'pii',
        confidence: 0.9
      };

      const apiRule = {
        id: 'api-1',
        type: 'api_pattern',
        pattern: { endpoint: '/users' },
        classification: 'pagination',
        confidence: 0.85
      };

      loader.addRule(piiRule);
      loader.addRule(apiRule);

      expect(loader.getRulesByType('pii_pattern')).toHaveLength(1);
      expect(loader.getRulesByType('api_pattern')).toHaveLength(1);
      expect(loader.getRulesByType('unknown')).toHaveLength(0);
    });

    test('removeRule updates all indexes', () => {
      const rule = {
        id: 'remove-test',
        type: 'pii_pattern',
        pattern: { field: 'email' },
        classification: 'pii',
        confidence: 0.9
      };

      loader.addRule(rule);
      expect(loader.getRuleById('remove-test')).toBeDefined();
      expect(loader.getRulesByType('pii_pattern')).toHaveLength(1);

      loader.removeRule('remove-test');
      expect(loader.getRuleById('remove-test')).toBeNull();
      expect(loader.getRulesByType('pii_pattern')).toHaveLength(0);
    });
  });

  describe('statistics', () => {
    test('getStats returns correct counts', () => {
      const rules = [
        {
          id: 'stat-1',
          type: 'pii_pattern',
          pattern: { field: 'email' },
          classification: 'pii',
          confidence: 0.9,
          metadata: { source: 'community' }
        },
        {
          id: 'stat-2',
          type: 'pii_pattern',
          pattern: { field: 'phone' },
          classification: 'pii',
          confidence: 0.85,
          metadata: { source: 'project' }
        },
        {
          id: 'stat-3',
          type: 'api_pattern',
          pattern: { endpoint: '/users' },
          classification: 'pagination',
          confidence: 0.88,
          metadata: { source: 'community' }
        }
      ];

      rules.forEach(rule => loader.addRule(rule));

      const stats = loader.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byType.pii_pattern).toBe(2);
      expect(stats.byType.api_pattern).toBe(1);
      expect(stats.bySource.community).toBe(2);
      expect(stats.bySource.project).toBe(1);
    });
  });
});
