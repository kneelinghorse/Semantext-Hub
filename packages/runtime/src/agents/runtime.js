/**
 * Agent Runtime
 * 
 * Thin runtime for executing agent type nodes in workflows.
 * Supports A2A protocol, MCP, and custom agent protocols.
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { parseYamlOrJson } from '../../util/io.js';
import { createA2AClient } from '../../runtime/a2a-client.js';
import { createAuthProvider } from '../../runtime/a2a-auth.js';
import { A2AError, AuthError, TimeoutError } from '../../runtime/a2a-types.js';
import { authorize } from '../../security/iam.mjs';

/**
 * @typedef {Object} AgentCall
 * @property {'a2a'|'mcp'|'custom'} [protocol] - Agent protocol
 * @property {string} [endpoint] - Agent endpoint URL
 * @property {string} skill - Skill/tool name to execute
 * @property {any} input - Input parameters for the skill
 */

/**
 * Run a workflow file with agent nodes
 * @param {Object} params
 * @param {string} params.workflowPath - Path to workflow file
 * @param {Object} [params.inputs] - Workflow inputs
 * @param {string} params.root - Root directory for path resolution
 * @returns {Promise<Object>} Workflow execution result
 */
export async function runWorkflow({ workflowPath, inputs = {}, root }) {
  const wf = await parseYamlOrJson(workflowPath);
  const ctx = { 
    workflow: { inputs }, 
    node: {} 
  };

  // Execute nodes in sequence
  for (const n of (wf.spec?.nodes || [])) {
    if (n.type !== 'agent') continue;

    // Delegation guard (stub - implement IAM validation if needed)
    if (n.agent?.delegation?.urn) {
      // await validateDelegation(n.agent.delegation.urn, { action: n.agent.skill });
      console.log(`[Delegation check for ${n.agent.delegation.urn}]`);
    }

    // Resolve agent endpoint and protocol
    let agentMeta = {};
    if (n.agent?.urn) {
      // In a real implementation, this would resolve from catalog
      // For now, use discoveryUri if provided
      agentMeta = {
        endpoints: { a2a: n.agent.discoveryUri },
        protocol: n.agent.protocol || 'a2a'
      };
    } else if (n.agent?.discoveryUri) {
      agentMeta = {
        endpoints: { a2a: n.agent.discoveryUri },
        protocol: n.agent.protocol || 'a2a'
      };
    }

    const call = {
      protocol: n.agent?.protocol || agentMeta.protocol || 'a2a',
      endpoint: agentMeta.endpoints?.[n.agent?.protocol || 'a2a'] || n.agent?.discoveryUri,
      skill: n.agent?.skill,
      input: mapInputs(n.agent?.inputMapping, ctx)
    };

    // Execute agent call
    const result = await execAgent(call);
    
    // Store result in context
    ctx.node[n.id] = { 
      outputs: result.outputs || {}, 
      artifacts: result.artifacts || [] 
    };

    // Map outputs to context
    if (n.agent?.outputMapping) {
      applyOutputMapping(n.agent.outputMapping, ctx, n.id);
    }
  }
  
  return { 
    state: 'completed', 
    outputs: ctx.node 
  };
}

/**
 * Run a specific tool on an agent
 * @param {Object} params
 * @param {string} params.agentUrn - Agent URN
 * @param {string} params.tool - Tool name
 * @param {Object} params.args - Tool arguments
 * @param {string} params.root - Root directory
 * @returns {Promise<Object>} Tool execution result
 */
export async function runTool({ agentUrn, tool, args, root }) {
  // In real implementation, resolve agent from catalog
  // For now, return a stub response
  const agent = {
    endpoints: { a2a: `http://agent/${agentUrn}` },
    protocol: 'a2a'
  };
  
  return execAgent({ 
    protocol: 'a2a', 
    endpoint: agent.endpoints?.a2a, 
    skill: tool, 
    input: args 
  });
}

// Helper functions

/**
 * Map inputs from context using mapping configuration
 * @param {Object} mapping - Input mapping configuration
 * @param {Object} ctx - Execution context
 * @returns {Object} Mapped inputs
 */
function mapInputs(mapping, ctx) {
  if (!mapping) return {};
  
  const out = {};
  for (const [k, v] of Object.entries(mapping)) {
    out[k] = resolveTemplate(String(v), ctx);
  }
  return out;
}

/**
 * Apply output mapping to context
 * @param {Object} mapping - Output mapping configuration
 * @param {Object} ctx - Execution context
 * @param {string} nodeId - Current node ID
 */
function applyOutputMapping(mapping, ctx, nodeId) {
  for (const [k, v] of Object.entries(mapping)) {
    const value = ctx.node[nodeId]?.outputs?.[k] ?? ctx.node[nodeId]?.artifacts?.[0];
    setPath(ctx, v, value);
  }
}

/**
 * Resolve template strings with context values
 * @param {string} tpl - Template string with ${...} placeholders
 * @param {Object} ctx - Context object
 * @returns {string} Resolved string
 */
function resolveTemplate(tpl, ctx) {
  // Ultra-light template resolver for ${node.research.outputs.summary} patterns
  return tpl.replace(/\$\{([^}]+)\}/g, (_, p) => getPath(ctx, p));
}

/**
 * Get value from object using dot notation path
 * @param {Object} obj - Object to traverse
 * @param {string} path - Dot notation path
 * @returns {any} Value at path
 */
function getPath(obj, path) {
  return path.split('.').reduce((a, k) => a?.[k], obj);
}

/**
 * Set value in object using dot notation path
 * @param {Object} obj - Object to modify
 * @param {string} path - Dot notation path
 * @param {any} value - Value to set
 */
function setPath(obj, path, value) {
  const parts = path.split('.');
  const last = parts.pop();
  const target = parts.reduce((a, k) => (a[k] ??= {}), obj);
  target[last] = value;
}

/**
 * Execute agent call based on protocol
 * @param {AgentCall} call - Agent call configuration
 * @returns {Promise<Object>} Execution result
 */
async function execAgent(call) {
  if (call.protocol === 'a2a') {
    try {
      // Create A2A client with auth provider
      const authProvider = createAuthProvider({
        type: process.env.A2A_AUTH_TYPE || 'default',
        token: process.env.A2A_TOKEN,
        tokenEnvVar: process.env.A2A_TOKEN_ENV_VAR || 'A2A_TOKEN'
      });

      const client = createA2AClient({
        authProvider,
        baseUrl: process.env.A2A_BASE_URL || 'http://localhost:3000',
        timeout: parseInt(process.env.A2A_TIMEOUT) || 30000,
        maxRetries: parseInt(process.env.A2A_MAX_RETRIES) || 3,
        enableLogging: process.env.A2A_ENABLE_LOGGING !== 'false'
      });

      // Extract agent URN from endpoint or use a default format
      const agentUrn = extractAgentUrnFromEndpoint(call.endpoint) || 
                      `urn:agent:runtime:agent@latest`;

      // IAM: authorize agent execution (permissive by default)
      const agentId = process.env.AGENT_ID || 'mcp:codex';
      const resourceUrn = agentUrn || call.endpoint || 'urn:unknown:resource';
      await authorize(agentId, 'execute', resourceUrn);

      // Make A2A request
      const response = await client.request(agentUrn, `/skills/${call.skill}`, {
        method: 'POST',
        body: call.input,
        context: {
          currentAgentUrn: process.env.CURRENT_AGENT_URN || 'urn:agent:runtime:agent@latest'
        }
      });

      // Transform A2A response to expected format
      return {
        outputs: response.data.outputs || response.data,
        artifacts: response.data.artifacts || []
      };

    } catch (error) {
      // Handle A2A-specific errors
      if (error instanceof AuthError) {
        console.error(`[A2A Auth Error] ${error.message}`);
        return {
          outputs: { 
            error: 'authentication_failed',
            message: error.message 
          },
          artifacts: []
        };
      }

      if (error instanceof TimeoutError) {
        console.error(`[A2A Timeout Error] ${error.message}`);
        return {
          outputs: { 
            error: 'timeout',
            message: error.message 
          },
          artifacts: []
        };
      }

      if (error instanceof A2AError) {
        console.error(`[A2A Error] ${error.message}`);
        return {
          outputs: { 
            error: 'a2a_failed',
            message: error.message 
          },
          artifacts: []
        };
      }

      // Fallback for other errors
      console.error(`[A2A Unknown Error] ${error.message}`);
      return {
        outputs: { 
          error: 'unknown',
          message: error.message 
        },
        artifacts: []
      };
    }
  }
  
  if (call.protocol === 'mcp') {
    // In real implementation, call MCP tool by name
    console.log(`[MCP call - skill: ${call.skill}]`);
    return { 
      outputs: { 
        ok: true,
        message: `Executed ${call.skill} via MCP`
      }, 
      artifacts: [] 
    };
  }
  
  // Default/custom protocol
  console.log(`[Custom protocol call - skill: ${call.skill}]`);
  return { 
    outputs: { 
      ok: true,
      message: `Executed ${call.skill} via custom protocol`
    }, 
    artifacts: [] 
  };
}

/**
 * Extract agent URN from endpoint URL
 * @param {string} endpoint - Endpoint URL
 * @returns {string|null} Agent URN or null
 */
function extractAgentUrnFromEndpoint(endpoint) {
  if (!endpoint) return null;
  
  // Try to extract URN from endpoint
  // This is a simple heuristic - in production, this would be more sophisticated
  const match = endpoint.match(/\/agents\/([^\/]+)/);
  if (match) {
    const [, agentId] = match;
    return `urn:agent:runtime:${agentId}@latest`;
  }
  
  return null;
}
