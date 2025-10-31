# Observability Guide - B11.8

This guide covers the observability features implemented in Semantext Hub, including performance monitoring, correlation IDs, and trace toggles for faster diagnosis.

## Overview

The observability system provides:
- **Performance Status**: Local performance summaries with key timings
- **Correlation IDs**: Request tracing across adapters and CLI operations
- **Trace Toggles**: Environment flags for enabling verbose traces
- **SLO Monitoring**: Service Level Objective tracking (Discovery P95 < 1s, MCP P95 < 3s)

## Environment Variables

### Trace Flags

Control tracing behavior using environment variables:

```bash
# Enable all tracing
export TRACE=1

# Enable adapter-specific tracing only
export TRACE=adapters

# Disable tracing (default)
export TRACE=0
```

#### Trace Flag Options

| Value | Description | Scope |
|-------|-------------|-------|
| `1` or `true` | Enable all tracing | CLI operations, adapters, middleware |
| `adapters` | Enable adapter tracing only | MCP, discovery, and other adapters |
| `0` or `false` | Disable tracing (default) | No tracing output |

### Performance Monitoring

```bash
# Enable verbose performance logging
export PERF_VERBOSE=1

# Set performance log level
export PERF_LOG_LEVEL=debug
```

## CLI Commands

### Performance Status

Get a quick performance summary with key metrics:

```bash
# Basic status
node cli/index.js perf:status

# Verbose output with correlation ID
node cli/index.js perf:status --verbose

# JSON format for scripting
node cli/index.js perf:status --format json

# Custom workspace
node cli/index.js perf:status --workspace ./my-workspace
```

#### Sample Output

```
📊 Performance Status Summary
================================

🔍 Discovery Service
  Requests: 50
  P50: 245.50ms
  P95: 892.30ms
  Avg: 387.20ms
  Cache Hit Rate: 72.0%
  ✅ P95 within SLO (1s): 892.30ms

🔧 MCP Service
  Requests: 30
  P50: 1,234.50ms
  P95: 2,456.70ms
  Avg: 1,678.90ms
  Tool Executions: 25
  ✅ P95 within SLO (3s): 2,456.70ms

💻 System
  Memory: 45.67MB
  Uptime: 12.3min

Correlation ID: 550e8400-e29b-41d4-a716-446655440000
Generated: 2024-01-15T10:30:45.123Z
```

## Correlation IDs

### Automatic Generation

Correlation IDs are automatically generated for:
- CLI command executions
- MCP tool executions
- Discovery operations
- HTTP requests (when using trace middleware)

### Manual Usage

```javascript
import { correlationId, startTrace, startSpan } from '../utils/trace.js';

// Generate a new correlation ID
const id = correlationId();

// Start a trace with correlation ID
const trace = startTrace('my-operation', { correlationId: id });

// Start a child span
const span = startSpan('sub-operation', trace);
```

### Propagation

Correlation IDs are propagated through:
- HTTP headers (`x-correlation-id`)
- Log entries
- Error messages
- Performance metrics

## Trace Context

### Trace Context Structure

```javascript
{
  traceId: "550e8400-e29b-41d4-a716-446655440000",
  spanId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  correlationId: "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
  parentSpanId: "6ba7b812-9dad-11d1-80b4-00c04fd430c8",
  baggage: { "user.id": "12345" },
  tags: { "operation": "mcp.executeTool" },
  startTime: 1705312245123,
  depth: 2
}
```

### HTTP Headers

Trace context is propagated via HTTP headers:

```
x-correlation-id: 550e8400-e29b-41d4-a716-446655440000
x-trace-id: 6ba7b810-9dad-11d1-80b4-00c04fd430c8
x-span-id: 6ba7b811-9dad-11d1-80b4-00c04fd430c8
x-parent-span-id: 6ba7b812-9dad-11d1-80b4-00c04fd430c8
x-trace-baggage: {"user.id":"12345"}
x-trace-tags: {"operation":"mcp.executeTool"}
```

## Adapter Tracing

### MCP Adapter

MCP operations are automatically traced when `TRACE=adapters` or `TRACE=1`:

```javascript
// Automatically traced
const tools = await mcpClient.listTools();
const result = await mcpClient.executeTool('search', { query: 'test' });
```

Trace output:
```
[TRACE] Started span: mcp.listTools (6ba7b810-9dad-11d1-80b4-00c04fd430c8)
[TRACE] Finished: mcp.listTools (6ba7b810-9dad-11d1-80b4-00c04fd430c8) - 245ms
[TRACE] Started span: mcp.executeTool.search (6ba7b811-9dad-11d1-80b4-00c04fd430c8)
[TRACE] Finished: mcp.executeTool.search (6ba7b811-9dad-11d1-80b4-00c04fd430c8) - 1234ms
```

### Discovery Adapter

Discovery operations are traced with cache hit/miss information:

```javascript
// Automatically traced
const protocols = await discoveryService.findProtocols({ type: 'api' });
```

### CLI Operations

CLI commands are traced with execution time and success/failure status:

```javascript
// Automatically traced
await perfStatusCommand({ verbose: true });
```

## Performance Metrics

### SLO Targets

| Service | Metric | Target | Current |
|---------|--------|--------|---------|
| Discovery | P95 Latency | < 1s | 892ms ✅ |
| MCP | P95 Latency | < 3s | 2.4s ✅ |
| System | Memory Usage | < 100MB | 45MB ✅ |

### Metric Collection

Metrics are collected from:
- Performance logs in `artifacts/` directory
- Real-time operation timing
- System resource usage
- Cache hit/miss ratios

### Custom Metrics

Add custom metrics to your operations:

```javascript
import { PerformanceCollector } from '../src/metrics/perf.js';

const collector = new PerformanceCollector();

// Record custom operation
const startTime = performance.now();
try {
  await myOperation();
  collector.recordDiscovery(startTime, performance.now(), true, false);
} catch (error) {
  collector.recordDiscovery(startTime, performance.now(), false, true);
}
```

## Logging Integration

### Structured Logging

All log entries include correlation IDs when available:

```javascript
import { log } from '../packages/runtime/runtime/structured-logger.js';

// Log with correlation ID
log.info('Operation completed', { 
  correlationId: '550e8400-e29b-41d4-a716-446655440000',
  duration: 1234,
  operation: 'mcp.executeTool'
});
```

### Log Format

```json
{
  "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": 2,
  "levelName": "INFO",
  "message": "Operation completed",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "requestId": "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
  "component": "mcp-client",
  "operation": "executeTool",
  "duration": 1234,
  "metadata": {}
}
```

## Troubleshooting

### Common Issues

#### Tracing Not Working

1. Check environment variables:
   ```bash
   echo $TRACE
   ```

2. Verify trace configuration:
   ```javascript
   import { getTraceConfig } from '../utils/trace.js';
   console.log(getTraceConfig());
   ```

#### Performance Data Missing

1. Check artifacts directory:
   ```bash
   ls -la app/artifacts/
   ```

2. Enable verbose logging:
   ```bash
   node cli/index.js perf:status --verbose
   ```

#### Correlation IDs Not Propagating

1. Check HTTP headers in requests
2. Verify trace middleware is enabled
3. Check AsyncLocalStorage context

### Debug Mode

Enable debug mode for detailed trace information:

```bash
export DEBUG=ossp:trace
export TRACE=1
node cli/index.js perf:status --verbose
```

## Best Practices

### Performance Monitoring

1. **Regular Status Checks**: Run `perf-status` regularly to monitor SLO compliance
2. **Correlation ID Usage**: Always include correlation IDs in error reports
3. **Trace Depth Limits**: Be aware of the 10-level trace depth limit
4. **Memory Management**: Monitor memory usage in long-running processes

### Trace Design

1. **Meaningful Operations**: Trace at the operation level, not individual function calls
2. **Consistent Naming**: Use consistent operation names (e.g., `mcp.executeTool`, `discovery.findProtocols`)
3. **Baggage Usage**: Use baggage for cross-cutting concerns (user ID, request ID)
4. **Error Handling**: Always finish traces, even on errors

### Integration

1. **Middleware**: Use trace middleware for HTTP services
2. **Client Interceptors**: Add trace headers to outgoing HTTP requests
3. **Logging**: Include correlation IDs in all log entries
4. **Error Reporting**: Include trace context in error reports

## API Reference

### Trace Utilities

```javascript
import { 
  correlationId,
  startTrace,
  startSpan,
  finishSpan,
  traceMiddleware,
  adapterTracing
} from '../utils/trace.js';
```

### Performance Utilities

```javascript
import { 
  perfStatusCommand,
  PerformanceCollector
} from '../src/metrics/perf.js';
```

### Logging Utilities

```javascript
import { 
  log,
  tracing,
  context
} from '../packages/runtime/runtime/structured-logger.js';
```

## Examples

### Complete Tracing Example

```javascript
import { adapterTracing } from '../utils/trace.js';

// Enable tracing
process.env.TRACE = '1';

// Trace MCP operation
const result = await adapterTracing.traceMCPOperation('search', async () => {
  return await mcpClient.executeTool('search', { query: 'test' });
});

// Trace discovery operation
const protocols = await adapterTracing.traceDiscoveryOperation('findProtocols', async () => {
  return await discoveryService.findProtocols({ type: 'api' });
});
```

### Performance Monitoring Example

```javascript
import { PerformanceCollector } from '../src/metrics/perf.js';

const collector = new PerformanceCollector();

// Monitor custom operation
const startTime = performance.now();
try {
  await myCustomOperation();
  collector.recordDiscovery(startTime, performance.now(), false, false);
} catch (error) {
  collector.recordDiscovery(startTime, performance.now(), false, true);
}

// Get summary
const summary = collector.getSummary();
console.log(`P95: ${summary.discovery.p95}ms`);
```

---

For more information, see:
- [Runtime Performance Guide](../runtime-performance-guide.md)
- [Runtime API Reference](../runtime-api-reference.md)
- [Error Codes](../ERROR_CODES.md)
