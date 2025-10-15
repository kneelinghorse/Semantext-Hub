/**
 * Integration tests for workflow adapters
 * 
 * Tests the complete workflow execution pipeline including
 * all adapters working together in a real scenario.
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { defaultRegistry } from '../../packages/runtime/workflow/adapter-registry.js';
import { WorkflowContext } from '../../packages/runtime/workflow/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock fetch for HTTP requests
global.fetch = jest.fn();

describe('Workflow Adapter Integration', () => {
  beforeAll(() => {
    // Setup global mocks
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('End-to-End Workflow Execution', () => {
    it('should execute complete workflow with all adapter types', async () => {
      // Mock successful HTTP response
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue({ 
          success: true, 
          message: 'HTTP request successful' 
        })
      });

      const context = new WorkflowContext({
        traceId: 'integration-test-trace',
        sessionId: 'integration-session',
        userId: 'test-user',
        metadata: {
          test: 'integration',
          workflow: 'e2e-test'
        }
      });

      // Step 1: HTTP request
      const httpResult = await defaultRegistry.executeStep('http', context, {
        method: 'GET',
        url: 'https://httpbin.org/get',
        headers: {
          'User-Agent': 'Integration-Test/1.0'
        },
        timeout: 5000
      });

      expect(httpResult.status).toBe(200);
      expect(httpResult.data.success).toBe(true);

      // Step 2: Event emission
      const eventResult = await defaultRegistry.executeStep('event', context, {
        event: 'integration.test.http-success',
        data: {
          status: 'success',
          httpStatus: httpResult.status,
          timestamp: new Date().toISOString()
        },
        priority: 7,
        persistent: true
      });

      expect(eventResult.success).toBe(true);
      expect(eventResult.event).toBe('integration.test.http-success');
      expect(eventResult.traceId).toBe(context.traceId);

      // Step 3: Tool execution
      const toolResult = await defaultRegistry.executeStep('tool', context, {
        tool: 'echo',
        args: {
          message: 'Integration test completed successfully',
          httpStatus: httpResult.status,
          eventEmitted: eventResult.success,
          totalSteps: 3
        }
      });

      expect(toolResult.success).toBe(true);
      expect(toolResult.tool).toBe('echo');
      expect(toolResult.result.message).toBe('Integration test completed successfully');

      // Verify all steps completed successfully
      expect(httpResult.status).toBe(200);
      expect(eventResult.success).toBe(true);
      expect(toolResult.success).toBe(true);
    });

    it('should handle workflow with error propagation', async () => {
      // Mock HTTP error response
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Map()
      });

      const context = new WorkflowContext({
        traceId: 'error-test-trace'
      });

      // Step 1: HTTP request that fails
      await expect(
        defaultRegistry.executeStep('http', context, {
          method: 'GET',
          url: 'https://httpbin.org/status/404'
        })
      ).rejects.toThrow();

      // Step 2: Event emission for error
      const eventResult = await defaultRegistry.executeStep('event', context, {
        event: 'integration.test.error',
        data: {
          error: 'HTTP request failed',
          status: 'error',
          timestamp: new Date().toISOString()
        },
        priority: 9
      });

      expect(eventResult.success).toBe(true);
      expect(eventResult.event).toBe('integration.test.error');

      // Step 3: Tool execution for error handling
      const toolResult = await defaultRegistry.executeStep('tool', context, {
        tool: 'echo',
        args: {
          message: 'Error handling completed',
          errorOccurred: true
        }
      });

      expect(toolResult.success).toBe(true);
      expect(toolResult.result.errorOccurred).toBe(true);
    });

    it('should execute workflow with tool chaining', async () => {
      const context = new WorkflowContext({
        traceId: 'chaining-test-trace'
      });

      // Step 1: Add two numbers
      const addResult = await defaultRegistry.executeStep('tool', context, {
        tool: 'add',
        args: { a: 10, b: 20 }
      });

      expect(addResult.success).toBe(true);
      expect(addResult.result).toBe(30);

      // Step 2: Echo the result
      const echoResult = await defaultRegistry.executeStep('tool', context, {
        tool: 'echo',
        args: {
          calculation: '10 + 20',
          result: addResult.result,
          timestamp: new Date().toISOString()
        }
      });

      expect(echoResult.success).toBe(true);
      expect(echoResult.result.result).toBe(30);

      // Step 3: Emit calculation event
      const eventResult = await defaultRegistry.executeStep('event', context, {
        event: 'calculation.completed',
        data: {
          operation: 'addition',
          operands: [10, 20],
          result: addResult.result
        }
      });

      expect(eventResult.success).toBe(true);
      expect(eventResult.event).toBe('calculation.completed');
    });
  });

  describe('Workflow Runner Integration', () => {
    it('should execute workflow from JSON file', async () => {
      // Create a test workflow file
      const testWorkflow = {
        name: 'integration-test-workflow',
        version: '1.0.0',
        description: 'Integration test workflow',
        steps: [
          {
            name: 'test-http',
            adapter: 'http',
            input: {
              method: 'GET',
              url: 'https://httpbin.org/get',
              timeout: 5000
            }
          },
          {
            name: 'test-event',
            adapter: 'event',
            input: {
              event: 'integration.test',
              data: { test: 'data' }
            }
          },
          {
            name: 'test-tool',
            adapter: 'tool',
            input: {
              tool: 'echo',
              args: { message: 'Integration test completed' }
            }
          }
        ]
      };

      const workflowPath = path.join(__dirname, 'test-workflow.json');
      await fs.writeFile(workflowPath, JSON.stringify(testWorkflow, null, 2));

      try {
        // Mock successful HTTP response
        global.fetch.mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Map([['content-type', 'application/json']]),
          json: jest.fn().mockResolvedValue({ success: true })
        });

        // Execute workflow steps manually (simulating workflow runner)
        const context = new WorkflowContext({
          traceId: 'file-test-trace',
          metadata: { workflow: testWorkflow.name }
        });

        const results = [];
        let success = true;

        for (const step of testWorkflow.steps) {
          try {
            const result = await defaultRegistry.executeStep(
              step.adapter, 
              context, 
              step.input
            );
            results.push({
              step: step.name,
              success: true,
              result
            });
          } catch (error) {
            results.push({
              step: step.name,
              success: false,
              error: error.message
            });
            success = false;
            break;
          }
        }

        // Verify results
        expect(success).toBe(true);
        expect(results).toHaveLength(3);
        expect(results[0].success).toBe(true);
        expect(results[1].success).toBe(true);
        expect(results[2].success).toBe(true);

      } finally {
        // Cleanup
        await fs.remove(workflowPath);
      }
    });
  });

  describe('Adapter Registry Integration', () => {
    it('should provide complete adapter capabilities', () => {
      const capabilities = defaultRegistry.getCapabilities();
      
      expect(capabilities.adapters).toContain('http');
      expect(capabilities.adapters).toContain('event');
      expect(capabilities.adapters).toContain('tool');
      expect(capabilities.count).toBe(3);
      
      expect(capabilities.metadata.http).toBeDefined();
      expect(capabilities.metadata.event).toBeDefined();
      expect(capabilities.metadata.tool).toBeDefined();
    });

    it('should validate all adapter inputs', () => {
      // Test HTTP validation
      const httpValidation = defaultRegistry.validateStep('http', {
        method: 'GET',
        url: 'https://example.com'
      });
      expect(httpValidation.isValid).toBe(true);

      // Test Event validation
      const eventValidation = defaultRegistry.validateStep('event', {
        event: 'test.event',
        data: { message: 'test' }
      });
      expect(eventValidation.isValid).toBe(true);

      // Test Tool validation
      const toolValidation = defaultRegistry.validateStep('tool', {
        tool: 'echo',
        args: { message: 'test' }
      });
      expect(toolValidation.isValid).toBe(true);
    });

    it('should handle adapter errors gracefully', async () => {
      const context = new WorkflowContext({ traceId: 'error-handling-test' });

      // Test HTTP adapter error
      global.fetch.mockRejectedValue(new Error('Network error'));
      
      await expect(
        defaultRegistry.executeStep('http', context, {
          method: 'GET',
          url: 'https://invalid-url'
        })
      ).rejects.toThrow();

      // Test Tool adapter error
      await expect(
        defaultRegistry.executeStep('tool', context, {
          tool: 'nonexistent-tool',
          args: {}
        })
      ).rejects.toThrow();

      // Test Event adapter should still work
      const eventResult = await defaultRegistry.executeStep('event', context, {
        event: 'error.test',
        data: { error: 'handled' }
      });
      
      expect(eventResult.success).toBe(true);
    });
  });

  describe('Performance Integration', () => {
    it('should execute multiple workflows concurrently', async () => {
      const workflows = Array.from({ length: 5 }, (_, i) => ({
        context: new WorkflowContext({ traceId: `concurrent-test-${i}` }),
        steps: [
          {
            adapter: 'tool',
            input: { tool: 'echo', args: { message: `Workflow ${i}` } }
          },
          {
            adapter: 'event',
            input: { event: `concurrent.workflow.${i}`, data: { id: i } }
          }
        ]
      }));

      // Mock HTTP for any HTTP steps
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue({ success: true })
      });

      const startTime = Date.now();
      
      const results = await Promise.all(
        workflows.map(async (workflow) => {
          const stepResults = [];
          for (const step of workflow.steps) {
            const result = await defaultRegistry.executeStep(
              step.adapter,
              workflow.context,
              step.input
            );
            stepResults.push(result);
          }
          return stepResults;
        })
      );

      const duration = Date.now() - startTime;

      // Verify all workflows completed
      expect(results).toHaveLength(5);
      results.forEach((workflowResults, index) => {
        expect(workflowResults).toHaveLength(2);
        expect(workflowResults[0].success).toBe(true);
        expect(workflowResults[1].success).toBe(true);
      });

      // Performance check: should complete within reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds
    });
  });
});
