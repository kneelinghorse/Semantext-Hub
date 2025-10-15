/**
 * Impact Analyzer
 *
 * Analyzes the impact of changes to protocol nodes.
 * Identifies direct and transitive dependencies affected by changes.
 */

import { getReachableNodes, getNodesReachingTarget } from './traversal.js';

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
function calculateStructuralRisk(protocolGraph, urn) {
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

function detectSchemaChanges(originalSchema = {}, updatedSchema = {}, context, changes, path = []) {
  const originalRequired = new Set(originalSchema.required || []);
  const updatedRequired = new Set(updatedSchema.required || []);

  for (const field of originalRequired) {
    if (!updatedRequired.has(field)) {
      if (context === 'api') {
        changes.add('removed_required_field');
      } else if (path.length > 0) {
        changes.add('nested_field_removed');
      } else {
        changes.add('field_removed');
      }
    }
  }

  const originalProps = originalSchema.properties || {};
  const updatedProps = updatedSchema.properties || {};

  for (const [propName, originalProp] of Object.entries(originalProps)) {
    const updatedProp = updatedProps[propName];

    if (!updatedProp) {
      if (path.length > 0) {
        changes.add('nested_field_removed');
      } else if (context === 'api') {
        changes.add('removed_required_field');
      } else {
        changes.add('field_removed');
      }
      continue;
    }

    if (originalProp.type && updatedProp.type && originalProp.type !== updatedProp.type) {
      if (context === 'event') {
        changes.add('payload_structure_changed');
      } else {
        changes.add('field_type_changed');
      }
    }

    if (originalProp.format && updatedProp.format && originalProp.format !== updatedProp.format) {
      changes.add('format_changed');
    }

    if (typeof originalProp.maxLength === 'number' && typeof updatedProp.maxLength === 'number' && updatedProp.maxLength < originalProp.maxLength) {
      changes.add('constraint_tightened');
    }

    if (typeof originalProp.minimum === 'number' && typeof updatedProp.minimum === 'number' && updatedProp.minimum > originalProp.minimum) {
      changes.add('constraint_tightened');
    }

    if (Array.isArray(originalProp.enum) && Array.isArray(updatedProp.enum) && updatedProp.enum.length < originalProp.enum.length) {
      changes.add('constraint_tightened');
    }

    if (originalProp.type === 'object' && updatedProp.type === 'object') {
      detectSchemaChanges(originalProp, updatedProp, context, changes, path.concat(propName));
    } else if (originalProp.type === 'array' && updatedProp.type === 'array') {
      detectSchemaChanges(originalProp.items || {}, updatedProp.items || {}, context, changes, path.concat(propName));
    }
  }
}

function compareDependencies(originalDeps = [], updatedDeps = [], changes) {
  const updatedSet = new Set(updatedDeps);

  for (const dep of originalDeps) {
    if (!updatedSet.has(dep)) {
      const [base] = dep.split('@');
      const hasVersionChange = Array.from(updatedSet).some(updatedDep => updatedDep.startsWith(base + '@'));
      if (hasVersionChange) {
        changes.add('dependency_version_changed');
      } else {
        changes.add('dependency_removed');
      }

    }
  }
}

function compareApiManifests(originalManifest = {}, updatedManifest = {}, changes) {
  const originalPaths = originalManifest.spec?.paths || {};
  const updatedPaths = updatedManifest.spec?.paths || {};

  for (const [pathKey, originalPath] of Object.entries(originalPaths)) {
    const updatedPath = updatedPaths[pathKey];
    if (!updatedPath) {
      changes.add('endpoint_removed');
      continue;
    }

    for (const [methodKey, originalMethod] of Object.entries(originalPath)) {
      const updatedMethod = updatedPath[methodKey];
      if (!updatedMethod) {
        changes.add('endpoint_removed');
        continue;
      }

      const originalResponses = originalMethod.responses || {};
      const updatedResponses = updatedMethod.responses || {};

      for (const statusCode of Object.keys(originalResponses)) {
        if (!(statusCode in updatedResponses)) {
          changes.add('response_code_changed');
        }
      }

      for (const [statusCode, response] of Object.entries(originalResponses)) {
        const originalSchema = response?.content?.['application/json']?.schema;
        const updatedSchema = updatedResponses[statusCode]?.content?.['application/json']?.schema;
        if (originalSchema && updatedSchema) {
          detectSchemaChanges(originalSchema, updatedSchema, 'api', changes);
        }
      }

      const originalRequestSchema = originalMethod.requestBody?.content?.['application/json']?.schema;
      const updatedRequestSchema = updatedMethod.requestBody?.content?.['application/json']?.schema;
      if (originalRequestSchema && updatedRequestSchema) {
        detectSchemaChanges(originalRequestSchema, updatedRequestSchema, 'api', changes);
      }
    }
  }
}

function assessBreakingChangeRisk(protocolGraph, urn, updatedManifest = null) {
  const nodeData = protocolGraph.getNode(urn);
  if (!nodeData) {
    return {
      urn,
      hasBreakingChanges: false,
      breakingChanges: [],
      riskLevel: 'unknown',
      risk: 'unknown',
      requiresMigration: false,
      migrationRequired: false,
      approved: false,
      reason: 'Node not found',
      rejectionReason: 'Node not found'
    };
  }

  const originalManifest = nodeData.manifest || {};
  const changes = new Set();
  let migrationPlanMissing = false;

  if (updatedManifest) {
    const type = originalManifest.type || nodeData.kind || updatedManifest.type;

    if (type === 'api') {
      compareApiManifests(originalManifest, updatedManifest, changes);
      const originalSchema = originalManifest.spec?.components?.schemas;
      const updatedSchema = updatedManifest.spec?.components?.schemas;
      if (originalSchema && updatedSchema) {
        for (const key of Object.keys(originalSchema)) {
          detectSchemaChanges(originalSchema[key], updatedSchema[key] || {}, 'api', changes);
        }
      }
    } else if (type === 'data') {
      detectSchemaChanges(originalManifest.spec?.schema, updatedManifest.spec?.schema, 'data', changes);
    } else if (type === 'event') {
      detectSchemaChanges(originalManifest.spec?.schema, updatedManifest.spec?.schema, 'event', changes);
    }

    compareDependencies(originalManifest.dependencies, updatedManifest.dependencies, changes);

    if (originalManifest.urn && updatedManifest.urn && originalManifest.urn !== updatedManifest.urn) {
      const hasMigrationPlan = updatedManifest.migrationPlan || updatedManifest.metadata?.migration;
      if (!hasMigrationPlan) {
        migrationPlanMissing = true;
      }
    }
  }

  if (migrationPlanMissing) {
    const criticalForMigration = new Set([
      'removed_required_field',
      'field_removed',
      'field_type_changed',
      'endpoint_removed',
      'response_code_changed',
      'nested_field_removed',
      'dependency_removed',
      'dependency_version_changed',
      'payload_structure_changed'
    ]);

    if (Array.from(changes).some(code => criticalForMigration.has(code))) {
      changes.add('migration_plan_missing');
    }
  }

  if (migrationPlanMissing && changes.size === 0) {
    changes.add('migration_plan_missing');
  }

  const breakingChanges = Array.from(changes);
  if (breakingChanges.length === 0) {
    const structural = calculateStructuralRisk(protocolGraph, urn);
    return {
      urn,
      hasBreakingChanges: false,
      breakingChanges: [],
      riskLevel: structural.risk,
      risk: structural.risk,
      requiresMigration: false,
      migrationRequired: false,
      approved: true,
      score: structural.score,
      reasons: structural.reasons,
      rejectionReason: null,
      impact: structural.impact
    };
  }
  const highSeverity = new Set([
    'removed_required_field',
    'field_type_changed',
    'endpoint_removed',
    'response_code_changed',
    'field_removed',
    'nested_field_removed',
    'dependency_removed',
    'dependency_version_changed',
    'constraint_tightened',
    'payload_structure_changed',
    'migration_plan_missing'
  ]);
  const mediumSeverity = new Set(['format_changed']);

  let riskLevel = 'low';
  if (breakingChanges.some(code => highSeverity.has(code))) {
    riskLevel = 'high';
  } else if (breakingChanges.some(code => mediumSeverity.has(code))) {
    riskLevel = 'medium';
  }

  return {
    urn,
    hasBreakingChanges: true,
    breakingChanges,
    riskLevel,
    risk: riskLevel,
    requiresMigration: true,
    migrationRequired: true,
    approved: false,
    score: riskLevel === 'high' ? 80 : 50,
    reasons: breakingChanges,
    rejectionReason: 'migration required'
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

export {
  analyzeImpact,
  analyzeDetailedImpact,
  findHighImpactNodes,
  findSafeToRemoveNodes,
  assessBreakingChangeRisk,
  getDependencyChains,
  generateImpactReport
};
