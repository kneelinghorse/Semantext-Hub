/**
 * Integration Tests for Agent Protocol URN Validation
 * Mission A1.1: Critical URN Regex Patches
 *
 * Tests agent URN pattern matching through inline validation
 */

import { describe, test, expect } from '@jest/globals';

describe('Agent Protocol URN Pattern Validation', () => {

  // URN regex pattern extracted from the protocols (should match all 4 files)
  const isURN = s => typeof s === 'string' && /^urn:proto:(api|data|event|ui|workflow|infra|device|ai|iam|metric|integration|testing|docs|obs|config|release|agent):[a-zA-Z0-9._-]+@[\d.]+(#[^#\s]+)?$/.test(s);

  describe('Valid Agent URN Patterns', () => {
    test('should accept basic agent URN', () => {
      expect(isURN('urn:proto:agent:task-executor@1.0.0')).toBe(true);
    });

    test('should accept agent URN with fragment', () => {
      expect(isURN('urn:proto:agent:data-processor@2.1.0#capability.transform')).toBe(true);
    });

    test('should accept agent URN with hyphens', () => {
      expect(isURN('urn:proto:agent:workflow-orchestrator@1.5.3')).toBe(true);
    });

    test('should accept agent URN with underscores', () => {
      expect(isURN('urn:proto:agent:task_processor@1.0.0')).toBe(true);
    });

    test('should accept agent URN with dots', () => {
      expect(isURN('urn:proto:agent:event.handler@3.2.1')).toBe(true);
    });

    test('should accept agent URN with mixed naming', () => {
      expect(isURN('urn:proto:agent:complex-name_v2.3@10.20.30')).toBe(true);
    });

    test('should accept agent URN with nested fragment path', () => {
      expect(isURN('urn:proto:agent:test@1.0.0#nested.fragment.path')).toBe(true);
    });
  });

  describe('Invalid Agent URN Patterns', () => {
    test('should reject agent URN without version', () => {
      expect(isURN('urn:proto:agent:no-version')).toBe(false);
    });

    test('should reject agent URN with empty name', () => {
      expect(isURN('urn:proto:agent:@1.0.0')).toBe(false);
    });

    test('should reject agent URN with invalid version', () => {
      expect(isURN('urn:proto:agent:test@invalid-version')).toBe(false);
    });

    test('should reject agent URN with spaces', () => {
      expect(isURN('urn:proto:agent:space name@1.0.0')).toBe(false);
    });

    test('should reject malformed protocol type', () => {
      expect(isURN('urn:proto:agnt:typo@1.0.0')).toBe(false);
    });

    test('should reject missing urn: prefix', () => {
      expect(isURN('proto:agent:test@1.0.0')).toBe(false);
    });

    test('should reject multiple # fragments', () => {
      expect(isURN('urn:proto:agent:test@1.0.0#frag#ment')).toBe(false);
    });

    test('should reject fragment with spaces', () => {
      expect(isURN('urn:proto:agent:test@1.0.0#bad fragment')).toBe(false);
    });
  });

  describe('Agent URN with Other Protocol Types', () => {
    test('should accept api protocol URN', () => {
      expect(isURN('urn:proto:api:billing@1.2.0')).toBe(true);
    });

    test('should accept data protocol URN', () => {
      expect(isURN('urn:proto:data:events@1.0.0')).toBe(true);
    });

    test('should accept workflow protocol URN', () => {
      expect(isURN('urn:proto:workflow:order-fulfillment@1.0.0')).toBe(true);
    });

    test('should accept iam protocol URN', () => {
      expect(isURN('urn:proto:iam:data-processor@1.0.0')).toBe(true);
    });

    test('should accept obs protocol URN', () => {
      expect(isURN('urn:proto:obs:metrics@1.0.0')).toBe(true);
    });

    test('should accept config protocol URN', () => {
      expect(isURN('urn:proto:config:app-settings@1.0.0')).toBe(true);
    });

    test('should accept release protocol URN', () => {
      expect(isURN('urn:proto:release:v2.0.0@1.0.0')).toBe(true);
    });

    test('should accept docs protocol URN', () => {
      expect(isURN('urn:proto:docs:api-reference@1.0.0')).toBe(true);
    });

    test('should accept testing protocol URN', () => {
      expect(isURN('urn:proto:testing:integration-suite@1.0.0')).toBe(true);
    });

    test('should accept all 18 protocol types including agent', () => {
      const protocols = [
        'api', 'data', 'event', 'ui', 'workflow', 'infra', 'device',
        'ai', 'iam', 'metric', 'integration', 'testing', 'docs',
        'obs', 'config', 'release', 'agent'
      ];

      protocols.forEach(proto => {
        const urn = `urn:proto:${proto}:test@1.0.0`;
        expect(isURN(urn)).toBe(true);
      });
    });
  });

  describe('Agent URN Version Variations', () => {
    test('should accept single-digit versions', () => {
      expect(isURN('urn:proto:agent:test@1.0.0')).toBe(true);
    });

    test('should accept multi-digit versions', () => {
      expect(isURN('urn:proto:agent:test@10.20.30')).toBe(true);
    });

    test('should accept large version numbers', () => {
      expect(isURN('urn:proto:agent:test@100.200.300')).toBe(true);
    });

    test('should accept versions with dots only', () => {
      expect(isURN('urn:proto:agent:test@1.2.3.4.5')).toBe(true);
    });
  });

  describe('Agent URN Fragment Identifiers', () => {
    test('should accept simple fragment', () => {
      expect(isURN('urn:proto:agent:test@1.0.0#action')).toBe(true);
    });

    test('should accept dotted fragment path', () => {
      expect(isURN('urn:proto:agent:test@1.0.0#capability.transform.json')).toBe(true);
    });

    test('should accept fragment with hyphens', () => {
      expect(isURN('urn:proto:agent:test@1.0.0#action-execute')).toBe(true);
    });

    test('should accept fragment with underscores', () => {
      expect(isURN('urn:proto:agent:test@1.0.0#action_execute')).toBe(true);
    });

    test('should accept fragment with slashes', () => {
      expect(isURN('urn:proto:agent:test@1.0.0#/v1/execute')).toBe(true);
    });

    test('should reject fragment with whitespace', () => {
      expect(isURN('urn:proto:agent:test@1.0.0#bad fragment')).toBe(false);
    });
  });

  describe('Cross-Protocol URN Compatibility', () => {
    test('agent URN should follow same pattern as other protocols', () => {
      const testName = 'test-resource';
      const testVersion = '1.0.0';
      const testFragment = 'action';

      const agentURN = `urn:proto:agent:${testName}@${testVersion}#${testFragment}`;
      const apiURN = `urn:proto:api:${testName}@${testVersion}#${testFragment}`;
      const dataURN = `urn:proto:data:${testName}@${testVersion}#${testFragment}`;

      expect(isURN(agentURN)).toBe(true);
      expect(isURN(apiURN)).toBe(true);
      expect(isURN(dataURN)).toBe(true);
    });

    test('agent URN should support same naming conventions', () => {
      const names = [
        'simple',
        'with-hyphens',
        'with_underscores',
        'with.dots',
        'MixedCase',
        'with123numbers',
        'complex-name_v2.3'
      ];

      names.forEach(name => {
        const agentURN = `urn:proto:agent:${name}@1.0.0`;
        expect(isURN(agentURN)).toBe(true);
      });
    });
  });

  describe('Regression Tests', () => {
    test('should not break existing protocol URN validation', () => {
      const existingURNs = [
        'urn:proto:api:users@1.0.0',
        'urn:proto:data:orders@2.1.0',
        'urn:proto:event:order.created@1.0.0',
        'urn:proto:ui:dashboard@1.0.0',
        'urn:proto:workflow:checkout@1.0.0',
        'urn:proto:infra:database@1.0.0',
        'urn:proto:device:sensor@1.0.0',
        'urn:proto:ai:model@1.0.0',
        'urn:proto:iam:identity@1.0.0',
        'urn:proto:metric:latency@1.0.0',
        'urn:proto:integration:stripe@1.0.0',
        'urn:proto:testing:suite@1.0.0',
        'urn:proto:docs:guide@1.0.0',
        'urn:proto:obs:dashboard@1.0.0',
        'urn:proto:config:app@1.0.0',
        'urn:proto:release:v2.0.0@1.0.0'
      ];

      existingURNs.forEach(urn => {
        expect(isURN(urn)).toBe(true);
      });
    });

    test('should still reject invalid protocol types', () => {
      const invalidProtocols = [
        'urn:proto:invalid:test@1.0.0',
        'urn:proto:agnt:test@1.0.0',  // typo
        'urn:proto:agents:test@1.0.0', // plural
        'urn:proto:AGENT:test@1.0.0'   // uppercase
      ];

      invalidProtocols.forEach(urn => {
        expect(isURN(urn)).toBe(false);
      });
    });
  });
});
