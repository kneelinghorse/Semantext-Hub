# Runtime Integration Components

This directory contains production-ready runtime components for agent-to-agent communication, MCP client integration, and agent discovery infrastructure.

## Components Overview

### Agent-to-Agent (A2A) Communication
- **`a2a-client.js`** - HTTP client for agent-to-agent communication
- **`a2a-auth.js`** - Authentication providers and delegation support
- **`a2a-types.js`** - Type definitions and error classes

### Model Context Protocol (MCP) Integration
- **`mcp-client.js`** - MCP client with connection lifecycle management
- **`mcp-types.js`** - MCP type definitions and error classes

### Agent Discovery Infrastructure
- **`acm-generator.js`** - Agent Capability Manifest (ACM) generator
- **`acm-types.js`** - ACM type definitions and error classes
- **`urn-resolver.js`** - URN resolver for agent discovery
- **`urn-types.js`** - URN type definitions and error classes
- **`well-known-server.js`** - Well-known HTTP server for agent discovery
- **`well-known-types.js`** - Well-known server type definitions and error classes
- **`urn-registry.js`** - URN registry with persistent storage and indexing
- **`agent-discovery-service.js`** - Advanced agent discovery with complex querying
- **`registry-api.js`** - RESTful API server for registry and discovery operations

## Agent Capability Manifest (ACM) Usage

### Creating ACM Manifests

```javascript
import { createACMGenerator, createACM } from './acm-generator.js';

// Using the generator class
const generator = createACMGenerator({
  enableLogging: true,
  validateSchema: true
});

const agentConfig = {
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
};

const manifest = await generator.createACM(agentConfig);
```

### Validating ACM Manifests

```javascript
import { validateACM } from './acm-generator.js';

const isValid = await validateACM(manifest);
if (isValid) {
  console.log('ACM manifest is valid');
} else {
  console.log('ACM manifest validation failed');
}
```

### ACM Manifest Schema

```javascript
{
  "apiVersion": "acm.ossp-agi.io/v1",
  "kind": "AgentCapabilityManifest",
  "metadata": {
    "urn": "urn:agent:domain:name@version",
    "name": "agent-name",
    "version": "1.0.0",
    "description": "Agent description",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "generator": "Semantext-Hub-ACM-Generator",
    "generatorVersion": "1.0.0"
  },
  "spec": {
    "capabilities": {
      "capability-name": {
        "type": "service|client|tool",
        "description": "Capability description",
        "version": "1.0.0"
      }
    },
    "endpoints": {
      "api": "/api/v1",
      "health": "/health"
    },
    "auth": null,
    "health": {
      "status": "healthy",
      "lastChecked": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

## URN Resolution and Agent Discovery

### Resolving Agent URNs

```javascript
import { createURNResolver, resolveAgentUrn } from './urn-resolver.js';

// Using the resolver class
const resolver = createURNResolver({
  enableLogging: true,
  cacheTtl: 300000, // 5 minutes
  maxRetries: 3
});

const result = await resolver.resolveAgentUrn('urn:agent:ai:ml-agent@1.0.0');
console.log('Agent metadata:', result.metadata);
console.log('Capabilities:', result.capabilities);
console.log('Cached:', result.cached);
```

### Discovering Capabilities by Domain

```javascript
import { discoverCapabilities } from './urn-resolver.js';

const agents = await discoverCapabilities('ai');
console.log(`Found ${agents.length} agents in AI domain:`);
agents.forEach(agent => {
  console.log(`- ${agent.name} (${agent.urn})`);
});
```

### URN Format

Agent URNs follow the format: `urn:agent:domain:name[@version]`

- **domain**: Agent domain (e.g., `ai`, `data`, `api`)
- **name**: Agent name (e.g., `ml-agent`, `etl-agent`)
- **version**: Optional version (e.g., `1.0.0`, `2.1.0`)

Examples:
- `urn:agent:ai:ml-agent@1.0.0`
- `urn:agent:data:etl-agent@2.1.0`
- `urn:agent:api:gateway-agent` (no version = latest)

### Cache Management

```javascript
const resolver = createURNResolver({ cacheTtl: 300000 });

// Clear cache for specific URN
resolver.clearCache('urn:agent:ai:ml-agent@1.0.0');

// Clear all cache
resolver.clearCache();

// Get cache statistics
const stats = resolver.getCacheStats();
console.log(`Cache size: ${stats.size} entries`);
console.log(`Oldest entry: ${stats.oldestEntry}`);
console.log(`Newest entry: ${stats.newestEntry}`);
```

## Well-Known Server for Agent Discovery

### Starting the Well-Known Server

```javascript
import { createWellKnownServer, startWellKnownServer } from './well-known-server.js';

// Start server with default configuration
const server = await startWellKnownServer({
  port: 3000,
  host: 'localhost',
  enableLogging: true
});

console.log('Server started on http://localhost:3000');
```

### Well-Known Endpoints

The server exposes the following endpoints:

#### `/.well-known/agent-capabilities`
Returns a list of available agents, optionally filtered by domain.

**Request:**
```http
GET /.well-known/agent-capabilities?domain=ai
```

**Response:**
```json
{
  "apiVersion": "well-known.ossp-agi.io/v1",
  "kind": "AgentCapabilityList",
  "metadata": {
    "domain": "ai",
    "count": 2,
    "generatedAt": "2024-01-01T00:00:00.000Z"
  },
  "items": [
    {
      "urn": "urn:agent:ai:ml-agent@1.0.0",
      "name": "ml-agent",
      "version": "1.0.0",
      "description": "Machine learning agent",
      "capabilities": { ... },
      "endpoints": { ... },
      "lastUpdated": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### `/.well-known/agent-capabilities/{urn}`
Returns the ACM manifest for a specific agent by URN.

**Request:**
```http
GET /.well-known/agent-capabilities/urn%3Aagent%3Aai%3Aml-agent%401.0.0
```

**Response:**
```json
{
  "apiVersion": "well-known.ossp-agi.io/v1",
  "kind": "AgentCapabilityManifest",
  "metadata": {
    "urn": "urn:agent:ai:ml-agent@1.0.0",
    "name": "ml-agent",
    "version": "1.0.0",
    "description": "Machine learning agent",
    "capabilities": { ... },
    "endpoints": { ... },
    "lastUpdated": "2024-01-01T00:00:00.000Z"
  },
  "spec": {
    "capabilities": { ... },
    "resolvedAt": "2024-01-01T00:00:00.000Z",
    "cached": false
  }
}
```

### CORS Configuration

```javascript
const server = createWellKnownServer({
  cors: {
    origin: 'https://example.com',
    methods: ['GET', 'OPTIONS'],
    headers: ['Content-Type', 'Authorization']
  }
});
```

### Server Lifecycle Management

```javascript
const server = createWellKnownServer();

// Start server
await server.start();
console.log('Server is running:', server.isRunning);

// Get server status
const status = server.getStatus();
console.log('Server status:', status);

// Stop server
await server.stop();
console.log('Server stopped');
```

## Discovery Patterns

### Pattern 1: Service Discovery
Discover available services in a specific domain:

```javascript
import { discoverCapabilities } from './urn-resolver.js';

async function discoverServices(domain) {
  const agents = await discoverCapabilities(domain);
  return agents.filter(agent => 
    Object.values(agent.capabilities).some(cap => cap.type === 'service')
  );
}

const aiServices = await discoverServices('ai');
console.log(`Found ${aiServices.length} AI services`);
```

### Pattern 2: Capability-Based Discovery
Find agents with specific capabilities:

```javascript
import { discoverCapabilities } from './urn-resolver.js';

async function findAgentsWithCapability(domain, capabilityName) {
  const agents = await discoverCapabilities(domain);
  return agents.filter(agent => 
    agent.capabilities.hasOwnProperty(capabilityName)
  );
}

const mlAgents = await findAgentsWithCapability('ai', 'ml-inference');
console.log(`Found ${mlAgents.length} ML inference agents`);
```

### Pattern 3: Version-Aware Discovery
Discover agents with specific version requirements:

```javascript
import { resolveAgentUrn } from './urn-resolver.js';

async function discoverLatestVersion(agentName, domain) {
  try {
    // Try to resolve without version (gets latest)
    const result = await resolveAgentUrn(`urn:agent:${domain}:${agentName}`);
    return result.metadata.version;
  } catch (error) {
    console.error(`Failed to discover ${agentName}:`, error.message);
    return null;
  }
}

const latestVersion = await discoverLatestVersion('ml-agent', 'ai');
console.log(`Latest ML agent version: ${latestVersion}`);
```

### Pattern 4: Health-Checked Discovery
Discover healthy agents only:

```javascript
import { discoverCapabilities } from './urn-resolver.js';

async function discoverHealthyAgents(domain) {
  const agents = await discoverCapabilities(domain);
  const healthyAgents = [];
  
  for (const agent of agents) {
    try {
      // Check health endpoint
      const response = await fetch(`${agent.endpoints.health}`);
      if (response.ok) {
        healthyAgents.push(agent);
      }
    } catch (error) {
      console.warn(`Agent ${agent.name} health check failed:`, error.message);
    }
  }
  
  return healthyAgents;
}

const healthyAgents = await discoverHealthyAgents('ai');
console.log(`Found ${healthyAgents.length} healthy agents`);
```

## Error Handling

All components provide structured error handling with specific error types:

### ACM Generator Errors
- `ACMError` - Base error class
- `ACMValidationError` - Validation failures
- `ACMSchemaError` - Schema validation failures

### URN Resolver Errors
- `URNError` - Base error class
- `URNResolutionError` - URN resolution failures
- `URNFormatError` - Invalid URN format

### Well-Known Server Errors
- `WellKnownError` - Base error class
- `WellKnownServerError` - Server operation failures
- `WellKnownValidationError` - Request validation failures

### Error Handling Example

```javascript
import { ACMValidationError, URNFormatError } from './acm-types.js';
import { URNResolutionError } from './urn-types.js';

try {
  const manifest = await createACM(agentConfig);
  const result = await resolveAgentUrn(manifest.metadata.urn);
} catch (error) {
  if (error instanceof ACMValidationError) {
    console.error('ACM validation failed:', error.message);
  } else if (error instanceof URNFormatError) {
    console.error('Invalid URN format:', error.message);
  } else if (error instanceof URNResolutionError) {
    console.error('URN resolution failed:', error.message);
  } else {
    console.error('Unexpected error:', error.message);
  }
}
```

## Logging

All components support structured logging:

```javascript
const generator = createACMGenerator({ enableLogging: true });
const resolver = createURNResolver({ enableLogging: true });
const server = createWellKnownServer({ enableLogging: true });
```

Log entries include:
- Timestamp
- Request ID for tracing
- Operation name
- Relevant context data

## Performance Considerations

### Caching
- URN resolution results are cached with configurable TTL
- Cache statistics are available for monitoring
- Cache can be cleared manually or automatically expires

### Retry Logic
- URN resolution includes exponential backoff retry
- Configurable retry attempts and delays
- Non-retryable errors (format errors) fail immediately

### Connection Pooling
- MCP client supports connection pooling
- A2A client supports connection reuse
- Well-known server handles concurrent requests

## Testing

Comprehensive test suites are available for all components:

```bash
# Run all runtime tests
npm test -- app/tests/runtime/

# Run specific component tests
npm test -- app/tests/runtime/acm-generator.test.js
npm test -- app/tests/runtime/urn-resolver.test.js
npm test -- app/tests/runtime/well-known-server.test.js
```

## Multi-Agent End-to-End (E2E) Validation

The runtime components support complete end-to-end validation of multi-agent execution workflows, proving the system works with real A2A/MCP operations.

### E2E Demo

See `app/examples/multi-agent-e2e-demo.js` for a complete demonstration of the multi-agent E2E workflow:

```javascript
import { MultiAgentE2EDemo } from './examples/multi-agent-e2e-demo.js';

const demo = new MultiAgentE2EDemo();
await demo.initialize();

// Run complete E2E validation
const summary = await demo.runDemo();

console.log('E2E Demo Results:', summary);
console.log('Total Duration:', summary.totalDuration);
console.log('Success:', summary.success);
console.log('Performance Metrics:', summary.performanceMetrics);

await demo.cleanup();
```

### E2E Workflow Steps

The E2E demo validates the complete runtime loop:

1. **Agent Discovery**: URN resolution with real agent metadata
2. **A2A Communication**: Agent-to-agent requests with error handling
3. **MCP Tool Execution**: Real tool execution with proper error handling
4. **End-to-End Flow**: Complete workflow validation
5. **Error Handling**: Circuit breakers and retry policies
6. **Performance**: End-to-end latency validation

### E2E Configuration

```javascript
const E2E_CONFIG = {
  registry: {
    dataDir: './data/demo-registry',
    enableLogging: true,
    maxAgents: 100
  },
  discovery: {
    enableLogging: true,
    maxResults: 50,
    enableCaching: true,
    cacheTtl: 300000 // 5 minutes
  },
  a2a: {
    enableLogging: true,
    timeout: 10000,
    retries: 3
  },
  mcp: {
    enableLogging: true,
    timeout: 15000,
    retries: 2
  },
  circuitBreaker: {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
    enableLogging: true
  },
  retryPolicy: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true
  },
  logger: {
    level: 'INFO',
    enableConsole: true,
    enableFile: false,
    enableTracing: true
  }
};
```

### E2E Performance Requirements

- **End-to-End Latency**: < 5 seconds for typical operations
- **Discovery Performance**: < 1 second for agent discovery
- **A2A Performance**: < 2 seconds for agent-to-agent communication
- **MCP Performance**: < 3 seconds for tool execution
- **Memory Usage**: < 100MB heap usage

### E2E Validation Scripts

#### Basic E2E Validation

```javascript
import { MultiAgentE2EDemo } from './examples/multi-agent-e2e-demo.js';

async function validateE2E() {
  const demo = new MultiAgentE2EDemo();
  
  try {
    await demo.initialize();
    
    // Step 1: Agent Discovery
    const discoveryResult = await demo.step1AgentDiscovery();
    console.log('Discovery:', discoveryResult.success ? 'PASS' : 'FAIL');
    
    // Step 2: A2A Communication
    const a2aResult = await demo.step2A2ACommunication();
    console.log('A2A:', a2aResult.success ? 'PASS' : 'FAIL');
    
    // Step 3: MCP Tool Execution
    const mcpResult = await demo.step3MCPToolExecution();
    console.log('MCP:', mcpResult.success ? 'PASS' : 'FAIL');
    
    // Step 4: End-to-End Validation
    const workflowResult = await demo.step4EndToEndValidation();
    console.log('Workflow:', workflowResult.success ? 'PASS' : 'FAIL');
    
    // Step 5: Error Handling Validation
    const errorResult = await demo.step5ErrorHandlingValidation();
    console.log('Error Handling:', errorResult.success ? 'PASS' : 'FAIL');
    
    // Step 6: Performance Validation
    const performanceResult = await demo.step6PerformanceValidation();
    console.log('Performance:', performanceResult.success ? 'PASS' : 'FAIL');
    
    return {
      discovery: discoveryResult.success,
      a2a: a2aResult.success,
      mcp: mcpResult.success,
      workflow: workflowResult.success,
      errorHandling: errorResult.success,
      performance: performanceResult.success
    };
    
  } finally {
    await demo.cleanup();
  }
}

// Run validation
const results = await validateE2E();
console.log('E2E Validation Results:', results);
```

#### Performance Benchmarking

```javascript
import { performance } from 'perf_hooks';
import { MultiAgentE2EDemo } from './examples/multi-agent-e2e-demo.js';

async function benchmarkE2E(iterations = 10) {
  const results = [];
  
  for (let i = 0; i < iterations; i++) {
    const demo = new MultiAgentE2EDemo();
    
    try {
      await demo.initialize();
      
      const startTime = performance.now();
      const summary = await demo.runDemo();
      const endTime = performance.now();
      
      results.push({
        iteration: i + 1,
        totalDuration: endTime - startTime,
        discoveryDuration: summary.performanceMetrics.discovery?.duration || 0,
        a2aDuration: summary.performanceMetrics.a2a?.duration || 0,
        mcpDuration: summary.performanceMetrics.mcp?.duration || 0,
        workflowDuration: summary.performanceMetrics.workflow?.duration || 0,
        success: summary.success
      });
      
    } finally {
      await demo.cleanup();
    }
  }
  
  // Calculate statistics
  const durations = results.map(r => r.totalDuration);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);
  const successRate = results.filter(r => r.success).length / results.length;
  
  return {
    iterations,
    avgDuration,
    minDuration,
    maxDuration,
    successRate,
    results
  };
}

// Run benchmark
const benchmark = await benchmarkE2E(5);
console.log('E2E Benchmark Results:', benchmark);
```

#### Error Resilience Testing

```javascript
import { MultiAgentE2EDemo } from './examples/multi-agent-e2e-demo.js';

async function testErrorResilience() {
  const demo = new MultiAgentE2EDemo();
  
  try {
    await demo.initialize();
    
    // Test circuit breaker resilience
    const circuitBreaker = demo.circuitBreaker;
    
    // Simulate failures to open circuit breaker
    for (let i = 0; i < 5; i++) {
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('Simulated failure');
        });
      } catch (error) {
        // Expected failure
      }
    }
    
    const circuitStatus = circuitBreaker.getStatus();
    console.log('Circuit Breaker State:', circuitStatus.state);
    console.log('Circuit Breaker Can Execute:', circuitStatus.canExecute);
    
    // Test retry policy resilience
    const retryPolicy = demo.retryPolicy;
    let attemptCount = 0;
    
    try {
      await retryPolicy.execute(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Simulated retry failure');
        }
        return 'success';
      });
    } catch (error) {
      // Expected failure
    }
    
    console.log('Retry Policy Attempts:', attemptCount);
    
    // Test error classification
    const testError = new Error('Test error');
    const typedError = handleError(testError, {
      operation: 'error-resilience-test'
    });
    
    console.log('Error Classification:', typedError.constructor.name);
    console.log('Error Context:', typedError.context);
    
    return {
      circuitBreakerOpen: circuitStatus.state === 'OPEN',
      retryAttempts: attemptCount,
      errorClassified: typedError instanceof Error
    };
    
  } finally {
    await demo.cleanup();
  }
}

// Run error resilience test
const resilience = await testErrorResilience();
console.log('Error Resilience Results:', resilience);
```

### E2E Integration Tests

Comprehensive integration tests are available in `app/tests/runtime/multi-agent-e2e.test.js`:

```bash
# Run E2E integration tests
npm test -- app/tests/runtime/multi-agent-e2e.test.js

# Run specific E2E test suites
npm test -- app/tests/runtime/multi-agent-e2e.test.js --testNamePattern="Agent Discovery Integration"
npm test -- app/tests/runtime/multi-agent-e2e.test.js --testNamePattern="A2A Communication Integration"
npm test -- app/tests/runtime/multi-agent-e2e.test.js --testNamePattern="MCP Tool Execution Integration"
npm test -- app/tests/runtime/multi-agent-e2e.test.js --testNamePattern="End-to-End Workflow Integration"
npm test -- app/tests/runtime/multi-agent-e2e.test.js --testNamePattern="Error Handling and Resilience Integration"
npm test -- app/tests/runtime/multi-agent-e2e.test.js --testNamePattern="Performance Validation Integration"
```

### E2E Monitoring and Observability

The E2E demo includes comprehensive monitoring and observability:

#### Structured Logging

```javascript
const logger = createStructuredLogger({
  level: 'INFO',
  enableConsole: true,
  enableFile: false,
  enableTracing: true
});

// Log with correlation ID
logger.info('E2E operation started', {
  correlationId: 'corr-123',
  requestId: 'req-456',
  component: 'MultiAgentE2EDemo',
  operation: 'runDemo'
});
```

#### Request Tracing

```javascript
const traceId = logger.startTrace('e2e-workflow', {
  correlationId: 'corr-123',
  component: 'MultiAgentE2EDemo'
});

try {
  const result = await demo.runDemo();
  logger.completeTrace(traceId, 'completed', { result: 'success' });
} catch (error) {
  logger.completeTrace(traceId, 'failed', { error: error.message });
}
```

#### Performance Metrics

```javascript
const summary = await demo.runDemo();

console.log('Performance Metrics:');
console.log('- Discovery Duration:', summary.performanceMetrics.discovery?.duration);
console.log('- A2A Duration:', summary.performanceMetrics.a2a?.duration);
console.log('- MCP Duration:', summary.performanceMetrics.mcp?.duration);
console.log('- Workflow Duration:', summary.performanceMetrics.workflow?.duration);
console.log('- Total Duration:', summary.totalDuration);
```

### E2E Troubleshooting

#### Common Issues and Solutions

1. **Agent Discovery Failures**
   - Verify agent registration in URN registry
   - Check agent endpoints and health status
   - Validate URN format and resolution

2. **A2A Communication Failures**
   - Check circuit breaker status and thresholds
   - Verify agent endpoints and network connectivity
   - Review retry policy configuration

3. **MCP Tool Execution Failures**
   - Verify MCP server connectivity
   - Check tool availability and parameters
   - Review MCP client configuration

4. **Performance Issues**
   - Monitor end-to-end latency
   - Check memory usage and garbage collection
   - Review circuit breaker and retry policy settings

5. **Error Handling Issues**
   - Verify error classification and context
   - Check structured logging configuration
   - Review correlation ID propagation

#### Debug Mode

Enable debug mode for detailed troubleshooting:

```javascript
const demo = new MultiAgentE2EDemo({
  logger: {
    level: 'DEBUG',
    enableConsole: true,
    enableFile: true,
    enableTracing: true
  }
});
```

## Examples

See `app/examples/agent-discovery-demo.js` for a complete demonstration of the agent discovery workflow.

See `app/examples/multi-agent-e2e-demo.js` for a complete demonstration of the multi-agent E2E workflow.

## Integration with Existing Components

The agent discovery infrastructure integrates seamlessly with:

- **A2A Client**: Use discovered agent endpoints for communication
- **MCP Client**: Discover MCP-enabled agents and their tools
- **Existing Services**: Extend current services with discovery capabilities

## URN Registry and Agent Discovery

### URN Registry Usage

The URN registry provides persistent storage for agent metadata and capabilities with URN indexing for fast lookups.

#### Registering Agents

```javascript
import { createURNRegistry, registerAgent } from './urn-registry.js';

// Using the registry class
const registry = createURNRegistry({
  dataDir: './data/registry',
  enableLogging: true,
  maxAgents: 1000
});

await registry.initialize();

const agentData = {
  urn: 'urn:agent:ai:ml-agent@1.0.0',
  name: 'ml-agent',
  version: '1.0.0',
  description: 'Machine learning inference agent',
  capabilities: {
    'ml-inference': {
      type: 'service',
      description: 'Machine learning model inference',
      version: '1.0.0'
    }
  },
  endpoints: {
    api: '/api/v1',
    health: '/health'
  }
};

const result = await registry.registerAgent(agentData);
console.log('Agent registered:', result.urn);
```

#### Retrieving Agents

```javascript
// Get agent by URN
const agent = await registry.getAgent('urn:agent:ai:ml-agent@1.0.0');
if (agent) {
  console.log('Found agent:', agent.name);
}

// List agents by domain
const aiAgents = await registry.listAgentsByDomain('ai');
console.log(`Found ${aiAgents.length} AI agents`);

// Search agents by capability
const mlAgents = await registry.searchAgentsByCapability('ml-inference');
console.log(`Found ${mlAgents.length} ML inference agents`);
```

#### Registry Statistics

```javascript
const stats = registry.getStats();
console.log(`Total agents: ${stats.totalAgents}`);
console.log(`Domains: ${stats.domains}`);
console.log(`Capabilities: ${stats.capabilities}`);

const health = registry.getHealth();
console.log('Registry status:', health.status);
```

### Agent Discovery Service Usage

The agent discovery service provides advanced querying capabilities with filtering, sorting, and pagination.

#### Basic Discovery

```javascript
import { createAgentDiscoveryService, discoverAgents } from './agent-discovery-service.js';

// Using the discovery service class
const discoveryService = createAgentDiscoveryService({
  enableLogging: true,
  maxResults: 100,
  enableCaching: true
});

await discoveryService.initialize();

// Discover all agents
const result = await discoveryService.discoverAgents();
console.log(`Found ${result.total} agents`);
```

#### Advanced Querying

```javascript
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

const result = await discoveryService.discoverAgents(query);
console.log(`Found ${result.returned} agents matching criteria`);
console.log(`Execution time: ${result.executionTime}ms`);
```

#### Convenience Methods

```javascript
// Discover by domain
const aiAgents = await discoveryService.discoverByDomain('ai');

// Discover by capability
const mlAgents = await discoveryService.discoverByCapability('ml-inference');

// Search by name
const namedAgents = await discoveryService.searchByName('ml-agent');
```

#### Discovery Statistics

```javascript
const stats = discoveryService.getStats();
console.log(`Cache size: ${stats.cacheSize}`);
console.log(`Cache hit rate: ${stats.cacheHitRate}%`);
console.log(`Service status: ${stats.serviceStatus}`);
```

### Registry API Server Usage

The registry API server provides RESTful endpoints for agent registry and discovery operations.

#### Starting the API Server

```javascript
import { createRegistryAPIServer, startRegistryAPIServer } from './registry-api.js';

// Using the server class
const server = createRegistryAPIServer({
  port: 3001,
  host: 'localhost',
  enableLogging: true,
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    headers: ['Content-Type', 'Authorization']
  },
  rateLimit: {
    windowMs: 60000, // 1 minute
    max: 100 // 100 requests per window
  }
});

await server.start();
console.log('Registry API server started');
```

#### API Endpoints

The server exposes the following endpoints:

- **`GET /api/v1/health`** - Health check
- **`GET /api/v1/stats`** - Registry and discovery statistics
- **`GET /api/v1/agents`** - List agents with pagination
- **`POST /api/v1/agents`** - Register new agent
- **`GET /api/v1/agents/{urn}`** - Get agent by URN
- **`GET /api/v1/agents/domain/{domain}`** - List agents by domain
- **`GET /api/v1/agents/capability/{capability}`** - List agents by capability
- **`GET /api/v1/discover`** - Advanced discovery with query parameters

#### Example API Usage

```javascript
// Health check
const healthResponse = await fetch('http://localhost:3001/api/v1/health');
const health = await healthResponse.json();
console.log('Server status:', health.status);

// Register agent
const registerResponse = await fetch('http://localhost:3001/api/v1/agents', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(agentData)
});
const registration = await registerResponse.json();
console.log('Agent registered:', registration.urn);

// Discover agents
const discoverResponse = await fetch('http://localhost:3001/api/v1/discover?domain=ai&limit=10');
const discovery = await discoverResponse.json();
console.log(`Found ${discovery.returned} agents`);
```

## Registry and Discovery Patterns

### Pattern 1: Service Registration and Discovery

Complete workflow for registering and discovering services:

```javascript
import { createURNRegistry } from './urn-registry.js';
import { createAgentDiscoveryService } from './agent-discovery-service.js';

async function serviceWorkflow() {
  // Initialize services
  const registry = createURNRegistry();
  const discovery = createAgentDiscoveryService();
  
  await registry.initialize();
  await discovery.initialize();

  // Register multiple services
  const services = [
    {
      urn: 'urn:agent:ai:ml-service@1.0.0',
      name: 'ml-service',
      version: '1.0.0',
      description: 'Machine learning service',
      capabilities: { 'ml-inference': { type: 'service', description: 'ML inference' } },
      endpoints: { api: '/api/v1', health: '/health' }
    },
    {
      urn: 'urn:agent:data:etl-service@1.0.0',
      name: 'etl-service',
      version: '1.0.0',
      description: 'ETL processing service',
      capabilities: { 'etl': { type: 'service', description: 'ETL processing' } },
      endpoints: { api: '/api/v1', health: '/health' }
    }
  ];

  // Register all services
  for (const service of services) {
    await registry.registerAgent(service);
    console.log(`Registered: ${service.name}`);
  }

  // Discover AI services
  const aiServices = await discovery.discoverByDomain('ai');
  console.log(`Found ${aiServices.total} AI services`);

  // Discover services with specific capability
  const mlServices = await discovery.discoverByCapability('ml-inference');
  console.log(`Found ${mlServices.total} ML inference services`);
}
```

### Pattern 2: Health-Checked Discovery

Discover and verify healthy agents:

```javascript
async function discoverHealthyAgents(domain) {
  const discovery = createAgentDiscoveryService();
  await discovery.initialize();

  // Discover with health checks
  const result = await discovery.discoverAgents({
    domain,
    includeHealth: true,
    limit: 50
  });

  // Filter healthy agents
  const healthyAgents = result.agents.filter(agent => 
    agent.health && agent.health.status === 'healthy'
  );

  console.log(`Found ${healthyAgents.length} healthy agents out of ${result.total}`);
  return healthyAgents;
}
```

### Pattern 3: Cached Discovery

Use caching for frequently accessed discovery results:

```javascript
async function cachedDiscovery() {
  const discovery = createAgentDiscoveryService({
    enableCaching: true,
    cacheTtl: 300000 // 5 minutes
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
}
```

### Pattern 4: API Integration

Integrate registry API with external services:

```javascript
class AgentClient {
  constructor(baseUrl = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
  }

  async registerAgent(agentData) {
    const response = await fetch(`${this.baseUrl}/api/v1/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(agentData)
    });
    
    if (!response.ok) {
      throw new Error(`Registration failed: ${response.statusText}`);
    }
    
    return response.json();
  }

  async discoverAgents(query = {}) {
    const params = new URLSearchParams(query);
    const response = await fetch(`${this.baseUrl}/api/v1/discover?${params}`);
    
    if (!response.ok) {
      throw new Error(`Discovery failed: ${response.statusText}`);
    }
    
    return response.json();
  }

  async getAgent(urn) {
    const encodedUrn = encodeURIComponent(urn);
    const response = await fetch(`${this.baseUrl}/api/v1/agents/${encodedUrn}`);
    
    if (response.status === 404) {
      return null;
    }
    
    if (!response.ok) {
      throw new Error(`Get agent failed: ${response.statusText}`);
    }
    
    return response.json();
  }
}

// Usage
const client = new AgentClient();
const agent = await client.getAgent('urn:agent:ai:ml-agent@1.0.0');
const discovery = await client.discoverAgents({ domain: 'ai', limit: 10 });
```

## Error Handling

All registry and discovery components provide structured error handling:

### Registry Errors
- `URNError` - Base error class
- `URNFormatError` - Invalid URN format
- `URNResolutionError` - Agent resolution failures

### Discovery Errors
- `URNError` - Base error class
- `URNValidationError` - Query validation failures

### API Errors
- `URNError` - Base error class
- `URNValidationError` - Request validation failures

### Error Handling Example

```javascript
import { URNFormatError, URNResolutionError } from './urn-types.js';

try {
  const registry = createURNRegistry();
  await registry.initialize();
  
  const result = await registry.registerAgent(agentData);
  console.log('Agent registered:', result.urn);
} catch (error) {
  if (error instanceof URNFormatError) {
    console.error('Invalid URN format:', error.message);
  } else if (error instanceof URNResolutionError) {
    console.error('Agent resolution failed:', error.message);
  } else {
    console.error('Unexpected error:', error.message);
  }
}
```

## Performance Considerations

### Registry Performance
- File-based persistence with configurable update intervals
- In-memory indexes for fast lookups
- Configurable maximum agent capacity
- Efficient URN parsing and validation

### Discovery Performance
- Configurable result caching with TTL
- Pagination support for large result sets
- Optimized filtering and sorting algorithms
- Health check batching and timeout handling

### API Performance
- Rate limiting with configurable windows
- CORS preflight optimization
- Request validation and early error handling
- Structured logging with request tracing

## Testing

Comprehensive test suites are available for all components:

```bash
# Run all runtime tests
npm test -- app/tests/runtime/

# Run specific component tests
npm test -- app/tests/runtime/urn-registry.test.js
npm test -- app/tests/runtime/agent-discovery-service.test.js
npm test -- app/tests/runtime/registry-api.test.js
```

## Error Handling and Resilience

The runtime components include comprehensive error handling and resilience patterns to ensure robust operation in distributed environments.

### Error Handler

The centralized error handler provides typed errors and structured error context:

```javascript
import { 
  ErrorHandler, 
  A2AError, 
  MCPError, 
  AuthError, 
  TimeoutError, 
  ValidationError,
  NetworkError,
  CircuitBreakerError,
  RetryError,
  handleError,
  ErrorMappers,
  ErrorContext
} from './error-handler.js';

// Create error handler
const errorHandler = new ErrorHandler({
  enableLogging: true,
  enableMetrics: true
});

// Handle errors with automatic typing
try {
  await someOperation();
} catch (error) {
  const typedError = errorHandler.handleError(error, {
    operation: 'agent-request',
    agentUrn: 'urn:agent:ai:ml-agent@1.0.0'
  });
  
  if (errorHandler.isRetryable(typedError)) {
    // Retry logic
  } else if (errorHandler.isFatal(typedError)) {
    // Fatal error handling
  }
}

// Convenience function
const typedError = handleError(error, { context: 'additional-info' });

// Error mapping utilities
const httpError = ErrorMappers.fromHttpStatus(500, 'Internal Server Error', { endpoint: 'api' });
const mcpError = ErrorMappers.fromMCPError({ message: 'Invalid request', code: -32600 });
const fetchError = ErrorMappers.fromFetchError(abortError, { url: 'https://api.example.com' });

// Context creation utilities
const requestContext = ErrorContext.createRequestContext('req-123', 'POST', '/api/test');
const operationContext = ErrorContext.createOperationContext('register', 'Registry');
const agentContext = ErrorContext.createAgentContext('urn:agent:ai:ml-agent@1.0.0', 'execute');
```

### Circuit Breaker

Circuit breaker pattern prevents cascading failures:

```javascript
import { 
  CircuitBreaker, 
  CircuitBreakerManager, 
  CIRCUIT_STATES,
  createCircuitBreaker,
  createCircuitBreakerManager,
  withCircuitBreaker
} from './circuit-breaker.js';

// Create circuit breaker
const circuitBreaker = createCircuitBreaker({
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 60000,
  enableLogging: true,
  enableMetrics: true
});

// Execute with circuit breaker protection
try {
  const result = await circuitBreaker.execute(async () => {
    return await externalServiceCall();
  });
} catch (error) {
  if (error instanceof CircuitBreakerError) {
    console.log('Circuit breaker is open, failing fast');
  } else {
    console.log('Service call failed:', error.message);
  }
}

// Check circuit breaker status
const status = circuitBreaker.getStatus();
console.log('Circuit state:', status.state);
console.log('Can execute:', status.canExecute);
console.log('Failure count:', status.failureCount);

// Get health status
const health = circuitBreaker.getHealth();
console.log('Health status:', health.status);
console.log('Failure rate:', health.failureRate);

// Circuit breaker manager for multiple services
const manager = createCircuitBreakerManager({
  failureThreshold: 3,
  timeout: 30000
});

// Execute with service-specific circuit breaker
const result = await manager.execute('api-service', async () => {
  return await apiCall();
});

// Get status of all circuit breakers
const allStatus = manager.getAllStatus();
const allHealth = manager.getAllHealth();

// Convenience function
const result = await withCircuitBreaker('service-name', async () => {
  return await serviceCall();
});
```

### Retry Policies

Shared retry policies with exponential backoff and jitter:

```javascript
import { 
  RetryPolicy, 
  RetryPolicyManager, 
  RETRY_POLICIES,
  PREDEFINED_POLICIES,
  createRetryPolicy,
  createRetryPolicyManager,
  withRetryPolicy,
  RetryUtils
} from './retry-policies.js';

// Create retry policy
const retryPolicy = createRetryPolicy({
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
  jitterFactor: 0.1,
  policy: RETRY_POLICIES.EXPONENTIAL_BACKOFF
});

// Execute with retry logic
try {
  const result = await retryPolicy.execute(async () => {
    return await unreliableOperation();
  });
} catch (error) {
  if (error instanceof RetryError) {
    console.log('All retries exhausted:', error.context.attempts);
  }
}

// Use predefined policies
const fastPolicy = createRetryPolicy(PREDEFINED_POLICIES.FAST);
const standardPolicy = createRetryPolicy(PREDEFINED_POLICIES.STANDARD);
const slowPolicy = createRetryPolicy(PREDEFINED_POLICIES.SLOW);

// Retry policy manager
const manager = createRetryPolicyManager({
  maxRetries: 3,
  baseDelay: 1000
});

// Execute with policy-specific retry logic
const result = await manager.execute('api-policy', async () => {
  return await apiCall();
});

// Convenience function
const result = await withRetryPolicy('standard', async () => {
  return await operation();
});

// Utility functions
const config = RetryUtils.fromPredefined('FAST', { maxRetries: 5 });
const totalTime = RetryUtils.calculateTotalRetryTime(3, config);
const delay = RetryUtils.calculateDelay(2, config);
const shouldRetry = RetryUtils.shouldRetry(error);
```

### Structured Logger

Structured logging with correlation IDs and request tracing:

```javascript
import { 
  StructuredLogger, 
  LoggerManager, 
  LOG_LEVELS,
  createStructuredLogger,
  createLoggerManager,
  defaultLogger,
  log,
  tracing,
  context
} from './structured-logger.js';

// Create structured logger
const logger = createStructuredLogger({
  level: LOG_LEVELS.INFO,
  enableConsole: true,
  enableFile: false,
  enableMetrics: true,
  enableTracing: true
});

// Log with context
logger.info('Operation completed', {
  correlationId: 'corr-123',
  requestId: 'req-456',
  component: 'A2AClient',
  operation: 'request',
  duration: 150,
  metadata: { agentUrn: 'urn:agent:ai:ml-agent@1.0.0' }
});

// Request tracing
const traceId = logger.startTrace('agent-request', {
  correlationId: 'corr-123',
  requestId: 'req-456',
  component: 'A2AClient'
});

try {
  const result = await agentRequest();
  logger.completeTrace(traceId, 'completed', { result: 'success' });
} catch (error) {
  logger.completeTrace(traceId, 'failed', { error: error.message });
}

// Get active traces
const activeTraces = logger.getActiveTraces();
console.log(`Active traces: ${activeTraces.length}`);

// Context creation
const correlationId = logger.createCorrelationId();
const requestId = logger.createRequestId();
const logContext = logger.createContext({
  component: 'A2AClient',
  operation: 'request'
});

// Logger manager for multiple loggers
const manager = createLoggerManager({
  level: LOG_LEVELS.INFO,
  enableConsole: true
});

const a2aLogger = manager.getLogger('a2a-client');
const mcpLogger = manager.getLogger('mcp-client');

a2aLogger.info('A2A request started');
mcpLogger.info('MCP connection established');

// Convenience functions
log.info('Using default logger');
log.error('Error occurred', { error: 'details' });

const traceId = tracing.start('operation');
tracing.complete(traceId, 'completed');

const correlationId = context.createCorrelationId();
const requestId = context.createRequestId();
const logContext = context.create({ component: 'Test' });
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Circuit Breaker Stuck in Open State

**Problem**: Circuit breaker remains open even after service recovery.

**Solution**:
```javascript
// Check circuit breaker status
const status = circuitBreaker.getStatus();
console.log('State:', status.state);
console.log('Next attempt time:', new Date(status.nextAttemptTime));

// Manually reset if needed
if (status.state === CIRCUIT_STATES.OPEN) {
  circuitBreaker.reset();
}

// Check recent failures
const recentFailures = circuitBreaker.getRecentFailures(5);
console.log('Recent failures:', recentFailures);
```

#### 2. Retry Policies Not Working

**Problem**: Retry policies not retrying failed operations.

**Solution**:
```javascript
// Check if error is retryable
const isRetryable = RetryUtils.shouldRetry(error);
console.log('Error is retryable:', isRetryable);

// Check retry policy configuration
const policy = retryPolicy.getStatus();
console.log('Max retries:', policy.config.maxRetries);
console.log('Base delay:', policy.config.baseDelay);

// Verify error classification
if (error instanceof AuthError || error instanceof ValidationError) {
  console.log('Error is not retryable');
}
```

#### 3. Logging Not Appearing

**Problem**: Log messages not appearing in console or files.

**Solution**:
```javascript
// Check log level
console.log('Current log level:', logger.getLevel());
console.log('Required level for INFO:', LOG_LEVELS.INFO);

// Set appropriate log level
logger.setLevel(LOG_LEVELS.DEBUG);

// Check logger configuration
const config = logger.config;
console.log('Console enabled:', config.enableConsole);
console.log('File enabled:', config.enableFile);

// Test logging
logger.info('Test message', { test: true });
```

#### 4. Error Context Missing

**Problem**: Error context not being captured properly.

**Solution**:
```javascript
// Ensure context is passed to error handler
const typedError = errorHandler.handleError(error, {
  operation: 'agent-request',
  agentUrn: 'urn:agent:ai:ml-agent@1.0.0',
  requestId: 'req-123',
  correlationId: 'corr-456'
});

// Check error details
const details = typedError.getDetails();
console.log('Error context:', details.context);

// Use error context utilities
const requestContext = ErrorContext.createRequestContext('req-123', 'POST', '/api/test');
const operationContext = ErrorContext.createOperationContext('register', 'Registry');
```

#### 5. Performance Issues

**Problem**: Circuit breaker or retry policies causing performance degradation.

**Solution**:
```javascript
// Check circuit breaker metrics
const metrics = circuitBreaker.metrics.getSummary();
console.log('Total requests:', metrics.totalRequests);
console.log('Failure rate:', metrics.failureRate);
console.log('Circuit opens:', metrics.circuitOpens);

// Check retry policy metrics
const retryMetrics = retryPolicy.metrics.getSummary();
console.log('Total attempts:', retryMetrics.totalAttempts);
console.log('Average retry time:', retryMetrics.averageRetryTime);

// Optimize configuration
const optimizedCircuitBreaker = createCircuitBreaker({
  failureThreshold: 3, // Reduce threshold
  timeout: 30000,      // Reduce timeout
  enableMetrics: false  // Disable metrics if not needed
});

const optimizedRetryPolicy = createRetryPolicy({
  maxRetries: 2,        // Reduce retries
  baseDelay: 500,       // Reduce base delay
  maxDelay: 5000,       // Reduce max delay
  enableMetrics: false  // Disable metrics if not needed
});
```

### Debugging Tips

1. **Enable Debug Logging**: Set log level to DEBUG or TRACE for detailed information
2. **Use Request Tracing**: Start traces for complex operations to track execution flow
3. **Monitor Metrics**: Check circuit breaker and retry policy metrics for performance insights
4. **Correlation IDs**: Use correlation IDs to track requests across multiple components
5. **Error Context**: Always provide rich context when handling errors

### Performance Considerations

- **Circuit Breaker Overhead**: Circuit breaker operations add <10ms overhead
- **Retry Policy Delays**: Exponential backoff can add significant delays for failed operations
- **Logging Impact**: Structured logging with metrics can impact performance in high-throughput scenarios
- **Memory Usage**: Error history and trace storage can consume memory over time

### Best Practices

1. **Error Classification**: Always classify errors as retryable or non-retryable
2. **Circuit Breaker Tuning**: Adjust thresholds based on service characteristics
3. **Retry Policy Selection**: Choose appropriate retry policies for different operation types
4. **Logging Levels**: Use appropriate log levels to balance detail and performance
5. **Context Propagation**: Always propagate correlation and request IDs across components

## Future Enhancements

Planned enhancements include:

- Distributed registry replication
- Advanced authentication and authorization
- Registry clustering and high availability
- Real-time agent status updates
- Advanced discovery protocols
- Service mesh integration
- Distributed tracing integration
- Advanced error aggregation and alerting
- Performance monitoring and metrics collection
