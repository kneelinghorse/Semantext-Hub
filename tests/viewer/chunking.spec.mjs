import fs from 'node:fs/promises';
import path from 'node:path';

import { buildGraphChunks, writeChunkedGraph, evaluateGraphSafety } from '../../src/catalog/graph/chunking.js';

function makeGraph(nodeCount = 1200, edgeCount = 800) {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({ id: `n${i + 1}`, label: `Node ${i + 1}`, type: 'test' }));
  const edges = [];
  for (let i = 0; i < edgeCount; i += 1) {
    const a = (i % nodeCount) + 1;
    const b = ((i * 7) % nodeCount) + 1;
    if (a === b) continue;
    edges.push({ id: `e${i + 1}`, source: `n${a}`, target: `n${b}`, type: 'rel' });
  }
  return { id: 'g', version: '1.0.0', nodes, edges };
}

describe('Graph chunking', () => {
  test('evaluateGraphSafety flags when thresholds exceeded', () => {
    const graph = makeGraph(300, 100);
    const safety = evaluateGraphSafety(graph, { thresholds: { nodes_warn: 200, edges_warn: 50, memory_warn_mb: 9999 } });
    expect(safety.exceeds).toBe(true);
    expect(safety.reasons.nodes).toBe(true);
    expect(safety.reasons.edges).toBe(true);
  });

  test('buildGraphChunks splits nodes into parts', () => {
    const graph = makeGraph(1000, 500);
    const { index, parts } = buildGraphChunks(graph, { chunking: { part_size_nodes: 200, part_pattern: 'graph.part-###.json' } });
    expect(parts.length).toBe(5);
    expect(index.parts.length).toBe(5);
    expect(index.parts[0].node_count).toBe(200);
    expect(index.parts.at(-1).node_count).toBe(200);
  });

  test('writeChunkedGraph writes index and parts', async () => {
    const tmp = path.resolve(process.cwd(), 'tests/_tmp/viewer-chunking');
    await fs.rm(tmp, { recursive: true, force: true });
    await fs.mkdir(tmp, { recursive: true });

    const graph = makeGraph(450, 120);
    const result = await writeChunkedGraph(graph, tmp, { chunking: { part_size_nodes: 200 } });
    const indexRaw = await fs.readFile(result.indexPath, 'utf8');
    const index = JSON.parse(indexRaw);
    expect(index.total_nodes).toBe(450);
    expect(index.parts.length).toBe(3);
    for (const p of index.parts) {
      const pRaw = await fs.readFile(path.join(tmp, p.file), 'utf8');
      const pdata = JSON.parse(pRaw);
      expect(Array.isArray(pdata.nodes)).toBe(true);
      expect(Array.isArray(pdata.edges)).toBe(true);
    }
  });
});

