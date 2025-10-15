#!/usr/bin/env node

/**
 * Registry and Discovery Demo
 * 
 * Demonstrates the complete URN registry and agent discovery workflow:
 * - Agent registration with persistent storage
 * - Advanced discovery with filtering and sorting
 * - Registry API server usage
 * - Performance testing
 * - Error handling examples
 */

import { createURNRegistry } from '../runtime/urn-registry.js';
import { createAgentDiscoveryService } from '../runtime/agent-discovery-service.js';
import { createRegistryAPIServer } from '../runtime/registry-api.js';
import { createACMGenerator } from '../runtime/acm-generator.js';

// Demo configuration
const DEMO_CONFIG = {
  registry: {
    dataDir: './data/demo-registry',
    enableLogging: true,
    maxAgents: 100
  },
  discovery: {
    enableLogging: true,
    maxResults: 50,
    enableCaching: true,
    cacheTtl: 300000 // 5 minutes
  },
  api: {
    port: 3001,
    host: 'localhost',
    enableLogging: true
  }
};

// Sample agent data for demonstration
const SAMPLE_AGENTS = [
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
      api: '/api/v1',
      health: '/health',
      metrics: '/metrics'
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
        description: 'Extract, Transform, Load operations',
        version: '1.0.0'
      },
      'data-validation': {
        type: 'service',
        description: 'Data validation and quality checks',
        version: '1.0.0'
      }
    },
    endpoints: {
      api: '/api/v1',
      health: '/health'
    }
  },
  {
    urn: 'urn:agent:api:gateway-agent@1.0.0',
    name: 'gateway-agent',
    version: '1.0.0',
    description: 'API gateway and routing agent',
    capabilities: {
      'routing': {
        type: 'service',
        description: 'Request routing and load balancing',
        version: '1.0.0'
      },
      'authentication': {
        type: 'service',
        description: 'API authentication and authorization',
        version: '1.0.0'
      }
    },
    endpoints: {
      api: '/api/v1',
      health: '/health',
      admin: '/admin'
    }
  },
  {
    urn: 'urn:agent:ai:nlp-agent@2.0.0',
    name: 'nlp-agent',
    version: '2.0.0',
    description: 'Natural language processing agent',
    capabilities: {
      'text-analysis': {
        type: 'service',
        description: 'Text analysis and sentiment detection',
        version: '2.0.0'
      },
      'language-translation': {
        type: 'service',
        description: 'Multi-language translation',
        version: '2.0.0'
      }
    },
    endpoints: {
      api: '/api/v2',
      health: '/health'
    }
  }
];

/**
 * Main demo function
 */
async function runDemo() {
  console.log('🚀 Starting URN Registry and Agent Discovery Demo\n');

  try {
    // Step 1: Initialize services
    console.log('📋 Step 1: Initializing Services');
    const registry = createURNRegistry(DEMO_CONFIG.registry);
    const discovery = createAgentDiscoveryService(DEMO_CONFIG.discovery);
    const acmGenerator = createACMGenerator({ enableLogging: true });

    await registry.initialize();
    await discovery.initialize();

    console.log('✅ Services initialized successfully\n');

    // Step 2: Register sample agents
    console.log('📝 Step 2: Registering Sample Agents');
    for (const agentData of SAMPLE_AGENTS) {
      try {
        const result = await registry.registerAgent(agentData);
        console.log(`  ✅ Registered: ${agentData.name} (${agentData.urn})`);
      } catch (error) {
        console.log(`  ❌ Failed to register ${agentData.name}: ${error.message}`);
      }
    }
    console.log('');

    // Step 3: Demonstrate registry operations
    console.log('🔍 Step 3: Registry Operations');
    await demonstrateRegistryOperations(registry);

    // Step 4: Demonstrate discovery operations
    console.log('🔎 Step 4: Discovery Operations');
    await demonstrateDiscoveryOperations(discovery);

    // Step 5: Demonstrate ACM generation
    console.log('📄 Step 5: ACM Generation');
    await demonstrateACMGeneration(acmGenerator, SAMPLE_AGENTS[0]);

    // Step 6: Performance testing
    console.log('⚡ Step 6: Performance Testing');
    await demonstratePerformance(registry, discovery);

    // Step 7: Error handling examples
    console.log('⚠️  Step 7: Error Handling Examples');
    await demonstrateErrorHandling(registry);

    // Step 8: API server demonstration
    console.log('🌐 Step 8: API Server Demonstration');
    await demonstrateAPIServer();

    // Step 9: Cleanup
    console.log('🧹 Step 9: Cleanup');
    await registry.shutdown();
    await discovery.shutdown();

    console.log('\n🎉 Demo completed successfully!');

  } catch (error) {
    console.error('\n❌ Demo failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Demonstrate registry operations
 */
async function demonstrateRegistryOperations(registry) {
  // Get registry statistics
  const stats = registry.getStats();
  console.log(`  📊 Registry Statistics:`);
  console.log(`    Total Agents: ${stats.totalAgents}`);
  console.log(`    Domains: ${stats.domains}`);
  console.log(`    Capabilities: ${stats.capabilities}`);
  console.log(`    Domain Stats:`, stats.domainStats);
  console.log(`    Capability Stats:`, stats.capabilityStats);

  // Get health status
  const health = registry.getHealth();
  console.log(`  🏥 Health Status: ${health.status}`);

  // Retrieve specific agent
  const agent = await registry.getAgent('urn:agent:ai:ml-agent@1.0.0');
  if (agent) {
    console.log(`  🔍 Retrieved Agent: ${agent.name} (${agent.version})`);
  }

  // List agents by domain
  const aiAgents = await registry.listAgentsByDomain('ai');
  console.log(`  🤖 AI Agents: ${aiAgents.length} found`);

  // Search by capability
  const mlAgents = await registry.searchAgentsByCapability('ml-inference');
  console.log(`  🧠 ML Inference Agents: ${mlAgents.length} found`);

  console.log('');
}

/**
 * Demonstrate discovery operations
 */
async function demonstrateDiscoveryOperations(discovery) {
  // Basic discovery
  const allAgents = await discovery.discoverAgents();
  console.log(`  🔍 Total Agents Discovered: ${allAgents.total}`);
  console.log(`  ⏱️  Execution Time: ${allAgents.executionTime}ms`);

  // Domain-based discovery
  const aiDiscovery = await discovery.discoverByDomain('ai');
  console.log(`  🤖 AI Domain: ${aiDiscovery.total} agents found`);

  // Capability-based discovery
  const mlDiscovery = await discovery.discoverByCapability('ml-inference');
  console.log(`  🧠 ML Inference: ${mlDiscovery.total} agents found`);

  // Complex query
  const complexQuery = {
    domain: 'ai',
    capabilities: ['ml-inference'],
    version: '1.0.0',
    sort: { field: 'name', order: 'asc' },
    limit: 10
  };

  const complexResult = await discovery.discoverAgents(complexQuery);
  console.log(`  🔎 Complex Query: ${complexResult.returned} agents found`);
  console.log(`  ⏱️  Execution Time: ${complexResult.executionTime}ms`);

  // Name search
  const nameSearch = await discovery.searchByName('agent');
  console.log(`  🔍 Name Search: ${nameSearch.total} agents found`);

  // Discovery statistics
  const discoveryStats = discovery.getStats();
  console.log(`  📊 Discovery Stats: Cache size ${discoveryStats.cacheSize}, Hit rate ${discoveryStats.cacheHitRate}%`);

  console.log('');
}

/**
 * Demonstrate ACM generation
 */
async function demonstrateACMGeneration(acmGenerator, agentData) {
  try {
    const manifest = await acmGenerator.createACM(agentData);
    console.log(`  📄 Generated ACM Manifest for: ${manifest.metadata.name}`);
    console.log(`    URN: ${manifest.metadata.urn}`);
    console.log(`    Version: ${manifest.metadata.version}`);
    console.log(`    Capabilities: ${Object.keys(manifest.spec.capabilities).length}`);
    console.log(`    Endpoints: ${Object.keys(manifest.spec.endpoints).length}`);

    // Validate the manifest
    const isValid = await acmGenerator.validateACM(manifest);
    console.log(`  ✅ ACM Validation: ${isValid ? 'Valid' : 'Invalid'}`);

  } catch (error) {
    console.log(`  ❌ ACM Generation Failed: ${error.message}`);
  }

  console.log('');
}

/**
 * Demonstrate performance characteristics
 */
async function demonstratePerformance(registry, discovery) {
  console.log('  🏃 Running Performance Tests...');

  // Test registry performance
  const startTime = Date.now();
  
  // Register multiple agents
  for (let i = 0; i < 10; i++) {
    const testAgent = {
      urn: `urn:agent:test:perf-agent-${i}@1.0.0`,
      name: `perf-agent-${i}`,
      version: '1.0.0',
      description: `Performance test agent ${i}`,
      capabilities: {
        'test-capability': {
          type: 'service',
          description: 'Test capability',
          version: '1.0.0'
        }
      },
      endpoints: {
        api: '/api/v1',
        health: '/health'
      }
    };
    
    await registry.registerAgent(testAgent);
  }
  
  const registryTime = Date.now() - startTime;
  console.log(`  📝 Registry: Registered 10 agents in ${registryTime}ms`);

  // Test discovery performance
  const discoveryStart = Date.now();
  
  // Perform multiple discovery operations
  for (let i = 0; i < 20; i++) {
    await discovery.discoverAgents({ limit: 10 });
  }
  
  const discoveryTime = Date.now() - discoveryStart;
  console.log(`  🔍 Discovery: 20 queries in ${discoveryTime}ms`);

  // Test cache performance
  const cacheStart = Date.now();
  
  // Same query multiple times (should use cache)
  for (let i = 0; i < 10; i++) {
    await discovery.discoverAgents({ domain: 'test' });
  }
  
  const cacheTime = Date.now() - cacheStart;
  console.log(`  💾 Cache: 10 cached queries in ${cacheTime}ms`);

  console.log('');
}

/**
 * Demonstrate error handling
 */
async function demonstrateErrorHandling(registry) {
  console.log('  ⚠️  Testing Error Handling...');

  // Test invalid URN format
  try {
    await registry.registerAgent({
      urn: 'invalid-urn-format',
      name: 'test-agent',
      version: '1.0.0',
      description: 'Test agent'
    });
  } catch (error) {
    console.log(`  ❌ URN Format Error: ${error.message}`);
  }

  // Test missing required fields
  try {
    await registry.registerAgent({
      name: 'incomplete-agent'
      // Missing required fields
    });
  } catch (error) {
    console.log(`  ❌ Validation Error: ${error.message}`);
  }

  // Test duplicate registration
  try {
    await registry.registerAgent(SAMPLE_AGENTS[0]);
  } catch (error) {
    console.log(`  ❌ Duplicate Error: ${error.message}`);
  }

  // Test non-existent agent retrieval
  const nonExistentAgent = await registry.getAgent('urn:agent:ai:non-existent@1.0.0');
  if (nonExistentAgent === null) {
    console.log(`  ✅ Non-existent Agent: Correctly returned null`);
  }

  console.log('');
}

/**
 * Demonstrate API server
 */
async function demonstrateAPIServer() {
  console.log('  🌐 Starting API Server...');

  const server = createRegistryAPIServer(DEMO_CONFIG.api);
  
  try {
    await server.start();
    console.log(`  ✅ API Server started on http://${DEMO_CONFIG.api.host}:${DEMO_CONFIG.api.port}`);

    // Simulate API requests
    console.log('  📡 Simulating API Requests...');

    // Health check request
    const healthRequest = {
      method: 'GET',
      url: '/api/v1/health',
      headers: {},
      query: {},
      body: null,
      ip: '127.0.0.1'
    };

    const healthResponse = await server.handleRequest(healthRequest);
    console.log(`  🏥 Health Check: ${healthResponse.statusCode} ${healthResponse.body.status}`);

    // Statistics request
    const statsRequest = {
      method: 'GET',
      url: '/api/v1/stats',
      headers: {},
      query: {},
      body: null,
      ip: '127.0.0.1'
    };

    const statsResponse = await server.handleRequest(statsRequest);
    console.log(`  📊 Statistics: ${statsResponse.statusCode} - ${statsResponse.body.registry.totalAgents} agents`);

    // Agent list request
    const agentsRequest = {
      method: 'GET',
      url: '/api/v1/agents',
      headers: {},
      query: { limit: '5' },
      body: null,
      ip: '127.0.0.1'
    };

    const agentsResponse = await server.handleRequest(agentsRequest);
    console.log(`  📋 Agent List: ${agentsResponse.statusCode} - ${agentsResponse.body.returned} agents returned`);

    // Discovery request
    const discoveryRequest = {
      method: 'GET',
      url: '/api/v1/discover',
      headers: {},
      query: { domain: 'ai', limit: '3' },
      body: null,
      ip: '127.0.0.1'
    };

    const discoveryResponse = await server.handleRequest(discoveryRequest);
    console.log(`  🔍 Discovery: ${discoveryResponse.statusCode} - ${discoveryResponse.body.returned} agents found`);

    // Get specific agent request
    const agentRequest = {
      method: 'GET',
      url: '/api/v1/agents/urn%3Aagent%3Aai%3Aml-agent%401.0.0',
      headers: {},
      query: {},
      body: null,
      ip: '127.0.0.1'
    };

    const agentResponse = await server.handleRequest(agentRequest);
    console.log(`  🔍 Get Agent: ${agentResponse.statusCode} - ${agentResponse.body.name}`);

    // CORS preflight request
    const corsRequest = {
      method: 'OPTIONS',
      url: '/api/v1/agents',
      headers: {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      },
      query: {},
      body: null,
      ip: '127.0.0.1'
    };

    const corsResponse = await server.handleRequest(corsRequest);
    console.log(`  🌐 CORS Preflight: ${corsResponse.statusCode} - Headers set`);

    // 404 request
    const notFoundRequest = {
      method: 'GET',
      url: '/api/v1/unknown',
      headers: {},
      query: {},
      body: null,
      ip: '127.0.0.1'
    };

    const notFoundResponse = await server.handleRequest(notFoundRequest);
    console.log(`  ❌ 404 Request: ${notFoundResponse.statusCode} - ${notFoundResponse.body.error}`);

    await server.stop();
    console.log('  ✅ API Server stopped');

  } catch (error) {
    console.log(`  ❌ API Server Error: ${error.message}`);
    await server.stop();
  }

  console.log('');
}

/**
 * Utility function to format JSON output
 */
function formatJSON(obj, maxLength = 100) {
  const str = JSON.stringify(obj, null, 2);
  return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

/**
 * Utility function to measure execution time
 */
async function measureTime(fn) {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;
  return { result, duration };
}

// Run the demo if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo().catch(error => {
    console.error('Demo failed:', error);
    process.exit(1);
  });
}

export { runDemo, DEMO_CONFIG, SAMPLE_AGENTS };
