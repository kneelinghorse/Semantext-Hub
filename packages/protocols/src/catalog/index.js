/**
 * URNCatalogIndex - Fast catalog for protocol manifests
 *
 * Performance targets:
 * - URN lookup: O(1) < 1ms (10k artifacts)
 * - Tag queries: O(1) + O(m) < 10ms (1000 results)
 * - Dependency traversal: O(V + E) < 50ms (1000 nodes)
 *
 * @module catalog/index
 */

import * as fs from 'fs/promises';
import {
  buildDependencyGraph,
  getDependencyTree,
  getConsumers,
  detectCycles,
  getBuildOrder,
  getFullBuildOrder,
  findPath,
  getGraphStats
} from './graph.js';
import {
  buildSecondaryIndexes,
  queryByTag,
  queryByNamespace,
  queryByOwner,
  queryByPII,
  queryByType,
  queryByClassification,
  queryByGovernance,
  queryByTagsOR,
  queryDeprecated,
  queryByURNPattern,
  getCatalogStats
} from './query.js';

/**
 * @typedef {import('./schema').ArtifactManifest} ArtifactManifest
 * @typedef {import('./schema').CatalogIndex} CatalogIndex
 * @typedef {import('./schema').GovernanceCriteria} GovernanceCriteria
 * @typedef {import('./schema').ProtocolType} ProtocolType
 * @typedef {import('./schema').ClassificationLevel} ClassificationLevel
 * @template T
 * @typedef {import('./schema').QueryResult<T>} QueryResult
 * @typedef {import('./graph').DependencyGraph} DependencyGraph
 * @typedef {import('./graph').CycleDetectionResult} CycleDetectionResult
 * @typedef {import('./query').SecondaryIndexes} SecondaryIndexes
 */

/**
 * URNCatalogIndex - Main catalog class
 * Provides O(1) URN lookups and efficient queries
 */
export class URNCatalogIndex {
  constructor() {
    /** @type {Map<string, ArtifactManifest>} */
    this.artifacts = new Map();
    /** @type {SecondaryIndexes} */
    this.indexes = {
      byNamespace: new Map(),
      byTag: new Map(),
      byOwner: new Map(),
      byPII: new Set(),
      byType: new Map(),
      byClassification: new Map()
    };
    /** @type {DependencyGraph} */
    this.dependencyGraph = {
      dependencies: new Map(),
      dependents: new Map()
    };
    // Agent capability indexes
    /** @type {Map<string, Set<string>>} - tool name -> agent URNs */
    this.agentToolIndex = new Map();
    /** @type {Map<string, Set<string>>} - resource URI -> agent URNs */
    this.agentResourceIndex = new Map();
    /** @type {Map<string, Set<string>>} - workflow URN -> agent URNs */
    this.agentWorkflowIndex = new Map();
    /** @type {Map<string, Set<string>>} - API URN -> agent URNs */
    this.agentApiIndex = new Map();
  }

  /**
   * Get artifact by URN
   * Complexity: O(1)
   * @param urn URN to lookup
   * @returns ArtifactManifest or undefined
   */
  get(urn) {
    return this.artifacts.get(urn);
  }

  /**
   * Add artifact to catalog
   * @param artifact Artifact manifest to add
   */
  add(artifact) {
    const urn = artifact.urn;

    // Add to primary index
    this.artifacts.set(urn, artifact);

    // Rebuild indexes (optimized for single addition)
    this.addToSecondaryIndexes(artifact);
    this.addToDependencyGraph(artifact);
  }

  /**
   * Remove artifact from catalog
   * @param urn URN to remove
   * @returns true if removed, false if not found
   */
  remove(urn) {
    const artifact = this.artifacts.get(urn);
    if (!artifact) return false;

    // Remove from primary index
    this.artifacts.delete(urn);

    // Remove from secondary indexes
    this.removeFromSecondaryIndexes(artifact);

    // Remove from dependency graph
    this.removeFromDependencyGraph(urn);

    return true;
  }

  /**
   * Check if URN exists in catalog
   * @param urn URN to check
   * @returns true if exists
   */
  has(urn) {
    return this.artifacts.has(urn);
  }

  /**
   * Get total number of artifacts
   * @returns Count of artifacts
   */
  size() {
    return this.artifacts.size;
  }

  /**
   * Clear all artifacts from catalog
   */
  clear() {
    this.artifacts.clear();
    this.indexes = {
      byNamespace: new Map(),
      byTag: new Map(),
      byOwner: new Map(),
      byPII: new Set(),
      byType: new Map(),
      byClassification: new Map()
    };
    this.dependencyGraph = {
      dependencies: new Map(),
      dependents: new Map()
    };
    this.agentToolIndex.clear();
    this.agentResourceIndex.clear();
    this.agentWorkflowIndex.clear();
    this.agentApiIndex.clear();
  }

  // Query Methods

  /**
   * Find artifacts by tag
   * Complexity: O(1) + O(m)
   * @param tag Tag to search for
   * @returns QueryResult with matching artifacts
   */
  findByTag(tag) {
    return queryByTag(tag, this.indexes, this.artifacts);
  }

  /**
   * Find artifacts by namespace
   * Complexity: O(1) + O(m)
   * @param namespace Namespace to search for
   * @returns QueryResult with matching artifacts
   */
  findByNamespace(namespace) {
    return queryByNamespace(namespace, this.indexes, this.artifacts);
  }

  /**
   * Find artifacts by owner
   * Complexity: O(1) + O(m)
   * @param owner Owner to search for
   * @returns QueryResult with matching artifacts
   */
  findByOwner(owner) {
    return queryByOwner(owner, this.indexes, this.artifacts);
  }

  /**
   * Find artifacts by PII flag
   * Complexity: O(m)
   * @param hasPII Whether to find artifacts with or without PII
   * @returns QueryResult with matching artifacts
   */
  findByPII(hasPII) {
    return queryByPII(hasPII, this.indexes, this.artifacts);
  }

  /**
   * Find artifacts by protocol type
   * Complexity: O(1) + O(m)
   * @param type Protocol type
   * @returns QueryResult with matching artifacts
   */
  findByType(type) {
    return queryByType(type, this.indexes, this.artifacts);
  }

  /**
   * Find artifacts by classification level
   * Complexity: O(1) + O(m)
   * @param classification Classification level
   * @returns QueryResult with matching artifacts
   */
  findByClassification(classification) {
    return queryByClassification(classification, this.indexes, this.artifacts);
  }

  /**
   * Complex governance query
   * Complexity: O(min(A, B, C, ...))
   * @param criteria Governance criteria
   * @returns QueryResult with matching artifacts
   */
  findByGovernance(criteria) {
    return queryByGovernance(criteria, this.indexes, this.artifacts);
  }

  /**
   * Find artifacts by multiple tags (OR logic)
   * @param tags Array of tags
   * @returns QueryResult with matching artifacts
   */
  findByTagsOR(tags) {
    return queryByTagsOR(tags, this.indexes, this.artifacts);
  }

  /**
   * Find deprecated artifacts
   * @returns QueryResult with deprecated artifacts
   */
  findDeprecated() {
    return queryDeprecated(this.indexes, this.artifacts);
  }

  /**
   * Search by partial URN pattern
   * @param urnPattern Partial URN to match
   * @returns QueryResult with matching artifacts
   */
  findByURNPattern(urnPattern) {
    return queryByURNPattern(urnPattern, this.artifacts);
  }

  // Graph Operations

  /**
   * Find all consumers (dependents) of a URN
   * Complexity: O(1) + O(consumers)
   * @param urn URN to find consumers for
   * @returns Array of dependent artifacts
   */
  findConsumers(urn) {
    const consumerUrns = getConsumers(urn, this.dependencyGraph);
    return Array.from(consumerUrns)
      .map(consumerUrn => this.artifacts.get(consumerUrn))
      .filter((a) => a !== undefined);
  }

  /**
   * Get complete dependency tree
   * Complexity: O(V + E)
   * @param urn Root URN
   * @returns Set of all transitive dependencies
   */
  getDependencyTree(urn) {
    return getDependencyTree(urn, this.dependencyGraph);
  }

  /**
   * Get build order for a URN (dependencies first)
   * Complexity: O(V + E)
   * @param rootUrn Starting URN
   * @returns Array of URNs in valid build order
   * @throws Error if circular dependency detected
   */
  getBuildOrder(rootUrn) {
    return getBuildOrder(rootUrn, this.dependencyGraph);
  }

  /**
   * Get full build order for entire catalog
   * @returns Array of URNs in valid build order
   * @throws Error if circular dependency detected
   */
  getFullBuildOrder() {
    return getFullBuildOrder(this.dependencyGraph);
  }

  /**
   * Detect circular dependencies
   * Complexity: O(V + E)
   * @returns CycleDetectionResult with all cycles
   */
  detectCycles() {
    return detectCycles(this.dependencyGraph);
  }

  /**
   * Find shortest path between two URNs
   * @param from Source URN
   * @param to Target URN
   * @returns Array representing path, or null if no path exists
   */
  findPath(from, to) {
    return findPath(from, to, this.dependencyGraph);
  }

  /**
   * Get dependency graph statistics
   * @returns Graph statistics
   */
  getGraphStats() {
    return getGraphStats(this.dependencyGraph);
  }

  /**
   * Get catalog statistics
   * @returns Catalog statistics
   */
  getStats() {
    return getCatalogStats(this.indexes, this.artifacts);
  }

  // Cross-Reference Methods

  /**
   * Find all protocols that reference a given URN
   * Complexity: O(n) where n is total artifacts
   * @param urn URN to find references for
   * @returns QueryResult with referencing artifacts
   */
  findReferences(urn) {
    const start = performance.now();
    const results = [];

    for (const artifact of this.artifacts.values()) {
      if (this.hasReference(artifact, urn)) {
        results.push(artifact);
      }
    }

    const took = performance.now() - start;
    return {
      results,
      count: results.length,
      took
    };
  }

  /**
   * Find all protocols referenced by a given URN
   * Complexity: O(1) + O(dependencies)
   * @param urn URN to find dependencies for
   * @returns QueryResult with referenced artifacts
   */
  findReferenced(urn) {
    const start = performance.now();
    const artifact = this.artifacts.get(urn);
    const results = [];

    if (artifact) {
      // Get direct dependencies
      const dependencies = this.dependencyGraph.dependencies.get(urn) || new Set();
      for (const depUrn of dependencies) {
        const depArtifact = this.artifacts.get(depUrn);
        if (depArtifact) {
          results.push(depArtifact);
        }
      }

      // Also check for URN references in manifest content
      const manifestContent = JSON.stringify(artifact);
      const urnPattern = /urn:(?:proto|protocol):[^\s"']+/g;
      const matches = manifestContent.match(urnPattern) || [];
      
      for (const match of matches) {
        const refArtifact = this.artifacts.get(match);
        if (refArtifact && !results.find(r => r.urn === refArtifact.urn)) {
          results.push(refArtifact);
        }
      }
    }

    const took = performance.now() - start;
    return {
      results,
      count: results.length,
      took
    };
  }

  /**
   * Get cross-reference summary for a protocol
   * @param urn URN to get cross-references for
   * @returns Cross-reference summary
   */
  getCrossReferences(urn) {
    const start = performance.now();
    
    const referencing = this.findReferences(urn);
    const referenced = this.findReferenced(urn);
    const consumers = this.findConsumers(urn);
    
    const took = performance.now() - start;
    
    return {
      urn,
      referencing: {
        count: referencing.count,
        artifacts: referencing.results.map(a => ({
          urn: a.urn,
          name: a.name,
          type: a.type,
          description: a.metadata?.description
        }))
      },
      referenced: {
        count: referenced.count,
        artifacts: referenced.results.map(a => ({
          urn: a.urn,
          name: a.name,
          type: a.type,
          description: a.metadata?.description
        }))
      },
      consumers: {
        count: consumers.length,
        artifacts: consumers.map(a => ({
          urn: a.urn,
          name: a.name,
          type: a.type,
          description: a.metadata?.description
        }))
      },
      took
    };
  }

  /**
   * Check if an artifact references a given URN
   * @param artifact Artifact to check
   * @param targetUrn URN to look for
   * @returns true if artifact references the URN
   */
  hasReference(artifact, targetUrn) {
    // Check dependencies array
    if (artifact.dependencies && artifact.dependencies.includes(targetUrn)) {
      return true;
    }

    // Check dependency graph
    const dependencies = this.dependencyGraph.dependencies.get(artifact.urn) || [];
    if (dependencies.includes(targetUrn)) {
      return true;
    }

    // Check manifest content for URN references
    const manifestContent = JSON.stringify(artifact);
    return manifestContent.includes(targetUrn);
  }

  // Agent Discovery Methods

  /**
   * Index agent capabilities for discovery
   * @param {Object} agentManifest - Agent manifest with capabilities
   * @returns {void}
   */
  indexAgentCapabilities(agentManifest) {
    const urn = agentManifest.agent?.id;
    if (!urn) return;

    const caps = agentManifest.capabilities || {};
    const rels = agentManifest.relationships || {};

    // Index by tool
    for (const tool of (caps.tools || [])) {
      if (tool.name) {
        this.addToMapSet(this.agentToolIndex, tool.name, urn);
      }
    }

    // Index by resource
    for (const res of (caps.resources || [])) {
      if (res.uri) {
        this.addToMapSet(this.agentResourceIndex, res.uri, urn);
      }
    }

    // Index by workflow relationship
    for (const wfUrn of (rels.workflows || [])) {
      this.addToMapSet(this.agentWorkflowIndex, wfUrn, urn);
    }

    // Index by API relationship
    for (const apiUrn of (rels.apis || [])) {
      this.addToMapSet(this.agentApiIndex, apiUrn, urn);
    }
  }

  /**
   * Find agents by tool name
   * Complexity: O(1) + O(m)
   * @param {string} toolName - Tool name to search for
   * @returns {QueryResult<Object>} Query result with agent URNs
   */
  findAgentsByTool(toolName) {
    const start = performance.now();

    const agentUrns = this.agentToolIndex.get(toolName) || new Set();
    const results = Array.from(agentUrns);

    const took = performance.now() - start;

    return {
      results,
      count: results.length,
      took
    };
  }

  /**
   * Find agents by resource URI
   * Complexity: O(1) + O(m)
   * @param {string} resourceUri - Resource URI to search for
   * @returns {QueryResult<Object>} Query result with agent URNs
   */
  findAgentsByResource(resourceUri) {
    const start = performance.now();

    const agentUrns = this.agentResourceIndex.get(resourceUri) || new Set();
    const results = Array.from(agentUrns);

    const took = performance.now() - start;

    return {
      results,
      count: results.length,
      took
    };
  }

  /**
   * Find agents by workflow URN
   * Complexity: O(1) + O(m)
   * @param {string} workflowUrn - Workflow URN to search for
   * @returns {QueryResult<Object>} Query result with agent URNs
   */
  findAgentsByWorkflow(workflowUrn) {
    const start = performance.now();

    const agentUrns = this.agentWorkflowIndex.get(workflowUrn) || new Set();
    const results = Array.from(agentUrns);

    const took = performance.now() - start;

    return {
      results,
      count: results.length,
      took
    };
  }

  /**
   * Find agents for API URN (direct relationship)
   * Complexity: O(1) + O(m)
   * @param {string} apiUrn - API URN to search for
   * @returns {QueryResult<Object>} Query result with agent URNs
   */
  findAgentsByAPI(apiUrn) {
    const start = performance.now();

    const agentUrns = this.agentApiIndex.get(apiUrn) || new Set();
    const results = Array.from(agentUrns);

    const took = performance.now() - start;

    return {
      results,
      count: results.length,
      took
    };
  }

  /**
   * Find agents for API via workflow traversal
   * Finds agents that have workflows that depend on the given API
   * Complexity: O(w * a) where w=workflows and a=agents
   * @param {string} apiUrn - API URN to search for
   * @returns {QueryResult<Object>} Query result with agent URNs
   */
  findAgentsByAPIViaWorkflow(apiUrn) {
    const start = performance.now();

    // Find workflows that depend on this API
    const workflowUrns = this.findConsumers(apiUrn).map(a => a.urn);

    // Find agents that have these workflows
    const agentUrns = new Set();
    for (const wfUrn of workflowUrns) {
      const agents = this.agentWorkflowIndex.get(wfUrn) || new Set();
      for (const agentUrn of agents) {
        agentUrns.add(agentUrn);
      }
    }

    const results = Array.from(agentUrns);
    const took = performance.now() - start;

    return {
      results,
      count: results.length,
      took
    };
  }

  /**
   * Alias: Find agents for API via workflow links
   * Keeps compatibility with alternate interface naming.
   * @param {string} apiUrn
   * @returns {QueryResult<Object>}
   */
  findAgentsForAPI(apiUrn) {
    return this.findAgentsByAPIViaWorkflow(apiUrn);
  }

  // Persistence Methods

  /**
   * Save catalog to JSON file
   * @param path File path to save to
   */
  async save(path) {
    /** @type {CatalogIndex} */
    const catalogIndex = {
      version: '1.0.0',
      format: 'urn-catalog-v1',
      lastModified: new Date().toISOString(),
      artifacts: Object.fromEntries(this.artifacts),
      indexes: {
        byNamespace: Object.fromEntries(
          Array.from(this.indexes.byNamespace.entries()).map(([k, v]) => [
            k,
            Array.from(v)
          ])
        ),
        byTag: Object.fromEntries(
          Array.from(this.indexes.byTag.entries()).map(([k, v]) => [
            k,
            Array.from(v)
          ])
        ),
        byOwner: Object.fromEntries(
          Array.from(this.indexes.byOwner.entries()).map(([k, v]) => [
            k,
            Array.from(v)
          ])
        ),
        byPII: Array.from(this.indexes.byPII)
      },
      dependencyGraph: Object.fromEntries(
        Array.from(this.dependencyGraph.dependencies.keys()).map(urn => [
          urn,
          {
            dependencies: this.dependencyGraph.dependencies.get(urn) || [],
            dependents: this.dependencyGraph.dependents.get(urn) || []
          }
        ])
      )
    };

    const json = JSON.stringify(catalogIndex, null, 2);
    await fs.writeFile(path, json, 'utf-8');
  }

  /**
   * Load catalog from JSON file
   * @param path File path to load from
   */
  async load(path) {
    const json = await fs.readFile(path, 'utf-8');
    /** @type {CatalogIndex} */
    const catalogIndex = JSON.parse(json);

    // Clear existing data
    this.clear();

    // Load artifacts
    for (const [urn, artifact] of Object.entries(catalogIndex.artifacts)) {
      this.add(artifact);
    }

    console.log(`Loaded ${this.artifacts.size} artifacts from ${path}`);
  }

  /**
   * Export catalog to JSON string
   * @returns JSON string representation
   */
  toJSON() {
    /** @type {CatalogIndex} */
    const catalogIndex = {
      version: '1.0.0',
      format: 'urn-catalog-v1',
      lastModified: new Date().toISOString(),
      artifacts: Object.fromEntries(this.artifacts),
      indexes: {
        byNamespace: Object.fromEntries(
          Array.from(this.indexes.byNamespace.entries()).map(([k, v]) => [
            k,
            Array.from(v)
          ])
        ),
        byTag: Object.fromEntries(
          Array.from(this.indexes.byTag.entries()).map(([k, v]) => [
            k,
            Array.from(v)
          ])
        ),
        byOwner: Object.fromEntries(
          Array.from(this.indexes.byOwner.entries()).map(([k, v]) => [
            k,
            Array.from(v)
          ])
        ),
        byPII: Array.from(this.indexes.byPII)
      },
      dependencyGraph: Object.fromEntries(
        Array.from(this.dependencyGraph.dependencies.keys()).map(urn => [
          urn,
          {
            dependencies: this.dependencyGraph.dependencies.get(urn) || [],
            dependents: this.dependencyGraph.dependents.get(urn) || []
          }
        ])
      )
    };

    return JSON.stringify(catalogIndex, null, 2);
  }

  /**
   * Import from JSON string
   * @param json JSON string
   */
  fromJSON(json) {
    /** @type {CatalogIndex} */
    const catalogIndex = JSON.parse(json);

    // Clear existing data
    this.clear();

    // Load artifacts
    for (const [urn, artifact] of Object.entries(catalogIndex.artifacts)) {
      this.add(artifact);
    }
  }

  // Private Helper Methods

  /**
   * @param {ArtifactManifest} artifact
   * @private
   */
  addToSecondaryIndexes(artifact) {
    const urn = artifact.urn;

    // Namespace index
    this.addToMapSet(this.indexes.byNamespace, artifact.namespace, urn);

    // Tag index
    for (const tag of artifact.metadata.tags) {
      this.addToMapSet(this.indexes.byTag, tag, urn);
    }

    // Owner index
    this.addToMapSet(
      this.indexes.byOwner,
      artifact.metadata.governance.owner,
      urn
    );

    // PII index
    if (artifact.metadata.governance.pii) {
      this.indexes.byPII.add(urn);
    }

    // Type index
    this.addToMapSet(this.indexes.byType, artifact.type, urn);

    // Classification index
    this.addToMapSet(
      this.indexes.byClassification,
      artifact.metadata.governance.classification,
      urn
    );
  }

  /**
   * @param {ArtifactManifest} artifact
   * @private
   */
  removeFromSecondaryIndexes(artifact) {
    const urn = artifact.urn;

    // Namespace index
    this.indexes.byNamespace.get(artifact.namespace)?.delete(urn);

    // Tag index
    for (const tag of artifact.metadata.tags) {
      this.indexes.byTag.get(tag)?.delete(urn);
    }

    // Owner index
    this.indexes.byOwner.get(artifact.metadata.governance.owner)?.delete(urn);

    // PII index
    this.indexes.byPII.delete(urn);

    // Type index
    this.indexes.byType.get(artifact.type)?.delete(urn);

    // Classification index
    this.indexes.byClassification
      .get(artifact.metadata.governance.classification)
      ?.delete(urn);
  }

  /**
   * @param {ArtifactManifest} artifact
   * @private
   */
  addToDependencyGraph(artifact) {
    const urn = artifact.urn;
    const deps = artifact.dependencies || [];

    // Initialize node
    this.dependencyGraph.dependencies.set(urn, deps);
    if (!this.dependencyGraph.dependents.has(urn)) {
      this.dependencyGraph.dependents.set(urn, []);
    }

    // Add edges
    for (const dep of deps) {
      if (!this.dependencyGraph.dependents.has(dep)) {
        this.dependencyGraph.dependents.set(dep, []);
      }
      const dependents = this.dependencyGraph.dependents.get(dep);
      if (dependents && !dependents.includes(urn)) {
        dependents.push(urn);
      }
    }
  }

  /**
   * @param {string} urn
   * @private
   */
  removeFromDependencyGraph(urn) {
    // Get dependencies before removing
    const deps = this.dependencyGraph.dependencies.get(urn) || [];

    // Remove from dependents lists
    for (const dep of deps) {
      const dependents = this.dependencyGraph.dependents.get(dep);
      if (dependents) {
        const index = dependents.indexOf(urn);
        if (index > -1) {
          dependents.splice(index, 1);
        }
      }
    }

    // Remove node
    this.dependencyGraph.dependencies.delete(urn);
    this.dependencyGraph.dependents.delete(urn);
  }

  /**
   * @template K, V
   * @param {Map<K, Set<V>>} map
   * @param {K} key
   * @param {V} value
   * @private
   */
  addToMapSet(map, key, value) {
    if (!map.has(key)) {
      map.set(key, new Set());
    }
    const set = map.get(key);
    if (set) set.add(value);
  }
}

// Re-export types for convenience
export * from './schema.js';
export * from './graph.js';
export * from './query.js';

/**
 * Resolve agent by URN
 * Standalone function for external use
 * @param {string} agentUrn - Agent URN to resolve
 * @returns {Promise<Object>} Agent metadata with endpoints and capabilities
 */
export async function resolveAgent(agentUrn) {
  // In a real implementation, this would look up from a global catalog instance
  // For now, return a structured response
  return {
    urn: agentUrn,
    endpoints: {
      a2a: `https://agent-registry.example.com/agents/${agentUrn}`,
      mcp: `mcp://${agentUrn}`
    },
    protocol: 'a2a',
    capabilities: {
      tools: [],
      resources: []
    }
  };
}
