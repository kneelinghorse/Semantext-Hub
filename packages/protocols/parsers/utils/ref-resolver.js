/**
 * Reference Resolver
 * Resolves local $ref references in OpenAPI specs
 *
 * Scope (B7.1.0):
 * - Local references only (#/components/schemas/...)
 * - Circular reference detection deferred to B7.1.1
 * - External references (http://, file://) deferred to B7.1.1
 */

/**
 * Local reference resolver
 */
class RefResolver {
  constructor(options = {}) {
    this.options = {
      maxDepth: 50, // Prevent infinite loops
      ...options
    };
  }

  /**
   * Resolve a $ref pointer to its target
   * @param {string} ref - JSON Pointer ($ref value)
   * @param {Object} spec - Root OpenAPI spec
   * @returns {Object|null} Resolved object or null if not found
   */
  resolve(ref, spec) {
    // Only handle local references (starting with #)
    if (!ref || !ref.startsWith('#')) {
      return null; // External refs deferred to B7.1.1
    }

    // Parse JSON Pointer (RFC 6901)
    const path = ref.substring(1); // Remove leading #
    const parts = path.split('/').filter(Boolean);

    return this._resolvePath(parts, spec, 0);
  }

  /**
   * Check if a value is a reference
   * @param {any} value - Value to check
   * @returns {boolean}
   */
  isRef(value) {
    return value && typeof value === 'object' && '$ref' in value;
  }

  /**
   * Get reference path from $ref value
   * @param {Object} refObj - Object with $ref property
   * @returns {string|null}
   */
  getRefPath(refObj) {
    if (!this.isRef(refObj)) {
      return null;
    }
    return refObj.$ref;
  }

  /**
   * Resolve all $ref in an object recursively
   * @param {Object} obj - Object potentially containing $refs
   * @param {Object} spec - Root spec for resolution
   * @param {number} depth - Current recursion depth
   * @returns {Object} Object with refs resolved
   */
  resolveAll(obj, spec, depth = 0) {
    // Prevent infinite recursion
    if (depth > this.options.maxDepth) {
      return obj;
    }

    // Handle null/undefined
    if (obj === null || obj === undefined) {
      return obj;
    }

    // Handle primitives
    if (typeof obj !== 'object') {
      return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveAll(item, spec, depth + 1));
    }

    // Check if this object is a $ref
    if (this.isRef(obj)) {
      const refPath = this.getRefPath(obj);
      const resolved = this.resolve(refPath, spec);

      // If resolution failed, return original
      if (!resolved) {
        return obj;
      }

      // Recursively resolve the resolved object
      return this.resolveAll(resolved, spec, depth + 1);
    }

    // Recursively resolve object properties
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = this.resolveAll(value, spec, depth + 1);
    }

    return result;
  }

  /**
   * Extract all $ref paths from an object
   * @param {Object} obj - Object to scan
   * @param {string[]} refs - Accumulated refs (for recursion)
   * @returns {string[]} Array of $ref paths
   */
  extractRefs(obj, refs = []) {
    if (!obj || typeof obj !== 'object') {
      return refs;
    }

    if (this.isRef(obj)) {
      const refPath = this.getRefPath(obj);
      if (refPath && !refs.includes(refPath)) {
        refs.push(refPath);
      }
    }

    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.extractRefs(item, refs);
      }
    } else {
      for (const value of Object.values(obj)) {
        this.extractRefs(value, refs);
      }
    }

    return refs;
  }

  /**
   * Check if ref is local (starts with #)
   * @param {string} ref - Reference path
   * @returns {boolean}
   */
  isLocalRef(ref) {
    return ref && typeof ref === 'string' && ref.startsWith('#');
  }

  /**
   * Check if ref is external (http://, https://, file://)
   * @param {string} ref - Reference path
   * @returns {boolean}
   */
  isExternalRef(ref) {
    return ref && typeof ref === 'string' && /^(https?|file):\/\//i.test(ref);
  }

  // ==================== Private Methods ====================

  /**
   * Resolve a JSON Pointer path
   * @private
   */
  _resolvePath(parts, obj, depth) {
    if (depth > this.options.maxDepth) {
      return null;
    }

    if (parts.length === 0) {
      return obj;
    }

    const [current, ...rest] = parts;
    const key = this._decodePointerToken(current);

    if (!obj || typeof obj !== 'object') {
      return null;
    }

    const nextObj = obj[key];

    if (nextObj === undefined) {
      return null;
    }

    return this._resolvePath(rest, nextObj, depth + 1);
  }

  /**
   * Decode JSON Pointer token (handle ~0 and ~1 escaping)
   * @private
   */
  _decodePointerToken(token) {
    return token
      .replace(/~1/g, '/')
      .replace(/~0/g, '~');
  }
}

export { RefResolver };
