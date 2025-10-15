#!/usr/bin/env node

/**
 * Basic Agent Discovery Example
 * 
 * This example demonstrates basic agent discovery functionality including:
 * - Registering agents
 * - Discovering agents by domain
 * - Discovering agents by capability
 * - Advanced querying with filtering and sorting
 */

import { createAgentDiscoveryService } from '../../runtime/agent-discovery-service.js';
import { createURNRegistry } from '../../runtime/urn-registry.js';

async function basicDiscoveryExample() {
  console.log('=== Basic Agent Discovery Example ===\n');
  
  // Initialize registry and discovery service
  console.log('1. Initializing services...');
  const registry = createURNRegistry({
    dataDir: './data/discovery-example',
    enableLogging: true,
    maxAgents: 100
  });
  
  const discovery = createAgentDiscoveryService({
    enableLogging: true,
    enableCaching: true,
    maxResults: 50
  });
  
  await registry.initialize();
  await discovery.initialize();
  console.log('✓ Services initialized\n');
  
  // Register sample agents
  console.log('2. Registering sample agents...');
  const agents = [
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
          description: 'ETL processing',
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
        health: '/health'
      }
    },
    {
      urn: 'urn:agent:api:gateway-agent@1.0.0',
      name: 'gateway-agent',
      version: '1.0.0',
      description: 'API gateway agent',
      capabilities: {
        'api-gateway': {
          type: 'service',
          description: 'API gateway functionality',
          version: '1.0.0'
        },
        'load-balancing': {
          type: 'service',
          description: 'Load balancing capabilities',
          version: '1.0.0'
        }
      },
      endpoints: {
        api: '/api/v1',
        health: '/health'
      }
    }
  ];
  
  for (const agent of agents) {
    await registry.registerAgent(agent);
    console.log(`✓ Registered: ${agent.name} (${agent.urn})`);
  }
  console.log('');
  
  // Discover all agents
  console.log('3. Discovering all agents...');
  const allAgents = await discovery.discoverAgents({});
  console.log(`✓ Found ${allAgents.total} agents`);
  allAgents.agents.forEach(agent => {
    console.log(`  - ${agent.name} (${agent.urn})`);
  });
  console.log('');
  
  // Discover agents by domain
  console.log('4. Discovering agents by domain...');
  const aiAgents = await discovery.discoverByDomain('ai');
  console.log(`✓ Found ${aiAgents.total} AI agents:`);
  aiAgents.agents.forEach(agent => {
    console.log(`  - ${agent.name} (${agent.urn})`);
  });
  console.log('');
  
  const dataAgents = await discovery.discoverByDomain('data');
  console.log(`✓ Found ${dataAgents.total} data agents:`);
  dataAgents.agents.forEach(agent => {
    console.log(`  - ${agent.name} (${agent.urn})`);
  });
  console.log('');
  
  // Discover agents by capability
  console.log('5. Discovering agents by capability...');
  const mlAgents = await discovery.discoverByCapability('ml-inference');
  console.log(`✓ Found ${mlAgents.total} ML inference agents:`);
  mlAgents.agents.forEach(agent => {
    console.log(`  - ${agent.name} (${agent.urn})`);
  });
  console.log('');
  
  const processingAgents = await discovery.discoverByCapability('data-processing');
  console.log(`✓ Found ${processingAgents.total} data processing agents:`);
  processingAgents.agents.forEach(agent => {
    console.log(`  - ${agent.name} (${agent.urn})`);
  });
  console.log('');
  
  // Advanced querying
  console.log('6. Advanced querying...');
  const advancedQuery = {
    domain: 'ai',
    capabilities: ['ml-inference'],
    sort: {
      field: 'name',
      order: 'asc'
    },
    limit: 10,
    includeHealth: true
  };
  
  const advancedResult = await discovery.discoverAgents(advancedQuery);
  console.log(`✓ Advanced query returned ${advancedResult.returned} agents:`);
  advancedResult.agents.forEach(agent => {
    console.log(`  - ${agent.name} (${agent.urn})`);
    if (agent.health) {
      console.log(`    Health: ${agent.health.status}`);
    }
  });
  console.log('');
  
  // Search by name
  console.log('7. Searching by name...');
  const searchResult = await discovery.searchByName('ml-agent');
  console.log(`✓ Found ${searchResult.total} agents matching 'ml-agent':`);
  searchResult.agents.forEach(agent => {
    console.log(`  - ${agent.name} (${agent.urn})`);
  });
  console.log('');
  
  // Get discovery statistics
  console.log('8. Discovery statistics...');
  const stats = discovery.getStats();
  console.log('✓ Discovery statistics:');
  console.log(`  - Cache size: ${stats.cacheSize}`);
  console.log(`  - Cache hit rate: ${stats.cacheHitRate}%`);
  console.log(`  - Service status: ${stats.serviceStatus}`);
  console.log('');
  
  // Cleanup
  console.log('9. Cleaning up...');
  await discovery.shutdown();
  await registry.shutdown();
  console.log('✓ Cleanup completed');
  
  console.log('\n=== Example completed successfully ===');
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  basicDiscoveryExample().catch(error => {
    console.error('Example failed:', error);
    process.exit(1);
  });
}

export { basicDiscoveryExample };
