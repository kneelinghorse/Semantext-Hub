/**
 * ProtocolGraph Test Suite
 *
 * Comprehensive tests for the ProtocolGraph system including:
 * - Core operations (nodes, edges)
 * - URN resolution
 * - Cycle detection
 * - PII tracing
 * - Impact analysis
 * - Caching
 */

import { ProtocolGraph, NodeKind, EdgeKind } from '../../packages/protocols/core/graph/protocol-graph.js';
import { parseURN, normalizeURN, versionMatchesRange } from '../../packages/protocols/core/graph/urn-utils.js';

describe('ProtocolGraph', () => {
  let graph;

  beforeEach(() => {
    graph = new ProtocolGraph();
  });

  describe('Node Operations', () => {
    it('should add a node with valid URN', () => {
      const urn = 'urn:proto:api:github.com/repos@1.0.0';
      const result = graph.addNode(urn, NodeKind.API, { name: 'GitHub Repos' });

      expect(result).toBe(true);
      expect(graph.hasNode(urn)).toBe(true);
    });

    it('should reject invalid URN', () => {
      expect(() => {
        graph.addNode('invalid-urn', NodeKind.API);
      }).toThrow('Invalid URN');
    });

    it('should reject invalid node kind', () => {
      expect(() => {
        graph.addNode('urn:proto:api:github.com/repos', 'invalid-kind');
      }).toThrow('Invalid node kind');
    });

    it('should not add duplicate node', () => {
      const urn = 'urn:proto:api:github.com/repos@1.0.0';
      graph.addNode(urn, NodeKind.API);
      const result = graph.addNode(urn, NodeKind.API);

      expect(result).toBe(false);
    });

    it('should remove node and its edges', () => {
      const urn1 = 'urn:proto:api:github.com/repos';
      const urn2 = 'urn:proto:data:github.com/repository';

      graph.addNode(urn1, NodeKind.API);
      graph.addNode(urn2, NodeKind.DATA);
      graph.addEdge(urn1, EdgeKind.PRODUCES, urn2);

      expect(graph.removeNode(urn1)).toBe(true);
      expect(graph.hasNode(urn1)).toBe(false);
      expect(graph.getOutEdges(urn2).length).toBe(0);
    });

    it('should get node attributes', () => {
      const urn = 'urn:proto:api:github.com/repos';
      const manifest = { name: 'GitHub Repos' };

      graph.addNode(urn, NodeKind.API, manifest);
      const node = graph.getNode(urn);

      expect(node.kind).toBe(NodeKind.API);
      expect(node.manifest).toEqual(manifest);
    });

    it('should index nodes by kind', () => {
      graph.addNode('urn:proto:api:github.com/repos', NodeKind.API);
      graph.addNode('urn:proto:api:stripe.com/charges', NodeKind.API);
      graph.addNode('urn:proto:data:myapp/users', NodeKind.DATA);

      const apis = graph.getNodesByKind(NodeKind.API);
      const data = graph.getNodesByKind(NodeKind.DATA);

      expect(apis.length).toBe(2);
      expect(data.length).toBe(1);
    });

    it('should index nodes by authority', () => {
      graph.addNode('urn:proto:api:github.com/repos', NodeKind.API);
      graph.addNode('urn:proto:api:github.com/issues', NodeKind.API);
      graph.addNode('urn:proto:api:stripe.com/charges', NodeKind.API);

      const githubNodes = graph.getNodesByAuthority('github.com');
      const stripeNodes = graph.getNodesByAuthority('stripe.com');

      expect(githubNodes.length).toBe(2);
      expect(stripeNodes.length).toBe(1);
    });
  });

  describe('Edge Operations', () => {
    beforeEach(() => {
      graph.addNode('urn:proto:api:github.com/repos', NodeKind.API);
      graph.addNode('urn:proto:data:github.com/repository', NodeKind.DATA);
    });

    it('should add edge between nodes', () => {
      const edgeKey = graph.addEdge(
        'urn:proto:api:github.com/repos',
        EdgeKind.PRODUCES,
        'urn:proto:data:github.com/repository'
      );

      expect(edgeKey).toBeDefined();
    });

    it('should reject edge with non-existent source', () => {
      expect(() => {
        graph.addEdge(
          'urn:proto:api:nonexistent.com/foo',
          EdgeKind.PRODUCES,
          'urn:proto:data:github.com/repository'
        );
      }).toThrow('Source node not found');
    });

    it('should reject edge with invalid kind', () => {
      expect(() => {
        graph.addEdge(
          'urn:proto:api:github.com/repos',
          'invalid-kind',
          'urn:proto:data:github.com/repository'
        );
      }).toThrow('Invalid edge kind');
    });

    it('should get outgoing edges', () => {
      graph.addEdge(
        'urn:proto:api:github.com/repos',
        EdgeKind.PRODUCES,
        'urn:proto:data:github.com/repository',
        { metadata: 'test' }
      );

      const edges = graph.getOutEdges('urn:proto:api:github.com/repos');

      expect(edges.length).toBe(1);
      expect(edges[0].kind).toBe(EdgeKind.PRODUCES);
      expect(edges[0].to).toBe('urn:proto:data:github.com/repository');
    });

    it('should get incoming edges', () => {
      graph.addEdge(
        'urn:proto:api:github.com/repos',
        EdgeKind.PRODUCES,
        'urn:proto:data:github.com/repository'
      );

      const edges = graph.getInEdges('urn:proto:data:github.com/repository');

      expect(edges.length).toBe(1);
      expect(edges[0].kind).toBe(EdgeKind.PRODUCES);
      expect(edges[0].from).toBe('urn:proto:api:github.com/repos');
    });
  });

  describe('URN Resolution', () => {
    beforeEach(() => {
      graph.addNode('urn:proto:api:github.com/repos@1.0.0', NodeKind.API);
      graph.addNode('urn:proto:api:github.com/repos@1.5.0', NodeKind.API);
      graph.addNode('urn:proto:api:github.com/repos@2.0.0', NodeKind.API);
    });

    it('should resolve URN without version (returns all versions)', () => {
      const results = graph.resolveURN('urn:proto:api:github.com/repos');
      expect(results.length).toBe(3);
    });

    it('should resolve exact version', () => {
      const results = graph.resolveURN('urn:proto:api:github.com/repos@1.5.0');
      expect(results.length).toBe(1);
      expect(results[0]).toBe('urn:proto:api:github.com/repos@1.5.0');
    });

    it('should resolve caret version range', () => {
      const results = graph.resolveURN('urn:proto:api:github.com/repos@^1.0.0');
      expect(results.length).toBe(2);
      expect(results).toContain('urn:proto:api:github.com/repos@1.0.0');
      expect(results).toContain('urn:proto:api:github.com/repos@1.5.0');
    });

    it('should resolve >= version range', () => {
      const results = graph.resolveURN('urn:proto:api:github.com/repos@>=1.5.0');
      expect(results.length).toBe(2);
      expect(results).toContain('urn:proto:api:github.com/repos@1.5.0');
      expect(results).toContain('urn:proto:api:github.com/repos@2.0.0');
    });
  });

  describe('Cycle Detection', () => {
    it('should detect no cycles in DAG', () => {
      graph.addNode('urn:proto:api:a.com/a', NodeKind.API);
      graph.addNode('urn:proto:api:b.com/b', NodeKind.API);
      graph.addNode('urn:proto:api:c.com/c', NodeKind.API);

      graph.addEdge('urn:proto:api:a.com/a', EdgeKind.DEPENDS_ON, 'urn:proto:api:b.com/b');
      graph.addEdge('urn:proto:api:b.com/b', EdgeKind.DEPENDS_ON, 'urn:proto:api:c.com/c');

      const cycles = graph.detectCycles();
      expect(cycles.length).toBe(0);
    });

    it('should detect simple cycle', () => {
      graph.addNode('urn:proto:api:a.com/a', NodeKind.API);
      graph.addNode('urn:proto:api:b.com/b', NodeKind.API);

      graph.addEdge('urn:proto:api:a.com/a', EdgeKind.DEPENDS_ON, 'urn:proto:api:b.com/b');
      graph.addEdge('urn:proto:api:b.com/b', EdgeKind.DEPENDS_ON, 'urn:proto:api:a.com/a');

      const cycles = graph.detectCycles();
      expect(cycles.length).toBe(1);
      expect(cycles[0].length).toBe(2);
    });

    it('should detect complex cycle', () => {
      graph.addNode('urn:proto:api:a.com/a', NodeKind.API);
      graph.addNode('urn:proto:api:b.com/b', NodeKind.API);
      graph.addNode('urn:proto:api:c.com/c', NodeKind.API);

      graph.addEdge('urn:proto:api:a.com/a', EdgeKind.DEPENDS_ON, 'urn:proto:api:b.com/b');
      graph.addEdge('urn:proto:api:b.com/b', EdgeKind.DEPENDS_ON, 'urn:proto:api:c.com/c');
      graph.addEdge('urn:proto:api:c.com/c', EdgeKind.DEPENDS_ON, 'urn:proto:api:a.com/a');

      const cycles = graph.detectCycles();
      expect(cycles.length).toBe(1);
      expect(cycles[0].length).toBe(3);
    });

    it('should check if node is in cycle', () => {
      graph.addNode('urn:proto:api:a.com/a', NodeKind.API);
      graph.addNode('urn:proto:api:b.com/b', NodeKind.API);

      graph.addEdge('urn:proto:api:a.com/a', EdgeKind.DEPENDS_ON, 'urn:proto:api:b.com/b');
      graph.addEdge('urn:proto:api:b.com/b', EdgeKind.DEPENDS_ON, 'urn:proto:api:a.com/a');

      expect(graph.isInCycle('urn:proto:api:a.com/a')).toBe(true);
      expect(graph.isInCycle('urn:proto:api:b.com/b')).toBe(true);
    });
  });

  describe('PII Flow Tracing', () => {
    beforeEach(() => {
      // Create data source with PII
      graph.addNode('urn:proto:data:myapp/users', NodeKind.DATA, {
        piiFields: [
          { name: 'email', type: 'email', confidence: 0.95 },
          { name: 'phone', type: 'phone', confidence: 0.9 }
        ]
      });

      // Create API that reads from data
      graph.addNode('urn:proto:api:myapp/users', NodeKind.API);
      graph.addEdge(
        'urn:proto:data:myapp/users',
        EdgeKind.EXPOSES,
        'urn:proto:api:myapp/users'
      );

      // Create endpoint
      graph.addNode('urn:proto:api.endpoint:myapp/users/list', NodeKind.API_ENDPOINT);
      graph.addEdge(
        'urn:proto:api:myapp/users',
        EdgeKind.EXPOSES,
        'urn:proto:api.endpoint:myapp/users/list'
      );
    });

    it('should trace PII to endpoint', () => {
      const flow = graph.tracePIIFlow('urn:proto:api.endpoint:myapp/users/list');

      expect(flow.hasPII).toBe(true);
      expect(flow.sources.length).toBeGreaterThan(0);
      expect(flow.sources).toContain('urn:proto:data:myapp/users');
      expect(flow.paths.length).toBeGreaterThan(0);
    });

    it('should find PII-exposing endpoints', () => {
      const endpoints = graph.findPIIExposingEndpoints();

      expect(endpoints.length).toBe(1);
      expect(endpoints[0].endpoint).toBe('urn:proto:api.endpoint:myapp/users/list');
    });

    it('should get PII summary', () => {
      const summary = graph.getPIISummary();

      expect(summary.totalPIISources).toBe(1);
      expect(summary.totalExposingEndpoints).toBe(1);
    });

    it('should not find PII for non-PII endpoint', () => {
      graph.addNode('urn:proto:api.endpoint:myapp/health', NodeKind.API_ENDPOINT);

      const flow = graph.tracePIIFlow('urn:proto:api.endpoint:myapp/health');

      expect(flow.hasPII).toBe(false);
      expect(flow.sources.length).toBe(0);
    });
  });

  describe('Impact Analysis', () => {
    beforeEach(() => {
      // Create dependency chain: A -> B -> C
      graph.addNode('urn:proto:api:a.com/a', NodeKind.API);
      graph.addNode('urn:proto:api:b.com/b', NodeKind.API);
      graph.addNode('urn:proto:api:c.com/c', NodeKind.API);

      graph.addEdge('urn:proto:api:a.com/a', EdgeKind.DEPENDS_ON, 'urn:proto:api:b.com/b');
      graph.addEdge('urn:proto:api:b.com/b', EdgeKind.DEPENDS_ON, 'urn:proto:api:c.com/c');
    });

    it('should analyze downstream impact', () => {
      const impact = graph.impactOfChange('urn:proto:api:c.com/c');

      expect(impact.downstream.direct.length).toBe(0); // Nothing depends on C
      expect(impact.upstream.direct.length).toBe(1); // C depends on B
    });

    it('should analyze upstream impact', () => {
      const impact = graph.impactOfChange('urn:proto:api:a.com/a');

      expect(impact.downstream.direct.length).toBe(1); // A depends on B
      expect(impact.downstream.transitive.length).toBe(1); // A transitively depends on C
    });

    it('should analyze transitive impact', () => {
      const impact = graph.impactOfChange('urn:proto:api:b.com/b');

      expect(impact.downstream.total).toBe(1); // B -> C
      expect(impact.upstream.total).toBe(1); // A -> B
    });

    it('should assess breaking change risk', () => {
      // Add more dependents to increase risk
      graph.addNode('urn:proto:api:d.com/d', NodeKind.API);
      graph.addNode('urn:proto:api:e.com/e', NodeKind.API);
      graph.addEdge('urn:proto:api:b.com/b', EdgeKind.EXPOSES, 'urn:proto:api:d.com/d');
      graph.addEdge('urn:proto:api:b.com/b', EdgeKind.EXPOSES, 'urn:proto:api:e.com/e');

      const risk = graph.assessRisk('urn:proto:api:b.com/b');

      expect(risk.risk).toBeDefined();
      expect(risk.score).toBeGreaterThan(0);
      expect(risk.impact.direct).toBeGreaterThan(0);
    });
  });

  describe('Serialization', () => {
    beforeEach(() => {
      graph.addNode('urn:proto:api:a.com/a', NodeKind.API, { name: 'A' });
      graph.addNode('urn:proto:api:b.com/b', NodeKind.API, { name: 'B' });
      graph.addEdge('urn:proto:api:a.com/a', EdgeKind.DEPENDS_ON, 'urn:proto:api:b.com/b');
    });

    it('should serialize to JSON', () => {
      const json = graph.toJSON();

      expect(json.nodes.length).toBe(2);
      expect(json.edges.length).toBe(1);
    });

    it('should deserialize from JSON', () => {
      const json = graph.toJSON();
      const newGraph = new ProtocolGraph();
      newGraph.fromJSON(json);

      expect(newGraph.getAllNodes().length).toBe(2);
      expect(newGraph.hasNode('urn:proto:api:a.com/a')).toBe(true);
      expect(newGraph.hasNode('urn:proto:api:b.com/b')).toBe(true);
    });

    it('should preserve edge data after serialization', () => {
      const json = graph.toJSON();
      const newGraph = new ProtocolGraph();
      newGraph.fromJSON(json);

      const edges = newGraph.getOutEdges('urn:proto:api:a.com/a');
      expect(edges.length).toBe(1);
      expect(edges[0].kind).toBe(EdgeKind.DEPENDS_ON);
    });
  });

  describe('Caching', () => {
    beforeEach(() => {
      graph.addNode('urn:proto:api:a.com/a', NodeKind.API);
      graph.addNode('urn:proto:api:b.com/b', NodeKind.API);
      graph.addEdge('urn:proto:api:a.com/a', EdgeKind.DEPENDS_ON, 'urn:proto:api:b.com/b');
      graph.addEdge('urn:proto:api:b.com/b', EdgeKind.DEPENDS_ON, 'urn:proto:api:a.com/a');
    });

    it('should cache cycle detection results', () => {
      const cycles1 = graph.detectCycles();
      const cycles2 = graph.detectCycles();

      expect(cycles1).toEqual(cycles2);

      const stats = graph.getCacheStats();
      expect(stats.hits).toBeGreaterThan(0);
    });

    it('should invalidate cache on graph modification', () => {
      graph.detectCycles();

      graph.addNode('urn:proto:api:c.com/c', NodeKind.API);

      const cycles = graph.detectCycles();
      expect(cycles).toBeDefined();
    });

    it('should cache impact analysis', () => {
      const impact1 = graph.impactOfChange('urn:proto:api:a.com/a');
      const impact2 = graph.impactOfChange('urn:proto:api:a.com/a');

      expect(impact1).toEqual(impact2);
    });
  });

  describe('Statistics', () => {
    it('should return graph statistics', () => {
      graph.addNode('urn:proto:api:a.com/a', NodeKind.API);
      graph.addNode('urn:proto:api:b.com/b', NodeKind.API);
      graph.addNode('urn:proto:data:c.com/c', NodeKind.DATA);
      graph.addEdge('urn:proto:api:a.com/a', EdgeKind.DEPENDS_ON, 'urn:proto:api:b.com/b');

      const stats = graph.getStats();

      expect(stats.nodes).toBe(3);
      expect(stats.edges).toBe(1);
      expect(stats.nodesByKind[NodeKind.API]).toBe(2);
      expect(stats.nodesByKind[NodeKind.DATA]).toBe(1);
    });
  });
});

describe('URN Utils', () => {
  describe('parseURN', () => {
    it('should parse valid URN', () => {
      const parsed = parseURN('urn:proto:api:github.com/repos@1.0.0');

      expect(parsed.kind).toBe('api');
      expect(parsed.authority).toBe('github.com');
      expect(parsed.id).toBe('repos');
      expect(parsed.version).toBe('1.0.0');
    });

    it('should parse URN without version', () => {
      const parsed = parseURN('urn:proto:api:github.com/repos');

      expect(parsed.version).toBeNull();
    });

    it('should reject invalid URN', () => {
      expect(parseURN('invalid')).toBeNull();
      expect(parseURN('urn:proto:invalid-kind:github.com/repos')).toBeNull();
    });
  });

  describe('normalizeURN', () => {
    it('should remove version from URN', () => {
      const normalized = normalizeURN('urn:proto:api:github.com/repos@1.0.0');
      expect(normalized).toBe('urn:proto:api:github.com/repos');
    });

    it('should handle URN without version', () => {
      const normalized = normalizeURN('urn:proto:api:github.com/repos');
      expect(normalized).toBe('urn:proto:api:github.com/repos');
    });
  });

  describe('versionMatchesRange', () => {
    it('should match exact version', () => {
      expect(versionMatchesRange('1.0.0', '1.0.0')).toBe(true);
      expect(versionMatchesRange('1.0.0', '1.0.1')).toBe(false);
    });

    it('should match caret range', () => {
      expect(versionMatchesRange('1.5.0', '^1.0.0')).toBe(true);
      expect(versionMatchesRange('2.0.0', '^1.0.0')).toBe(false);
    });

    it('should match tilde range', () => {
      expect(versionMatchesRange('1.0.5', '~1.0.0')).toBe(true);
      expect(versionMatchesRange('1.1.0', '~1.0.0')).toBe(false);
    });

    it('should match >= range', () => {
      expect(versionMatchesRange('2.0.0', '>=1.5.0')).toBe(true);
      expect(versionMatchesRange('1.0.0', '>=1.5.0')).toBe(false);
    });

    it('should match complex range', () => {
      expect(versionMatchesRange('1.8.0', '>=1.5.0 <2.0.0')).toBe(true);
      expect(versionMatchesRange('2.0.0', '>=1.5.0 <2.0.0')).toBe(false);
    });
  });
});
