# Feedback System

**Mission B7.4.0** - Structured Feedback for Errors, Hints, and Progress

A unified feedback system that standardizes error reporting with suggested fixes, provides progress tracking for long-running operations, and adds correlation IDs and verbosity controls across the CLI and runtime components.

## Features

- **Structured Error Reporting**: RFC 7807-inspired error format with codes, categories, and suggested fixes
- **Progress Tracking**: Real-time progress updates with W3C Trace Context correlation
- **Hint System**: Contextual hints with severity levels and documentation links
- **Event Adapters**: Seamless integration with workflow and registry events
- **CLI Tools**: Commands to view feedback summaries, traces, and hints
- **High Performance**: <5ms error formatting, <2ms progress event overhead, <1ms correlation ID generation

## Architecture

```
feedback/
├── schema/
│   └── feedback.schema.json       # JSON Schema for validation
├── adapters/
│   ├── workflow-adapter.js        # WorkflowExecutor integration
│   └── registry-adapter.js        # RegistrationPipeline integration
├── error-codes.js                 # Standard error code registry
├── feedback.js                    # Core formatter and validator
├── progress.js                    # Progress tracker with throttling
└── index.js                       # Main aggregator and exports
```

## Quick Start

### Error Reporting

```javascript
import { FeedbackFormatter, ErrorCodes } from './feedback/index.js';

const formatter = new FeedbackFormatter({
  serviceName: 'my-service',
  verbose: false
});

// Format an error with suggested fix
const error = formatter.formatError(ErrorCodes.INVALID_PARAMETER, {
  detail: 'Email format is invalid',
  details: { field: 'email', value: 'invalid@' },
  suggestedFix: 'Use a valid email format (user@domain.com)',
  correlationId: 'trace-123'
});

console.log(error);
// {
//   code: 40001,
//   category: 'CLIENT_ERROR',
//   message: 'Invalid parameter provided',
//   type: 'https://ossp-agi.dev/errors/invalid-parameter',
//   detail: 'Email format is invalid',
//   suggestedFix: 'Use a valid email format...',
//   details: { field: 'email', value: 'invalid@' },
//   correlationId: 'trace-123',
//   timestamp: '2025-10-06T...'
// }
```

### Progress Tracking

```javascript
import { ProgressTracker, ProgressStatus } from './feedback/index.js';

const tracker = new ProgressTracker({
  taskId: 'import-protocol',
  totalSteps: 100,
  throttleMs: 100  // Throttle to max 10 updates/sec
});

// Listen to progress events
tracker.on('progress', (event) => {
  console.log(`${event.progress.percent}% - ${event.progress.description}`);
});

// Start operation
tracker.start('Importing OpenAPI specification');

// Update progress
tracker.updateProgress({
  currentStep: 25,
  description: 'Parsing endpoints'
});

// Complete
tracker.complete('https://result.url/protocol.json');
```

### Feedback Aggregation

```javascript
import { FeedbackAggregator, ErrorCodes } from './feedback/index.js';

const aggregator = new FeedbackAggregator({
  serviceName: 'ossp-agi',
  maxStoredMessages: 1000
});

// Report errors
aggregator.reportError(ErrorCodes.VALIDATION_FAILED, {
  detail: 'Schema validation failed',
  correlationId: 'trace-123'
});

// Report hints
aggregator.reportHint('WORKFLOW_VALIDATION', 'Ensure workflow follows schema', {
  severity: 'WARNING',
  documentationUrl: 'https://docs.ossp-agi.dev/workflows'
});

// Track progress
const tracker = aggregator.getProgressTracker('task-1', { totalSteps: 10 });
tracker.start('Processing workflow');

// Get summary
const summary = aggregator.getSummary();
console.log(summary);
// {
//   errors: { total: 1, byCategory: { client: 0, server: 0, business: 1 } },
//   hints: { total: 1, bySeverity: { info: 0, warning: 1, error: 0 } },
//   progress: { total: 1, pending: 0, inProgress: 1, completed: 0, failed: 0 }
// }

// Trace by correlation ID
const trace = aggregator.getTrace('trace-123');
console.log(trace.errors, trace.hints, trace.progress);
```

### Workflow Integration

```javascript
import { WorkflowExecutor } from '../workflow-library/index.js';
import { WorkflowFeedbackAdapter } from './feedback/index.js';

const executor = new WorkflowExecutor();
const adapter = new WorkflowFeedbackAdapter(executor);

// Listen to feedback events
executor.on('feedback:progress', (event) => {
  console.log(`Progress: ${event.progress.percent}%`);
});

executor.on('feedback:error', (error) => {
  console.error(`Error ${error.code}: ${error.message}`);
  console.log(`Fix: ${error.suggestedFix}`);
});

// Execute workflow (feedback is automatically tracked)
await executor.execute(workflowDef, inputs);
```

### Registry Integration

```javascript
import { RegistrationPipeline } from '../core/registration/index.js';
import { RegistryFeedbackAdapter } from './feedback/index.js';

const pipeline = new RegistrationPipeline({ baseDir: './data' });
const adapter = new RegistryFeedbackAdapter(pipeline);

// Listen to feedback events
pipeline.on('feedback:progress', (event) => {
  console.log(`Registration: ${event.progress.description}`);
});

pipeline.on('feedback:error', (error) => {
  console.error(`Error: ${error.message}`);
});

// Register manifest (feedback is automatically tracked)
await pipeline.transition(manifestId, 'APPROVE');
```

## CLI Usage

### View Feedback Summary

```bash
node app/cli/commands/feedback.js summarize

📊 Feedback Summary

Errors:
┌──────────────────┬───────┐
│ Category         │ Count │
├──────────────────┼───────┤
│ Total            │ 5     │
│ Client Errors    │ 2     │
│ Server Errors    │ 1     │
│ Business Logic   │ 2     │
└──────────────────┴───────┘
```

### List Errors

```bash
# All errors
node app/cli/commands/feedback.js errors

# Filter by category
node app/cli/commands/feedback.js errors --category SERVER_ERROR

# Verbose output
node app/cli/commands/feedback.js errors -v

# JSON output
node app/cli/commands/feedback.js errors --json
```

### View Hints

```bash
# All hints
node app/cli/commands/feedback.js hints

# Filter by severity
node app/cli/commands/feedback.js hints --severity WARNING
```

### Trace Request

```bash
# Trace by correlation ID
node app/cli/commands/feedback.js trace abc123def456

🔍 Trace: abc123def456

Progress:
  Task ID: import-workflow
  Status: IN_PROGRESS
  Progress: 45.0%
  Description: Parsing workflow steps
  Elapsed: 1250ms

Errors (1):
  [1] Workflow validation failed
      Step dependency not found
```

## Error Codes

### Client Errors (40000-49999)

**Recovery Pattern**: Fail fast - do not retry

- `40001` INVALID_PARAMETER - Invalid parameter provided
- `40002` MISSING_REQUIRED_FIELD - Required field is missing
- `40003` INVALID_FORMAT - Invalid format
- `40101` UNAUTHORIZED - Unauthorized access
- `40103` FORBIDDEN - Insufficient permissions
- `40104` NOT_FOUND - Resource not found
- `40109` CONFLICT - Resource conflict
- `40122` VALIDATION_FAILED - Validation failed

### Server Errors (50000-59999)

**Recovery Pattern**: Retry with exponential backoff

- `50000` INTERNAL_ERROR - Internal server error
- `50002` DOWNSTREAM_ERROR - Downstream service error
- `50003` SERVICE_UNAVAILABLE - Service temporarily unavailable
- `50004` TIMEOUT - Operation timeout
- `50010` DATABASE_ERROR - Database operation failed

### Business Logic Errors (60000-69999)

**Recovery Pattern**: Handle in application logic

- `60001` INSUFFICIENT_RESOURCES - Insufficient resources
- `60002` QUOTA_EXCEEDED - Quota exceeded
- `60003` RATE_LIMIT_EXCEEDED - Rate limit exceeded
- `60004` DUPLICATE_ENTRY - Duplicate entry
- `60010` WORKFLOW_VALIDATION_FAILED - Workflow validation failed
- `60011` PROTOCOL_PARSING_FAILED - Protocol parsing failed
- `60012` REGISTRATION_CONFLICT - Agent registration conflict

## Performance Targets

All performance targets are validated in the test suite:

- **Error Formatting**: <5ms per message
- **Progress Event**: <2ms overhead per event
- **Correlation ID Generation**: <1ms per ID
- **CLI Render**: <20ms per 50 events

## Testing

Run the comprehensive test suite:

```bash
npm test -- app/tests/feedback/feedback.test.js
```

Tests cover:

- Error formatting with all field combinations
- Progress tracking with throttling
- Hierarchical progress (parent/child trackers)
- Correlation ID generation and uniqueness
- Feedback aggregation and filtering
- Schema validation
- Performance benchmarks
- Adapter integration

## Schema

The feedback system uses a JSON Schema for validation (`schema/feedback.schema.json`):

- **Error Messages**: RFC 7807-inspired with code, category, type URI, detail, and suggested fix
- **Progress Events**: Task ID, status, progress metrics, correlation context
- **Hints**: Code, message, severity, context, documentation URL
- **Feedback Envelope**: Type, timestamp, service, correlation IDs, payload

## W3C Trace Context

The system uses W3C Trace Context for distributed tracing:

- **Trace ID**: 32 hex characters (16 bytes) - globally unique per request
- **Span ID**: 16 hex characters (8 bytes) - unique per operation

```javascript
import { generateTraceId, generateSpanId } from './feedback/index.js';

const traceId = generateTraceId();  // "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
const spanId = generateSpanId();    // "a1b2c3d4e5f6g7h8"
```

## Integration with Week 5 Deliverables

- **Catalog Index (B5.1)**: Provides source context in error messages
- **Security Redaction (B5.2)**: Applied to feedback details and logs

## Enables Week 7 Missions

- **B7.5.0 Scaffolding Tool**: Consumes feedback/hints in UX
- **B7.6.0 CI Reporting**: Uses structured feedback for test results

## API Reference

See inline JSDoc comments in source files for detailed API documentation.

---

**Mission B7.4.0 Complete** ✅

Deliverables:
- ✅ Structured error format with codes and suggested fixes
- ✅ Progress tracking with correlation IDs and throttling
- ✅ Workflow and registry event adapters
- ✅ CLI commands for feedback viewing
- ✅ Comprehensive test suite
- ✅ Performance targets validated

Next: **B7.5.0 - Protocol Scaffolding Tool**
