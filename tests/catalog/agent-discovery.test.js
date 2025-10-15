/**
 * Tests for Agent Discovery in URNCatalogIndex
 * @module tests/catalog/agent-discovery.test
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { URNCatalogIndex } from '../../packages/protocols/src/catalog/index.js';

describe('URNCatalogIndex - Agent Discovery', () => {
  /** @type {URNCatalogIndex} */
  let catalog;

  beforeEach(() => {
    catalog = new URNCatalogIndex();
  });

  describe('Agent Capability Indexing', () => {
    it('should index agent by tool name', () => {
      const agentManifest = {
        agent: {
          id: 'urn:proto:agent:payment-processor@1.0.0',
          name: 'Payment Processor'
        },
        capabilities: {
          tools: [
            { name: 'process_payment', description: 'Process payment transactions' },
            { name: 'refund_payment', description: 'Refund a payment' }
          ]
        }
      };

      catalog.indexAgentCapabilities(agentManifest);

      const result = catalog.findAgentsByTool('process_payment');
      expect(result.count).toBe(1);
      expect(result.results).toContain('urn:proto:agent:payment-processor@1.0.0');
      expect(result.took).toBeLessThan(50);
    });

    it('should index agent by resource URI', () => {
      const agentManifest = {
        agent: {
          id: 'urn:proto:agent:data-fetcher@1.0.0',
          name: 'Data Fetcher'
        },
        capabilities: {
          resources: [
            { uri: 'file:///data/customers.json', mimeType: 'application/json' },
            { uri: 'https://api.example.com/users', mimeType: 'application/json' }
          ]
        }
      };

      catalog.indexAgentCapabilities(agentManifest);

      const result = catalog.findAgentsByResource('file:///data/customers.json');
      expect(result.count).toBe(1);
      expect(result.results).toContain('urn:proto:agent:data-fetcher@1.0.0');
      expect(result.took).toBeLessThan(50);
    });

    it('should index agent by workflow URN', () => {
      const agentManifest = {
        agent: {
          id: 'urn:proto:agent:workflow-executor@1.0.0',
          name: 'Workflow Executor'
        },
        relationships: {
          workflows: [
            'urn:proto:workflow:payment-flow@1.0.0',
            'urn:proto:workflow:order-processing@2.0.0'
          ]
        }
      };

      catalog.indexAgentCapabilities(agentManifest);

      const result = catalog.findAgentsByWorkflow('urn:proto:workflow:payment-flow@1.0.0');
      expect(result.count).toBe(1);
      expect(result.results).toContain('urn:proto:agent:workflow-executor@1.0.0');
      expect(result.took).toBeLessThan(50);
    });

    it('should index agent by API URN', () => {
      const agentManifest = {
        agent: {
          id: 'urn:proto:agent:api-caller@1.0.0',
          name: 'API Caller'
        },
        relationships: {
          apis: [
            'urn:proto:api:stripe.payments@3.0.0',
            'urn:proto:api:twilio.sms@2.0.0'
          ]
        }
      };

      catalog.indexAgentCapabilities(agentManifest);

      const result = catalog.findAgentsByAPI('urn:proto:api:stripe.payments@3.0.0');
      expect(result.count).toBe(1);
      expect(result.results).toContain('urn:proto:agent:api-caller@1.0.0');
      expect(result.took).toBeLessThan(50);
    });

    it('should handle agent with multiple capabilities', () => {
      const agentManifest = {
        agent: {
          id: 'urn:proto:agent:multi-capability@1.0.0',
          name: 'Multi Capability Agent'
        },
        capabilities: {
          tools: [
            { name: 'tool_a' },
            { name: 'tool_b' },
            { name: 'tool_c' }
          ],
          resources: [
            { uri: 'file:///data/a.json' },
            { uri: 'file:///data/b.json' }
          ]
        },
        relationships: {
          workflows: ['urn:proto:workflow:wf1@1.0.0'],
          apis: ['urn:proto:api:api1@1.0.0']
        }
      };

      catalog.indexAgentCapabilities(agentManifest);

      // Verify all capabilities are indexed
      expect(catalog.findAgentsByTool('tool_a').count).toBe(1);
      expect(catalog.findAgentsByTool('tool_b').count).toBe(1);
      expect(catalog.findAgentsByTool('tool_c').count).toBe(1);
      expect(catalog.findAgentsByResource('file:///data/a.json').count).toBe(1);
      expect(catalog.findAgentsByResource('file:///data/b.json').count).toBe(1);
      expect(catalog.findAgentsByWorkflow('urn:proto:workflow:wf1@1.0.0').count).toBe(1);
      expect(catalog.findAgentsByAPI('urn:proto:api:api1@1.0.0').count).toBe(1);
    });

    it('should skip indexing when agent id is missing', () => {
      const agentManifest = {
        capabilities: {
          tools: [{ name: 'test_tool' }]
        }
      };

      catalog.indexAgentCapabilities(agentManifest);

      const result = catalog.findAgentsByTool('test_tool');
      expect(result.count).toBe(0);
    });
  });

  describe('Agent Discovery Queries', () => {
    beforeEach(() => {
      // Index multiple agents
      const agent1 = {
        agent: { id: 'urn:proto:agent:agent1@1.0.0', name: 'Agent 1' },
        capabilities: {
          tools: [{ name: 'payment_tool' }]
        },
        relationships: {
          workflows: ['urn:proto:workflow:payment-wf@1.0.0'],
          apis: ['urn:proto:api:stripe@1.0.0']
        }
      };

      const agent2 = {
        agent: { id: 'urn:proto:agent:agent2@1.0.0', name: 'Agent 2' },
        capabilities: {
          tools: [{ name: 'payment_tool' }, { name: 'email_tool' }]
        },
        relationships: {
          apis: ['urn:proto:api:sendgrid@1.0.0']
        }
      };

      const agent3 = {
        agent: { id: 'urn:proto:agent:agent3@1.0.0', name: 'Agent 3' },
        capabilities: {
          resources: [{ uri: 'file:///data/users.json' }]
        },
        relationships: {
          workflows: ['urn:proto:workflow:payment-wf@1.0.0']
        }
      };

      catalog.indexAgentCapabilities(agent1);
      catalog.indexAgentCapabilities(agent2);
      catalog.indexAgentCapabilities(agent3);
    });

    it('should find multiple agents with same tool', () => {
      const result = catalog.findAgentsByTool('payment_tool');
      expect(result.count).toBe(2);
      expect(result.results).toContain('urn:proto:agent:agent1@1.0.0');
      expect(result.results).toContain('urn:proto:agent:agent2@1.0.0');
    });

    it('should find agents by unique tool', () => {
      const result = catalog.findAgentsByTool('email_tool');
      expect(result.count).toBe(1);
      expect(result.results).toContain('urn:proto:agent:agent2@1.0.0');
    });

    it('should find multiple agents for same workflow', () => {
      const result = catalog.findAgentsByWorkflow('urn:proto:workflow:payment-wf@1.0.0');
      expect(result.count).toBe(2);
      expect(result.results).toContain('urn:proto:agent:agent1@1.0.0');
      expect(result.results).toContain('urn:proto:agent:agent3@1.0.0');
    });

    it('should return empty result for non-existent tool', () => {
      const result = catalog.findAgentsByTool('non_existent_tool');
      expect(result.count).toBe(0);
      expect(result.results).toEqual([]);
    });

    it('should return empty result for non-existent workflow', () => {
      const result = catalog.findAgentsByWorkflow('urn:proto:workflow:non-existent@1.0.0');
      expect(result.count).toBe(0);
      expect(result.results).toEqual([]);
    });
  });

  describe('Graph Traversal: Agent → Workflow → API', () => {
    beforeEach(() => {
      // Add API artifact
      const apiArtifact = {
        urn: 'urn:protocol:api:stripe.payments:1.0.0',
        name: 'stripe.payments',
        version: '1.0.0',
        namespace: 'urn:protocol:api',
        type: 'api-protocol',
        manifest: 'https://example.com/stripe/manifest.json',
        dependencies: [],
        metadata: {
          tags: ['payment'],
          governance: {
            classification: 'public',
            owner: 'platform-team',
            pii: false
          }
        }
      };

      // Add workflow artifact that depends on API
      const workflowArtifact = {
        urn: 'urn:protocol:workflow:payment-processing:1.0.0',
        name: 'payment-processing',
        version: '1.0.0',
        namespace: 'urn:protocol:workflow',
        type: 'api-protocol',
        manifest: 'https://example.com/payment-wf/manifest.json',
        dependencies: ['urn:protocol:api:stripe.payments:1.0.0'],
        metadata: {
          tags: ['payment'],
          governance: {
            classification: 'internal',
            owner: 'payment-team',
            pii: true
          }
        }
      };

      catalog.add(apiArtifact);
      catalog.add(workflowArtifact);

      // Index agents with workflow relationships
      const agent1 = {
        agent: { id: 'urn:proto:agent:payment-agent@1.0.0', name: 'Payment Agent' },
        relationships: {
          workflows: ['urn:protocol:workflow:payment-processing:1.0.0']
        }
      };

      const agent2 = {
        agent: { id: 'urn:proto:agent:checkout-agent@1.0.0', name: 'Checkout Agent' },
        relationships: {
          workflows: ['urn:protocol:workflow:payment-processing:1.0.0']
        }
      };

      catalog.indexAgentCapabilities(agent1);
      catalog.indexAgentCapabilities(agent2);
    });

    it('should find agents via workflow that depends on API', () => {
      const result = catalog.findAgentsByAPIViaWorkflow('urn:protocol:api:stripe.payments:1.0.0');

      expect(result.count).toBe(2);
      expect(result.results).toContain('urn:proto:agent:payment-agent@1.0.0');
      expect(result.results).toContain('urn:proto:agent:checkout-agent@1.0.0');
      expect(result.took).toBeLessThan(100);
    });

    it('should return empty result for API with no workflow consumers', () => {
      const lonelyApiArtifact = {
        urn: 'urn:protocol:api:lonely.api:1.0.0',
        name: 'lonely.api',
        version: '1.0.0',
        namespace: 'urn:protocol:api',
        type: 'api-protocol',
        manifest: 'https://example.com/lonely/manifest.json',
        dependencies: [],
        metadata: {
          tags: [],
          governance: {
            classification: 'public',
            owner: 'platform-team',
            pii: false
          }
        }
      };

      catalog.add(lonelyApiArtifact);

      const result = catalog.findAgentsByAPIViaWorkflow('urn:protocol:api:lonely.api:1.0.0');
      expect(result.count).toBe(0);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should perform agent discovery in <50ms with 100 agents', () => {
      // Index 100 agents
      for (let i = 0; i < 100; i++) {
        const agent = {
          agent: {
            id: `urn:proto:agent:agent${i}@1.0.0`,
            name: `Agent ${i}`
          },
          capabilities: {
            tools: [
              { name: `tool_${i % 10}` },
              { name: 'common_tool' }
            ]
          }
        };
        catalog.indexAgentCapabilities(agent);
      }

      const result = catalog.findAgentsByTool('common_tool');

      expect(result.count).toBe(100);
      expect(result.took).toBeLessThan(50);
    });

    it('should perform workflow-based discovery in <100ms', () => {
      // Add workflow artifact
      const workflowArtifact = {
        urn: 'urn:protocol:workflow:test-workflow:1.0.0',
        name: 'test-workflow',
        version: '1.0.0',
        namespace: 'urn:protocol:workflow',
        type: 'api-protocol',
        manifest: 'https://example.com/wf/manifest.json',
        dependencies: ['urn:protocol:api:test.api:1.0.0'],
        metadata: {
          tags: [],
          governance: {
            classification: 'internal',
            owner: 'team',
            pii: false
          }
        }
      };

      const apiArtifact = {
        urn: 'urn:protocol:api:test.api:1.0.0',
        name: 'test.api',
        version: '1.0.0',
        namespace: 'urn:protocol:api',
        type: 'api-protocol',
        manifest: 'https://example.com/api/manifest.json',
        dependencies: [],
        metadata: {
          tags: [],
          governance: {
            classification: 'public',
            owner: 'team',
            pii: false
          }
        }
      };

      catalog.add(apiArtifact);
      catalog.add(workflowArtifact);

      // Index 50 agents with workflow relationship
      for (let i = 0; i < 50; i++) {
        const agent = {
          agent: {
            id: `urn:proto:agent:wf-agent${i}@1.0.0`,
            name: `WF Agent ${i}`
          },
          relationships: {
            workflows: ['urn:protocol:workflow:test-workflow:1.0.0']
          }
        };
        catalog.indexAgentCapabilities(agent);
      }

      const result = catalog.findAgentsByAPIViaWorkflow('urn:protocol:api:test.api:1.0.0');

      expect(result.count).toBe(50);
      expect(result.took).toBeLessThan(100);
    });
  });

  describe('Clear and Persistence', () => {
    it('should clear agent indexes when catalog is cleared', () => {
      const agentManifest = {
        agent: {
          id: 'urn:proto:agent:test@1.0.0',
          name: 'Test Agent'
        },
        capabilities: {
          tools: [{ name: 'test_tool' }]
        }
      };

      catalog.indexAgentCapabilities(agentManifest);
      expect(catalog.findAgentsByTool('test_tool').count).toBe(1);

      catalog.clear();
      expect(catalog.findAgentsByTool('test_tool').count).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle agent with empty capabilities', () => {
      const agentManifest = {
        agent: {
          id: 'urn:proto:agent:empty@1.0.0',
          name: 'Empty Agent'
        },
        capabilities: {}
      };

      catalog.indexAgentCapabilities(agentManifest);

      // Should not throw, just not be indexed
      expect(catalog.findAgentsByTool('any_tool').count).toBe(0);
    });

    it('should handle agent with missing capabilities section', () => {
      const agentManifest = {
        agent: {
          id: 'urn:proto:agent:minimal@1.0.0',
          name: 'Minimal Agent'
        }
      };

      catalog.indexAgentCapabilities(agentManifest);

      // Should not throw
      expect(catalog.findAgentsByTool('any_tool').count).toBe(0);
    });

    it('should handle tools without names', () => {
      const agentManifest = {
        agent: {
          id: 'urn:proto:agent:bad-tool@1.0.0',
          name: 'Bad Tool Agent'
        },
        capabilities: {
          tools: [
            { description: 'Tool without name' },
            { name: 'valid_tool' }
          ]
        }
      };

      catalog.indexAgentCapabilities(agentManifest);

      expect(catalog.findAgentsByTool('valid_tool').count).toBe(1);
    });

    it('should handle resources without URIs', () => {
      const agentManifest = {
        agent: {
          id: 'urn:proto:agent:bad-resource@1.0.0',
          name: 'Bad Resource Agent'
        },
        capabilities: {
          resources: [
            { mimeType: 'application/json' },
            { uri: 'file:///valid.json' }
          ]
        }
      };

      catalog.indexAgentCapabilities(agentManifest);

      expect(catalog.findAgentsByResource('file:///valid.json').count).toBe(1);
    });
  });
});
