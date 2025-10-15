# Agent Discovery - Catalog System

The URNCatalogIndex now supports **agent discovery** via semantic capability queries.

## Features

### Agent Capability Indexing
Index agents by their capabilities and relationships:

```javascript
import { URNCatalogIndex } from './src/catalog/index.js';

const catalog = new URNCatalogIndex();

// Index an agent with capabilities
const agentManifest = {
  agent: {
    id: 'urn:proto:agent:payment-processor@1.0.0',
    name: 'Payment Processor'
  },
  capabilities: {
    tools: [
      { name: 'process_payment', description: 'Process payment transactions' },
      { name: 'refund_payment', description: 'Refund a payment' }
    ],
    resources: [
      { uri: 'file:///data/customers.json', mimeType: 'application/json' }
    ]
  },
  relationships: {
    workflows: ['urn:proto:workflow:payment-flow@1.0.0'],
    apis: ['urn:proto:api:stripe.payments@3.0.0']
  }
};

catalog.indexAgentCapabilities(agentManifest);
```

## Discovery Queries

### Find Agents by Tool Name
```javascript
const result = catalog.findAgentsByTool('process_payment');
// {
//   results: ['urn:proto:agent:payment-processor@1.0.0'],
//   count: 1,
//   took: 0.12 // ms
// }
```

### Find Agents by Resource URI
```javascript
const result = catalog.findAgentsByResource('file:///data/customers.json');
// Returns agents that can access this resource
```

### Find Agents by Workflow
```javascript
const result = catalog.findAgentsByWorkflow('urn:proto:workflow:payment-flow@1.0.0');
// Returns agents that participate in this workflow
```

### Find Agents by API
```javascript
const result = catalog.findAgentsByAPI('urn:proto:api:stripe.payments@3.0.0');
// Returns agents that directly use this API
```

### Find Agents via Workflow → API Traversal
```javascript
// Find agents that use workflows which depend on a specific API
const result = catalog.findAgentsByAPIViaWorkflow('urn:proto:api:stripe.payments@3.0.0');
// Performs graph traversal: agent → workflow → api
```

### Semantic Queries (free-form)
Use `CatalogQuery` to route simple natural language to discovery functions.

```javascript
import { CatalogQuery } from '../packages/protocols/src/catalog/query.js';

const cq = new CatalogQuery(catalog);

// Examples:
cq.findAgentsCapableOf('agents with tool process_payment');
cq.findAgentsCapableOf('agents for workflow urn:proto:workflow:payment-flow@1.0.0');
cq.findAgentsCapableOf('agents for api urn:proto:api:stripe.payments@3.0.0');
cq.findAgentsCapableOf('find agents by resource file:///data/customers.json');
```

## Performance

All queries meet strict performance requirements:

- **Agent discovery queries**: <50ms (actual: <1ms for 100 agents)
- **Graph traversal queries**: <100ms (actual: <5ms for typical graphs)
- **Complexity**: O(1) + O(m) for index lookups

## Supported Query Patterns

1. **Capability-based**: "Find agents with tool X"
2. **Resource-based**: "Find agents that can read resource Y"
3. **Workflow-based**: "Find agents for workflow Z"
4. **API-based**: "Find agents that use API A"
5. **Graph traversal**: "Find agents connected to API via workflows"

## Test Coverage

- 20 comprehensive tests covering:
  - Single and multiple agent indexing
  - All query types
  - Graph traversal
  - Performance benchmarks
  - Edge cases (empty capabilities, missing fields)
  - Clear and persistence

## Architecture

### Indexes

```javascript
// Internal indexes (Map<key, Set<agentUrn>>)
agentToolIndex: Map<toolName, Set<agentUrn>>
agentResourceIndex: Map<resourceUri, Set<agentUrn>>
agentWorkflowIndex: Map<workflowUrn, Set<agentUrn>>
agentApiIndex: Map<apiUrn, Set<agentUrn>>
```

### Query Flow

1. Agent manifest → `indexAgentCapabilities()`
2. Capabilities extracted and indexed
3. O(1) lookup via index
4. Optional graph traversal for complex queries

## Integration with Existing Catalog

Agent discovery seamlessly integrates with existing catalog features:

- Uses same dependency graph for workflow traversal
- Maintains same performance characteristics
- Follows same API patterns (QueryResult with timing)
- Clears with catalog via `catalog.clear()`

## Example: Complete Discovery Workflow

```javascript
// 1. Add workflow and API artifacts to catalog
catalog.add(apiArtifact);
catalog.add(workflowArtifact); // depends on apiArtifact

// 2. Index agents
catalog.indexAgentCapabilities(agent1); // uses workflow
catalog.indexAgentCapabilities(agent2); // uses workflow

// 3. Discover agents by API via graph traversal
const agents = catalog.findAgentsByAPIViaWorkflow(apiArtifact.urn);
// Returns both agent1 and agent2
```

## Next Steps

- **A3.2**: Legacy cleanup & verification
- Integration with MCP server for agent discovery endpoints
- Semantic query expansion (fuzzy matching, synonyms)
