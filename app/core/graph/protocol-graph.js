/**
 * ProtocolGraph - Core graph structure for protocol relationships
 *
 * Built on Graphology for efficient graph operations.
 * Supports URN-based nodes, typed edges, cycle detection, PII tracing, and impact analysis.
 */

const Graph = require('graphology');
const { parseURN, normalizeURN, isValidURN, versionMatchesRange } = require('./urn-utils');
const { GraphCache } = require('./cache');
const { detectCycles, getCycleForNode } = require('./tarjan');
const { tracePIIFlow, findPIIExposingEndpoints, getPIISummary } = require('./pii-tracer');
const { analyzeImpact, analyzeDetailedImpact, assessBreakingChangeRisk } = require('./impact-analyzer');

/**
 * Node kinds in the protocol graph
 */
const NodeKind = {
  API: 'api',
  API_ENDPOINT: 'api.endpoint',
  DATA: 'data',
  EVENT: 'event',
  SEMANTIC: 'semantic'
};

/**
 * Edge kinds representing relationships
 */
const EdgeKind = {
  DEPENDS_ON: 'depends_on',
  PRODUCES: 'produces',
  CONSUMES: 'consumes',
  READS_FROM: 'reads_from',
  WRITES_TO: 'writes_to',
  EXPOSES: 'exposes',
  DERIVES_FROM: 'derives_from'
};

/**
 * ProtocolGraph class
 */
class ProtocolGraph {
  constructor(options = {}) {
    const { cacheSize = 100 } = options;

    // Use directed graph for protocol relationships
    this.graph = new Graph({ type: 'directed', multi: true });

    // Indices for fast lookups
    this.urnIndex = new Map(); // Normalized URN -> Set of versioned URNs
    this.kindIndex = new Map(); // Kind -> Set of URNs
    this.authorityIndex = new Map(); // Authority -> Set of URNs

    // Cache for expensive operations (10-20% of expected graph size)
    this.cache = new GraphCache(cacheSize);
  }

  /**
   * Add a node to the graph
   * @param {string} urn - Node URN
   * @param {string} kind - Node kind (from NodeKind)
   * @param {Object} manifest - Protocol manifest data
   * @returns {boolean} True if added, false if already exists
   */
  addNode(urn, kind, manifest = {}) {
    if (!isValidURN(urn)) {
      throw new Error(`Invalid URN: ${urn}`);
    }

    if (!Object.values(NodeKind).includes(kind)) {
      throw new Error(`Invalid node kind: ${kind}`);
    }

    // Check if node already exists
    if (this.graph.hasNode(urn)) {
      return false;
    }

    // Add node to graph
    this.graph.addNode(urn, {
      kind,
      manifest,
      urn
    });

    // Update indices
    const normalized = normalizeURN(urn);
    if (!this.urnIndex.has(normalized)) {
      this.urnIndex.set(normalized, new Set());
    }
    this.urnIndex.get(normalized).add(urn);

    if (!this.kindIndex.has(kind)) {
      this.kindIndex.set(kind, new Set());
    }
    this.kindIndex.get(kind).add(urn);

    const parsed = parseURN(urn);
    if (parsed) {
      if (!this.authorityIndex.has(parsed.authority)) {
        this.authorityIndex.set(parsed.authority, new Set());
      }
      this.authorityIndex.get(parsed.authority).add(urn);
    }

    // Invalidate caches
    this._invalidateCache();

    return true;
  }

  /**
   * Remove a node and its edges
   * @param {string} urn - Node URN to remove
   * @returns {boolean} True if removed
   */
  removeNode(urn) {
    if (!this.graph.hasNode(urn)) {
      return false;
    }

    // Get node data for index cleanup
    const nodeData = this.graph.getNodeAttributes(urn);
    const normalized = normalizeURN(urn);

    // Remove from graph (cascades edges)
    this.graph.dropNode(urn);

    // Update indices
    if (this.urnIndex.has(normalized)) {
      this.urnIndex.get(normalized).delete(urn);
      if (this.urnIndex.get(normalized).size === 0) {
        this.urnIndex.delete(normalized);
      }
    }

    if (this.kindIndex.has(nodeData.kind)) {
      this.kindIndex.get(nodeData.kind).delete(urn);
      if (this.kindIndex.get(nodeData.kind).size === 0) {
        this.kindIndex.delete(nodeData.kind);
      }
    }

    const parsed = parseURN(urn);
    if (parsed && this.authorityIndex.has(parsed.authority)) {
      this.authorityIndex.get(parsed.authority).delete(urn);
      if (this.authorityIndex.get(parsed.authority).size === 0) {
        this.authorityIndex.delete(parsed.authority);
      }
    }

    // Invalidate caches
    this._invalidateCache();

    return true;
  }

  /**
   * Add an edge between nodes
   * @param {string} from - Source URN
   * @param {string} kind - Edge kind (from EdgeKind)
   * @param {string} to - Target URN
   * @param {Object} metadata - Additional edge metadata
   * @returns {string} Edge key
   */
  addEdge(from, kind, to, metadata = {}) {
    if (!this.graph.hasNode(from)) {
      throw new Error(`Source node not found: ${from}`);
    }
    if (!this.graph.hasNode(to)) {
      throw new Error(`Target node not found: ${to}`);
    }
    if (!Object.values(EdgeKind).includes(kind)) {
      throw new Error(`Invalid edge kind: ${kind}`);
    }

    // Add edge with attributes
    const edgeKey = this.graph.addEdge(from, to, {
      kind,
      ...metadata
    });

    // Invalidate caches
    this._invalidateCache();

    return edgeKey;
  }

  /**
   * Remove an edge
   * @param {string} edgeKey - Edge key to remove
   * @returns {boolean} True if removed
   */
  removeEdge(edgeKey) {
    if (!this.graph.hasEdge(edgeKey)) {
      return false;
    }

    this.graph.dropEdge(edgeKey);
    this._invalidateCache();
    return true;
  }

  /**
   * Resolve a URN with optional version range
   * Returns all matching nodes
   * @param {string} urn - URN with optional version range
   * @returns {Array<string>} Matching node URNs
   */
  resolveURN(urn) {
    if (!isValidURN(urn)) {
      return [];
    }

    const parsed = parseURN(urn);
    if (!parsed) {
      return [];
    }

    const normalized = normalizeURN(urn);
    const candidates = this.urnIndex.get(normalized);

    if (!candidates || candidates.size === 0) {
      return [];
    }

    // If no version specified, return all versions
    if (!parsed.version) {
      return Array.from(candidates);
    }

    // Filter by version range
    return Array.from(candidates).filter(candidateURN => {
      const candidateParsed = parseURN(candidateURN);
      if (!candidateParsed || !candidateParsed.version) {
        return false;
      }
      return versionMatchesRange(candidateParsed.version, parsed.version);
    });
  }

  /**
   * Get all nodes of a specific kind
   * @param {string} kind - Node kind
   * @returns {Array<string>} Node URNs
   */
  getNodesByKind(kind) {
    const nodes = this.kindIndex.get(kind);
    return nodes ? Array.from(nodes) : [];
  }

  /**
   * Get all nodes from a specific authority
   * @param {string} authority - Authority name
   * @returns {Array<string>} Node URNs
   */
  getNodesByAuthority(authority) {
    const nodes = this.authorityIndex.get(authority);
    return nodes ? Array.from(nodes) : [];
  }

  /**
   * Get node attributes
   * @param {string} urn - Node URN
   * @returns {Object|null} Node attributes
   */
  getNode(urn) {
    if (!this.graph.hasNode(urn)) {
      return null;
    }
    return this.graph.getNodeAttributes(urn);
  }

  /**
   * Get all edges from a node
   * @param {string} urn - Node URN
   * @returns {Array<Object>} Edges with metadata
   */
  getOutEdges(urn) {
    if (!this.graph.hasNode(urn)) {
      return [];
    }

    return this.graph.outEdges(urn).map(edgeKey => {
      const attrs = this.graph.getEdgeAttributes(edgeKey);
      const target = this.graph.target(edgeKey);
      return {
        key: edgeKey,
        to: target,
        ...attrs
      };
    });
  }

  /**
   * Get all edges to a node
   * @param {string} urn - Node URN
   * @returns {Array<Object>} Edges with metadata
   */
  getInEdges(urn) {
    if (!this.graph.hasNode(urn)) {
      return [];
    }

    return this.graph.inEdges(urn).map(edgeKey => {
      const attrs = this.graph.getEdgeAttributes(edgeKey);
      const source = this.graph.source(edgeKey);
      return {
        key: edgeKey,
        from: source,
        ...attrs
      };
    });
  }

  /**
   * Get graph statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      nodes: this.graph.order,
      edges: this.graph.size,
      nodesByKind: Object.fromEntries(
        Array.from(this.kindIndex.entries()).map(([kind, nodes]) => [kind, nodes.size])
      ),
      authorities: this.authorityIndex.size
    };
  }

  /**
   * Check if graph has a node
   * @param {string} urn - Node URN
   * @returns {boolean}
   */
  hasNode(urn) {
    return this.graph.hasNode(urn);
  }

  /**
   * Get all nodes
   * @returns {Array<string>} All node URNs
   */
  getAllNodes() {
    return this.graph.nodes();
  }

  /**
   * Serialize graph to JSON
   * @returns {Object} Serialized graph
   */
  toJSON() {
    return {
      nodes: this.graph.nodes().map(urn => ({
        urn,
        ...this.graph.getNodeAttributes(urn)
      })),
      edges: this.graph.edges().map(edgeKey => ({
        from: this.graph.source(edgeKey),
        to: this.graph.target(edgeKey),
        ...this.graph.getEdgeAttributes(edgeKey)
      }))
    };
  }

  /**
   * Load graph from JSON
   * @param {Object} data - Serialized graph data
   */
  fromJSON(data) {
    // Clear existing graph
    this.graph.clear();
    this.urnIndex.clear();
    this.kindIndex.clear();
    this.authorityIndex.clear();
    this._invalidateCache();

    // Add nodes
    for (const nodeData of data.nodes) {
      const { urn, kind, manifest } = nodeData;
      this.addNode(urn, kind, manifest);
    }

    // Add edges
    for (const edgeData of data.edges) {
      const { from, to, kind, ...metadata } = edgeData;
      this.addEdge(from, kind, to, metadata);
    }
  }

  /**
   * Invalidate all caches
   * @private
   */
  _invalidateCache() {
    this.cache.invalidateAll();
  }

  /**
   * Get the underlying Graphology instance
   * (for advanced operations and algorithm integration)
   * @returns {Graph}
   */
  getGraph() {
    return this.graph;
  }

  // ============================================================================
  // High-Level Analysis Methods
  // ============================================================================

  /**
   * Detect cycles in the graph using Tarjan's algorithm
   * Results are cached for performance
   * @returns {Array<Array<string>>} Array of cycles (each cycle is array of URNs)
   */
  detectCycles() {
    const cached = this.cache.getCycles();
    if (cached) {
      return cached;
    }

    const cycles = detectCycles(this.graph);
    this.cache.setCycles(cycles);
    return cycles;
  }

  /**
   * Check if a node is part of any cycle
   * @param {string} urn - Node URN
   * @returns {boolean}
   */
  isInCycle(urn) {
    const cycle = getCycleForNode(this.graph, urn);
    return cycle !== null;
  }

  /**
   * Get the cycle containing a specific node
   * @param {string} urn - Node URN
   * @returns {Array<string>|null}
   */
  getCycle(urn) {
    return getCycleForNode(this.graph, urn);
  }

  /**
   * Trace PII flow to an endpoint
   * Results are cached for performance
   * @param {string} endpointUrn - Endpoint URN
   * @param {Object} options - Tracing options
   * @returns {Object} PII flow analysis
   */
  tracePIIFlow(endpointUrn, options = {}) {
    const cacheKey = `${endpointUrn}:${JSON.stringify(options)}`;
    const cached = this.cache.getPIIFlow(cacheKey);
    if (cached) {
      return cached;
    }

    const flow = tracePIIFlow(this, endpointUrn, options);
    this.cache.setPIIFlow(cacheKey, flow);
    return flow;
  }

  /**
   * Find all endpoints that expose PII
   * @param {Object} options - Options
   * @returns {Array<Object>}
   */
  findPIIExposingEndpoints(options = {}) {
    return findPIIExposingEndpoints(this, options);
  }

  /**
   * Get PII summary for entire graph
   * @returns {Object}
   */
  getPIISummary() {
    return getPIISummary(this);
  }

  /**
   * Analyze impact of changing a node
   * Results are cached for performance
   * @param {string} urn - Node URN
   * @param {Object} options - Analysis options
   * @returns {Object}
   */
  impactOfChange(urn, options = {}) {
    const cacheKey = `${urn}:${JSON.stringify(options)}`;
    const cached = this.cache.getImpact(cacheKey);
    if (cached) {
      return cached;
    }

    const impact = analyzeImpact(this, urn, options);
    this.cache.setImpact(cacheKey, impact);
    return impact;
  }

  /**
   * Analyze detailed impact with edge information
   * @param {string} urn - Node URN
   * @returns {Object|null}
   */
  detailedImpact(urn) {
    return analyzeDetailedImpact(this, urn);
  }

  /**
   * Assess breaking change risk
   * @param {string} urn - Node URN
   * @returns {Object}
   */
  assessRisk(urn) {
    return assessBreakingChangeRisk(this, urn);
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getCacheStats() {
    return this.cache.getStats();
  }
}

module.exports = {
  ProtocolGraph,
  NodeKind,
  EdgeKind
};
