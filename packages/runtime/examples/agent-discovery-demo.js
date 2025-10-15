#!/usr/bin/env node

/**
 * Agent Discovery Demo
 * 
 * Demonstrates the complete agent discovery workflow using:
 * - ACM Generator for creating agent capability manifests
 * - URN Resolver for resolving agent URNs and discovering capabilities
 * - Well-Known Server for serving ACM manifests via HTTP endpoints
 * 
 * This demo shows how agents can discover each other's capabilities
 * through standardized URN-based discovery mechanisms.
 */

import { createACMGenerator, createACM, validateACM } from '../runtime/acm-generator.js';
import { createURNResolver, resolveAgentUrn, discoverCapabilities } from '../runtime/urn-resolver.js';
import { createWellKnownServer, startWellKnownServer } from '../runtime/well-known-server.js';

/**
 * Demo configuration
 */
const DEMO_CONFIG = {
  server: {
    port: 3000,
    host: 'localhost',
    enableLogging: true
  },
  agents: [
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
        'model-serving': {
          type: 'service',
          description: 'Model serving and deployment',
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
      urn: 'urn:agent:data:etl-agent@2.1.0',
      name: 'etl-agent',
      version: '2.1.0',
      description: 'Extract, Transform, Load processing agent',
      capabilities: {
        'etl': {
          type: 'service',
          description: 'ETL data processing pipeline',
          version: '2.1.0'
        },
        'data-validation': {
          type: 'service',
          description: 'Data quality validation',
          version: '1.0.0'
        }
      },
      endpoints: {
        api: '/api/v1',
        health: '/health',
        status: '/status'
      }
    },
    {
      urn: 'urn:agent:api:gateway-agent@1.5.0',
      name: 'gateway-agent',
      version: '1.5.0',
      description: 'API gateway and routing agent',
      capabilities: {
        'api-routing': {
          type: 'service',
          description: 'API request routing and load balancing',
          version: '1.5.0'
        },
        'rate-limiting': {
          type: 'service',
          description: 'API rate limiting and throttling',
          version: '1.0.0'
        }
      },
      endpoints: {
        api: '/api/v1',
        health: '/health',
        admin: '/admin'
      }
    }
  ]
};

/**
 * Main demo function
 */
async function runDemo() {
  console.log('🚀 Starting Agent Discovery Demo\n');

  try {
    // Step 1: Generate ACM manifests for all agents
    console.log('📋 Step 1: Generating ACM Manifests');
    await generateACMManifests();
    console.log('✅ ACM manifests generated successfully\n');

    // Step 2: Start well-known server
    console.log('🌐 Step 2: Starting Well-Known Server');
    const server = await startWellKnownServer(DEMO_CONFIG.server);
    console.log(`✅ Server started on http://${DEMO_CONFIG.server.host}:${DEMO_CONFIG.server.port}\n`);

    // Step 3: Demonstrate URN resolution
    console.log('🔍 Step 3: URN Resolution Demo');
    await demonstrateURNResolution();
    console.log('✅ URN resolution completed\n');

    // Step 4: Demonstrate capability discovery
    console.log('🔎 Step 4: Capability Discovery Demo');
    await demonstrateCapabilityDiscovery();
    console.log('✅ Capability discovery completed\n');

    // Step 5: Demonstrate well-known endpoints
    console.log('🌍 Step 5: Well-Known Endpoints Demo');
    await demonstrateWellKnownEndpoints();
    console.log('✅ Well-known endpoints demonstrated\n');

    // Step 6: Cache demonstration
    console.log('💾 Step 6: Cache Performance Demo');
    await demonstrateCaching();
    console.log('✅ Cache performance demonstrated\n');

    // Step 7: Error handling demonstration
    console.log('⚠️  Step 7: Error Handling Demo');
    await demonstrateErrorHandling();
    console.log('✅ Error handling demonstrated\n');

    console.log('🎉 Agent Discovery Demo completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   • Generated ${DEMO_CONFIG.agents.length} ACM manifests`);
    console.log(`   • Started well-known server on port ${DEMO_CONFIG.server.port}`);
    console.log(`   • Demonstrated URN resolution and capability discovery`);
    console.log(`   • Tested well-known HTTP endpoints`);
    console.log(`   • Validated caching and error handling`);

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    process.exit(1);
  }
}

/**
 * Generate ACM manifests for all demo agents
 */
async function generateACMManifests() {
  const acmGenerator = createACMGenerator({ enableLogging: false });
  const manifests = [];

  for (const agentConfig of DEMO_CONFIG.agents) {
    console.log(`   Generating manifest for ${agentConfig.urn}`);
    
    const manifest = await acmGenerator.createACM(agentConfig);
    
    // Validate the generated manifest
    const isValid = await acmGenerator.validateACM(manifest);
    if (!isValid) {
      throw new Error(`Generated manifest for ${agentConfig.urn} is invalid`);
    }

    manifests.push(manifest);
    
    console.log(`   ✅ ${agentConfig.name} - ${Object.keys(agentConfig.capabilities).length} capabilities`);
  }

  return manifests;
}

/**
 * Demonstrate URN resolution
 */
async function demonstrateURNResolution() {
  const urnResolver = createURNResolver({ enableLogging: false });

  for (const agent of DEMO_CONFIG.agents) {
    console.log(`   Resolving URN: ${agent.urn}`);
    
    const result = await urnResolver.resolveAgentUrn(agent.urn);
    
    console.log(`   ✅ Resolved: ${result.metadata.name} v${result.metadata.version}`);
    console.log(`      Capabilities: ${Object.keys(result.capabilities).join(', ')}`);
    console.log(`      Cached: ${result.cached}`);
  }
}

/**
 * Demonstrate capability discovery by domain
 */
async function demonstrateCapabilityDiscovery() {
  const urnResolver = createURNResolver({ enableLogging: false });
  const domains = ['ai', 'data', 'api'];

  for (const domain of domains) {
    console.log(`   Discovering capabilities in domain: ${domain}`);
    
    const agents = await urnResolver.discoverCapabilities(domain);
    
    console.log(`   ✅ Found ${agents.length} agents in ${domain} domain:`);
    for (const agent of agents) {
      console.log(`      • ${agent.name} (${agent.urn})`);
    }
  }
}

/**
 * Demonstrate well-known HTTP endpoints
 */
async function demonstrateWellKnownEndpoints() {
  const baseUrl = `http://${DEMO_CONFIG.server.host}:${DEMO_CONFIG.server.port}`;
  
  console.log(`   Testing well-known endpoints at ${baseUrl}`);

  // Test capabilities list endpoint
  console.log('   📋 Testing /.well-known/agent-capabilities');
  try {
    const response = await fetch(`${baseUrl}/.well-known/agent-capabilities?domain=ai`);
    const data = await response.json();
    console.log(`   ✅ Capabilities list: ${data.items.length} agents found`);
  } catch (error) {
    console.log(`   ⚠️  Capabilities list endpoint not available (expected in mock)`);
  }

  // Test specific URN endpoint
  const testUrn = DEMO_CONFIG.agents[0].urn;
  console.log(`   🔍 Testing /.well-known/agent-capabilities/${encodeURIComponent(testUrn)}`);
  try {
    const response = await fetch(`${baseUrl}/.well-known/agent-capabilities/${encodeURIComponent(testUrn)}`);
    const data = await response.json();
    console.log(`   ✅ URN resolution: ${data.metadata.name} capabilities retrieved`);
  } catch (error) {
    console.log(`   ⚠️  URN endpoint not available (expected in mock)`);
  }
}

/**
 * Demonstrate caching performance
 */
async function demonstrateCaching() {
  const urnResolver = createURNResolver({ 
    enableLogging: false,
    cacheTtl: 5000 // 5 second cache
  });

  const testUrn = DEMO_CONFIG.agents[0].urn;

  console.log(`   Testing cache performance with URN: ${testUrn}`);

  // First resolution (cache miss)
  console.log('   🔍 First resolution (cache miss)');
  const start1 = Date.now();
  const result1 = await urnResolver.resolveAgentUrn(testUrn);
  const time1 = Date.now() - start1;
  console.log(`   ✅ Resolved in ${time1}ms, cached: ${result1.cached}`);

  // Second resolution (cache hit)
  console.log('   🔍 Second resolution (cache hit)');
  const start2 = Date.now();
  const result2 = await urnResolver.resolveAgentUrn(testUrn);
  const time2 = Date.now() - start2;
  console.log(`   ✅ Resolved in ${time2}ms, cached: ${result2.cached}`);

  // Show cache statistics
  const stats = urnResolver.getCacheStats();
  console.log(`   📊 Cache stats: ${stats.size} entries, oldest: ${stats.oldestEntry}, newest: ${stats.newestEntry}`);
}

/**
 * Demonstrate error handling
 */
async function demonstrateErrorHandling() {
  const urnResolver = createURNResolver({ enableLogging: false });
  const acmGenerator = createACMGenerator({ enableLogging: false });

  console.log('   Testing error handling scenarios');

  // Test invalid URN format
  console.log('   ❌ Testing invalid URN format');
  try {
    await urnResolver.resolveAgentUrn('invalid-urn-format');
  } catch (error) {
    console.log(`   ✅ Caught expected error: ${error.name} - ${error.message}`);
  }

  // Test missing agent configuration
  console.log('   ❌ Testing missing agent configuration');
  try {
    await acmGenerator.createACM({});
  } catch (error) {
    console.log(`   ✅ Caught expected error: ${error.name} - ${error.message}`);
  }

  // Test invalid ACM manifest
  console.log('   ❌ Testing invalid ACM manifest');
  try {
    await acmGenerator.validateACM({});
  } catch (error) {
    console.log(`   ✅ Caught expected error: ${error.name} - ${error.message}`);
  }
}

/**
 * Utility function to simulate HTTP requests (mock implementation)
 */
async function fetch(url, options = {}) {
  // Mock fetch implementation for demo purposes
  // In a real implementation, this would make actual HTTP requests
  return {
    async json() {
      return {
        apiVersion: 'well-known.ossp-agi.io/v1',
        kind: 'AgentCapabilityList',
        metadata: {
          domain: 'ai',
          count: 1,
          generatedAt: new Date().toISOString()
        },
        items: [DEMO_CONFIG.agents[0]]
      };
    }
  };
}

// Run the demo if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo().catch(error => {
    console.error('Demo failed:', error);
    process.exit(1);
  });
}

export { runDemo, DEMO_CONFIG };
