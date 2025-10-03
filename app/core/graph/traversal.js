/**
 * Graph Traversal Utilities
 *
 * Provides efficient path finding, reachability analysis,
 * and graph exploration algorithms.
 */

/**
 * Find all paths from source to target (up to max depth)
 * Uses DFS with path tracking
 * @param {Graph} graph - Graphology graph instance
 * @param {string} source - Source node URN
 * @param {string} target - Target node URN
 * @param {number} maxDepth - Maximum path length (default 10)
 * @returns {Array<Array<string>>} Array of paths (each path is array of URNs)
 */
function findAllPaths(graph, source, target, maxDepth = 10) {
  if (!graph.hasNode(source) || !graph.hasNode(target)) {
    return [];
  }

  if (source === target) {
    return [[source]];
  }

  const paths = [];
  const visited = new Set();

  function dfs(current, path) {
    // Check depth limit
    if (path.length > maxDepth) {
      return;
    }

    // Found target
    if (current === target) {
      paths.push([...path]);
      return;
    }

    // Mark as visited for this path
    visited.add(current);

    // Explore neighbors
    const neighbors = graph.outNeighbors(current);
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        path.push(neighbor);
        dfs(neighbor, path);
        path.pop();
      }
    }

    // Unmark for other paths
    visited.delete(current);
  }

  dfs(source, [source]);
  return paths;
}

/**
 * Find shortest path from source to target
 * Uses BFS for unweighted graphs
 * @param {Graph} graph - Graphology graph instance
 * @param {string} source - Source node URN
 * @param {string} target - Target node URN
 * @returns {Array<string>|null} Shortest path or null if no path exists
 */
function findShortestPath(graph, source, target) {
  if (!graph.hasNode(source) || !graph.hasNode(target)) {
    return null;
  }

  if (source === target) {
    return [source];
  }

  const queue = [[source]];
  const visited = new Set([source]);

  while (queue.length > 0) {
    const path = queue.shift();
    const current = path[path.length - 1];

    const neighbors = graph.outNeighbors(current);
    for (const neighbor of neighbors) {
      if (neighbor === target) {
        return [...path, neighbor];
      }

      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }

  return null;
}

/**
 * Get all nodes reachable from a source node
 * @param {Graph} graph - Graphology graph instance
 * @param {string} source - Source node URN
 * @param {number} maxDepth - Maximum traversal depth (default Infinity)
 * @returns {Set<string>} Set of reachable node URNs
 */
function getReachableNodes(graph, source, maxDepth = Infinity) {
  if (!graph.hasNode(source)) {
    return new Set();
  }

  const reachable = new Set([source]);
  const queue = [{ node: source, depth: 0 }];
  const visited = new Set([source]);

  while (queue.length > 0) {
    const { node, depth } = queue.shift();

    if (depth >= maxDepth) {
      continue;
    }

    const neighbors = graph.outNeighbors(node);
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        reachable.add(neighbor);
        queue.push({ node: neighbor, depth: depth + 1 });
      }
    }
  }

  return reachable;
}

/**
 * Get all nodes that can reach a target node
 * (Reverse reachability)
 * @param {Graph} graph - Graphology graph instance
 * @param {string} target - Target node URN
 * @param {number} maxDepth - Maximum traversal depth (default Infinity)
 * @returns {Set<string>} Set of node URNs that can reach target
 */
function getNodesReachingTarget(graph, target, maxDepth = Infinity) {
  if (!graph.hasNode(target)) {
    return new Set();
  }

  const canReach = new Set([target]);
  const queue = [{ node: target, depth: 0 }];
  const visited = new Set([target]);

  while (queue.length > 0) {
    const { node, depth } = queue.shift();

    if (depth >= maxDepth) {
      continue;
    }

    // Use inNeighbors for reverse traversal
    const neighbors = graph.inNeighbors(node);
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        canReach.add(neighbor);
        queue.push({ node: neighbor, depth: depth + 1 });
      }
    }
  }

  return canReach;
}

/**
 * Get subgraph containing only nodes reachable from source
 * @param {Graph} graph - Graphology graph instance
 * @param {string} source - Source node URN
 * @returns {Set<string>} Node URNs in subgraph
 */
function getSubgraphFrom(graph, source) {
  return getReachableNodes(graph, source);
}

/**
 * Find connected components in the graph
 * (For undirected connectivity - treats directed graph as undirected)
 * @param {Graph} graph - Graphology graph instance
 * @returns {Array<Set<string>>} Array of connected components
 */
function findConnectedComponents(graph) {
  const nodes = graph.nodes();
  const visited = new Set();
  const components = [];

  for (const node of nodes) {
    if (!visited.has(node)) {
      const component = new Set();
      const queue = [node];
      visited.add(node);

      while (queue.length > 0) {
        const current = queue.shift();
        component.add(current);

        // Get all neighbors (both in and out for undirected behavior)
        const neighbors = [
          ...graph.outNeighbors(current),
          ...graph.inNeighbors(current)
        ];

        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      components.push(component);
    }
  }

  return components;
}

/**
 * Calculate distance from source to all reachable nodes
 * @param {Graph} graph - Graphology graph instance
 * @param {string} source - Source node URN
 * @returns {Map<string, number>} Map of node URN to distance
 */
function getDistances(graph, source) {
  if (!graph.hasNode(source)) {
    return new Map();
  }

  const distances = new Map([[source, 0]]);
  const queue = [source];

  while (queue.length > 0) {
    const current = queue.shift();
    const currentDist = distances.get(current);

    const neighbors = graph.outNeighbors(current);
    for (const neighbor of neighbors) {
      if (!distances.has(neighbor)) {
        distances.set(neighbor, currentDist + 1);
        queue.push(neighbor);
      }
    }
  }

  return distances;
}

/**
 * Get topological sort of the graph (if DAG)
 * Returns null if graph has cycles
 * @param {Graph} graph - Graphology graph instance
 * @returns {Array<string>|null} Topologically sorted nodes or null
 */
function topologicalSort(graph) {
  const nodes = graph.nodes();
  const inDegree = new Map();
  const result = [];

  // Calculate in-degrees
  for (const node of nodes) {
    inDegree.set(node, graph.inDegree(node));
  }

  // Queue nodes with in-degree 0
  const queue = nodes.filter(node => inDegree.get(node) === 0);

  while (queue.length > 0) {
    const current = queue.shift();
    result.push(current);

    // Reduce in-degree of neighbors
    const neighbors = graph.outNeighbors(current);
    for (const neighbor of neighbors) {
      inDegree.set(neighbor, inDegree.get(neighbor) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If result doesn't include all nodes, graph has cycles
  if (result.length !== nodes.length) {
    return null;
  }

  return result;
}

/**
 * Get all leaf nodes (nodes with no outgoing edges)
 * @param {Graph} graph - Graphology graph instance
 * @returns {Array<string>} Leaf node URNs
 */
function getLeafNodes(graph) {
  return graph.nodes().filter(node => graph.outDegree(node) === 0);
}

/**
 * Get all root nodes (nodes with no incoming edges)
 * @param {Graph} graph - Graphology graph instance
 * @returns {Array<string>} Root node URNs
 */
function getRootNodes(graph) {
  return graph.nodes().filter(node => graph.inDegree(node) === 0);
}

module.exports = {
  findAllPaths,
  findShortestPath,
  getReachableNodes,
  getNodesReachingTarget,
  getSubgraphFrom,
  findConnectedComponents,
  getDistances,
  topologicalSort,
  getLeafNodes,
  getRootNodes
};
