/**
 * Catalog Index Adapter for Registration Pipeline
 *
 * Provides a registration-focused interface to the URNCatalogIndex (B5.1).
 * Optimized for:
 * - URN conflict detection (<5ms)
 * - Manifest validation before registration
 * - Query operations for registration workflow
 *
 * @module core/registration/adapters/catalog-index
 */

import { URNCatalogIndex } from '../../../src/catalog/index.js';

/**
 * Catalog Index Adapter
 *
 * Wraps URNCatalogIndex with registration-specific operations
 */
class CatalogIndexAdapter {
  /**
   * Create a new Catalog Index Adapter
   *
   * @param {URNCatalogIndex} catalogIndex - Catalog index instance
   */
  constructor(catalogIndex) {
    if (!catalogIndex) {
      throw new Error('catalogIndex is required');
    }

    this.catalogIndex = catalogIndex;
  }

  /**
   * Check if URN already exists (conflict detection)
   *
   * Performance target: <5ms
   *
   * @param {string} urn - URN to check
   * @returns {Object} Conflict check result
   */
  checkConflict(urn) {
    const startTime = performance.now();

    if (!urn) {
      return {
        valid: false,
        error: 'URN is required',
        checkTime: performance.now() - startTime
      };
    }

    const exists = this.catalogIndex.has(urn);
    const checkTime = performance.now() - startTime;

    if (exists) {
      const existing = this.catalogIndex.get(urn);

      return {
        conflict: true,
        existingUrn: urn,
        existingManifest: existing,
        checkTime,
        message: `URN ${urn} already registered`
      };
    }

    return {
      conflict: false,
      urn,
      checkTime
    };
  }

  /**
   * Validate manifest structure for registration
   *
   * @param {Object} manifest - Manifest to validate
   * @returns {Object} Validation result
   */
  validateManifest(manifest) {
    const errors = [];

    if (!manifest) {
      errors.push('Manifest is required');
    } else {
      if (!manifest.urn) {
        errors.push('Manifest must have a URN');
      }

      if (!manifest.type) {
        errors.push('Manifest must have a type');
      }

      if (!manifest.namespace) {
        errors.push('Manifest must have a namespace');
      }

      if (!manifest.metadata) {
        errors.push('Manifest must have metadata');
      } else {
        if (!manifest.metadata.governance) {
          errors.push('Manifest must have governance metadata');
        }
        if (!manifest.metadata.tags || !Array.isArray(manifest.metadata.tags)) {
          errors.push('Manifest must have tags array');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if manifest can be registered (combines conflict check and validation)
   *
   * @param {Object} manifest - Manifest to check
   * @returns {Object} Registration eligibility result
   */
  canRegister(manifest) {
    const startTime = performance.now();

    // Validate structure
    const validation = this.validateManifest(manifest);
    if (!validation.valid) {
      return {
        allowed: false,
        reason: 'Manifest validation failed',
        errors: validation.errors,
        checkTime: performance.now() - startTime
      };
    }

    // Check for conflicts
    const conflictCheck = this.checkConflict(manifest.urn);
    if (conflictCheck.conflict) {
      return {
        allowed: false,
        reason: 'URN conflict detected',
        conflict: conflictCheck,
        checkTime: performance.now() - startTime
      };
    }

    return {
      allowed: true,
      urn: manifest.urn,
      checkTime: performance.now() - startTime
    };
  }

  /**
   * Register manifest in catalog
   *
   * @param {Object} manifest - Manifest to register
   * @returns {Object} Registration result
   */
  register(manifest) {
    const startTime = performance.now();

    // Pre-registration checks
    const eligibility = this.canRegister(manifest);
    if (!eligibility.allowed) {
      return {
        success: false,
        reason: eligibility.reason,
        errors: eligibility.errors,
        conflict: eligibility.conflict
      };
    }

    // Add to catalog
    this.catalogIndex.add(manifest);

    return {
      success: true,
      urn: manifest.urn,
      registeredAt: new Date().toISOString(),
      registrationTime: performance.now() - startTime
    };
  }

  /**
   * Unregister manifest from catalog
   *
   * @param {string} urn - URN to unregister
   * @returns {Object} Unregistration result
   */
  unregister(urn) {
    const startTime = performance.now();

    const removed = this.catalogIndex.remove(urn);

    return {
      success: removed,
      urn,
      unregisteredAt: new Date().toISOString(),
      unregistrationTime: performance.now() - startTime
    };
  }

  /**
   * Get manifest by URN
   *
   * @param {string} urn - URN to lookup
   * @returns {Object|undefined} Manifest or undefined
   */
  get(urn) {
    return this.catalogIndex.get(urn);
  }

  /**
   * Check if URN exists
   *
   * @param {string} urn - URN to check
   * @returns {boolean} True if exists
   */
  has(urn) {
    return this.catalogIndex.has(urn);
  }

  /**
   * Find manifests by namespace
   *
   * Useful for checking namespace conventions during registration
   *
   * @param {string} namespace - Namespace to search
   * @returns {Object} Query result
   */
  findByNamespace(namespace) {
    return this.catalogIndex.findByNamespace(namespace);
  }

  /**
   * Find manifests by owner
   *
   * Useful for checking ownership during approval
   *
   * @param {string} owner - Owner to search
   * @returns {Object} Query result
   */
  findByOwner(owner) {
    return this.catalogIndex.findByOwner(owner);
  }

  /**
   * Find manifests by type
   *
   * @param {string} type - Protocol type
   * @returns {Object} Query result
   */
  findByType(type) {
    return this.catalogIndex.findByType(type);
  }

  /**
   * Get catalog statistics
   *
   * @returns {Object} Catalog stats
   */
  getStats() {
    return this.catalogIndex.getStats();
  }

  /**
   * Get total number of registered manifests
   *
   * @returns {number} Count
   */
  size() {
    return this.catalogIndex.size();
  }

  /**
   * List all registered URNs
   *
   * @returns {Array<string>} Array of URNs
   */
  listURNs() {
    return Array.from(this.catalogIndex.artifacts.keys());
  }

  /**
   * List all manifests
   *
   * @returns {Array<Object>} Array of manifests
   */
  listAll() {
    return Array.from(this.catalogIndex.artifacts.values());
  }

  /**
   * Check dependencies exist
   *
   * Validates that all dependencies in manifest are already registered
   *
   * @param {Object} manifest - Manifest to check
   * @returns {Object} Dependency check result
   */
  checkDependencies(manifest) {
    const dependencies = manifest.dependencies || [];
    const missing = [];
    const found = [];

    for (const depUrn of dependencies) {
      if (this.catalogIndex.has(depUrn)) {
        found.push(depUrn);
      } else {
        missing.push(depUrn);
      }
    }

    return {
      allExist: missing.length === 0,
      totalDependencies: dependencies.length,
      found: found.length,
      missing: missing.length,
      missingURNs: missing
    };
  }

  /**
   * Find consumers (dependents) of a URN
   *
   * Useful for impact analysis during registration
   *
   * @param {string} urn - URN to find consumers for
   * @returns {Array<Object>} Array of consumer manifests
   */
  findConsumers(urn) {
    return this.catalogIndex.findConsumers(urn);
  }

  /**
   * Get dependency tree for URN
   *
   * @param {string} urn - Root URN
   * @returns {Set<string>} Set of dependency URNs
   */
  getDependencyTree(urn) {
    return this.catalogIndex.getDependencyTree(urn);
  }

  /**
   * Detect circular dependencies
   *
   * @returns {Object} Cycle detection result
   */
  detectCycles() {
    return this.catalogIndex.detectCycles();
  }
}

/**
 * Create a catalog index adapter with a new catalog instance
 *
 * @returns {CatalogIndexAdapter} New adapter instance
 */
function createCatalogAdapter() {
  const catalogIndex = new URNCatalogIndex();
  return new CatalogIndexAdapter(catalogIndex);
}

export {
  CatalogIndexAdapter,
  createCatalogAdapter
};
