/**
 * Graph Partitioning Logic
 * Splits graphs into sequential partitions sized for lazy loading.
 */

const DEFAULT_MAX_NODES_PER_PART = 500;

function normalizeNodeId(node, index) {
  if (!node || typeof node !== 'object') return `node-${index}`;
  if (typeof node.id === 'string' || typeof node.id === 'number') {
    return String(node.id);
  }
  if (typeof node.key === 'string' || typeof node.key === 'number') {
    return String(node.key);
  }
  return `node-${index}`;
}

function normalizeEdge(edge) {
  if (!edge || typeof edge !== 'object') {
    return { source: null, target: null };
  }

  const source = edge.source ?? edge.s ?? edge.from ?? null;
  const target = edge.target ?? edge.t ?? edge.to ?? null;

  return {
    source: source != null ? String(source) : null,
    target: target != null ? String(target) : null
  };
}

/**
 * Partition a graph into contiguous buckets sized <= maxNodesPerPart.
 * Returns partition metadata without mutating original node/edge arrays.
 */
export function partitionGraph(nodes = [], edges = [], options = {}) {
  const maxNodesPerPart = Math.max(
    1,
    Number.isFinite(Number(options?.maxNodesPerPart))
      ? Number(options.maxNodesPerPart)
      : DEFAULT_MAX_NODES_PER_PART
  );

  const totalNodes = Array.isArray(nodes) ? nodes.length : 0;

  if (!totalNodes) {
    return {
      parts: [],
      stats: {
        totalNodes: 0,
        totalEdges: Array.isArray(edges) ? edges.length : 0,
        totalParts: 0,
        maxSize: 0,
        minSize: 0,
        avgSize: 0
      }
    };
  }

  const normalizedNodes = nodes.map((node, index) => ({
    index,
    id: normalizeNodeId(node, index)
  }));

  const normalizedEdges = Array.isArray(edges)
    ? edges
        .map((edge) => normalizeEdge(edge))
        .filter(({ source, target }) => source && target)
    : [];

  const parts = [];

  for (let start = 0; start < totalNodes; start += maxNodesPerPart) {
    const end = Math.min(start + maxNodesPerPart, totalNodes);
    const slice = normalizedNodes.slice(start, end);
    const nodeIdSet = new Set(slice.map((entry) => entry.id));

    let edgeCount = 0;
    if (nodeIdSet.size > 0 && normalizedEdges.length > 0) {
      for (const edge of normalizedEdges) {
        if (nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)) {
          edgeCount += 1;
        }
      }
    }

    parts.push({
      id: `part-${String(parts.length + 1).padStart(3, '0')}`,
      start,
      end,
      size: slice.length,
      edgeCount
    });
  }

  const sizes = parts.map((part) => part.size);

  return {
    parts,
    stats: {
      totalNodes,
      totalEdges: normalizedEdges.length,
      totalParts: parts.length,
      maxSize: sizes.length ? Math.max(...sizes) : 0,
      minSize: sizes.length ? Math.min(...sizes) : 0,
      avgSize: sizes.length ? totalNodes / sizes.length : 0
    }
  };
}

