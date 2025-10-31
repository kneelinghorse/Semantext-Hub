# Workflow Definition Library

A testable library for defining and executing agent orchestration workflows with support for sequential, parallel, conditional, and saga (compensation) patterns.

## Overview

The Workflow Library provides:
- **JSON Schema-based workflow definitions** for declarative workflow specifications
- **Comprehensive validation** with helpful error messages
- **Dry-run execution** for testing and simulation
- **Multiple orchestration patterns**: sequential, parallel, conditional, and saga
- **Retry policies** with exponential backoff
- **Compensation logic** for distributed transactions (saga pattern)
- **Event-driven execution** for monitoring and debugging

## Quick Start

### Installation

The workflow library is part of the Semantext Hub project. No separate installation needed.

### Validate a Workflow

```bash
node app/cli/index.js workflow validate app/workflow-library/examples/sequential.json
```

### Simulate a Workflow

```bash
node app/cli/index.js workflow simulate app/workflow-library/examples/parallel.json --verbose
```

### List Example Workflows

```bash
node app/cli/index.js workflow examples
```

## Workflow Patterns

### Sequential Execution

Steps execute one after another based on dependencies.

```json
{
  "workflowId": "sequential-example",
  "name": "Sequential Processing",
  "version": "1.0.0",
  "steps": [
    {
      "stepId": "step-1",
      "type": "task",
      "task": {
        "action": "urn:ossp:action:fetch-data",
        "inputs": { "source": "api" }
      }
    },
    {
      "stepId": "step-2",
      "type": "task",
      "dependsOn": ["step-1"],
      "task": {
        "action": "urn:ossp:action:process-data",
        "inputs": { "data": "$step-1" }
      }
    }
  ]
}
```

**Example**: `app/workflow-library/examples/sequential.json`

### Parallel Execution

Multiple branches execute concurrently.

```json
{
  "stepId": "parallel-fetch",
  "type": "parallel",
  "branches": [
    {
      "branchId": "source-1",
      "steps": [
        {
          "stepId": "fetch-api",
          "type": "task",
          "task": { "action": "urn:ossp:action:fetch-api", "inputs": {} }
        }
      ]
    },
    {
      "branchId": "source-2",
      "steps": [
        {
          "stepId": "fetch-db",
          "type": "task",
          "task": { "action": "urn:ossp:action:fetch-db", "inputs": {} }
        }
      ]
    }
  ]
}
```

**Example**: `app/workflow-library/examples/parallel.json`

### Conditional Execution

Execute different paths based on runtime conditions.

```json
{
  "stepId": "conditional-processing",
  "type": "conditional",
  "cases": [
    {
      "condition": "analyze-content.type === 'image'",
      "steps": [
        {
          "stepId": "process-image",
          "type": "task",
          "task": { "action": "urn:ossp:action:process-image", "inputs": {} }
        }
      ]
    },
    {
      "condition": "analyze-content.type === 'video'",
      "steps": [
        {
          "stepId": "process-video",
          "type": "task",
          "task": { "action": "urn:ossp:action:process-video", "inputs": {} }
        }
      ]
    }
  ],
  "default": [
    {
      "stepId": "generic-processing",
      "type": "task",
      "task": { "action": "urn:ossp:action:process-generic", "inputs": {} }
    }
  ]
}
```

**Example**: `app/workflow-library/examples/conditional.json`

### Saga Pattern (Compensation)

Distributed transactions with compensation for rollback on failure.

```json
{
  "workflowId": "distributed-transaction",
  "name": "Order Processing Saga",
  "version": "1.0.0",
  "compensationPolicy": "full",
  "steps": [
    {
      "stepId": "reserve-inventory",
      "type": "task",
      "task": { "action": "urn:ossp:action:inventory:reserve", "inputs": {} },
      "compensation": "release-inventory",
      "onFailure": "compensate"
    },
    {
      "stepId": "release-inventory",
      "type": "compensation",
      "task": { "action": "urn:ossp:action:inventory:release", "inputs": {} }
    },
    {
      "stepId": "charge-payment",
      "type": "task",
      "dependsOn": ["reserve-inventory"],
      "task": { "action": "urn:ossp:action:payment:charge", "inputs": {} },
      "compensation": "refund-payment",
      "onFailure": "compensate"
    },
    {
      "stepId": "refund-payment",
      "type": "compensation",
      "task": { "action": "urn:ossp:action:payment:refund", "inputs": {} }
    }
  ]
}
```

**Compensation Policies**:
- `none`: No compensation on failure
- `partial`: Compensate only the last step
- `full`: Compensate all steps in reverse order (LIFO)

**Example**: `app/workflow-library/examples/saga.json`

## Schema Reference

### Workflow Definition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `workflowId` | string | Yes | Unique workflow identifier |
| `name` | string | Yes | Human-readable name |
| `version` | string | Yes | Semantic version (e.g., "1.0.0") |
| `description` | string | No | Workflow description |
| `metadata` | object | No | Metadata (author, tags, timestamps) |
| `timeout` | integer | No | Workflow timeout in milliseconds |
| `retryPolicy` | object | No | Default retry policy for all steps |
| `compensationPolicy` | string | No | Compensation strategy: `none`, `partial`, `full` |
| `steps` | array | Yes | Array of workflow steps |

### Step Definition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `stepId` | string | Yes | Unique step identifier |
| `name` | string | No | Human-readable step name |
| `type` | string | Yes | Step type: `task`, `parallel`, `conditional`, `compensation` |
| `condition` | string | No | JavaScript expression for conditional execution |
| `dependsOn` | array | No | Array of step IDs this step depends on |
| `timeout` | integer | No | Step timeout in milliseconds |
| `retryPolicy` | object | No | Retry policy for this step |
| `onFailure` | string | No | Failure behavior: `fail`, `continue`, `compensate` |
| `compensation` | string | No | Step ID to execute for compensation |
| `task` | object | Conditional | Task definition (required for `task` type) |
| `branches` | array | Conditional | Parallel branches (required for `parallel` type) |
| `cases` | array | Conditional | Conditional cases (required for `conditional` type) |
| `default` | array | No | Default steps for conditional |

### Task Definition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | Action identifier or URN |
| `inputs` | object | No | Input parameters (supports `$stepId` references) |
| `outputs` | object | No | Output mapping |

### Retry Policy

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxAttempts` | integer | 3 | Maximum retry attempts |
| `backoffMs` | integer | 1000 | Initial backoff delay in ms |
| `backoffMultiplier` | number | 2 | Backoff multiplier |
| `maxBackoffMs` | integer | 60000 | Maximum backoff delay |
| `retryableErrors` | array | All | Error codes that trigger retry |

## Programmatic Usage

### Validate a Workflow

```javascript
const WorkflowValidator = require('./app/workflow-library/validator');

const validator = new WorkflowValidator();
const workflow = {
  workflowId: 'my-workflow',
  name: 'My Workflow',
  version: '1.0.0',
  steps: [/* ... */]
};

const result = validator.validate(workflow);
if (result.valid) {
  console.log('Workflow is valid');
} else {
  console.error('Validation errors:', result.errors);
}
```

### Execute a Workflow

```javascript
const { WorkflowExecutor } = require('./app/workflow-library/executor');

const executor = new WorkflowExecutor({
  dryRun: false,
  taskExecutor: async (action, inputs, context) => {
    // Custom task execution logic
    return { success: true };
  }
});

executor.on('step:complete', (event) => {
  console.log(`Step ${event.stepId} completed`);
});

const context = await executor.execute(workflow, { /* inputs */ });
console.log('Workflow completed:', context.state);
```

## CLI Commands

### Validate

```bash
node app/cli/index.js workflow validate <workflow-file>
```

Validates a workflow definition against the JSON schema and semantic rules.

### Simulate

```bash
node app/cli/index.js workflow simulate <workflow-file> [options]

Options:
  --verbose          Show detailed step-by-step output
  --trace            Show full execution trace
  --inputs <json>    Input parameters as JSON string
  --output-file <path>  Write simulation report to file
  --show-outputs     Show step outputs in verbose mode
```

Simulates workflow execution in dry-run mode.

### Examples

```bash
node app/cli/index.js workflow examples
```

Lists all available example workflows.

## Example Workflows

### Sequential Data Processing
**File**: `examples/sequential.json`

Demonstrates sequential step execution for a data processing pipeline:
1. Fetch data from API
2. Validate schema
3. Transform data
4. Enrich with metadata
5. Store in database

### Parallel Multi-Source Aggregation
**File**: `examples/parallel.json`

Demonstrates parallel execution for aggregating data from multiple sources:
- Parallel fetch from API, database, file, and queue
- Merge results
- Deduplicate
- Generate report

### Conditional Content Processing
**File**: `examples/conditional.json`

Demonstrates conditional execution based on content type:
- Analyze content properties
- Branch based on type (image, video, document)
- Type-specific processing pipelines
- Update metadata

### Distributed Transaction Saga
**File**: `examples/saga.json`

Demonstrates saga pattern with compensation for order processing:
1. Reserve inventory (compensate: release)
2. Charge payment (compensate: refund)
3. Create shipment (compensate: cancel)
4. Update order status (compensate: mark failed)
5. Send confirmation

If any step fails, compensation executes in reverse order.

## Performance Targets

Based on the mission requirements:

| Metric | Target | Description |
|--------|--------|-------------|
| Validation | < 50ms | Schema and semantic validation |
| Simulation | < 200ms | Typical dry-run execution |
| Parallel Scheduling | < 10ms | Overhead for parallel execution |
| Compensation | < 20ms | Compensation execution overhead |

## Testing

Run the test suite:

```bash
npm test -- app/tests/workflow-library/workflow-library.test.js
```

Tests cover:
- Schema validation (valid and invalid workflows)
- Semantic validation (dependencies, cycles, compensations)
- Sequential execution
- Parallel execution
- Conditional execution
- Compensation (saga pattern)
- Retry logic
- Example workflows
- Performance benchmarks

## Integration Points

### With Week 5 Deliverables
- Uses **Catalog Index** (B5.1) for URN lookups in task actions
- Integrates **Security Redaction** (B5.2) for sensitive data in workflow inputs/outputs

### Enables Week 7 Missions
- **B7.4.0**: Structured feedback and monitoring over workflows
- Future missions can consume workflow definitions for orchestration

## Architecture

### Components

1. **Schema** (`schema/workflow.schema.json`)
   - JSON Schema definition for workflows
   - Comprehensive validation rules
   - Type constraints and patterns

2. **Validator** (`validator.js`)
   - Schema validation with AJV
   - Semantic validation (dependencies, cycles)
   - Helpful error messages

3. **Executor** (`executor.js`)
   - Event-driven execution
   - Sequential, parallel, and conditional logic
   - Saga compensation pattern
   - Retry with exponential backoff
   - Timeout handling

4. **Examples** (`examples/`)
   - Sequential pattern
   - Parallel pattern
   - Conditional pattern
   - Saga pattern

5. **Tests** (`tests/workflow-library/`)
   - Comprehensive unit tests
   - Pattern-specific tests
   - Performance benchmarks

### Event System

The executor emits events for monitoring and debugging:

- `workflow:start` - Workflow execution started
- `workflow:complete` - Workflow completed successfully
- `workflow:failed` - Workflow failed
- `step:start` - Step execution started
- `step:complete` - Step completed successfully
- `step:failed` - Step failed
- `step:skipped` - Step skipped (condition or dependency)
- `step:retry` - Step retry attempt
- `parallel:start` - Parallel execution started
- `parallel:complete` - Parallel execution completed
- `parallel:failed` - Parallel execution failed
- `conditional:matched` - Conditional case matched
- `conditional:default` - Conditional default executed
- `compensation:start` - Compensation started
- `compensation:step` - Compensation step executed
- `compensation:complete` - Compensation completed

## Best Practices

### Workflow Design

1. **Keep workflows focused**: One workflow should represent one business process
2. **Use meaningful IDs**: Step IDs should be descriptive and unique
3. **Leverage dependencies**: Use `dependsOn` to enforce execution order
4. **Set timeouts**: Always set appropriate timeouts to prevent hanging
5. **Plan for failure**: Use compensation for critical distributed operations

### Error Handling

1. **Use retry policies**: Configure retries for transient failures
2. **Choose failure behavior**: `fail`, `continue`, or `compensate` based on criticality
3. **Test compensation**: Always test saga compensation in failure scenarios
4. **Monitor events**: Use the event system for observability

### Performance

1. **Parallelize when possible**: Use parallel steps for independent operations
2. **Minimize step count**: Combine related operations when appropriate
3. **Set reasonable timeouts**: Avoid overly long timeouts that delay failure detection
4. **Use conditions wisely**: Avoid complex conditions; keep them simple and testable

## Future Enhancements

- Remote workflow execution engine
- Cross-repo workflow federation
- Visual workflow designer
- Workflow versioning and migration
- Real-time workflow monitoring dashboard
- Workflow templates and composition

## License

Part of the Semantext Hub project.

## Contributing

This library was developed as part of Mission B7.3.0. See `missions/current.md` for development context.
