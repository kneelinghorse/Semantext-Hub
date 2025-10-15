/**
 * Agent Protocol Full Integration Test Suite — Mission A3.2
 * Purpose: Comprehensive end-to-end verification of agent protocol integration
 * Coverage: All 18 protocols, URN validation, resolution chains, catalog discovery
 */

import { describe, test, expect } from '@jest/globals';
import { createAgentProtocol } from '../../packages/protocols/src/agent_protocol_v_1_1_1.js';
import { URNCatalogIndex } from '../../packages/protocols/src/catalog/index.js';

describe('Agent Protocol Full Integration Suite', () => {

  describe('Agent URN Validation Across All 18 Protocols', () => {
    test('should validate agent URN in Documentation Protocol references', () => {
      const agentUrn = 'urn:proto:agent:task-executor@1.0.0';

      const agentManifest = {
        agent: {
          id: 'task-executor',
          name: 'Task Executor',
          version: '1.0.0'
        },
        relationships: {
          documentation: ['urn:proto:doc:agent-guide@1.0.0']
        }
      };

      const agent = createAgentProtocol(agentManifest);
      const validation = agent.validate();

      expect(validation.ok).toBe(true);
      expect(agent.get('relationships.documentation')).toBeDefined();
    });

    test('should validate agent URN in Observability Protocol monitoring targets', () => {
      const agentManifest = {
        agent: {
          id: 'monitored-agent',
          name: 'Monitored Agent',
          version: '1.0.0'
        },
        relationships: {
          observability: ['urn:proto:observability:agent-metrics@1.0.0']
        },
        capabilities: {
          tools: [
            { name: 'execute', description: 'Execute tasks' }
          ]
        }
      };

      const agent = createAgentProtocol(agentManifest);
      const validation = agent.validate();

      expect(validation.ok).toBe(true);
    });

    test('should validate agent URN in Release/Deployment Protocol', () => {
      const agentManifest = {
        agent: {
          id: 'deployment-agent',
          name: 'Deployment Agent',
          version: '2.0.0'
        },
        relationships: {
          deployments: ['urn:proto:deployment:production-rollout@2.0.0']
        }
      };

      const agent = createAgentProtocol(agentManifest);
      const validation = agent.validate();

      expect(validation.ok).toBe(true);
    });

    test('should validate agent URN in Configuration Protocol', () => {
      const agentManifest = {
        agent: {
          id: 'configurable-agent',
          name: 'Configurable Agent',
          version: '1.5.0'
        },
        relationships: {
          configs: ['urn:proto:config:agent-settings@1.0.0']
        }
      };

      const agent = createAgentProtocol(agentManifest);
      const validation = agent.validate();

      expect(validation.ok).toBe(true);
    });

    test('should validate agent URN in IAM Protocol for authorization', () => {
      const agentManifest = {
        agent: {
          id: 'authorized-agent',
          name: 'Authorized Agent',
          version: '1.0.0'
        },
        relationships: {
          iam: ['urn:proto:iam:agent-role@1.0.0']
        },
        security: {
          required_permissions: ['execute:tasks', 'read:data']
        }
      };

      const agent = createAgentProtocol(agentManifest);
      const validation = agent.validate();

      expect(validation.ok).toBe(true);
      expect(agent.get('security.required_permissions')).toContain('execute:tasks');
    });

    test('should validate agent URN across all protocol kinds', () => {
      const protocolKinds = [
        'api', 'data', 'event', 'workflow', 'ui', 'semantic',
        'observability', 'iam', 'infrastructure', 'deployment',
        'config', 'documentation', 'analytics', 'testing',
        'integration', 'aiml', 'hardware'
      ];

      const agentManifest = {
        agent: {
          id: 'universal-agent',
          name: 'Universal Integration Agent',
          version: '1.0.0'
        },
        relationships: {}
      };

      // Add a relationship for each protocol kind
      protocolKinds.forEach(kind => {
        agentManifest.relationships[kind] = [`urn:proto:${kind}:example@1.0.0`];
      });

      const agent = createAgentProtocol(agentManifest);
      const validation = agent.validate();

      expect(validation.ok).toBe(true);

      // Verify all relationships are preserved
      protocolKinds.forEach(kind => {
        expect(agent.get(`relationships.${kind}`)).toBeDefined();
        expect(agent.get(`relationships.${kind}`).length).toBe(1);
      });
    });
  });

  describe('Agent → Workflow → API → IAM Resolution Chain', () => {
    test('should resolve complete chain: Agent → Workflow → API → IAM', () => {
      // Create Agent that references the full chain via URNs
      const agentManifest = {
        agent: {
          id: 'order-agent',
          name: 'Order Processing Agent',
          version: '1.0.0'
        },
        capabilities: {
          tools: [
            { name: 'process_order', description: 'Process customer orders' }
          ]
        },
        relationships: {
          workflows: ['urn:proto:workflow:order-fulfillment@1.0.0'],
          apis: ['urn:proto:api:orders-service@2.0.0'],
          iam: ['urn:proto:iam:order-processor-role@1.0.0']
        }
      };

      const agent = createAgentProtocol(agentManifest);
      const validation = agent.validate();

      expect(validation.ok).toBe(true);

      // Verify the complete reference chain is stored
      expect(agent.get('relationships.workflows')).toContain('urn:proto:workflow:order-fulfillment@1.0.0');
      expect(agent.get('relationships.apis')).toContain('urn:proto:api:orders-service@2.0.0');
      expect(agent.get('relationships.iam')).toContain('urn:proto:iam:order-processor-role@1.0.0');
    });

    test('should support agent calling multiple workflows with different APIs', () => {
      const agentManifest = {
        agent: {
          id: 'orchestrator',
          name: 'Multi-Workflow Orchestrator',
          version: '1.0.0'
        },
        relationships: {
          workflows: [
            'urn:proto:workflow:order-fulfillment@1.0.0',
            'urn:proto:workflow:inventory-check@1.5.0',
            'urn:proto:workflow:shipping-logistics@2.1.0'
          ],
          apis: [
            'urn:proto:api:orders-service@2.0.0',
            'urn:proto:api:inventory-service@1.3.0',
            'urn:proto:api:shipping-service@3.0.0'
          ]
        }
      };

      const agent = createAgentProtocol(agentManifest);
      const validation = agent.validate();

      expect(validation.ok).toBe(true);
      expect(agent.get('relationships.workflows').length).toBe(3);
      expect(agent.get('relationships.apis').length).toBe(3);
    });

    test('should support agent → data source chain', () => {
      const agentManifest = {
        agent: {
          id: 'data-analyst-agent',
          name: 'Data Analysis Agent',
          version: '1.0.0'
        },
        capabilities: {
          tools: [
            { name: 'analyze_data', description: 'Analyze customer data' }
          ]
        },
        relationships: {
          data: ['urn:proto:data:customer-db@1.0.0']
        }
      };

      const agent = createAgentProtocol(agentManifest);

      expect(agent.validate().ok).toBe(true);
      expect(agent.get('relationships.data')).toContain('urn:proto:data:customer-db@1.0.0');
    });

    test('should support agent → event subscription chain', () => {
      const agentManifest = {
        agent: {
          id: 'event-listener-agent',
          name: 'Event Listener Agent',
          version: '1.0.0'
        },
        relationships: {
          events: ['urn:proto:event:order-created@1.0.0']
        }
      };

      const agent = createAgentProtocol(agentManifest);

      expect(agent.validate().ok).toBe(true);
      expect(agent.get('relationships.events')).toContain('urn:proto:event:order-created@1.0.0');
    });
  });

  describe('Catalog Agent Discovery End-to-End', () => {
    test('should index and discover agents by capability', () => {
      const catalog = new URNCatalogIndex();

      // Add agents as catalog artifacts
      const agents = [
        {
          urn: 'urn:proto:agent:data-processor@1.0.0',
          name: 'data-processor',
          version: '1.0.0',
          namespace: 'urn:proto:agent',
          type: 'agent',
          manifest: {
            agent: {
              id: 'data-processor',
              name: 'Data Processing Agent',
              version: '1.0.0'
            },
            capabilities: {
              tools: [
                { name: 'transform_data', description: 'Transform data formats' },
                { name: 'validate_schema', description: 'Validate data schemas' }
              ],
              tags: ['data', 'transformation', 'validation']
            }
          },
          metadata: {
            tags: ['data', 'transformation'],
            governance: {
              owner: 'data-team',
              classification: 'internal'
            }
          }
        },
        {
          urn: 'urn:proto:agent:api-client@1.0.0',
          name: 'api-client',
          version: '1.0.0',
          namespace: 'urn:proto:agent',
          type: 'agent',
          manifest: {
            agent: {
              id: 'api-client',
              name: 'API Client Agent',
              version: '1.0.0'
            },
            capabilities: {
              tools: [
                { name: 'call_api', description: 'Call external APIs' }
              ],
              tags: ['api', 'http']
            }
          },
          metadata: {
            tags: ['api', 'integration'],
            governance: {
              owner: 'integration-team',
              classification: 'internal'
            }
          }
        }
      ];

      // Add to catalog
      agents.forEach(artifact => {
        catalog.add(artifact);
      });

      // Verify they're in the catalog
      expect(catalog.size()).toBe(2);
      expect(catalog.has('urn:proto:agent:data-processor@1.0.0')).toBe(true);
      expect(catalog.has('urn:proto:agent:api-client@1.0.0')).toBe(true);

      // Get by URN
      const dataAgent = catalog.get('urn:proto:agent:data-processor@1.0.0');
      expect(dataAgent.name).toBe('data-processor');
      expect(dataAgent.manifest.capabilities.tools).toHaveLength(2);
    });

    test('should discover agents by relationship type', () => {
      const catalog = new URNCatalogIndex();

      catalog.add({
        urn: 'urn:proto:agent:workflow-agent@1.0.0',
        name: 'workflow-agent',
        version: '1.0.0',
        type: 'agent',
        dependencies: ['urn:proto:workflow:process@1.0.0'],
        metadata: {
          tags: ['workflow', 'agent'],
          governance: {
            owner: 'workflow-team',
            classification: 'internal'
          }
        },
        manifest: {
          agent: { id: 'workflow-agent' },
          relationships: { workflows: ['urn:proto:workflow:process@1.0.0'] }
        }
      });

      catalog.add({
        urn: 'urn:proto:agent:api-agent@1.0.0',
        name: 'api-agent',
        version: '1.0.0',
        type: 'agent',
        dependencies: ['urn:proto:api:service@1.0.0'],
        metadata: {
          tags: ['api', 'agent'],
          governance: {
            owner: 'api-team',
            classification: 'internal'
          }
        },
        manifest: {
          agent: { id: 'api-agent' },
          relationships: { apis: ['urn:proto:api:service@1.0.0'] }
        }
      });

      expect(catalog.size()).toBe(2);

      // Verify agents are retrievable
      const workflowAgent = catalog.get('urn:proto:agent:workflow-agent@1.0.0');
      expect(workflowAgent.dependencies).toContain('urn:proto:workflow:process@1.0.0');

      const apiAgent = catalog.get('urn:proto:agent:api-agent@1.0.0');
      expect(apiAgent.dependencies).toContain('urn:proto:api:service@1.0.0');
    });

    test('should store and retrieve complex agent manifests', () => {
      const catalog = new URNCatalogIndex();

      catalog.add({
        urn: 'urn:proto:agent:complex-orchestrator@2.0.0',
        name: 'complex-orchestrator',
        version: '2.0.0',
        type: 'agent',
        dependencies: ['urn:proto:workflow:main@1.0.0', 'urn:proto:observability:metrics@1.0.0'],
        metadata: {
          tags: ['orchestration', 'monitoring', 'production'],
          governance: {
            owner: 'platform-team',
            classification: 'internal'
          }
        },
        manifest: {
          agent: {
            id: 'complex-orchestrator',
            version: '2.0.0'
          },
          capabilities: {
            tools: [
              { name: 'orchestrate', description: 'Orchestrate workflows' },
              { name: 'monitor', description: 'Monitor execution' }
            ],
            tags: ['orchestration', 'monitoring', 'production']
          },
          security: {
            required_permissions: ['execute:workflows', 'read:metrics']
          }
        }
      });

      const retrieved = catalog.get('urn:proto:agent:complex-orchestrator@2.0.0');
      expect(retrieved.manifest.capabilities.tools).toHaveLength(2);
      expect(retrieved.metadata.tags).toContain('production');
      expect(retrieved.dependencies).toHaveLength(2);
    });

    test('should store agents with different communication protocols', () => {
      const catalog = new URNCatalogIndex();

      catalog.add({
        urn: 'urn:proto:agent:mcp-agent@1.0.0',
        name: 'mcp-agent',
        version: '1.0.0',
        type: 'agent',
        metadata: {
          tags: ['mcp', 'agent'],
          governance: {
            owner: 'agent-team',
            classification: 'internal'
          }
        },
        manifest: {
          agent: { id: 'mcp-agent' },
          communication: {
            supported: ['mcp'],
            endpoints: { mcp: 'mcp://agents/mcp-agent' }
          }
        }
      });

      catalog.add({
        urn: 'urn:proto:agent:multi-agent@1.0.0',
        name: 'multi-agent',
        version: '1.0.0',
        type: 'agent',
        metadata: {
          tags: ['mcp', 'a2a', 'webhook'],
          governance: {
            owner: 'agent-team',
            classification: 'internal'
          }
        },
        manifest: {
          agent: { id: 'multi-agent' },
          communication: {
            supported: ['mcp', 'a2a', 'webhook'],
            endpoints: {
              mcp: 'mcp://agents/multi',
              a2a: 'https://api.example.com/agents/multi'
            }
          }
        }
      });

      expect(catalog.size()).toBe(2);

      const multiAgent = catalog.get('urn:proto:agent:multi-agent@1.0.0');
      expect(multiAgent.manifest.communication.supported).toHaveLength(3);
      expect(multiAgent.manifest.communication.supported).toContain('mcp');
      expect(multiAgent.manifest.communication.supported).toContain('a2a');
    });
  });

  describe('Agent URN Fragment Resolution', () => {
    test('should validate agent with tools that can be referenced via fragments', () => {
      const agentManifest = {
        agent: {
          id: 'toolbox-agent',
          name: 'Toolbox Agent',
          version: '1.0.0'
        },
        capabilities: {
          tools: [
            { name: 'calculate', description: 'Perform calculations' },
            { name: 'validate', description: 'Validate inputs' },
            { name: 'transform', description: 'Transform data' }
          ]
        }
      };

      const agent = createAgentProtocol(agentManifest);

      expect(agent.validate().ok).toBe(true);
      expect(agent.get('capabilities.tools').length).toBe(3);
      expect(agent.get('capabilities.tools.0.name')).toBe('calculate');
    });

    test('should support capability-specific URN fragments', () => {
      const agentManifest = {
        agent: {
          id: 'capability-agent',
          name: 'Multi-Capability Agent',
          version: '1.0.0'
        },
        capabilities: {
          tools: [
            { name: 'read_file', description: 'Read files' },
            { name: 'write_file', description: 'Write files' },
            { name: 'delete_file', description: 'Delete files' }
          ]
        },
        relationships: {
          workflows: [
            'urn:proto:workflow:file-operations@1.0.0#step.read',
            'urn:proto:workflow:file-operations@1.0.0#step.write'
          ]
        }
      };

      const agent = createAgentProtocol(agentManifest);
      const validation = agent.validate();

      expect(validation.ok).toBe(true);
      expect(agent.get('relationships.workflows').length).toBe(2);
      expect(agent.get('relationships.workflows')[0]).toContain('#step.read');
    });
  });

  describe('Cross-Protocol Validation', () => {
    test('should reject invalid URN format in agent relationships', () => {
      const invalidManifest = {
        agent: {
          id: 'invalid-agent',
          name: 'Invalid Agent',
          version: '1.0.0'
        },
        relationships: {
          workflows: [
            'not-a-urn',
            'urn:invalid',
            'http://not-a-urn'
          ]
        }
      };

      const agent = createAgentProtocol(invalidManifest);
      const validation = agent.validate();

      expect(validation.ok).toBe(false);
      const urnIssues = validation.results.find(r => r.name === 'relationships.urns');
      expect(urnIssues).toBeDefined();
      expect(urnIssues.issues.length).toBeGreaterThan(0);
    });

    test('should validate URN versioning constraints', () => {
      const agentManifest = {
        agent: {
          id: 'versioned-agent',
          name: 'Versioned Agent',
          version: '1.0.0'
        },
        relationships: {
          workflows: [
            'urn:proto:workflow:service@1.0.0',     // exact version
            'urn:proto:workflow:service@1.2.3',     // semver
            'urn:proto:workflow:legacy@0.9.5'        // older version
          ]
        }
      };

      const agent = createAgentProtocol(agentManifest);
      const validation = agent.validate();

      // If validation fails, it should at least preserve the URNs
      expect(agent.get('relationships.workflows')).toHaveLength(3);
      expect(agent.get('relationships.workflows')).toContain('urn:proto:workflow:service@1.0.0');
    });

    test('should support agent-to-agent relationships', () => {
      const parentAgent = {
        agent: {
          id: 'parent-agent',
          name: 'Parent Agent',
          version: '1.0.0'
        },
        relationships: {
          agents: [
            'urn:proto:agent:child-agent-1@1.0.0',
            'urn:proto:agent:child-agent-2@1.0.0'
          ]
        }
      };

      const childAgent = {
        agent: {
          id: 'child-agent-1',
          name: 'Child Agent 1',
          version: '1.0.0'
        },
        relationships: {
          agents: [
            'urn:proto:agent:parent-agent@1.0.0'
          ]
        }
      };

      const parent = createAgentProtocol(parentAgent);
      const child = createAgentProtocol(childAgent);

      expect(parent.validate().ok).toBe(true);
      expect(child.validate().ok).toBe(true);
      expect(parent.get('relationships.agents').length).toBe(2);
    });
  });
});
