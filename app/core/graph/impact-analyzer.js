/**
 * Impact Analyzer
 *
 * Analyzes the impact of changes to protocol nodes.
 * Identifies direct and transitive dependencies affected by changes.
 */

const { getReachableNodes, getNodesReachingTarget } = require('./traversal');

/**
 * Analyze the impact of changing a protocol node
 * @param {ProtocolGraph} protocolGraph - Protocol graph instance
 * @param {string} urn - URN of node being changed
 * @param {Object} options - Analysis options
 * @returns {Object} Impact analysis
 */
function analyzeImpact(protocolGraph, urn, options = {}) {
  const {
    maxDepth = Infinity,
    includeUpstream = true,
    includeDownstream = true
  } = options;

  if (!protocolGraph.hasNode(urn)) {
    return {
      node: urn,
      exists: false,
      directDependents: [],
      transitiveDependents: [],
      directDependencies: [],
      transitiveDependencies: [],
      totalImpact: 0
    };
  }

  const graph = protocolGraph.getGraph();

  // Downstream impact: nodes that depend on this node
  let directDependents = [];
  let transitiveDependents = [];
  if (includeDownstream) {
    // Direct dependents are nodes that have edges FROM this node
    directDependents = graph.outNeighbors(urn);

    // Transitive dependents are all reachable nodes (excluding self and direct)
    const reachable = getReachableNodes(graph, urn, maxDepth);
    reachable.delete(urn); // Remove self
    directDependents.forEach(n => reachable.delete(n)); // Remove direct
    transitiveDependents = Array.from(reachable);
  }

  // Upstream impact: nodes this node depends on
  let directDependencies = [];
  let transitiveDependencies = [];
  if (includeUpstream) {
    // Direct dependencies are nodes that have edges TO this node
    directDependencies = graph.inNeighbors(urn);

    // Transitive dependencies are all nodes that can reach this node
    const canReach = getNodesReachingTarget(graph, urn, maxDepth);
    canReach.delete(urn); // Remove self
    directDependencies.forEach(n => canReach.delete(n)); // Remove direct
    transitiveDependencies = Array.from(canReach);
  }

  const totalImpact =
    directDependents.length +
    transitiveDependents.length +
    directDependencies.length +
    transitiveDependencies.length;

  return {
    node: urn,
    exists: true,
    downstream: {
      direct: directDependents,
      transitive: transitiveDependents,
      total: directDependents.length + transitiveDependents.length
    },
    upstream: {
      direct: directDependencies,
      transitive: transitiveDependencies,
      total: directDependencies.length + transitiveDependencies.length
    },
    totalImpact,
    // Legacy compatibility
    directDependents,
    transitiveDependents,
    directDependencies,
    transitiveDependencies
  };
}

/**
 * Analyze impact with detailed edge information
 * @param {ProtocolGraph} protocolGraph - Protocol graph instance
 * @param {string} urn - URN of node being changed
 * @returns {Object} Detailed impact analysis
 */
function analyzeDetailedImpact(protocolGraph, urn) {
  if (!protocolGraph.hasNode(urn)) {
    return null;
  }

  const basicImpact = analyzeImpact(protocolGraph, urn);
  const graph = protocolGraph.getGraph();

  // Get edge details for direct relationships
  const downstreamEdges = protocolGraph.getOutEdges(urn).map(edge => ({
    target: edge.to,
    kind: edge.kind,
    metadata: edge
  }));

  const upstreamEdges = protocolGraph.getInEdges(urn).map(edge => ({
    source: edge.from,
    kind: edge.kind,
    metadata: edge
  }));

  // Categorize by edge kind
  const downstreamByKind = {};
  for (const edge of downstreamEdges) {
    if (!downstreamByKind[edge.kind]) {
      downstreamByKind[edge.kind] = [];
    }
    downstreamByKind[edge.kind].push(edge.target);
  }

  const upstreamByKind = {};
  for (const edge of upstreamEdges) {
    if (!upstreamByKind[edge.kind]) {
      upstreamByKind[edge.kind] = [];
    }
    upstreamByKind[edge.kind].push(edge.source);
  }

  return {
    ...basicImpact,
    downstreamEdges,
    upstreamEdges,
    downstreamByKind,
    upstreamByKind
  };
}

/**
 * Find nodes with highest impact (most dependents)
 * @param {ProtocolGraph} protocolGraph - Protocol graph instance
 * @param {number} limit - Number of results to return
 * @returns {Array<Object>} Top impact nodes
 */
function findHighImpactNodes(protocolGraph, limit = 10) {
  const allNodes = protocolGraph.getAllNodes();
  const impacts = [];

  for (const urn of allNodes) {
    const impact = analyzeImpact(protocolGraph, urn, { includeUpstream: false });
    impacts.push({
      urn,
      impact: impact.downstream.total,
      direct: impact.downstream.direct.length,
      transitive: impact.downstream.transitive.length
    });
  }

  return impacts
    .sort((a, b) => b.impact - a.impact)
    .slice(0, limit);
}

/**
 * Find nodes with no dependents (safe to remove)
 * @param {ProtocolGraph} protocolGraph - Protocol graph instance
 * @returns {Array<string>} URNs of safe-to-remove nodes
 */
function findSafeToRemoveNodes(protocolGraph) {
  const allNodes = protocolGraph.getAllNodes();
  const graph = protocolGraph.getGraph();

  return allNodes.filter(urn => graph.outDegree(urn) === 0);
}

/**
 * Calculate breaking change risk for a node modification
 * @param {ProtocolGraph} protocolGraph - Protocol graph instance
 * @param {string} urn - URN of node being modified
 * @returns {Object} Risk assessment
 */
function assessBreakingChangeRisk(protocolGraph, urn) {
  const impact = analyzeDetailedImpact(protocolGraph, urn);

  if (!impact) {
    return {
      urn,
      risk: 'unknown',
      score: 0,
      reason: 'Node not found'
    };
  }

  const downstreamTotal = impact.downstream.total;
  const directDependents = impact.downstream.direct.length;

  // Calculate risk score (0-100)
  let score = 0;
  let risk = 'low';
  let reasons = [];

  // Factor 1: Number of direct dependents (0-40 points)
  score += Math.min(40, directDependents * 10);
  if (directDependents > 0) {
    reasons.push(`${directDependents} direct dependent(s)`);
  }

  // Factor 2: Transitive impact (0-30 points)
  const transitiveCount = impact.downstream.transitive.length;
  score += Math.min(30, transitiveCount * 2);
  if (transitiveCount > 0) {
    reasons.push(`${transitiveCount} transitive dependent(s)`);
  }

  // Factor 3: Critical edge types (0-30 points)
  const criticalEdges = ['exposes', 'produces', 'derives_from'];
  const hasCriticalEdges = impact.downstreamEdges.some(e =>
    criticalEdges.includes(e.kind)
  );
  if (hasCriticalEdges) {
    score += 30;
    reasons.push('Has critical edge types (exposes/produces/derives_from)');
  }

  // Determine risk level
  if (score === 0) {
    risk = 'none';
  } else if (score <= 25) {
    risk = 'low';
  } else if (score <= 60) {
    risk = 'medium';
  } else {
    risk = 'high';
  }

  return {
    urn,
    risk,
    score,
    reasons,
    impact: {
      direct: directDependents,
      transitive: transitiveCount,
      total: downstreamTotal
    }
  };
}

/**
 * Get dependency chain from source to target
 * Shows how one node depends on another
 * @param {ProtocolGraph} protocolGraph - Protocol graph instance
 * @param {string} dependent - URN of dependent node
 * @param {string} dependency - URN of dependency node
 * @returns {Array<Array<string>>} Dependency chains
 */
function getDependencyChains(protocolGraph, dependent, dependency) {
  const { findAllPaths } = require('./traversal');
  const graph = protocolGraph.getGraph();

  // Find paths from dependency to dependent (reverse direction)
  return findAllPaths(graph, dependency, dependent, 10);
}

/**
 * Generate impact report for visualization
 * @param {ProtocolGraph} protocolGraph - Protocol graph instance
 * @param {string} urn - URN of node
 * @returns {Object} Impact report
 */
function generateImpactReport(protocolGraph, urn) {
  const impact = analyzeDetailedImpact(protocolGraph, urn);
  const risk = assessBreakingChangeRisk(protocolGraph, urn);
  const nodeData = protocolGraph.getNode(urn);

  if (!impact || !nodeData) {
    return null;
  }

  return {
    node: {
      urn,
      kind: nodeData.kind,
      manifest: nodeData.manifest
    },
    impact: {
      downstream: impact.downstream,
      upstream: impact.upstream,
      total: impact.totalImpact
    },
    risk,
    edges: {
      downstream: impact.downstreamByKind,
      upstream: impact.upstreamByKind
    }
  };
}

module.exports = {
  analyzeImpact,
  analyzeDetailedImpact,
  findHighImpactNodes,
  findSafeToRemoveNodes,
  assessBreakingChangeRisk,
  getDependencyChains,
  generateImpactReport
};
