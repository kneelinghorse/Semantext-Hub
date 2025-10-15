#!/usr/bin/env node
/**
 * Example: Generate GOVERNANCE.md from protocol graph
 *
 * Demonstrates how to use GovernanceGenerator to create
 * automated governance documentation.
 */

const { GovernanceGenerator } = require('../core/governance');
const { ProtocolGraph, NodeKind, EdgeKind } = require('../core/graph');
const { OverrideEngine } = require('../core/overrides');
const path = require('path');

async function generateGovernance() {
  console.log('🏛️  Generating GOVERNANCE.md...\n');

  // 1. Create or load protocol graph
  const graph = new ProtocolGraph();

  // Add sample protocols (in real usage, load from workspace)
  console.log('📊 Loading protocol graph...');
  graph.addNode('urn:proto:api:myapp.com/users@1.0.0', NodeKind.API, {
    name: 'Users API',
    version: '1.0.0',
    owner: 'platform-team'
  });
  graph.addNode('urn:proto:data:myapp.com/user@1.0.0', NodeKind.DATA, {
    name: 'User Data',
    version: '1.0.0',
    fields: {
      id: { type: 'uuid' },
      email: { type: 'string', pii: true },
      name: { type: 'string', pii: true },
      created_at: { type: 'timestamp' }
    }
  });
  graph.addNode('urn:proto:api:myapp.com/orders@1.0.0', NodeKind.API, {
    name: 'Orders API',
    version: '1.0.0',
    owner: 'commerce-team'
  });

  // Add relationships
  graph.addEdge(
    'urn:proto:api:myapp.com/users@1.0.0',
    EdgeKind.EXPOSES,
    'urn:proto:data:myapp.com/user@1.0.0'
  );
  graph.addEdge(
    'urn:proto:api:myapp.com/orders@1.0.0',
    EdgeKind.DEPENDS_ON,
    'urn:proto:api:myapp.com/users@1.0.0'
  );

  const stats = graph.getStats();
  console.log(`   ✓ Loaded ${stats.nodes} protocols, ${stats.edges} relationships\n`);

  // 2. Initialize override engine
  console.log('🔧 Loading override rules...');
  const overrideEngine = new OverrideEngine(process.cwd());
  const overrideStats = overrideEngine.getStats();
  console.log(`   ✓ Loaded ${overrideStats.rules.total} override rules\n`);

  // 3. Create generator
  const generator = new GovernanceGenerator({
    graph,
    overrideEngine,
    manifests: []
  });

  // 4. Generate GOVERNANCE.md
  console.log('📝 Generating documentation...');
  const outputPath = path.join(process.cwd(), 'GOVERNANCE.md');

  const result = await generator.generateToFile(outputPath, {
    sections: ['all'],
    includeDiagrams: true,
    includePIIFlow: true,
    includeMetrics: true
  });

  console.log(`   ✓ Generated ${result.size} bytes\n`);
  console.log(`✅ GOVERNANCE.md created at: ${result.path}\n`);

  // Show preview
  console.log('📄 Preview:\n');
  const content = await require('fs-extra').readFile(outputPath, 'utf8');
  const lines = content.split('\n').slice(0, 30);
  console.log(lines.join('\n'));
  console.log('\n... (truncated)\n');
}

// Run if executed directly
if (require.main === module) {
  generateGovernance().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
}

module.exports = { generateGovernance };
