/**
 * OpenAPI Parser Core
 * Production-ready OpenAPI 3.x parser with streaming, hashing, and manifest conversion
 *
 * Features (B7.1.0):
 * - Stream-based parsing for large specs (10k+ lines)
 * - Deterministic XXHash content hashing
 * - Local $ref resolution
 * - Protocol manifest conversion
 * - Performance: <1s for 10k line specs, <100ms hash/1000 lines
 *
 * Enhanced Features (B7.1.1):
 * - External $ref resolution (HTTP/HTTPS/file://)
 * - Circular reference detection
 * - Structured error model with error codes
 * - Progress tracking with event emission
 * - Error collection mode for partial results
 */

import SwaggerParser from '@apidevtools/swagger-parser';
import { StreamParser } from './utils/stream-parser.js';
import { EndpointExtractor } from './utils/endpoint-extractor.js';
import { SchemaExtractor } from './utils/schema-extractor.js';
import { HashGenerator } from './utils/hash-generator.js';
import { ManifestConverter } from './utils/manifest-converter.js';
import { ExternalRefResolver } from './utils/external-ref-resolver.js';
import { CircularRefDetector } from './utils/circular-ref-detector.js';
import { ErrorCollector, createError, wrapError } from './utils/error-model.js';
import { ProgressTracker } from './utils/progress-tracker.js';
import { Readable } from 'stream';

/**
 * Main OpenAPI Parser class
 */
class OpenAPIParser {
  constructor(options = {}) {
    this.options = {
      // Core parsing options
      streaming: true,           // Enable streaming for large files
      resolveRefs: 'all',        // 'local' | 'all' | 'none'
      validateSpec: true,        // Validate OpenAPI spec structure
      generateHash: true,        // Generate deterministic content hash
      strictMode: false,         // Fail on any parsing errors

      // B7.1.1: External ref resolution
      refCache: true,            // Cache external refs
      maxRefDepth: 10,           // Prevent infinite resolution
      refTimeout: 5000,          // External ref fetch timeout (ms)
      maxRetries: 3,             // Retry failed external refs

      // B7.1.1: Circular detection
      detectCircular: true,      // Enable circular ref detection
      allowCircular: false,      // Fail or warn on circular refs

      // B7.1.1: Error handling
      errorMode: 'collect',      // 'throw' | 'collect' | 'ignore'
      maxErrors: 100,            // Max errors to collect
      maxWarnings: 200,          // Max warnings to collect

      // B7.1.1: Progress tracking
      progressTracking: false,   // Emit progress events (opt-in)

      ...options
    };

    // Initialize core components
    this.streamParser = new StreamParser();
    this.endpointExtractor = new EndpointExtractor();
    this.schemaExtractor = new SchemaExtractor();
    this.hashGenerator = new HashGenerator();
    this.manifestConverter = new ManifestConverter();

    // B7.1.1: Initialize enhanced components
    this.externalRefResolver = new ExternalRefResolver({
      cacheEnabled: this.options.refCache,
      timeout: this.options.refTimeout,
      maxRetries: this.options.maxRetries,
      basePath: this.options.basePath,
      baseUrl: this.options.baseUrl
    });

    this.circularDetector = new CircularRefDetector({
      allowCircular: this.options.allowCircular,
      maxDepth: this.options.maxRefDepth
    });

    this.errorCollector = new ErrorCollector({
      maxErrors: this.options.maxErrors,
      maxWarnings: this.options.maxWarnings,
      stopOnError: this.options.errorMode === 'throw'
    });

    this.progressTracker = new ProgressTracker({
      enabled: this.options.progressTracking
    });

    // Cached data
    this.parsedSpec = null;
    this.specHash = null;
    this.externalRefs = new Map();
  }

  /**
   * Parse OpenAPI spec from various sources
   * @param {string|Object|Stream} source - File path, URL, object, or stream
   * @returns {Promise<ParsedSpec>}
   */
  async parse(source) {
    // Clear previous state
    this.errorCollector.clear();
    this.externalRefs.clear();

    // Start progress tracking
    this.progressTracker.start();

    try {
      // Phase 1: Streaming and validation
      this.progressTracker.update('initializing', 0);
      const rawSpec = await this._parseRawSpec(source);

      // Phase 2: Validate OpenAPI version
      this.progressTracker.update('validating', 10);
      this._validateOpenAPIVersion(rawSpec);

      // Phase 3: Resolve external refs if enabled
      this.progressTracker.update('resolving_external_refs', 0);
      if (this.options.resolveRefs === 'all') {
        await this._resolveExternalRefs(rawSpec);
      }

      // Phase 4: Parse with swagger-parser
      this.progressTracker.update('resolving_local_refs', 0);
      const spec = await this._parseWithSwaggerParser(rawSpec);

      // Phase 5: Detect circular references
      this.progressTracker.update('detecting_circular', 0);
      let circularResult = null;
      if (this.options.detectCircular) {
        circularResult = await this._detectCircularRefs(spec);
      }

      // Phase 6: Extract endpoints
      this.progressTracker.update('extracting_endpoints', 0);
      const endpoints = await this._safeExtractEndpoints(spec);

      // Phase 7: Extract schemas
      this.progressTracker.update('extracting_schemas', 0);
      const schemas = await this._safeExtractSchemas(spec);

      // Phase 8: Generate hash
      this.progressTracker.update('generating_hash', 0);
      let specHash = null;
      if (this.options.generateHash) {
        specHash = await this._safeGenerateHash(spec);
      }

      // Phase 9: Build result
      this.progressTracker.update('finalizing', 0);
      this.parsedSpec = {
        raw: rawSpec,
        spec: spec,
        version: spec.openapi || spec.swagger,
        info: spec.info || {},
        paths: spec.paths || {},
        components: spec.components || {},
        servers: spec.servers || [],
        security: spec.security || [],
        tags: spec.tags || [],
        externalDocs: spec.externalDocs || null,
        hash: specHash,

        // B7.1.1: Enhanced metadata
        metadata: {
          parsedAt: new Date().toISOString(),
          sourceType: this._getSourceType(source),
          ...(typeof source === 'string' && { source }),
          externalRefsResolved: this.externalRefs.size,
          hasCircularRefs: circularResult?.hasCircular || false
        },

        // B7.1.1: Error and warning tracking
        errors: this.errorCollector.errors,
        warnings: this.errorCollector.warnings,
        hasErrors: this.errorCollector.hasErrors(),
        hasWarnings: this.errorCollector.hasWarnings(),

        // B7.1.1: Additional data
        externalRefs: Array.from(this.externalRefs.keys()),
        circularRefs: circularResult?.cycles || [],
        endpoints,
        schemas
      };

      // Complete progress tracking
      this.progressTracker.complete({
        endpoints: endpoints.length,
        schemas: schemas.length,
        errors: this.errorCollector.errors.length,
        warnings: this.errorCollector.warnings.length
      });

      return this.parsedSpec;
    } catch (error) {
      // Report error to progress tracker
      this.progressTracker.error(error);

      // Handle based on error mode
      if (this.options.errorMode === 'throw') {
        throw error;
      }

      // Collect error
      try {
        this.errorCollector.add(wrapError(error, 'PARSE_001'));
      } catch (e) {
        // Error collector is full or error adding
      }

      // Return partial result in collect mode
      return this._createPartialSpec(source, error);
    }
  }

  /**
   * Stream-based parsing for large specs
   * @param {Stream} specStream - OpenAPI spec stream
   * @returns {Promise<ParsedSpec>}
   */
  async parseStream(specStream) {
    return this.parse(specStream);
  }

  /**
   * Extract endpoints with full metadata
   * @param {Object} spec - Parsed OpenAPI spec (optional, uses cached if not provided)
   * @returns {Endpoint[]}
   */
  extractEndpoints(spec = null) {
    const targetSpec = spec || this.parsedSpec?.spec;
    if (!targetSpec) {
      throw new Error('No spec available. Call parse() first or provide a spec.');
    }

    return this.endpointExtractor.extract(targetSpec);
  }

  /**
   * Extract schemas with $ref resolution (local only)
   * @param {Object} spec - Parsed OpenAPI spec (optional, uses cached if not provided)
   * @returns {Schema[]}
   */
  extractSchemas(spec = null) {
    const targetSpec = spec || this.parsedSpec?.spec;
    if (!targetSpec) {
      throw new Error('No spec available. Call parse() first or provide a spec.');
    }

    return this.schemaExtractor.extract(targetSpec);
  }

  /**
   * Generate deterministic hash using XXHash
   * @param {Object} spec - Parsed OpenAPI spec
   * @returns {string} - 64-bit hash hex string
   */
  generateSpecHash(spec) {
    return this.hashGenerator.generate(spec);
  }

  /**
   * Convert to Protocol manifest format
   * @param {Object} spec - Parsed OpenAPI spec (optional, uses cached if not provided)
   * @returns {ProtocolManifest}
   */
  toProtocolManifest(spec = null) {
    const targetSpec = spec || this.parsedSpec;
    if (!targetSpec) {
      throw new Error('No spec available. Call parse() first or provide a spec.');
    }

    // Extract all components needed for manifest
    const endpoints = this.extractEndpoints(targetSpec.spec || targetSpec);
    const schemas = this.extractSchemas(targetSpec.spec || targetSpec);

    return this.manifestConverter.convert(targetSpec, endpoints, schemas);
  }

  /**
   * Get cached parsed spec
   * @returns {ParsedSpec|null}
   */
  getParsedSpec() {
    return this.parsedSpec;
  }

  /**
   * Get spec hash
   * @returns {string|null}
   */
  getSpecHash() {
    return this.specHash;
  }

  /**
   * Clear cached data
   */
  clear() {
    this.parsedSpec = null;
    this.specHash = null;
    this.externalRefs.clear();
    this.errorCollector.clear();
    this.progressTracker.reset();
  }

  /**
   * Get progress tracker for event subscription
   * @returns {ProgressTracker}
   */
  getProgressTracker() {
    return this.progressTracker;
  }

  /**
   * Get error collector
   * @returns {ErrorCollector}
   */
  getErrorCollector() {
    return this.errorCollector;
  }

  /**
   * Get external ref resolver stats
   * @returns {Object}
   */
  getResolverStats() {
    return this.externalRefResolver.getStats();
  }

  // ==================== Private Methods ====================

  /**
   * Parse raw spec from source
   * @private
   */
  async _parseRawSpec(source) {
    this.progressTracker.update('streaming', 0);

    try {
      const rawSpec = await this.streamParser.parse(source);
      this.progressTracker.completeStage('streaming');
      return rawSpec;
    } catch (error) {
      const parserError = wrapError(error, 'PARSE_001', {
        path: typeof source === 'string' ? source : 'unknown'
      });
      this.errorCollector.add(parserError);
      throw parserError;
    }
  }

  /**
   * Resolve external references
   * @private
   */
  async _resolveExternalRefs(spec) {
    try {
      // Extract all $ref paths
      const refPaths = this._extractRefPaths(spec);

      // Filter external refs only
      const externalRefPaths = refPaths.filter(ref =>
        /^(https?|file):\/\//i.test(ref)
      );

      if (externalRefPaths.length === 0) {
        this.progressTracker.completeStage('resolving_external_refs');
        return;
      }

      // Resolve in batch
      const totalRefs = externalRefPaths.length;
      let resolvedCount = 0;

      for (const refPath of externalRefPaths) {
        try {
          const resolved = await this.externalRefResolver.resolveExternal(refPath);
          this.externalRefs.set(refPath, resolved);
          resolvedCount++;

          // Update progress
          const progress = (resolvedCount / totalRefs) * 100;
          this.progressTracker.update('resolving_external_refs', progress, {
            resolved: resolvedCount,
            total: totalRefs
          });
        } catch (error) {
          this.errorCollector.add(error);
          // Continue resolving other refs
        }
      }

      this.progressTracker.completeStage('resolving_external_refs', {
        resolved: resolvedCount,
        total: totalRefs
      });
    } catch (error) {
      this.errorCollector.add(wrapError(error, 'REF_001'));
      // Continue parsing even if external refs fail
    }
  }

  /**
   * Detect circular references
   * @private
   */
  async _detectCircularRefs(spec) {
    try {
      const result = this.circularDetector.detectCircular(spec, this.externalRefs);
      this.progressTracker.completeStage('detecting_circular');

      if (result.hasCircular && !this.options.allowCircular) {
        // Add as warning or error based on options
        const error = createError('REF_002', `Found ${result.cycles.length} circular reference(s)`, {
          severity: this.options.allowCircular ? 'WARN' : 'ERROR',
          metadata: {
            cycles: result.cycles
          }
        });
        this.errorCollector.add(error);
      }

      return result;
    } catch (error) {
      this.errorCollector.add(error);
      this.progressTracker.completeStage('detecting_circular');
      return { hasCircular: false, cycles: [] };
    }
  }

  /**
   * Safely extract endpoints with error handling
   * @private
   */
  async _safeExtractEndpoints(spec) {
    try {
      const endpoints = this.endpointExtractor.extract(spec);
      this.progressTracker.completeStage('extracting_endpoints', {
        count: endpoints.length
      });
      return endpoints;
    } catch (error) {
      this.errorCollector.add(wrapError(error, 'SCHEMA_001', {
        path: 'paths'
      }));
      this.progressTracker.completeStage('extracting_endpoints');
      return [];
    }
  }

  /**
   * Safely extract schemas with error handling
   * @private
   */
  async _safeExtractSchemas(spec) {
    try {
      const schemas = this.schemaExtractor.extract(spec);
      this.progressTracker.completeStage('extracting_schemas', {
        count: schemas.length
      });
      return schemas;
    } catch (error) {
      this.errorCollector.add(wrapError(error, 'SCHEMA_001', {
        path: 'components/schemas'
      }));
      this.progressTracker.completeStage('extracting_schemas');
      return [];
    }
  }

  /**
   * Safely generate hash with error handling
   * @private
   */
  async _safeGenerateHash(spec) {
    try {
      const hash = this.hashGenerator.generate(spec);
      this.progressTracker.completeStage('generating_hash');
      return hash;
    } catch (error) {
      this.errorCollector.add(wrapError(error, 'GENERAL_001', {
        path: 'hash-generation'
      }));
      this.progressTracker.completeStage('generating_hash');
      return null;
    }
  }

  /**
   * Extract all $ref paths from spec
   * @private
   */
  _extractRefPaths(obj, refs = [], visited = new Set()) {
    if (!obj || typeof obj !== 'object' || visited.has(obj)) {
      return refs;
    }

    visited.add(obj);

    if (obj.$ref && typeof obj.$ref === 'string') {
      refs.push(obj.$ref);
    }

    if (Array.isArray(obj)) {
      obj.forEach(item => this._extractRefPaths(item, refs, visited));
    } else {
      Object.values(obj).forEach(val => this._extractRefPaths(val, refs, visited));
    }

    return refs;
  }

  /**
   * Create partial spec for error recovery
   * @private
   */
  _createPartialSpec(source, error) {
    return {
      error: true,
      message: error.message,
      code: error.code || 'GENERAL_001',
      source: typeof source === 'string' ? source : 'unknown',
      timestamp: new Date().toISOString(),
      errors: this.errorCollector.errors,
      warnings: this.errorCollector.warnings,
      parsedSpec: this.parsedSpec // May be partially complete
    };
  }

  /**
   * Validate OpenAPI version
   * @private
   */
  _validateOpenAPIVersion(spec) {
    const version = spec.openapi || spec.swagger;

    if (!version) {
      throw createError('OPENAPI_002', 'Missing openapi or swagger version field', {
        path: 'openapi|swagger'
      });
    }

    // Support OpenAPI 3.x only (as per mission scope)
    if (!version.startsWith('3.')) {
      throw createError('OPENAPI_001', `Unsupported OpenAPI version: ${version}`, {
        metadata: { version, supported: '3.x' }
      });
    }

    this.progressTracker.completeStage('validating');
  }

  /**
   * Parse with swagger-parser for validation and dereferencing
   * @private
   */
  async _parseWithSwaggerParser(rawSpec) {
    try {
      if (!this.options.validateSpec) {
        this.progressTracker.completeStage('resolving_local_refs');
        return rawSpec;
      }

      // Parse with validation
      const validated = await SwaggerParser.validate(rawSpec);

      // Resolve references based on options
      if (this.options.resolveRefs === 'local' || this.options.resolveRefs === 'all') {
        // Dereference local $refs (external already resolved separately in B7.1.1)
        const dereferenced = await SwaggerParser.dereference(rawSpec, {
          dereference: {
            circular: 'ignore', // Circular detection handled separately
            excludedPathMatcher: (path) => {
              // When resolveRefs='all', external refs are already resolved
              // so we can exclude them from swagger-parser dereferencing
              if (this.options.resolveRefs === 'all') {
                return /^(https?|file):\/\//i.test(path);
              }
              // When resolveRefs='local', exclude all external refs
              return /^https?:\/\//i.test(path);
            }
          }
        });
        this.progressTracker.completeStage('resolving_local_refs');
        return dereferenced;
      }

      this.progressTracker.completeStage('resolving_local_refs');
      return validated;
    } catch (error) {
      throw wrapError(error, 'OPENAPI_003', {
        path: 'spec-validation'
      });
    }
  }

  /**
   * Determine source type for metadata
   * @private
   */
  _getSourceType(source) {
    if (typeof source === 'string') {
      if (/^https?:\/\//i.test(source)) return 'url';
      if (source.trim().startsWith('{')) return 'json-string';
      return 'file';
    }
    if (source instanceof Readable) return 'stream';
    if (Buffer.isBuffer(source)) return 'buffer';
    return 'object';
  }
}

/**
 * ParsedSpec type definition
 * @typedef {Object} ParsedSpec
 * @property {Object} raw - Raw parsed JSON
 * @property {Object} spec - Validated and dereferenced spec
 * @property {string} version - OpenAPI version
 * @property {Object} info - Info object
 * @property {Object} paths - Paths object
 * @property {Object} components - Components object
 * @property {Array} servers - Server definitions
 * @property {Array} security - Security requirements
 * @property {Array} tags - Tag definitions
 * @property {Object|null} externalDocs - External docs
 * @property {string} [hash] - Deterministic spec hash
 * @property {Object} metadata - Parse metadata
 */

export { OpenAPIParser };
