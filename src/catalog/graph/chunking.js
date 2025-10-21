import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_THRESHOLDS = {
  nodes_warn: 2000,
  edges_warn: 6000,
  memory_warn_mb: 80,
};

const DEFAULT_CHUNKING = {
  part_size_nodes: 500,
  index_file: 'graph.index.json',
  part_pattern: 'graph.part-###.json',
};

export function evaluateGraphSafety(graph, options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
  const nodes = graph?.nodes?.length ?? 0;
  const edges = graph?.edges?.length ?? 0;
  let approxMb = 0;
  try {
    const sizeBytes = Buffer.byteLength(JSON.stringify({
      id: graph?.id,
      version: graph?.version,
      nodes: graph?.nodes?.slice?.(0, 1000) ?? [],
      edges: graph?.edges?.slice?.(0, 1000) ?? [],
    }));
    // Rough extrapolation if very large: assume linear
    const nodeFactor = Math.max(1, (graph?.nodes?.length ?? 1) / Math.max(1, (graph?.nodes?.slice?.(0, 1000)?.length ?? 1)));
    const edgeFactor = Math.max(1, (graph?.edges?.length ?? 1) / Math.max(1, (graph?.edges?.slice?.(0, 1000)?.length ?? 1)));
    const factor = Math.max(nodeFactor, edgeFactor);
    approxMb = (sizeBytes * factor) / (1024 * 1024);
  } catch {
    approxMb = 0;
  }

  const exceedsNodes = nodes > thresholds.nodes_warn;
  const exceedsEdges = edges > thresholds.edges_warn;
  const exceedsMem = approxMb > thresholds.memory_warn_mb;

  return {
    nodes,
    edges,
    approx_memory_mb: Number(approxMb.toFixed(2)),
    thresholds,
    exceeds: exceedsNodes || exceedsEdges || exceedsMem,
    reasons: {
      nodes: exceedsNodes,
      edges: exceedsEdges,
      memory: exceedsMem,
    },
  };
}

export function buildGraphChunks(graph, options = {}) {
  const chunking = { ...DEFAULT_CHUNKING, ...(options.chunking || {}) };
  const partSize = Math.max(1, Number(chunking.part_size_nodes) || DEFAULT_CHUNKING.part_size_nodes);
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];

  const parts = [];
  for (let start = 0; start < nodes.length; start += partSize) {
    const end = Math.min(nodes.length, start + partSize);
    const nodeSlice = nodes.slice(start, end);
    const nodeIds = new Set(nodeSlice.map((n) => n.id));
    const edgeSlice = edges.filter((e) => nodeIds.has(e.source) || nodeIds.has(e.target));

    parts.push({ start, end, nodes: nodeSlice, edges: edgeSlice });
  }

  const index = {
    id: graph?.id ?? 'catalog-graph',
    version: graph?.version ?? '1.0.0',
    created_at: new Date().toISOString(),
    total_nodes: nodes.length,
    total_edges: edges.length,
    part_size_nodes: partSize,
    parts: parts.map((p, i) => ({
      file: chunking.part_pattern.replace('###', String(i + 1).padStart(3, '0')),
      index: i + 1,
      node_start: p.start,
      node_end: p.end,
      node_count: p.nodes.length,
      edge_count: p.edges.length,
    })),
    strategy: 'nodes_per_part',
  };

  return { index, parts };
}

export async function writeChunkedGraph(graph, outputDir, options = {}) {
  const chunking = { ...DEFAULT_CHUNKING, ...(options.chunking || {}) };
  const { index, parts } = buildGraphChunks(graph, { chunking });

  await fs.mkdir(outputDir, { recursive: true });
  const indexPath = path.join(outputDir, chunking.index_file);
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8');

  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i];
    const fileName = index.parts[i].file;
    const filePath = path.join(outputDir, fileName);
    const payload = {
      id: `${index.id}#part-${i + 1}`,
      version: index.version,
      created_at: index.created_at,
      nodes: p.nodes,
      edges: p.edges,
      summary: {
        node_count: p.nodes.length,
        edge_count: p.edges.length,
      },
    };
    await fs.writeFile(filePath, JSON.stringify(payload), 'utf8');
  }

  return { indexPath, parts: index.parts.map((p) => path.join(outputDir, p.file)) };
}

export default {
  evaluateGraphSafety,
  buildGraphChunks,
  writeChunkedGraph,
};

