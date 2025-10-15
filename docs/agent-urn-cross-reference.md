# Agent Protocol URN Cross-Reference Patterns

**Mission A1.2 Deliverable** — Integration verification documentation

## Overview

The Agent Protocol v1.1.1 supports comprehensive cross-protocol URN references, enabling agents to declare relationships with workflows, APIs, IAM roles, data sources, events, AI models, and all other protocol types in the suite.

**Test Coverage**: 69 integration tests passing
**Protocols Supported**: 18 protocol types (including `agent`)
**Integration Status**: ✅ Verified working

---

## URN Reference Categories

### 1. Agent → Workflow References

Agents can reference workflows they execute, orchestrate, or participate in.

```javascript
{
  agent: {
    id: 'task-executor',
    name: 'Task Execution Agent',
    version: '1.0.0'
  },
  relationships: {
    workflows: [
      'urn:proto:workflow:order-fulfillment@1.0.0',
      'urn:proto:workflow:payment-processing@2.1.0',
      'urn:proto:workflow:shipping-logistics@1.5.3#node.notify'
    ]
  }
}
```

**Use Cases**:
- Agents that execute workflow nodes
- Workflow orchestration agents
- Multi-step task coordinators

**Fragment Support**: `#node.{nodeId}` for specific workflow nodes

---

### 2. Agent → API References

Agents can reference APIs they call or expose.

```javascript
{
  agent: {
    id: 'api-caller',
    name: 'API Caller Agent',
    version: '1.0.0'
  },
  relationships: {
    apis: [
      'urn:proto:api:billing@1.2.0',
      'urn:proto:api:billing@1.2.0#/v1/invoices',
      'urn:proto:api:users@2.0.0#/v1/users/{id}'
    ]
  }
}
```

**Use Cases**:
- API gateway agents
- Service integration agents
- REST/GraphQL client agents

**Fragment Support**: `#/path/to/endpoint` for specific API endpoints

---

### 3. Agent → IAM Role References

Agents can declare required IAM roles for authorization and delegation.

```javascript
{
  agent: {
    id: 'privileged-agent',
    name: 'Privileged Data Agent',
    version: '1.0.0'
  },
  authorization: {
    delegation_supported: true,
    signature_algorithm: 'ES256'
  },
  relationships: {
    roles: [
      'urn:proto:iam:data-processor@1.0.0',
      'urn:proto:iam:admin@1.0.0',
      'urn:proto:iam:auditor@2.0.0'
    ]
  }
}
```

**Use Cases**:
- Privilege escalation scenarios
- Delegated authority patterns
- Role-based access control

**Note**: URN format is `urn:proto:iam:{role-name}@{version}` (not `urn:proto:iam:role:{name}`)

---

### 4. Agent → Data Source References

Agents can reference data sources they read from or write to.

```javascript
{
  agent: {
    id: 'data-aggregator',
    name: 'Data Aggregation Agent',
    version: '2.0.0'
  },
  relationships: {
    targets: [
      'urn:proto:data:orders@1.0.0',
      'urn:proto:data:customers@1.0.0',
      'urn:proto:data:inventory@2.1.0',
      'urn:proto:data:events@1.0.0#stream.orders'
    ]
  }
}
```

**Use Cases**:
- ETL agents
- Data pipeline agents
- Analytics aggregators

**Fragment Support**: `#stream.{streamName}` or `#table.{tableName}` for specific data resources

---

### 5. Agent → Event References

Agents can subscribe to or publish events.

```javascript
{
  agent: {
    id: 'event-subscriber',
    name: 'Multi-Event Subscriber Agent',
    version: '1.5.0'
  },
  relationships: {
    targets: [
      'urn:proto:event:order.created@1.0.0',
      'urn:proto:event:order.updated@1.0.0',
      'urn:proto:event:order.cancelled@2.0.0',
      'urn:proto:event:payment.completed@1.0.0#async'
    ]
  }
}
```

**Use Cases**:
- Event-driven agents
- Pub/sub subscribers
- Real-time notification handlers

**Fragment Support**: `#async` or `#sync` for processing modes

---

### 6. Agent → AI Model References

Agents can reference AI models they use for inference or training.

```javascript
{
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
}
```

**Use Cases**:
- LLM-powered agents
- Multi-model ensemble agents
- Context-aware AI systems

---

### 7. Multi-Protocol Integration

Agents can reference multiple protocol types simultaneously.

```javascript
{
  agent: {
    id: 'comprehensive-agent',
    name: 'Comprehensive Integration Agent',
    version: '1.0.0'
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
  }
}
```

---

## Capability URNs

In addition to relationship URNs, agents can annotate their capabilities with URNs:

```javascript
{
  capabilities: {
    tools: [
      {
        name: 'process_order',
        description: 'Process customer orders',
        urn: 'urn:proto:agent:order-processor@1.0.0#tool.process_order'
      }
    ],
    resources: [
      {
        uri: 'https://api.example.com/docs',
        name: 'API Documentation',
        urn: 'urn:proto:docs:api-reference@1.0.0'
      }
    ],
    prompts: [
      {
        name: 'generate_summary',
        description: 'Generate order summary',
        urn: 'urn:proto:agent:order-processor@1.0.0#prompt.summary'
      }
    ]
  }
}
```

---

## Query Patterns

The agent protocol supports querying across relationships:

```javascript
const protocol = createAgentProtocol(manifest);

// Query by relationship type
protocol.query('relationships.workflows:contains:order-fulfillment') // true

// Query by API reference
protocol.query('relationships.apis:contains:billing') // true

// Query by IAM role
protocol.query('relationships.roles:contains:data-processor') // true

// Query agent metadata
protocol.query('agent.id:=:comprehensive-agent') // true
protocol.query('agent.version:=:1.0.0') // true
```

---

## Validation Rules

### URN Format
All URNs must follow the pattern:
```
urn:proto:{type}:{name}@{version}[#{fragment}]
```

**Supported Types**: `api`, `data`, `event`, `ui`, `workflow`, `infra`, `device`, `ai`, `iam`, `metric`, `integration`, `testing`, `docs`, `obs`, `config`, `release`, `agent`

### Name Conventions
Names support:
- Hyphens: `order-processor`
- Underscores: `data_aggregator`
- Dots: `event.handler`
- Mixed case: `OrderProcessor`
- Numbers: `agent123`
- Complex: `complex-name_v2.3`

### Version Format
Versions must be numeric with dots: `1.0.0`, `2.1.3`, `10.20.30`

### Fragment Format
Fragments support:
- Simple: `#action`
- Dotted paths: `#capability.transform.json`
- Hyphens/underscores: `#action-execute`, `#action_execute`
- Slashes: `#/v1/execute`

**Invalid**: fragments with spaces (`#bad fragment`)

---

## Integration with Suite Wiring v1.1

The `suite_wiring_v_1_1.js` patches enable cross-protocol agent integration:

### 1. Workflow Agent Nodes
```javascript
// Workflow node referencing an agent
{
  type: 'agent',
  agent: {
    urn: 'urn:proto:agent:writer@1.1.1',
    skill: 'write_article',
    delegation: {
      urn: 'urn:proto:iam:writer-role@1.0.0'
    }
  }
}
```

### 2. AI/ML Context Capabilities
```javascript
// AI model with agent context capabilities
{
  contextCapabilities: {
    tools: [{name: 'search_code', urn: 'urn:proto:agent:code-search@1.0.0#tool.search'}],
    resources: [{uri: 'file://repo', urn: 'urn:proto:data:codebase@1.0.0'}]
  }
}
```

### 3. IAM Delegation Manifests
```javascript
// Delegation from user to agent
{
  principal: { type: 'user', urn: 'urn:proto:iam:user@1.1.1#123' },
  delegate: { type: 'agent', urn: 'urn:proto:agent:payment@1.1.1' },
  authorization: { scope: 'payment.execute' }
}
```

---

## Test Coverage Summary

| Test Category | Tests | Status |
|--------------|-------|--------|
| Agent URN Pattern Validation | 39 tests | ✅ Pass |
| Agent → Workflow Integration | 4 tests | ✅ Pass |
| Agent → API Integration | 3 tests | ✅ Pass |
| Agent → IAM Integration | 3 tests | ✅ Pass |
| Agent → Data Source Integration | 3 tests | ✅ Pass |
| Agent → Event Integration | 2 tests | ✅ Pass |
| Agent → AI Model Integration | 2 tests | ✅ Pass |
| Multi-Protocol Integration | 2 tests | ✅ Pass |
| URN Validation (18 types) | 3 tests | ✅ Pass |
| Cross-Protocol Queries | 4 tests | ✅ Pass |
| Diff Detection | 2 tests | ✅ Pass |
| Agent Card Generation | 1 test | ✅ Pass |
| **Total** | **69 tests** | **✅ Pass** |

---

## Example: Complete Agent Manifest

```javascript
{
  agent: {
    id: 'order-processing-agent',
    name: 'Order Processing Agent',
    version: '1.0.0',
    discovery_uri: 'https://api.example.com/.well-known/agent-card',
    lifecycle: { status: 'enabled' }
  },

  capabilities: {
    tools: [
      {
        name: 'process_order',
        description: 'Process customer order',
        inputSchema: { type: 'object', properties: { orderId: { type: 'string' } } },
        outputSchema: { type: 'object', properties: { status: { type: 'string' } } },
        urn: 'urn:proto:agent:order-processing-agent@1.0.0#tool.process_order'
      }
    ],
    resources: [
      {
        uri: 'postgres://db.example.com/orders',
        name: 'Orders Database',
        mimeType: 'application/sql',
        urn: 'urn:proto:data:orders@1.0.0'
      }
    ],
    prompts: [
      {
        name: 'generate_confirmation',
        description: 'Generate order confirmation email',
        arguments: [{ name: 'orderId', required: true }],
        urn: 'urn:proto:agent:order-processing-agent@1.0.0#prompt.confirmation'
      }
    ],
    modalities: {
      input: ['text', 'json'],
      output: ['text', 'json']
    }
  },

  communication: {
    supported: ['a2a', 'mcp'],
    endpoints: {
      a2a: 'https://api.example.com/agents/order-processing',
      mcp: 'stdio://order-processing-agent'
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
    apis: [
      'urn:proto:api:billing@1.2.0#/v1/invoices',
      'urn:proto:api:shipping@1.0.0#/v1/shipments'
    ],
    workflows: [
      'urn:proto:workflow:order-fulfillment@1.0.0',
      'urn:proto:workflow:payment-processing@2.1.0'
    ],
    roles: [
      'urn:proto:iam:order-processor@1.0.0',
      'urn:proto:iam:payment-handler@1.0.0'
    ],
    targets: [
      'urn:proto:data:orders@1.0.0',
      'urn:proto:data:customers@1.0.0',
      'urn:proto:event:order.created@1.0.0',
      'urn:proto:event:payment.completed@1.0.0',
      'urn:proto:obs:order-metrics@1.0.0',
      'urn:proto:config:order-settings@1.0.0'
    ]
  },

  metadata: {
    owner: 'order-team',
    tags: ['production', 'critical', 'order-processing']
  }
}
```

---

## Next Steps

### Upcoming Missions
- **A2.1**: Workflow Agent Node Generators
- **A2.2**: AI/ML Context Capability Generators
- **A2.3**: IAM Delegation Manifest Generators

### Integration Points
- Agent discovery protocol integration
- MCP/A2A transport layer mapping
- Cross-protocol orchestration patterns

---

**Status**: ✅ Agent protocol integration verified
**Test Coverage**: 69 tests passing
**Mission**: A1.2 Complete
**Date**: 2025-10-03
