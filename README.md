# OSSP-AGI — Protocol Discovery Workbench

OSSP-AGI is a secure-by-default, local-first workbench for discovering, validating, and documenting protocol manifests sourced from real contracts. Sprint 21 hardened the runtime so newcomers always start from trustworthy defaults: explicit registry API keys, fail-closed IAM policies, and viewer/runtime surfaces that only expose supported workflows.

## 🚀 What You Can Do

- **Discover protocols** from OpenAPI, AsyncAPI, and Postgres sources into URN-addressable manifests.
- **Validate ecosystems** with detailed error reporting and audit traces for denied operations.
- **Explore catalogs** through the local viewer’s catalog + validation tabs (governance UI surfaces stay disabled until real data ships).
- **Document outcomes** using the governance generator library and curated artifacts inside `artifacts/` (no placeholder TODO scaffolds).

## 🛡️ Sprint 21 Hardened Defaults

- **Registry API key required** – services abort when `REGISTRY_API_KEY` is missing or empty.
- **IAM delegation enforced** – `OSSP_IAM_POLICY` (or the default policy path) must resolve to an explicit policy; everything else fails closed with `403` and is logged.
- **Trimmed runtime surfaces** – A2A communication remains production-ready, while MCP agent/workflow execution and viewer governance panes now return deterministic `501` responses with follow-up guidance.
- **Startup checklist** – starting the registry via `node packages/runtime/registry/server.mjs` validates configuration so demos cannot proceed with permissive fallbacks.

## ⚡ Quick Start (Secure Defaults)

A reproducible, no-surprises walkthrough lives in [`docs/Getting_Started.md`](docs/Getting_Started.md). The short version:

```bash
git clone https://github.com/your-org/oss-protocols.git
cd oss-protocols
npm install

export REGISTRY_API_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
mkdir -p app/config/security
cat > app/config/security/delegation-policy.json <<'EOF'
{
  "mode": "enforce",
  "agents": {
    "urn:agent:runtime:workflow-executor": {
      "allow": ["execute_workflow", "read_manifest"],
      "resources": ["approved/*", "drafts/*"]
    }
  },
  "exemptions": ["public/*"]
}
EOF

npm run cli -- discover api https://petstore3.swagger.io/api/v3/openapi.json
npm run cli -- validate --ecosystem
npm run cli -- ui
```

Open `http://localhost:3456` to inspect manifests, catalog graphs, and validation status. Agent/workflow orchestration surfaces intentionally respond with `501` to keep the story truthful until future missions re-enable them.

## 📦 Supported Import Sources

### Production-Ready Importers
- **OpenAPI** - Import REST/GraphQL API specs (OpenAPI 3.x)
- **AsyncAPI** - Import event schemas (AsyncAPI 2.x/3.x, Kafka/AMQP/MQTT)
- **Postgres** - Import database schemas via connection strings

### Generated Protocol Types
- **API Protocol** - REST/GraphQL API definitions with endpoint metadata
- **Data Protocol** - Database schemas, tables, columns, constraints
- **Event Protocol** - Event-driven messaging with PII detection
- **Workflow Protocol** - Multi-step orchestration (WSAP - Workbench Spec Analysis Pipeline)
- **Agent Protocol** - Agent-to-Agent (A2A) communication capabilities
- **Identity & Access Protocol** - IAM policies and delegation rules

### Experimental/Limited Support
- **Semantic Protocol** - Self-documentation and knowledge graphs
- Other protocol types are planned but not yet implemented

## ⚡ Core Workflow

### Import → Validate → Visualize → Document

The workbench supports a complete protocol lifecycle:

1. **Import** - Discover protocols from external contracts
   ```bash
   npm run cli -- discover api https://api.stripe.com/v1/openapi.json
   npm run cli -- discover postgres "postgresql://localhost/mydb"
   npm run cli -- discover asyncapi ./kafka-events.yaml
   ```

2. **Validate** - Check for issues and cross-protocol relationships
   ```bash
   npm run cli -- validate --ecosystem
   ```

3. **Visualize** - Explore via web viewer or export diagrams
   ```bash
   npm run cli -- ui                    # Launch web viewer (catalog + validation)
   npm run cli -- catalog list          # Inspect catalog index from the CLI
   ```

4. **Document** - Generate governance documentation
   ```bash
   node app/examples/generate-governance.js   # Example usage (see docs/governance-generator.md)
   ```

### Supported Communication: Agent-to-Agent (A2A)

**Status**: Production-ready for local agent communication

Agents can communicate via the Agent-to-Agent (A2A) HTTP protocol with:
- **Bearer token authentication** with delegation support
- **Retry logic** with exponential backoff
- **Request/response logging** for debugging
- **URN-based agent resolution** via registry

**Note**: MCP (Model Context Protocol) and custom protocols are experimental and return `501 Not Implemented` for unsupported operations. See runtime surface documentation for details

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
cd oss-protocols

# Install dependencies
npm install

# Run tests
npm test

# Run specific protocol tests
npm test -- tests/integration/agent-full-suite.test.js
```

## 🔒 Security Setup (Required)

**Starting with Sprint 21**, OSSP-AGI enforces **secure-by-default** behavior. Services will not start without proper configuration.

### Registry API Key (Required)

The registry service requires an explicit API key. No insecure defaults are provided.

```bash
# Generate a secure API key (recommended)
export REGISTRY_API_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Or set a custom key (minimum 20 characters recommended)
export REGISTRY_API_KEY="your-secure-api-key-here"

# Verify the key is set
echo $REGISTRY_API_KEY

# Start the registry service
node packages/runtime/registry/server.mjs
```

**What happens without a key?**
```
⚠️  SECURITY ERROR: Registry startup blocked - missing API key

The registry requires an explicit API key for secure operation.
Insecure defaults (e.g., "local-dev-key") have been removed.

To fix this, set the REGISTRY_API_KEY environment variable:
  export REGISTRY_API_KEY="your-secure-api-key-here"
```

### IAM Delegation Policy (Required)

The IAM system requires an explicit delegation policy. By default, all access is denied.

```bash
# Create the policy directory
mkdir -p app/config/security

# Create a delegation policy file
cat > app/config/security/delegation-policy.json <<'EOF'
{
  "mode": "enforce",
  "agents": {
    "urn:agent:runtime:workflow-executor": {
      "allow": ["execute_workflow", "read_manifest"],
      "resources": ["approved/*", "drafts/*"]
    }
  },
  "exemptions": ["public/*"]
}
EOF

# Or set a custom policy path (preferred variable: OSSP_IAM_POLICY)
export OSSP_IAM_POLICY="./my-custom-policy.json"
# Legacy deployments that still export DELEGATION_POLICY_PATH will continue to work, but the new variable is required for security hardening.
```

**Authorization Behavior:**
- ✅ **Allowed**: Requests matching the policy (capability + resource pattern)
- ❌ **Denied (403)**: Requests not matching the policy
- 📝 **Audit Log**: All denials logged to `artifacts/security/denials.jsonl`

### Quick Start with Secure Defaults

```bash
# 1. Set up security configuration
export REGISTRY_API_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# 2. Create minimal IAM policy
mkdir -p app/config/security
cat > app/config/security/delegation-policy.json <<'EOF'
{
  "mode": "enforce",
  "agents": {},
  "exemptions": []
}
EOF

# 3. Run tests (they include required keys)
npm test

# 4. Start services (startup checklist warns if any prerequisites are missing)
node packages/runtime/registry/server.mjs
```

For detailed security policies and best practices, see [`docs/security/SECURITY_POLICIES.md`](docs/security/SECURITY_POLICIES.md).

## 📚 Documentation

- **Getting Started**: [`docs/Getting_Started.md`](docs/Getting_Started.md) – Secure setup + reproducible walkthrough
- **Quickstart Cheatsheet**: [`docs/quickstart.md`](docs/quickstart.md) – Command-forward summary
- **Security Policies**: [`docs/security/SECURITY_POLICIES.md`](docs/security/SECURITY_POLICIES.md) – Required configuration and audit notes
- **Trimmed Surfaces (S21.2)**: [`docs/SPRINT_21_SURFACE_CHANGES.md`](docs/SPRINT_21_SURFACE_CHANGES.md) – Runtime/viewer changes and disabled surfaces
- **Adapter Development**: [`docs/dev/`](docs/dev/) – Build custom importers
- **Integration Examples**: [`examples/`](examples/) – Real-world usage patterns
- **Roadmap**: [`cmos/docs/roadmap-sprint-21-25.md`](cmos/docs/roadmap-sprint-21-25.md) – Sprint context

## ✅ Test Coverage

<!-- TEST-COUNTS:BEGIN -->
Suites: 133 passed / 0 failed / 134 total
Tests: 2068 passed / 0 failed / 2070 total
Coverage: statements 39.73% · functions 41.55% · branches 31.53% · lines 49.18%
Thresholds met: false
<!-- TEST-COUNTS:END -->

**Test Suite Status**: 
- **2000+ tests** covering importers, validators, runtime, and CLI
- **Integration tests** for OpenAPI/AsyncAPI/Postgres discovery
- **A2A client tests** with retry, auth, and delegation
- **IAM policy enforcement** tests with audit logging
- **Performance gates** in CI tracking discovery and registry latency

**Known Limitations**:
- Some legacy test suites require triage (tracked in backlog)
- Coverage thresholds are aspirational and not enforced in CI

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

## 💡 Why Use OSSP-AGI?

- **Contract Discovery**: Automatically extract protocols from OpenAPI, AsyncAPI, Postgres
- **Secure by Default**: Enforced API keys and IAM policies (no permissive fallbacks)
- **Local-First**: No cloud dependencies, runs entirely on your machine
- **Visual Exploration**: Web viewer for browsing catalogs and dependency graphs
- **Governance Automation**: Generate compliance docs from imported specs
- **Extensible**: Adapter system for custom import sources
- **Truthful Telemetry**: Performance metrics from real operations (no seeded data)

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
