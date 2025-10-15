/**
 * Agent Protocol Integration Tests — Mission A1.2
 * Purpose: Verify agent protocol can link to workflows, APIs, IAM roles, data sources, events
 * Coverage: Cross-protocol URN references, validation, queries
 */

import { describe, test, expect } from '@jest/globals';
import { createAgentProtocol } from '../../packages/protocols/src/agent_protocol_v_1_1_1.js';

describe('Agent Protocol Cross-Protocol Integration', () => {

  describe('Agent → Workflow URN References', () => {
    test('should validate agent manifest with workflow URN in relationships', () => {
      const manifest = {
        agent: {
          id: 'task-executor',
          name: 'Task Execution Agent',
          version: '1.0.0'
        },
        capabilities: {
          tools: [
            { name: 'execute_task', description: 'Execute workflow tasks' }
          ]
        },
        communication: {
          supported: ['a2a'],
          endpoints: { a2a: 'https://api.example.com/agents/task-executor' },
          transport: { primary: 'https' }
        },
        relationships: {
          workflows: ['urn:proto:workflow:order-fulfillment@1.0.0']
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);
      expect(protocol.get('relationships.workflows')).toContain('urn:proto:workflow:order-fulfillment@1.0.0');
    });

    test('should validate agent manifest with multiple workflow URNs', () => {
      const manifest = {
        agent: {
          id: 'workflow-orchestrator',
          name: 'Workflow Orchestrator',
          version: '1.2.0'
        },
        capabilities: {
          tools: [
            { name: 'orchestrate', description: 'Orchestrate workflows' }
          ]
        },
        communication: {
          supported: ['a2a', 'mcp']
        },
        relationships: {
          workflows: [
            'urn:proto:workflow:order-fulfillment@1.0.0',
            'urn:proto:workflow:payment-processing@2.1.0',
            'urn:proto:workflow:shipping-logistics@1.5.3'
          ]
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);
      expect(protocol.get('relationships.workflows').length).toBe(3);
    });

    test('should reject invalid workflow URN', () => {
      const manifest = {
        agent: {
          id: 'bad-agent',
          name: 'Bad Agent'
        },
        relationships: {
          workflows: ['not-a-valid-urn']
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(false);
      const relationshipIssues = result.results.find(r => r.name === 'relationships.urns');
      expect(relationshipIssues.issues.length).toBeGreaterThan(0);
    });

    test('should support workflow URN with fragment', () => {
      const manifest = {
        agent: {
          id: 'workflow-node-agent',
          name: 'Workflow Node Agent',
          version: '1.0.0'
        },
        relationships: {
          workflows: ['urn:proto:workflow:complex-flow@1.0.0#node.payment']
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);
    });
  });

  describe('Agent → API URN References', () => {
    test('should validate agent manifest with API URN in relationships', () => {
      const manifest = {
        agent: {
          id: 'api-caller',
          name: 'API Caller Agent',
          version: '1.0.0'
        },
        capabilities: {
          tools: [
            { name: 'call_api', description: 'Make API calls' }
          ]
        },
        communication: {
          supported: ['mcp']
        },
        relationships: {
          apis: ['urn:proto:api:billing@1.2.0']
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);
      expect(protocol.get('relationships.apis')).toContain('urn:proto:api:billing@1.2.0');
    });

    test('should validate agent manifest with API URN including fragment', () => {
      const manifest = {
        agent: {
          id: 'invoice-agent',
          name: 'Invoice Processing Agent',
          version: '1.0.0'
        },
        relationships: {
          apis: ['urn:proto:api:billing@1.2.0#/v1/invoices']
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);
      expect(protocol.get('relationships.apis')[0]).toBe('urn:proto:api:billing@1.2.0#/v1/invoices');
    });

    test('should validate agent with multiple API URNs', () => {
      const manifest = {
        agent: {
          id: 'multi-api-agent',
          name: 'Multi-API Agent',
          version: '2.0.0'
        },
        relationships: {
          apis: [
            'urn:proto:api:billing@1.2.0',
            'urn:proto:api:users@2.0.0',
            'urn:proto:api:analytics@1.5.0#/v1/reports'
          ]
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);
      expect(protocol.get('relationships.apis').length).toBe(3);
    });
  });

  describe('Agent → IAM Role URN References', () => {
    test('should validate agent manifest with IAM role URN', () => {
      const manifest = {
        agent: {
          id: 'privileged-agent',
          name: 'Privileged Data Agent',
          version: '1.0.0'
        },
        capabilities: {
          tools: [
            { name: 'process_sensitive_data', description: 'Process sensitive data' }
          ]
        },
        authorization: {
          delegation_supported: true,
          signature_algorithm: 'ES256'
        },
        relationships: {
          roles: ['urn:proto:iam:data-processor@1.0.0']
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);
      expect(protocol.get('relationships.roles')).toContain('urn:proto:iam:data-processor@1.0.0');
    });

    test('should validate agent with multiple IAM roles', () => {
      const manifest = {
        agent: {
          id: 'admin-agent',
          name: 'Administrative Agent',
          version: '1.0.0'
        },
        authorization: {
          delegation_supported: true,
          signature_algorithm: 'Ed25519'
        },
        relationships: {
          roles: [
            'urn:proto:iam:admin@1.0.0',
            'urn:proto:iam:auditor@1.0.0',
            'urn:proto:iam:data-manager@2.0.0'
          ]
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);
      expect(protocol.get('relationships.roles').length).toBe(3);
    });

    test('should reject invalid IAM URN format', () => {
      const manifest = {
        agent: {
          id: 'bad-iam-agent',
          name: 'Bad IAM Agent'
        },
        relationships: {
          roles: ['invalid-iam-urn']
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(false);
    });
  });

  describe('Agent → Data Source URN References', () => {
    test('should validate agent manifest with data source URN', () => {
      const manifest = {
        agent: {
          id: 'data-fetcher',
          name: 'Data Fetcher Agent',
          version: '1.0.0'
        },
        capabilities: {
          resources: [
            { uri: 'postgres://db.example.com/orders', name: 'Orders Database' }
          ]
        },
        relationships: {
          targets: ['urn:proto:data:orders@1.0.0']
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);
      expect(protocol.get('relationships.targets')).toContain('urn:proto:data:orders@1.0.0');
    });

    test('should validate agent with multiple data sources', () => {
      const manifest = {
        agent: {
          id: 'data-aggregator',
          name: 'Data Aggregation Agent',
          version: '2.0.0'
        },
        relationships: {
          targets: [
            'urn:proto:data:orders@1.0.0',
            'urn:proto:data:customers@1.0.0',
            'urn:proto:data:inventory@2.1.0'
          ]
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);
      expect(protocol.get('relationships.targets').length).toBe(3);
    });

    test('should validate data URN with fragment', () => {
      const manifest = {
        agent: {
          id: 'specific-data-agent',
          name: 'Specific Data Agent',
          version: '1.0.0'
        },
        relationships: {
          targets: ['urn:proto:data:events@1.0.0#stream.orders']
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);
    });
  });

  describe('Agent → Event URN References', () => {
    test('should validate agent manifest with event URN', () => {
      const manifest = {
        agent: {
          id: 'event-handler',
          name: 'Event Handler Agent',
          version: '1.0.0'
        },
        capabilities: {
          tools: [
            { name: 'handle_event', description: 'Process events' }
          ]
        },
        relationships: {
          targets: ['urn:proto:event:order.created@1.0.0']
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);
      expect(protocol.get('relationships.targets')).toContain('urn:proto:event:order.created@1.0.0');
    });

    test('should validate agent with multiple event subscriptions', () => {
      const manifest = {
        agent: {
          id: 'event-subscriber',
          name: 'Multi-Event Subscriber Agent',
          version: '1.5.0'
        },
        relationships: {
          targets: [
            'urn:proto:event:order.created@1.0.0',
            'urn:proto:event:order.updated@1.0.0',
            'urn:proto:event:order.cancelled@2.0.0'
          ]
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);
      expect(protocol.get('relationships.targets').length).toBe(3);
    });
  });

  describe('Agent → AI Model URN References', () => {
    test('should validate agent manifest with AI model URN', () => {
      const manifest = {
        agent: {
          id: 'ai-powered-agent',
          name: 'AI-Powered Agent',
          version: '1.0.0'
        },
        capabilities: {
          tools: [
            { name: 'generate_text', description: 'Generate text using AI' }
          ]
        },
        relationships: {
          models: ['urn:proto:ai:gpt-4@1.0.0']
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);
      expect(protocol.get('relationships.models')).toContain('urn:proto:ai:gpt-4@1.0.0');
    });

    test('should validate agent with multiple AI models', () => {
      const manifest = {
        agent: {
          id: 'multi-model-agent',
          name: 'Multi-Model AI Agent',
          version: '2.0.0'
        },
        relationships: {
          models: [
            'urn:proto:ai:gpt-4@1.0.0',
            'urn:proto:ai:claude@2.1.0',
            'urn:proto:ai:embedding-model@1.0.0'
          ]
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);
      expect(protocol.get('relationships.models').length).toBe(3);
    });
  });

  describe('Multi-Protocol URN References', () => {
    test('should validate agent with URNs from all protocol categories', () => {
      const manifest = {
        agent: {
          id: 'comprehensive-agent',
          name: 'Comprehensive Integration Agent',
          version: '1.0.0',
          lifecycle: { status: 'enabled' }
        },
        capabilities: {
          tools: [
            {
              name: 'process_order',
              description: 'Process customer orders',
              urn: 'urn:proto:agent:comprehensive-agent@1.0.0#tool.process_order'
            }
          ],
          resources: [
            {
              uri: 'https://api.example.com/docs',
              name: 'API Documentation',
              urn: 'urn:proto:docs:api-reference@1.0.0'
            }
          ]
        },
        communication: {
          supported: ['a2a', 'mcp'],
          endpoints: {
            a2a: 'https://api.example.com/agents/comprehensive',
            mcp: 'stdio://comprehensive-agent'
          },
          transport: {
            primary: 'https',
            streaming: 'sse',
            fallback: 'polling'
          }
        },
        authorization: {
          delegation_supported: true,
          signature_algorithm: 'ES256'
        },
        relationships: {
          models: ['urn:proto:ai:gpt-4@1.0.0'],
          apis: ['urn:proto:api:billing@1.2.0#/v1/invoices'],
          workflows: ['urn:proto:workflow:order-fulfillment@1.0.0'],
          roles: ['urn:proto:iam:data-processor@1.0.0'],
          targets: [
            'urn:proto:data:orders@1.0.0',
            'urn:proto:event:order.created@1.0.0',
            'urn:proto:obs:metrics@1.0.0',
            'urn:proto:config:app-settings@1.0.0'
          ]
        },
        metadata: {
          owner: 'platform-team',
          tags: ['production', 'critical', 'order-processing']
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);

      // Verify all relationship categories
      expect(protocol.get('relationships.models').length).toBe(1);
      expect(protocol.get('relationships.apis').length).toBe(1);
      expect(protocol.get('relationships.workflows').length).toBe(1);
      expect(protocol.get('relationships.roles').length).toBe(1);
      expect(protocol.get('relationships.targets').length).toBe(4);

      // Verify capability URNs
      expect(protocol.get('capabilities.tools.0.urn')).toBe('urn:proto:agent:comprehensive-agent@1.0.0#tool.process_order');
      expect(protocol.get('capabilities.resources.0.urn')).toBe('urn:proto:docs:api-reference@1.0.0');
    });

    test('should support querying for specific URN types', () => {
      const manifest = {
        agent: {
          id: 'queryable-agent',
          name: 'Queryable Agent',
          version: '1.0.0'
        },
        relationships: {
          workflows: ['urn:proto:workflow:order-fulfillment@1.0.0'],
          apis: ['urn:proto:api:billing@1.2.0']
        }
      };

      const protocol = createAgentProtocol(manifest);

      expect(protocol.query('relationships.workflows:contains:workflow:order-fulfillment')).toBe(true);
      expect(protocol.query('relationships.apis:contains:api:billing')).toBe(true);
      expect(protocol.query('relationships.workflows:contains:nonexistent')).toBe(false);
    });
  });

  describe('URN Validation Across All 18 Protocol Types', () => {
    test('should accept URNs from all 18 protocol types in relationships.targets', () => {
      const protocolTypes = [
        'api', 'data', 'event', 'ui', 'workflow', 'infra', 'device',
        'ai', 'iam', 'metric', 'integration', 'testing', 'docs',
        'obs', 'config', 'release', 'agent'
      ];

      const targets = protocolTypes.map(type => `urn:proto:${type}:test-resource@1.0.0`);

      const manifest = {
        agent: {
          id: 'all-protocols-agent',
          name: 'All Protocols Agent',
          version: '1.0.0'
        },
        relationships: {
          targets
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);
      expect(protocol.get('relationships.targets').length).toBe(17); // 18 - 1 (agent type goes in different field)
    });

    test('should validate agent URN referencing another agent', () => {
      const manifest = {
        agent: {
          id: 'delegating-agent',
          name: 'Delegating Agent',
          version: '1.0.0'
        },
        relationships: {
          targets: ['urn:proto:agent:helper-agent@2.0.0']
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);
      expect(protocol.get('relationships.targets')).toContain('urn:proto:agent:helper-agent@2.0.0');
    });

    test('should validate URNs with various naming conventions', () => {
      const manifest = {
        agent: {
          id: 'naming-test-agent',
          name: 'Naming Convention Test Agent',
          version: '1.0.0'
        },
        relationships: {
          targets: [
            'urn:proto:api:simple@1.0.0',
            'urn:proto:api:with-hyphens@1.0.0',
            'urn:proto:api:with_underscores@1.0.0',
            'urn:proto:api:with.dots@1.0.0',
            'urn:proto:api:MixedCase@1.0.0',
            'urn:proto:api:with123numbers@1.0.0',
            'urn:proto:api:complex-name_v2.3@10.20.30'
          ]
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);
      expect(protocol.get('relationships.targets').length).toBe(7);
    });

    test('should validate URNs with fragments', () => {
      const manifest = {
        agent: {
          id: 'fragment-test-agent',
          name: 'Fragment Test Agent',
          version: '1.0.0'
        },
        relationships: {
          targets: [
            'urn:proto:api:billing@1.2.0#/v1/invoices',
            'urn:proto:workflow:order@1.0.0#node.payment',
            'urn:proto:data:events@1.0.0#stream.orders',
            'urn:proto:agent:helper@1.0.0#capability.transform.json'
          ]
        }
      };

      const protocol = createAgentProtocol(manifest);
      const result = protocol.validate();

      expect(result.ok).toBe(true);
      expect(protocol.get('relationships.targets').length).toBe(4);
    });
  });

  describe('Cross-Protocol Query Integration', () => {
    test('should query agent→workflow relationships', () => {
      const manifest = {
        agent: {
          id: 'workflow-agent',
          name: 'Workflow Agent',
          version: '1.0.0'
        },
        relationships: {
          workflows: ['urn:proto:workflow:order-fulfillment@1.0.0']
        }
      };

      const protocol = createAgentProtocol(manifest);

      expect(protocol.query('agent.id:=:workflow-agent')).toBe(true);
      expect(protocol.query('relationships.workflows:contains:order-fulfillment')).toBe(true);
    });

    test('should query agent→api relationships', () => {
      const manifest = {
        agent: {
          id: 'api-agent',
          name: 'API Agent',
          version: '2.0.0'
        },
        relationships: {
          apis: ['urn:proto:api:billing@1.2.0']
        }
      };

      const protocol = createAgentProtocol(manifest);

      expect(protocol.query('agent.version:=:2.0.0')).toBe(true);
      expect(protocol.query('relationships.apis:contains:billing')).toBe(true);
    });

    test('should query agent→iam relationships', () => {
      const manifest = {
        agent: {
          id: 'privileged-agent',
          name: 'Privileged Agent',
          version: '1.0.0'
        },
        relationships: {
          roles: ['urn:proto:iam:role:data-processor@1.0.0']
        }
      };

      const protocol = createAgentProtocol(manifest);

      expect(protocol.query('agent.name:contains:Privileged')).toBe(true);
      expect(protocol.query('relationships.roles:contains:data-processor')).toBe(true);
    });

    test('should query complex multi-protocol relationships', () => {
      const manifest = {
        agent: {
          id: 'complex-agent',
          name: 'Complex Agent',
          version: '3.0.0'
        },
        relationships: {
          models: ['urn:proto:ai:gpt-4@1.0.0'],
          apis: ['urn:proto:api:billing@1.2.0'],
          workflows: ['urn:proto:workflow:order@1.0.0'],
          roles: ['urn:proto:iam:role:admin@1.0.0'],
          targets: [
            'urn:proto:data:orders@1.0.0',
            'urn:proto:event:order.created@1.0.0'
          ]
        }
      };

      const protocol = createAgentProtocol(manifest);

      expect(protocol.query('relationships.models:contains:gpt-4')).toBe(true);
      expect(protocol.query('relationships.apis:contains:billing')).toBe(true);
      expect(protocol.query('relationships.workflows:contains:order')).toBe(true);
      expect(protocol.query('relationships.roles:contains:admin')).toBe(true);
      expect(protocol.query('relationships.targets:contains:orders')).toBe(true);
      expect(protocol.query('relationships.targets:contains:order.created')).toBe(true);
    });
  });

  describe('Agent Protocol Diff with Cross-Protocol URNs', () => {
    test('should detect changes in workflow relationships', () => {
      const v1 = {
        agent: { id: 'test', name: 'Test' },
        relationships: {
          workflows: ['urn:proto:workflow:order@1.0.0']
        }
      };

      const v2 = {
        agent: { id: 'test', name: 'Test' },
        relationships: {
          workflows: ['urn:proto:workflow:order@2.0.0']
        }
      };

      const p1 = createAgentProtocol(v1);
      const diffResult = p1.diff(v2);

      expect(diffResult.significant.length).toBeGreaterThan(0);
      expect(diffResult.significant.some(c => c.reason === 'cross-protocol links changed')).toBe(true);
    });

    test('should detect addition of API relationships', () => {
      const v1 = {
        agent: { id: 'test', name: 'Test' },
        relationships: {}
      };

      const v2 = {
        agent: { id: 'test', name: 'Test' },
        relationships: {
          apis: ['urn:proto:api:billing@1.2.0']
        }
      };

      const p1 = createAgentProtocol(v1);
      const diffResult = p1.diff(v2);

      expect(diffResult.significant.some(c => c.reason === 'cross-protocol links changed')).toBe(true);
    });
  });

  describe('Agent Card Generation with Cross-Protocol URNs', () => {
    test('should generate agent card preserving cross-protocol metadata', () => {
      const manifest = {
        agent: {
          id: 'card-test-agent',
          name: 'Card Test Agent',
          version: '1.0.0',
          discovery_uri: 'https://api.example.com/.well-known/agent-card'
        },
        capabilities: {
          tools: [
            {
              name: 'transform',
              description: 'Transform data',
              urn: 'urn:proto:agent:card-test-agent@1.0.0#tool.transform'
            }
          ]
        },
        communication: {
          supported: ['a2a'],
          endpoints: { a2a: 'https://api.example.com/agent' },
          transport: { primary: 'https' }
        },
        authorization: {
          delegation_supported: true,
          signature_algorithm: 'ES256'
        }
      };

      const protocol = createAgentProtocol(manifest);
      const card = protocol.generateAgentCard();

      expect(card.id).toBe('card-test-agent');
      expect(card.name).toBe('Card Test Agent');
      expect(card.version).toBe('1.0.0');
      expect(card.discovery_uri).toBe('https://api.example.com/.well-known/agent-card');
      expect(card.capabilities.tools[0].name).toBe('transform');
      expect(card.authorization.delegation_supported).toBe(true);
    });
  });
});
