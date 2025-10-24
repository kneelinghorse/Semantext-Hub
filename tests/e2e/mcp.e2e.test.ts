import path from 'path';
import fs from 'fs/promises';
import { spawnMCPWithA2AStub } from '../_helpers/mcp-spawn';

function parseMCPContent(result: any): any {
  // mcp-client wraps tool result as { content: [{ type:'text', text: JSON.stringify(actual) }] }
  const txt = result?.content?.[0]?.text;
  if (!txt) throw new Error('Missing MCP content text');
  return JSON.parse(txt);
}

describe('MCP E2E smoke path', () => {
  test('list_test_files → discover_local → docs_mermaid; agent_run + workflow_run return 501 guidance', async () => {
    const { client, stop } = await spawnMCPWithA2AStub({ enableLogging: true });
    try {
      // 1) Ensure required tools exposed
      const tools = await client.listTools();
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toEqual(expect.arrayContaining([
        'protocol_list_test_files',
        'protocol_discover_local',
        'docs_mermaid',
      ]));

      // 2) Call protocol_list_test_files
      const listRes = await client.executeTool('protocol_list_test_files', {});
      const listObj = parseMCPContent(listRes);
      expect(listObj.success).toBe(true);
      expect(Array.isArray(listObj.test_files)).toBe(true);
      expect(listObj.test_files.length).toBeGreaterThan(0);
      const seed = listObj.test_files[0];
      expect(seed.relative_path).toMatch(/seeds\/openapi\/.*\/spec\.json$/);

      // 3) Call protocol_discover_local on selected seed
      const discRes = await client.executeTool('protocol_discover_local', { file_path: seed.relative_path });
      const discObj = parseMCPContent(discRes);
      expect(discObj.success).toBe(true);
      expect(typeof discObj.manifest).toBe('object');

      // 4) Call docs_mermaid on a known catalog dir with .json manifests (approved)
      const mermaidRes = await client.executeTool('docs_mermaid', { manifest_dir: 'approved' });
      const mermaidObj = parseMCPContent(mermaidRes);
      expect(mermaidObj.success).toBe(true);
      expect(typeof mermaidObj.diagram).toBe('string');
      expect(mermaidObj.nodeCount).toBeGreaterThanOrEqual(1);
      expect(mermaidObj.edgeCount).toBeGreaterThanOrEqual(0);

      // 5) agent_run now returns explicit 501 guidance
      const agentRunRes = await client.executeTool('agent_run', {
        agent_urn: 'urn:agent:runtime:agent@latest',
        tool: 'echo',
        args: { message: 'hello' }
      });
      const agentRunObj = parseMCPContent(agentRunRes);
      expect(agentRunObj.status).toBe(501);
      expect(agentRunObj.ok).toBe(false);
      expect(agentRunObj.error).toBe('agent_run_unsupported');
      expect(agentRunObj.requested.agentUrn).toBe('urn:agent:runtime:agent@latest');
      expect(agentRunObj.requested.tool).toBe('echo');
      expect(Array.isArray(agentRunObj.guidance)).toBe(true);
      expect(agentRunObj.documentation).toContain('docs/SPRINT_21_SURFACE_CHANGES.md');

      // 6) workflow_run also returns explicit 501 guidance
      const tmpDir = path.join(process.cwd(), 'tests', '_tmp');
      await fs.mkdir(tmpDir, { recursive: true });
      const wfPath = path.join(tmpDir, 'workflow.json');
      const wf = {
        apiVersion: 'v1',
        kind: 'Workflow',
        spec: {
          nodes: [
            {
              id: 'n1',
              type: 'agent',
              agent: {
                protocol: 'a2a',
                discoveryUri: 'http://localhost:0',
                skill: 'echo',
                inputMapping: { message: 'hello' },
                outputMapping: { result: 'workflow.outputs.result' }
              }
            }
          ]
        }
      };
      await fs.writeFile(wfPath, JSON.stringify(wf));

      const workflowRelativePath = path.relative(process.cwd(), wfPath);
      const wfRes = await client.executeTool('workflow_run', { workflow_path: workflowRelativePath });
      const wfObj = parseMCPContent(wfRes);
      expect(wfObj.status).toBe(501);
      expect(wfObj.ok).toBe(false);
      expect(wfObj.error).toBe('workflow_run_unsupported');
      expect(wfObj.requested.workflowPath).toBe(workflowRelativePath);
      expect(wfObj.requested.resolvedPath).toContain('tests/_tmp/workflow.json');
      expect(Array.isArray(wfObj.guidance)).toBe(true);

    } finally {
      await stop();
    }
  }, 15000);
});
