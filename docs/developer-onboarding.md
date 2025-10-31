# Semantext Hub Developer Onboarding

Complete onboarding guide for new developers joining the Semantext Hub project.

## Table of Contents

- [Welcome](#welcome)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Project Overview](#project-overview)
- [Core Concepts](#core-concepts)
- [Development Workflow](#development-workflow)
- [Testing Guidelines](#testing-guidelines)
- [Code Standards](#code-standards)
- [Contributing](#contributing)
- [Resources](#resources)

---

## Welcome

Welcome to the Semantext Hub project! This guide will help you get up and running quickly and understand how to contribute effectively to the project.

### What is Semantext Hub?

Semantext Hub is a local-first mission orchestration and protocol discovery platform for modern software systems. It provides:

- **Protocol Discovery** - Automatically discover and convert API contracts, database schemas, and event definitions
- **Cross-Protocol Validation** - Validate relationships and dependencies between different protocol types
- **Governance Generation** - Generate comprehensive governance documentation
- **Runtime Integration** - Integrate with AI agents, microservices, and event-driven systems
- **Workflow Orchestration** - Define and execute complex business workflows

### Key Features

- **18 Protocol Types** - API, Data, Event, Workflow, Agent, and 13+ other protocol types
- **Real-time Validation** - Cross-protocol relationship validation in <1s
- **AI Agent Integration** - Native support for AI agent communication and tool execution
- **Comprehensive CLI** - Full-featured command-line interface for all operations
- **Runtime Components** - Production-ready runtime integration components

---

## Prerequisites

### Required Software

- **Node.js 18+** - [Download](https://nodejs.org/)
- **Git** - [Download](https://git-scm.com/)
- **VS Code** (recommended) - [Download](https://code.visualstudio.com/)

### Optional Software

- **Docker** - [Download](https://www.docker.com/)
- **PostgreSQL** - [Download](https://www.postgresql.org/)
- **Redis** - [Download](https://redis.io/)

### Knowledge Requirements

- **JavaScript/Node.js** - Intermediate level
- **REST APIs** - Basic understanding
- **JSON/YAML** - Basic understanding
- **Command Line** - Basic familiarity
- **Git** - Basic understanding

### Recommended Reading

- [OpenAPI Specification](https://swagger.io/specification/)
- [AsyncAPI Specification](https://www.asyncapi.com/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Agent-to-Agent Communication](https://github.com/anthropics/agent-protocol)

---

## Environment Setup

### Step 1: Clone the Repository

```bash
# Clone the repository
git clone https://github.com/kneelinghorse/Semantext-Hub.git
cd Semantext-Hub

# Checkout the main branch
git checkout main
```

### Step 2: Install Dependencies

```bash
# Install root dependencies
npm install

# Install app dependencies
cd app
npm install
cd ..
```

### Step 3: Verify Installation

```bash
# Check Node.js version
node --version  # Should be 18+

# Check npm version
npm --version

# Verify Semantext Hub CLI
npx sch --version
```

### Step 4: Run Initial Setup

```bash
# Run the quickstart wizard
npx sch quickstart

# Or run non-interactively
npx sch quickstart --template microservices --name my-project
```

### Step 5: Validate Setup

```bash
# Navigate to the generated project
cd my-project

# Install dependencies
npm install

# Validate the setup
npm run validate

# Generate governance documentation
npm run governance
```

### Step 6: Configure Development Environment

Create `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "files.associations": {
    "*.yaml": "yaml",
    "*.yml": "yaml"
  },
  "yaml.schemas": {
    "https://json.schemastore.org/workflow": "workflows/*.yaml"
  }
}
```

Create `.vscode/extensions.json`:

```json
{
  "recommendations": [
    "ms-vscode.vscode-json",
    "redhat.vscode-yaml",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-eslint"
  ]
}
```

---

## Project Overview

### Directory Structure

```
ossp-agi/
├── app/                    # Main application code
│   ├── cli/               # CLI commands and utilities
│   ├── core/              # Core protocol definitions
│   ├── docs/              # Documentation
│   ├── examples/          # Example implementations
│   ├── parsers/           # Protocol parsers
│   ├── runtime/           # Runtime components
│   ├── tests/             # Test suites
│   └── package.json       # App dependencies
├── docs/                  # Project documentation
├── missions/              # Mission definitions and tracking
├── package.json           # Root dependencies
└── README.md              # Project overview
```

### Key Components

#### 1. CLI (`app/cli/`)

The command-line interface provides access to all Semantext Hub functionality:

- **Discovery Commands** - `discover api`, `discover data`, `discover event`
- **Validation Commands** - `validate`, `validate --ecosystem`
- **Governance Commands** - `governance`, `governance --sections`
- **Workflow Commands** - `workflow validate`, `workflow simulate`
- **Scaffolding Commands** - `scaffold`, `scaffold --interactive`

#### 2. Core Protocols (`app/core/`)

Core protocol definitions and implementations:

- **API Protocol** - REST/GraphQL API definitions
- **Data Protocol** - Database schema definitions
- **Event Protocol** - Event-driven messaging definitions
- **Workflow Protocol** - Business process orchestration
- **Agent Protocol** - AI agent capabilities and integrations

#### 3. Runtime Components (`app/runtime/`)

Production-ready runtime integration components:

- **Agent Discovery Service** - Discover and manage AI agents
- **A2A Client** - Agent-to-Agent communication
- **MCP Client** - Model Context Protocol client
- **URN Registry** - URN-based agent registry
- **ACM Generator** - Agent Capability Manifest generator

#### 4. Parsers (`app/parsers/`)

Protocol parsers for external formats:

- **OpenAPI Parser** - Parse OpenAPI specifications
- **AsyncAPI Parser** - Parse AsyncAPI specifications
- **PostgreSQL Parser** - Parse database schemas
- **Custom Parsers** - Extensible parser framework

#### 5. Examples (`app/examples/`)

Working examples and integration patterns:

- **Microservices Pattern** - Multi-service integration
- **Event-Driven Pattern** - Event-driven architecture
- **Agent Integration** - AI agent integration patterns
- **Runtime Examples** - Runtime component usage

---

## Core Concepts

### 1. Protocol Manifests

Protocol manifests are JSON documents that describe a specific protocol type:

```json
{
  "apiVersion": "api/v1.1.1",
  "kind": "APIManifest",
  "api": {
    "id": "user-service",
    "name": "User Service API",
    "version": "1.0.0",
    "description": "User management service"
  },
  "endpoints": [
    {
      "path": "/users",
      "method": "GET",
      "description": "List users",
      "parameters": [],
      "responses": []
    }
  ]
}
```

### 2. URN References

URNs (Uniform Resource Names) provide unique identifiers for protocols:

```
urn:proto:api:user-service@1.0.0
urn:proto:data:postgres/users@2.1.0
urn:proto:event:stripe/payment.succeeded@1.0.0
urn:proto:workflow:order-processing@1.0.0
urn:agent:ai:data-processor@1.0.0
```

### 3. Cross-Protocol Relationships

Protocols can reference each other through URN relationships:

```json
{
  "relationships": {
    "apis": ["urn:proto:api:user-service@1.0.0"],
    "data": ["urn:proto:data:postgres/users@2.1.0"],
    "events": ["urn:proto:event:user.created@1.0.0"],
    "workflows": ["urn:proto:workflow:user-onboarding@1.0.0"]
  }
}
```

### 4. Validation Engine

The validation engine ensures protocol correctness and relationship integrity:

- **Schema Validation** - Validate protocol structure
- **URN Resolution** - Validate URN references
- **Dependency Checking** - Check protocol dependencies
- **Cycle Detection** - Detect circular dependencies
- **Security Validation** - Validate security policies

### 5. Governance Generation

Governance documentation is automatically generated from protocol manifests:

- **Security Policies** - Security requirements and controls
- **Compliance Standards** - Regulatory compliance information
- **Performance Metrics** - Performance requirements and SLAs
- **Operational Procedures** - Operational runbooks and procedures

---

## Development Workflow

### 1. Daily Development Workflow

```bash
# Start your day
git pull origin main
npm install

# Run tests
npm test

# Start development
npm run dev

# Make changes
# ... edit code ...

# Test changes
npm test
npm run validate

# Commit changes
git add .
git commit -m "feat: add new feature"
git push origin feature-branch
```

### 2. Feature Development Workflow

```bash
# Create feature branch
git checkout -b feature/new-protocol-type

# Implement feature
# ... write code ...

# Add tests
# ... write tests ...

# Update documentation
# ... update docs ...

# Validate changes
npm test
npm run validate
npm run lint

# Commit changes
git add .
git commit -m "feat: add new protocol type"
git push origin feature/new-protocol-type

# Create pull request
# ... create PR ...
```

### 3. Protocol Development Workflow

```bash
# Create new protocol
npm --prefix app run cli scaffold --type api --name my-service

# Implement protocol
# ... implement protocol ...

# Validate protocol
npm --prefix app run cli validate ./artifacts/my-service-protocol.json

# Test protocol
npm --prefix app run cli validate --ecosystem --manifests ./artifacts

# Generate governance
npm --prefix app run cli governance --manifests ./artifacts

# Commit protocol
git add .
git commit -m "feat: add my-service protocol"
git push origin feature/my-service-protocol
```

### 4. Runtime Component Development

```bash
# Create runtime component
mkdir -p app/runtime/my-component
cd app/runtime/my-component

# Implement component
# ... implement component ...

# Add tests
# ... add tests ...

# Update runtime index
# ... update index.js ...

# Test component
npm test
npm run validate

# Commit component
git add .
git commit -m "feat: add my-component runtime"
git push origin feature/my-component
```

---

## Testing Guidelines

### 1. Test Structure

Tests are organized by component and functionality:

```
app/tests/
├── cli/                   # CLI command tests
├── core/                  # Core protocol tests
├── parsers/               # Parser tests
├── runtime/               # Runtime component tests
├── validation/            # Validation engine tests
└── integration/           # Integration tests
```

### 2. Writing Tests

#### Unit Tests

```javascript
// tests/core/api-protocol.test.js
import { describe, it, expect } from '@jest/globals';
import { createAPIProtocol } from '../../core/api_protocol_v_1_1_1.js';

describe('API Protocol', () => {
  it('should create valid API protocol', () => {
    const protocol = createAPIProtocol({
      id: 'test-api',
      name: 'Test API',
      version: '1.0.0'
    });

    expect(protocol.validate()).toBe(true);
    expect(protocol.get('api.id')).toBe('test-api');
  });

  it('should validate endpoint structure', () => {
    const protocol = createAPIProtocol({
      id: 'test-api',
      name: 'Test API',
      version: '1.0.0',
      endpoints: [
        {
          path: '/test',
          method: 'GET',
          description: 'Test endpoint'
        }
      ]
    });

    const validation = protocol.validate();
    expect(validation.ok).toBe(true);
  });
});
```

#### Integration Tests

```javascript
// tests/integration/protocol-discovery.test.js
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createAgentDiscoveryService } from '../../runtime/agent-discovery-service.js';

describe('Protocol Discovery Integration', () => {
  let discoveryService;

  beforeAll(async () => {
    discoveryService = createAgentDiscoveryService({
      enableLogging: false,
      enableCaching: false
    });
    await discoveryService.initialize();
  });

  afterAll(async () => {
    await discoveryService.shutdown();
  });

  it('should discover protocols from registry', async () => {
    const result = await discoveryService.discoverAgents({
      domain: 'api',
      capabilities: ['rest-api']
    });

    expect(result.total).toBeGreaterThan(0);
    expect(result.agents).toBeDefined();
  });
});
```

### 3. Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --testPathPattern=api-protocol

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run integration tests
npm run test:integration
```

### 4. Test Best Practices

- **Write tests first** - Use TDD approach when possible
- **Test edge cases** - Include boundary conditions and error cases
- **Mock external dependencies** - Use mocks for external services
- **Use descriptive test names** - Make test intentions clear
- **Keep tests focused** - One test should verify one behavior
- **Clean up resources** - Properly clean up in afterAll hooks

---

## Code Standards

### 1. JavaScript Style Guide

We follow the [Standard JavaScript](https://standardjs.com/) style guide:

```javascript
// Good
function processData (data) {
  if (!data) {
    throw new Error('Data is required')
  }
  
  return data.map(item => ({
    id: item.id,
    name: item.name,
    processed: true
  }))
}

// Bad
function processData(data){
  if(!data){
    throw new Error("Data is required");
  }
  
  return data.map((item)=>{
    return {
      id: item.id,
      name: item.name,
      processed: true
    };
  });
}
```

### 2. Naming Conventions

- **Variables and functions** - `camelCase`
- **Constants** - `UPPER_SNAKE_CASE`
- **Classes** - `PascalCase`
- **Files** - `kebab-case.js`
- **Directories** - `kebab-case`

### 3. Documentation Standards

#### JSDoc Comments

```javascript
/**
 * Creates a new API protocol instance
 * @param {Object} config - Protocol configuration
 * @param {string} config.id - Protocol identifier
 * @param {string} config.name - Protocol name
 * @param {string} config.version - Protocol version
 * @returns {APIProtocol} Protocol instance
 * @throws {Error} If configuration is invalid
 */
function createAPIProtocol (config) {
  // Implementation
}
```

#### README Files

Each component should have a README.md file:

```markdown
# Component Name

Brief description of the component.

## Usage

```javascript
import { ComponentName } from './component-name.js'

const instance = new ComponentName(config)
await instance.initialize()
```

## API Reference

### Methods

- `initialize()` - Initialize the component
- `process(data)` - Process data
- `shutdown()` - Shutdown the component

## Examples

See [examples/](./examples/) directory.

## Testing

```bash
npm test
```
```

### 4. Error Handling

```javascript
// Good - Specific error types
class ValidationError extends Error {
  constructor (message, field) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
  }
}

// Good - Proper error handling
async function validateProtocol (protocol) {
  try {
    const result = await protocol.validate()
    return result
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new ValidationError(`Validation failed: ${error.message}`, error.field)
    }
    throw new Error(`Unexpected error: ${error.message}`)
  }
}

// Bad - Generic error handling
async function validateProtocol (protocol) {
  try {
    return await protocol.validate()
  } catch (error) {
    throw error
  }
}
```

### 5. Performance Guidelines

- **Use streaming** - For large data processing
- **Implement caching** - For expensive operations
- **Batch operations** - When possible
- **Monitor memory usage** - Avoid memory leaks
- **Use appropriate data structures** - Choose efficient data structures

---

## Contributing

### 1. Contribution Process

1. **Fork the repository**
2. **Create a feature branch**
3. **Make your changes**
4. **Add tests**
5. **Update documentation**
6. **Run validation**
7. **Create a pull request**

### 2. Pull Request Guidelines

#### PR Title Format

```
type(scope): brief description

feat(api): add new endpoint validation
fix(parser): handle malformed JSON
docs(readme): update installation instructions
test(validation): add edge case tests
```

#### PR Description Template

```markdown
## Description
Brief description of the changes.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests pass
- [ ] No breaking changes (or documented)
```

### 3. Code Review Process

1. **Automated checks** - CI/CD pipeline runs automatically
2. **Peer review** - At least one team member reviews
3. **Testing** - All tests must pass
4. **Documentation** - Documentation must be updated
5. **Approval** - Maintainer approval required

### 4. Issue Reporting

When reporting issues, include:

- **Environment details** - Node.js version, OS, etc.
- **Steps to reproduce** - Clear reproduction steps
- **Expected behavior** - What should happen
- **Actual behavior** - What actually happens
- **Error messages** - Full error output
- **Screenshots** - If applicable

---

## Resources

### 1. Documentation

- **API Reference** - [docs/api-reference.md](api-reference.md)
- **Integration Guides** - [docs/integration-guides.md](integration-guides.md)
- **Runtime API** - [docs/runtime-api-reference.md](runtime-api-reference.md)
- **Graph API** - [docs/graph-api.md](graph-api.md)

### 2. Examples

- **Microservices Pattern** - [examples/microservices-pattern/](examples/microservices-pattern/)
- **Event-Driven Pattern** - [examples/event-driven-pattern/](examples/event-driven-pattern/)
- **Agent Integration** - [examples/agent-integration/](examples/agent-integration/)
- **Runtime Examples** - [examples/runtime-examples/](examples/runtime-examples/)

### 3. External Resources

- **OpenAPI Specification** - [https://swagger.io/specification/](https://swagger.io/specification/)
- **AsyncAPI Specification** - [https://www.asyncapi.com/](https://www.asyncapi.com/)
- **Model Context Protocol** - [https://modelcontextprotocol.io/](https://modelcontextprotocol.io/)
- **Agent Protocol** - [https://github.com/anthropics/agent-protocol](https://github.com/anthropics/agent-protocol)

### 4. Community

- **GitHub Issues** - [https://github.com/your-org/ossp-agi/issues](https://github.com/your-org/ossp-agi/issues)
- **GitHub Discussions** - [https://github.com/your-org/ossp-agi/discussions](https://github.com/your-org/ossp-agi/discussions)
- **Slack Channel** - #ossp-agi-dev
- **Monthly Meetups** - First Tuesday of each month

### 5. Learning Path

#### Week 1: Foundation
- [ ] Complete environment setup
- [ ] Run quickstart tutorial
- [ ] Read core concepts documentation
- [ ] Explore example projects

#### Week 2: Development
- [ ] Create first protocol
- [ ] Write unit tests
- [ ] Understand validation engine
- [ ] Practice CLI commands

#### Week 3: Integration
- [ ] Build runtime integration
- [ ] Work with agent protocols
- [ ] Implement workflow definitions
- [ ] Test cross-protocol relationships

#### Week 4: Contribution
- [ ] Fix a bug or add a feature
- [ ] Write comprehensive tests
- [ ] Update documentation
- [ ] Submit pull request

### 6. Getting Help

#### Internal Resources
- **Team Slack** - #ossp-agi-dev
- **Office Hours** - Tuesdays 2-3 PM
- **Code Review Sessions** - Fridays 10-11 AM
- **Architecture Discussions** - Monthly

#### External Resources
- **Stack Overflow** - Tag: `ossp-agi`
- **GitHub Issues** - For bug reports and feature requests
- **GitHub Discussions** - For questions and ideas
- **Community Forum** - [https://community.ossp-agi.org](https://community.ossp-agi.org)

---

## Next Steps

### Immediate Actions

1. **Complete environment setup** - Follow the setup guide
2. **Run quickstart tutorial** - Get familiar with the CLI
3. **Explore examples** - Understand different patterns
4. **Join team Slack** - Connect with the team
5. **Attend office hours** - Ask questions and get help

### First Week Goals

- [ ] Set up development environment
- [ ] Complete quickstart tutorial
- [ ] Understand core concepts
- [ ] Create first protocol
- [ ] Write first test
- [ ] Join team communication channels

### First Month Goals

- [ ] Contribute to codebase
- [ ] Understand architecture
- [ ] Build integration example
- [ ] Participate in code reviews
- [ ] Attend team meetings
- [ ] Complete learning path

### Long-term Goals

- [ ] Become domain expert
- [ ] Mentor new developers
- [ ] Lead feature development
- [ ] Contribute to architecture decisions
- [ ] Represent project externally
- [ ] Drive innovation initiatives

---

## Conclusion

Welcome to the Semantext Hub team! This onboarding guide provides the foundation you need to start contributing effectively. Remember:

- **Ask questions** - Don't hesitate to reach out for help
- **Start small** - Begin with simple contributions
- **Follow standards** - Adhere to code and documentation standards
- **Test thoroughly** - Write comprehensive tests
- **Document everything** - Keep documentation up to date
- **Be collaborative** - Work with the team and community

We're excited to have you on the team and look forward to your contributions!

---

*Generated for Mission B10.8 - Internal Developer Documentation*
*Last Updated: 2025-01-09*
