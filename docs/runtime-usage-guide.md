# Runtime Integration Usage Guide

This guide provides step-by-step instructions for using the runtime integration components in common scenarios.

## Table of Contents

- [Getting Started](#getting-started)
- [Agent Discovery Workflow](#agent-discovery-workflow)
- [A2A Communication](#a2a-communication)
- [MCP Tool Execution](#mcp-tool-execution)
- [Error Handling Patterns](#error-handling-patterns)
- [Performance Optimization](#performance-optimization)
- [Troubleshooting](#troubleshooting)

## Getting Started

### Prerequisites

1. Node.js 18+ installed
2. Semantext Hub project cloned and dependencies installed
3. Basic understanding of agent-to-agent communication concepts

### Installation

```bash
# Clone the repository
git clone https://github.com/kneelinghorse/Semantext-Hub.git
cd Semantext-Hub

# Install dependencies
npm install

# Verify installation
npm test -- app/tests/runtime/
```

### Basic Setup

Create a simple runtime integration script:

```javascript
// examples/basic-runtime-setup.js
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

async function basicSetup() {
  // Initialize discovery service
  const discovery = createAgentDiscoveryService({
    enableLogging: true,
    enableCaching: true
  });
  
  await discovery.initialize();
  console.log('Discovery service initialized');
  
  // Initialize A2A client
  const a2aClient = createA2AClient({
    baseUrl: 'http://localhost:3000',
    enableLogging: true
  });
  console.log('A2A client initialized');
  
  // Initialize MCP client
  const mcpClient = createMCPClient({
    endpoint: 'npx @modelcontextprotocol/server-filesystem',
    enableLogging: true
  });
  console.log('MCP client initialized');
  
  return { discovery, a2aClient, mcpClient };
}

// Run basic setup
basicSetup().catch(console.error);
```

## Agent Discovery Workflow

### Step 1: Register Agents

Before discovering agents, you need to register them in the URN registry:

```javascript
// examples/register-agents.js
import { createURNRegistry } from '../app/runtime/urn-registry.js';

async function registerAgents() {
  const registry = createURNRegistry({
    dataDir: './data/registry',
    enableLogging: true
  });
  
  await registry.initialize();
  
  // Register ML agent
  const mlAgent = await registry.registerAgent({
    urn: 'urn:agent:ai:ml-agent@1.0.0',
    name: 'ml-agent',
    version: '1.0.0',
    description: 'Machine learning inference agent',
    capabilities: {
      'ml-inference': {
        type: 'service',
        description: 'Machine learning model inference',
        version: '1.0.0'
      },
      'data-processing': {
        type: 'service',
        description: 'Data processing capabilities',
        version: '1.0.0'
      }
    },
    endpoints: {
      api: '/api/v1',
      health: '/health',
      metrics: '/metrics'
    }
  });
  
  console.log('ML agent registered:', mlAgent.urn);
  
  // Register ETL agent
  const etlAgent = await registry.registerAgent({
    urn: 'urn:agent:data:etl-agent@1.0.0',
    name: 'etl-agent',
    version: '1.0.0',
    description: 'ETL processing agent',
    capabilities: {
      'etl': {
        type: 'service',
        description: 'ETL processing',
        version: '1.0.0'
      }
    },
    endpoints: {
      api: '/api/v1',
      health: '/health'
    }
  });
  
  console.log('ETL agent registered:', etlAgent.urn);
  
  return registry;
}

registerAgents().catch(console.error);
```

### Step 2: Discover Agents

Use the discovery service to find agents:

```javascript
// examples/discover-agents.js
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';

async function discoverAgents() {
  const discovery = createAgentDiscoveryService({
    enableLogging: true,
    enableCaching: true,
    maxResults: 50
  });
  
  await discovery.initialize();
  
  // Discover all AI agents
  const aiAgents = await discovery.discoverByDomain('ai', {
    includeHealth: true,
    sort: { field: 'name', order: 'asc' }
  });
  
  console.log(`Found ${aiAgents.total} AI agents`);
  aiAgents.agents.forEach(agent => {
    console.log(`- ${agent.name} (${agent.urn})`);
    if (agent.health) {
      console.log(`  Health: ${agent.health.status}`);
    }
  });
  
  // Discover agents with specific capability
  const mlAgents = await discovery.discoverByCapability('ml-inference', {
    limit: 10
  });
  
  console.log(`Found ${mlAgents.total} ML inference agents`);
  
  // Search by name
  const namedAgents = await discovery.searchByName('ml-agent', {
    limit: 5
  });
  
  console.log(`Found ${namedAgents.total} agents matching 'ml-agent'`);
  
  return discovery;
}

discoverAgents().catch(console.error);
```

### Step 3: Advanced Discovery Queries

Use complex queries for advanced discovery:

```javascript
// examples/advanced-discovery.js
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';

async function advancedDiscovery() {
  const discovery = createAgentDiscoveryService({
    enableLogging: true,
    enableCaching: true
  });
  
  await discovery.initialize();
  
  // Complex discovery query
  const query = {
    domain: 'ai',
    capabilities: ['ml-inference', 'data-processing'],
    version: '1.0.0',
    name: 'ml-agent',
    sort: {
      field: 'name',
      order: 'asc'
    },
    limit: 10,
    offset: 0,
    includeHealth: true
  };
  
  const result = await discovery.discoverAgents(query);
  
  console.log(`Found ${result.returned} agents matching criteria`);
  console.log(`Execution time: ${result.executionTime}ms`);
  
  result.agents.forEach(agent => {
    console.log(`- ${agent.name} (${agent.urn})`);
    console.log(`  Capabilities: ${Object.keys(agent.capabilities).join(', ')}`);
    if (agent.health) {
      console.log(`  Health: ${agent.health.status}`);
    }
  });
  
  return result;
}

advancedDiscovery().catch(console.error);
```

## A2A Communication

### Step 1: Basic A2A Request

Make a simple agent-to-agent request:

```javascript
// examples/basic-a2a-request.js
import { createA2AClient } from '../app/runtime/a2a-client.js';

async function basicA2ARequest() {
  const client = createA2AClient({
    baseUrl: 'http://localhost:3000',
    enableLogging: true,
    timeout: 10000,
    maxRetries: 3
  });
  
  try {
    const response = await client.request(
      'urn:agent:ai:ml-agent@1.0.0',
      '/api/inference',
      {
        method: 'POST',
        body: {
          input: 'test data',
          model: 'gpt-3.5-turbo'
        },
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );
    
    console.log('A2A request successful');
    console.log('Status:', response.status);
    console.log('Response:', response.data);
    
    return response;
  } catch (error) {
    console.error('A2A request failed:', error.message);
    throw error;
  }
}

basicA2ARequest().catch(console.error);
```

### Step 2: A2A with Authentication

Use A2A client with authentication:

```javascript
// examples/a2a-with-auth.js
import { createA2AClient } from '../app/runtime/a2a-client.js';

// Mock auth provider
const authProvider = {
  async getToken() {
    return 'bearer-token-123';
  }
};

async function a2AWithAuth() {
  const client = createA2AClient({
    authProvider,
    baseUrl: 'http://localhost:3000',
    enableLogging: true
  });
  
  try {
    const response = await client.request(
      'urn:agent:ai:ml-agent@1.0.0',
      '/api/secure-inference',
      {
        method: 'POST',
        body: {
          input: 'sensitive data',
          model: 'gpt-4'
        },
        context: {
          delegationUrn: 'urn:agent:user:delegator@1.0.0'
        }
      }
    );
    
    console.log('Authenticated A2A request successful');
    console.log('Response:', response.data);
    
    return response;
  } catch (error) {
    console.error('Authenticated A2A request failed:', error.message);
    throw error;
  }
}

a2AWithAuth().catch(console.error);
```

### Step 3: A2A with Circuit Breaker

Use A2A client with circuit breaker protection:

```javascript
// examples/a2a-with-circuit-breaker.js
import { createA2AClient } from '../app/runtime/a2a-client.js';

async function a2AWithCircuitBreaker() {
  const client = createA2AClient({
    baseUrl: 'http://localhost:3000',
    enableLogging: true,
    circuitBreakerThreshold: 3,
    circuitBreakerSuccessThreshold: 2,
    circuitBreakerTimeout: 30000
  });
  
  // Check circuit breaker status
  const status = client.circuitBreaker.getStatus();
  console.log('Circuit breaker status:', status.state);
  console.log('Can execute:', status.canExecute);
  
  try {
    const response = await client.request(
      'urn:agent:ai:ml-agent@1.0.0',
      '/api/inference',
      {
        method: 'POST',
        body: {
          input: 'test data'
        }
      }
    );
    
    console.log('A2A request successful with circuit breaker');
    console.log('Response:', response.data);
    
    return response;
  } catch (error) {
    console.error('A2A request failed:', error.message);
    
    // Check circuit breaker status after failure
    const newStatus = client.circuitBreaker.getStatus();
    console.log('Circuit breaker status after failure:', newStatus.state);
    
    throw error;
  }
}

a2AWithCircuitBreaker().catch(console.error);
```

## MCP Tool Execution

> **Sprint 21 Note:** The runtime MCP server only exposes discovery tooling.  
> `agent_run` and `workflow_run` respond with `501` guidance payloads that direct
> operators to the discovery workflow. See
> `docs/SPRINT_21_SURFACE_CHANGES.md#runtime-surface-triage` for more detail.

### Step 1: Basic MCP Connection

Connect to an MCP server and list tools:

```javascript
// examples/basic-mcp-connection.js
import { createMCPClient } from '../app/runtime/mcp-client.js';

async function basicMCPConnection() {
  const client = createMCPClient({
    endpoint: 'npx @modelcontextprotocol/server-filesystem',
    enableLogging: true,
    timeout: 15000
  });
  
  try {
    // Open connection
    await client.open();
    console.log('MCP connection established');
    
    // Get connection state
    const state = client.getState();
    console.log('Server name:', state.serverName);
    console.log('Server version:', state.serverVersion);
    console.log('Capabilities:', state.capabilities);
    
    // List available tools
    const tools = await client.listTools();
    console.log(`Found ${tools.length} tools:`);
    tools.forEach(tool => {
      console.log(`- ${tool.name}: ${tool.description}`);
    });
    
    return client;
  } catch (error) {
    console.error('MCP connection failed:', error.message);
    throw error;
  }
}

basicMCPConnection().catch(console.error);
```

### Step 2: Execute MCP Tools

Execute tools with the MCP client:

```javascript
// examples/execute-mcp-tools.js
import { createMCPClient } from '../app/runtime/mcp-client.js';

async function executeMCPTools() {
  const client = createMCPClient({
    endpoint: 'npx @modelcontextprotocol/server-filesystem',
    enableLogging: true
  });
  
  try {
    await client.open();
    
    // Get tool schema
    const schema = await client.getToolSchema('read_file');
    console.log('Tool schema:', schema);
    
    // Execute tool
    const result = await client.executeTool('read_file', {
      path: '/path/to/file.txt'
    }, {
      timeout: 5000
    });
    
    console.log('Tool execution successful');
    console.log('Result:', result);
    
    // Execute another tool
    const listResult = await client.executeTool('list_directory', {
      path: '/path/to/directory'
    });
    
    console.log('Directory listing:', listResult);
    
    return result;
  } catch (error) {
    console.error('MCP tool execution failed:', error.message);
    throw error;
  } finally {
    await client.close();
  }
}

executeMCPTools().catch(console.error);
```

### Step 3: MCP with Error Handling

Use MCP client with comprehensive error handling:

```javascript
// examples/mcp-with-error-handling.js
import { createMCPClient } from '../app/runtime/mcp-client.js';
import { MCPConnectionError, MCPToolError, MCPTimeoutError } from '../app/runtime/mcp-types.js';

async function mcpWithErrorHandling() {
  const client = createMCPClient({
    endpoint: 'npx @modelcontextprotocol/server-filesystem',
    enableLogging: true,
    timeout: 10000,
    maxRetries: 3
  });
  
  try {
    await client.open();
    
    // Execute tool with error handling
    try {
      const result = await client.executeTool('read_file', {
        path: '/nonexistent/file.txt'
      }, {
        timeout: 5000
      });
      
      console.log('Tool execution successful:', result);
    } catch (error) {
      if (error instanceof MCPToolError) {
        console.error('Tool execution failed:', error.message);
        console.error('Tool name:', error.toolName);
      } else if (error instanceof MCPTimeoutError) {
        console.error('Tool execution timed out:', error.message);
        console.error('Timeout:', error.timeout);
      } else {
        console.error('Unexpected error:', error.message);
      }
    }
    
    return client;
  } catch (error) {
    if (error instanceof MCPConnectionError) {
      console.error('MCP connection failed:', error.message);
      console.error('Endpoint:', error.endpoint);
    } else {
      console.error('Unexpected connection error:', error.message);
    }
    throw error;
  }
}

mcpWithErrorHandling().catch(console.error);
```

## Error Handling Patterns

### Step 1: Centralized Error Handling

Use the centralized error handler:

```javascript
// examples/centralized-error-handling.js
import { ErrorHandler, handleError } from '../app/runtime/error-handler.js';
import { A2AError, MCPError, URNError } from '../app/runtime/a2a-types.js';

async function centralizedErrorHandling() {
  const errorHandler = new ErrorHandler({
    enableLogging: true,
    enableMetrics: true
  });
  
  try {
    // Simulate an operation that might fail
    await someOperation();
  } catch (error) {
    // Handle error with centralized handler
    const typedError = errorHandler.handleError(error, {
      operation: 'agent-request',
      agentUrn: 'urn:agent:ai:ml-agent@1.0.0',
      requestId: 'req-123',
      correlationId: 'corr-456'
    });
    
    // Check error type and handle accordingly
    if (errorHandler.isRetryable(typedError)) {
      console.log('Error is retryable, implementing retry logic');
      // Implement retry logic
    } else if (errorHandler.isFatal(typedError)) {
      console.log('Error is fatal, stopping operation');
      // Handle fatal error
    }
    
    // Log error details
    console.error('Error details:', {
      type: typedError.constructor.name,
      message: typedError.message,
      context: typedError.context
    });
  }
}

async function someOperation() {
  // Simulate operation that might fail
  throw new Error('Simulated operation failure');
}

centralizedErrorHandling().catch(console.error);
```

### Step 2: Error Context Creation

Create rich error context:

```javascript
// examples/error-context-creation.js
import { ErrorContext } from '../app/runtime/error-handler.js';

async function errorContextCreation() {
  try {
    await someOperation();
  } catch (error) {
    // Create rich error context
    const requestContext = ErrorContext.createRequestContext('req-123', 'POST', '/api/test');
    const operationContext = ErrorContext.createOperationContext('register', 'Registry');
    const agentContext = ErrorContext.createAgentContext('urn:agent:ai:ml-agent@1.0.0', 'execute');
    
    const richContext = {
      ...requestContext,
      ...operationContext,
      ...agentContext,
      timestamp: new Date().toISOString(),
      environment: 'development'
    };
    
    console.error('Error with rich context:', {
      error: error.message,
      context: richContext
    });
  }
}

async function someOperation() {
  throw new Error('Operation failed');
}

errorContextCreation().catch(console.error);
```

### Step 3: Error Mapping

Map different error types:

```javascript
// examples/error-mapping.js
import { ErrorMappers } from '../app/runtime/error-handler.js';

async function errorMapping() {
  try {
    await someOperation();
  } catch (error) {
    // Map HTTP status to error
    const httpError = ErrorMappers.fromHttpStatus(500, 'Internal Server Error', {
      endpoint: '/api/test',
      method: 'POST'
    });
    
    // Map MCP error to typed error
    const mcpError = ErrorMappers.fromMCPError({
      message: 'Invalid request',
      code: -32600
    }, {
      toolName: 'read_file',
      operation: 'execute'
    });
    
    // Map fetch error to typed error
    const fetchError = ErrorMappers.fromFetchError(error, {
      url: 'https://api.example.com/test'
    });
    
    console.log('Mapped errors:', {
      http: httpError.constructor.name,
      mcp: mcpError.constructor.name,
      fetch: fetchError.constructor.name
    });
  }
}

async function someOperation() {
  throw new Error('Fetch failed');
}

errorMapping().catch(console.error);
```

## Performance Optimization

### Step 1: Caching Configuration

Configure caching for better performance:

```javascript
// examples/caching-configuration.js
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';

async function cachingConfiguration() {
  const discovery = createAgentDiscoveryService({
    enableCaching: true,
    cacheTtl: 300000, // 5 minutes
    maxResults: 100,
    enableLogging: true
  });
  
  await discovery.initialize();
  
  // First call - hits registry
  const start1 = Date.now();
  const result1 = await discovery.discoverAgents({ domain: 'ai' });
  const time1 = Date.now() - start1;
  
  // Second call - uses cache
  const start2 = Date.now();
  const result2 = await discovery.discoverAgents({ domain: 'ai' });
  const time2 = Date.now() - start2;
  
  console.log(`First call: ${time1}ms, Second call: ${time2}ms`);
  console.log(`Cache hit: ${time2 < time1}`);
  console.log(`Performance improvement: ${((time1 - time2) / time1 * 100).toFixed(1)}%`);
  
  // Get cache statistics
  const stats = discovery.getStats();
  console.log('Cache statistics:', {
    cacheSize: stats.cacheSize,
    cacheHitRate: stats.cacheHitRate
  });
  
  return discovery;
}

cachingConfiguration().catch(console.error);
```

### Step 2: Connection Pooling

Use connection pooling for MCP clients:

```javascript
// examples/connection-pooling.js
import { createMCPClient } from '../app/runtime/mcp-client.js';

class MCPClientPool {
  constructor(options) {
    this.options = options;
    this.clients = new Map();
    this.maxClients = options.maxClients || 5;
  }
  
  async getClient(endpoint) {
    if (this.clients.has(endpoint)) {
      const client = this.clients.get(endpoint);
      if (client.isConnected()) {
        return client;
      }
    }
    
    if (this.clients.size >= this.maxClients) {
      // Remove oldest client
      const oldestEndpoint = this.clients.keys().next().value;
      const oldestClient = this.clients.get(oldestEndpoint);
      await oldestClient.close();
      this.clients.delete(oldestEndpoint);
    }
    
    const client = createMCPClient({
      endpoint,
      ...this.options
    });
    
    await client.open();
    this.clients.set(endpoint, client);
    
    return client;
  }
  
  async closeAll() {
    for (const [endpoint, client] of this.clients) {
      await client.close();
    }
    this.clients.clear();
  }
}

async function connectionPooling() {
  const pool = new MCPClientPool({
    maxClients: 3,
    enableLogging: true
  });
  
  try {
    // Use pooled clients
    const client1 = await pool.getClient('npx @modelcontextprotocol/server-filesystem');
    const tools1 = await client1.listTools();
    console.log(`Client 1: ${tools1.length} tools`);
    
    const client2 = await pool.getClient('npx @modelcontextprotocol/server-filesystem');
    const tools2 = await client2.listTools();
    console.log(`Client 2: ${tools2.length} tools`);
    
    // Verify same client instance
    console.log('Same client instance:', client1 === client2);
    
    return pool;
  } finally {
    await pool.closeAll();
  }
}

connectionPooling().catch(console.error);
```

### Step 3: Performance Monitoring

Monitor performance metrics:

```javascript
// examples/performance-monitoring.js
import { createA2AClient } from '../app/runtime/a2a-client.js';
import { createMCPClient } from '../app/runtime/mcp-client.js';

async function performanceMonitoring() {
  const a2aClient = createA2AClient({
    enableMetrics: true,
    enableLogging: true
  });
  
  const mcpClient = createMCPClient({
    endpoint: 'npx @modelcontextprotocol/server-filesystem',
    enableMetrics: true,
    enableLogging: true
  });
  
  // Monitor A2A performance
  const a2aStart = Date.now();
  try {
    const a2aResponse = await a2aClient.request(
      'urn:agent:ai:ml-agent@1.0.0',
      '/api/inference',
      { method: 'POST', body: { input: 'test' } }
    );
    const a2aDuration = Date.now() - a2aStart;
    console.log(`A2A request completed in ${a2aDuration}ms`);
  } catch (error) {
    const a2aDuration = Date.now() - a2aStart;
    console.log(`A2A request failed after ${a2aDuration}ms`);
  }
  
  // Monitor MCP performance
  const mcpStart = Date.now();
  try {
    await mcpClient.open();
    const tools = await mcpClient.listTools();
    const mcpDuration = Date.now() - mcpStart;
    console.log(`MCP operation completed in ${mcpDuration}ms`);
    console.log(`Found ${tools.length} tools`);
  } catch (error) {
    const mcpDuration = Date.now() - mcpStart;
    console.log(`MCP operation failed after ${mcpDuration}ms`);
  } finally {
    await mcpClient.close();
  }
  
  // Get circuit breaker metrics
  const circuitBreakerMetrics = a2aClient.circuitBreaker.metrics.getSummary();
  console.log('Circuit breaker metrics:', circuitBreakerMetrics);
  
  // Get retry policy metrics
  const retryMetrics = a2aClient.retryPolicy.metrics.getSummary();
  console.log('Retry policy metrics:', retryMetrics);
}

performanceMonitoring().catch(console.error);
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Agent Discovery Failures

**Problem**: Agents not found during discovery.

**Solution**:
```javascript
// examples/troubleshoot-discovery.js
import { createAgentDiscoveryService } from '../app/runtime/agent-discovery-service.js';

async function troubleshootDiscovery() {
  const discovery = createAgentDiscoveryService({
    enableLogging: true
  });
  
  try {
    await discovery.initialize();
    
    // Check registry health
    const health = discovery.getHealth();
    console.log('Registry health:', health);
    
    // Check registry statistics
    const stats = discovery.getStats();
    console.log('Registry statistics:', stats);
    
    // Try different discovery queries
    const allAgents = await discovery.discoverAgents({});
    console.log(`Total agents in registry: ${allAgents.total}`);
    
    if (allAgents.total === 0) {
      console.log('No agents found. Register some agents first.');
      return;
    }
    
    // List all domains
    const domains = Object.keys(stats.domainStats);
    console.log('Available domains:', domains);
    
    // Try domain-specific discovery
    for (const domain of domains) {
      const domainAgents = await discovery.discoverByDomain(domain);
      console.log(`${domain}: ${domainAgents.total} agents`);
    }
    
  } catch (error) {
    console.error('Discovery troubleshooting failed:', error.message);
  }
}

troubleshootDiscovery().catch(console.error);
```

#### 2. A2A Communication Failures

**Problem**: A2A requests failing or timing out.

**Solution**:
```javascript
// examples/troubleshoot-a2a.js
import { createA2AClient } from '../app/runtime/a2a-client.js';

async function troubleshootA2A() {
  const client = createA2AClient({
    enableLogging: true,
    timeout: 5000,
    maxRetries: 1
  });
  
  try {
    // Check circuit breaker status
    const circuitStatus = client.circuitBreaker.getStatus();
    console.log('Circuit breaker status:', circuitStatus);
    
    if (!circuitStatus.canExecute) {
      console.log('Circuit breaker is open. Waiting for recovery...');
      return;
    }
    
    // Try simple request
    const response = await client.request(
      'urn:agent:ai:ml-agent@1.0.0',
      '/health',
      { method: 'GET', timeout: 2000 }
    );
    
    console.log('Health check successful:', response.status);
    
  } catch (error) {
    console.error('A2A troubleshooting failed:', error.message);
    
    // Check circuit breaker status after failure
    const circuitStatus = client.circuitBreaker.getStatus();
    console.log('Circuit breaker status after failure:', circuitStatus);
    
    // Check retry policy status
    const retryStatus = client.retryPolicy.getStatus();
    console.log('Retry policy status:', retryStatus);
  }
}

troubleshootA2A().catch(console.error);
```

#### 3. MCP Connection Issues

**Problem**: MCP client unable to connect or execute tools.

**Solution**:
```javascript
// examples/troubleshoot-mcp.js
import { createMCPClient } from '../app/runtime/mcp-client.js';

async function troubleshootMCP() {
  const client = createMCPClient({
    endpoint: 'npx @modelcontextprotocol/server-filesystem',
    enableLogging: true,
    timeout: 10000
  });
  
  try {
    // Check if MCP server is available
    console.log('Attempting to connect to MCP server...');
    await client.open();
    
    // Check connection state
    const state = client.getState();
    console.log('Connection state:', state);
    
    if (!state.connected) {
      console.log('Not connected to MCP server');
      return;
    }
    
    if (!state.initialized) {
      console.log('MCP connection not initialized');
      return;
    }
    
    // List available tools
    const tools = await client.listTools();
    console.log(`Available tools: ${tools.length}`);
    
    if (tools.length === 0) {
      console.log('No tools available from MCP server');
      return;
    }
    
    // Test tool execution
    const firstTool = tools[0];
    console.log(`Testing tool: ${firstTool.name}`);
    
    try {
      const result = await client.executeTool(firstTool.name, {});
      console.log('Tool execution successful:', result);
    } catch (error) {
      console.error('Tool execution failed:', error.message);
    }
    
  } catch (error) {
    console.error('MCP troubleshooting failed:', error.message);
    
    // Check connection state
    const state = client.getState();
    console.log('Final connection state:', state);
  } finally {
    await client.close();
  }
}

troubleshootMCP().catch(console.error);
```

### Debug Mode

Enable debug mode for detailed troubleshooting:

```javascript
// examples/debug-mode.js
import { createStructuredLogger, LOG_LEVELS } from '../app/runtime/structured-logger.js';

async function debugMode() {
  // Create debug logger
  const logger = createStructuredLogger({
    level: LOG_LEVELS.DEBUG,
    enableConsole: true,
    enableTracing: true
  });
  
  // Start debug trace
  const traceId = logger.startTrace('debug-operation', {
    component: 'DebugMode',
    operation: 'troubleshoot'
  });
  
  try {
    // Your operations here
    logger.debug('Debug operation started');
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 100));
    
    logger.debug('Debug operation completed');
    logger.completeTrace(traceId, 'completed', { result: 'success' });
    
  } catch (error) {
    logger.error('Debug operation failed', { error: error.message });
    logger.completeTrace(traceId, 'failed', { error: error.message });
  }
  
  // Get active traces
  const activeTraces = logger.getActiveTraces();
  console.log(`Active traces: ${activeTraces.length}`);
}

debugMode().catch(console.error);
```

### Performance Debugging

Debug performance issues:

```javascript
// examples/performance-debugging.js
import { performance } from 'perf_hooks';

async function performanceDebugging() {
  const startTime = performance.now();
  
  // Measure discovery performance
  const discoveryStart = performance.now();
  const discovery = createAgentDiscoveryService({ enableLogging: true });
  await discovery.initialize();
  const discoveryResult = await discovery.discoverAgents({ domain: 'ai' });
  const discoveryTime = performance.now() - discoveryStart;
  
  console.log(`Discovery took ${discoveryTime.toFixed(2)}ms`);
  console.log(`Found ${discoveryResult.total} agents`);
  
  // Measure A2A performance
  const a2aStart = performance.now();
  const a2aClient = createA2AClient({ enableLogging: true });
  try {
    const a2aResponse = await a2aClient.request(
      'urn:agent:ai:ml-agent@1.0.0',
      '/health',
      { method: 'GET', timeout: 2000 }
    );
    const a2aTime = performance.now() - a2aStart;
    console.log(`A2A request took ${a2aTime.toFixed(2)}ms`);
  } catch (error) {
    const a2aTime = performance.now() - a2aStart;
    console.log(`A2A request failed after ${a2aTime.toFixed(2)}ms`);
  }
  
  // Measure MCP performance
  const mcpStart = performance.now();
  const mcpClient = createMCPClient({
    endpoint: 'npx @modelcontextprotocol/server-filesystem',
    enableLogging: true
  });
  try {
    await mcpClient.open();
    const tools = await mcpClient.listTools();
    const mcpTime = performance.now() - mcpStart;
    console.log(`MCP operation took ${mcpTime.toFixed(2)}ms`);
    console.log(`Found ${tools.length} tools`);
  } catch (error) {
    const mcpTime = performance.now() - mcpStart;
    console.log(`MCP operation failed after ${mcpTime.toFixed(2)}ms`);
  } finally {
    await mcpClient.close();
  }
  
  const totalTime = performance.now() - startTime;
  console.log(`Total operation took ${totalTime.toFixed(2)}ms`);
}

performanceDebugging().catch(console.error);
```

## Best Practices Summary

### 1. Initialization
- Always initialize services before use
- Use proper error handling during initialization
- Check service health after initialization

### 2. Error Handling
- Use centralized error handling
- Provide rich error context
- Implement appropriate retry logic
- Monitor circuit breaker states

### 3. Performance
- Enable caching for frequently accessed data
- Use connection pooling for external services
- Monitor performance metrics
- Set appropriate timeouts

### 4. Logging
- Use structured logging with correlation IDs
- Enable request tracing for complex operations
- Use appropriate log levels
- Include relevant context in log messages

### 5. Security
- Validate all inputs and URNs
- Use authentication providers for A2A communication
- Implement rate limiting for API endpoints
- Sanitize error messages

### 6. Monitoring
- Enable metrics collection for all components
- Monitor circuit breaker states and failure rates
- Track retry policy effectiveness
- Set up alerts for critical errors

This usage guide provides comprehensive examples for common runtime integration scenarios. For more advanced use cases, refer to the API reference documentation.
