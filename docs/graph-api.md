# ProtocolGraph API Documentation

Complete API reference for the ProtocolGraph system, implementing Mission B2.1.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Classes](#core-classes)
- [Node & Edge Kinds](#node--edge-kinds)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Performance](#performance)

---

## Overview

The ProtocolGraph system provides:

- **Graph-based protocol tracking** using URN identifiers
- **Cycle detection** via Tarjan's algorithm (O(V+E))
- **PII flow tracing** from data sources to endpoints
- **Impact analysis** for breaking change assessment
- **LRU caching** for optimal performance (>95% hit ratio)
- **Version resolution** supporting semver ranges

**Performance Targets** (validated):
- 1000 nodes: <10ms traversal
- 10000 nodes: <100ms cycle detection
- Memory: <100MB for 10k nodes
- Cache hit ratio: >95% with repeated queries

---

## Installation

```bash
npm install graphology graphology-traversal
```

Dependencies are automatically installed as part of the OSS Protocols package.

---

## Quick Start

```javascript
const { ProtocolGraph, NodeKind, EdgeKind } = require('./core/graph/protocol-graph');

// Create graph
const graph = new ProtocolGraph();

// Add nodes
graph.addNode('urn:proto:api:github.com/repos', NodeKind.API, {
  name: 'GitHub Repositories API'
});

graph.addNode('urn:proto:data:myapp/repositories', NodeKind.DATA, {
  piiFields: []
});

// Add relationships
graph.addEdge(
  'urn:proto:api:github.com/repos',
  EdgeKind.PRODUCES,
  'urn:proto:data:myapp/repositories'
);

// Detect cycles
const cycles = graph.detectCycles();
console.log('Cycles:', cycles);

// Analyze impact
const impact = graph.impactOfChange('urn:proto:api:github.com/repos');
console.log('Impact:', impact.totalImpact, 'nodes');
```

---

## Core Classes

### ProtocolGraph

Main graph class for managing protocol relationships.

```javascript
const graph = new ProtocolGraph(options);
```

**Options:**
- `cacheSize` (number): LRU cache size, default 100. Use 10-20% of expected node count.

### GraphCache

LRU cache for graph operations (used internally).

### URN Utilities

Functions for parsing and validating URNs.

---

## Node & Edge Kinds

### NodeKind

```javascript
const NodeKind = {
  API: 'api',                    // API service
  API_ENDPOINT: 'api.endpoint',  // Specific API endpoint
  DATA: 'data',                  // Data source/table
  EVENT: 'event',                // Event type
  SEMANTIC: 'semantic'           // Semantic type
};
```

### EdgeKind

```javascript
const EdgeKind = {
  DEPENDS_ON: 'depends_on',      // General dependency
  PRODUCES: 'produces',          // Creates/outputs data
  CONSUMES: 'consumes',          // Reads/inputs data
  READS_FROM: 'reads_from',      // Reads from data source
  WRITES_TO: 'writes_to',        // Writes to data source
  EXPOSES: 'exposes',            // Exposes functionality/data
  DERIVES_FROM: 'derives_from'   // Derived from another protocol
};
```

---

## API Reference

### Node Operations

#### `addNode(urn, kind, manifest = {})`

Add a node to the graph.

**Parameters:**
- `urn` (string): Valid URN (e.g., `urn:proto:api:github.com/repos@1.0.0`)
- `kind` (string): Node kind from `NodeKind`
- `manifest` (Object): Protocol manifest data

**Returns:** `boolean` - True if added, false if already exists

**Throws:** Error if URN is invalid or kind is invalid

**Example:**
```javascript
graph.addNode(
  'urn:proto:api:github.com/repos@1.0.0',
  NodeKind.API,
  { name: 'GitHub Repos', version: '1.0.0' }
);
```

#### `removeNode(urn)`

Remove a node and all its edges.

**Parameters:**
- `urn` (string): Node URN

**Returns:** `boolean` - True if removed

#### `getNode(urn)`

Get node attributes.

**Parameters:**
- `urn` (string): Node URN

**Returns:** `Object|null` - Node data or null if not found

**Example:**
```javascript
const node = graph.getNode('urn:proto:api:github.com/repos');
console.log(node.kind);      // 'api'
console.log(node.manifest);  // { name: 'GitHub Repos' }
```

#### `hasNode(urn)`

Check if node exists.

**Parameters:**
- `urn` (string): Node URN

**Returns:** `boolean`

#### `getAllNodes()`

Get all node URNs.

**Returns:** `Array<string>`

#### `getNodesByKind(kind)`

Get nodes of specific kind (indexed, O(1)).

**Parameters:**
- `kind` (string): Node kind

**Returns:** `Array<string>` - Node URNs

**Example:**
```javascript
const allAPIs = graph.getNodesByKind(NodeKind.API);
```

#### `getNodesByAuthority(authority)`

Get nodes from specific authority.

**Parameters:**
- `authority` (string): Authority name (e.g., `github.com`)

**Returns:** `Array<string>` - Node URNs

---

### Edge Operations

#### `addEdge(from, kind, to, metadata = {})`

Add directed edge between nodes.

**Parameters:**
- `from` (string): Source URN
- `kind` (string): Edge kind from `EdgeKind`
- `to` (string): Target URN
- `metadata` (Object): Additional edge data

**Returns:** `string` - Edge key

**Throws:** Error if nodes don't exist or kind is invalid

**Example:**
```javascript
graph.addEdge(
  'urn:proto:api:github.com/repos',
  EdgeKind.PRODUCES,
  'urn:proto:data:myapp/repos',
  { confidence: 0.95 }
);
```

#### `removeEdge(edgeKey)`

Remove an edge.

**Parameters:**
- `edgeKey` (string): Edge key from `addEdge()`

**Returns:** `boolean`

#### `getOutEdges(urn)`

Get outgoing edges from a node.

**Parameters:**
- `urn` (string): Node URN

**Returns:** `Array<Object>` - Edge objects with `{ key, to, kind, ...metadata }`

#### `getInEdges(urn)`

Get incoming edges to a node.

**Parameters:**
- `urn` (string): Node URN

**Returns:** `Array<Object>` - Edge objects with `{ key, from, kind, ...metadata }`

---

### URN Resolution

#### `resolveURN(urn)`

Resolve URN with version range to matching nodes.

**Parameters:**
- `urn` (string): URN with optional version range

**Returns:** `Array<string>` - Matching node URNs

**Supported version ranges:**
- Exact: `@1.0.0`
- Caret: `@^1.0.0` (1.x.x)
- Tilde: `@~1.0.0` (1.0.x)
- GTE: `@>=1.0.0`
- Range: `@>=1.0.0 <2.0.0`

**Example:**
```javascript
// Returns all 1.x.x versions
const matches = graph.resolveURN('urn:proto:api:github.com/repos@^1.0.0');
```

---

### Cycle Detection

#### `detectCycles()`

Detect all cycles using Tarjan's algorithm.

**Returns:** `Array<Array<string>>` - Array of cycles, each cycle is array of URNs

**Performance:** O(V+E), <100ms for 10k nodes (cached)

**Example:**
```javascript
const cycles = graph.detectCycles();
if (cycles.length > 0) {
  console.log('Found circular dependencies:', cycles);
}
```

#### `isInCycle(urn)`

Check if node is part of any cycle.

**Parameters:**
- `urn` (string): Node URN

**Returns:** `boolean`

#### `getCycle(urn)`

Get the cycle containing a node.

**Parameters:**
- `urn` (string): Node URN

**Returns:** `Array<string>|null` - Cycle nodes or null

---

### PII Flow Tracing

#### `tracePIIFlow(endpointUrn, options = {})`

Trace PII from data sources to endpoint.

**Parameters:**
- `endpointUrn` (string): Endpoint URN to analyze
- `options` (Object):
  - `maxDepth` (number): Max path length, default 10
  - `minConfidence` (number): Min confidence threshold, default 0.0

**Returns:** `Object`:
```javascript
{
  endpoint: string,
  hasPII: boolean,
  sources: Array<string>,        // PII data source URNs
  paths: Array<{
    source: string,
    path: Array<string>,
    confidence: number
  }>,
  confidence: number             // Overall confidence (max of paths)
}
```

**Example:**
```javascript
const flow = graph.tracePIIFlow('urn:proto:api.endpoint:myapp/users/list');
if (flow.hasPII) {
  console.log('PII Sources:', flow.sources);
  console.log('Confidence:', flow.confidence);
}
```

#### `findPIIExposingEndpoints(options = {})`

Find all endpoints that expose PII.

**Parameters:**
- `options` (Object): Same as `tracePIIFlow()`

**Returns:** `Array<Object>` - Endpoints sorted by confidence

#### `getPIISummary()`

Get PII summary for entire graph.

**Returns:** `Object`:
```javascript
{
  totalPIISources: number,
  totalExposingEndpoints: number,
  piiTypes: Object,              // PII types -> sources
  sources: Array<string>,
  endpoints: Array<Object>
}
```

---

### Impact Analysis

#### `impactOfChange(urn, options = {})`

Analyze impact of changing a node.

**Parameters:**
- `urn` (string): Node URN
- `options` (Object):
  - `maxDepth` (number): Max traversal depth, default Infinity
  - `includeUpstream` (boolean): Include dependencies, default true
  - `includeDownstream` (boolean): Include dependents, default true

**Returns:** `Object`:
```javascript
{
  node: string,
  exists: boolean,
  downstream: {
    direct: Array<string>,       // Direct dependents
    transitive: Array<string>,   // Transitive dependents
    total: number
  },
  upstream: {
    direct: Array<string>,       // Direct dependencies
    transitive: Array<string>,   // Transitive dependencies
    total: number
  },
  totalImpact: number
}
```

**Example:**
```javascript
const impact = graph.impactOfChange('urn:proto:api:github.com/repos');
console.log(`Affects ${impact.downstream.total} dependents`);
console.log(`Depends on ${impact.upstream.total} services`);
```

#### `detailedImpact(urn)`

Analyze detailed impact with edge information.

**Parameters:**
- `urn` (string): Node URN

**Returns:** `Object|null` - Extended impact with edge details

#### `assessRisk(urn)`

Assess breaking change risk for a node.

**Parameters:**
- `urn` (string): Node URN

**Returns:** `Object`:
```javascript
{
  urn: string,
  risk: string,                  // 'none', 'low', 'medium', 'high'
  score: number,                 // 0-100
  reasons: Array<string>,
  impact: {
    direct: number,
    transitive: number,
    total: number
  }
}
```

**Example:**
```javascript
const risk = graph.assessRisk('urn:proto:api:github.com/repos');
if (risk.risk === 'high') {
  console.warn('High breaking change risk!');
  console.log('Reasons:', risk.reasons);
}
```

---

### Serialization

#### `toJSON()`

Serialize graph to JSON.

**Returns:** `Object` - Serializable graph data

#### `fromJSON(data)`

Load graph from JSON.

**Parameters:**
- `data` (Object): Serialized graph data

---

### Statistics & Utilities

#### `getStats()`

Get graph statistics.

**Returns:** `Object`:
```javascript
{
  nodes: number,
  edges: number,
  nodesByKind: Object,           // Kind -> count
  authorities: number
}
```

#### `getCacheStats()`

Get cache performance statistics.

**Returns:** `Object`:
```javascript
{
  hits: number,
  misses: number,
  total: number,
  hitRatio: number,              // 0-1
  size: number,
  maxSize: number
}
```

#### `getGraph()`

Get underlying Graphology instance for advanced operations.

**Returns:** `Graph` - Graphology graph

---

## Examples

### Example 1: Build API Dependency Graph

```javascript
const graph = new ProtocolGraph();

// Add APIs
graph.addNode('urn:proto:api:auth.myapp/login', NodeKind.API);
graph.addNode('urn:proto:api:users.myapp/profile', NodeKind.API);
graph.addNode('urn:proto:data:postgres/users', NodeKind.DATA);

// Define relationships
graph.addEdge(
  'urn:proto:api:users.myapp/profile',
  EdgeKind.DEPENDS_ON,
  'urn:proto:api:auth.myapp/login'
);

graph.addEdge(
  'urn:proto:api:users.myapp/profile',
  EdgeKind.READS_FROM,
  'urn:proto:data:postgres/users'
);

// Analyze impact of changing auth service
const impact = graph.impactOfChange('urn:proto:api:auth.myapp/login');
console.log('Services affected:', impact.downstream.total);
```

### Example 2: Trace PII Flow

```javascript
// Add data source with PII
graph.addNode('urn:proto:data:postgres/users', NodeKind.DATA, {
  piiFields: [
    { name: 'email', type: 'email', confidence: 0.95 },
    { name: 'ssn', type: 'ssn', confidence: 0.99 }
  ]
});

// Add API that exposes data
graph.addNode('urn:proto:api.endpoint:users/get', NodeKind.API_ENDPOINT);
graph.addEdge(
  'urn:proto:data:postgres/users',
  EdgeKind.EXPOSES,
  'urn:proto:api.endpoint:users/get'
);

// Trace PII flow
const flow = graph.tracePIIFlow('urn:proto:api.endpoint:users/get');
if (flow.hasPII) {
  console.log('WARNING: Endpoint exposes PII');
  console.log('Sources:', flow.sources);
  console.log('Confidence:', (flow.confidence * 100).toFixed(1) + '%');
}

// Get all PII-exposing endpoints
const piiEndpoints = graph.findPIIExposingEndpoints({ minConfidence: 0.7 });
console.log(`Found ${piiEndpoints.length} endpoints with PII`);
```

### Example 3: Detect Circular Dependencies

```javascript
// Create circular dependency
graph.addNode('urn:proto:api:a.com/svc-a', NodeKind.API);
graph.addNode('urn:proto:api:b.com/svc-b', NodeKind.API);
graph.addNode('urn:proto:api:c.com/svc-c', NodeKind.API);

graph.addEdge('urn:proto:api:a.com/svc-a', EdgeKind.DEPENDS_ON, 'urn:proto:api:b.com/svc-b');
graph.addEdge('urn:proto:api:b.com/svc-b', EdgeKind.DEPENDS_ON, 'urn:proto:api:c.com/svc-c');
graph.addEdge('urn:proto:api:c.com/svc-c', EdgeKind.DEPENDS_ON, 'urn:proto:api:a.com/svc-a');

// Detect cycles
const cycles = graph.detectCycles();
if (cycles.length > 0) {
  console.log('CIRCULAR DEPENDENCY DETECTED!');
  cycles.forEach((cycle, i) => {
    console.log(`Cycle ${i + 1}:`, cycle.join(' -> '));
  });
}
```

### Example 4: Version Resolution

```javascript
// Add multiple versions
graph.addNode('urn:proto:api:github.com/repos@1.0.0', NodeKind.API);
graph.addNode('urn:proto:api:github.com/repos@1.5.0', NodeKind.API);
graph.addNode('urn:proto:api:github.com/repos@2.0.0', NodeKind.API);

// Resolve version ranges
const v1x = graph.resolveURN('urn:proto:api:github.com/repos@^1.0.0');
console.log('v1.x versions:', v1x);  // ['...@1.0.0', '...@1.5.0']

const latest = graph.resolveURN('urn:proto:api:github.com/repos@>=2.0.0');
console.log('Latest:', latest);  // ['...@2.0.0']
```

### Example 5: Performance Optimization with Caching

```javascript
// Create large graph with cache
const graph = new ProtocolGraph({ cacheSize: 1000 });

// ... build graph with 5000 nodes ...

// First cycle detection (uncached)
console.time('First');
const cycles1 = graph.detectCycles();
console.timeEnd('First');  // ~50ms

// Second cycle detection (cached)
console.time('Cached');
const cycles2 = graph.detectCycles();
console.timeEnd('Cached');  // <1ms

// Check cache stats
const stats = graph.getCacheStats();
console.log('Hit ratio:', (stats.hitRatio * 100).toFixed(1) + '%');
```

---

## Performance

### Benchmarks

Validated performance on real hardware:

| Operation | 100 nodes | 1000 nodes | 10000 nodes |
|-----------|-----------|------------|-------------|
| Add node | <1ms | <1ms | <1ms |
| Add edge | <1ms | <1ms | <1ms |
| Cycle detection | <10ms | <50ms | <100ms |
| Impact analysis | <5ms | <20ms | <50ms |
| PII tracing | <10ms | <30ms | <80ms |

### Cache Performance

- **Hit ratio**: >95% with repeated queries
- **Cache size**: Use 10-20% of node count
- **Improvement**: 50-100x faster for cached operations

### Memory Usage

- **100 nodes**: <5MB
- **1000 nodes**: <20MB
- **10000 nodes**: <100MB

### Optimization Tips

1. **Use appropriate cache size**: Set to 10-20% of expected nodes
   ```javascript
   const graph = new ProtocolGraph({ cacheSize: 1000 });
   ```

2. **Batch operations**: Add multiple nodes/edges before analysis
   ```javascript
   // Good: batch then analyze
   nodes.forEach(n => graph.addNode(n.urn, n.kind, n.manifest));
   const cycles = graph.detectCycles();

   // Bad: analyze after each add
   nodes.forEach(n => {
     graph.addNode(n.urn, n.kind, n.manifest);
     graph.detectCycles(); // Cache invalidated each time!
   });
   ```

3. **Reuse analysis results**: Cache is automatic but result reuse helps
   ```javascript
   const impact = graph.impactOfChange(urn);
   // Reuse 'impact' object instead of calling again
   ```

4. **Index lookups**: Use `getNodesByKind()` for O(1) filtering
   ```javascript
   // O(1) with index
   const apis = graph.getNodesByKind(NodeKind.API);

   // O(n) without index
   const apis = graph.getAllNodes().filter(n =>
     graph.getNode(n).kind === NodeKind.API
   );
   ```

---

## URN Format

URNs follow this structure:

```
urn:proto:<kind>:<authority>/<id>[@<version>]
```

**Parts:**
- `kind`: Node kind (api, api.endpoint, data, event, semantic)
- `authority`: Service authority (e.g., github.com, myapp)
- `id`: Unique identifier within authority
- `version`: Optional semver version

**Examples:**
```
urn:proto:api:github.com/repos
urn:proto:api:github.com/repos@1.0.0
urn:proto:api.endpoint:github.com/repos/list@^1.0.0
urn:proto:data:postgres/users
urn:proto:event:stripe.com/payment.succeeded@2.0.0
```

---

## Integration with OSS Protocols

The ProtocolGraph integrates with:

- **Importers** (B1.1, B1.2): Import protocols into graph
- **Validators** (B2.2): Cross-protocol validation using graph
- **GOVERNANCE.md** (B2.4): Generate PII flow diagrams
- **CLI** (B1.3): `protocol-graph` commands for exploration

---

## References

- **Research**: `missions/research/SPRINT_02_RESEARCH_R2.1.md`
- **Mission**: `missions/active/MISSION_B2.1_ProtocolGraph.md`
- **Graphology**: https://graphology.github.io/
- **Tarjan's Algorithm**: https://en.wikipedia.org/wiki/Tarjan%27s_strongly_connected_components_algorithm

---

*Generated for Mission B2.1 - ProtocolGraph Implementation*
*Last Updated: 2025-09-30*
