/**
 * PII Flow Tracer
 *
 * Traces PII (Personally Identifiable Information) through the protocol graph.
 * Identifies data sources, transformations, and endpoints that handle PII.
 */

import { findAllPaths } from './traversal.js';

/**
 * Trace PII flow for an endpoint
 * Returns all paths from PII data sources to the endpoint
 * @param {ProtocolGraph} protocolGraph - Protocol graph instance
 * @param {string} endpointUrn - Endpoint URN to trace
 * @param {Object} options - Tracing options
 * @returns {Object} PII flow analysis
 */
function tracePIIFlow(protocolGraph, endpointUrn, options = {}) {
  const {
    maxDepth = 10,
    minConfidence = 0.0
  } = options;

  if (!protocolGraph.hasNode(endpointUrn)) {
    return {
      endpoint: endpointUrn,
      hasPII: false,
      sources: [],
      paths: [],
      confidence: 0
    };
  }

  // Find all PII data sources
  const piiSources = findPIISources(protocolGraph, minConfidence);

  if (piiSources.length === 0) {
    return {
      endpoint: endpointUrn,
      hasPII: false,
      sources: [],
      paths: [],
      confidence: 0
    };
  }

  // Find paths from each PII source to the endpoint
  const graph = protocolGraph.getGraph();
  const allPaths = [];
  const sourcesReachingEndpoint = [];

  for (const sourceUrn of piiSources) {
    const paths = findAllPaths(graph, sourceUrn, endpointUrn, maxDepth);
    if (paths.length > 0) {
      sourcesReachingEndpoint.push(sourceUrn);
      for (const path of paths) {
        allPaths.push({
          source: sourceUrn,
          path: path,
          confidence: calculatePathConfidence(protocolGraph, path)
        });
      }
    }
  }

  // Calculate overall confidence
  const overallConfidence = allPaths.length > 0
    ? Math.max(...allPaths.map(p => p.confidence))
    : 0;

  return {
    endpoint: endpointUrn,
    hasPII: allPaths.length > 0,
    sources: sourcesReachingEndpoint,
    paths: allPaths.sort((a, b) => b.confidence - a.confidence),
    confidence: overallConfidence
  };
}

/**
 * Find all data nodes that contain PII
 * @param {ProtocolGraph} protocolGraph - Protocol graph instance
 * @param {number} minConfidence - Minimum confidence threshold
 * @returns {Array<string>} URNs of PII data sources
 */
function findPIISources(protocolGraph, minConfidence = 0.0) {
  const dataSources = protocolGraph.getNodesByKind('data');
  const piiSources = [];

  for (const urn of dataSources) {
    const nodeData = protocolGraph.getNode(urn);
    if (!nodeData || !nodeData.manifest) {
      continue;
    }

    const { manifest } = nodeData;

    // Check if manifest has PII fields
    if (manifest.piiFields && manifest.piiFields.length > 0) {
      // Calculate confidence based on PII detection
      const confidence = calculatePIIConfidence(manifest);
      if (confidence >= minConfidence) {
        piiSources.push(urn);
      }
    }
  }

  return piiSources;
}

/**
 * Calculate PII confidence for a data manifest
 * @param {Object} manifest - Data manifest
 * @returns {number} Confidence score (0-1)
 */
function calculatePIIConfidence(manifest) {
  if (!manifest.piiFields || manifest.piiFields.length === 0) {
    return 0;
  }

  // Average confidence across all PII fields
  const confidences = manifest.piiFields.map(field => {
    // If field has explicit confidence, use it
    if (typeof field.confidence === 'number') {
      return field.confidence;
    }
    // Otherwise use pattern-based confidence
    return field.detectedBy === 'pattern' ? 0.9 : 0.7;
  });

  return confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
}

/**
 * Calculate confidence for a path (minimum confidence along path)
 * @param {ProtocolGraph} protocolGraph - Protocol graph instance
 * @param {Array<string>} path - Path of URNs
 * @returns {number} Path confidence (0-1)
 */
function calculatePathConfidence(protocolGraph, path) {
  if (path.length === 0) {
    return 0;
  }

  let minConfidence = 1.0;

  // Check confidence at each node
  for (const urn of path) {
    const nodeData = protocolGraph.getNode(urn);
    if (!nodeData || !nodeData.manifest) {
      continue;
    }

    const manifest = nodeData.manifest;

    // For data nodes, use PII confidence
    if (nodeData.kind === 'data' && manifest.piiFields) {
      const confidence = calculatePIIConfidence(manifest);
      minConfidence = Math.min(minConfidence, confidence);
    }

    // For API endpoints, use pattern confidence if available
    if (nodeData.kind === 'api.endpoint' && manifest.patternConfidence) {
      minConfidence = Math.min(minConfidence, manifest.patternConfidence);
    }
  }

  return minConfidence;
}

/**
 * Get all endpoints that expose PII
 * @param {ProtocolGraph} protocolGraph - Protocol graph instance
 * @param {Object} options - Options
 * @returns {Array<Object>} Array of endpoints with PII exposure
 */
function findPIIExposingEndpoints(protocolGraph, options = {}) {
  const {
    maxDepth = 10,
    minConfidence = 0.0
  } = options;

  const endpoints = protocolGraph.getNodesByKind('api.endpoint');
  const exposingEndpoints = [];

  for (const endpointUrn of endpoints) {
    const flow = tracePIIFlow(protocolGraph, endpointUrn, { maxDepth, minConfidence });
    if (flow.hasPII) {
      exposingEndpoints.push({
        endpoint: endpointUrn,
        sources: flow.sources,
        pathCount: flow.paths.length,
        confidence: flow.confidence
      });
    }
  }

  return exposingEndpoints.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get PII summary for the entire graph
 * @param {ProtocolGraph} protocolGraph - Protocol graph instance
 * @returns {Object} PII summary statistics
 */
function getPIISummary(protocolGraph) {
  const piiSources = findPIISources(protocolGraph);
  const exposingEndpoints = findPIIExposingEndpoints(protocolGraph);

  // Group by PII type if available
  const piiTypes = new Map();
  for (const sourceUrn of piiSources) {
    const nodeData = protocolGraph.getNode(sourceUrn);
    if (nodeData && nodeData.manifest && nodeData.manifest.piiFields) {
      for (const field of nodeData.manifest.piiFields) {
        const type = field.type || 'unknown';
        if (!piiTypes.has(type)) {
          piiTypes.set(type, []);
        }
        piiTypes.get(type).push({
          source: sourceUrn,
          field: field.name
        });
      }
    }
  }

  return {
    totalPIISources: piiSources.length,
    totalExposingEndpoints: exposingEndpoints.length,
    piiTypes: Object.fromEntries(piiTypes),
    sources: piiSources,
    endpoints: exposingEndpoints
  };
}

/**
 * Visualize PII flow as Mermaid diagram
 * @param {ProtocolGraph} protocolGraph - Protocol graph instance
 * @param {string} endpointUrn - Endpoint URN
 * @returns {string} Mermaid diagram
 */
function visualizePIIFlow(protocolGraph, endpointUrn) {
  const flow = tracePIIFlow(protocolGraph, endpointUrn);

  if (!flow.hasPII || flow.paths.length === 0) {
    return '```mermaid\ngraph LR\n  A[No PII Flow Detected]\n```';
  }

  const lines = ['```mermaid', 'graph LR'];
  const nodeIds = new Map();
  let nodeCounter = 0;

  // Helper to get or create node ID
  const getNodeId = (urn) => {
    if (!nodeIds.has(urn)) {
      nodeIds.set(urn, `N${nodeCounter++}`);
    }
    return nodeIds.get(urn);
  };

  // Helper to get node label
  const getNodeLabel = (urn) => {
    const parsed = require('./urn-utils').parseURN(urn);
    return parsed ? `${parsed.authority}/${parsed.id}` : urn;
  };

  // Add nodes and edges from paths
  const addedEdges = new Set();

  for (const { path, confidence } of flow.paths.slice(0, 5)) { // Limit to 5 paths
    for (let i = 0; i < path.length; i++) {
      const current = path[i];
      const currentId = getNodeId(current);
      const currentLabel = getNodeLabel(current);

      // Add node
      if (i === 0) {
        lines.push(`  ${currentId}[${currentLabel}]:::pii`);
      } else if (i === path.length - 1) {
        lines.push(`  ${currentId}[${currentLabel}]:::endpoint`);
      } else {
        lines.push(`  ${currentId}[${currentLabel}]`);
      }

      // Add edge
      if (i < path.length - 1) {
        const next = path[i + 1];
        const nextId = getNodeId(next);
        const edgeKey = `${currentId}-${nextId}`;

        if (!addedEdges.has(edgeKey)) {
          lines.push(`  ${currentId} --> ${nextId}`);
          addedEdges.add(edgeKey);
        }
      }
    }
  }

  // Add styles
  lines.push('  classDef pii fill:#ff6b6b,stroke:#c92a2a,color:#fff');
  lines.push('  classDef endpoint fill:#4dabf7,stroke:#1971c2,color:#fff');
  lines.push('```');

  return lines.join('\n');
}

export {
  tracePIIFlow,
  findPIISources,
  findPIIExposingEndpoints,
  getPIISummary,
  visualizePIIFlow,
  calculatePIIConfidence,
  calculatePathConfidence
};
