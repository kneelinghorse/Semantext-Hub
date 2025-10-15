/**
 * Agent Mapping Integration Tests — Mission A2.3
 * Purpose: Verify agentMapping extension for agent-to-agent communication
 * Coverage: conversationContext, artifactMapping, taskChaining validation
 */

import { describe, test, expect } from '@jest/globals';
import { createIntegrationProtocol } from '../../packages/protocols/src/Integration Protocol — v1.1.1.js';

describe('Integration Protocol — Agent Mapping', () => {

  describe('agentMapping.conversationContext validation', () => {
    test('should validate conversation context enabled', () => {
      const manifest = {
        integration: {
          id: 'agent-chat-integration',
          name: 'Agent Chat Integration',
          direction: 'bidirectional',
          mode: 'stream'
        },
        source: {
          kind_urns: { agent: 'urn:proto:agent:writer@1.0.0' }
        },
        destination: {
          kind_urns: { agent: 'urn:proto:agent:reviewer@1.0.0' }
        },
        mapping: {
          rules: [
            { from: 'output', to: 'input', required: true }
          ]
        },
        agentMapping: {
          conversationContext: {
            enabled: true,
            preserveHistory: true
          }
        },
        transport: {
          stream: { broker: 'webhook', topic: 'agent-chat' }
        },
        governance: {
          policy: { classification: 'internal' }
        }
      };

      const protocol = createIntegrationProtocol(manifest);
      const result = protocol.validate(['agentMapping.consistency']);

      expect(result.ok).toBe(true);
      expect(protocol.manifest().agentMapping.conversationContext.enabled).toBe(true);
      expect(protocol.manifest().agentMapping.conversationContext.preserveHistory).toBe(true);
    });

    test('should reject non-boolean enabled field', () => {
      const manifest = {
        integration: {
          id: 'bad-context',
          name: 'Bad Context',
          direction: 'push',
          mode: 'batch'
        },
        source: {
          kind_urns: { agent: 'urn:proto:agent:source@1.0.0' }
        },
        destination: {
          kind_urns: { agent: 'urn:proto:agent:dest@1.0.0' }
        },
        mapping: {
          rules: [{ from: 'x', to: 'y' }]
        },
        agentMapping: {
          conversationContext: {
            enabled: 'yes' // invalid - should be boolean
          }
        },
        transport: {
          batch: { schedule: 'hourly' }
        },
        governance: {
          policy: { classification: 'internal' }
        }
      };

      const protocol = createIntegrationProtocol(manifest);
      const result = protocol.validate(['agentMapping.consistency']);

      expect(result.ok).toBe(false);
      const issues = result.results.find(r => r.name === 'agentMapping.consistency').issues;
      expect(issues.some(i => i.path === 'agentMapping.conversationContext.enabled')).toBe(true);
    });

    test('should reject non-boolean preserveHistory field', () => {
      const manifest = {
        integration: {
          id: 'bad-history',
          name: 'Bad History',
          direction: 'push',
          mode: 'batch'
        },
        source: {
          kind_urns: { agent: 'urn:proto:agent:source@1.0.0' }
        },
        destination: {
          kind_urns: { agent: 'urn:proto:agent:dest@1.0.0' }
        },
        mapping: {
          rules: [{ from: 'x', to: 'y' }]
        },
        agentMapping: {
          conversationContext: {
            enabled: true,
            preserveHistory: 'always' // invalid - should be boolean
          }
        },
        transport: {
          batch: { schedule: 'hourly' }
        },
        governance: {
          policy: { classification: 'internal' }
        }
      };

      const protocol = createIntegrationProtocol(manifest);
      const result = protocol.validate(['agentMapping.consistency']);

      expect(result.ok).toBe(false);
      const issues = result.results.find(r => r.name === 'agentMapping.consistency').issues;
      expect(issues.some(i => i.path === 'agentMapping.conversationContext.preserveHistory')).toBe(true);
    });

    test('should allow missing preserveHistory (optional)', () => {
      const manifest = {
        integration: {
          id: 'minimal-context',
          name: 'Minimal Context',
          direction: 'push',
          mode: 'stream'
        },
        source: {
          kind_urns: { agent: 'urn:proto:agent:source@1.0.0' }
        },
        destination: {
          kind_urns: { agent: 'urn:proto:agent:dest@1.0.0' }
        },
        mapping: {
          rules: [{ from: 'x', to: 'y' }]
        },
        agentMapping: {
          conversationContext: {
            enabled: false
          }
        },
        transport: {
          stream: { broker: 'webhook' }
        },
        governance: {
          policy: { classification: 'internal' }
        }
      };

      const protocol = createIntegrationProtocol(manifest);
      const result = protocol.validate(['agentMapping.consistency']);

      expect(result.ok).toBe(true);
    });
  });

  describe('agentMapping.artifactMapping validation', () => {
    test('should validate artifact mapping with transformation', () => {
      const manifest = {
        integration: {
          id: 'artifact-transform',
          name: 'Artifact Transform Integration',
          direction: 'push',
          mode: 'stream'
        },
        source: {
          kind_urns: { agent: 'urn:proto:agent:analyzer@1.0.0' }
        },
        destination: {
          kind_urns: { agent: 'urn:proto:agent:reporter@1.0.0' }
        },
        mapping: {
          rules: [
            { from: 'analysis_result', to: 'report_input', required: true }
          ]
        },
        agentMapping: {
          artifactMapping: [
            {
              sourceArtifact: 'urn:proto:agent:analyzer@1.0.0#artifact.json_report',
              destinationInput: 'urn:proto:agent:reporter@1.0.0#input.json_data',
              transformation: 'json_to_markdown'
            },
            {
              sourceArtifact: 'urn:proto:agent:analyzer@1.0.0#artifact.metrics',
              destinationInput: 'urn:proto:agent:reporter@1.0.0#input.metrics'
            }
          ]
        },
        transport: {
          stream: { broker: 'webhook', topic: 'artifact-stream' }
        },
        governance: {
          policy: { classification: 'internal' }
        }
      };

      const protocol = createIntegrationProtocol(manifest);
      const result = protocol.validate(['agentMapping.consistency']);

      expect(result.ok).toBe(true);
      expect(protocol.manifest().agentMapping.artifactMapping.length).toBe(2);
      expect(protocol.manifest().agentMapping.artifactMapping[0].transformation).toBe('json_to_markdown');
    });

    test('should reject missing sourceArtifact or destinationInput', () => {
      const manifest = {
        integration: {
          id: 'incomplete-mapping',
          name: 'Incomplete Mapping',
          direction: 'push',
          mode: 'batch'
        },
        source: {
          kind_urns: { agent: 'urn:proto:agent:source@1.0.0' }
        },
        destination: {
          kind_urns: { agent: 'urn:proto:agent:dest@1.0.0' }
        },
        mapping: {
          rules: [{ from: 'x', to: 'y' }]
        },
        agentMapping: {
          artifactMapping: [
            {
              sourceArtifact: 'urn:proto:agent:source@1.0.0#artifact.data'
              // missing destinationInput
            }
          ]
        },
        transport: {
          batch: { schedule: 'hourly' }
        },
        governance: {
          policy: { classification: 'internal' }
        }
      };

      const protocol = createIntegrationProtocol(manifest);
      const result = protocol.validate(['agentMapping.consistency']);

      expect(result.ok).toBe(false);
      const issues = result.results.find(r => r.name === 'agentMapping.consistency').issues;
      expect(issues.some(i => i.path === 'agentMapping.artifactMapping[0]')).toBe(true);
    });

    test('should reject non-array artifactMapping', () => {
      const manifest = {
        integration: {
          id: 'bad-array',
          name: 'Bad Array',
          direction: 'push',
          mode: 'batch'
        },
        source: {
          kind_urns: { agent: 'urn:proto:agent:source@1.0.0' }
        },
        destination: {
          kind_urns: { agent: 'urn:proto:agent:dest@1.0.0' }
        },
        mapping: {
          rules: [{ from: 'x', to: 'y' }]
        },
        agentMapping: {
          artifactMapping: 'not-an-array'
        },
        transport: {
          batch: { schedule: 'hourly' }
        },
        governance: {
          policy: { classification: 'internal' }
        }
      };

      const protocol = createIntegrationProtocol(manifest);
      const result = protocol.validate(['agentMapping.consistency']);

      expect(result.ok).toBe(false);
      const issues = result.results.find(r => r.name === 'agentMapping.consistency').issues;
      expect(issues.some(i => i.path === 'agentMapping.artifactMapping')).toBe(true);
    });

    test('should warn on invalid URN format in artifact mapping', () => {
      const manifest = {
        integration: {
          id: 'urn-warning',
          name: 'URN Warning',
          direction: 'push',
          mode: 'batch'
        },
        source: {
          kind_urns: { agent: 'urn:proto:agent:source@1.0.0' }
        },
        destination: {
          kind_urns: { agent: 'urn:proto:agent:dest@1.0.0' }
        },
        mapping: {
          rules: [{ from: 'x', to: 'y' }]
        },
        agentMapping: {
          artifactMapping: [
            {
              sourceArtifact: 'urn:invalid:format',
              destinationInput: 'urn:proto:agent:dest@1.0.0#input'
            }
          ]
        },
        transport: {
          batch: { schedule: 'hourly' }
        },
        governance: {
          policy: { classification: 'internal' }
        }
      };

      const protocol = createIntegrationProtocol(manifest);
      const result = protocol.validate(['agentMapping.consistency']);

      // Check that warnings are present but don't fail validation
      const validatorResult = result.results.find(r => r.name === 'agentMapping.consistency');
      expect(validatorResult.issues.length).toBeGreaterThan(0);
      expect(validatorResult.issues.some(i => i.level === 'warn')).toBe(true);

      // Warnings should still allow ok: false from validator (spec says warnings in issues array)
      // But we need to check errors vs warnings separately
      const hasErrors = validatorResult.issues.some(i => i.level === 'error');
      expect(hasErrors).toBe(false);
    });

    test('should accept non-URN artifact references', () => {
      const manifest = {
        integration: {
          id: 'simple-refs',
          name: 'Simple Refs',
          direction: 'push',
          mode: 'batch'
        },
        source: {
          kind_urns: { agent: 'urn:proto:agent:source@1.0.0' }
        },
        destination: {
          kind_urns: { agent: 'urn:proto:agent:dest@1.0.0' }
        },
        mapping: {
          rules: [{ from: 'x', to: 'y' }]
        },
        agentMapping: {
          artifactMapping: [
            {
              sourceArtifact: 'output.json',
              destinationInput: 'input.json'
            }
          ]
        },
        transport: {
          batch: { schedule: 'hourly' }
        },
        governance: {
          policy: { classification: 'internal' }
        }
      };

      const protocol = createIntegrationProtocol(manifest);
      const result = protocol.validate(['agentMapping.consistency']);

      expect(result.ok).toBe(true);
    });
  });

  describe('agentMapping.taskChaining validation', () => {
    test('should validate sequential task chaining', () => {
      const manifest = {
        integration: {
          id: 'sequential-chain',
          name: 'Sequential Task Chain',
          direction: 'push',
          mode: 'batch'
        },
        source: {
          kind_urns: { agent: 'urn:proto:agent:step1@1.0.0' }
        },
        destination: {
          kind_urns: { agent: 'urn:proto:agent:step2@1.0.0' }
        },
        mapping: {
          rules: [
            { from: 'step1_output', to: 'step2_input', required: true }
          ]
        },
        agentMapping: {
          taskChaining: {
            mode: 'sequential',
            errorHandling: 'fail'
          }
        },
        transport: {
          batch: { schedule: 'hourly' }
        },
        governance: {
          policy: { classification: 'internal' }
        }
      };

      const protocol = createIntegrationProtocol(manifest);
      const result = protocol.validate(['agentMapping.consistency']);

      expect(result.ok).toBe(true);
      expect(protocol.manifest().agentMapping.taskChaining.mode).toBe('sequential');
      expect(protocol.manifest().agentMapping.taskChaining.errorHandling).toBe('fail');
    });

    test('should validate parallel task chaining with compensation', () => {
      const manifest = {
        integration: {
          id: 'parallel-compensate',
          name: 'Parallel with Compensation',
          direction: 'push',
          mode: 'stream'
        },
        source: {
          kind_urns: { agent: 'urn:proto:agent:orchestrator@1.0.0' }
        },
        destination: {
          kind_urns: { agent: 'urn:proto:agent:worker@1.0.0' }
        },
        mapping: {
          rules: [
            { from: 'task', to: 'work_item', required: true }
          ]
        },
        agentMapping: {
          taskChaining: {
            mode: 'parallel',
            errorHandling: 'compensate'
          }
        },
        transport: {
          stream: { broker: 'kafka', topic: 'parallel-tasks' }
        },
        governance: {
          policy: { classification: 'internal' }
        }
      };

      const protocol = createIntegrationProtocol(manifest);
      const result = protocol.validate(['agentMapping.consistency']);

      expect(result.ok).toBe(true);
      expect(protocol.manifest().agentMapping.taskChaining.mode).toBe('parallel');
      expect(protocol.manifest().agentMapping.taskChaining.errorHandling).toBe('compensate');
    });

    test('should reject invalid taskChaining mode', () => {
      const manifest = {
        integration: {
          id: 'bad-mode',
          name: 'Bad Mode',
          direction: 'push',
          mode: 'batch'
        },
        source: {
          kind_urns: { agent: 'urn:proto:agent:source@1.0.0' }
        },
        destination: {
          kind_urns: { agent: 'urn:proto:agent:dest@1.0.0' }
        },
        mapping: {
          rules: [{ from: 'x', to: 'y' }]
        },
        agentMapping: {
          taskChaining: {
            mode: 'random' // invalid
          }
        },
        transport: {
          batch: { schedule: 'hourly' }
        },
        governance: {
          policy: { classification: 'internal' }
        }
      };

      const protocol = createIntegrationProtocol(manifest);
      const result = protocol.validate(['agentMapping.consistency']);

      expect(result.ok).toBe(false);
      const issues = result.results.find(r => r.name === 'agentMapping.consistency').issues;
      expect(issues.some(i => i.path === 'agentMapping.taskChaining.mode')).toBe(true);
    });

    test('should reject missing mode', () => {
      const manifest = {
        integration: {
          id: 'missing-mode',
          name: 'Missing Mode',
          direction: 'push',
          mode: 'batch'
        },
        source: {
          kind_urns: { agent: 'urn:proto:agent:source@1.0.0' }
        },
        destination: {
          kind_urns: { agent: 'urn:proto:agent:dest@1.0.0' }
        },
        mapping: {
          rules: [{ from: 'x', to: 'y' }]
        },
        agentMapping: {
          taskChaining: {
            errorHandling: 'fail'
          }
        },
        transport: {
          batch: { schedule: 'hourly' }
        },
        governance: {
          policy: { classification: 'internal' }
        }
      };

      const protocol = createIntegrationProtocol(manifest);
      const result = protocol.validate(['agentMapping.consistency']);

      expect(result.ok).toBe(false);
      const issues = result.results.find(r => r.name === 'agentMapping.consistency').issues;
      expect(issues.some(i => i.path === 'agentMapping.taskChaining.mode')).toBe(true);
    });

    test('should reject invalid errorHandling', () => {
      const manifest = {
        integration: {
          id: 'bad-error',
          name: 'Bad Error',
          direction: 'push',
          mode: 'batch'
        },
        source: {
          kind_urns: { agent: 'urn:proto:agent:source@1.0.0' }
        },
        destination: {
          kind_urns: { agent: 'urn:proto:agent:dest@1.0.0' }
        },
        mapping: {
          rules: [{ from: 'x', to: 'y' }]
        },
        agentMapping: {
          taskChaining: {
            mode: 'sequential',
            errorHandling: 'retry' // invalid
          }
        },
        transport: {
          batch: { schedule: 'hourly' }
        },
        governance: {
          policy: { classification: 'internal' }
        }
      };

      const protocol = createIntegrationProtocol(manifest);
      const result = protocol.validate(['agentMapping.consistency']);

      expect(result.ok).toBe(false);
      const issues = result.results.find(r => r.name === 'agentMapping.consistency').issues;
      expect(issues.some(i => i.path === 'agentMapping.taskChaining.errorHandling')).toBe(true);
    });

    test('should allow missing errorHandling (optional)', () => {
      const manifest = {
        integration: {
          id: 'minimal-chain',
          name: 'Minimal Chain',
          direction: 'push',
          mode: 'batch'
        },
        source: {
          kind_urns: { agent: 'urn:proto:agent:source@1.0.0' }
        },
        destination: {
          kind_urns: { agent: 'urn:proto:agent:dest@1.0.0' }
        },
        mapping: {
          rules: [{ from: 'x', to: 'y' }]
        },
        agentMapping: {
          taskChaining: {
            mode: 'parallel'
          }
        },
        transport: {
          batch: { schedule: 'hourly' }
        },
        governance: {
          policy: { classification: 'internal' }
        }
      };

      const protocol = createIntegrationProtocol(manifest);
      const result = protocol.validate(['agentMapping.consistency']);

      expect(result.ok).toBe(true);
    });
  });

  describe('comprehensive agentMapping scenarios', () => {
    test('should validate complete agent-to-agent integration', () => {
      const manifest = {
        integration: {
          id: 'complete-a2a',
          name: 'Complete Agent-to-Agent Integration',
          direction: 'bidirectional',
          mode: 'stream',
          lifecycle: { status: 'enabled' }
        },
        source: {
          kind_urns: { agent: 'urn:proto:agent:writer@2.0.0' },
          fields: [
            { urn: 'urn:proto:agent:writer@2.0.0#output.document', alias: 'doc' },
            { urn: 'urn:proto:agent:writer@2.0.0#output.metadata', alias: 'meta' }
          ]
        },
        destination: {
          kind_urns: { agent: 'urn:proto:agent:reviewer@2.0.0' },
          fields: [
            { urn: 'urn:proto:agent:reviewer@2.0.0#input.document', alias: 'doc' },
            { urn: 'urn:proto:agent:reviewer@2.0.0#input.metadata', alias: 'meta' }
          ]
        },
        mapping: {
          rules: [
            { from: 'doc', to: 'doc', required: true },
            { from: 'meta', to: 'meta', required: false }
          ],
          ingestion: {
            dedupe_key: 'document_id',
            idempotency: 'key'
          }
        },
        agentMapping: {
          conversationContext: {
            enabled: true,
            preserveHistory: true
          },
          artifactMapping: [
            {
              sourceArtifact: 'urn:proto:agent:writer@2.0.0#artifact.draft',
              destinationInput: 'urn:proto:agent:reviewer@2.0.0#input.draft',
              transformation: 'validate_schema'
            },
            {
              sourceArtifact: 'urn:proto:agent:writer@2.0.0#artifact.metadata',
              destinationInput: 'urn:proto:agent:reviewer@2.0.0#input.context'
            }
          ],
          taskChaining: {
            mode: 'sequential',
            errorHandling: 'compensate'
          }
        },
        transport: {
          stream: {
            broker: 'kafka',
            topic: 'agent-collaboration',
            consumer_group: 'reviewer-agents'
          },
          reliability: {
            retries: 3,
            backoff: 'exponential',
            dlq: 'agent-collaboration-dlq'
          },
          sla: {
            timeout: '30s',
            rate_limit: '100/m'
          }
        },
        governance: {
          policy: {
            classification: 'internal',
            encryption: 'in-transit'
          }
        },
        relationships: {
          invokes_workflows: ['urn:proto:workflow:review-process@1.0.0'],
          infra_hosts: ['urn:proto:infra:agent-cluster@1.0.0']
        },
        metadata: {
          owner: 'ai-platform-team',
          tags: ['agent-collaboration', 'document-workflow']
        }
      };

      const protocol = createIntegrationProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);

      // Verify all agentMapping components
      const m = protocol.manifest();
      expect(m.agentMapping.conversationContext.enabled).toBe(true);
      expect(m.agentMapping.conversationContext.preserveHistory).toBe(true);
      expect(m.agentMapping.artifactMapping.length).toBe(2);
      expect(m.agentMapping.taskChaining.mode).toBe('sequential');
      expect(m.agentMapping.taskChaining.errorHandling).toBe('compensate');
    });

    test('should allow integration without agentMapping (backward compatible)', () => {
      const manifest = {
        integration: {
          id: 'no-agent-mapping',
          name: 'No Agent Mapping',
          direction: 'push',
          mode: 'batch'
        },
        source: {
          kind_urns: { api: 'urn:proto:api:orders@1.0.0' }
        },
        destination: {
          kind_urns: { data: 'urn:proto:data:warehouse@1.0.0' }
        },
        mapping: {
          rules: [{ from: 'order_id', to: 'id', required: true }]
        },
        transport: {
          batch: { schedule: 'hourly' }
        },
        governance: {
          policy: { classification: 'internal' }
        }
      };

      const protocol = createIntegrationProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);
    });

    test('should query agentMapping fields', () => {
      const manifest = {
        integration: {
          id: 'queryable',
          name: 'Queryable',
          direction: 'push',
          mode: 'batch'
        },
        source: {
          kind_urns: { agent: 'urn:proto:agent:source@1.0.0' }
        },
        destination: {
          kind_urns: { agent: 'urn:proto:agent:dest@1.0.0' }
        },
        mapping: {
          rules: [{ from: 'x', to: 'y' }]
        },
        agentMapping: {
          conversationContext: { enabled: true },
          taskChaining: { mode: 'parallel' }
        },
        transport: {
          batch: { schedule: 'hourly' }
        },
        governance: {
          policy: { classification: 'internal' }
        }
      };

      const protocol = createIntegrationProtocol(manifest);

      // Verify the manifest is correct
      const retrievedManifest = protocol.manifest();
      expect(retrievedManifest.agentMapping).toBeDefined();
      expect(retrievedManifest.agentMapping.conversationContext.enabled).toBe(true);
      expect(retrievedManifest.agentMapping.taskChaining.mode).toBe('parallel');
    });
  });
});
