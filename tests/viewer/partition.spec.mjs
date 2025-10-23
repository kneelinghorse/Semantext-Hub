/**
 * Tests for graph partitioning logic
 */

import { partitionGraph } from '../../packages/runtime/viewer/graph/partition.mjs';

describe('partitionGraph', () => {
  test('partitions 10k nodes into 500 node parts', () => {
    const nodes = Array.from({ length: 10000 }, (_, i) => ({ id: `n${i}` }));
    const edges = Array.from({ length: 25000 }, (_, i) => ({
      s: `n${i % 10000}`,
      t: `n${(i * 7) % 10000}`
    }));

    const result = partitionGraph(nodes, edges, { maxNodesPerPart: 500 });

    expect(result.parts.length).toBe(Math.ceil(10000 / 500));
    expect(result.parts.every((part) => part.size <= 500)).toBe(true);
    expect(result.stats.totalNodes).toBe(10000);
    expect(result.stats.maxSize).toBe(500);
    expect(result.stats.minSize).toBe(500);
    expect(result.parts[0]).toMatchObject({ start: 0, end: 500, size: 500 });
  });

  test('computes edge counts per partition', () => {
    const nodes = [
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
      { id: 'd' }
    ];
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'd' },
      { source: 'a', target: 'd' }
    ];

    const result = partitionGraph(nodes, edges, { maxNodesPerPart: 2 });

    expect(result.parts.length).toBe(2);
    expect(result.parts[0].edgeCount).toBe(1);
    expect(result.parts[1].edgeCount).toBe(1);
    expect(result.stats.totalEdges).toBe(edges.length);
  });

  test('handle empty graph', () => {
    const result = partitionGraph([], []);
    expect(result.parts).toEqual([]);
    expect(result.stats.totalNodes).toBe(0);
    expect(result.stats.totalParts).toBe(0);
  });

  test('handle single small graph', () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({ id: `n${i}` }));
    const edges = Array.from({ length: 5 }, (_, i) => ({ s: `n${i}`, t: `n${i + 1}` }));

    const result = partitionGraph(nodes, edges, { maxNodesPerPart: 500 });

    expect(result.parts.length).toBe(1);
    expect(result.parts[0].size).toBe(10);
    expect(result.parts[0].edgeCount).toBe(5);
  });
});
