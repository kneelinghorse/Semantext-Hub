# OSS Protocols - Universal Protocol Suite

A comprehensive, production-ready protocol suite for modern software systems. Covers APIs, data, events, workflows, agents, and 13+ other protocol types.

## 🚀 Overview

OSS Protocols provides a unified framework for defining, validating, and managing protocol manifests across your entire stack. Each protocol includes:

- **Schema validation** with detailed error reporting
- **Code generation** for clients, tests, and documentation
- **Cross-protocol relationships** via URN references
- **Governance & compliance** tracking
- **Catalog & discovery** with dependency graphs

## 📦 Supported Protocols (18 Total)

### Core Protocols
- **API Protocol** (`api_protocol_v_1_1_1.js`) - REST/GraphQL API definitions
- **Data Protocol** (`data_protocol_v_1_1_1.js`) - Database schemas and migrations
- **Event Protocol** (`event_protocol_v_1_1_1.js`) - Event-driven messaging (Kafka, AMQP, MQTT)
- **Workflow Protocol** (`workflow_protocol_v_1_1_1.js`) - Business process orchestration
- **Agent Protocol** (`agent_protocol_v_1_1_1.js`) - AI agent capabilities and integrations
- **UI Component Protocol** (`ui_component_protocol_v_1_1_1.js`) - Frontend component libraries

### Extended Protocols
- **Infrastructure Protocol** - Cloud resources and IaC
- **Observability Protocol** - Metrics, logs, traces
- **Identity & Access Protocol** - Auth, permissions, IAM
- **Release/Deployment Protocol** - CI/CD pipelines
- **Configuration Protocol** - App settings and feature flags
- **Documentation Protocol** - Technical docs and guides
- **Analytics & Metrics Protocol** - Business intelligence
- **Testing/Quality Protocol** - Test suites and quality gates
- **Integration Protocol** - Third-party integrations
- **AI/ML Protocol** - ML models and training pipelines
- **Hardware Device Protocol** - IoT and embedded systems
- **Semantic Protocol** (`Semantic Protocol — v3.2.0.js`) - Ontologies and knowledge graphs

## ⚡ Agent Protocol Integration

### What is the Agent Protocol?

The Agent Protocol enables AI agents (like Claude, GPT, custom LLMs) to integrate with your systems through standardized manifests. Agents can:

- **Declare capabilities** (tools, actions, knowledge domains)
- **Reference workflows** to execute multi-step processes
- **Call APIs** with proper authentication
- **Subscribe to events** for reactive behaviors
- **Access data sources** with governance controls
- **Communicate** via MCP, Agent-to-Agent (A2A), or webhooks

### Quick Example

```javascript
import { createAgentProtocol } from './src/agent_protocol_v_1_1_1.js';

const manifest = {
  agent: {
    id: 'customer-support-agent',
    name: 'Customer Support Agent',
    version: '1.0.0'
  },
  capabilities: {
    tools: [
      { name: 'lookup_order', description: 'Retrieve order details' },
      { name: 'process_refund', description: 'Initiate refund workflow' }
    ],
    tags: ['customer-service', 'e-commerce']
  },
  communication: {
    supported: ['mcp', 'a2a'],
    endpoints: {
      mcp: 'mcp://agents/customer-support',
      a2a: 'https://api.example.com/agents/customer-support'
    }
  },
  relationships: {
    workflows: ['urn:proto:workflow:refund-process@2.1.0'],
    apis: ['urn:proto:api:orders-service@3.0.0'],
    iam: ['urn:proto:iam:customer-service-role@1.0.0']
  }
};

const agent = createAgentProtocol(manifest);
const validation = agent.validate();

if (validation.ok) {
  console.log('Agent manifest is valid!');
  console.log('Capabilities:', agent.get('capabilities.tools'));
}
```

### Agent → Workflow → API → IAM Chain

Agents can reference entire execution chains:

```javascript
// Agent references workflow
agent.relationships.workflows = ['urn:proto:workflow:order-fulfillment@1.0.0'];

// Workflow calls API
workflow.steps[0].api = 'urn:proto:api:inventory-service@2.0.0';

// API requires IAM role
api.endpoints[0].iam_role = 'urn:proto:iam:order-processor@1.0.0';
```

### Catalog Discovery

```javascript
import { URNCatalogIndex } from './src/catalog/index.js';

const catalog = new URNCatalogIndex();

// Add agent to catalog
catalog.add({
  urn: 'urn:proto:agent:data-analyzer@1.0.0',
  name: 'data-analyzer',
  version: '1.0.0',
  type: 'agent',
  dependencies: ['urn:proto:data:analytics-db@1.0.0'],
  metadata: {
    tags: ['analytics', 'data-science'],
    governance: {
      owner: 'data-team',
      classification: 'internal'
    }
  }
});

// Query agents by capabilities
const analyticsAgents = catalog.queryByTag('analytics');
const dataAgents = catalog.get('urn:proto:agent:data-analyzer@1.0.0');
```

## 🛠️ Installation

```bash
# Clone repository
git clone https://github.com/your-org/oss-protocols.git
cd oss-protocols/app

# Install dependencies
npm install

# Run tests
npm test

# Run specific protocol tests
npm test -- tests/integration/agent-full-suite.test.js
```

## 📚 Documentation

- **Protocol Examples**: See `docs/` directory for detailed examples
- **Test Suite**: `tests/` contains 480+ comprehensive tests
- **Integration Patterns**: `tests/integration/` shows cross-protocol usage
- **Code Generation**: Each protocol includes generators for clients, tests, and docs

## ✅ Test Coverage

- **480+ tests** across all protocols
- **19 agent integration tests** covering:
  - URN validation across all 18 protocols
  - Agent → Workflow → API → IAM resolution chains
  - Catalog discovery and querying
  - Communication protocol support (MCP, A2A, webhooks)
  - Fragment-based URN resolution
  - Cross-protocol validation

## 🎯 Key Features

### 1. URN-Based Cross-References

All protocols use URNs for type-safe references:

```
urn:proto:agent:customer-agent@1.0.0
urn:proto:workflow:order-fulfillment@2.1.0
urn:proto:api:orders-service@3.0.0#endpoint.createOrder
```

### 2. Built-in Validation

Every protocol includes comprehensive validation:

```javascript
const validation = agent.validate();
// Returns { ok: true/false, results: [...], issues: [...] }
```

### 3. Code Generation

Generate production-ready code:

```javascript
agent.generateTests();
api.generateClientSDK({ lang: 'typescript' });
workflow.generateDiagram();
```

### 4. Governance Integration

Track ownership, compliance, and PII:

```javascript
metadata: {
  governance: {
    owner: 'data-team',
    classification: 'confidential',
    pii: true,
    compliance: ['gdpr', 'ccpa']
  }
}
```

## 🔧 Usage Examples

### API Protocol

```javascript
import { createAPIProtocol } from './src/api_protocol_v_1_1_1.js';

const api = createAPIProtocol({
  metadata: {
    kind: 'api',
    id: 'users-service',
    version: '2.0.0'
  },
  catalog: {
    endpoints: [
      {
        method: 'GET',
        path: '/users/:id',
        auth: 'required',
        response: { type: 'object', properties: { id: { type: 'string' } } }
      }
    ]
  }
});
```

### Event Protocol

```javascript
import { createEventProtocol } from './src/event_protocol_v_1_1_1.js';

const events = createEventProtocol({
  metadata: { kind: 'event', id: 'order-events', version: '1.0.0' },
  events: [
    {
      name: 'order.created',
      schema: {
        type: 'object',
        properties: {
          orderId: { type: 'string' },
          customerId: { type: 'string' }
        }
      }
    }
  ]
});
```

### Workflow Protocol

```javascript
import { createWorkflowProtocol } from './src/workflow_protocol_v_1_1_1.js';

const workflow = createWorkflowProtocol({
  workflow: {
    id: 'order-fulfillment',
    version: '1.0.0'
  },
  steps: [
    {
      id: 'validate',
      type: 'task',
      action: 'validate_order',
      api: 'urn:proto:api:orders-service@2.0.0'
    }
  ]
});
```

## 📖 Mission History

This protocol suite was developed through iterative missions:

- **A1.1**: Initial agent protocol design
- **A1.2**: Cross-protocol URN integration
- **A2.1**: Communication protocols (MCP, A2A)
- **A3.1**: Suite-wide integration assessment
- **A3.2**: Legacy cleanup & comprehensive verification ✅

## 🤝 Contributing

Contributions welcome! Please ensure:

1. All tests pass (`npm test`)
2. New protocols follow existing patterns
3. Documentation is updated
4. Integration tests are added

## 📄 License

MIT License - See LICENSE file for details

## 🔗 Related Projects

- **Model Context Protocol (MCP)**: Agent communication standard
- **AsyncAPI**: Event-driven architecture specs
- **OpenAPI**: REST API specifications
- **JSON Schema**: Data validation

## 💡 Why Use OSS Protocols?

- **Unified Framework**: One system for all protocol types
- **Production Ready**: 480+ tests, comprehensive validation
- **Agent Native**: First-class support for AI agents
- **Extensible**: Easy to add new protocol types
- **Type Safe**: URN-based references prevent errors
- **Governance Built-in**: Compliance and security tracking

## 🔧 Runtime Integration

### A2A (Agent-to-Agent) HTTP Client

The runtime includes a production-ready A2A HTTP client for authenticated, delegated, retry-capable requests between agents.

#### Environment Variables

```bash
# Authentication
A2A_TOKEN=your-bearer-token-here
A2A_AUTH_TYPE=default          # default, static, none
A2A_TOKEN_ENV_VAR=A2A_TOKEN    # Custom env var name

# Client Configuration
A2A_BASE_URL=http://localhost:3000
A2A_TIMEOUT=30000              # Request timeout in ms
A2A_MAX_RETRIES=3              # Max retry attempts
A2A_ENABLE_LOGGING=true        # Enable debug logging

# Agent Context
CURRENT_AGENT_URN=urn:agent:runtime:agent@latest
```

#### Usage

```javascript
import { createA2AClient, request } from './runtime/a2a-client.js';
import { createAuthProvider } from './runtime/a2a-auth.js';

// Create client with auth
const authProvider = createAuthProvider({ type: 'default' });
const client = createA2AClient({ authProvider });

// Make A2A request
const response = await client.request(
  'urn:agent:domain:name@v1.0.0',
  '/api/skills/analyze',
  {
    body: { data: 'input' },
    context: { currentAgentUrn: 'urn:agent:caller:agent' }
  }
);

// Or use convenience function
const result = await request(
  'urn:agent:domain:name@v1.0.0',
  '/api/skills/analyze',
  { body: { data: 'input' } }
);
```

#### Common Failures & Troubleshooting

**Authentication Errors (401/403)**
- Verify `A2A_TOKEN` is set correctly
- Check token permissions and expiration
- Ensure target agent accepts your delegation

**Timeout Errors**
- Increase `A2A_TIMEOUT` for slow operations
- Check network connectivity to target agent
- Verify target agent is responding

**Retry Exhaustion**
- Increase `A2A_MAX_RETRIES` for unreliable networks
- Check if target agent is experiencing issues
- Review retry status codes (429, 5xx)

**Network Errors**
- Verify `A2A_BASE_URL` is correct
- Check firewall and network policies
- Ensure target agent endpoint is reachable

#### Error Types

- `AuthError`: Authentication failures (401, 403)
- `TimeoutError`: Request timeouts
- `NetworkError`: Network connectivity issues
- `RetryError`: All retry attempts exhausted
- `A2AError`: General A2A communication errors

#### Performance Targets

- Local p50 successful request < 200ms
- Exponential backoff with jitter for retries
- Configurable timeouts and retry limits
- Structured logging with request IDs

### MCP (Model Context Protocol) Client

The runtime includes a production-ready MCP client for communicating with MCP servers, enabling agents to discover and execute tools through the Model Context Protocol.

#### Environment Variables

```bash
# MCP Server Configuration
MCP_ENDPOINT=node                    # Command to start MCP server
MCP_ARGS=./bin/protocol-mcp-server.js # Server arguments
MCP_ENV_PROTOCOL_ROOT=/path/to/root  # Server environment variables

# Client Configuration
MCP_TIMEOUT=30000                    # Default timeout in ms
MCP_HEARTBEAT_INTERVAL=30000         # Heartbeat interval in ms
MCP_MAX_RETRIES=3                    # Max reconnection attempts
MCP_ENABLE_LOGGING=false             # Enable debug logging
```

#### Usage

```javascript
import { createMCPClient, withMCPClient } from './runtime/mcp-client.js';

// Create client
const client = createMCPClient({
  endpoint: {
    command: 'node',
    args: ['./bin/protocol-mcp-server.js'],
    env: { PROTOCOL_ROOT: '/path/to/root' }
  },
  timeout: 30000,
  enableLogging: true
});

// Open connection
await client.open();

// List available tools
const tools = await client.listTools();
console.log('Available tools:', tools.map(t => t.name));

// Get tool schema
const schema = await client.getToolSchema('protocol_discover_api');
console.log('Tool schema:', schema);

// Execute tool
const result = await client.executeTool('protocol_discover_api', {
  url: 'https://api.example.com/openapi.json'
});
console.log('Tool result:', result);

// Close connection
await client.close();

// Or use convenience function
const result = await withMCPClient('node', async (client) => {
  await client.open();
  return await client.executeTool('test_tool', { input: 'data' });
});
```

#### Connection Lifecycle

The MCP client manages the full connection lifecycle:

1. **Connection**: Spawns MCP server process via stdio
2. **Initialization**: Handshakes with server using MCP protocol
3. **Heartbeat**: Sends periodic pings to detect disconnections
4. **Reconnection**: Automatically reconnects on failure (configurable)
5. **Cleanup**: Gracefully closes process and cleans up resources

#### Tool Execution Features

- **Timeout Support**: Per-execution timeouts with configurable limits
- **Cancellation**: AbortSignal support for cancelling long-running operations
- **Error Handling**: Typed errors with tool context and URN information
- **Schema Validation**: Validates tool schemas before execution
- **Caching**: Caches tool schemas for performance

#### Common Failures & Troubleshooting

**Connection Errors**
- Verify MCP server command and arguments are correct
- Check that MCP server process can be spawned
- Ensure required environment variables are set
- Check file permissions for server executable

**Initialization Failures**
- Verify MCP server supports the required protocol version
- Check server capabilities match client expectations
- Ensure server responds to initialize request
- Review server logs for initialization errors

**Tool Execution Errors**
- Verify tool name exists in server's tool list
- Check tool input matches schema requirements
- Ensure server has sufficient resources
- Review tool-specific error messages

**Timeout Errors**
- Increase `MCP_TIMEOUT` for slow operations
- Check server performance and resource usage
- Verify network connectivity (if applicable)
- Consider breaking large operations into smaller chunks

**Heartbeat Failures**
- Check server responsiveness
- Verify server process is still running
- Review server logs for errors
- Increase `MCP_HEARTBEAT_INTERVAL` if server is slow

**Reconnection Issues**
- Check `MCP_MAX_RETRIES` setting
- Verify server can handle reconnection
- Review reconnection delay settings
- Ensure server state is preserved across reconnections

#### Error Types

- `MCPConnectionError`: Connection failures and process issues
- `MCPTimeoutError`: Operation timeouts with timeout duration
- `MCPProtocolError`: MCP protocol violations with error codes
- `MCPToolError`: Tool execution failures with tool context
- `MCPCancellationError`: Operation cancellations
- `MCPError`: General MCP communication errors

#### Performance Targets

- Connection establishment < 500ms
- Tool execution p50 < 1s for typical operations
- Heartbeat interval configurable (default 30s)
- Automatic reconnection with exponential backoff
- Structured logging with request IDs and tool context
