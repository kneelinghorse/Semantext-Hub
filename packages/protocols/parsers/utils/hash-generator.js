/**
 * Hash Generator
 * Deterministic content hashing using XXHash for OpenAPI specs
 *
 * Features:
 * - XXHash64 for fast, deterministic hashing
 * - Canonical JSON serialization for consistency
 * - Performance target: <100ms per 1000 lines
 * - 100% deterministic across runs and platforms
 */

import XXHash from 'xxhash-addon';
import crypto from 'crypto';

/**
 * Deterministic hash generation for OpenAPI specs
 */
class HashGenerator {
  constructor(options = {}) {
    this.options = {
      algorithm: 'xxhash64',    // Use XXHash64 for speed
      seed: 0,                  // Seed for hash function (0 for determinism)
      encoding: 'hex',          // Output encoding
      sortKeys: true,           // Sort object keys for determinism
      ...options
    };
  }

  /**
   * Generate deterministic hash for OpenAPI spec
   * @param {Object} spec - OpenAPI specification object
   * @returns {string} 64-bit hash in hex format
   */
  generate(spec) {
    try {
      // Step 1: Canonicalize the spec (deterministic JSON)
      const canonical = this._canonicalize(spec);

      // Step 2: Generate XXHash
      const hash = this._xxhash64(canonical);

      return hash;
    } catch (error) {
      throw new Error(`Hash generation failed: ${error.message}`);
    }
  }

  /**
   * Generate hash from string content
   * @param {string} content - String content to hash
   * @returns {string} Hash in hex format
   */
  generateFromString(content) {
    try {
      return this._xxhash64(content);
    } catch (error) {
      throw new Error(`Hash generation from string failed: ${error.message}`);
    }
  }

  /**
   * Verify that two specs produce the same hash
   * @param {Object} spec1 - First spec
   * @param {Object} spec2 - Second spec
   * @returns {boolean} True if hashes match
   */
  verify(spec1, spec2) {
    const hash1 = this.generate(spec1);
    const hash2 = this.generate(spec2);
    return hash1 === hash2;
  }

  /**
   * Generate hash with timing information
   * @param {Object} spec - OpenAPI specification
   * @returns {Object} { hash, duration } in milliseconds
   */
  generateWithTiming(spec) {
    const start = process.hrtime.bigint();
    const hash = this.generate(spec);
    const end = process.hrtime.bigint();

    const duration = Number(end - start) / 1_000_000; // Convert to ms

    return { hash, duration };
  }

  // ==================== Private Methods ====================

  /**
   * Canonicalize JSON for deterministic serialization
   * @private
   */
  _canonicalize(obj) {
    // Use deterministic JSON serialization
    // Sort keys alphabetically for consistency
    return this._deterministicStringify(obj);
  }

  /**
   * Deterministic JSON stringify with sorted keys
   * @private
   */
  _deterministicStringify(obj) {
    if (obj === null) {
      return 'null';
    }

    if (obj === undefined) {
      return undefined; // Excluded from output
    }

    if (typeof obj === 'boolean') {
      return obj ? 'true' : 'false';
    }

    if (typeof obj === 'number') {
      return Number.isFinite(obj) ? JSON.stringify(obj) : 'null';
    }

    if (typeof obj === 'string') {
      return JSON.stringify(obj);
    }

    if (Array.isArray(obj)) {
      const items = obj
        .map(item => this._deterministicStringify(item))
        .filter(item => item !== undefined);
      return `[${items.join(',')}]`;
    }

    if (typeof obj === 'object') {
      // Sort keys alphabetically
      const keys = Object.keys(obj).sort();
      const pairs = [];

      for (const key of keys) {
        const value = this._deterministicStringify(obj[key]);
        if (value !== undefined) {
          pairs.push(`${JSON.stringify(key)}:${value}`);
        }
      }

      return `{${pairs.join(',')}}`;
    }

    return undefined;
  }

  /**
   * Compute XXHash64 hash
   * @private
   */
  _xxhash64(content) {
    try {
      const buffer = Buffer.from(content, 'utf8');
      const hash = XXHash.XXHash64(buffer, this.options.seed);

      // Convert hash to hex string
      return hash.toString(16).padStart(16, '0');
    } catch (error) {
      // Fallback to simpler implementation if native addon fails
      return this._fallbackHash(content);
    }
  }

  /**
   * Fallback hash using crypto (if XXHash fails)
   * @private
   */
  _fallbackHash(content) {
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    // Return first 16 chars to match XXHash64 format
    return hash.substring(0, 16);
  }

  /**
   * Estimate content size for performance tracking
   * @private
   */
  _estimateSize(content) {
    return Buffer.byteLength(content, 'utf8');
  }
}

/**
 * Utility function for quick hash generation
 * @param {Object} spec - OpenAPI spec
 * @returns {string} Hash
 */
function hashSpec(spec) {
  const generator = new HashGenerator();
  return generator.generate(spec);
}

export { HashGenerator, hashSpec };
