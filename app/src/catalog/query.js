/**
 * Query helper functions for URN catalog
 * Provides optimized query operations and filters
 * @module catalog/query
 */

/**
 * @typedef {import('./schema').ArtifactManifest} ArtifactManifest
 * @typedef {import('./schema').GovernanceCriteria} GovernanceCriteria
 * @typedef {import('./schema').ProtocolType} ProtocolType
 * @typedef {import('./schema').ClassificationLevel} ClassificationLevel
 * @template T
 * @typedef {import('./schema').QueryResult<T>} QueryResult
 */

/**
 * Secondary indexes for O(1) + O(m) queries
 * @typedef {Object} SecondaryIndexes
 * @property {Map<string, Set<string>>} byNamespace
 * @property {Map<string, Set<string>>} byTag
 * @property {Map<string, Set<string>>} byOwner
 * @property {Set<string>} byPII
 * @property {Map<ProtocolType, Set<string>>} byType
 * @property {Map<ClassificationLevel, Set<string>>} byClassification
 */

/**
 * Build secondary indexes from artifacts
 * @param {Map<string, ArtifactManifest>} artifacts - Map of URN to ArtifactManifest
 * @returns {SecondaryIndexes} SecondaryIndexes structure
 */
export function buildSecondaryIndexes(artifacts) {
  /** @type {SecondaryIndexes} */
  const indexes = {
    byNamespace: new Map(),
    byTag: new Map(),
    byOwner: new Map(),
    byPII: new Set(),
    byType: new Map(),
    byClassification: new Map()
  };

  for (const [urn, artifact] of artifacts) {
    // Namespace index
    addToMapSet(indexes.byNamespace, artifact.namespace, urn);

    // Tag index
    for (const tag of artifact.metadata.tags) {
      addToMapSet(indexes.byTag, tag, urn);
    }

    // Owner index
    addToMapSet(indexes.byOwner, artifact.metadata.governance.owner, urn);

    // PII index
    if (artifact.metadata.governance.pii) {
      indexes.byPII.add(urn);
    }

    // Type index
    addToMapSet(indexes.byType, artifact.type, urn);

    // Classification index
    addToMapSet(
      indexes.byClassification,
      artifact.metadata.governance.classification,
      urn
    );
  }

  return indexes;
}

/**
 * Helper to add value to Map<K, Set<V>>
 * @template K, V
 * @param {Map<K, Set<V>>} map
 * @param {K} key
 * @param {V} value
 */
function addToMapSet(map, key, value) {
  if (!map.has(key)) {
    map.set(key, new Set());
  }
  const set = map.get(key);
  if (set) set.add(value);
}

/**
 * Query by tag with timing
 * Complexity: O(1) + O(m)
 * @param tag Tag to search for
 * @param indexes Secondary indexes
 * @param artifacts Artifact map
 * @returns QueryResult with matching artifacts
 */
export function queryByTag(tag, indexes, artifacts) {
  const start = performance.now();

  const urns = indexes.byTag.get(tag) || new Set();
  const results = Array.from(urns)
    .map(urn => artifacts.get(urn))
    .filter((a) => a !== undefined);

  const took = performance.now() - start;

  return {
    results,
    count: results.length,
    took
  };
}

/**
 * Query by namespace
 * Complexity: O(1) + O(m)
 * @param namespace Namespace to search for
 * @param indexes Secondary indexes
 * @param artifacts Artifact map
 * @returns QueryResult with matching artifacts
 */
export function queryByNamespace(namespace, indexes, artifacts) {
  const start = performance.now();

  const urns = indexes.byNamespace.get(namespace) || new Set();
  const results = Array.from(urns)
    .map(urn => artifacts.get(urn))
    .filter((a) => a !== undefined);

  const took = performance.now() - start;

  return {
    results,
    count: results.length,
    took
  };
}

/**
 * Query by owner
 * Complexity: O(1) + O(m)
 * @param owner Owner to search for
 * @param indexes Secondary indexes
 * @param artifacts Artifact map
 * @returns QueryResult with matching artifacts
 */
export function queryByOwner(owner, indexes, artifacts) {
  const start = performance.now();

  const urns = indexes.byOwner.get(owner) || new Set();
  const results = Array.from(urns)
    .map(urn => artifacts.get(urn))
    .filter((a) => a !== undefined);

  const took = performance.now() - start;

  return {
    results,
    count: results.length,
    took
  };
}

/**
 * Query by PII flag
 * Complexity: O(m)
 * @param hasPII Whether to find artifacts with or without PII
 * @param indexes Secondary indexes
 * @param artifacts Artifact map
 * @returns QueryResult with matching artifacts
 */
export function queryByPII(hasPII, indexes, artifacts) {
  const start = performance.now();

  let urns;
  if (hasPII) {
    urns = indexes.byPII;
  } else {
    // All artifacts without PII
    urns = new Set(
      Array.from(artifacts.keys()).filter(urn => !indexes.byPII.has(urn))
    );
  }

  const results = Array.from(urns)
    .map(urn => artifacts.get(urn))
    .filter((a) => a !== undefined);

  const took = performance.now() - start;

  return {
    results,
    count: results.length,
    took
  };
}

/**
 * Query by protocol type
 * Complexity: O(1) + O(m)
 * @param type Protocol type
 * @param indexes Secondary indexes
 * @param artifacts Artifact map
 * @returns QueryResult with matching artifacts
 */
export function queryByType(type, indexes, artifacts) {
  const start = performance.now();

  const urns = indexes.byType.get(type) || new Set();
  const results = Array.from(urns)
    .map(urn => artifacts.get(urn))
    .filter((a) => a !== undefined);

  const took = performance.now() - start;

  return {
    results,
    count: results.length,
    took
  };
}

/**
 * Query by classification level
 * Complexity: O(1) + O(m)
 * @param classification Classification level
 * @param indexes Secondary indexes
 * @param artifacts Artifact map
 * @returns QueryResult with matching artifacts
 */
export function queryByClassification(classification, indexes, artifacts) {
  const start = performance.now();

  const urns = indexes.byClassification.get(classification) || new Set();
  const results = Array.from(urns)
    .map(urn => artifacts.get(urn))
    .filter((a) => a !== undefined);

  const took = performance.now() - start;

  return {
    results,
    count: results.length,
    took
  };
}

/**
 * Complex governance query with multiple filters
 * Uses set intersection for optimal performance
 * Complexity: O(min(A, B, C, ...)) where A, B, C are result set sizes
 * @param criteria Governance criteria
 * @param indexes Secondary indexes
 * @param artifacts Artifact map
 * @returns QueryResult with matching artifacts
 */
export function queryByGovernance(criteria, indexes, artifacts) {
  const start = performance.now();

  // Start with all artifacts
  let resultSet = new Set(artifacts.keys());

  // Apply namespace filter
  if (criteria.namespace) {
    const namespaceUrns = indexes.byNamespace.get(criteria.namespace) || new Set();
    resultSet = setIntersection(resultSet, namespaceUrns);
  }

  // Apply owner filter
  if (criteria.owner) {
    const ownerUrns = indexes.byOwner.get(criteria.owner) || new Set();
    resultSet = setIntersection(resultSet, ownerUrns);
  }

  // Apply PII filter
  if (criteria.pii !== undefined) {
    if (criteria.pii) {
      resultSet = setIntersection(resultSet, indexes.byPII);
    } else {
      // Exclude PII artifacts
      resultSet = setDifference(resultSet, indexes.byPII);
    }
  }

  // Apply classification filter
  if (criteria.classification) {
    const classificationUrns =
      indexes.byClassification.get(criteria.classification) || new Set();
    resultSet = setIntersection(resultSet, classificationUrns);
  }

  // Apply tag filters (AND logic - must have all tags)
  if (criteria.tags && criteria.tags.length > 0) {
    for (const tag of criteria.tags) {
      const tagUrns = indexes.byTag.get(tag) || new Set();
      resultSet = setIntersection(resultSet, tagUrns);
    }
  }

  // Apply compliance filter (artifact must have all compliance tags)
  if (criteria.compliance && criteria.compliance.length > 0) {
    resultSet = new Set(
      Array.from(resultSet).filter(urn => {
        const artifact = artifacts.get(urn);
        if (!artifact) return false;

        const artifactCompliance = artifact.metadata.governance.compliance || [];
        return (criteria.compliance || []).every(c => artifactCompliance.includes(c));
      })
    );
  }

  const results = Array.from(resultSet)
    .map(urn => artifacts.get(urn))
    .filter((a) => a !== undefined);

  const took = performance.now() - start;

  return {
    results,
    count: results.length,
    took
  };
}

/**
 * Set intersection helper
 * @template T
 * @param {Set<T>} setA
 * @param {Set<T>} setB
 * @returns {Set<T>}
 */
function setIntersection(setA, setB) {
  const result = new Set();
  const smaller = setA.size < setB.size ? setA : setB;
  const larger = setA.size < setB.size ? setB : setA;

  for (const item of smaller) {
    if (larger.has(item)) {
      result.add(item);
    }
  }

  return result;
}

/**
 * Set difference helper (A - B)
 * @template T
 * @param {Set<T>} setA
 * @param {Set<T>} setB
 * @returns {Set<T>}
 */
function setDifference(setA, setB) {
  const result = new Set();

  for (const item of setA) {
    if (!setB.has(item)) {
      result.add(item);
    }
  }

  return result;
}

/**
 * Find artifacts matching multiple tags (OR logic)
 * @param tags Array of tags
 * @param indexes Secondary indexes
 * @param artifacts Artifact map
 * @returns QueryResult with matching artifacts
 */
export function queryByTagsOR(tags, indexes, artifacts) {
  const start = performance.now();

  const resultSet = new Set();

  for (const tag of tags) {
    const tagUrns = indexes.byTag.get(tag) || new Set();
    for (const urn of tagUrns) {
      resultSet.add(urn);
    }
  }

  const results = Array.from(resultSet)
    .map(urn => artifacts.get(urn))
    .filter((a) => a !== undefined);

  const took = performance.now() - start;

  return {
    results,
    count: results.length,
    took
  };
}

/**
 * Find deprecated artifacts
 * @param indexes Secondary indexes
 * @param artifacts Artifact map
 * @returns QueryResult with deprecated artifacts
 */
export function queryDeprecated(indexes, artifacts) {
  const start = performance.now();

  const results = Array.from(artifacts.values()).filter(
    a => a.metadata.deprecated === true
  );

  const took = performance.now() - start;

  return {
    results,
    count: results.length,
    took
  };
}

/**
 * Search artifacts by partial URN match
 * Useful for finding all versions of a protocol
 * @param urnPattern Partial URN to match
 * @param artifacts Artifact map
 * @returns QueryResult with matching artifacts
 */
export function queryByURNPattern(urnPattern, artifacts) {
  const start = performance.now();

  const results = Array.from(artifacts.values()).filter(a =>
    a.urn.includes(urnPattern)
  );

  const took = performance.now() - start;

  return {
    results,
    count: results.length,
    took
  };
}

/**
 * Get catalog statistics
 * @param indexes Secondary indexes
 * @param artifacts Artifact map
 * @returns Statistics about the catalog
 */
export function getCatalogStats(indexes, artifacts) {
  /** @type {Record<ProtocolType, number>} */
  const byType = {
    'event-protocol': 0,
    'data-protocol': 0,
    'api-protocol': 0,
    'ui-protocol': 0
  };

  /** @type {Record<ClassificationLevel, number>} */
  const byClassification = {
    'public': 0,
    'internal': 0,
    'confidential': 0,
    'restricted': 0
  };

  for (const [type, urns] of indexes.byType) {
    byType[type] = urns.size;
  }

  for (const [classification, urns] of indexes.byClassification) {
    byClassification[classification] = urns.size;
  }

  const deprecatedArtifacts = Array.from(artifacts.values()).filter(
    a => a.metadata.deprecated === true
  ).length;

  return {
    totalArtifacts: artifacts.size,
    byType,
    byClassification,
    piiArtifacts: indexes.byPII.size,
    deprecatedArtifacts,
    totalTags: indexes.byTag.size,
    totalOwners: indexes.byOwner.size,
    totalNamespaces: indexes.byNamespace.size
  };
}
