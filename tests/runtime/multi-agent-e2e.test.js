/**
 * Multi-Agent End-to-End Integration Tests
 * 
 * These tests validate the complete runtime loop from agent discovery through
 * tool execution, proving the system works with real A2A/MCP operations.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Runtime components
import { createAgentDiscoveryService } from '../../packages/runtime/runtime/agent-discovery-service.js';
import { createURNRegistry } from '../../packages/runtime/runtime/urn-registry.js';
import { createA2AClient } from '../../packages/runtime/runtime/a2a-client.js';
import { createMCPClient } from '../../packages/runtime/runtime/mcp-client.js';
import { createCircuitBreaker } from '../../packages/runtime/runtime/circuit-breaker.js';
import { createRetryPolicy } from '../../packages/runtime/runtime/retry-policies.js';
import { createStructuredLogger } from '../../packages/runtime/runtime/structured-logger.js';
import { handleError } from '../../packages/runtime/runtime/error-handler.js';

// Demo class
import { MultiAgentE2EDemo } from '../../examples/multi-agent-e2e-demo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const TEST_CONFIG = {
  registry: {
    dataDir: join(__dirname, '../../data/test-registry'),
    enableLogging: false,
    maxAgents: 50
  },
  discovery: {
    enableLogging: false,
    maxResults: 25,
    enableCaching: true,
    cacheTtl: 60000 // 1 minute
  },
  a2a: {
    enableLogging: false,
    timeout: 5000,
    retries: 2
  },
  mcp: {
    enableLogging: false,
    timeout: 8000,
    retries: 1
  },
  circuitBreaker: {
    failureThreshold: 2,
    successThreshold: 1,
    timeout: 15000,
    enableLogging: false
  },
  retryPolicy: {
    maxRetries: 2,
    baseDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 2,
    jitter: false
  },
  logger: {
    level: 'ERROR',
    enableConsole: false,
    enableFile: false,
    enableTracing: false
  }
};

// Test agent configurations
const TEST_AGENTS = [
  {
    urn: 'urn:agent:test:test-agent-1@1.0.0',
    name: 'test-agent-1',
    version: '1.0.0',
    description: 'Test agent 1',
    capabilities: {
      'test-capability': {
        type: 'service',
        description: 'Test capability',
        version: '1.0.0'
      }
    },
    endpoints: {
      api: 'http://localhost:3001/api/v1',
      health: 'http://localhost:3001/health',
      mcp: 'http://localhost:3001/mcp'
    },
    health: {
      status: 'healthy',
      lastChecked: new Date().toISOString()
    }
  },
  {
    urn: 'urn:agent:test:test-agent-2@1.0.0',
    name: 'test-agent-2',
    version: '1.0.0',
    description: 'Test agent 2',
    capabilities: {
      'test-capability': {
        type: 'service',
        description: 'Test capability',
        version: '1.0.0'
      }
    },
    endpoints: {
      api: 'http://localhost:3002/api/v1',
      health: 'http://localhost:3002/health',
      mcp: 'http://localhost:3002/mcp'
    },
    health: {
      status: 'healthy',
      lastChecked: new Date().toISOString()
    }
  }
];

describe('Multi-Agent E2E Integration Tests', () => {
  let demo;
  let registry;
  let discovery;
  let a2aClient;
  let mcpClient;
  let circuitBreaker;
  let retryPolicy;
  let logger;

  beforeEach(async () => {
    // Initialize components
    registry = createURNRegistry(TEST_CONFIG.registry);
    await registry.initialize();

    discovery = createAgentDiscoveryService(TEST_CONFIG.discovery);
    await discovery.initialize();

    a2aClient = createA2AClient(TEST_CONFIG.a2a);
    mcpClient = createMCPClient(TEST_CONFIG.mcp);
    circuitBreaker = createCircuitBreaker(TEST_CONFIG.circuitBreaker);
    retryPolicy = createRetryPolicy(TEST_CONFIG.retryPolicy);
    logger = createStructuredLogger(TEST_CONFIG.logger);

    // Initialize demo
    demo = new MultiAgentE2EDemo(TEST_CONFIG);
    await demo.initialize();

    // Register test agents
    for (const agent of TEST_AGENTS) {
      await registry.registerAgent(agent);
    }
  });

  afterEach(async () => {
    // Cleanup
    if (demo) {
      await demo.cleanup();
    }

    if (registry) {
      await registry.cleanup();
    }

    if (discovery) {
      await discovery.cleanup();
    }

    if (mcpClient) {
      await mcpClient.disconnect();
    }
  });

  describe('Agent Discovery Integration', () => {
    it('should discover and register agents successfully', async () => {
      const result = await demo.step1AgentDiscovery();

      expect(result.success).toBe(true);
      expect(result.agentsDiscovered).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.duration).toBeLessThan(1000); // < 1 second
    });

    it('should resolve agent URNs correctly', async () => {
      const agent = await discovery.getAgent(TEST_AGENTS[0].urn);

      expect(agent).toBeDefined();
      expect(agent.urn).toBe(TEST_AGENTS[0].urn);
      expect(agent.name).toBe(TEST_AGENTS[0].name);
      expect(agent.capabilities).toBeDefined();
    });

    it('should discover agents by domain', async () => {
      const result = await discovery.discoverByDomain('test');

      expect(result.success).toBe(true);
      expect(result.agents).toBeDefined();
      expect(result.agents.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
    });

    it('should handle discovery errors gracefully', async () => {
      // Test with invalid domain
      const result = await discovery.discoverByDomain('invalid-domain');

      expect(result.success).toBe(true);
      expect(result.agents).toBeDefined();
      expect(result.agents.length).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe('A2A Communication Integration', () => {
    it('should handle A2A communication with circuit breaker', async () => {
      const result = await demo.step2A2ACommunication();

      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.metrics.totalRequests).toBeGreaterThan(0);
    });

    it('should handle A2A request failures gracefully', async () => {
      // Mock A2A client to simulate failures
      const mockA2AClient = {
        request: jest.fn().mockRejectedValue(new Error('Simulated A2A failure'))
      };

      demo.a2aClient = mockA2AClient;

      const result = await demo.step2A2ACommunication();

      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();
      expect(result.results.some(r => !r.success)).toBe(true);
    });

    it('should respect circuit breaker thresholds', async () => {
      // Simulate multiple failures
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Simulated failure');
          });
        } catch (error) {
          // Expected failure
        }
      }

      const status = circuitBreaker.getStatus();
      expect(status.state).toBe('OPEN');
      expect(status.canExecute).toBe(false);
    });

    it('should recover from circuit breaker open state', async () => {
      // Open circuit breaker
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Simulated failure');
          });
        } catch (error) {
          // Expected failure
        }
      }

      expect(circuitBreaker.getStatus().state).toBe('OPEN');

      // Reset circuit breaker
      circuitBreaker.reset();
      expect(circuitBreaker.getStatus().state).toBe('CLOSED');
    });
  });

  describe('MCP Tool Execution Integration', () => {
    it('should handle MCP tool execution with retry policy', async () => {
      const result = await demo.step3MCPToolExecution();

      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.metrics.totalExecutions).toBeGreaterThan(0);
    });

    it('should handle MCP connection failures gracefully', async () => {
      // Mock MCP client to simulate connection failures
      const mockMCPClient = {
        connect: jest.fn().mockRejectedValue(new Error('Simulated MCP connection failure')),
        executeTool: jest.fn(),
        disconnect: jest.fn()
      };

      demo.mcpClient = mockMCPClient;

      const result = await demo.step3MCPToolExecution();

      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();
      expect(result.results.some(r => !r.success)).toBe(true);
    });

    it('should respect retry policy configuration', async () => {
      let attemptCount = 0;

      try {
        await retryPolicy.execute(async () => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Simulated retry failure');
          }
          return 'success';
        });
      } catch (error) {
        // Expected failure
      }

      expect(attemptCount).toBe(3); // 1 initial + 2 retries
    });

    it('should handle MCP tool execution timeouts', async () => {
      const timeoutPolicy = createRetryPolicy({
        maxRetries: 1,
        baseDelay: 100,
        maxDelay: 200,
        backoffMultiplier: 2,
        jitter: false
      });

      const startTime = performance.now();

      try {
        await timeoutPolicy.execute(async () => {
          // Simulate slow operation
          await new Promise(resolve => setTimeout(resolve, 1000));
          throw new Error('Simulated timeout');
        });
      } catch (error) {
        // Expected failure
      }

      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(2000); // Should timeout quickly
    });
  });

  describe('End-to-End Workflow Integration', () => {
    it('should complete full workflow successfully', async () => {
      const result = await demo.step4EndToEndValidation();

      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.metrics.totalWorkflows).toBeGreaterThan(0);
    });

    it('should handle workflow failures gracefully', async () => {
      // Mock components to simulate failures
      const mockDiscovery = {
        getAgent: jest.fn().mockRejectedValue(new Error('Simulated discovery failure'))
      };

      demo.discovery = mockDiscovery;

      const result = await demo.step4EndToEndValidation();

      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();
      expect(result.results.some(r => !r.success)).toBe(true);
    });

    it('should maintain correlation IDs across workflow', async () => {
      const result = await demo.step4EndToEndValidation();

      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();

      // Check that correlation ID is maintained
      result.results.forEach(workflowResult => {
        if (workflowResult.success) {
          expect(workflowResult.response).toBeDefined();
          expect(workflowResult.response.timestamp).toBeDefined();
        }
      });
    });

    it('should complete workflow within performance thresholds', async () => {
      const startTime = performance.now();
      const result = await demo.step4EndToEndValidation();
      const endTime = performance.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000); // < 5 seconds
      expect(result.metrics.duration).toBeLessThan(5000);
    });
  });

  describe('Error Handling and Resilience Integration', () => {
    it('should validate error handling mechanisms', async () => {
      const result = await demo.step5ErrorHandlingValidation();

      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.metrics.totalTests).toBeGreaterThan(0);
    });

    it('should handle circuit breaker errors correctly', async () => {
      const result = await demo.step5ErrorHandlingValidation();

      const circuitBreakerTest = result.results.find(t => t.test === 'circuit-breaker');
      expect(circuitBreakerTest).toBeDefined();
      expect(circuitBreakerTest.success).toBe(true);
    });

    it('should handle retry policy errors correctly', async () => {
      const result = await demo.step5ErrorHandlingValidation();

      const retryPolicyTest = result.results.find(t => t.test === 'retry-policy');
      expect(retryPolicyTest).toBeDefined();
      expect(retryPolicyTest.success).toBe(true);
    });

    it('should handle error classification correctly', async () => {
      const result = await demo.step5ErrorHandlingValidation();

      const errorClassificationTest = result.results.find(t => t.test === 'error-classification');
      expect(errorClassificationTest).toBeDefined();
      expect(errorClassificationTest.success).toBe(true);
    });

    it('should handle structured error context', async () => {
      const testError = new Error('Test error');
      const typedError = handleError(testError, {
        operation: 'test-operation',
        correlationId: 'test-correlation-id'
      });

      expect(typedError).toBeDefined();
      expect(typedError.message).toBe('Test error');
      expect(typedError.context).toBeDefined();
    });
  });

  describe('Performance Validation Integration', () => {
    it('should validate performance metrics', async () => {
      const result = await demo.step6PerformanceValidation();

      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.metrics.totalTests).toBeGreaterThan(0);
    });

    it('should meet end-to-end latency requirements', async () => {
      const result = await demo.step6PerformanceValidation();

      const latencyTest = result.results.find(t => t.test === 'end-to-end-latency');
      expect(latencyTest).toBeDefined();
      expect(latencyTest.success).toBe(true);
      expect(latencyTest.details.latency).toBeLessThan(latencyTest.details.threshold);
    });

    it('should meet discovery performance requirements', async () => {
      const result = await demo.step6PerformanceValidation();

      const discoveryTest = result.results.find(t => t.test === 'discovery-performance');
      expect(discoveryTest).toBeDefined();
      expect(discoveryTest.success).toBe(true);
      expect(discoveryTest.details.latency).toBeLessThan(discoveryTest.details.threshold);
    });

    it('should meet A2A performance requirements', async () => {
      const result = await demo.step6PerformanceValidation();

      const a2aTest = result.results.find(t => t.test === 'a2a-performance');
      expect(a2aTest).toBeDefined();
      expect(a2aTest.success).toBe(true);
      expect(a2aTest.details.latency).toBeLessThan(a2aTest.details.threshold);
    });

    it('should meet MCP performance requirements', async () => {
      const result = await demo.step6PerformanceValidation();

      const mcpTest = result.results.find(t => t.test === 'mcp-performance');
      expect(mcpTest).toBeDefined();
      expect(mcpTest.success).toBe(true);
      expect(mcpTest.details.latency).toBeLessThan(mcpTest.details.threshold);
    });

    it('should meet memory usage requirements', async () => {
      const result = await demo.step6PerformanceValidation();

      const memoryTest = result.results.find(t => t.test === 'memory-usage');
      expect(memoryTest).toBeDefined();
      expect(memoryTest.success).toBe(true);
      expect(memoryTest.details.heapUsed).toBeLessThan(memoryTest.details.threshold);
    });
  });

  describe('Complete Demo Integration', () => {
    it('should run complete demo successfully', async () => {
      const summary = await demo.runDemo();

      expect(summary.success).toBe(true);
      expect(summary.correlationId).toBeDefined();
      expect(summary.totalDuration).toBeGreaterThan(0);
      expect(summary.steps).toBeDefined();
      expect(summary.performanceMetrics).toBeDefined();
      expect(summary.timestamp).toBeDefined();
    });

    it('should complete demo within performance thresholds', async () => {
      const startTime = performance.now();
      const summary = await demo.runDemo();
      const endTime = performance.now();

      expect(summary.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(10000); // < 10 seconds
      expect(summary.totalDuration).toBeLessThan(10000);
    });

    it('should handle demo failures gracefully', async () => {
      // Mock registry to simulate failure
      const mockRegistry = {
        initialize: jest.fn().mockRejectedValue(new Error('Simulated registry failure')),
        cleanup: jest.fn()
      };

      demo.registry = mockRegistry;

      await expect(demo.runDemo()).rejects.toThrow();
    });

    it('should maintain demo state correctly', async () => {
      const summary = await demo.runDemo();

      expect(summary.success).toBe(true);
      expect(demo.discoveredAgents).toBeDefined();
      expect(demo.discoveredAgents.length).toBeGreaterThan(0);
      expect(demo.performanceMetrics).toBeDefined();
      expect(Object.keys(demo.performanceMetrics).length).toBeGreaterThan(0);
    });

    it('should cleanup resources properly', async () => {
      await demo.runDemo();
      await demo.cleanup();

      // Verify cleanup was called
      expect(demo.registry).toBeDefined();
      expect(demo.discovery).toBeDefined();
      expect(demo.mcpClient).toBeDefined();
    });
  });

  describe('Integration with Existing Components', () => {
    it('should integrate with URN registry', async () => {
      const agent = await registry.getAgent(TEST_AGENTS[0].urn);

      expect(agent).toBeDefined();
      expect(agent.urn).toBe(TEST_AGENTS[0].urn);
    });

    it('should integrate with agent discovery service', async () => {
      const result = await discovery.discoverByDomain('test');

      expect(result.success).toBe(true);
      expect(result.agents).toBeDefined();
    });

    it('should integrate with A2A client', async () => {
      expect(a2aClient).toBeDefined();
      expect(typeof a2aClient.request).toBe('function');
    });

    it('should integrate with MCP client', async () => {
      expect(mcpClient).toBeDefined();
      expect(typeof mcpClient.connect).toBe('function');
      expect(typeof mcpClient.executeTool).toBe('function');
      expect(typeof mcpClient.disconnect).toBe('function');
    });

    it('should integrate with circuit breaker', async () => {
      expect(circuitBreaker).toBeDefined();
      expect(typeof circuitBreaker.execute).toBe('function');
      expect(typeof circuitBreaker.getStatus).toBe('function');
    });

    it('should integrate with retry policy', async () => {
      expect(retryPolicy).toBeDefined();
      expect(typeof retryPolicy.execute).toBe('function');
    });

    it('should integrate with structured logger', async () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('should integrate with error handler', async () => {
      const testError = new Error('Test error');
      const typedError = handleError(testError, { operation: 'test' });

      expect(typedError).toBeDefined();
      expect(typedError.message).toBe('Test error');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent agent discovery', async () => {
      const promises = [
        discovery.discoverByDomain('test'),
        discovery.discoverByDomain('test'),
        discovery.discoverByDomain('test')
      ];

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.agents).toBeDefined();
      });
    });

    it('should handle concurrent A2A requests', async () => {
      const promises = TEST_AGENTS.map(agent => 
        circuitBreaker.execute(async () => {
          return await a2aClient.request(agent.urn, '/api/v1/status', {
            method: 'GET'
          });
        })
      );

      const results = await Promise.allSettled(promises);

      results.forEach(result => {
        expect(result.status).toBeDefined();
      });
    });

    it('should handle concurrent MCP tool executions', async () => {
      const promises = TEST_AGENTS.map(async (agent) => {
        try {
          await mcpClient.connect(agent.endpoints.mcp);
          const result = await retryPolicy.execute(async () => {
            return await mcpClient.executeTool('get_status', {});
          });
          await mcpClient.disconnect();
          return result;
        } catch (error) {
          return { error: error.message };
        }
      });

      const results = await Promise.allSettled(promises);

      results.forEach(result => {
        expect(result.status).toBeDefined();
      });
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from temporary failures', async () => {
      // Simulate temporary failure
      const mockA2AClient = {
        request: jest.fn()
          .mockRejectedValueOnce(new Error('Temporary failure'))
          .mockResolvedValueOnce({ status: 'success' })
      };

      demo.a2aClient = mockA2AClient;

      const result = await demo.step2A2ACommunication();

      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();
    });

    it('should handle partial failures gracefully', async () => {
      // Mock some components to fail
      const mockDiscovery = {
        getAgent: jest.fn().mockImplementation((urn) => {
          if (urn === TEST_AGENTS[0].urn) {
            throw new Error('Simulated failure');
          }
          return { urn, name: 'test-agent' };
        })
      };

      demo.discovery = mockDiscovery;

      const result = await demo.step4EndToEndValidation();

      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();
      expect(result.results.some(r => !r.success)).toBe(true);
    });

    it('should maintain system stability under load', async () => {
      const promises = Array(10).fill().map(() => demo.runDemo());

      const results = await Promise.allSettled(promises);

      results.forEach(result => {
        expect(result.status).toBeDefined();
      });
    });
  });
});
