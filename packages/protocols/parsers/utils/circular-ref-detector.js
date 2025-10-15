/**
 * Circular Reference Detector
 * Detects circular $ref dependencies in OpenAPI specs using graph analysis
 *
 * Features:
 * - Graph-based circular detection using Tarjan's algorithm
 * - Dependency graph construction
 * - Path tracing for helpful error messages
 * - Visualization output
 */

import { Graph } from 'graphology';
import { detectCycles } from '../../core/graph/tarjan.js';
import { ParserError, createError } from './error-model.js';

/**
 * Circular reference detector
 */
class CircularRefDetector {
  constructor(options = {}) {
    this.options = {
      allowCircular: options.allowCircular || false,
      maxDepth: options.maxDepth || 50,
      ...options
    };

    this.graph = null;
    this.refMap = new Map(); // Maps ref paths to their targets
    this.cycles = [];
  }

  /**
   * Detect circular references in OpenAPI spec
   * @param {Object} spec - Parsed OpenAPI spec
   * @param {Map<string, Object>} externalRefs - Resolved external refs (optional)
   * @returns {CircularRefResult}
   */
  detectCircular(spec, externalRefs = new Map()) {
    // Build dependency graph
    this.graph = this._buildDependencyGraph(spec, externalRefs);

    // Detect cycles using Tarjan's algorithm
    this.cycles = detectCycles(this.graph);

    // Analyze cycles
    const result = {
      hasCircular: this.cycles.length > 0,
      cycles: this.cycles.map(cycle => this._analyzeCycle(cycle)),
      totalRefs: this.graph.order, // Number of nodes
      totalDependencies: this.graph.size, // Number of edges
      graph: this.graph
    };

    // Throw or warn based on options
    if (result.hasCircular && !this.options.allowCircular) {
      throw createError('REF_002', this._formatCycleError(result.cycles), {
        severity: 'ERROR',
        recoverable: false,
        metadata: {
          cycles: result.cycles,
          count: result.cycles.length
        }
      });
    }

    return result;
  }

  /**
   * Get dependency graph for visualization
   * @returns {DependencyGraph}
   */
  getDependencyGraph() {
    if (!this.graph) {
      throw new Error('Call detectCircular() first to build dependency graph');
    }

    return {
      nodes: this.graph.nodes().map(node => ({
        id: node,
        label: this._nodeLabel(node),
        inCycle: this._isNodeInCycle(node)
      })),
      edges: this.graph.edges().map(edge => {
        const [source, target] = this.graph.extremities(edge);
        return {
          source,
          target,
          inCycle: this._isEdgeInCycle(source, target)
        };
      }),
      stats: {
        totalNodes: this.graph.order,
        totalEdges: this.graph.size,
        cycles: this.cycles.length
      }
    };
  }

  /**
   * Get all reference paths in spec
   * @param {Object} spec - OpenAPI spec
   * @returns {string[]}
   */
  getAllRefs(spec) {
    const refs = [];
    this._extractAllRefs(spec, refs);
    return [...new Set(refs)]; // Deduplicate
  }

  /**
   * Check if a specific ref path is part of a cycle
   * @param {string} refPath - Reference path to check
   * @returns {boolean}
   */
  isRefInCycle(refPath) {
    if (!this.graph || !this.graph.hasNode(refPath)) {
      return false;
    }
    return this._isNodeInCycle(refPath);
  }

  // ==================== Private Methods ====================

  /**
   * Build dependency graph from OpenAPI spec
   * @private
   */
  _buildDependencyGraph(spec, externalRefs) {
    const graph = new Graph({ type: 'directed' });

    // Map to store resolved schemas
    const schemas = new Map();

    // Add component schemas as nodes
    if (spec.components && spec.components.schemas) {
      for (const [name, schema] of Object.entries(spec.components.schemas)) {
        const nodeId = `#/components/schemas/${name}`;
        graph.addNode(nodeId);
        schemas.set(nodeId, schema);
        this.refMap.set(nodeId, schema);
      }
    }

    // Add external schemas
    for (const [uri, resolved] of externalRefs.entries()) {
      if (!graph.hasNode(uri)) {
        graph.addNode(uri);
      }
      schemas.set(uri, resolved.content);
      this.refMap.set(uri, resolved.content);
    }

    // Build edges by analyzing $ref dependencies
    for (const [nodeId, schema] of schemas.entries()) {
      const refs = this._extractRefs(schema);
      for (const ref of refs) {
        // Normalize ref to full path
        const targetId = this._normalizeRef(ref, nodeId);

        // Add target node if it doesn't exist
        if (!graph.hasNode(targetId)) {
          graph.addNode(targetId);
        }

        // Add edge from current schema to referenced schema
        if (!graph.hasEdge(nodeId, targetId)) {
          graph.addEdge(nodeId, targetId);
        }
      }
    }

    return graph;
  }

  /**
   * Extract $ref paths from a schema object
   * @private
   */
  _extractRefs(obj, refs = [], visited = new Set()) {
    if (!obj || typeof obj !== 'object') {
      return refs;
    }

    // Prevent infinite recursion on already-visited objects
    if (visited.has(obj)) {
      return refs;
    }
    visited.add(obj);

    // Check if this object is a $ref
    if (obj.$ref && typeof obj.$ref === 'string') {
      refs.push(obj.$ref);
      return refs;
    }

    // Recursively check all properties
    if (Array.isArray(obj)) {
      for (const item of obj) {
        this._extractRefs(item, refs, visited);
      }
    } else {
      for (const value of Object.values(obj)) {
        this._extractRefs(value, refs, visited);
      }
    }

    return refs;
  }

  /**
   * Extract all $ref paths recursively
   * @private
   */
  _extractAllRefs(obj, refs = [], visited = new Set()) {
    if (!obj || typeof obj !== 'object') {
      return refs;
    }

    if (visited.has(obj)) {
      return refs;
    }
    visited.add(obj);

    if (obj.$ref) {
      refs.push(obj.$ref);
    }

    if (Array.isArray(obj)) {
      obj.forEach(item => this._extractAllRefs(item, refs, visited));
    } else {
      Object.values(obj).forEach(val => this._extractAllRefs(val, refs, visited));
    }

    return refs;
  }

  /**
   * Normalize ref path relative to base
   * @private
   */
  _normalizeRef(ref, baseRef) {
    // If ref starts with #, it's relative to the spec root
    if (ref.startsWith('#')) {
      return ref;
    }

    // If ref is a full URI, return as-is
    if (ref.includes('://') || ref.startsWith('file:')) {
      return ref;
    }

    // Relative ref - resolve relative to base
    // For now, treat as-is (full resolution handled by external resolver)
    return ref;
  }

  /**
   * Analyze a cycle to provide helpful context
   * @private
   */
  _analyzeCycle(cycle) {
    // Build path trace
    const path = [...cycle, cycle[0]]; // Add first node again to close the cycle

    return {
      refs: cycle,
      path: path,
      length: cycle.length,
      description: this._describeCycle(path)
    };
  }

  /**
   * Generate human-readable cycle description
   * @private
   */
  _describeCycle(path) {
    const shortPath = path.map(ref => this._nodeLabel(ref));
    return shortPath.join(' → ');
  }

  /**
   * Get short label for node
   * @private
   */
  _nodeLabel(ref) {
    // Extract last component of path
    const parts = ref.split('/');
    return parts[parts.length - 1] || ref;
  }

  /**
   * Check if node is in any cycle
   * @private
   */
  _isNodeInCycle(node) {
    return this.cycles.some(cycle => cycle.includes(node));
  }

  /**
   * Check if edge is part of any cycle
   * @private
   */
  _isEdgeInCycle(source, target) {
    return this.cycles.some(cycle => {
      const sourceIdx = cycle.indexOf(source);
      const targetIdx = cycle.indexOf(target);

      if (sourceIdx === -1 || targetIdx === -1) {
        return false;
      }

      // Check if target follows source in cycle
      return (sourceIdx + 1) % cycle.length === targetIdx;
    });
  }

  /**
   * Format cycle error message
   * @private
   */
  _formatCycleError(cycles) {
    const count = cycles.length;
    const firstCycle = cycles[0];

    let message = `Detected ${count} circular reference${count > 1 ? 's' : ''}.\n`;
    message += `Example: ${firstCycle.description}`;

    if (count > 1) {
      message += `\n(+${count - 1} more cycle${count > 2 ? 's' : ''})`;
    }

    return message;
  }
}

/**
 * Helper function to quickly check for circular refs
 * @param {Object} spec - OpenAPI spec
 * @param {Object} options - Detection options
 * @returns {boolean}
 */
function hasCircularRefs(spec, options = {}) {
  const detector = new CircularRefDetector(options);
  try {
    const result = detector.detectCircular(spec);
    return result.hasCircular;
  } catch (error) {
    if (error.code === 'REF_002') {
      return true;
    }
    throw error;
  }
}

export {
  CircularRefDetector,
  hasCircularRefs
};
