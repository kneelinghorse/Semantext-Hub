function valueFromPath(target, property) {
  if (!property || typeof property !== 'string') {
    return undefined;
  }

  const segments = property.split('.');
  let current = target;

  for (const segment of segments) {
    if (current && typeof current === 'object' && segment in current) {
      current = current[segment];
    } else {
      return undefined;
    }
  }

  return current;
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'group';
}

function normalizeGroupValue(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return {
      key: 'unassigned',
      label: 'Unassigned',
      missing: true
    };
  }

  if (typeof rawValue === 'string' && rawValue.trim() === '') {
    return {
      key: 'unassigned',
      label: 'Unassigned',
      missing: true
    };
  }

  const label = String(rawValue);
  return {
    key: slugify(label),
    label,
    missing: false
  };
}

function shallowCloneNode(node) {
  if (!node || typeof node !== 'object') {
    return node;
  }
  return {
    ...node,
    metadata: node.metadata ? { ...node.metadata } : node.metadata,
    position: node.position ? { ...node.position } : node.position,
    size: node.size ? { ...node.size } : node.size,
    style: node.style ? { ...node.style } : node.style
  };
}

function shallowCloneEdge(edge) {
  if (!edge || typeof edge !== 'object') {
    return edge;
  }
  return {
    ...edge,
    metadata: edge.metadata ? { ...edge.metadata } : edge.metadata,
    style: edge.style ? { ...edge.style } : edge.style
  };
}

function createLayerId(key, index) {
  return `layer-${index + 2}-${key}`;
}

export function createLayerPlan(graph, property) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const layerMap = new Map();
  let missingCount = 0;

  if (!property) {
    return {
      enabled: false,
      property,
      layers: [],
      assignments: {},
      stats: {
        missingCount: 0,
        totalLayers: 0
      }
    };
  }

  for (const node of nodes) {
    const rawValue = valueFromPath(node, property);
    const { key, label, missing } = normalizeGroupValue(rawValue);

    let layer = layerMap.get(key);
    if (!layer) {
      layer = { key, label, nodeIds: [] };
      layerMap.set(key, layer);
    }

    layer.nodeIds.push(node.id);
    if (missing) {
      missingCount += 1;
      layer.missing = true;
      layer.label = 'Unassigned';
    }
  }

  const layers = Array.from(layerMap.values());

  if (layers.length <= 1) {
    return {
      enabled: false,
      property,
      layers: [],
      assignments: {},
      stats: {
        missingCount,
        totalLayers: layers.length
      }
    };
  }

  const assignments = {};
  const resolvedLayers = layers.map((layer, index) => {
    const id = createLayerId(layer.key, index);
    for (const nodeId of layer.nodeIds) {
      assignments[nodeId] = id;
    }
    return {
      id,
      key: layer.key,
      label: layer.label,
      nodeIds: layer.nodeIds.slice(),
      missing: Boolean(layer.missing)
    };
  });

  return {
    enabled: true,
    property,
    layers: resolvedLayers,
    assignments,
    stats: {
      missingCount,
      totalLayers: resolvedLayers.length
    }
  };
}

export function splitGraphByProperty(graph, property) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];

  if (!property) {
    const clonedGraph = {
      ...graph,
      nodes: nodes.map((node) => shallowCloneNode(node)),
      edges: edges.map((edge) => shallowCloneEdge(edge))
    };

    return {
      enabled: false,
      property,
      groups: [
        {
          key: 'full',
          label: graph?.name ?? 'Full Catalog',
          graph: clonedGraph,
          stats: {
            nodeCount: clonedGraph.nodes.length,
            edgeCount: clonedGraph.edges.length,
            crossGroupEdges: 0
          },
          isFallback: false
        }
      ],
      stats: {
        totalGroups: 1,
        missingAssignments: 0,
        crossGroupEdges: 0
      }
    };
  }

  const groups = new Map();
  const nodeAssignments = new Map();
  let missingAssignments = 0;

  for (const node of nodes) {
    const rawValue = valueFromPath(node, property);
    const { key, label, missing } = normalizeGroupValue(rawValue);
    let group = groups.get(key);

    if (!group) {
      group = {
        key,
        label,
        nodes: [],
        edges: [],
        nodeIds: new Set(),
        crossGroupEdges: 0,
        isFallback: false
      };
      groups.set(key, group);
    }

    if (missing) {
      group.label = 'Unassigned';
      group.isFallback = true;
      missingAssignments += 1;
    }

    group.nodes.push(shallowCloneNode(node));
    group.nodeIds.add(node.id);
    nodeAssignments.set(node.id, group);
  }

  let crossGroupEdges = 0;

  for (const edge of edges) {
    const sourceGroup = nodeAssignments.get(edge.source);
    const targetGroup = nodeAssignments.get(edge.target);

    if (sourceGroup && targetGroup && sourceGroup === targetGroup) {
      sourceGroup.edges.push(shallowCloneEdge(edge));
    } else {
      crossGroupEdges += 1;
      if (sourceGroup) {
        sourceGroup.crossGroupEdges += 1;
      }
      if (targetGroup && targetGroup !== sourceGroup) {
        targetGroup.crossGroupEdges += 1;
      }
    }
  }

  const groupsArray = Array.from(groups.values()).map((group) => {
    const baseName = graph?.name ? `${graph.name} (${group.label})` : group.label;
    const baseId = graph?.id ? `${graph.id}-${group.key}` : `diagram-${group.key}`;
    return {
      key: group.key,
      label: group.label,
      graph: {
        ...graph,
        id: baseId,
        name: baseName,
        nodes: group.nodes,
        edges: group.edges
      },
      stats: {
        nodeCount: group.nodes.length,
        edgeCount: group.edges.length,
        crossGroupEdges: group.crossGroupEdges
      },
      isFallback: group.isFallback
    };
  });

  const enabled = groupsArray.length > 1;

  const sortedGroups = groupsArray.sort((a, b) => a.label.localeCompare(b.label));

  if (!enabled) {
    // No effective split — return original graph to avoid surprising consumers.
    return {
      enabled: false,
      property,
      groups: [
        {
          key: sortedGroups[0]?.key ?? 'full',
          label: sortedGroups[0]?.label ?? graph?.name ?? 'Full Catalog',
          graph: {
            ...graph,
            nodes: nodes.map((node) => shallowCloneNode(node)),
            edges: edges.map((edge) => shallowCloneEdge(edge))
          },
          stats: {
            nodeCount: nodes.length,
            edgeCount: edges.length,
            crossGroupEdges: 0
          },
          isFallback: sortedGroups[0]?.isFallback ?? false
        }
      ],
      stats: {
        totalGroups: 1,
        missingAssignments,
        crossGroupEdges
      }
    };
  }

  return {
    enabled: true,
    property,
    groups: sortedGroups,
    stats: {
      totalGroups: sortedGroups.length,
      missingAssignments,
      crossGroupEdges
    }
  };
}

export default {
  createLayerPlan,
  splitGraphByProperty
};
