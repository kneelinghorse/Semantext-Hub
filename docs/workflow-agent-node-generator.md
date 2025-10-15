# Workflow Agent Node Generator (Mission A2.1)

This document describes how to generate executable agent task stubs from a Workflow v1.1.1 manifest.

- Status: Complete (A2.1)
- Entry points:
  - `src/workflow_protocol_v_1_1_1.js: generateAgentNodeStub(agentNode, agentManifest?)`
  - `protocol.generateAgentNodeStub(nodeIdOrNode, agentManifest?)`

## Overview

Agent steps (`type: 'agent'`) can be turned into runnable task functions. The generator produces an async function string that:

- Resolves the agent by URN or discovery URI
- Supports tool invocation and resource access stubs
- Supports prompt invocation stubs
- Adds timeout handling via `parseTimeout()` and `Promise.race`
- Captures metadata (agent URN, protocol, timestamp)
- Includes structured error handling, logging, and optional compensation hooks

## Usage

```js
import { createWorkflowProtocol } from '../packages/protocols/src/workflow_protocol_v_1_1_1.js';

const wf = createWorkflowProtocol({
  workflow: { id: 'content-pipeline' },
  steps: [
    { id: 'research', type: 'agent', agent: { urn: 'urn:proto:agent:researcher@1.1.1', tools: ['webSearch'] } },
    { id: 'write',    type: 'agent', agent: { urn: 'urn:proto:agent:writer@1.1.1', timeout: '5m' }, dependencies: ['research'] },
    { id: 'review',   type: 'agent', agent: { urn: 'urn:proto:agent:reviewer@1.1.1', tools: ['checkGrammar','checkFacts'] }, dependencies: ['write'] }
  ]
});

// Generate a stub for a specific agent step by id
const code = wf.generateAgentNodeStub('write');
console.log(code);
```

Or pass a node object directly, and optionally an agent manifest to enrich capabilities:

```js
const node = wf.manifest().steps.find(s => s.id === 'research');
const manifest = {
  capabilities: {
    tools: [{ name: 'searchCode' }],
    resources: [{ uri: 'file:///repo', name: 'codebase' }],
    prompts: [{ name: 'summarize' }]
  },
  timeout: '10m'
};

const code = wf.generateAgentNodeStub(node, manifest);
```

## Generated Function Shape

The generated code looks like:

```js
/**
 * Agent Task: write
 * Executed by: urn:proto:agent:writer@1.1.1
 * Protocol: a2a
 * Timeout: 5m
 */
async function write(ctx, inputs){
  try {
    const agent = await resolveAgent('urn:proto:agent:writer@1.1.1');
    const capabilities = { /* tools/resources/prompts from manifest */ };

    const timeoutMs = parseTimeout('5m');
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Agent task timeout: write')), timeoutMs)
    );

    // Optional: tool/resource/prompt stubs
    // ...

    const result = await Promise.race([
      agent.execute({ protocol: 'a2a', inputs, /* toolResults/resourceData/promptResults */ context: ctx }),
      timeoutPromise
    ]);

    return { status: 'completed', outputs: result, agentUrn: 'urn:proto:agent:writer@1.1.1', protocol: 'a2a', timestamp: new Date().toISOString() };
  } catch (error) {
    const errorResult = { status: 'failed', error: { message: error.message, type: error.constructor.name, agentUrn: 'urn:proto:agent:writer@1.1.1', taskId: 'write' }, timestamp: new Date().toISOString() };
    if (ctx.logger) ctx.logger.error('Agent task failed', errorResult);
    // If step declares side effects, invoke compensator when available
    // if (ctx.compensate) await ctx.compensate('write', errorResult);
    throw error;
  }
}

function parseTimeout(str){ /* '10s'|'5m'|'1h' -> ms */ }
```

## Inputs and Outputs

- Inputs: The generated function receives an `inputs` object and forwards it to `agent.execute({ inputs })`. Map workflow step inputs at orchestration time or pre-process before invoking the function.
- Outputs: The function returns a structured object containing `status`, `outputs`, optional `toolResults`, `resourceData`, and `promptResults`, plus metadata.

## Capabilities

- Tools: For each tool in capabilities, a `Promise.race([ agent.invokeTool(...), timeoutPromise ])` stub is produced and collected into `toolResults`.
- Resources: For each resource, a `Promise.race([ agent.accessResource(...), timeoutPromise ])` stub is produced and collected into `resourceData`.
- Prompts: For each prompt, a `Promise.race([ agent.invokePrompt(...), timeoutPromise ])` stub is produced and collected into `promptResults`.

## Timeouts and Errors

- Timeouts: Configurable per agent via `agent.timeout` or the provided agent manifest `timeout`; defaults to `30s`.
- Errors: Structured error payload includes message, type, agent URN, and task id. If `side_effects` is declared on the step, the stub includes a compensation hint guarded by `if (ctx.compensate)`.

## Assumptions

- Agents are resolved at runtime via a registry: `resolveAgent(urnOrUri)` is provided by the host environment.
- Tool/resource schemas are declared in the agent manifest and used to scaffold stub shapes only. Validation is out of scope for this generator.

## Tests

- File: `tests/workflow/agent-node-generator.test.js`
- Coverage: simple agent task, tools, resources, prompts, timeouts, delegation, error handling, and multi-agent orchestration.
- Note: The repository contains other suites that use CommonJS; only the agent node generator tests are relevant to A2.1 and they pass.

