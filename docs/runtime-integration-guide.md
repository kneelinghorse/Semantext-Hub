# Runtime Integration Guide

This guide explains how to integrate the OSSP-AGI runtime components into your applications, covering different integration patterns, architectures, and deployment scenarios.

## Table of Contents

- [Registry Service](#registry-service)
- [Integration Patterns](#integration-patterns)
- [Application Architecture](#application-architecture)
- [Service Integration](#service-integration)
- [Microservices Integration](#microservices-integration)
- [Event-Driven Integration](#event-driven-integration)
- [API Gateway Integration](#api-gateway-integration)
- [Container Integration](#container-integration)
- [Cloud Integration](#cloud-integration)
- [Monitoring Integration](#monitoring-integration)
- [Deployment Strategies](#deployment-strategies)

## Registry Service

### Starting the Registry Server

The canonical Registry HTTP server is exported from `packages/runtime/registry/server.mjs`. This is the **single HTTP entry point** for the registry service.

**Important:** The legacy file-based registry at `app/services/registry/server.mjs` has been deprecated and now serves as a thin compatibility layer that delegates to this runtime server.

```javascript
import { createServer, startServer } from 'packages/runtime/registry/server.mjs';

// Option 1: Create Express app and start manually
const apiKey = process.env.REGISTRY_API_KEY;
if (!apiKey) {
  throw new Error('REGISTRY_API_KEY must be set before starting the registry server.');
}

const app = await createServer({
  apiKey,
  registryConfigPath: './config/registry.config.json',
  rateLimitConfigPath: './config/security/rate-limit.config.json',
  requireProvenance: true,
  dbPath: './var/registry.sqlite',
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Registry server listening on port ${port}`);
});

// Option 2: Use startServer for simplified startup
const secureApiKey = process.env.REGISTRY_API_KEY;
if (!secureApiKey) {
  throw new Error('REGISTRY_API_KEY must be provided before calling startServer().');
}

const { app, port, server, close } = await startServer({
  apiKey: secureApiKey,
  port: process.env.PORT || 3000,
  requireProvenance: true,
  dbPath: './var/registry.sqlite',
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await close();
});
```

> Tip: The new `packages/runtime/package.json` exports map allows importers to reference the canonical runtime entry with standard Node resolution (`import { startServer } from '@ossp/runtime/registry/server'`) once the package is consumed outside this repository.

### Available Endpoints

The registry server exposes the following endpoints:

- `GET /health` - Health check with registry statistics
- `GET /openapi.json` - OpenAPI specification
- `GET /.well-known/ossp-agi.json` - Well-known service discovery
- `GET /v1/registry/:urn` - Fetch manifest by URN
- `PUT /v1/registry/:urn` - Register or update manifest
- `GET /v1/resolve?urn=...` - Resolve agent by URN
- `POST /v1/query` - Query agents by capability

### Environment Variables

- `REGISTRY_API_KEY` - API key for authentication (**required**; no default fallback)
- `OSSP_IAM_POLICY` - Optional path to IAM policy (defaults to `app/config/security/delegation-policy.json`)
- `OSSP_IAM_AUDIT_LOG` - Optional path for IAM audit log (defaults to `artifacts/security/denials.jsonl`)
- `PORT` - Server port (default: 3000)
- `PROVENANCE_PUBKEY_PATH` - Path to public key for provenance verification

### Configuration

Create a `registry.config.json` file:

```json
{
  "dbPath": "./var/registry.sqlite",
  "pragmas": {
    "journal_mode": "WAL",
    "synchronous": "NORMAL"
  }
}
```

### Testing

Run the parity test to verify all endpoints:

```bash
npm test -- tests/runtime/registry.http.parity.spec.mjs
```

## Integration Patterns

### Pattern 1: Direct Integration

Direct integration involves importing and using runtime components directly in your application.

```javascript
// examples/direct-integration.js
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

class MyApplication {
  constructor() {
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true
    });
    
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true
    });
    
    this.mcpClient = createMCPClient({
      endpoint: process.env.MCP_ENDPOINT || 'npx @modelcontextprotocol/server-filesystem',
      enableLogging: true
    });
  }
  
  async initialize() {
    await this.discovery.initialize();
    console.log('Application initialized');
  }
  
  async discoverAgents(domain) {
    return await this.discovery.discoverByDomain(domain);
  }
  
  async communicateWithAgent(agentUrn, route, data) {
    return await this.a2aClient.request(agentUrn, route, {
      method: 'POST',
      body: data
    });
  }
  
  async executeTool(toolName, input) {
    await this.mcpClient.open();
    const result = await this.mcpClient.executeTool(toolName, input);
    await this.mcpClient.close();
    return result;
  }
}

// Usage
const app = new MyApplication();
await app.initialize();

// Discover AI agents
const aiAgents = await app.discoverAgents('ai');
console.log(`Found ${aiAgents.total} AI agents`);

// Communicate with an agent
const response = await app.communicateWithAgent(
  'urn:agent:ai:ml-agent@1.0.0',
  '/api/inference',
  { input: 'test data' }
);

// Execute MCP tool
const toolResult = await app.executeTool('read_file', { path: '/test.txt' });
```

### Pattern 2: Service Layer Integration

Create a service layer that abstracts the runtime components.

```javascript
// examples/service-layer-integration.js
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

class RuntimeService {
  constructor(config) {
    this.config = config;
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
  }
  
  async initialize() {
    // Initialize discovery service
    this.discovery = createAgentDiscoveryService({
      enableLogging: this.config.enableLogging,
      enableCaching: this.config.enableCaching,
      cacheTtl: this.config.cacheTtl || 300000
    });
    await this.discovery.initialize();
    
    // Initialize A2A client
    this.a2aClient = createA2AClient({
      baseUrl: this.config.a2aBaseUrl,
      enableLogging: this.config.enableLogging,
      timeout: this.config.a2aTimeout || 10000,
      maxRetries: this.config.a2aMaxRetries || 3
    });
    
    // Initialize MCP client
    this.mcpClient = createMCPClient({
      endpoint: this.config.mcpEndpoint,
      enableLogging: this.config.enableLogging,
      timeout: this.config.mcpTimeout || 15000
    });
    
    console.log('Runtime service initialized');
  }
  
  async discoverAgents(query) {
    if (!this.discovery) {
      throw new Error('Runtime service not initialized');
    }
    return await this.discovery.discoverAgents(query);
  }
  
  async requestAgent(agentUrn, route, options) {
    if (!this.a2aClient) {
      throw new Error('Runtime service not initialized');
    }
    return await this.a2aClient.request(agentUrn, route, options);
  }
  
  async executeMCPTool(toolName, input, options) {
    if (!this.mcpClient) {
      throw new Error('Runtime service not initialized');
    }
    
    const isConnected = this.mcpClient.isConnected();
    if (!isConnected) {
      await this.mcpClient.open();
    }
    
    try {
      return await this.mcpClient.executeTool(toolName, input, options);
    } finally {
      if (!isConnected) {
        await this.mcpClient.close();
      }
    }
  }
  
  async shutdown() {
    if (this.mcpClient && this.mcpClient.isConnected()) {
      await this.mcpClient.close();
    }
    if (this.discovery) {
      await this.discovery.shutdown();
    }
  }
}

// Application service that uses runtime service
class ApplicationService {
  constructor(runtimeService) {
    this.runtime = runtimeService;
  }
  
  async processData(data) {
    // Discover available agents
    const agents = await this.runtime.discoverAgents({
      domain: 'ai',
      capabilities: ['data-processing']
    });
    
    if (agents.total === 0) {
      throw new Error('No data processing agents available');
    }
    
    // Use first available agent
    const agent = agents.agents[0];
    const response = await this.runtime.requestAgent(
      agent.urn,
      '/api/process',
      {
        method: 'POST',
        body: data
      }
    );
    
    return response.data;
  }
  
  async analyzeFile(filePath) {
    // Use MCP tool to read file
    const fileContent = await this.runtime.executeMCPTool('read_file', {
      path: filePath
    });
    
    // Use AI agent to analyze content
    const analysis = await this.runtime.requestAgent(
      'urn:agent:ai:analyzer@1.0.0',
      '/api/analyze',
      {
        method: 'POST',
        body: { content: fileContent.content[0].text }
      }
    );
    
    return analysis.data;
  }
}

// Usage
const runtimeService = new RuntimeService({
  enableLogging: true,
  enableCaching: true,
  a2aBaseUrl: 'http://localhost:3000',
  mcpEndpoint: 'npx @modelcontextprotocol/server-filesystem'
});

await runtimeService.initialize();

const appService = new ApplicationService(runtimeService);

// Process data
const processedData = await appService.processData({ input: 'test' });

// Analyze file
const analysis = await appService.analyzeFile('/path/to/file.txt');

await runtimeService.shutdown();
```

### Pattern 3: Plugin Architecture

Create a plugin system that allows dynamic loading of runtime components.

```javascript
// examples/plugin-architecture.js
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.runtimeComponents = new Map();
  }
  
  registerPlugin(name, plugin) {
    this.plugins.set(name, plugin);
  }
  
  async initializePlugin(name) {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not found`);
    }
    
    if (plugin.initialize) {
      await plugin.initialize();
    }
    
    console.log(`Plugin ${name} initialized`);
  }
  
  async initializeAll() {
    for (const [name, plugin] of this.plugins) {
      await this.initializePlugin(name);
    }
  }
  
  getPlugin(name) {
    return this.plugins.get(name);
  }
}

// Discovery Plugin
class DiscoveryPlugin {
  constructor(config) {
    this.config = config;
    this.discovery = null;
  }
  
  async initialize() {
    this.discovery = createAgentDiscoveryService(this.config);
    await this.discovery.initialize();
  }
  
  async discoverAgents(query) {
    return await this.discovery.discoverAgents(query);
  }
  
  async shutdown() {
    if (this.discovery) {
      await this.discovery.shutdown();
    }
  }
}

// A2A Plugin
class A2APlugin {
  constructor(config) {
    this.config = config;
    this.client = null;
  }
  
  async initialize() {
    this.client = createA2AClient(this.config);
  }
  
  async request(agentUrn, route, options) {
    return await this.client.request(agentUrn, route, options);
  }
}

// MCP Plugin
class MCPPlugin {
  constructor(config) {
    this.config = config;
    this.client = null;
  }
  
  async initialize() {
    this.client = createMCPClient(this.config);
  }
  
  async executeTool(toolName, input, options) {
    const isConnected = this.client.isConnected();
    if (!isConnected) {
      await this.client.open();
    }
    
    try {
      return await this.client.executeTool(toolName, input, options);
    } finally {
      if (!isConnected) {
        await this.client.close();
      }
    }
  }
}

// Usage
const pluginManager = new PluginManager();

// Register plugins
pluginManager.registerPlugin('discovery', new DiscoveryPlugin({
  enableLogging: true,
  enableCaching: true
}));

pluginManager.registerPlugin('a2a', new A2APlugin({
  baseUrl: 'http://localhost:3000',
  enableLogging: true
}));

pluginManager.registerPlugin('mcp', new MCPPlugin({
  endpoint: 'npx @modelcontextprotocol/server-filesystem',
  enableLogging: true
}));

// Initialize all plugins
await pluginManager.initializeAll();

// Use plugins
const discoveryPlugin = pluginManager.getPlugin('discovery');
const a2aPlugin = pluginManager.getPlugin('a2a');
const mcpPlugin = pluginManager.getPlugin('mcp');

// Discover agents
const agents = await discoveryPlugin.discoverAgents({ domain: 'ai' });

// Communicate with agent
const response = await a2aPlugin.request(
  'urn:agent:ai:ml-agent@1.0.0',
  '/api/inference',
  { method: 'POST', body: { input: 'test' } }
);

// Execute MCP tool
const toolResult = await mcpPlugin.executeTool('read_file', { path: '/test.txt' });
```

## Application Architecture

### Monolithic Application

Integrate runtime components into a monolithic application.

```javascript
// examples/monolithic-architecture.js
import express from 'express';
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

class MonolithicApp {
  constructor() {
    this.app = express();
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
  }
  
  async initialize() {
    // Initialize runtime components
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true
    });
    await this.discovery.initialize();
    
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true
    });
    
    this.mcpClient = createMCPClient({
      endpoint: process.env.MCP_ENDPOINT || 'npx @modelcontextprotocol/server-filesystem',
      enableLogging: true
    });
    
    // Setup routes
    this.setupRoutes();
    
    // Start server
    const port = process.env.PORT || 3001;
    this.app.listen(port, () => {
      console.log(`Monolithic app listening on port ${port}`);
    });
  }
  
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });
    
    // Discover agents
    this.app.get('/agents', async (req, res) => {
      try {
        const query = req.query;
        const result = await this.discovery.discoverAgents(query);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Request agent
    this.app.post('/agents/:urn/request', async (req, res) => {
      try {
        const { urn } = req.params;
        const { route, ...options } = req.body;
        const result = await this.a2aClient.request(urn, route, options);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Execute MCP tool
    this.app.post('/mcp/tools/:toolName/execute', async (req, res) => {
      try {
        const { toolName } = req.params;
        const { input, ...options } = req.body;
        
        const isConnected = this.mcpClient.isConnected();
        if (!isConnected) {
          await this.mcpClient.open();
        }
        
        try {
          const result = await this.mcpClient.executeTool(toolName, input, options);
          res.json(result);
        } finally {
          if (!isConnected) {
            await this.mcpClient.close();
          }
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }
  
  async shutdown() {
    if (this.mcpClient && this.mcpClient.isConnected()) {
      await this.mcpClient.close();
    }
    if (this.discovery) {
      await this.discovery.shutdown();
    }
  }
}

// Usage
const app = new MonolithicApp();
await app.initialize();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await app.shutdown();
  process.exit(0);
});
```

### Microservices Architecture

Integrate runtime components into microservices.

```javascript
// examples/microservices-architecture.js
import express from 'express';
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

// Agent Discovery Service
class AgentDiscoveryMicroservice {
  constructor() {
    this.app = express();
    this.discovery = null;
  }
  
  async initialize() {
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true
    });
    await this.discovery.initialize();
    
    this.setupRoutes();
    
    const port = process.env.DISCOVERY_PORT || 3001;
    this.app.listen(port, () => {
      console.log(`Agent Discovery Service listening on port ${port}`);
    });
  }
  
  setupRoutes() {
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', service: 'agent-discovery' });
    });
    
    this.app.get('/agents', async (req, res) => {
      try {
        const query = req.query;
        const result = await this.discovery.discoverAgents(query);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.get('/agents/domain/:domain', async (req, res) => {
      try {
        const { domain } = req.params;
        const result = await this.discovery.discoverByDomain(domain);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }
}

// A2A Communication Service
class A2ACommunicationMicroservice {
  constructor() {
    this.app = express();
    this.a2aClient = null;
  }
  
  async initialize() {
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true
    });
    
    this.setupRoutes();
    
    const port = process.env.A2A_PORT || 3002;
    this.app.listen(port, () => {
      console.log(`A2A Communication Service listening on port ${port}`);
    });
  }
  
  setupRoutes() {
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', service: 'a2a-communication' });
    });
    
    this.app.post('/request', async (req, res) => {
      try {
        const { agentUrn, route, ...options } = req.body;
        const result = await this.a2aClient.request(agentUrn, route, options);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }
}

// MCP Tool Service
class MCPToolMicroservice {
  constructor() {
    this.app = express();
    this.mcpClient = null;
  }
  
  async initialize() {
    this.mcpClient = createMCPClient({
      endpoint: process.env.MCP_ENDPOINT || 'npx @modelcontextprotocol/server-filesystem',
      enableLogging: true
    });
    
    this.setupRoutes();
    
    const port = process.env.MCP_PORT || 3003;
    this.app.listen(port, () => {
      console.log(`MCP Tool Service listening on port ${port}`);
    });
  }
  
  setupRoutes() {
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', service: 'mcp-tool' });
    });
    
    this.app.get('/tools', async (req, res) => {
      try {
        const isConnected = this.mcpClient.isConnected();
        if (!isConnected) {
          await this.mcpClient.open();
        }
        
        try {
          const tools = await this.mcpClient.listTools();
          res.json(tools);
        } finally {
          if (!isConnected) {
            await this.mcpClient.close();
          }
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.post('/tools/:toolName/execute', async (req, res) => {
      try {
        const { toolName } = req.params;
        const { input, ...options } = req.body;
        
        const isConnected = this.mcpClient.isConnected();
        if (!isConnected) {
          await this.mcpClient.open();
        }
        
        try {
          const result = await this.mcpClient.executeTool(toolName, input, options);
          res.json(result);
        } finally {
          if (!isConnected) {
            await this.mcpClient.close();
          }
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }
}

// Usage
const discoveryService = new AgentDiscoveryMicroservice();
const a2aService = new A2ACommunicationMicroservice();
const mcpService = new MCPToolMicroservice();

await discoveryService.initialize();
await a2aService.initialize();
await mcpService.initialize();
```

## Service Integration

### REST API Integration

Integrate runtime components with REST APIs.

```javascript
// examples/rest-api-integration.js
import express from 'express';
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

class RESTAPIIntegration {
  constructor() {
    this.app = express();
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
  }
  
  async initialize() {
    // Initialize runtime components
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true
    });
    await this.discovery.initialize();
    
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true
    });
    
    this.mcpClient = createMCPClient({
      endpoint: process.env.MCP_ENDPOINT || 'npx @modelcontextprotocol/server-filesystem',
      enableLogging: true
    });
    
    // Setup middleware
    this.app.use(express.json());
    
    // Setup routes
    this.setupRoutes();
    
    // Start server
    const port = process.env.PORT || 3001;
    this.app.listen(port, () => {
      console.log(`REST API Integration listening on port ${port}`);
    });
  }
  
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        services: {
          discovery: 'healthy',
          a2a: 'healthy',
          mcp: 'healthy'
        }
      });
    });
    
    // Agent discovery endpoints
    this.app.get('/api/v1/agents', async (req, res) => {
      try {
        const query = req.query;
        const result = await this.discovery.discoverAgents(query);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.get('/api/v1/agents/:urn', async (req, res) => {
      try {
        const { urn } = req.params;
        const agent = await this.discovery.getAgent(urn);
        if (!agent) {
          return res.status(404).json({ error: 'Agent not found' });
        }
        res.json(agent);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // A2A communication endpoints
    this.app.post('/api/v1/agents/:urn/request', async (req, res) => {
      try {
        const { urn } = req.params;
        const { route, ...options } = req.body;
        const result = await this.a2aClient.request(urn, route, options);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // MCP tool endpoints
    this.app.get('/api/v1/mcp/tools', async (req, res) => {
      try {
        const isConnected = this.mcpClient.isConnected();
        if (!isConnected) {
          await this.mcpClient.open();
        }
        
        try {
          const tools = await this.mcpClient.listTools();
          res.json(tools);
        } finally {
          if (!isConnected) {
            await this.mcpClient.close();
          }
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.post('/api/v1/mcp/tools/:toolName/execute', async (req, res) => {
      try {
        const { toolName } = req.params;
        const { input, ...options } = req.body;
        
        const isConnected = this.mcpClient.isConnected();
        if (!isConnected) {
          await this.mcpClient.open();
        }
        
        try {
          const result = await this.mcpClient.executeTool(toolName, input, options);
          res.json(result);
        } finally {
          if (!isConnected) {
            await this.mcpClient.close();
          }
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }
}

// Usage
const restAPI = new RESTAPIIntegration();
await restAPI.initialize();
```

### GraphQL Integration

Integrate runtime components with GraphQL.

```javascript
// examples/graphql-integration.js
import express from 'express';
import { graphqlHTTP } from 'express-graphql';
import { buildSchema } from 'graphql';
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

class GraphQLIntegration {
  constructor() {
    this.app = express();
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
  }
  
  async initialize() {
    // Initialize runtime components
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true
    });
    await this.discovery.initialize();
    
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true
    });
    
    this.mcpClient = createMCPClient({
      endpoint: process.env.MCP_ENDPOINT || 'npx @modelcontextprotocol/server-filesystem',
      enableLogging: true
    });
    
    // Build GraphQL schema
    const schema = buildSchema(`
      type Agent {
        urn: String!
        name: String!
        version: String!
        description: String
        capabilities: [Capability!]!
        endpoints: Endpoints
        health: Health
      }
      
      type Capability {
        name: String!
        type: String!
        description: String
        version: String
      }
      
      type Endpoints {
        api: String
        health: String
        metrics: String
      }
      
      type Health {
        status: String!
        lastChecked: String
        responseTime: Int
      }
      
      type DiscoveryResult {
        agents: [Agent!]!
        total: Int!
        returned: Int!
        executionTime: Int!
      }
      
      type A2AResponse {
        status: Int!
        data: String
        headers: String
      }
      
      type MCPTool {
        name: String!
        description: String
        inputSchema: String
      }
      
      type MCPResult {
        success: Boolean!
        content: [String!]!
        metadata: String
      }
      
      type Query {
        agents(domain: String, capabilities: [String!], limit: Int, offset: Int): DiscoveryResult!
        agent(urn: String!): Agent
        mcpTools: [MCPTool!]!
      }
      
      type Mutation {
        requestAgent(agentUrn: String!, route: String!, method: String!, body: String): A2AResponse!
        executeMCPTool(toolName: String!, input: String!): MCPResult!
      }
    `);
    
    // Create resolvers
    const resolvers = {
      agents: async (args) => {
        const query = {
          domain: args.domain,
          capabilities: args.capabilities,
          limit: args.limit,
          offset: args.offset,
          includeHealth: true
        };
        return await this.discovery.discoverAgents(query);
      },
      
      agent: async (args) => {
        return await this.discovery.getAgent(args.urn);
      },
      
      mcpTools: async () => {
        const isConnected = this.mcpClient.isConnected();
        if (!isConnected) {
          await this.mcpClient.open();
        }
        
        try {
          return await this.mcpClient.listTools();
        } finally {
          if (!isConnected) {
            await this.mcpClient.close();
          }
        }
      },
      
      requestAgent: async (args) => {
        const options = {
          method: args.method || 'POST',
          body: args.body ? JSON.parse(args.body) : undefined
        };
        const result = await this.a2aClient.request(args.agentUrn, args.route, options);
        return {
          status: result.status,
          data: JSON.stringify(result.data),
          headers: JSON.stringify(result.headers)
        };
      },
      
      executeMCPTool: async (args) => {
        const isConnected = this.mcpClient.isConnected();
        if (!isConnected) {
          await this.mcpClient.open();
        }
        
        try {
          const input = JSON.parse(args.input);
          const result = await this.mcpClient.executeTool(args.toolName, input);
          return {
            success: result.success,
            content: result.content.map(item => JSON.stringify(item)),
            metadata: JSON.stringify(result.metadata)
          };
        } finally {
          if (!isConnected) {
            await this.mcpClient.close();
          }
        }
      }
    };
    
    // Setup GraphQL endpoint
    this.app.use('/graphql', graphqlHTTP({
      schema,
      rootValue: resolvers,
      graphiql: true
    }));
    
    // Start server
    const port = process.env.PORT || 3001;
    this.app.listen(port, () => {
      console.log(`GraphQL Integration listening on port ${port}`);
      console.log(`GraphiQL available at http://localhost:${port}/graphql`);
    });
  }
}

// Usage
const graphqlAPI = new GraphQLIntegration();
await graphqlAPI.initialize();
```

## Event-Driven Integration

### Event Bus Integration

Integrate runtime components with an event bus.

```javascript
// examples/event-bus-integration.js
import { EventEmitter } from 'events';
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

class EventBusIntegration extends EventEmitter {
  constructor() {
    super();
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
  }
  
  async initialize() {
    // Initialize runtime components
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true
    });
    await this.discovery.initialize();
    
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true
    });
    
    this.mcpClient = createMCPClient({
      endpoint: process.env.MCP_ENDPOINT || 'npx @modelcontextprotocol/server-filesystem',
      enableLogging: true
    });
    
    // Setup event handlers
    this.setupEventHandlers();
    
    console.log('Event bus integration initialized');
  }
  
  setupEventHandlers() {
    // Agent discovery events
    this.on('discoverAgents', async (query) => {
      try {
        const result = await this.discovery.discoverAgents(query);
        this.emit('agentsDiscovered', result);
      } catch (error) {
        this.emit('discoveryError', error);
      }
    });
    
    // A2A communication events
    this.on('requestAgent', async (data) => {
      try {
        const { agentUrn, route, ...options } = data;
        const result = await this.a2aClient.request(agentUrn, route, options);
        this.emit('agentResponse', { requestId: data.requestId, result });
      } catch (error) {
        this.emit('agentError', { requestId: data.requestId, error });
      }
    });
    
    // MCP tool execution events
    this.on('executeMCPTool', async (data) => {
      try {
        const { toolName, input, ...options } = data;
        
        const isConnected = this.mcpClient.isConnected();
        if (!isConnected) {
          await this.mcpClient.open();
        }
        
        try {
          const result = await this.mcpClient.executeTool(toolName, input, options);
          this.emit('mcpToolResult', { requestId: data.requestId, result });
        } finally {
          if (!isConnected) {
            await this.mcpClient.close();
          }
        }
      } catch (error) {
        this.emit('mcpToolError', { requestId: data.requestId, error });
      }
    });
  }
  
  async discoverAgents(query) {
    return new Promise((resolve, reject) => {
      const requestId = `discover-${Date.now()}`;
      
      this.once('agentsDiscovered', (result) => {
        resolve(result);
      });
      
      this.once('discoveryError', (error) => {
        reject(error);
      });
      
      this.emit('discoverAgents', query);
    });
  }
  
  async requestAgent(agentUrn, route, options) {
    return new Promise((resolve, reject) => {
      const requestId = `request-${Date.now()}`;
      
      this.once('agentResponse', (data) => {
        if (data.requestId === requestId) {
          resolve(data.result);
        }
      });
      
      this.once('agentError', (data) => {
        if (data.requestId === requestId) {
          reject(data.error);
        }
      });
      
      this.emit('requestAgent', {
        requestId,
        agentUrn,
        route,
        ...options
      });
    });
  }
  
  async executeMCPTool(toolName, input, options) {
    return new Promise((resolve, reject) => {
      const requestId = `mcp-${Date.now()}`;
      
      this.once('mcpToolResult', (data) => {
        if (data.requestId === requestId) {
          resolve(data.result);
        }
      });
      
      this.once('mcpToolError', (data) => {
        if (data.requestId === requestId) {
          reject(data.error);
        }
      });
      
      this.emit('executeMCPTool', {
        requestId,
        toolName,
        input,
        ...options
      });
    });
  }
}

// Usage
const eventBus = new EventBusIntegration();
await eventBus.initialize();

// Use event-driven API
const agents = await eventBus.discoverAgents({ domain: 'ai' });
console.log(`Found ${agents.total} AI agents`);

const response = await eventBus.requestAgent(
  'urn:agent:ai:ml-agent@1.0.0',
  '/api/inference',
  { method: 'POST', body: { input: 'test' } }
);

const toolResult = await eventBus.executeMCPTool('read_file', { path: '/test.txt' });
```

### Message Queue Integration

Integrate runtime components with message queues.

```javascript
// examples/message-queue-integration.js
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

class MessageQueueIntegration {
  constructor(queueConfig) {
    this.queueConfig = queueConfig;
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
    this.queues = new Map();
  }
  
  async initialize() {
    // Initialize runtime components
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true
    });
    await this.discovery.initialize();
    
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true
    });
    
    this.mcpClient = createMCPClient({
      endpoint: process.env.MCP_ENDPOINT || 'npx @modelcontextprotocol/server-filesystem',
      enableLogging: true
    });
    
    // Setup message queues
    await this.setupQueues();
    
    console.log('Message queue integration initialized');
  }
  
  async setupQueues() {
    // Discovery queue
    this.queues.set('discovery', {
      publish: async (message) => {
        console.log('Publishing discovery message:', message);
        // Implement actual queue publishing
      },
      subscribe: async (handler) => {
        console.log('Subscribing to discovery queue');
        // Implement actual queue subscription
      }
    });
    
    // A2A queue
    this.queues.set('a2a', {
      publish: async (message) => {
        console.log('Publishing A2A message:', message);
        // Implement actual queue publishing
      },
      subscribe: async (handler) => {
        console.log('Subscribing to A2A queue');
        // Implement actual queue subscription
      }
    });
    
    // MCP queue
    this.queues.set('mcp', {
      publish: async (message) => {
        console.log('Publishing MCP message:', message);
        // Implement actual queue publishing
      },
      subscribe: async (handler) => {
        console.log('Subscribing to MCP queue');
        // Implement actual queue subscription
      }
    });
  }
  
  async publishDiscoveryRequest(query) {
    const message = {
      type: 'discovery.request',
      query,
      timestamp: new Date().toISOString()
    };
    
    await this.queues.get('discovery').publish(message);
  }
  
  async publishA2ARequest(agentUrn, route, options) {
    const message = {
      type: 'a2a.request',
      agentUrn,
      route,
      options,
      timestamp: new Date().toISOString()
    };
    
    await this.queues.get('a2a').publish(message);
  }
  
  async publishMCPToolRequest(toolName, input, options) {
    const message = {
      type: 'mcp.tool.request',
      toolName,
      input,
      options,
      timestamp: new Date().toISOString()
    };
    
    await this.queues.get('mcp').publish(message);
  }
  
  async subscribeToDiscoveryResponses(handler) {
    await this.queues.get('discovery').subscribe(handler);
  }
  
  async subscribeToA2AResponses(handler) {
    await this.queues.get('a2a').subscribe(handler);
  }
  
  async subscribeToMCPResponses(handler) {
    await this.queues.get('mcp').subscribe(handler);
  }
}

// Usage
const mqIntegration = new MessageQueueIntegration({
  // Queue configuration
});

await mqIntegration.initialize();

// Publish messages
await mqIntegration.publishDiscoveryRequest({ domain: 'ai' });
await mqIntegration.publishA2ARequest(
  'urn:agent:ai:ml-agent@1.0.0',
  '/api/inference',
  { method: 'POST', body: { input: 'test' } }
);
await mqIntegration.publishMCPToolRequest('read_file', { path: '/test.txt' });

// Subscribe to responses
await mqIntegration.subscribeToDiscoveryResponses((message) => {
  console.log('Discovery response:', message);
});

await mqIntegration.subscribeToA2AResponses((message) => {
  console.log('A2A response:', message);
});

await mqIntegration.subscribeToMCPResponses((message) => {
  console.log('MCP response:', message);
});
```

## API Gateway Integration

### API Gateway Configuration

Integrate runtime components with an API gateway.

```javascript
// examples/api-gateway-integration.js
import express from 'express';
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

class APIGatewayIntegration {
  constructor() {
    this.app = express();
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
    this.routes = new Map();
  }
  
  async initialize() {
    // Initialize runtime components
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true
    });
    await this.discovery.initialize();
    
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true
    });
    
    this.mcpClient = createMCPClient({
      endpoint: process.env.MCP_ENDPOINT || 'npx @modelcontextprotocol/server-filesystem',
      enableLogging: true
    });
    
    // Setup middleware
    this.setupMiddleware();
    
    // Setup routes
    this.setupRoutes();
    
    // Start server
    const port = process.env.PORT || 3001;
    this.app.listen(port, () => {
      console.log(`API Gateway listening on port ${port}`);
    });
  }
  
  setupMiddleware() {
    this.app.use(express.json());
    
    // CORS middleware
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
    
    // Request logging middleware
    this.app.use((req, res, next) => {
      console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
      next();
    });
    
    // Rate limiting middleware (simplified)
    this.app.use((req, res, next) => {
      // Implement rate limiting logic
      next();
    });
  }
  
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        services: {
          discovery: 'healthy',
          a2a: 'healthy',
          mcp: 'healthy'
        }
      });
    });
    
    // Agent discovery routes
    this.app.get('/api/v1/agents', async (req, res) => {
      try {
        const query = req.query;
        const result = await this.discovery.discoverAgents(query);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.get('/api/v1/agents/:urn', async (req, res) => {
      try {
        const { urn } = req.params;
        const agent = await this.discovery.getAgent(urn);
        if (!agent) {
          return res.status(404).json({ error: 'Agent not found' });
        }
        res.json(agent);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // A2A communication routes
    this.app.post('/api/v1/agents/:urn/request', async (req, res) => {
      try {
        const { urn } = req.params;
        const { route, ...options } = req.body;
        const result = await this.a2aClient.request(urn, route, options);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // MCP tool routes
    this.app.get('/api/v1/mcp/tools', async (req, res) => {
      try {
        const isConnected = this.mcpClient.isConnected();
        if (!isConnected) {
          await this.mcpClient.open();
        }
        
        try {
          const tools = await this.mcpClient.listTools();
          res.json(tools);
        } finally {
          if (!isConnected) {
            await this.mcpClient.close();
          }
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.post('/api/v1/mcp/tools/:toolName/execute', async (req, res) => {
      try {
        const { toolName } = req.params;
        const { input, ...options } = req.body;
        
        const isConnected = this.mcpClient.isConnected();
        if (!isConnected) {
          await this.mcpClient.open();
        }
        
        try {
          const result = await this.mcpClient.executeTool(toolName, input, options);
          res.json(result);
        } finally {
          if (!isConnected) {
            await this.mcpClient.close();
          }
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Dynamic route registration
    this.app.use('/api/v1/dynamic/:service/*', async (req, res) => {
      try {
        const { service } = req.params;
        const path = req.params[0];
        
        // Route to appropriate service based on service name
        if (service === 'discovery') {
          // Handle discovery service routing
          res.json({ message: 'Discovery service routing' });
        } else if (service === 'a2a') {
          // Handle A2A service routing
          res.json({ message: 'A2A service routing' });
        } else if (service === 'mcp') {
          // Handle MCP service routing
          res.json({ message: 'MCP service routing' });
        } else {
          res.status(404).json({ error: 'Service not found' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }
  
  registerRoute(path, handler) {
    this.routes.set(path, handler);
  }
  
  async shutdown() {
    if (this.mcpClient && this.mcpClient.isConnected()) {
      await this.mcpClient.close();
    }
    if (this.discovery) {
      await this.discovery.shutdown();
    }
  }
}

// Usage
const apiGateway = new APIGatewayIntegration();
await apiGateway.initialize();

// Register custom routes
apiGateway.registerRoute('/api/v1/custom/endpoint', (req, res) => {
  res.json({ message: 'Custom endpoint' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down API Gateway...');
  await apiGateway.shutdown();
  process.exit(0);
});
```

## Container Integration

### Docker Integration

Create Docker containers for runtime components.

```dockerfile
# examples/Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start application
CMD ["node", "app.js"]
```

```javascript
// examples/docker-app.js
import express from 'express';
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

class DockerApp {
  constructor() {
    this.app = express();
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
  }
  
  async initialize() {
    // Initialize runtime components
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true
    });
    await this.discovery.initialize();
    
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true
    });
    
    this.mcpClient = createMCPClient({
      endpoint: process.env.MCP_ENDPOINT || 'npx @modelcontextprotocol/server-filesystem',
      enableLogging: true
    });
    
    // Setup routes
    this.setupRoutes();
    
    // Start server
    const port = process.env.PORT || 3001;
    this.app.listen(port, () => {
      console.log(`Docker app listening on port ${port}`);
    });
  }
  
  setupRoutes() {
    // Health check for Docker
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      });
    });
    
    // Other routes...
  }
}

// Start application
const app = new DockerApp();
await app.initialize();
```

### Kubernetes Integration

Create Kubernetes manifests for runtime components.

```yaml
# examples/k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: runtime-integration
  labels:
    app: runtime-integration
spec:
  replicas: 3
  selector:
    matchLabels:
      app: runtime-integration
  template:
    metadata:
      labels:
        app: runtime-integration
    spec:
      containers:
      - name: runtime-integration
        image: runtime-integration:latest
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: "production"
        - name: A2A_BASE_URL
          value: "http://a2a-service:3000"
        - name: MCP_ENDPOINT
          value: "npx @modelcontextprotocol/server-filesystem"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: runtime-integration-service
spec:
  selector:
    app: runtime-integration
  ports:
  - port: 80
    targetPort: 3001
  type: LoadBalancer
```

## Cloud Integration

### AWS Integration

Integrate runtime components with AWS services.

```javascript
// examples/aws-integration.js
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

class AWSIntegration {
  constructor() {
    this.sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
  }
  
  async initialize() {
    // Initialize runtime components
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true
    });
    await this.discovery.initialize();
    
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true
    });
    
    this.mcpClient = createMCPClient({
      endpoint: process.env.MCP_ENDPOINT || 'npx @modelcontextprotocol/server-filesystem',
      enableLogging: true
    });
    
    console.log('AWS integration initialized');
  }
  
  async publishToSQS(queueUrl, message) {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message)
    });
    
    return await this.sqsClient.send(command);
  }
  
  async publishToSNS(topicArn, message) {
    const command = new PublishCommand({
      TopicArn: topicArn,
      Message: JSON.stringify(message)
    });
    
    return await this.snsClient.send(command);
  }
  
  async discoverAgentsAndPublish(query, queueUrl) {
    try {
      const result = await this.discovery.discoverAgents(query);
      await this.publishToSQS(queueUrl, {
        type: 'agents.discovered',
        result,
        timestamp: new Date().toISOString()
      });
      return result;
    } catch (error) {
      await this.publishToSQS(queueUrl, {
        type: 'discovery.error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }
  
  async requestAgentAndPublish(agentUrn, route, options, topicArn) {
    try {
      const result = await this.a2aClient.request(agentUrn, route, options);
      await this.publishToSNS(topicArn, {
        type: 'agent.response',
        agentUrn,
        result,
        timestamp: new Date().toISOString()
      });
      return result;
    } catch (error) {
      await this.publishToSNS(topicArn, {
        type: 'agent.error',
        agentUrn,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }
}

// Usage
const awsIntegration = new AWSIntegration();
await awsIntegration.initialize();

// Publish discovery results to SQS
await awsIntegration.discoverAgentsAndPublish(
  { domain: 'ai' },
  process.env.DISCOVERY_QUEUE_URL
);

// Publish A2A responses to SNS
await awsIntegration.requestAgentAndPublish(
  'urn:agent:ai:ml-agent@1.0.0',
  '/api/inference',
  { method: 'POST', body: { input: 'test' } },
  process.env.A2A_TOPIC_ARN
);
```

### Azure Integration

Integrate runtime components with Azure services.

```javascript
// examples/azure-integration.js
import { ServiceBusClient } from '@azure/service-bus';
import { EventGridClient } from '@azure/eventgrid';
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

class AzureIntegration {
  constructor() {
    this.serviceBusClient = new ServiceBusClient(process.env.AZURE_SERVICE_BUS_CONNECTION_STRING);
    this.eventGridClient = new EventGridClient(process.env.AZURE_EVENT_GRID_ENDPOINT);
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
  }
  
  async initialize() {
    // Initialize runtime components
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true
    });
    await this.discovery.initialize();
    
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true
    });
    
    this.mcpClient = createMCPClient({
      endpoint: process.env.MCP_ENDPOINT || 'npx @modelcontextprotocol/server-filesystem',
      enableLogging: true
    });
    
    console.log('Azure integration initialized');
  }
  
  async publishToServiceBus(queueName, message) {
    const sender = this.serviceBusClient.createSender(queueName);
    await sender.sendMessages({ body: message });
    await sender.close();
  }
  
  async publishToEventGrid(topic, event) {
    await this.eventGridClient.publishEvents(topic, [event]);
  }
  
  async discoverAgentsAndPublish(query, queueName) {
    try {
      const result = await this.discovery.discoverAgents(query);
      await this.publishToServiceBus(queueName, {
        type: 'agents.discovered',
        result,
        timestamp: new Date().toISOString()
      });
      return result;
    } catch (error) {
      await this.publishToServiceBus(queueName, {
        type: 'discovery.error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }
  
  async requestAgentAndPublish(agentUrn, route, options, topic) {
    try {
      const result = await this.a2aClient.request(agentUrn, route, options);
      await this.publishToEventGrid(topic, {
        type: 'agent.response',
        agentUrn,
        result,
        timestamp: new Date().toISOString()
      });
      return result;
    } catch (error) {
      await this.publishToEventGrid(topic, {
        type: 'agent.error',
        agentUrn,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }
}

// Usage
const azureIntegration = new AzureIntegration();
await azureIntegration.initialize();

// Publish discovery results to Service Bus
await azureIntegration.discoverAgentsAndPublish(
  { domain: 'ai' },
  'discovery-queue'
);

// Publish A2A responses to Event Grid
await azureIntegration.requestAgentAndPublish(
  'urn:agent:ai:ml-agent@1.0.0',
  '/api/inference',
  { method: 'POST', body: { input: 'test' } },
  'a2a-topic'
);
```

## Monitoring Integration

### Prometheus Integration

Integrate runtime components with Prometheus metrics.

```javascript
// examples/prometheus-integration.js
import { register, Counter, Histogram, Gauge } from 'prom-client';
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

class PrometheusIntegration {
  constructor() {
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
    
    // Define metrics
    this.discoveryCounter = new Counter({
      name: 'runtime_discovery_requests_total',
      help: 'Total number of discovery requests',
      labelNames: ['domain', 'status']
    });
    
    this.a2aCounter = new Counter({
      name: 'runtime_a2a_requests_total',
      help: 'Total number of A2A requests',
      labelNames: ['agent_urn', 'status']
    });
    
    this.mcpCounter = new Counter({
      name: 'runtime_mcp_tool_executions_total',
      help: 'Total number of MCP tool executions',
      labelNames: ['tool_name', 'status']
    });
    
    this.requestDuration = new Histogram({
      name: 'runtime_request_duration_seconds',
      help: 'Duration of runtime requests',
      labelNames: ['component', 'operation']
    });
    
    this.activeConnections = new Gauge({
      name: 'runtime_active_connections',
      help: 'Number of active connections',
      labelNames: ['component']
    });
    
    // Register metrics
    register.registerMetric(this.discoveryCounter);
    register.registerMetric(this.a2aCounter);
    register.registerMetric(this.mcpCounter);
    register.registerMetric(this.requestDuration);
    register.registerMetric(this.activeConnections);
  }
  
  async initialize() {
    // Initialize runtime components
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true
    });
    await this.discovery.initialize();
    
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true
    });
    
    this.mcpClient = createMCPClient({
      endpoint: process.env.MCP_ENDPOINT || 'npx @modelcontextprotocol/server-filesystem',
      enableLogging: true
    });
    
    console.log('Prometheus integration initialized');
  }
  
  async discoverAgents(query) {
    const startTime = Date.now();
    const timer = this.requestDuration.startTimer({ component: 'discovery', operation: 'discover' });
    
    try {
      const result = await this.discovery.discoverAgents(query);
      this.discoveryCounter.inc({ domain: query.domain || 'all', status: 'success' });
      return result;
    } catch (error) {
      this.discoveryCounter.inc({ domain: query.domain || 'all', status: 'error' });
      throw error;
    } finally {
      timer();
    }
  }
  
  async requestAgent(agentUrn, route, options) {
    const startTime = Date.now();
    const timer = this.requestDuration.startTimer({ component: 'a2a', operation: 'request' });
    
    try {
      const result = await this.a2aClient.request(agentUrn, route, options);
      this.a2aCounter.inc({ agent_urn: agentUrn, status: 'success' });
      return result;
    } catch (error) {
      this.a2aCounter.inc({ agent_urn: agentUrn, status: 'error' });
      throw error;
    } finally {
      timer();
    }
  }
  
  async executeMCPTool(toolName, input, options) {
    const startTime = Date.now();
    const timer = this.requestDuration.startTimer({ component: 'mcp', operation: 'execute' });
    
    try {
      const isConnected = this.mcpClient.isConnected();
      if (!isConnected) {
        await this.mcpClient.open();
        this.activeConnections.inc({ component: 'mcp' });
      }
      
      try {
        const result = await this.mcpClient.executeTool(toolName, input, options);
        this.mcpCounter.inc({ tool_name: toolName, status: 'success' });
        return result;
      } finally {
        if (!isConnected) {
          await this.mcpClient.close();
          this.activeConnections.dec({ component: 'mcp' });
        }
      }
    } catch (error) {
      this.mcpCounter.inc({ tool_name: toolName, status: 'error' });
      throw error;
    } finally {
      timer();
    }
  }
  
  getMetrics() {
    return register.metrics();
  }
}

// Usage
const prometheusIntegration = new PrometheusIntegration();
await prometheusIntegration.initialize();

// Use with metrics collection
const agents = await prometheusIntegration.discoverAgents({ domain: 'ai' });
const response = await prometheusIntegration.requestAgent(
  'urn:agent:ai:ml-agent@1.0.0',
  '/api/inference',
  { method: 'POST', body: { input: 'test' } }
);
const toolResult = await prometheusIntegration.executeMCPTool('read_file', { path: '/test.txt' });

// Get metrics
const metrics = await prometheusIntegration.getMetrics();
console.log('Prometheus metrics:', metrics);
```

## Deployment Strategies

### Blue-Green Deployment

Deploy runtime components using blue-green deployment.

```javascript
// examples/blue-green-deployment.js
import express from 'express';
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

class BlueGreenDeployment {
  constructor() {
    this.app = express();
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
    this.deploymentColor = process.env.DEPLOYMENT_COLOR || 'blue';
  }
  
  async initialize() {
    // Initialize runtime components
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true
    });
    await this.discovery.initialize();
    
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true
    });
    
    this.mcpClient = createMCPClient({
      endpoint: process.env.MCP_ENDPOINT || 'npx @modelcontextprotocol/server-filesystem',
      enableLogging: true
    });
    
    // Setup routes
    this.setupRoutes();
    
    // Start server
    const port = process.env.PORT || 3001;
    this.app.listen(port, () => {
      console.log(`${this.deploymentColor} deployment listening on port ${port}`);
    });
  }
  
  setupRoutes() {
    // Health check with deployment color
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        deployment: this.deploymentColor,
        timestamp: new Date().toISOString()
      });
    });
    
    // Readiness check
    this.app.get('/ready', async (req, res) => {
      try {
        // Check if all components are ready
        const discoveryHealth = this.discovery.getHealth();
        const a2aStatus = this.a2aClient.circuitBreaker.getStatus();
        const mcpState = this.mcpClient.getState();
        
        const isReady = discoveryHealth.status === 'healthy' && 
                       a2aStatus.canExecute && 
                       mcpState.connected;
        
        if (isReady) {
          res.json({ 
            status: 'ready', 
            deployment: this.deploymentColor,
            components: {
              discovery: discoveryHealth.status,
              a2a: a2aStatus.state,
              mcp: mcpState.connected ? 'connected' : 'disconnected'
            }
          });
        } else {
          res.status(503).json({ 
            status: 'not ready', 
            deployment: this.deploymentColor 
          });
        }
      } catch (error) {
        res.status(503).json({ 
          status: 'error', 
          deployment: this.deploymentColor,
          error: error.message 
        });
      }
    });
    
    // Other routes...
  }
}

// Usage
const deployment = new BlueGreenDeployment();
await deployment.initialize();
```

### Canary Deployment

Deploy runtime components using canary deployment.

```javascript
// examples/canary-deployment.js
import express from 'express';
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

class CanaryDeployment {
  constructor() {
    this.app = express();
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
    this.canaryPercentage = parseInt(process.env.CANARY_PERCENTAGE) || 10;
    this.canaryVersion = process.env.CANARY_VERSION || 'v2';
  }
  
  async initialize() {
    // Initialize runtime components
    this.discovery = createAgentDiscoveryService({
      enableLogging: true,
      enableCaching: true
    });
    await this.discovery.initialize();
    
    this.a2aClient = createA2AClient({
      baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
      enableLogging: true
    });
    
    this.mcpClient = createMCPClient({
      endpoint: process.env.MCP_ENDPOINT || 'npx @modelcontextprotocol/server-filesystem',
      enableLogging: true
    });
    
    // Setup routes
    this.setupRoutes();
    
    // Start server
    const port = process.env.PORT || 3001;
    this.app.listen(port, () => {
      console.log(`Canary deployment (${this.canaryPercentage}%) listening on port ${port}`);
    });
  }
  
  setupRoutes() {
    // Health check with canary info
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        deployment: 'canary',
        percentage: this.canaryPercentage,
        version: this.canaryVersion,
        timestamp: new Date().toISOString()
      });
    });
    
    // Canary traffic routing
    this.app.use((req, res, next) => {
      const userId = req.headers['x-user-id'] || Math.random().toString(36).substr(2, 9);
      const hash = this.hashUserId(userId);
      const isCanary = (hash % 100) < this.canaryPercentage;
      
      req.isCanary = isCanary;
      req.userId = userId;
      
      if (isCanary) {
        res.setHeader('X-Canary', 'true');
        res.setHeader('X-Canary-Version', this.canaryVersion);
      }
      
      next();
    });
    
    // Other routes...
  }
  
  hashUserId(userId) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

// Usage
const canaryDeployment = new CanaryDeployment();
await canaryDeployment.initialize();
```

## Best Practices Summary

### 1. Architecture Patterns
- Use service layer abstraction for runtime components
- Implement plugin architecture for extensibility
- Design for microservices and container deployment
- Support event-driven and message queue integration

### 2. Integration Patterns
- REST API integration for simple use cases
- GraphQL integration for complex queries
- Event bus integration for reactive systems
- Message queue integration for distributed systems

### 3. Deployment Strategies
- Use blue-green deployment for zero-downtime updates
- Implement canary deployment for gradual rollouts
- Support container and Kubernetes deployment
- Integrate with cloud platforms (AWS, Azure, GCP)

### 4. Monitoring and Observability
- Integrate with Prometheus for metrics collection
- Use structured logging with correlation IDs
- Implement health checks and readiness probes
- Monitor circuit breaker and retry policy metrics

### 5. Security Considerations
- Validate all inputs and URNs
- Use authentication providers for A2A communication
- Implement rate limiting and CORS policies
- Sanitize error messages to prevent information leakage

### 6. Performance Optimization
- Enable caching for frequently accessed data
- Use connection pooling for external services
- Implement circuit breakers and retry policies
- Monitor and optimize resource usage

This integration guide provides comprehensive patterns and examples for integrating the OSSP-AGI runtime components into various application architectures and deployment scenarios.
