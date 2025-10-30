# OSSP-AGI — Protocol Discovery Workbench

OSSP-AGI is a secure-by-default, local-first workbench for discovering, validating, and documenting protocol manifests from real API contracts, database schemas, and event definitions. It provides a comprehensive toolkit for managing modern software protocols with built-in validation, governance, and visualization capabilities.

## 🚀 What OSSP-AGI Does

OSSP-AGI helps you:

- **Discover protocols** from OpenAPI, AsyncAPI, and PostgreSQL sources into URN-addressable manifests
- **Validate ecosystems** with detailed error reporting and cross-protocol relationship validation
- **Explore catalogs** through an intuitive web viewer with dependency graphs and validation status
- **Document outcomes** using automated governance generation and compliance reporting
- **Integrate with AI agents** through Agent-to-Agent (A2A) communication protocols
- **Manage workflows** with multi-step orchestration and business process automation

## 🛡️ Security-First Design

OSSP-AGI enforces secure-by-default behavior:

- **Registry API key required** – services abort when `REGISTRY_API_KEY` is missing
- **IAM delegation enforced** – explicit policy configuration required, everything else fails closed
- **Audit logging** – all denied operations are logged with detailed context
- **No insecure defaults** – permissive fallbacks have been removed

## ⚡ Quick Start

### Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- Git (for cloning)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/oss-protocols.git
cd oss-protocols

# Install dependencies
npm install

# Run tests to verify installation
npm test
```

### Basic Setup

```bash
# Generate a secure API key
export REGISTRY_API_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Create IAM policy directory
mkdir -p app/config/security

# Create minimal IAM policy
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
```

### Your First Protocol Discovery

```bash
# Discover an API from OpenAPI specification
npm run cli -- discover api https://petstore3.swagger.io/api/v3/openapi.json

# Discover database schema from PostgreSQL
npm run cli -- discover postgres "postgresql://user:pass@localhost:5432/mydb"

# Discover event schemas from AsyncAPI
npm run cli -- discover asyncapi ./kafka-events.yaml
```

## 📦 Supported Protocol Types

### Production-Ready Importers

- **OpenAPI** - Import REST/GraphQL API specs (OpenAPI 3.x)
- **AsyncAPI** - Import event schemas (AsyncAPI 2.x/3.x, Kafka/AMQP/MQTT)
- **PostgreSQL** - Import database schemas via connection strings

### Generated Protocol Types

- **API Protocol** - REST/GraphQL API definitions with endpoint metadata
- **Data Protocol** - Database schemas, tables, columns, constraints
- **Event Protocol** - Event-driven messaging with PII detection
- **Workflow Protocol** - Multi-step orchestration and business processes
- **Agent Protocol** - Agent-to-Agent (A2A) communication capabilities
- **Identity & Access Protocol** - IAM policies and delegation rules

## 🔧 Core Workflow

### 1. Import → Validate → Visualize → Document

The workbench supports a complete protocol lifecycle:

**Import** - Discover protocols from external contracts
```bash
npm run cli -- discover api https://api.stripe.com/v1/openapi.json
npm run cli -- discover postgres "postgresql://localhost/mydb"
npm run cli -- discover asyncapi ./kafka-events.yaml
```

**Validate** - Check for issues and cross-protocol relationships
```bash
npm run cli -- validate --ecosystem
```

**Visualize** - Explore via web viewer or export diagrams
```bash
npm run cli -- ui                    # Launch web viewer
npm run cli -- catalog list          # Inspect catalog from CLI
```

**Document** - Generate governance documentation
```bash
node app/examples/generate-governance.js
```

## 🎯 Key Features

### URN-Based Cross-References

All protocols use URNs for type-safe references:

```
urn:proto:agent:customer-agent@1.0.0
urn:proto:workflow:order-fulfillment@2.1.0
urn:proto:api:orders-service@3.0.0#endpoint.createOrder
```

### Built-in Validation

Every protocol includes comprehensive validation:

```javascript
const validation = agent.validate();
// Returns { ok: true/false, results: [...], issues: [...] }
```

### Code Generation

Generate production-ready code:

```javascript
agent.generateTests();
api.generateClientSDK({ lang: 'typescript' });
workflow.generateDiagram();
```

### Governance Integration

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

## 🛠️ CLI Commands

### Discovery Commands

```bash
# Discover API protocols
npm run cli -- discover api <source> [options]

# Discover data protocols
npm run cli -- discover postgres <connection_string> [options]

# Discover event protocols
npm run cli -- discover asyncapi <source> [options]
```

### Validation Commands

```bash
# Validate entire ecosystem
npm run cli -- validate --ecosystem

# Validate specific manifests
npm run cli -- validate --manifests <path> --format json
```

### Catalog Commands

```bash
# List all protocols
npm run cli -- catalog list

# Show specific protocol
npm run cli -- catalog show <urn>

# Search protocols
npm run cli -- catalog search <term>
```

### UI Commands

```bash
# Start web viewer
npm run cli -- ui --port 3456

# Open in browser
open http://localhost:3456
```

## 🔒 Security Configuration

### Registry API Key (Required)

```bash
# Generate secure API key
export REGISTRY_API_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Start registry service
node packages/runtime/registry/server.mjs
```

### IAM Delegation Policy (Required)

```bash
# Create policy directory
mkdir -p app/config/security

# Create delegation policy
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

## 🤖 Agent Integration

### Agent-to-Agent (A2A) Communication

OSSP-AGI supports production-ready A2A HTTP communication:

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

## 📊 Performance & Monitoring

### Telemetry

OSSP-AGI includes comprehensive performance monitoring:

```bash
# View performance metrics
npm run cli -- perf:report

# Check performance status
npm run cli -- perf:status
```

### Performance Targets

- Local p50 successful request < 200ms
- Cross-protocol validation < 1s
- Registry operations < 500ms
- Web viewer load time < 2s

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- tests/integration/agent-full-suite.test.js

# Run performance tests
npm run test:performance

# Run with coverage
npm run test:ci
```

## 📚 Documentation

- **Getting Started**: [`docs/Getting_Started.md`](docs/Getting_Started.md) – Complete setup guide
- **API Reference**: [`docs/api-reference.md`](docs/api-reference.md) – Complete API documentation
- **Integration Guides**: [`docs/integration-guides.md`](docs/integration-guides.md) – Real-world usage patterns
- **Security Guide**: [`docs/security/SECURITY_POLICIES.md`](docs/security/SECURITY_POLICIES.md) – Security configuration
- **Runtime Guide**: [`docs/runtime-usage-guide.md`](docs/runtime-usage-guide.md) – Runtime integration

## ✅ Test Coverage

- **2000+ tests** covering importers, validators, runtime, and CLI
- **Integration tests** for OpenAPI/AsyncAPI/PostgreSQL discovery
- **A2A client tests** with retry, auth, and delegation
- **IAM policy enforcement** tests with audit logging
- **Performance gates** in CI tracking discovery and registry latency

**Coverage Statistics:**
- Statements: 89.9% (652/725)
- Functions: 92.8% (91/98)
- Branches: 76.4% (456/597)
- Lines: 91.1% (622/683)

## 🤝 Contributing

Contributions welcome! Please ensure:

1. All tests pass (`npm test`)
2. New protocols follow existing patterns
3. Documentation is updated
4. Integration tests are added
5. Security policies are respected

## 📄 License

MIT License - See LICENSE file for details

## 🔗 Related Projects

- **Model Context Protocol (MCP)**: Agent communication standard
- **AsyncAPI**: Event-driven architecture specs
- **OpenAPI**: REST API specifications
- **JSON Schema**: Data validation

## 💡 Why Use OSSP-AGI?

- **Contract Discovery**: Automatically extract protocols from OpenAPI, AsyncAPI, PostgreSQL
- **Secure by Default**: Enforced API keys and IAM policies (no permissive fallbacks)
- **Local-First**: No cloud dependencies, runs entirely on your machine
- **Visual Exploration**: Web viewer for browsing catalogs and dependency graphs
- **Governance Automation**: Generate compliance docs from imported specs
- **Extensible**: Adapter system for custom import sources
- **AI-Ready**: Built-in support for agent communication and workflow orchestration
- **Production-Ready**: Comprehensive testing, monitoring, and security features