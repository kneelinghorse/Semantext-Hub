/**
 * Dependency graph utilities for URN catalog
 * Provides DFS traversal, cycle detection, and topological sorting
 * @module catalog/graph
 */

/**
 * @typedef {Object} DependencyGraph
 * @property {Map<string, string[]>} dependencies
 * @property {Map<string, string[]>} dependents
 */

/**
 * @typedef {Object} CycleDetectionResult
 * @property {boolean} hasCycle
 * @property {string[][]} cycles
 */

/**
 * Build a dependency graph from artifacts
 * @param {Map<string, string[]>} artifacts - Map of URN to dependency arrays
 * @returns {DependencyGraph} DependencyGraph with bidirectional edges
 */
export function buildDependencyGraph(artifacts) {
  /** @type {DependencyGraph} */
  const graph = {
    dependencies: new Map(),
    dependents: new Map()
  };

  // Initialize all nodes
  for (const [urn] of artifacts) {
    graph.dependencies.set(urn, []);
    graph.dependents.set(urn, []);
  }

  // Build edges
  for (const [urn, deps] of artifacts) {
    graph.dependencies.set(urn, deps);

    for (const dep of deps) {
      if (!graph.dependents.has(dep)) {
        graph.dependents.set(dep, []);
      }
      const list = graph.dependents.get(dep);
      if (list) list.push(urn);
    }
  }

  return graph;
}

/**
 * Get complete dependency tree for a URN using DFS
 * Complexity: O(V + E)
 * @param {string} urn - Root URN
 * @param {DependencyGraph} graph - Dependency graph
 * @returns {Set<string>} Set of all transitive dependencies
 */
export function getDependencyTree(urn, graph) {
  const visited = new Set();

  function dfs(current) {
    if (visited.has(current)) return;
    visited.add(current);

    const deps = graph.dependencies.get(current) || [];
    for (const dep of deps) {
      dfs(dep);
    }
  }

  dfs(urn);
  return visited;
}

/**
 * Get all consumers (dependents) of a URN
 * @param {string} urn - Target URN
 * @param {DependencyGraph} graph - Dependency graph
 * @returns {Set<string>} Set of URNs that depend on the target
 */
export function getConsumers(urn, graph) {
  const visited = new Set();

  function dfs(current) {
    if (visited.has(current)) return;
    visited.add(current);

    const dependents = graph.dependents.get(current) || [];
    for (const dependent of dependents) {
      dfs(dependent);
    }
  }

  dfs(urn);
  visited.delete(urn); // Remove self
  return visited;
}

/**
 * Detect cycles in dependency graph using DFS with recursion stack
 * Complexity: O(V + E)
 * @param {DependencyGraph} graph - Dependency graph
 * @returns {CycleDetectionResult} CycleDetectionResult with all detected cycles
 */
export function detectCycles(graph) {
  const visited = new Set();
  const recursionStack = new Set();
  const cycles = [];
  const pathMap = new Map();

  function dfs(urn, path) {
    if (recursionStack.has(urn)) {
      // Found a cycle - extract it from path
      const cycleStart = path.indexOf(urn);
      const cycle = [...path.slice(cycleStart), urn];
      cycles.push(cycle);
      return;
    }

    if (visited.has(urn)) return;

    visited.add(urn);
    recursionStack.add(urn);
    pathMap.set(urn, [...path, urn]);

    const deps = graph.dependencies.get(urn) || [];
    for (const dep of deps) {
      dfs(dep, [...path, urn]);
    }

    recursionStack.delete(urn);
  }

  // Check all nodes to catch disconnected components
  for (const [urn] of graph.dependencies) {
    if (!visited.has(urn)) {
      dfs(urn, []);
    }
  }

  return {
    hasCycle: cycles.length > 0,
    cycles
  };
}

/**
 * Topological sort using Kahn's algorithm
 * Returns build order: dependencies before dependents
 * Complexity: O(V + E)
 * @param {string} rootUrn - Starting URN (will include all reachable nodes)
 * @param {DependencyGraph} graph - Dependency graph
 * @returns {string[]} Array of URNs in valid build order
 * @throws {Error} if circular dependency detected
 */
export function getBuildOrder(rootUrn, graph) {
  // Get all nodes in dependency tree
  const allNodes = getDependencyTree(rootUrn, graph);

  // Calculate in-degrees for all nodes in the tree
  const inDegree = new Map();
  const queue = [];
  const result = [];

  // Initialize in-degrees
  for (const urn of allNodes) {
    inDegree.set(urn, 0);
  }

  // Calculate in-degrees
  for (const urn of allNodes) {
    const deps = graph.dependencies.get(urn) || [];
    for (const dep of deps) {
      if (allNodes.has(dep)) {
        inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
      }
    }
  }

  // Find all nodes with in-degree 0
  for (const [urn, degree] of inDegree) {
    if (degree === 0) {
      queue.push(urn);
    }
  }

  // Kahn's algorithm
  while (queue.length > 0) {
    const urn = queue.shift();
    if (urn === undefined) break;
    result.push(urn);

    const deps = graph.dependencies.get(urn) || [];
    for (const dep of deps) {
      if (!allNodes.has(dep)) continue;

      const newDegree = (inDegree.get(dep) || 0) - 1;
      inDegree.set(dep, newDegree);

      if (newDegree === 0) {
        queue.push(dep);
      }
    }
  }

  // Check for cycles
  if (result.length !== allNodes.size) {
    throw new Error(
      `Circular dependency detected. Expected ${allNodes.size} nodes, got ${result.length}`
    );
  }

  // Reverse for build order (dependencies first)
  return result.reverse();
}

/**
 * Get topological sort for entire graph (all connected components)
 * @param {DependencyGraph} graph - Dependency graph
 * @returns {string[]} Array of URNs in valid build order
 * @throws {Error} if circular dependency detected
 */
export function getFullBuildOrder(graph) {
  const inDegree = new Map();
  const queue = [];
  const result = [];

  // Initialize in-degrees for all nodes
  for (const [urn] of graph.dependencies) {
    inDegree.set(urn, 0);
  }

  // Calculate in-degrees
  for (const [urn, deps] of graph.dependencies) {
    for (const dep of deps) {
      inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
    }
  }

  // Find all nodes with in-degree 0
  for (const [urn, degree] of inDegree) {
    if (degree === 0) {
      queue.push(urn);
    }
  }

  // Kahn's algorithm
  while (queue.length > 0) {
    const urn = queue.shift();
    if (urn === undefined) break;
    result.push(urn);

    const deps = graph.dependencies.get(urn) || [];
    for (const dep of deps) {
      const newDegree = (inDegree.get(dep) || 0) - 1;
      inDegree.set(dep, newDegree);

      if (newDegree === 0) {
        queue.push(dep);
      }
    }
  }

  // Check for cycles
  if (result.length !== graph.dependencies.size) {
    throw new Error(
      `Circular dependency detected. Expected ${graph.dependencies.size} nodes, got ${result.length}`
    );
  }

  // Reverse for build order (dependencies first)
  return result.reverse();
}

/**
 * Find shortest path between two URNs
 * Uses BFS for unweighted graph
 * @param {string} from - Source URN
 * @param {string} to - Target URN
 * @param {DependencyGraph} graph - Dependency graph
 * @returns {string[] | null} Array representing path, or null if no path exists
 */
export function findPath(from, to, graph) {
  if (from === to) return [from];

  const queue = [from];
  const visited = new Set([from]);
  const parent = new Map();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;

    const deps = graph.dependencies.get(current) || [];
    for (const dep of deps) {
      if (visited.has(dep)) continue;

      visited.add(dep);
      parent.set(dep, current);
      queue.push(dep);

      if (dep === to) {
        // Reconstruct path
        const path = [to];
        let node = to;
        while (parent.has(node)) {
          node = parent.get(node);
          if (node) path.unshift(node);
        }
        return path;
      }
    }
  }

  return null; // No path found
}

/**
 * Calculate graph statistics
 * @param {DependencyGraph} graph - Dependency graph
 * @returns {{nodes:number, edges:number, maxDepth:number, isolatedNodes:number, avgDependencies:number}} Statistics about the graph
 */
export function getGraphStats(graph) {
  const nodes = graph.dependencies.size;
  let edges = 0;
  let isolatedNodes = 0;

  for (const [urn, deps] of graph.dependencies) {
    edges += deps.length;
    if (deps.length === 0 && (graph.dependents.get(urn) || []).length === 0) {
      isolatedNodes++;
    }
  }

  const avgDependencies = nodes > 0 ? edges / nodes : 0;

  // Calculate max depth using BFS from nodes with no dependents
  let maxDepth = 0;
  const visited = new Set();

  function bfs(start) {
    /** @type {Array<[string, number]>} */
    const queue = [[start, 0]];
    const localVisited = new Set([start]);
    let depth = 0;

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const [urn, currentDepth] = item;
      depth = Math.max(depth, currentDepth);

      const deps = graph.dependencies.get(urn) || [];
      for (const dep of deps) {
        if (!localVisited.has(dep)) {
          localVisited.add(dep);
          queue.push([dep, currentDepth + 1]);
        }
      }
    }

    return depth;
  }

  // Find root nodes (no dependents)
  for (const [urn, dependents] of graph.dependents) {
    if (dependents.length === 0 && !visited.has(urn)) {
      visited.add(urn);
      maxDepth = Math.max(maxDepth, bfs(urn));
    }
  }

  return {
    nodes,
    edges,
    maxDepth,
    isolatedNodes,
    avgDependencies
  };
}
