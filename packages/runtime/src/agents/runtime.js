/**
 * Agent Runtime Surfaces
 *
 * Sprint 21 intentionally limits the runtime MCP server to discovery
 * tooling. The agent and workflow execution surfaces remain part of the
 * public contract, but they now return explicit 501 responses with
 * guidance that points operators to supported alternatives.
 */

const DOC_REF = 'docs/SPRINT_21_SURFACE_CHANGES.md#runtime-surface-triage';

const SURFACE_MESSAGES = {
  agent_run:
    'Agent execution is disabled in Sprint 21 builds. The runtime MCP server now focuses on manifest discovery and review tooling.',
  workflow_run:
    'Workflow execution is disabled in Sprint 21 builds. Offline workflows remain out of scope until the orchestration roadmap lands.',
};

const GUIDANCE = [
  'Use the protocol discovery and review tools exposed by the runtime MCP server for supported automation.',
  'For scripted orchestration, follow docs/runtime/runtime-usage-guide.md and run workflows via CI pipelines or external orchestrators.',
  'See docs/runtime/runtime-api-reference.md for the current surface area and migration notes.',
];

function createUnsupportedResponse(surface, requested = {}) {
  return {
    status: 501,
    ok: false,
    error: `${surface}_unsupported`,
    message: SURFACE_MESSAGES[surface] || 'This runtime surface is not available in the current build.',
    documentation: DOC_REF,
    guidance: GUIDANCE,
    requested,
    sprint: 'S21.2',
  };
}

/**
 * Run a workflow file with agent nodes – currently disabled.
 */
export async function runWorkflow({ workflowPath, inputs = {}, originalWorkflowPath }) {
  return createUnsupportedResponse('workflow_run', {
    workflowPath: originalWorkflowPath ?? workflowPath,
    resolvedPath: workflowPath,
    inputs,
  });
}

/**
 * Run a specific tool on an agent – currently disabled.
 */
export async function runTool({ agentUrn, tool, args = {} }) {
  return createUnsupportedResponse('agent_run', {
    agentUrn,
    tool,
    args,
  });
}
