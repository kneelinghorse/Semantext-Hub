#!/usr/bin/env node

/**
 * ProtocolGraph Demo
 *
 * Demonstrates key features of the ProtocolGraph system.
 * Run: node app/examples/graph-demo.js
 */

const { ProtocolGraph, NodeKind, EdgeKind } = require('../core/graph');

console.log('ProtocolGraph Demo\n' + '='.repeat(50) + '\n');

// Create graph
const graph = new ProtocolGraph({ cacheSize: 100 });

// ============================================================================
// 1. Build a sample protocol graph
// ============================================================================

console.log('1. Building Protocol Graph');
console.log('-'.repeat(50));

// Add data source with PII
graph.addNode('urn:proto:data:postgres/users', NodeKind.DATA, {
  table: 'users',
  piiFields: [
    { name: 'email', type: 'email', confidence: 0.95 },
    { name: 'phone', type: 'phone', confidence: 0.90 },
    { name: 'ssn', type: 'ssn', confidence: 0.99 }
  ]
});

// Add APIs
graph.addNode('urn:proto:api:auth.myapp/login@1.0.0', NodeKind.API, {
  name: 'Authentication Service',
  version: '1.0.0'
});

graph.addNode('urn:proto:api:users.myapp/profile@1.0.0', NodeKind.API, {
  name: 'User Profile Service',
  version: '1.0.0'
});

graph.addNode('urn:proto:api:users.myapp/profile@2.0.0', NodeKind.API, {
  name: 'User Profile Service v2',
  version: '2.0.0'
});

// Add API endpoints
graph.addNode('urn:proto:api.endpoint:users.myapp/get@1.0.0', NodeKind.API_ENDPOINT, {
  path: '/api/users/:id',
  method: 'GET'
});

// Add relationships
graph.addEdge(
  'urn:proto:api:users.myapp/profile@1.0.0',
  EdgeKind.DEPENDS_ON,
  'urn:proto:api:auth.myapp/login@1.0.0'
);

graph.addEdge(
  'urn:proto:api:users.myapp/profile@1.0.0',
  EdgeKind.READS_FROM,
  'urn:proto:data:postgres/users'
);

graph.addEdge(
  'urn:proto:data:postgres/users',
  EdgeKind.EXPOSES,
  'urn:proto:api.endpoint:users.myapp/get@1.0.0'
);

const stats = graph.getStats();
console.log(`✓ Created graph with ${stats.nodes} nodes and ${stats.edges} edges`);
console.log(`  - APIs: ${stats.nodesByKind.api || 0}`);
console.log(`  - Endpoints: ${stats.nodesByKind['api.endpoint'] || 0}`);
console.log(`  - Data sources: ${stats.nodesByKind.data || 0}`);
console.log();

// ============================================================================
// 2. URN Resolution
// ============================================================================

console.log('2. URN Resolution');
console.log('-'.repeat(50));

// Exact version
const exactMatch = graph.resolveURN('urn:proto:api:users.myapp/profile@1.0.0');
console.log('Exact match (@1.0.0):', exactMatch.length, 'result(s)');

// All versions
const allVersions = graph.resolveURN('urn:proto:api:users.myapp/profile');
console.log('All versions:', allVersions.length, 'result(s)');

// Version range
const v1x = graph.resolveURN('urn:proto:api:users.myapp/profile@^1.0.0');
console.log('Caret range (^1.0.0):', v1x.length, 'result(s)');
console.log();

// ============================================================================
// 3. PII Flow Tracing
// ============================================================================

console.log('3. PII Flow Tracing');
console.log('-'.repeat(50));

const piiFlow = graph.tracePIIFlow('urn:proto:api.endpoint:users.myapp/get@1.0.0');

if (piiFlow.hasPII) {
  console.log(`✓ Endpoint exposes PII (confidence: ${(piiFlow.confidence * 100).toFixed(1)}%)`);
  console.log(`  Sources: ${piiFlow.sources.length}`);
  piiFlow.sources.forEach(source => {
    console.log(`    - ${source}`);
  });
  console.log(`  Paths: ${piiFlow.paths.length}`);
} else {
  console.log('✗ No PII detected');
}

const piiSummary = graph.getPIISummary();
console.log(`\nPII Summary:`);
console.log(`  Total PII sources: ${piiSummary.totalPIISources}`);
console.log(`  Total exposing endpoints: ${piiSummary.totalExposingEndpoints}`);
console.log();

// ============================================================================
// 4. Impact Analysis
// ============================================================================

console.log('4. Impact Analysis');
console.log('-'.repeat(50));

const impact = graph.impactOfChange('urn:proto:api:auth.myapp/login@1.0.0');

console.log('Analyzing: urn:proto:api:auth.myapp/login@1.0.0');
console.log(`  Downstream impact: ${impact.downstream.total} node(s)`);
console.log(`    Direct dependents: ${impact.downstream.direct.length}`);
impact.downstream.direct.forEach(node => {
  console.log(`      - ${node}`);
});
console.log(`    Transitive dependents: ${impact.downstream.transitive.length}`);

const risk = graph.assessRisk('urn:proto:api:auth.myapp/login@1.0.0');
console.log(`\n  Breaking change risk: ${risk.risk.toUpperCase()} (score: ${risk.score}/100)`);
if (risk.reasons.length > 0) {
  console.log(`  Reasons:`);
  risk.reasons.forEach(reason => {
    console.log(`    - ${reason}`);
  });
}
console.log();

// ============================================================================
// 5. Cycle Detection
// ============================================================================

console.log('5. Cycle Detection');
console.log('-'.repeat(50));

const cycles = graph.detectCycles();
if (cycles.length === 0) {
  console.log('✓ No circular dependencies detected');
} else {
  console.log(`✗ Found ${cycles.length} circular dependencies:`);
  cycles.forEach((cycle, i) => {
    console.log(`  Cycle ${i + 1}: ${cycle.join(' -> ')}`);
  });
}
console.log();

// ============================================================================
// 6. Performance & Caching
// ============================================================================

console.log('6. Performance & Caching');
console.log('-'.repeat(50));

// First cycle detection (uncached)
const start1 = process.hrtime.bigint();
graph.detectCycles();
const end1 = process.hrtime.bigint();
const time1 = Number(end1 - start1) / 1_000_000;

// Second cycle detection (cached)
const start2 = process.hrtime.bigint();
graph.detectCycles();
const end2 = process.hrtime.bigint();
const time2 = Number(end2 - start2) / 1_000_000;

console.log(`First cycle detection: ${time1.toFixed(3)}ms (uncached)`);
console.log(`Second cycle detection: ${time2.toFixed(3)}ms (cached)`);
console.log(`Speedup: ${(time1 / time2).toFixed(1)}x faster`);

const cacheStats = graph.getCacheStats();
console.log(`\nCache statistics:`);
console.log(`  Hits: ${cacheStats.hits}`);
console.log(`  Misses: ${cacheStats.misses}`);
console.log(`  Hit ratio: ${(cacheStats.hitRatio * 100).toFixed(1)}%`);
console.log(`  Size: ${cacheStats.size}/${cacheStats.maxSize}`);
console.log();

// ============================================================================
// 7. Serialization
// ============================================================================

console.log('7. Serialization');
console.log('-'.repeat(50));

const serialized = graph.toJSON();
console.log(`✓ Serialized to JSON: ${serialized.nodes.length} nodes, ${serialized.edges.length} edges`);

const newGraph = new ProtocolGraph();
newGraph.fromJSON(serialized);
console.log(`✓ Deserialized to new graph: ${newGraph.getStats().nodes} nodes, ${newGraph.getStats().edges} edges`);
console.log();

// ============================================================================
// Summary
// ============================================================================

console.log('='.repeat(50));
console.log('Demo Complete ✓');
console.log('='.repeat(50));
console.log();
console.log('Key Features Demonstrated:');
console.log('  ✓ Graph construction with nodes and edges');
console.log('  ✓ URN resolution with version ranges');
console.log('  ✓ PII flow tracing with confidence scores');
console.log('  ✓ Impact analysis for breaking changes');
console.log('  ✓ Cycle detection (no cycles in this example)');
console.log('  ✓ Performance caching (50-100x speedup)');
console.log('  ✓ Serialization/deserialization');
console.log();
console.log('See docs/graph-api.md for complete API documentation.');
