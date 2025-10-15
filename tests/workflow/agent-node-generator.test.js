/**
 * Agent Node Generator Tests
 * Tests for workflow agent node stub generation
 */

import { createWorkflowProtocol, generateAgentNodeStub } from '../../packages/protocols/src/workflow_protocol_v_1_1_1.js';

describe('Agent Node Generator', () => {
  describe('Simple Agent Task', () => {
    test('generates basic agent node stub', () => {
      const agentNode = {
        id: 'writeArticle',
        type: 'agent',
        agent: {
          urn: 'urn:proto:agent:writer@1.1.1',
          protocol: 'a2a'
        }
      };

      const code = generateAgentNodeStub(agentNode);

      expect(code).toContain('async function writeArticle');
      expect(code).toContain('urn:proto:agent:writer@1.1.1');
      expect(code).toContain('resolveAgent');
      expect(code).toContain('Protocol: a2a');
      expect(code).toContain('Timeout: 30s'); // default
      expect(code).toContain('parseTimeout');
      expect(code).toContain('status: \'completed\'');
      expect(code).toContain('catch (error)');
    });

    test('includes custom timeout', () => {
      const agentNode = {
        id: 'longTask',
        type: 'agent',
        agent: {
          urn: 'urn:proto:agent:processor@1.1.1',
          timeout: '5m'
        }
      };

      const code = generateAgentNodeStub(agentNode);

      expect(code).toContain('Timeout: 5m');
      expect(code).toContain('parseTimeout(\'5m\')');
    });

    test('supports discoveryUri instead of urn', () => {
      const agentNode = {
        id: 'dynamicAgent',
        type: 'agent',
        agent: {
          discoveryUri: 'https://agent-registry.example.com/agents/writer'
        }
      };

      const code = generateAgentNodeStub(agentNode);

      expect(code).toContain('https://agent-registry.example.com/agents/writer');
      expect(code).toContain('async function dynamicAgent');
    });

    test('generates valid executable code structure', () => {
      const agentNode = {
        id: 'testAgent',
        type: 'agent',
        agent: { urn: 'urn:proto:agent:test@1.0.0' }
      };

      const code = generateAgentNodeStub(agentNode);

      // Check for proper async function structure
      expect(code).toMatch(/async function testAgent\(ctx, inputs\)/);
      expect(code).toContain('try {');
      expect(code).toContain('} catch (error) {');
      expect(code).toContain('return {');
      expect(code).toContain('throw error;');
    });
  });

  describe('Agent with Tools', () => {
    test('generates tool invocation stubs', () => {
      const agentNode = {
        id: 'codeAgent',
        type: 'agent',
        agent: {
          urn: 'urn:proto:agent:coder@1.1.1',
          tools: ['searchCode', 'editFile', 'runTests']
        }
      };

      const code = generateAgentNodeStub(agentNode);

      expect(code).toContain('const toolResults = {}');
      expect(code).toContain('toolResults.searchCode');
      expect(code).toContain('toolResults.editFile');
      expect(code).toContain('toolResults.runTests');
      expect(code).toContain('agent.invokeTool(\'searchCode\'');
      expect(code).toContain('agent.invokeTool(\'editFile\'');
      expect(code).toContain('agent.invokeTool(\'runTests\'');
      expect(code).toContain('inputs.searchCode || {}');
    });

    test('generates tool invocations from manifest capabilities', () => {
      const agentNode = {
        id: 'smartAgent',
        type: 'agent',
        agent: { urn: 'urn:proto:agent:smart@1.1.1' }
      };

      const agentManifest = {
        capabilities: {
          tools: [
            { name: 'webSearch', inputSchema: { type: 'object' } },
            { name: 'calculator', outputSchema: { type: 'number' } }
          ]
        }
      };

      const code = generateAgentNodeStub(agentNode, agentManifest);

      expect(code).toContain('toolResults.webSearch');
      expect(code).toContain('toolResults.calculator');
      expect(code).toContain('agent.invokeTool(\'webSearch\'');
      expect(code).toContain('agent.invokeTool(\'calculator\'');
    });

    test('includes tool results in output', () => {
      const agentNode = {
        id: 'agentWithTools',
        type: 'agent',
        agent: {
          urn: 'urn:proto:agent:helper@1.1.1',
          tools: ['translate']
        }
      };

      const code = generateAgentNodeStub(agentNode);

      expect(code).toContain('toolResults,');
      expect(code).toMatch(/outputs:.*toolResults,/s);
    });
  });

  describe('Agent with Resources', () => {
    test('generates resource access stubs', () => {
      const agentNode = {
        id: 'dataAgent',
        type: 'agent',
        agent: {
          urn: 'urn:proto:agent:data@1.1.1',
          resources: ['file:///data/config.json', 'https://api.example.com/data']
        }
      };

      const code = generateAgentNodeStub(agentNode);

      expect(code).toContain('const resourceData = {}');
      expect(code).toContain('agent.accessResource(\'file:///data/config.json\')');
      expect(code).toContain('agent.accessResource(\'https://api.example.com/data\')');
      expect(code).toContain('resourceData.config_json');
      expect(code).toContain('resourceData.data');
    });

    test('generates resource access from manifest capabilities', () => {
      const agentNode = {
        id: 'resourceAgent',
        type: 'agent',
        agent: { urn: 'urn:proto:agent:res@1.1.1' }
      };

      const agentManifest = {
        capabilities: {
          resources: [
            { uri: 'file:///repo/README.md', name: 'readme', mimeType: 'text/markdown' },
            { uri: 'postgres://db/users', name: 'userDb' }
          ]
        }
      };

      const code = generateAgentNodeStub(agentNode, agentManifest);

      expect(code).toContain('resourceData.readme');
      expect(code).toContain('resourceData.userDb');
      expect(code).toContain('agent.accessResource(\'file:///repo/README.md\')');
      expect(code).toContain('agent.accessResource(\'postgres://db/users\')');
    });

    test('includes resource data in output', () => {
      const agentNode = {
        id: 'agentWithRes',
        type: 'agent',
        agent: {
          urn: 'urn:proto:agent:res@1.1.1',
          resources: ['file:///test.txt']
        }
      };

      const code = generateAgentNodeStub(agentNode);

      expect(code).toContain('resourceData,');
      expect(code).toMatch(/outputs:.*resourceData,/s);
    });
  });

  describe('Agent with Prompts', () => {
    test('generates prompt invocation stubs', () => {
      const agentManifest = {
        capabilities: {
          prompts: [
            { name: 'summarize', arguments: ['text', 'maxLength'] },
            { name: 'translate' }
          ]
        }
      };

      const agentNode = {
        id: 'promptAgent',
        type: 'agent',
        agent: { urn: 'urn:proto:agent:llm@1.1.1' }
      };

      const code = generateAgentNodeStub(agentNode, agentManifest);

      expect(code).toContain('const promptResults = {}');
      expect(code).toContain('promptResults.summarize');
      expect(code).toContain('promptResults.translate');
      expect(code).toContain('agent.invokePrompt(\'summarize\'');
      expect(code).toContain('agent.invokePrompt(\'translate\'');
    });
  });

  describe('Timeout Handling', () => {
    test('generates timeout promise for all operations', () => {
      const agentNode = {
        id: 'timedAgent',
        type: 'agent',
        agent: {
          urn: 'urn:proto:agent:timed@1.1.1',
          timeout: '10s',
          tools: ['longOp'],
          resources: ['file:///data.json']
        }
      };

      const code = generateAgentNodeStub(agentNode);

      expect(code).toContain('const timeoutMs = parseTimeout(\'10s\')');
      expect(code).toContain('const timeoutPromise = new Promise');
      expect(code).toContain('setTimeout');
      expect(code).toContain('Agent task timeout: timedAgent');
      expect(code).toContain('Promise.race([');
      // All async operations should race with timeout
      const raceCount = (code.match(/Promise\.race\(/g) || []).length;
      expect(raceCount).toBeGreaterThan(1); // tool + resource + execute
    });

    test('includes timeout parsing helper', () => {
      const agentNode = {
        id: 'agent',
        type: 'agent',
        agent: { urn: 'urn:proto:agent:test@1.1.1' }
      };

      const code = generateAgentNodeStub(agentNode);

      expect(code).toContain('function parseTimeout(str)');
      expect(code).toContain('case \'ms\': return n;');
      expect(code).toContain('case \'s\': return n * 1000;');
      expect(code).toContain('case \'m\': return n * 60 * 1000;');
      expect(code).toContain('case \'h\': return n * 60 * 60 * 1000;');
      expect(code).toContain('default: return 30000');
    });
  });

  describe('IAM Delegation Support', () => {
    test('includes delegation validation when configured', () => {
      const agentNode = {
        id: 'delegatedAgent',
        type: 'agent',
        agent: {
          urn: 'urn:proto:agent:payment@1.1.1',
          delegation: {
            urn: 'urn:proto:iam:delegation@1.1.2#deleg-123'
          }
        }
      };

      const code = generateAgentNodeStub(agentNode);

      expect(code).toContain('Delegation: urn:proto:iam:delegation@1.1.2#deleg-123');
      expect(code).toContain('const delegation = await validateDelegation');
      expect(code).toContain('ctx.principal');
      expect(code).toContain('if (!delegation.valid)');
      expect(code).toContain('Delegation invalid or expired');
    });

    test('omits delegation when not configured', () => {
      const agentNode = {
        id: 'noDelegation',
        type: 'agent',
        agent: { urn: 'urn:proto:agent:simple@1.1.1' }
      };

      const code = generateAgentNodeStub(agentNode);

      expect(code).not.toContain('validateDelegation');
      expect(code).not.toContain('Delegation:');
    });
  });

  describe('Error Handling', () => {
    test('includes comprehensive error handling', () => {
      const agentNode = {
        id: 'errorAgent',
        type: 'agent',
        agent: { urn: 'urn:proto:agent:err@1.1.1' }
      };

      const code = generateAgentNodeStub(agentNode);

      expect(code).toContain('catch (error)');
      expect(code).toContain('status: \'failed\'');
      expect(code).toContain('error: {');
      expect(code).toContain('message: error.message');
      expect(code).toContain('type: error.constructor.name');
      expect(code).toContain('agentUrn:');
      expect(code).toContain('taskId:');
      expect(code).toContain('timestamp:');
      expect(code).toContain('throw error');
    });

    test('includes logging for observability', () => {
      const agentNode = {
        id: 'loggedAgent',
        type: 'agent',
        agent: { urn: 'urn:proto:agent:log@1.1.1' }
      };

      const code = generateAgentNodeStub(agentNode);

      expect(code).toContain('if (ctx.logger)');
      expect(code).toContain('ctx.logger.error');
      expect(code).toContain('Agent task failed');
    });

    test('includes compensation hint for side-effects', () => {
      const agentNode = {
        id: 'sideEffectAgent',
        type: 'agent',
        agent: { urn: 'urn:proto:agent:se@1.1.1' },
        side_effects: true
      };

      const code = generateAgentNodeStub(agentNode);

      expect(code).toContain('if (ctx.compensate)');
      expect(code).toContain('await ctx.compensate(\'sideEffectAgent\'');
    });

    test('omits compensation for no side-effects', () => {
      const agentNode = {
        id: 'noSideEffects',
        type: 'agent',
        agent: { urn: 'urn:proto:agent:nse@1.1.1' }
      };

      const code = generateAgentNodeStub(agentNode);

      expect(code).toContain('// No side-effects declared');
      expect(code).not.toContain('await ctx.compensate');
    });
  });

  describe('Multi-Agent Orchestration', () => {
    test('workflow with multiple agent nodes', () => {
      const workflow = createWorkflowProtocol({
        workflow: {
          id: 'multi-agent-flow',
          name: 'Multi-Agent Workflow'
        },
        steps: [
          {
            id: 'research',
            type: 'agent',
            agent: {
              urn: 'urn:proto:agent:researcher@1.1.1',
              tools: ['webSearch', 'readPaper']
            }
          },
          {
            id: 'analyze',
            type: 'agent',
            agent: {
              urn: 'urn:proto:agent:analyst@1.1.1',
              resources: ['file:///research-data.json']
            },
            dependencies: ['research']
          },
          {
            id: 'write',
            type: 'agent',
            agent: {
              urn: 'urn:proto:agent:writer@1.1.1',
              timeout: '5m'
            },
            dependencies: ['analyze']
          }
        ]
      });

      const researchCode = workflow.generateAgentNodeStub('research');
      const analyzeCode = workflow.generateAgentNodeStub('analyze');
      const writeCode = workflow.generateAgentNodeStub('write');

      expect(researchCode).toContain('async function research');
      expect(researchCode).toContain('webSearch');
      expect(researchCode).toContain('readPaper');

      expect(analyzeCode).toContain('async function analyze');
      expect(analyzeCode).toContain('research-data.json');

      expect(writeCode).toContain('async function write');
      expect(writeCode).toContain('Timeout: 5m');
    });

    test('validates agent steps exist', () => {
      const workflow = createWorkflowProtocol({
        workflow: { id: 'test' },
        steps: [
          { id: 'task1', type: 'service', service: 'api.call' }
        ]
      });

      expect(() => workflow.generateAgentNodeStub('nonexistent'))
        .toThrow('Step not found');
      expect(() => workflow.generateAgentNodeStub('task1'))
        .toThrow('is not an agent step');
    });
  });

  describe('Protocol Instance Method', () => {
    test('protocol exposes generateAgentNodeStub method', () => {
      const workflow = createWorkflowProtocol({
        workflow: { id: 'test' },
        steps: [
          {
            id: 'agent1',
            type: 'agent',
            agent: { urn: 'urn:proto:agent:test@1.1.1' }
          }
        ]
      });

      expect(workflow.generateAgentNodeStub).toBeDefined();
      expect(typeof workflow.generateAgentNodeStub).toBe('function');

      const code = workflow.generateAgentNodeStub('agent1');
      expect(code).toContain('async function agent1');
    });

    test('supports passing node object directly', () => {
      const workflow = createWorkflowProtocol({
        workflow: { id: 'test' },
        steps: [
          {
            id: 'directAgent',
            type: 'agent',
            agent: { urn: 'urn:proto:agent:direct@1.1.1' }
          }
        ]
      });

      const node = workflow.manifest().steps[0];
      const code = workflow.generateAgentNodeStub(node);

      expect(code).toContain('async function directAgent');
    });

    test('supports agent manifest parameter', () => {
      const workflow = createWorkflowProtocol({
        workflow: { id: 'test' },
        steps: [
          {
            id: 'configured',
            type: 'agent',
            agent: { urn: 'urn:proto:agent:cfg@1.1.1' }
          }
        ]
      });

      const manifest = {
        capabilities: {
          tools: [{ name: 'customTool' }],
          resources: [{ uri: 'file:///custom.json', name: 'custom' }]
        },
        timeout: '2m'
      };

      const code = workflow.generateAgentNodeStub('configured', manifest);

      expect(code).toContain('customTool');
      expect(code).toContain('custom.json');
      expect(code).toContain('Timeout: 2m');
    });
  });

  describe('Integration with Workflow Validation', () => {
    test('workflow validates agent node structure', () => {
      const workflow = createWorkflowProtocol({
        workflow: { id: 'test' },
        steps: [
          {
            id: 'badAgent',
            type: 'agent',
            agent: {} // Missing urn or discoveryUri
          }
        ]
      });

      const validation = workflow.validate();
      expect(validation.ok).toBe(false);
      expect(validation.results.some(r =>
        r.issues?.some(i => i.path.includes('agent'))
      )).toBe(true);
    });

    test('workflow validates delegation when provided', () => {
      const workflow = createWorkflowProtocol({
        workflow: { id: 'test' },
        steps: [
          {
            id: 'delegated',
            type: 'agent',
            agent: {
              urn: 'urn:proto:agent:test@1.1.1',
              delegation: {} // Missing urn
            }
          }
        ]
      });

      const validation = workflow.validate();
      expect(validation.ok).toBe(false);
      expect(validation.results.some(r =>
        r.issues?.some(i => i.path.includes('delegation.urn'))
      )).toBe(true);
    });
  });

  describe('Complex Scenarios', () => {
    test('agent with all capabilities combined', () => {
      const agentNode = {
        id: 'fullAgent',
        type: 'agent',
        agent: {
          urn: 'urn:proto:agent:full@1.1.1',
          protocol: 'mcp',
          timeout: '10m',
          tools: ['tool1', 'tool2'],
          resources: ['file:///data.json'],
          delegation: { urn: 'urn:proto:iam:delegation@1.1.2#d1' }
        },
        side_effects: true
      };

      const agentManifest = {
        capabilities: {
          prompts: [{ name: 'analyze' }]
        }
      };

      const code = generateAgentNodeStub(agentNode, agentManifest);

      // Check all features present
      expect(code).toContain('Protocol: mcp');
      expect(code).toContain('Timeout: 10m');
      expect(code).toContain('Delegation: urn:proto:iam:delegation@1.1.2#d1');
      expect(code).toContain('toolResults.tool1');
      expect(code).toContain('toolResults.tool2');
      expect(code).toContain('resourceData.data_json');
      expect(code).toContain('promptResults.analyze');
      expect(code).toContain('await ctx.compensate');
      expect(code).toContain('validateDelegation');
    });

    test('generated code includes proper timestamps', () => {
      const agentNode = {
        id: 'timestamped',
        type: 'agent',
        agent: { urn: 'urn:proto:agent:ts@1.1.1' }
      };

      const code = generateAgentNodeStub(agentNode);

      expect(code).toContain('timestamp: new Date().toISOString()');
      // Should appear in both success and error paths
      const timestampCount = (code.match(/timestamp:/g) || []).length;
      expect(timestampCount).toBeGreaterThanOrEqual(2);
    });

    test('generated code includes metadata in outputs', () => {
      const agentNode = {
        id: 'metaAgent',
        type: 'agent',
        agent: {
          urn: 'urn:proto:agent:meta@1.1.1',
          protocol: 'custom'
        }
      };

      const code = generateAgentNodeStub(agentNode);

      expect(code).toContain('agentUrn: \'urn:proto:agent:meta@1.1.1\'');
      expect(code).toContain('protocol: \'custom\'');
      expect(code).toContain('timestamp:');
    });
  });
});
