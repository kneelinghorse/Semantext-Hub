# Agent Protocol Examples

Comprehensive examples demonstrating agent protocol usage across all 18 protocol types.

## Table of Contents

1. [Basic Agent Definition](#basic-agent-definition)
2. [Agent Communication Protocols](#agent-communication-protocols)
3. [Agent → Workflow Integration](#agent--workflow-integration)
4. [Agent → API Integration](#agent--api-integration)
5. [Agent → Data Integration](#agent--data-integration)
6. [Agent → Event Integration](#agent--event-integration)
7. [Multi-Protocol Agent Chains](#multi-protocol-agent-chains)
8. [Catalog Discovery](#catalog-discovery)
9. [Security & IAM](#security--iam)
10. [Advanced Patterns](#advanced-patterns)

## Basic Agent Definition

### Minimal Agent

```javascript
import { createAgentProtocol } from '../packages/protocols/src/agent_protocol_v_1_1_1.js';

const minimalAgent = createAgentProtocol({
  agent: {
    id: 'hello-agent',
    name: 'Hello World Agent',
    version: '1.0.0'
  },
  capabilities: {
    tools: [
      { name: 'greet', description: 'Say hello' }
    ]
  }
});

const validation = minimalAgent.validate();
console.log('Valid:', validation.ok);
```

### Full-Featured Agent

```javascript
const fullAgent = createAgentProtocol({
  agent: {
    id: 'customer-support-agent',
    name: 'Customer Support Agent',
    version: '2.1.0',
    description: 'Handles customer inquiries and support tickets'
  },
  capabilities: {
    tools: [
      {
        name: 'lookup_order',
        description: 'Retrieve order details by order ID',
        parameters: {
          orderId: { type: 'string', required: true }
        }
      },
      {
        name: 'create_ticket',
        description: 'Create support ticket',
        parameters: {
          title: { type: 'string', required: true },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] }
        }
      }
    ],
    tags: ['customer-service', 'support', 'production'],
    knowledge_domains: ['e-commerce', 'customer-data', 'refund-policies']
  },
  communication: {
    supported: ['mcp', 'a2a', 'webhook'],
    endpoints: {
      mcp: 'mcp://agents/customer-support',
      a2a: 'https://api.example.com/agents/customer-support',
      webhook: 'https://webhooks.example.com/agents/customer-support'
    },
    transport: {
      primary: 'https',
      fallback: 'grpc'
    }
  },
  security: {
    required_permissions: ['read:orders', 'write:tickets', 'read:customers'],
    authentication: 'required'
  },
  relationships: {
    workflows: ['urn:proto:workflow:support-escalation@1.0.0'],
    apis: ['urn:proto:api:orders-service@3.0.0'],
    iam: ['urn:proto:iam:customer-service-role@1.0.0']
  }
});
```

## Agent Communication Protocols

### Model Context Protocol (MCP)

```javascript
const mcpAgent = createAgentProtocol({
  agent: {
    id: 'mcp-assistant',
    name: 'MCP Assistant Agent',
    version: '1.0.0'
  },
  communication: {
    supported: ['mcp'],
    endpoints: {
      mcp: 'mcp://agents/assistant'
    },
    protocols: {
      mcp: {
        version: '2024-11-05',
        capabilities: ['tools', 'resources', 'prompts']
      }
    }
  },
  capabilities: {
    tools: [
      { name: 'analyze_code', description: 'Analyze source code' },
      { name: 'suggest_improvements', description: 'Suggest code improvements' }
    ]
  }
});
```

### Agent-to-Agent (A2A)

```javascript
const a2aAgent = createAgentProtocol({
  agent: {
    id: 'orchestrator',
    name: 'Agent Orchestrator',
    version: '1.0.0'
  },
  communication: {
    supported: ['a2a'],
    endpoints: {
      a2a: 'https://api.example.com/agents/orchestrator'
    },
    protocols: {
      a2a: {
        message_format: 'json-rpc',
        authentication: 'bearer-token'
      }
    }
  },
  relationships: {
    agents: [
      'urn:proto:agent:data-processor@1.0.0',
      'urn:proto:agent:notification-sender@1.0.0'
    ]
  }
});
```

### Multi-Protocol Agent

```javascript
const multiProtocolAgent = createAgentProtocol({
  agent: {
    id: 'universal-agent',
    name: 'Universal Communication Agent',
    version: '1.0.0'
  },
  communication: {
    supported: ['mcp', 'a2a', 'webhook'],
    endpoints: {
      mcp: 'mcp://agents/universal',
      a2a: 'https://api.example.com/agents/universal',
      webhook: 'https://webhooks.example.com/agents/universal'
    },
    transport: {
      primary: 'https',
      fallback: 'grpc'
    }
  }
});
```

## Agent → Workflow Integration

### Agent Executes Workflow

```javascript
const workflowAgent = createAgentProtocol({
  agent: {
    id: 'order-processor',
    name: 'Order Processing Agent',
    version: '1.0.0'
  },
  capabilities: {
    tools: [
      { name: 'process_order', description: 'Process customer order' },
      { name: 'handle_exception', description: 'Handle order exceptions' }
    ]
  },
  relationships: {
    workflows: [
      'urn:proto:workflow:order-fulfillment@2.1.0',
      'urn:proto:workflow:refund-process@1.5.0'
    ]
  }
});
```

### Workflow Calls Agent

```javascript
// In workflow manifest:
const workflow = {
  workflow: {
    id: 'data-analysis-flow',
    version: '1.0.0'
  },
  steps: [
    {
      id: 'analyze',
      type: 'agent',
      agent: 'urn:proto:agent:data-analyst@1.0.0#tool.analyze_dataset',
      input: {
        dataset: '$.context.dataset_id'
      }
    },
    {
      id: 'generate-report',
      type: 'agent',
      agent: 'urn:proto:agent:report-generator@1.0.0#tool.create_report'
    }
  ]
};
```

## Agent → API Integration

### Agent Calls API

```javascript
const apiAgent = createAgentProtocol({
  agent: {
    id: 'api-client-agent',
    name: 'API Client Agent',
    version: '1.0.0'
  },
  capabilities: {
    tools: [
      {
        name: 'fetch_user_data',
        description: 'Fetch user data from Users API',
        api_endpoint: 'urn:proto:api:users-service@2.0.0#endpoint.getUser'
      },
      {
        name: 'create_order',
        description: 'Create order via Orders API',
        api_endpoint: 'urn:proto:api:orders-service@3.0.0#endpoint.createOrder'
      }
    ]
  },
  relationships: {
    apis: [
      'urn:proto:api:users-service@2.0.0',
      'urn:proto:api:orders-service@3.0.0'
    ]
  }
});
```

### API Delegates to Agent

```javascript
// In API manifest:
const api = {
  metadata: {
    kind: 'api',
    id: 'smart-api',
    version: '1.0.0'
  },
  catalog: {
    endpoints: [
      {
        method: 'POST',
        path: '/analyze',
        handler: {
          type: 'agent',
          agent_urn: 'urn:proto:agent:ml-analyzer@2.0.0#tool.analyze'
        }
      }
    ]
  }
};
```

## Agent → Data Integration

### Data Analysis Agent

```javascript
const dataAgent = createAgentProtocol({
  agent: {
    id: 'data-analyst',
    name: 'Data Analysis Agent',
    version: '1.0.0'
  },
  capabilities: {
    tools: [
      { name: 'query_database', description: 'Execute SQL queries' },
      { name: 'aggregate_metrics', description: 'Calculate aggregations' },
      { name: 'generate_insights', description: 'Generate data insights' }
    ],
    knowledge_domains: ['sql', 'analytics', 'business-intelligence']
  },
  relationships: {
    data: [
      'urn:proto:data:analytics-warehouse@2.0.0',
      'urn:proto:data:customer-db@1.5.0'
    ]
  },
  security: {
    required_permissions: ['read:analytics_data', 'execute:queries']
  }
});
```

### PII-Aware Agent

```javascript
const piiAgent = createAgentProtocol({
  agent: {
    id: 'customer-data-agent',
    name: 'Customer Data Agent',
    version: '1.0.0'
  },
  capabilities: {
    tools: [
      { name: 'redact_pii', description: 'Redact PII from text' },
      { name: 'anonymize_data', description: 'Anonymize customer data' }
    ]
  },
  relationships: {
    data: ['urn:proto:data:customers@1.0.0']
  },
  security: {
    required_permissions: ['read:pii', 'write:anonymized_data'],
    pii_handling: {
      redaction_enabled: true,
      fields: ['email', 'ssn', 'phone']
    }
  }
});
```

## Agent → Event Integration

### Event-Driven Agent

```javascript
const eventAgent = createAgentProtocol({
  agent: {
    id: 'order-event-handler',
    name: 'Order Event Handler Agent',
    version: '1.0.0'
  },
  capabilities: {
    tools: [
      { name: 'handle_order_created', description: 'Process new order events' },
      { name: 'handle_order_cancelled', description: 'Process cancellation events' }
    ]
  },
  communication: {
    supported: ['webhook', 'a2a'],
    endpoints: {
      webhook: 'https://webhooks.example.com/agents/order-handler'
    }
  },
  relationships: {
    events: [
      'urn:proto:event:order-created@1.0.0',
      'urn:proto:event:order-cancelled@1.0.0'
    ]
  }
});
```

### Event Publisher Agent

```javascript
const publisherAgent = createAgentProtocol({
  agent: {
    id: 'notification-agent',
    name: 'Notification Publisher Agent',
    version: '1.0.0'
  },
  capabilities: {
    tools: [
      {
        name: 'publish_notification',
        description: 'Publish notification event',
        event: 'urn:proto:event:notification-sent@1.0.0'
      }
    ]
  },
  relationships: {
    events: ['urn:proto:event:notification-sent@1.0.0']
  }
});
```

## Multi-Protocol Agent Chains

### Complete Resolution Chain

```javascript
// Agent → Workflow → API → IAM
const chainAgent = createAgentProtocol({
  agent: {
    id: 'order-fulfillment-agent',
    name: 'Order Fulfillment Agent',
    version: '1.0.0'
  },
  capabilities: {
    tools: [
      { name: 'fulfill_order', description: 'Execute order fulfillment' }
    ]
  },
  relationships: {
    // Agent calls workflow
    workflows: ['urn:proto:workflow:order-fulfillment@1.0.0'],
    // Workflow calls API
    apis: ['urn:proto:api:inventory-service@2.0.0'],
    // API requires IAM role
    iam: ['urn:proto:iam:order-processor-role@1.0.0']
  },
  security: {
    required_permissions: ['execute:fulfillment', 'read:inventory']
  }
});
```

### Multi-Domain Agent

```javascript
const multiDomainAgent = createAgentProtocol({
  agent: {
    id: 'platform-orchestrator',
    name: 'Platform Orchestrator Agent',
    version: '2.0.0'
  },
  capabilities: {
    tools: [
      { name: 'orchestrate_deployment', description: 'Manage deployments' },
      { name: 'monitor_health', description: 'Monitor system health' }
    ],
    tags: ['orchestration', 'infrastructure', 'production']
  },
  relationships: {
    // Infrastructure
    infrastructure: ['urn:proto:infrastructure:k8s-cluster@1.0.0'],
    // Deployments
    deployments: ['urn:proto:deployment:production-pipeline@2.0.0'],
    // Observability
    observability: ['urn:proto:observability:platform-metrics@1.0.0'],
    // Configuration
    configs: ['urn:proto:config:platform-settings@1.0.0']
  }
});
```

## Catalog Discovery

### Indexing Agents

```javascript
import { URNCatalogIndex } from '../packages/protocols/src/catalog/index.js';

const catalog = new URNCatalogIndex();

// Add agent to catalog
catalog.add({
  urn: 'urn:proto:agent:ml-trainer@1.0.0',
  name: 'ml-trainer',
  version: '1.0.0',
  type: 'agent',
  dependencies: [
    'urn:proto:aiml:model-training@2.0.0',
    'urn:proto:data:training-dataset@1.0.0'
  ],
  metadata: {
    tags: ['machine-learning', 'training', 'production'],
    governance: {
      owner: 'ml-team',
      classification: 'internal'
    }
  },
  manifest: {
    agent: {
      id: 'ml-trainer',
      name: 'ML Model Trainer',
      version: '1.0.0'
    },
    capabilities: {
      tools: [
        { name: 'train_model', description: 'Train ML model' },
        { name: 'evaluate_model', description: 'Evaluate model performance' }
      ]
    }
  }
});
```

### Querying Agents

```javascript
// Get agent by URN
const agent = catalog.get('urn:proto:agent:ml-trainer@1.0.0');
console.log('Agent:', agent.manifest.agent.name);

// Query by tag
const mlAgents = catalog.queryByTag('machine-learning');
console.log('ML Agents:', mlAgents.length);

// Query by owner
const teamAgents = catalog.queryByOwner('ml-team');

// Check dependencies
const deps = catalog.getDependencyTree('urn:proto:agent:ml-trainer@1.0.0');
console.log('Dependencies:', deps);
```

## Security & IAM

### IAM-Integrated Agent

```javascript
const secureAgent = createAgentProtocol({
  agent: {
    id: 'financial-agent',
    name: 'Financial Operations Agent',
    version: '1.0.0'
  },
  capabilities: {
    tools: [
      { name: 'process_payment', description: 'Process financial payment' },
      { name: 'generate_invoice', description: 'Generate customer invoice' }
    ]
  },
  security: {
    authentication: 'required',
    required_permissions: [
      'read:financial_data',
      'write:transactions',
      'execute:payments'
    ],
    audit_logging: true,
    encryption: {
      in_transit: true,
      at_rest: true
    }
  },
  relationships: {
    iam: ['urn:proto:iam:financial-ops-role@2.0.0'],
    apis: ['urn:proto:api:payment-gateway@3.0.0']
  }
});
```

### Delegated Authority

```javascript
const delegatedAgent = createAgentProtocol({
  agent: {
    id: 'admin-agent',
    name: 'Admin Operations Agent',
    version: '1.0.0'
  },
  security: {
    delegation: {
      enabled: true,
      max_depth: 2,
      allowed_delegates: [
        'urn:proto:agent:support-agent@1.0.0',
        'urn:proto:agent:audit-agent@1.0.0'
      ]
    },
    required_permissions: ['admin:*']
  },
  relationships: {
    iam: ['urn:proto:iam:admin-role@1.0.0'],
    agents: [
      'urn:proto:agent:support-agent@1.0.0',
      'urn:proto:agent:audit-agent@1.0.0'
    ]
  }
});
```

## Advanced Patterns

### Agent with State Management

```javascript
const statefulAgent = createAgentProtocol({
  agent: {
    id: 'conversation-agent',
    name: 'Conversation Agent',
    version: '1.0.0'
  },
  capabilities: {
    tools: [
      { name: 'respond', description: 'Generate response' },
      { name: 'remember_context', description: 'Store conversation context' }
    ],
    state_management: {
      enabled: true,
      storage: 'urn:proto:data:conversation-state@1.0.0',
      ttl: 3600 // 1 hour
    }
  },
  relationships: {
    data: ['urn:proto:data:conversation-state@1.0.0']
  }
});
```

### Agent with Testing Integration

```javascript
const testableAgent = createAgentProtocol({
  agent: {
    id: 'api-validator',
    name: 'API Validation Agent',
    version: '1.0.0'
  },
  capabilities: {
    tools: [
      { name: 'validate_api', description: 'Validate API responses' },
      { name: 'generate_test_cases', description: 'Generate test cases' }
    ]
  },
  relationships: {
    testing: ['urn:proto:testing:api-test-suite@1.0.0'],
    apis: ['urn:proto:api:target-service@2.0.0']
  }
});
```

### Agent with Documentation

```javascript
const documentedAgent = createAgentProtocol({
  agent: {
    id: 'code-documenter',
    name: 'Code Documentation Agent',
    version: '1.0.0',
    description: 'Automatically generates and maintains code documentation'
  },
  capabilities: {
    tools: [
      { name: 'analyze_code', description: 'Analyze source code structure' },
      { name: 'generate_docs', description: 'Generate documentation' },
      { name: 'update_docs', description: 'Update existing documentation' }
    ],
    knowledge_domains: ['code-analysis', 'documentation', 'technical-writing']
  },
  relationships: {
    documentation: ['urn:proto:doc:api-reference@1.0.0']
  }
});
```

## Best Practices

### 1. Versioning

Always use semantic versioning for agents:

```javascript
agent: {
  id: 'my-agent',
  version: '1.2.3' // MAJOR.MINOR.PATCH
}
```

### 2. URN References

Use URNs for all cross-protocol references:

```javascript
relationships: {
  workflows: ['urn:proto:workflow:process@1.0.0'],
  apis: ['urn:proto:api:service@2.0.0#endpoint.create']
}
```

### 3. Validation

Always validate before deployment:

```javascript
const validation = agent.validate();
if (!validation.ok) {
  console.error('Validation failed:', validation.issues);
  process.exit(1);
}
```

### 4. Governance

Include governance metadata:

```javascript
metadata: {
  tags: ['production', 'customer-facing'],
  governance: {
    owner: 'platform-team',
    classification: 'confidential',
    pii: true,
    compliance: ['gdpr', 'ccpa']
  }
}
```

### 5. Security

Specify security requirements:

```javascript
security: {
  authentication: 'required',
  required_permissions: ['read:data', 'write:results'],
  audit_logging: true
}
```

## See Also

- [Agent Discovery](./AGENT_DISCOVERY.md) - Catalog and search patterns
- [Agent URN Cross-Reference](./agent-urn-cross-reference.md) - URN usage guide
- [Agent Integration Patterns](./agent-to-agent-integration-patterns.md) - A2A patterns
- [IAM Delegation](./iam-delegation-security-model.md) - Security patterns
- [Workflow Agent Nodes](./workflow-agent-node-generator.md) - Workflow integration
