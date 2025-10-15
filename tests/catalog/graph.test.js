/**
 * Tests for dependency graph utilities
 * @module tests/catalog/graph.test
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  buildDependencyGraph,
  getDependencyTree,
  getConsumers,
  detectCycles,
  getBuildOrder,
  getFullBuildOrder,
  findPath,
  getGraphStats
} from '../../packages/protocols/src/catalog/graph';

describe('Graph Utilities', () => {
  describe('buildDependencyGraph', () => {
    it('should build graph from artifacts map', () => {
      const artifacts = new Map([
        ['urn:a:1.0.0', ['urn:b:1.0.0']],
        ['urn:b:1.0.0', ['urn:c:1.0.0']],
        ['urn:c:1.0.0', []]
      ]);

      const graph = buildDependencyGraph(artifacts);

      expect(graph.dependencies.get('urn:a:1.0.0')).toEqual(['urn:b:1.0.0']);
      expect(graph.dependencies.get('urn:b:1.0.0')).toEqual(['urn:c:1.0.0']);
      expect(graph.dependencies.get('urn:c:1.0.0')).toEqual([]);

      expect(graph.dependents.get('urn:a:1.0.0')).toEqual([]);
      expect(graph.dependents.get('urn:b:1.0.0')).toEqual(['urn:a:1.0.0']);
      expect(graph.dependents.get('urn:c:1.0.0')).toEqual(['urn:b:1.0.0']);
    });

    it('should handle multiple dependents', () => {
      const artifacts = new Map([
        ['urn:a:1.0.0', ['urn:c:1.0.0']],
        ['urn:b:1.0.0', ['urn:c:1.0.0']],
        ['urn:c:1.0.0', []]
      ]);

      const graph = buildDependencyGraph(artifacts);

      expect(graph.dependents.get('urn:c:1.0.0')).toContain('urn:a:1.0.0');
      expect(graph.dependents.get('urn:c:1.0.0')).toContain('urn:b:1.0.0');
      expect(graph.dependents.get('urn:c:1.0.0')?.length).toBe(2);
    });

    it('should handle disconnected components', () => {
      const artifacts = new Map([
        ['urn:a:1.0.0', ['urn:b:1.0.0']],
        ['urn:b:1.0.0', []],
        ['urn:c:1.0.0', ['urn:d:1.0.0']],
        ['urn:d:1.0.0', []]
      ]);

      const graph = buildDependencyGraph(artifacts);

      expect(graph.dependencies.size).toBe(4);
      expect(graph.dependents.size).toBe(4);
    });
  });

  describe('getDependencyTree', () => {
    /** @type {import('../../packages/protocols/src/catalog/graph').DependencyGraph} */
    let graph;

    beforeEach(() => {
      const artifacts = new Map([
        ['urn:a:1.0.0', ['urn:b:1.0.0', 'urn:c:1.0.0']],
        ['urn:b:1.0.0', ['urn:d:1.0.0']],
        ['urn:c:1.0.0', ['urn:d:1.0.0']],
        ['urn:d:1.0.0', []]
      ]);
      graph = buildDependencyGraph(artifacts);
    });

    it('should get complete dependency tree', () => {
      const tree = getDependencyTree('urn:a:1.0.0', graph);

      expect(tree.has('urn:a:1.0.0')).toBe(true);
      expect(tree.has('urn:b:1.0.0')).toBe(true);
      expect(tree.has('urn:c:1.0.0')).toBe(true);
      expect(tree.has('urn:d:1.0.0')).toBe(true);
      expect(tree.size).toBe(4);
    });

    it('should handle leaf nodes', () => {
      const tree = getDependencyTree('urn:d:1.0.0', graph);

      expect(tree.has('urn:d:1.0.0')).toBe(true);
      expect(tree.size).toBe(1);
    });

    it('should handle partial trees', () => {
      const tree = getDependencyTree('urn:b:1.0.0', graph);

      expect(tree.has('urn:b:1.0.0')).toBe(true);
      expect(tree.has('urn:d:1.0.0')).toBe(true);
      expect(tree.has('urn:a:1.0.0')).toBe(false);
      expect(tree.size).toBe(2);
    });
  });

  describe('getConsumers', () => {
    /** @type {import('../../packages/protocols/src/catalog/graph').DependencyGraph} */
    let graph;

    beforeEach(() => {
      const artifacts = new Map([
        ['urn:a:1.0.0', ['urn:d:1.0.0']],
        ['urn:b:1.0.0', ['urn:d:1.0.0']],
        ['urn:c:1.0.0', ['urn:b:1.0.0']],
        ['urn:d:1.0.0', []]
      ]);
      graph = buildDependencyGraph(artifacts);
    });

    it('should find direct consumers', () => {
      const consumers = getConsumers('urn:d:1.0.0', graph);

      expect(consumers.has('urn:a:1.0.0')).toBe(true);
      expect(consumers.has('urn:b:1.0.0')).toBe(true);
      expect(consumers.has('urn:c:1.0.0')).toBe(true); // c depends on b which depends on d
      expect(consumers.size).toBe(3);
    });

    it('should find transitive consumers', () => {
      const consumers = getConsumers('urn:b:1.0.0', graph);

      expect(consumers.has('urn:c:1.0.0')).toBe(true);
      expect(consumers.size).toBe(1);
    });

    it('should handle nodes with no consumers', () => {
      const consumers = getConsumers('urn:a:1.0.0', graph);

      expect(consumers.size).toBe(0);
    });
  });

  describe('detectCycles', () => {
    it('should detect no cycles in DAG', () => {
      const artifacts = new Map([
        ['urn:a:1.0.0', ['urn:b:1.0.0']],
        ['urn:b:1.0.0', ['urn:c:1.0.0']],
        ['urn:c:1.0.0', []]
      ]);
      const graph = buildDependencyGraph(artifacts);

      const result = detectCycles(graph);

      expect(result.hasCycle).toBe(false);
      expect(result.cycles.length).toBe(0);
    });

    it('should detect simple cycle', () => {
      /** @type {import('../../packages/protocols/src/catalog/graph').DependencyGraph} */
      const graph = {
        dependencies: new Map([
          ['urn:a:1.0.0', ['urn:b:1.0.0']],
          ['urn:b:1.0.0', ['urn:a:1.0.0']]
        ]),
        dependents: new Map()
      };

      const result = detectCycles(graph);

      expect(result.hasCycle).toBe(true);
      expect(result.cycles.length).toBeGreaterThan(0);
    });

    it('should detect complex cycle', () => {
      /** @type {import('../../packages/protocols/src/catalog/graph').DependencyGraph} */
      const graph = {
        dependencies: new Map([
          ['urn:a:1.0.0', ['urn:b:1.0.0']],
          ['urn:b:1.0.0', ['urn:c:1.0.0']],
          ['urn:c:1.0.0', ['urn:a:1.0.0']]
        ]),
        dependents: new Map()
      };

      const result = detectCycles(graph);

      expect(result.hasCycle).toBe(true);
      expect(result.cycles.length).toBeGreaterThan(0);
    });

    it('should handle self-loop', () => {
      /** @type {import('../../packages/protocols/src/catalog/graph').DependencyGraph} */
      const graph = {
        dependencies: new Map([['urn:a:1.0.0', ['urn:a:1.0.0']]]),
        dependents: new Map()
      };

      const result = detectCycles(graph);

      expect(result.hasCycle).toBe(true);
    });
  });

  describe('getBuildOrder', () => {
    /** @type {import('../../packages/protocols/src/catalog/graph').DependencyGraph} */
    let graph;

    beforeEach(() => {
      const artifacts = new Map([
        ['urn:a:1.0.0', ['urn:b:1.0.0', 'urn:c:1.0.0']],
        ['urn:b:1.0.0', ['urn:d:1.0.0']],
        ['urn:c:1.0.0', ['urn:d:1.0.0']],
        ['urn:d:1.0.0', []]
      ]);
      graph = buildDependencyGraph(artifacts);
    });

    it('should return valid build order', () => {
      const order = getBuildOrder('urn:a:1.0.0', graph);

      expect(order.length).toBe(4);
      expect(order[0]).toBe('urn:d:1.0.0'); // Leaf first

      // Verify dependencies come before dependents
      const dIndex = order.indexOf('urn:d:1.0.0');
      const bIndex = order.indexOf('urn:b:1.0.0');
      const cIndex = order.indexOf('urn:c:1.0.0');
      const aIndex = order.indexOf('urn:a:1.0.0');

      expect(dIndex).toBeLessThan(bIndex);
      expect(dIndex).toBeLessThan(cIndex);
      expect(bIndex).toBeLessThan(aIndex);
      expect(cIndex).toBeLessThan(aIndex);
    });

    it('should handle single node', () => {
      const artifacts = new Map([['urn:a:1.0.0', []]]);
      const graph = buildDependencyGraph(artifacts);

      const order = getBuildOrder('urn:a:1.0.0', graph);

      expect(order).toEqual(['urn:a:1.0.0']);
    });

    it('should throw on circular dependency', () => {
      /** @type {import('../../packages/protocols/src/catalog/graph').DependencyGraph} */
      const cyclicGraph = {
        dependencies: new Map([
          ['urn:a:1.0.0', ['urn:b:1.0.0']],
          ['urn:b:1.0.0', ['urn:a:1.0.0']]
        ]),
        dependents: new Map([
          ['urn:a:1.0.0', ['urn:b:1.0.0']],
          ['urn:b:1.0.0', ['urn:a:1.0.0']]
        ])
      };

      expect(() => getBuildOrder('urn:a:1.0.0', cyclicGraph)).toThrow(
        'Circular dependency'
      );
    });
  });

  describe('getFullBuildOrder', () => {
    it('should handle entire graph', () => {
      const artifacts = new Map([
        ['urn:a:1.0.0', ['urn:b:1.0.0']],
        ['urn:b:1.0.0', []],
        ['urn:c:1.0.0', ['urn:d:1.0.0']],
        ['urn:d:1.0.0', []]
      ]);
      const graph = buildDependencyGraph(artifacts);

      const order = getFullBuildOrder(graph);

      expect(order.length).toBe(4);

      // Verify dependencies come before dependents
      const bIndex = order.indexOf('urn:b:1.0.0');
      const aIndex = order.indexOf('urn:a:1.0.0');
      const dIndex = order.indexOf('urn:d:1.0.0');
      const cIndex = order.indexOf('urn:c:1.0.0');

      expect(bIndex).toBeLessThan(aIndex);
      expect(dIndex).toBeLessThan(cIndex);
    });

    it('should handle disconnected components', () => {
      const artifacts = new Map([
        ['urn:a:1.0.0', []],
        ['urn:b:1.0.0', []],
        ['urn:c:1.0.0', []]
      ]);
      const graph = buildDependencyGraph(artifacts);

      const order = getFullBuildOrder(graph);

      expect(order.length).toBe(3);
    });
  });

  describe('findPath', () => {
    /** @type {import('../../packages/protocols/src/catalog/graph').DependencyGraph} */
    let graph;

    beforeEach(() => {
      const artifacts = new Map([
        ['urn:a:1.0.0', ['urn:b:1.0.0']],
        ['urn:b:1.0.0', ['urn:c:1.0.0']],
        ['urn:c:1.0.0', ['urn:d:1.0.0']],
        ['urn:d:1.0.0', []]
      ]);
      graph = buildDependencyGraph(artifacts);
    });

    it('should find direct path', () => {
      const path = findPath('urn:a:1.0.0', 'urn:b:1.0.0', graph);

      expect(path).toEqual(['urn:a:1.0.0', 'urn:b:1.0.0']);
    });

    it('should find multi-hop path', () => {
      const path = findPath('urn:a:1.0.0', 'urn:d:1.0.0', graph);

      expect(path).toEqual([
        'urn:a:1.0.0',
        'urn:b:1.0.0',
        'urn:c:1.0.0',
        'urn:d:1.0.0'
      ]);
    });

    it('should return null when no path exists', () => {
      const path = findPath('urn:d:1.0.0', 'urn:a:1.0.0', graph);

      expect(path).toBeNull();
    });

    it('should handle same source and target', () => {
      const path = findPath('urn:a:1.0.0', 'urn:a:1.0.0', graph);

      expect(path).toEqual(['urn:a:1.0.0']);
    });
  });

  describe('getGraphStats', () => {
    it('should calculate correct statistics', () => {
      const artifacts = new Map([
        ['urn:a:1.0.0', ['urn:b:1.0.0', 'urn:c:1.0.0']],
        ['urn:b:1.0.0', ['urn:d:1.0.0']],
        ['urn:c:1.0.0', []],
        ['urn:d:1.0.0', []]
      ]);
      const graph = buildDependencyGraph(artifacts);

      const stats = getGraphStats(graph);

      expect(stats.nodes).toBe(4);
      expect(stats.edges).toBe(3);
      expect(stats.avgDependencies).toBe(0.75);
      expect(stats.isolatedNodes).toBe(0);
    });

    it('should identify isolated nodes', () => {
      const artifacts = new Map([
        ['urn:a:1.0.0', ['urn:b:1.0.0']],
        ['urn:b:1.0.0', []],
        ['urn:c:1.0.0', []]
      ]);
      const graph = buildDependencyGraph(artifacts);

      const stats = getGraphStats(graph);

      expect(stats.isolatedNodes).toBe(1); // urn:c is isolated
    });

    it('should calculate max depth', () => {
      const artifacts = new Map([
        ['urn:a:1.0.0', ['urn:b:1.0.0']],
        ['urn:b:1.0.0', ['urn:c:1.0.0']],
        ['urn:c:1.0.0', ['urn:d:1.0.0']],
        ['urn:d:1.0.0', []]
      ]);
      const graph = buildDependencyGraph(artifacts);

      const stats = getGraphStats(graph);

      expect(stats.maxDepth).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty graph', () => {
      /** @type {import('../../packages/protocols/src/catalog/graph').DependencyGraph} */
      const graph = {
        dependencies: new Map(),
        dependents: new Map()
      };

      const stats = getGraphStats(graph);

      expect(stats.nodes).toBe(0);
      expect(stats.edges).toBe(0);
      expect(stats.avgDependencies).toBe(0);
    });
  });
});
