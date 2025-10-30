# Runtime Integration API Reference

This document provides comprehensive API documentation for all runtime integration components in the OSSP-AGI project.

## Table of Contents

- [A2A Client](#a2a-client)
- [MCP Client](#mcp-client)
- [Agent Discovery Service](#agent-discovery-service)
- [URN Registry](#urn-registry)
- [ACM Generator](#acm-generator)
- [Well-Known Server](#well-known-server)
- [Error Handler](#error-handler)
- [Circuit Breaker](#circuit-breaker)
- [Retry Policies](#retry-policies)
- [Structured Logger](#structured-logger)

## A2A Client

The A2A (Agent-to-Agent) client provides HTTP communication between agents with authentication, retry logic, and error handling.

### Class: A2AClient

#### Constructor

```javascript
new A2AClient(options)
```

**Parameters:**
- `options` (Object): Configuration options
  - `authProvider` (Object): Authentication provider
  - `baseUrl` (string): Base URL for requests (default: 'http://localhost:3000')
  - `timeout` (number): Request timeout in ms (default: 10000)
  - `maxRetries` (number): Maximum retry attempts (default: 3)
  - `retryDelay` (number): Base retry delay in ms (default: 1000)
  - `retryBackoff` (number): Retry backoff multiplier (default: 2)
  - `retryJitter` (boolean): Enable retry jitter (default: true)
  - `enableLogging` (boolean): Enable logging (default: true)
  - `enableMetrics` (boolean): Enable metrics collection (default: true)
  - `circuitBreakerThreshold` (number): Circuit breaker failure threshold (default: 5)
  - `circuitBreakerSuccessThreshold` (number): Circuit breaker success threshold (default: 3)
  - `circuitBreakerTimeout` (number): Circuit breaker timeout in ms (default: 60000)
  - `maxRetryDelay` (number): Maximum retry delay in ms (default: 30000)
  - `logLevel` (string): Log level (default: 'INFO')
  - `enableTracing` (boolean): Enable request tracing (default: true)

#### Methods

##### request(targetUrn, route, init)

Make an A2A request to a target agent.

**Parameters:**
- `targetUrn` (string): Target agent URN
- `route` (string): API route/path
- `init` (Object): Request options
  - `body` (Object): Request body
  - `headers` (Object): Additional headers
  - `timeout` (number): Request timeout in ms
  - `maxRetries` (number): Maximum retry attempts
  - `context` (Object): Request context for delegation
  - `method` (string): HTTP method (default: 'POST')

**Returns:** `Promise<{status: number, headers: Object, data: T}>`

**Example:**
```javascript
const client = new A2AClient();
const response = await client.request(
  'urn:agent:ai:ml-agent@1.0.0',
  '/api/inference',
  {
    method: 'POST',
    body: { input: 'test data' },
    timeout: 5000
  }
);
```

### Factory Functions

#### createA2AClient(options)

Create an A2A client with default configuration.

**Parameters:**
- `options` (Object): Client options (same as constructor)

**Returns:** `A2AClient`

#### request(targetUrn, route, init, options)

Convenience function for making A2A requests.

**Parameters:**
- `targetUrn` (string): Target agent URN
- `route` (string): API route
- `init` (Object): Request options
- `options` (Object): Client options

**Returns:** `Promise<{status: number, headers: Object, data: T}>`

## MCP Client

The MCP (Model Context Protocol) client provides communication with MCP servers for tool execution.

### Class: MCPClient

#### Constructor

```javascript
new MCPClient(options)
```

**Parameters:**
- `options` (Object): Configuration options
  - `endpoint` (string|Object): MCP server endpoint
  - `timeout` (number): Request timeout in ms (default: 15000)
  - `heartbeatInterval` (number): Heartbeat interval in ms (default: 30000)
  - `maxRetries` (number): Maximum retry attempts (default: 3)
  - `baseDelay` (number): Base retry delay in ms (default: 1000)
  - `maxDelay` (number): Maximum retry delay in ms (default: 10000)
  - `backoffMultiplier` (number): Retry backoff multiplier (default: 2)
  - `jitter` (boolean): Enable retry jitter (default: true)
  - `enableLogging` (boolean): Enable logging (default: true)
  - `enableMetrics` (boolean): Enable metrics collection (default: true)
  - `circuitBreakerThreshold` (number): Circuit breaker failure threshold (default: 3)
  - `circuitBreakerSuccessThreshold` (number): Circuit breaker success threshold (default: 2)
  - `circuitBreakerTimeout` (number): Circuit breaker timeout in ms (default: 30000)
  - `logLevel` (string): Log level (default: 'INFO')
  - `enableTracing` (boolean): Enable request tracing (default: true)

#### Methods

##### open(options)

Open connection to MCP server.

**Parameters:**
- `options` (Object): Connection options
  - `capabilities` (Object): Client capabilities

**Returns:** `Promise<void>`

**Example:**
```javascript
const client = new MCPClient({ endpoint: 'npx @modelcontextprotocol/server-filesystem' });
await client.open();
```

##### close()

Close connection to MCP server.

**Returns:** `Promise<void>`

##### listTools()

List available tools from the MCP server.

**Returns:** `Promise<Array<MCPTool>>`

**Example:**
```javascript
const tools = await client.listTools();
console.log(`Found ${tools.length} tools`);
```

##### getToolSchema(toolName)

Get tool schema by name.

**Parameters:**
- `toolName` (string): Tool name

**Returns:** `Promise<MCPToolSchema>`

**Example:**
```javascript
const schema = await client.getToolSchema('read_file');
console.log('Tool schema:', schema);
```

##### executeTool(toolName, input, options)

Execute a tool with input parameters.

**Parameters:**
- `toolName` (string): Tool name
- `input` (Object): Tool input parameters
- `options` (Object): Execution options
  - `timeout` (number): Execution timeout in ms
  - `signal` (AbortSignal): Abort signal for cancellation

**Returns:** `Promise<MCPToolResult>`

**Example:**
```javascript
const result = await client.executeTool('read_file', {
  path: '/path/to/file.txt'
}, {
  timeout: 5000
});
console.log('Tool result:', result);
```

#### Protocol MCP Tools

The Protocol MCP server surfaces discovery and governance tooling for MCP-compatible clients. Discovery tools include:

- `protocol_discover_api`: Accepts a `url` to an OpenAPI specification and returns an API protocol manifest with inferred URNs, endpoints, and schemas.
- `protocol_discover_local`: Accepts a local OpenAPI `file_path` (resolved relative to `PROTOCOL_ROOT`) and produces the same manifest format as the remote variant.
- `protocol_discover_asyncapi`: Accepts either `file_path` or HTTP(S) `url` inputs for AsyncAPI specifications and returns an event protocol manifest with channel counts, delivery bindings, and PII detection metadata aligned with the CLI discovery output.
- `protocol_list_test_files`: Returns the curated OpenAPI seed specifications bundled with the runtime for quick smoke tests.

All discovery handlers share structured error responses and performance tracking metrics to simplify automation.

##### getState()

Get connection state.

**Returns:** `MCPConnectionState`

##### isConnected()

Check if connected to MCP server.

**Returns:** `boolean`

### Factory Functions

#### createMCPClient(options)

Create an MCP client with default configuration.

**Parameters:**
- `options` (Object): Client options (same as constructor)

**Returns:** `MCPClient`

#### withMCPClient(endpoint, operation, options)

Convenience function for MCP operations with automatic connection management.

**Parameters:**
- `endpoint` (string): MCP server endpoint
- `operation` (Function): Operation to perform with client
- `options` (Object): Client options

**Returns:** `Promise<any>`

**Example:**
```javascript
const result = await withMCPClient(
  'npx @modelcontextprotocol/server-filesystem',
  async (client) => {
    const tools = await client.listTools();
    return await client.executeTool('read_file', { path: '/test.txt' });
  }
);
```

## Agent Discovery Service

The Agent Discovery Service provides advanced agent discovery capabilities with filtering, sorting, and caching.

### Class: AgentDiscoveryService

#### Constructor

```javascript
new AgentDiscoveryService(options)
```

**Parameters:**
- `options` (Object): Configuration options
  - `registry` (Object): Registry configuration
  - `enableLogging` (boolean): Enable logging (default: true)
  - `maxResults` (number): Maximum results per query (default: 100)
  - `cacheTtl` (number): Cache TTL in ms (default: 300000)
  - `enableCaching` (boolean): Enable result caching (default: true)

#### Methods

##### initialize()

Initialize the discovery service.

**Returns:** `Promise<void>`

##### discoverAgents(query)

Discover agents with advanced querying.

**Parameters:**
- `query` (DiscoveryQuery): Discovery query
  - `domain` (string): Filter by domain
  - `capabilities` (string[]): Filter by capabilities
  - `version` (string): Filter by version
  - `name` (string): Filter by name (partial match)
  - `sort` (Object): Sort configuration
    - `field` (string): Sort field (name, version, registeredAt)
    - `order` (string): Sort order (asc, desc)
  - `limit` (number): Maximum results
  - `offset` (number): Results offset
  - `includeHealth` (boolean): Include health status

**Returns:** `Promise<DiscoveryResult>`

**Example:**
```javascript
const service = new AgentDiscoveryService();
await service.initialize();

const result = await service.discoverAgents({
  domain: 'ai',
  capabilities: ['ml-inference'],
  sort: { field: 'name', order: 'asc' },
  limit: 10,
  includeHealth: true
});
```

##### discoverByDomain(domain, options)

Discover agents by domain.

**Parameters:**
- `domain` (string): Domain to search
- `options` (Object): Additional options

**Returns:** `Promise<DiscoveryResult>`

##### discoverByCapability(capabilities, options)

Discover agents by capability.

**Parameters:**
- `capabilities` (string|string[]): Capability or capabilities to search
- `options` (Object): Additional options

**Returns:** `Promise<DiscoveryResult>`

##### searchByName(name, options)

Search agents by name.

**Parameters:**
- `name` (string): Name to search for
- `options` (Object): Additional options

**Returns:** `Promise<DiscoveryResult>`

##### getAgent(urn)

Get agent by URN.

**Parameters:**
- `urn` (string): Agent URN

**Returns:** `Promise<Object|null>`

##### registerAgent(agentData)

Register an agent.

**Parameters:**
- `agentData` (Object): Agent data

**Returns:** `Promise<Object>`

##### getStats()

Get discovery statistics.

**Returns:** `Object`

##### getHealth()

Get service health.

**Returns:** `Object`

##### clearCache()

Clear discovery cache.

**Returns:** `void`

##### shutdown()

Shutdown the service.

**Returns:** `Promise<void>`

### Factory Functions

#### createAgentDiscoveryService(options)

Create agent discovery service with default configuration.

**Parameters:**
- `options` (Object): Service options (same as constructor)

**Returns:** `AgentDiscoveryService`

#### discoverAgents(query, options)

Convenience function for discovering agents.

**Parameters:**
- `query` (DiscoveryQuery): Discovery query
- `options` (Object): Service options

**Returns:** `Promise<DiscoveryResult>`

#### discoverByDomain(domain, options)

Convenience function for discovering agents by domain.

**Parameters:**
- `domain` (string): Domain to search
- `options` (Object): Service options

**Returns:** `Promise<DiscoveryResult>`

#### discoverByCapability(capabilities, options)

Convenience function for discovering agents by capability.

**Parameters:**
- `capabilities` (string|string[]): Capability or capabilities to search
- `options` (Object): Service options

**Returns:** `Promise<DiscoveryResult>`

## URN Registry

The URN Registry provides persistent storage for agent metadata and capabilities with URN indexing.

### Class: URNRegistry

#### Constructor

```javascript
new URNRegistry(options)
```

**Parameters:**
- `options` (Object): Configuration options
  - `dataDir` (string): Data directory path (default: './data/registry')
  - `enableLogging` (boolean): Enable logging (default: true)
  - `maxAgents` (number): Maximum agent capacity (default: 1000)

#### Methods

##### initialize()

Initialize the registry.

**Returns:** `Promise<void>`

##### registerAgent(agentData)

Register an agent.

**Parameters:**
- `agentData` (Object): Agent data
  - `urn` (string): Agent URN
  - `name` (string): Agent name
  - `version` (string): Agent version
  - `description` (string): Agent description
  - `capabilities` (Object): Agent capabilities
  - `endpoints` (Object): Agent endpoints

**Returns:** `Promise<Object>`

##### getAgent(urn)

Get agent by URN.

**Parameters:**
- `urn` (string): Agent URN

**Returns:** `Promise<Object|null>`

##### listAgentsByDomain(domain)

List agents by domain.

**Parameters:**
- `domain` (string): Domain name

**Returns:** `Promise<Object[]>`

##### searchAgentsByCapability(capability)

Search agents by capability.

**Parameters:**
- `capability` (string): Capability name

**Returns:** `Promise<Object[]>`

##### getStats()

Get registry statistics.

**Returns:** `Object`

##### getHealth()

Get registry health.

**Returns:** `Object`

##### shutdown()

Shutdown the registry.

**Returns:** `Promise<void>`

### Factory Functions

#### createURNRegistry(options)

Create URN registry with default configuration.

**Parameters:**
- `options` (Object): Registry options (same as constructor)

**Returns:** `URNRegistry`

## ACM Generator

The ACM (Agent Capability Manifest) Generator creates and validates agent capability manifests.

### Class: ACMGenerator

#### Constructor

```javascript
new ACMGenerator(options)
```

**Parameters:**
- `options` (Object): Configuration options
  - `enableLogging` (boolean): Enable logging (default: true)
  - `validateSchema` (boolean): Enable schema validation (default: true)

#### Methods

##### createACM(agentConfig)

Create an ACM manifest.

**Parameters:**
- `agentConfig` (Object): Agent configuration
  - `urn` (string): Agent URN
  - `name` (string): Agent name
  - `version` (string): Agent version
  - `description` (string): Agent description
  - `capabilities` (Object): Agent capabilities
  - `endpoints` (Object): Agent endpoints

**Returns:** `Promise<Object>`

**Example:**
```javascript
const generator = new ACMGenerator();
const manifest = await generator.createACM({
  urn: 'urn:agent:ai:ml-agent@1.0.0',
  name: 'ml-agent',
  version: '1.0.0',
  description: 'Machine learning agent',
  capabilities: {
    'ml-inference': {
      type: 'service',
      description: 'ML inference',
      version: '1.0.0'
    }
  },
  endpoints: {
    api: '/api/v1',
    health: '/health'
  }
});
```

##### validateACM(manifest)

Validate an ACM manifest.

**Parameters:**
- `manifest` (Object): ACM manifest

**Returns:** `Promise<boolean>`

### Factory Functions

#### createACMGenerator(options)

Create ACM generator with default configuration.

**Parameters:**
- `options` (Object): Generator options (same as constructor)

**Returns:** `ACMGenerator`

#### createACM(agentConfig)

Convenience function for creating ACM manifests.

**Parameters:**
- `agentConfig` (Object): Agent configuration

**Returns:** `Promise<Object>`

#### validateACM(manifest)

Convenience function for validating ACM manifests.

**Parameters:**
- `manifest` (Object): ACM manifest

**Returns:** `Promise<boolean>`

## Well-Known Server

The Well-Known Server provides HTTP endpoints for agent discovery using the well-known protocol.

### Class: WellKnownServer

#### Constructor

```javascript
new WellKnownServer(options)
```

**Parameters:**
- `options` (Object): Configuration options
  - `port` (number): Server port (default: 3000)
  - `host` (string): Server host (default: 'localhost')
  - `enableLogging` (boolean): Enable logging (default: true)
  - `cors` (Object): CORS configuration
    - `origin` (string): Allowed origin
    - `methods` (string[]): Allowed methods
    - `headers` (string[]): Allowed headers

#### Methods

##### start()

Start the server.

**Returns:** `Promise<void>`

##### stop()

Stop the server.

**Returns:** `Promise<void>`

##### getStatus()

Get server status.

**Returns:** `Object`

##### isRunning()

Check if server is running.

**Returns:** `boolean`

### Factory Functions

#### createWellKnownServer(options)

Create well-known server with default configuration.

**Parameters:**
- `options` (Object): Server options (same as constructor)

**Returns:** `WellKnownServer`

#### startWellKnownServer(options)

Convenience function for starting well-known server.

**Parameters:**
- `options` (Object): Server options

**Returns:** `Promise<WellKnownServer>`

## Error Handler

The Error Handler provides centralized error handling with typed errors and structured context.

### Class: ErrorHandler

#### Constructor

```javascript
new ErrorHandler(options)
```

**Parameters:**
- `options` (Object): Configuration options
  - `enableLogging` (boolean): Enable logging (default: true)
  - `enableMetrics` (boolean): Enable metrics collection (default: true)

#### Methods

##### handleError(error, context)

Handle error with automatic typing and context.

**Parameters:**
- `error` (Error): Error to handle
- `context` (Object): Error context

**Returns:** `TypedError`

##### isRetryable(error)

Check if error is retryable.

**Parameters:**
- `error` (Error): Error to check

**Returns:** `boolean`

##### isFatal(error)

Check if error is fatal.

**Parameters:**
- `error` (Error): Error to check

**Returns:** `boolean`

### Factory Functions

#### handleError(error, context)

Convenience function for handling errors.

**Parameters:**
- `error` (Error): Error to handle
- `context` (Object): Error context

**Returns:** `TypedError`

#### ErrorMappers

Error mapping utilities:

- `fromHttpStatus(status, message, context)`: Map HTTP status to error
- `fromMCPError(mcpError, context)`: Map MCP error to typed error
- `fromFetchError(fetchError, context)`: Map fetch error to typed error

#### ErrorContext

Error context creation utilities:

- `createRequestContext(requestId, method, path)`: Create request context
- `createOperationContext(operation, component)`: Create operation context
- `createAgentContext(agentUrn, action)`: Create agent context

## Circuit Breaker

The Circuit Breaker prevents cascading failures by monitoring service health.

### Class: CircuitBreaker

#### Constructor

```javascript
new CircuitBreaker(options)
```

**Parameters:**
- `options` (Object): Configuration options
  - `failureThreshold` (number): Failure threshold (default: 5)
  - `successThreshold` (number): Success threshold (default: 3)
  - `timeout` (number): Timeout in ms (default: 60000)
  - `enableLogging` (boolean): Enable logging (default: true)
  - `enableMetrics` (boolean): Enable metrics collection (default: true)

#### Methods

##### execute(operation)

Execute operation with circuit breaker protection.

**Parameters:**
- `operation` (Function): Operation to execute

**Returns:** `Promise<any>`

##### getStatus()

Get circuit breaker status.

**Returns:** `Object`

##### getHealth()

Get circuit breaker health.

**Returns:** `Object`

##### reset()

Reset circuit breaker.

**Returns:** `void`

### Factory Functions

#### createCircuitBreaker(options)

Create circuit breaker with default configuration.

**Parameters:**
- `options` (Object): Circuit breaker options (same as constructor)

**Returns:** `CircuitBreaker`

#### withCircuitBreaker(name, operation)

Convenience function for circuit breaker protection.

**Parameters:**
- `name` (string): Circuit breaker name
- `operation` (Function): Operation to execute

**Returns:** `Promise<any>`

## Retry Policies

Retry Policies provide configurable retry logic with exponential backoff and jitter.

### Class: RetryPolicy

#### Constructor

```javascript
new RetryPolicy(options)
```

**Parameters:**
- `options` (Object): Configuration options
  - `maxRetries` (number): Maximum retries (default: 3)
  - `baseDelay` (number): Base delay in ms (default: 1000)
  - `maxDelay` (number): Maximum delay in ms (default: 30000)
  - `backoffMultiplier` (number): Backoff multiplier (default: 2)
  - `jitter` (boolean): Enable jitter (default: true)
  - `jitterFactor` (number): Jitter factor (default: 0.1)
  - `policy` (string): Retry policy type (default: 'EXPONENTIAL_BACKOFF')
  - `enableLogging` (boolean): Enable logging (default: true)
  - `enableMetrics` (boolean): Enable metrics collection (default: true)

#### Methods

##### execute(operation)

Execute operation with retry logic.

**Parameters:**
- `operation` (Function): Operation to execute

**Returns:** `Promise<any>`

##### getStatus()

Get retry policy status.

**Returns:** `Object`

##### getHealth()

Get retry policy health.

**Returns:** `Object`

### Factory Functions

#### createRetryPolicy(options)

Create retry policy with default configuration.

**Parameters:**
- `options` (Object): Retry policy options (same as constructor)

**Returns:** `RetryPolicy`

#### withRetryPolicy(name, operation)

Convenience function for retry policy protection.

**Parameters:**
- `name` (string): Retry policy name
- `operation` (Function): Operation to execute

**Returns:** `Promise<any>`

#### PREDEFINED_POLICIES

Predefined retry policies:

- `FAST`: Fast retry policy (1s base delay, 2 retries)
- `STANDARD`: Standard retry policy (1s base delay, 3 retries)
- `SLOW`: Slow retry policy (2s base delay, 5 retries)

#### RetryUtils

Retry utility functions:

- `fromPredefined(name, overrides)`: Create policy from predefined
- `calculateTotalRetryTime(retries, config)`: Calculate total retry time
- `calculateDelay(attempt, config)`: Calculate delay for attempt
- `shouldRetry(error)`: Check if error should be retried

## Structured Logger

The Structured Logger provides structured logging with correlation IDs and request tracing.

### Class: StructuredLogger

#### Constructor

```javascript
new StructuredLogger(options)
```

**Parameters:**
- `options` (Object): Configuration options
  - `level` (string): Log level (default: 'INFO')
  - `enableConsole` (boolean): Enable console output (default: true)
  - `enableFile` (boolean): Enable file output (default: false)
  - `enableMetrics` (boolean): Enable metrics collection (default: true)
  - `enableTracing` (boolean): Enable request tracing (default: true)

#### Methods

##### info(message, context)

Log info message.

**Parameters:**
- `message` (string): Log message
- `context` (Object): Log context

**Returns:** `void`

##### error(message, context)

Log error message.

**Parameters:**
- `message` (string): Log message
- `context` (Object): Log context

**Returns:** `void`

##### debug(message, context)

Log debug message.

**Parameters:**
- `message` (string): Log message
- `context` (Object): Log context

**Returns:** `void`

##### startTrace(name, context)

Start request trace.

**Parameters:**
- `name` (string): Trace name
- `context` (Object): Trace context

**Returns:** `string` (trace ID)

##### completeTrace(traceId, status, result)

Complete request trace.

**Parameters:**
- `traceId` (string): Trace ID
- `status` (string): Trace status
- `result` (Object): Trace result

**Returns:** `void`

##### getActiveTraces()

Get active traces.

**Returns:** `Array<Object>`

##### createCorrelationId()

Create correlation ID.

**Returns:** `string`

##### createRequestId()

Create request ID.

**Returns:** `string`

##### createContext(context)

Create log context.

**Parameters:**
- `context` (Object): Base context

**Returns:** `Object`

##### setLevel(level)

Set log level.

**Parameters:**
- `level` (string): Log level

**Returns:** `void`

##### getLevel()

Get current log level.

**Returns:** `string`

### Factory Functions

#### createStructuredLogger(options)

Create structured logger with default configuration.

**Parameters:**
- `options` (Object): Logger options (same as constructor)

**Returns:** `StructuredLogger`

#### defaultLogger

Default logger instance.

#### log

Convenience logging functions:

- `log.info(message, context)`: Log info message
- `log.error(message, context)`: Log error message
- `log.debug(message, context)`: Log debug message

#### tracing

Convenience tracing functions:

- `tracing.start(name, context)`: Start trace
- `tracing.complete(traceId, status, result)`: Complete trace

#### context

Convenience context functions:

- `context.createCorrelationId()`: Create correlation ID
- `context.createRequestId()`: Create request ID
- `context.create(context)`: Create context

## Error Types

### A2A Errors

- `A2AError`: Base A2A error
- `AuthError`: Authentication error
- `TimeoutError`: Request timeout error
- `NetworkError`: Network error
- `RetryError`: Retry exhausted error

### MCP Errors

- `MCPError`: Base MCP error
- `MCPConnectionError`: MCP connection error
- `MCPTimeoutError`: MCP timeout error
- `MCPProtocolError`: MCP protocol error
- `MCPToolError`: MCP tool error
- `MCPCancellationError`: MCP cancellation error

### URN Errors

- `URNError`: Base URN error
- `URNFormatError`: URN format error
- `URNResolutionError`: URN resolution error

### ACM Errors

- `ACMError`: Base ACM error
- `ACMValidationError`: ACM validation error
- `ACMSchemaError`: ACM schema error

### Well-Known Errors

- `WellKnownError`: Base well-known error
- `WellKnownServerError`: Well-known server error
- `WellKnownValidationError`: Well-known validation error

### Circuit Breaker Errors

- `CircuitBreakerError`: Circuit breaker error

### Retry Errors

- `RetryError`: Retry policy error

## Configuration Constants

### DEFAULT_CONFIG

Default configuration values for all components.

### MCP_CONSTANTS

MCP protocol constants:

- `PROTOCOL_VERSION`: MCP protocol version
- `JSONRPC_VERSION`: JSON-RPC version
- `METHODS`: MCP method names
- `ERROR_CODES`: MCP error codes

### LOG_LEVELS

Log levels:

- `TRACE`: Trace level
- `DEBUG`: Debug level
- `INFO`: Info level
- `WARN`: Warning level
- `ERROR`: Error level
- `FATAL`: Fatal level

### CIRCUIT_STATES

Circuit breaker states:

- `CLOSED`: Circuit closed (normal operation)
- `OPEN`: Circuit open (failing fast)
- `HALF_OPEN`: Circuit half-open (testing)

### RETRY_POLICIES

Retry policy types:

- `EXPONENTIAL_BACKOFF`: Exponential backoff
- `LINEAR_BACKOFF`: Linear backoff
- `FIXED_DELAY`: Fixed delay

## Type Definitions

### MCPTool

```typescript
interface MCPTool {
  name: string;
  description: string;
  inputSchema: object;
}
```

### MCPToolSchema

```typescript
interface MCPToolSchema {
  name: string;
  description: string;
  inputSchema: object;
}
```

### MCPToolResult

```typescript
interface MCPToolResult {
  success: boolean;
  content: Array<any>;
  metadata: {
    toolName: string;
    requestId: string;
    timestamp: string;
  };
}
```

### MCPConnectionState

```typescript
interface MCPConnectionState {
  connected: boolean;
  initialized: boolean;
  serverName: string | null;
  serverVersion: string | null;
  capabilities: object | null;
  lastHeartbeat: Date | null;
  reconnectAttempts: number;
}
```

### DiscoveryQuery

```typescript
interface DiscoveryQuery {
  domain?: string;
  capabilities?: string[];
  version?: string;
  name?: string;
  sort?: {
    field: string;
    order: 'asc' | 'desc';
  };
  limit?: number;
  offset?: number;
  includeHealth?: boolean;
}
```

### DiscoveryResult

```typescript
interface DiscoveryResult {
  agents: Array<object>;
  total: number;
  returned: number;
  query: DiscoveryQuery;
  executedAt: string;
  executionTime: number;
}
```

## Best Practices

### Error Handling

1. Always use typed errors for better error classification
2. Provide rich context when handling errors
3. Use circuit breakers for external service calls
4. Implement retry policies for transient failures
5. Log errors with correlation IDs for tracing

### Performance

1. Use caching for frequently accessed data
2. Implement connection pooling for external services
3. Set appropriate timeouts for all operations
4. Monitor circuit breaker and retry policy metrics
5. Use structured logging with appropriate log levels

### Security

1. Validate all inputs and URNs
2. Use authentication providers for A2A communication
3. Implement rate limiting for API endpoints
4. Sanitize error messages to prevent information leakage
5. Use secure communication channels

### Monitoring

1. Enable metrics collection for all components
2. Use correlation IDs for request tracing
3. Monitor circuit breaker states and failure rates
4. Track retry policy effectiveness
5. Set up alerts for critical errors and performance issues
