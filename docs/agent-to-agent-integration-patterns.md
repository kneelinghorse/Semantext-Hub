# Agent-to-Agent Integration Patterns

## Overview

The Integration Protocol's `agentMapping` extension enables agent-to-agent (A2A) communication by providing structured metadata for:

- **Conversation context preservation** across agent interactions
- **Artifact mapping** for passing data/outputs between agents
- **Task chaining** for orchestrating sequential or parallel agent workflows

## Schema

```javascript
{
  integration: { /* standard integration fields */ },
  source: { kind_urns: { agent: 'urn:proto:agent:source@1.0.0' } },
  destination: { kind_urns: { agent: 'urn:proto:agent:dest@1.0.0' } },
  mapping: { rules: [...] },

  // Agent-to-agent specific mapping
  agentMapping: {
    // Conversation context management
    conversationContext: {
      enabled: boolean,           // required
      preserveHistory?: boolean   // optional
    },

    // Artifact/output mapping between agents
    artifactMapping: [
      {
        sourceArtifact: string,      // URN or path
        destinationInput: string,    // URN or path
        transformation?: string      // optional transform function
      }
    ],

    // Task orchestration mode
    taskChaining: {
      mode: 'sequential' | 'parallel',        // required
      errorHandling?: 'compensate' | 'fail'   // optional
    }
  }
}
```

## Pattern 1: Conversation Context Preservation

### Use Case
Enable agents to maintain conversation history and context across interactions.

### Example
```javascript
{
  integration: {
    id: 'writer-reviewer-chat',
    name: 'Writer-Reviewer Collaboration',
    direction: 'bidirectional',
    mode: 'stream'
  },
  source: {
    kind_urns: { agent: 'urn:proto:agent:writer@2.0.0' }
  },
  destination: {
    kind_urns: { agent: 'urn:proto:agent:reviewer@2.0.0' }
  },
  mapping: {
    rules: [
      { from: 'output.message', to: 'input.message', required: true }
    ]
  },
  agentMapping: {
    conversationContext: {
      enabled: true,
      preserveHistory: true  // Keep full conversation thread
    }
  },
  transport: {
    stream: { broker: 'webhook', topic: 'agent-chat' }
  }
}
```

### Behavior
- `enabled: true` - Agent receives context from previous interactions
- `preserveHistory: true` - Full conversation thread is maintained
- `preserveHistory: false` - Only immediate context (last N messages)

## Pattern 2: Artifact Mapping with Transformation

### Use Case
Pass structured outputs from one agent as inputs to another, with optional transformations.

### Example
```javascript
{
  integration: {
    id: 'analyzer-reporter',
    name: 'Analysis to Report Pipeline',
    direction: 'push',
    mode: 'batch'
  },
  source: {
    kind_urns: { agent: 'urn:proto:agent:analyzer@1.0.0' }
  },
  destination: {
    kind_urns: { agent: 'urn:proto:agent:reporter@1.0.0' }
  },
  mapping: {
    rules: [
      { from: 'analysis_result', to: 'report_input', required: true }
    ]
  },
  agentMapping: {
    artifactMapping: [
      {
        sourceArtifact: 'urn:proto:agent:analyzer@1.0.0#artifact.json_data',
        destinationInput: 'urn:proto:agent:reporter@1.0.0#input.structured_data',
        transformation: 'json_to_markdown'
      },
      {
        sourceArtifact: 'urn:proto:agent:analyzer@1.0.0#artifact.metrics',
        destinationInput: 'urn:proto:agent:reporter@1.0.0#input.summary_stats'
      }
    ]
  },
  transport: {
    batch: { schedule: 'hourly' }
  }
}
```

### URN Format
- **Agent artifacts**: `urn:proto:agent:{id}@{version}#artifact.{name}`
- **Agent inputs**: `urn:proto:agent:{id}@{version}#input.{name}`
- **Plain paths**: Can also use simple strings like `output.json`

### Transformations
Optional `transformation` field specifies a function to apply:
- `json_to_markdown` - Convert JSON to Markdown
- `validate_schema` - Validate against JSON Schema
- `extract_summary` - Extract key summary fields
- Custom transformation functions

## Pattern 3: Sequential Task Chaining

### Use Case
Execute agents in sequence, where each agent's output becomes the next agent's input.

### Example
```javascript
{
  integration: {
    id: 'research-write-review',
    name: 'Sequential Content Pipeline',
    direction: 'push',
    mode: 'batch'
  },
  source: {
    kind_urns: { agent: 'urn:proto:agent:researcher@1.0.0' }
  },
  destination: {
    kind_urns: { agent: 'urn:proto:agent:writer@1.0.0' }
  },
  mapping: {
    rules: [
      { from: 'research_output', to: 'writing_input', required: true }
    ]
  },
  agentMapping: {
    taskChaining: {
      mode: 'sequential',
      errorHandling: 'fail'  // Stop pipeline on error
    }
  },
  transport: {
    batch: { schedule: 'daily' }
  }
}
```

### Behavior
- `mode: 'sequential'` - Tasks execute one after another
- `errorHandling: 'fail'` - Pipeline stops on first error
- `errorHandling: 'compensate'` - Execute rollback/cleanup tasks

## Pattern 4: Parallel Task Chaining

### Use Case
Execute multiple agents concurrently with shared orchestrator.

### Example
```javascript
{
  integration: {
    id: 'parallel-analysis',
    name: 'Parallel Data Analysis',
    direction: 'push',
    mode: 'stream'
  },
  source: {
    kind_urns: { agent: 'urn:proto:agent:orchestrator@1.0.0' }
  },
  destination: {
    kind_urns: { agent: 'urn:proto:agent:worker@1.0.0' }
  },
  mapping: {
    rules: [
      { from: 'task', to: 'work_item', required: true }
    ]
  },
  agentMapping: {
    taskChaining: {
      mode: 'parallel',
      errorHandling: 'compensate'  // Handle partial failures
    }
  },
  transport: {
    stream: { broker: 'kafka', topic: 'parallel-tasks' },
    reliability: { retries: 3, backoff: 'exponential' }
  }
}
```

### Behavior
- `mode: 'parallel'` - Multiple tasks execute concurrently
- `errorHandling: 'compensate'` - Saga pattern for distributed rollback
- Requires idempotency for safe retries

## Pattern 5: Comprehensive A2A Integration

### Use Case
Full-featured agent collaboration with all agentMapping capabilities.

### Example
```javascript
{
  integration: {
    id: 'collaborative-editing',
    name: 'Multi-Agent Collaborative Editor',
    direction: 'bidirectional',
    mode: 'stream',
    lifecycle: { status: 'enabled' }
  },
  source: {
    kind_urns: { agent: 'urn:proto:agent:editor@2.0.0' },
    fields: [
      { urn: 'urn:proto:agent:editor@2.0.0#output.document', alias: 'doc' },
      { urn: 'urn:proto:agent:editor@2.0.0#output.metadata', alias: 'meta' }
    ]
  },
  destination: {
    kind_urns: { agent: 'urn:proto:agent:reviewer@2.0.0' },
    fields: [
      { urn: 'urn:proto:agent:reviewer@2.0.0#input.document', alias: 'doc' },
      { urn: 'urn:proto:agent:reviewer@2.0.0#input.context', alias: 'ctx' }
    ]
  },
  mapping: {
    rules: [
      { from: 'doc', to: 'doc', required: true },
      { from: 'meta', to: 'ctx', required: false }
    ],
    ingestion: {
      dedupe_key: 'document_id',
      idempotency: 'key'
    }
  },
  agentMapping: {
    conversationContext: {
      enabled: true,
      preserveHistory: true
    },
    artifactMapping: [
      {
        sourceArtifact: 'urn:proto:agent:editor@2.0.0#artifact.draft',
        destinationInput: 'urn:proto:agent:reviewer@2.0.0#input.draft',
        transformation: 'validate_schema'
      }
    ],
    taskChaining: {
      mode: 'sequential',
      errorHandling: 'compensate'
    }
  },
  transport: {
    stream: {
      broker: 'kafka',
      topic: 'collaborative-editing',
      consumer_group: 'reviewer-agents'
    },
    reliability: {
      retries: 3,
      backoff: 'exponential',
      dlq: 'editing-dlq'
    },
    sla: {
      timeout: '30s',
      rate_limit: '100/m'
    }
  },
  governance: {
    policy: {
      classification: 'internal',
      encryption: 'in-transit'
    }
  },
  relationships: {
    invokes_workflows: ['urn:proto:workflow:review-process@1.0.0'],
    infra_hosts: ['urn:proto:infra:agent-cluster@1.0.0']
  }
}
```

## Validation

The `agentMapping.consistency` validator checks:

### Conversation Context
- ✅ `enabled` is boolean (required)
- ✅ `preserveHistory` is boolean (optional)

### Artifact Mapping
- ✅ `artifactMapping` is array (if present)
- ✅ Each mapping has `sourceArtifact` and `destinationInput`
- ⚠️ URN format validation (warnings for invalid URNs)

### Task Chaining
- ✅ `mode` is 'sequential' or 'parallel' (required)
- ✅ `errorHandling` is 'compensate' or 'fail' (optional)

## Best Practices

1. **Idempotency**: Design agent integrations to handle duplicate messages
2. **Error Handling**: Always specify `errorHandling` for production workflows
3. **URN Consistency**: Use URNs for cross-protocol references, simple strings for internal paths
4. **Context Limits**: Set `preserveHistory: false` for long-running conversations to avoid memory issues
5. **Transformation Purity**: Keep transformation functions stateless and deterministic
6. **Retry Safety**: Use `errorHandling: 'compensate'` with parallel mode for safe retries
7. **Schema Validation**: Apply `validate_schema` transformation at integration boundaries

## Testing

All agent mapping patterns are tested in:
- `tests/integration/agent-mapping.test.js`

Coverage includes:
- ✅ Conversation context enabled/disabled
- ✅ Artifact mapping with URNs and transformations
- ✅ Sequential task chaining
- ✅ Parallel task chaining with compensation
- ✅ Comprehensive integration scenarios
- ✅ Validation error handling

## Related Protocols

- **Agent Protocol** (`agent_protocol_v_1_1_1.js`) - Agent manifest definitions
- **Workflow Protocol** (`workflow_protocol_v_1_1_1.js`) - Workflow orchestration
- **Event Protocol** (`event_protocol_v_1_1_1.js`) - Event-driven agent triggers

## Version History

- **v1.1.1** - Added `agentMapping` extension for A2A communication (Mission A2.3)
