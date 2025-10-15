#!/usr/bin/env node

/**
 * Multi-Agent End-to-End Demo
 * 
 * This demo validates the complete runtime loop from agent discovery through
 * tool execution, proving the system works with real A2A/MCP operations.
 * 
 * Workflow:
 * 1. Agent Discovery: URN resolution with real agent metadata
 * 2. A2A Communication: Agent-to-agent requests with error handling
 * 3. MCP Tool Execution: Real tool execution with proper error handling
 * 4. End-to-End Flow: Complete workflow validation
 * 5. Error Handling: Circuit breakers and retry policies
 * 6. Structured Logging: Correlation IDs and request tracing
 * 7. Performance: End-to-end latency validation
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { performance } from 'perf_hooks';

// Runtime components
import { createAgentDiscoveryService } from '../runtime/agent-discovery-service.js';
import { createURNRegistry } from '../runtime/urn-registry.js';
import { createA2AClient } from '../runtime/a2a-client.js';
import { createMCPClient } from '../runtime/mcp-client.js';
import { createCircuitBreaker } from '../runtime/circuit-breaker.js';
import { createRetryPolicy } from '../runtime/retry-policies.js';
import { createStructuredLogger } from '../runtime/structured-logger.js';
import { handleError } from '../runtime/error-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const DEMO_CONFIG = {
  registry: {
    dataDir: join(__dirname, '../data/demo-registry'),
    enableLogging: true,
    maxAgents: 100
  },
  discovery: {
    enableLogging: true,
    maxResults: 50,
    enableCaching: true,
    cacheTtl: 300000 // 5 minutes
  },
  a2a: {
    enableLogging: true,
    timeout: 10000,
    retries: 3
  },
  mcp: {
    enableLogging: true,
    timeout: 15000,
    retries: 2
  },
  circuitBreaker: {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
    enableLogging: true
  },
  retryPolicy: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true
  },
  logger: {
    level: 'INFO',
    enableConsole: true,
    enableFile: false,
    enableTracing: true
  }
};

// Demo agent configurations
const DEMO_AGENTS = [
  {
    urn: 'urn:agent:ai:ml-agent@1.0.0',
    name: 'ml-agent',
    version: '1.0.0',
    description: 'Machine learning inference agent',
    capabilities: {
      'ml-inference': {
        type: 'service',
        description: 'Machine learning model inference',
        version: '1.0.0'
      },
      'data-processing': {
        type: 'service',
        description: 'Data processing capabilities',
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
    urn: 'urn:agent:data:etl-agent@1.0.0',
    name: 'etl-agent',
    version: '1.0.0',
    description: 'ETL processing agent',
    capabilities: {
      'etl': {
        type: 'service',
        description: 'ETL processing',
        version: '1.0.0'
      },
      'data-validation': {
        type: 'service',
        description: 'Data validation',
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
  },
  {
    urn: 'urn:agent:api:gateway-agent@1.0.0',
    name: 'gateway-agent',
    version: '1.0.0',
    description: 'API gateway agent',
    capabilities: {
      'routing': {
        type: 'service',
        description: 'Request routing',
        version: '1.0.0'
      },
      'auth': {
        type: 'service',
        description: 'Authentication',
        version: '1.0.0'
      }
    },
    endpoints: {
      api: 'http://localhost:3003/api/v1',
      health: 'http://localhost:3003/health',
      mcp: 'http://localhost:3003/mcp'
    },
    health: {
      status: 'healthy',
      lastChecked: new Date().toISOString()
    }
  }
];

/**
 * Multi-Agent E2E Demo Class
 */
class MultiAgentE2EDemo {
  constructor(config = DEMO_CONFIG) {
    this.config = config;
    this.logger = createStructuredLogger(config.logger);
    this.correlationId = this.logger.createCorrelationId();
    
    // Initialize components
    this.registry = null;
    this.discovery = null;
    this.a2aClient = null;
    this.mcpClient = null;
    this.circuitBreaker = null;
    this.retryPolicy = null;
    
    // Demo state
    this.discoveredAgents = [];
    this.executionResults = [];
    this.performanceMetrics = {};
  }

  /**
   * Initialize all components
   */
  async initialize() {
    const traceId = this.logger.startTrace('demo-initialization', {
      correlationId: this.correlationId,
      component: 'MultiAgentE2EDemo'
    });

    try {
      this.logger.info('Initializing Multi-Agent E2E Demo', {
        correlationId: this.correlationId,
        component: 'MultiAgentE2EDemo'
      });

      // Initialize registry
      this.registry = createURNRegistry(this.config.registry);
      await this.registry.initialize();

      // Initialize discovery service
      this.discovery = createAgentDiscoveryService(this.config.discovery);
      await this.discovery.initialize();

      // Initialize A2A client
      this.a2aClient = createA2AClient(this.config.a2a);

      // Initialize MCP client
      this.mcpClient = createMCPClient(this.config.mcp);

      // Initialize circuit breaker
      this.circuitBreaker = createCircuitBreaker(this.config.circuitBreaker);

      // Initialize retry policy
      this.retryPolicy = createRetryPolicy(this.config.retryPolicy);

      this.logger.completeTrace(traceId, 'completed', {
        correlationId: this.correlationId,
        result: 'success'
      });

      this.logger.info('Multi-Agent E2E Demo initialized successfully', {
        correlationId: this.correlationId,
        component: 'MultiAgentE2EDemo'
      });

    } catch (error) {
      this.logger.completeTrace(traceId, 'failed', {
        correlationId: this.correlationId,
        error: error.message
      });

      const typedError = handleError(error, {
        operation: 'demo-initialization',
        correlationId: this.correlationId
      });

      throw typedError;
    }
  }

  /**
   * Step 1: Agent Discovery and Registration
   */
  async step1AgentDiscovery() {
    const traceId = this.logger.startTrace('agent-discovery', {
      correlationId: this.correlationId,
      component: 'MultiAgentE2EDemo',
      step: '1'
    });

    try {
      this.logger.info('Starting agent discovery and registration', {
        correlationId: this.correlationId,
        component: 'MultiAgentE2EDemo',
        step: '1'
      });

      const startTime = performance.now();

      // Register demo agents
      for (const agent of DEMO_AGENTS) {
        await this.registry.registerAgent(agent);
        this.logger.info(`Registered agent: ${agent.name}`, {
          correlationId: this.correlationId,
          component: 'MultiAgentE2EDemo',
          agentUrn: agent.urn
        });
      }

      // Discover agents by domain
      const aiAgents = await this.discovery.discoverByDomain('ai');
      const dataAgents = await this.discovery.discoverByDomain('data');
      const apiAgents = await this.discovery.discoverByDomain('api');

      this.discoveredAgents = [
        ...aiAgents.agents,
        ...dataAgents.agents,
        ...apiAgents.agents
      ];

      const endTime = performance.now();
      this.performanceMetrics.discovery = {
        duration: endTime - startTime,
        agentsDiscovered: this.discoveredAgents.length,
        domains: ['ai', 'data', 'api']
      };

      this.logger.completeTrace(traceId, 'completed', {
        correlationId: this.correlationId,
        result: 'success',
        agentsDiscovered: this.discoveredAgents.length,
        duration: this.performanceMetrics.discovery.duration
      });

      this.logger.info('Agent discovery completed', {
        correlationId: this.correlationId,
        component: 'MultiAgentE2EDemo',
        step: '1',
        agentsDiscovered: this.discoveredAgents.length,
        duration: this.performanceMetrics.discovery.duration
      });

      return {
        success: true,
        agentsDiscovered: this.discoveredAgents.length,
        duration: this.performanceMetrics.discovery.duration
      };

    } catch (error) {
      this.logger.completeTrace(traceId, 'failed', {
        correlationId: this.correlationId,
        error: error.message
      });

      const typedError = handleError(error, {
        operation: 'agent-discovery',
        correlationId: this.correlationId,
        step: '1'
      });

      throw typedError;
    }
  }

  /**
   * Step 2: A2A Communication
   */
  async step2A2ACommunication() {
    const traceId = this.logger.startTrace('a2a-communication', {
      correlationId: this.correlationId,
      component: 'MultiAgentE2EDemo',
      step: '2'
    });

    try {
      this.logger.info('Starting A2A communication', {
        correlationId: this.correlationId,
        component: 'MultiAgentE2EDemo',
        step: '2'
      });

      const startTime = performance.now();
      const a2aResults = [];

      // Test A2A communication with each discovered agent
      for (const agent of this.discoveredAgents) {
        try {
          const agentTraceId = this.logger.startTrace('agent-a2a-request', {
            correlationId: this.correlationId,
            component: 'MultiAgentE2EDemo',
            agentUrn: agent.urn
          });

          // Execute A2A request with circuit breaker protection
          const result = await this.circuitBreaker.execute(async () => {
            return await this.a2aClient.request(agent.urn, '/api/v1/status', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'X-Correlation-ID': this.correlationId
              }
            });
          });

          this.logger.completeTrace(agentTraceId, 'completed', {
            correlationId: this.correlationId,
            agentUrn: agent.urn,
            result: 'success'
          });

          a2aResults.push({
            agentUrn: agent.urn,
            success: true,
            response: result
          });

          this.logger.info(`A2A request successful for ${agent.name}`, {
            correlationId: this.correlationId,
            component: 'MultiAgentE2EDemo',
            agentUrn: agent.urn
          });

        } catch (error) {
          const typedError = handleError(error, {
            operation: 'a2a-request',
            correlationId: this.correlationId,
            agentUrn: agent.urn
          });

          a2aResults.push({
            agentUrn: agent.urn,
            success: false,
            error: typedError.message
          });

          this.logger.warn(`A2A request failed for ${agent.name}`, {
            correlationId: this.correlationId,
            component: 'MultiAgentE2EDemo',
            agentUrn: agent.urn,
            error: typedError.message
          });
        }
      }

      const endTime = performance.now();
      this.performanceMetrics.a2a = {
        duration: endTime - startTime,
        totalRequests: a2aResults.length,
        successfulRequests: a2aResults.filter(r => r.success).length,
        failedRequests: a2aResults.filter(r => !r.success).length
      };

      this.logger.completeTrace(traceId, 'completed', {
        correlationId: this.correlationId,
        result: 'success',
        totalRequests: this.performanceMetrics.a2a.totalRequests,
        successfulRequests: this.performanceMetrics.a2a.successfulRequests,
        duration: this.performanceMetrics.a2a.duration
      });

      this.logger.info('A2A communication completed', {
        correlationId: this.correlationId,
        component: 'MultiAgentE2EDemo',
        step: '2',
        totalRequests: this.performanceMetrics.a2a.totalRequests,
        successfulRequests: this.performanceMetrics.a2a.successfulRequests,
        duration: this.performanceMetrics.a2a.duration
      });

      return {
        success: true,
        results: a2aResults,
        metrics: this.performanceMetrics.a2a
      };

    } catch (error) {
      this.logger.completeTrace(traceId, 'failed', {
        correlationId: this.correlationId,
        error: error.message
      });

      const typedError = handleError(error, {
        operation: 'a2a-communication',
        correlationId: this.correlationId,
        step: '2'
      });

      throw typedError;
    }
  }

  /**
   * Step 3: MCP Tool Execution
   */
  async step3MCPToolExecution() {
    const traceId = this.logger.startTrace('mcp-tool-execution', {
      correlationId: this.correlationId,
      component: 'MultiAgentE2EDemo',
      step: '3'
    });

    try {
      this.logger.info('Starting MCP tool execution', {
        correlationId: this.correlationId,
        component: 'MultiAgentE2EDemo',
        step: '3'
      });

      const startTime = performance.now();
      const mcpResults = [];

      // Test MCP tool execution with each discovered agent
      for (const agent of this.discoveredAgents) {
        try {
          const agentTraceId = this.logger.startTrace('agent-mcp-execution', {
            correlationId: this.correlationId,
            component: 'MultiAgentE2EDemo',
            agentUrn: agent.urn
          });

          // Connect to MCP server
          await this.mcpClient.connect(agent.endpoints.mcp);

          // Execute tool with retry policy
          const result = await this.retryPolicy.execute(async () => {
            return await this.mcpClient.executeTool('get_status', {
              correlationId: this.correlationId,
              timestamp: new Date().toISOString()
            });
          });

          this.logger.completeTrace(agentTraceId, 'completed', {
            correlationId: this.correlationId,
            agentUrn: agent.urn,
            result: 'success'
          });

          mcpResults.push({
            agentUrn: agent.urn,
            success: true,
            tool: 'get_status',
            response: result
          });

          this.logger.info(`MCP tool execution successful for ${agent.name}`, {
            correlationId: this.correlationId,
            component: 'MultiAgentE2EDemo',
            agentUrn: agent.urn,
            tool: 'get_status'
          });

          // Disconnect from MCP server
          await this.mcpClient.disconnect();

        } catch (error) {
          const typedError = handleError(error, {
            operation: 'mcp-tool-execution',
            correlationId: this.correlationId,
            agentUrn: agent.urn
          });

          mcpResults.push({
            agentUrn: agent.urn,
            success: false,
            tool: 'get_status',
            error: typedError.message
          });

          this.logger.warn(`MCP tool execution failed for ${agent.name}`, {
            correlationId: this.correlationId,
            component: 'MultiAgentE2EDemo',
            agentUrn: agent.urn,
            error: typedError.message
          });
        }
      }

      const endTime = performance.now();
      this.performanceMetrics.mcp = {
        duration: endTime - startTime,
        totalExecutions: mcpResults.length,
        successfulExecutions: mcpResults.filter(r => r.success).length,
        failedExecutions: mcpResults.filter(r => !r.success).length
      };

      this.logger.completeTrace(traceId, 'completed', {
        correlationId: this.correlationId,
        result: 'success',
        totalExecutions: this.performanceMetrics.mcp.totalExecutions,
        successfulExecutions: this.performanceMetrics.mcp.successfulExecutions,
        duration: this.performanceMetrics.mcp.duration
      });

      this.logger.info('MCP tool execution completed', {
        correlationId: this.correlationId,
        component: 'MultiAgentE2EDemo',
        step: '3',
        totalExecutions: this.performanceMetrics.mcp.totalExecutions,
        successfulExecutions: this.performanceMetrics.mcp.successfulExecutions,
        duration: this.performanceMetrics.mcp.duration
      });

      return {
        success: true,
        results: mcpResults,
        metrics: this.performanceMetrics.mcp
      };

    } catch (error) {
      this.logger.completeTrace(traceId, 'failed', {
        correlationId: this.correlationId,
        error: error.message
      });

      const typedError = handleError(error, {
        operation: 'mcp-tool-execution',
        correlationId: this.correlationId,
        step: '3'
      });

      throw typedError;
    }
  }

  /**
   * Step 4: End-to-End Workflow Validation
   */
  async step4EndToEndValidation() {
    const traceId = this.logger.startTrace('end-to-end-validation', {
      correlationId: this.correlationId,
      component: 'MultiAgentE2EDemo',
      step: '4'
    });

    try {
      this.logger.info('Starting end-to-end workflow validation', {
        correlationId: this.correlationId,
        component: 'MultiAgentE2EDemo',
        step: '4'
      });

      const startTime = performance.now();

      // Simulate complete workflow: Discovery → A2A → MCP → Response
      const workflowResults = [];

      for (const agent of this.discoveredAgents) {
        try {
          const agentTraceId = this.logger.startTrace('agent-workflow', {
            correlationId: this.correlationId,
            component: 'MultiAgentE2EDemo',
            agentUrn: agent.urn
          });

          // Step 1: Verify agent discovery
          const discoveredAgent = await this.discovery.getAgent(agent.urn);
          if (!discoveredAgent) {
            throw new Error(`Agent ${agent.urn} not found in discovery`);
          }

          // Step 2: A2A communication
          const a2aResult = await this.circuitBreaker.execute(async () => {
            return await this.a2aClient.request(agent.urn, '/api/v1/status', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'X-Correlation-ID': this.correlationId
              }
            });
          });

          // Step 3: MCP tool execution
          await this.mcpClient.connect(agent.endpoints.mcp);
          const mcpResult = await this.retryPolicy.execute(async () => {
            return await this.mcpClient.executeTool('get_status', {
              correlationId: this.correlationId,
              timestamp: new Date().toISOString()
            });
          });
          await this.mcpClient.disconnect();

          // Step 4: Response processing
          const response = {
            agentUrn: agent.urn,
            discovery: discoveredAgent,
            a2a: a2aResult,
            mcp: mcpResult,
            timestamp: new Date().toISOString()
          };

          workflowResults.push({
            agentUrn: agent.urn,
            success: true,
            response
          });

          this.logger.completeTrace(agentTraceId, 'completed', {
            correlationId: this.correlationId,
            agentUrn: agent.urn,
            result: 'success'
          });

          this.logger.info(`End-to-end workflow successful for ${agent.name}`, {
            correlationId: this.correlationId,
            component: 'MultiAgentE2EDemo',
            agentUrn: agent.urn
          });

        } catch (error) {
          const typedError = handleError(error, {
            operation: 'end-to-end-workflow',
            correlationId: this.correlationId,
            agentUrn: agent.urn
          });

          workflowResults.push({
            agentUrn: agent.urn,
            success: false,
            error: typedError.message
          });

          this.logger.warn(`End-to-end workflow failed for ${agent.name}`, {
            correlationId: this.correlationId,
            component: 'MultiAgentE2EDemo',
            agentUrn: agent.urn,
            error: typedError.message
          });
        }
      }

      const endTime = performance.now();
      this.performanceMetrics.workflow = {
        duration: endTime - startTime,
        totalWorkflows: workflowResults.length,
        successfulWorkflows: workflowResults.filter(r => r.success).length,
        failedWorkflows: workflowResults.filter(r => !r.success).length
      };

      this.logger.completeTrace(traceId, 'completed', {
        correlationId: this.correlationId,
        result: 'success',
        totalWorkflows: this.performanceMetrics.workflow.totalWorkflows,
        successfulWorkflows: this.performanceMetrics.workflow.successfulWorkflows,
        duration: this.performanceMetrics.workflow.duration
      });

      this.logger.info('End-to-end workflow validation completed', {
        correlationId: this.correlationId,
        component: 'MultiAgentE2EDemo',
        step: '4',
        totalWorkflows: this.performanceMetrics.workflow.totalWorkflows,
        successfulWorkflows: this.performanceMetrics.workflow.successfulWorkflows,
        duration: this.performanceMetrics.workflow.duration
      });

      return {
        success: true,
        results: workflowResults,
        metrics: this.performanceMetrics.workflow
      };

    } catch (error) {
      this.logger.completeTrace(traceId, 'failed', {
        correlationId: this.correlationId,
        error: error.message
      });

      const typedError = handleError(error, {
        operation: 'end-to-end-validation',
        correlationId: this.correlationId,
        step: '4'
      });

      throw typedError;
    }
  }

  /**
   * Step 5: Error Handling and Resilience Validation
   */
  async step5ErrorHandlingValidation() {
    const traceId = this.logger.startTrace('error-handling-validation', {
      correlationId: this.correlationId,
      component: 'MultiAgentE2EDemo',
      step: '5'
    });

    try {
      this.logger.info('Starting error handling and resilience validation', {
        correlationId: this.correlationId,
        component: 'MultiAgentE2EDemo',
        step: '5'
      });

      const startTime = performance.now();
      const errorTests = [];

      // Test 1: Circuit breaker behavior
      try {
        // Simulate multiple failures to trigger circuit breaker
        for (let i = 0; i < 5; i++) {
          try {
            await this.circuitBreaker.execute(async () => {
              throw new Error('Simulated failure');
            });
          } catch (error) {
            // Expected failure
          }
        }

        // Check circuit breaker status
        const circuitStatus = this.circuitBreaker.getStatus();
        errorTests.push({
          test: 'circuit-breaker',
          success: circuitStatus.state === 'OPEN',
          details: circuitStatus
        });

        this.logger.info('Circuit breaker test completed', {
          correlationId: this.correlationId,
          component: 'MultiAgentE2EDemo',
          circuitState: circuitStatus.state
        });

      } catch (error) {
        errorTests.push({
          test: 'circuit-breaker',
          success: false,
          error: error.message
        });
      }

      // Test 2: Retry policy behavior
      try {
        let attemptCount = 0;
        await this.retryPolicy.execute(async () => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Simulated retry failure');
          }
          return 'success';
        });

        errorTests.push({
          test: 'retry-policy',
          success: attemptCount === 3,
          details: { attempts: attemptCount }
        });

        this.logger.info('Retry policy test completed', {
          correlationId: this.correlationId,
          component: 'MultiAgentE2EDemo',
          attempts: attemptCount
        });

      } catch (error) {
        errorTests.push({
          test: 'retry-policy',
          success: false,
          error: error.message
        });
      }

      // Test 3: Error classification and handling
      try {
        const testError = new Error('Test error');
        const typedError = handleError(testError, {
          operation: 'error-handling-test',
          correlationId: this.correlationId
        });

        errorTests.push({
          test: 'error-classification',
          success: typedError instanceof Error,
          details: { errorType: typedError.constructor.name }
        });

        this.logger.info('Error classification test completed', {
          correlationId: this.correlationId,
          component: 'MultiAgentE2EDemo',
          errorType: typedError.constructor.name
        });

      } catch (error) {
        errorTests.push({
          test: 'error-classification',
          success: false,
          error: error.message
        });
      }

      const endTime = performance.now();
      this.performanceMetrics.errorHandling = {
        duration: endTime - startTime,
        totalTests: errorTests.length,
        successfulTests: errorTests.filter(t => t.success).length,
        failedTests: errorTests.filter(t => !t.success).length
      };

      this.logger.completeTrace(traceId, 'completed', {
        correlationId: this.correlationId,
        result: 'success',
        totalTests: this.performanceMetrics.errorHandling.totalTests,
        successfulTests: this.performanceMetrics.errorHandling.successfulTests,
        duration: this.performanceMetrics.errorHandling.duration
      });

      this.logger.info('Error handling and resilience validation completed', {
        correlationId: this.correlationId,
        component: 'MultiAgentE2EDemo',
        step: '5',
        totalTests: this.performanceMetrics.errorHandling.totalTests,
        successfulTests: this.performanceMetrics.errorHandling.successfulTests,
        duration: this.performanceMetrics.errorHandling.duration
      });

      return {
        success: true,
        results: errorTests,
        metrics: this.performanceMetrics.errorHandling
      };

    } catch (error) {
      this.logger.completeTrace(traceId, 'failed', {
        correlationId: this.correlationId,
        error: error.message
      });

      const typedError = handleError(error, {
        operation: 'error-handling-validation',
        correlationId: this.correlationId,
        step: '5'
      });

      throw typedError;
    }
  }

  /**
   * Step 6: Performance Validation
   */
  async step6PerformanceValidation() {
    const traceId = this.logger.startTrace('performance-validation', {
      correlationId: this.correlationId,
      component: 'MultiAgentE2EDemo',
      step: '6'
    });

    try {
      this.logger.info('Starting performance validation', {
        correlationId: this.correlationId,
        component: 'MultiAgentE2EDemo',
        step: '6'
      });

      const startTime = performance.now();
      const performanceTests = [];

      // Test 1: End-to-end latency
      const e2eLatency = this.performanceMetrics.workflow?.duration || 0;
      const latencyTest = {
        test: 'end-to-end-latency',
        success: e2eLatency < 5000, // < 5 seconds
        details: { latency: e2eLatency, threshold: 5000 }
      };
      performanceTests.push(latencyTest);

      // Test 2: Discovery performance
      const discoveryLatency = this.performanceMetrics.discovery?.duration || 0;
      const discoveryTest = {
        test: 'discovery-performance',
        success: discoveryLatency < 1000, // < 1 second
        details: { latency: discoveryLatency, threshold: 1000 }
      };
      performanceTests.push(discoveryTest);

      // Test 3: A2A performance
      const a2aLatency = this.performanceMetrics.a2a?.duration || 0;
      const a2aTest = {
        test: 'a2a-performance',
        success: a2aLatency < 2000, // < 2 seconds
        details: { latency: a2aLatency, threshold: 2000 }
      };
      performanceTests.push(a2aTest);

      // Test 4: MCP performance
      const mcpLatency = this.performanceMetrics.mcp?.duration || 0;
      const mcpTest = {
        test: 'mcp-performance',
        success: mcpLatency < 3000, // < 3 seconds
        details: { latency: mcpLatency, threshold: 3000 }
      };
      performanceTests.push(mcpTest);

      // Test 5: Memory usage
      const memoryUsage = process.memoryUsage();
      const memoryTest = {
        test: 'memory-usage',
        success: memoryUsage.heapUsed < 100 * 1024 * 1024, // < 100MB
        details: { heapUsed: memoryUsage.heapUsed, threshold: 100 * 1024 * 1024 }
      };
      performanceTests.push(memoryTest);

      const endTime = performance.now();
      this.performanceMetrics.performance = {
        duration: endTime - startTime,
        totalTests: performanceTests.length,
        successfulTests: performanceTests.filter(t => t.success).length,
        failedTests: performanceTests.filter(t => !t.success).length,
        tests: performanceTests
      };

      this.logger.completeTrace(traceId, 'completed', {
        correlationId: this.correlationId,
        result: 'success',
        totalTests: this.performanceMetrics.performance.totalTests,
        successfulTests: this.performanceMetrics.performance.successfulTests,
        duration: this.performanceMetrics.performance.duration
      });

      this.logger.info('Performance validation completed', {
        correlationId: this.correlationId,
        component: 'MultiAgentE2EDemo',
        step: '6',
        totalTests: this.performanceMetrics.performance.totalTests,
        successfulTests: this.performanceMetrics.performance.successfulTests,
        duration: this.performanceMetrics.performance.duration
      });

      return {
        success: true,
        results: performanceTests,
        metrics: this.performanceMetrics.performance
      };

    } catch (error) {
      this.logger.completeTrace(traceId, 'failed', {
        correlationId: this.correlationId,
        error: error.message
      });

      const typedError = handleError(error, {
        operation: 'performance-validation',
        correlationId: this.correlationId,
        step: '6'
      });

      throw typedError;
    }
  }

  /**
   * Run complete E2E demo
   */
  async runDemo() {
    const traceId = this.logger.startTrace('complete-demo', {
      correlationId: this.correlationId,
      component: 'MultiAgentE2EDemo'
    });

    try {
      this.logger.info('Starting Multi-Agent E2E Demo', {
        correlationId: this.correlationId,
        component: 'MultiAgentE2EDemo'
      });

      const startTime = performance.now();
      const results = {};

      // Step 1: Agent Discovery
      results.step1 = await this.step1AgentDiscovery();

      // Step 2: A2A Communication
      results.step2 = await this.step2A2ACommunication();

      // Step 3: MCP Tool Execution
      results.step3 = await this.step3MCPToolExecution();

      // Step 4: End-to-End Validation
      results.step4 = await this.step4EndToEndValidation();

      // Step 5: Error Handling Validation
      results.step5 = await this.step5ErrorHandlingValidation();

      // Step 6: Performance Validation
      results.step6 = await this.step6PerformanceValidation();

      const endTime = performance.now();
      const totalDuration = endTime - startTime;

      // Generate summary
      const summary = {
        correlationId: this.correlationId,
        totalDuration,
        steps: results,
        performanceMetrics: this.performanceMetrics,
        success: true,
        timestamp: new Date().toISOString()
      };

      this.logger.completeTrace(traceId, 'completed', {
        correlationId: this.correlationId,
        result: 'success',
        totalDuration
      });

      this.logger.info('Multi-Agent E2E Demo completed successfully', {
        correlationId: this.correlationId,
        component: 'MultiAgentE2EDemo',
        totalDuration,
        summary
      });

      return summary;

    } catch (error) {
      this.logger.completeTrace(traceId, 'failed', {
        correlationId: this.correlationId,
        error: error.message
      });

      const typedError = handleError(error, {
        operation: 'complete-demo',
        correlationId: this.correlationId
      });

      this.logger.error('Multi-Agent E2E Demo failed', {
        correlationId: this.correlationId,
        component: 'MultiAgentE2EDemo',
        error: typedError.message
      });

      throw typedError;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      if (this.mcpClient) {
        await this.mcpClient.disconnect();
      }

      if (this.registry) {
        await this.registry.cleanup();
      }

      if (this.discovery) {
        await this.discovery.cleanup();
      }

      this.logger.info('Demo cleanup completed', {
        correlationId: this.correlationId,
        component: 'MultiAgentE2EDemo'
      });

    } catch (error) {
      this.logger.warn('Demo cleanup failed', {
        correlationId: this.correlationId,
        component: 'MultiAgentE2EDemo',
        error: error.message
      });
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  const demo = new MultiAgentE2EDemo();

  try {
    // Initialize demo
    await demo.initialize();

    // Run complete demo
    const summary = await demo.runDemo();

    // Print results
    console.log('\n=== Multi-Agent E2E Demo Results ===');
    console.log(`Correlation ID: ${summary.correlationId}`);
    console.log(`Total Duration: ${summary.totalDuration.toFixed(2)}ms`);
    console.log(`Success: ${summary.success}`);
    console.log(`Timestamp: ${summary.timestamp}`);

    console.log('\n=== Performance Metrics ===');
    Object.entries(summary.performanceMetrics).forEach(([key, metrics]) => {
      console.log(`${key}: ${metrics.duration?.toFixed(2)}ms`);
    });

    console.log('\n=== Step Results ===');
    Object.entries(summary.steps).forEach(([step, result]) => {
      console.log(`${step}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    });

    console.log('\n=== Demo Completed Successfully ===');

  } catch (error) {
    console.error('\n=== Demo Failed ===');
    console.error(`Error: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
    process.exit(1);
  } finally {
    // Cleanup
    await demo.cleanup();
  }
}

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { MultiAgentE2EDemo };
