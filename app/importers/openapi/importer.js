/*
 * OpenAPI 3.x Importer
 * Converts OpenAPI specifications to API Protocol manifests
 *
 * Features:
 * - Robust parsing with fallback for malformed specs
 * - Pattern detection (pagination, long-running operations)
 * - x-* extension preservation
 * - Confidence scoring for inferred patterns
 * - URN generation for service identity
 */

const SwaggerParser = require('@apidevtools/swagger-parser');
const crypto = require('crypto');
const { detectPagination, detectLongRunning } = require('./patterns');
const { extractExtensions, preserveValuedExtensions } = require('./extensions');

/**
 * OpenAPI to API Protocol Importer
 */
class OpenAPIImporter {
  constructor(options = {}) {
    this.options = {
      strictMode: false,           // If true, fail on malformed specs
      preserveAllExtensions: true, // Keep all x-* extensions
      generateURNs: true,          // Auto-generate service URNs
      inferPatterns: true,         // Enable pattern detection
      ...options
    };
  }

  /**
   * Import OpenAPI spec from URL, file path, or object
   * @param {string|object} source - URL, file path, or parsed OpenAPI object
   * @returns {Promise<object>} API Protocol manifest (draft status)
   */
  async import(source) {
    try {
      // Step 1: Parse and dereference OpenAPI spec
      const spec = await this._parseSpec(source);

      // Step 2: Validate OpenAPI version
      this._validateOpenAPIVersion(spec);

      // Step 3: Convert to API Protocol manifest
      const manifest = await this._convertToManifest(spec);

      // Step 4: Add provenance metadata
      const importedAt = new Date().toISOString();
      const specVersion = spec.openapi || spec.swagger;

      manifest.metadata = { ...(manifest.metadata || {}) };
      manifest.metadata.status = 'draft';

      const inputType = typeof source === 'string'
        ? (this._looksLikeUrl(source) ? 'url' : 'string')
        : 'object';

      manifest.metadata.source = {
        type: 'openapi',
        version: specVersion,
        imported_at: importedAt,
        input_type: inputType
      };

      if (typeof source === 'string') {
        manifest.metadata.source.reference = source;
        if (this._looksLikeUrl(source)) {
          manifest.metadata.source.original_url = source;
        }
      }

      manifest.provenance = {
        importer: 'OpenAPIImporter',
        importer_version: '0.1.0',
        imported_at: importedAt,
        spec_version: specVersion,
        spec_hash: this._computeSpecHash(spec),
        source: typeof source === 'string' ? source : null,
        source_type: typeof source
      };

      return manifest;
    } catch (error) {
      if (this.options.strictMode) {
        throw error;
      }
      // Graceful fallback: return partial manifest with error details
      return this._createErrorManifest(source, error);
    }
  }

  /**
   * Parse OpenAPI spec with robust error handling
   * @private
   */
  async _parseSpec(source) {
    try {
      // swagger-parser handles URLs, file paths, and objects
      // Automatically dereferences $ref pointers
      const api = await SwaggerParser.dereference(source);
      return api;
    } catch (error) {
      // Fallback: try without dereferencing
      try {
        const api = await SwaggerParser.parse(source);
        return api;
      } catch (fallbackError) {
        throw new Error(`Failed to parse OpenAPI spec: ${error.message}`);
      }
    }
  }

  /**
   * Validate OpenAPI version
   * @private
   */
  _validateOpenAPIVersion(spec) {
    const version = spec.openapi || spec.swagger;
    if (!version) {
      throw new Error('Invalid spec: missing openapi/swagger version field');
    }

    // Support OpenAPI 3.x and Swagger 2.x
    const major = parseInt(version.split('.')[0]);
    if (major < 2 || major > 3) {
      throw new Error(`Unsupported OpenAPI version: ${version}`);
    }
  }

  /**
   * Convert OpenAPI spec to API Protocol manifest
   * @private
   */
  async _convertToManifest(spec) {
    const service = this._extractService(spec);
    const manifest = {
      service,
      capabilities: this._extractCapabilities(spec),
      interface: this._extractInterface(spec, service),
      operations: this._extractOperations(spec),
      context: this._extractContext(spec),
      validation: this._extractValidation(spec),
      quality: this._extractQuality(spec),
      metadata: this._extractMetadata(spec),
      relationships: this._extractRelationships(spec)
    };

    // Remove empty top-level fields
    Object.keys(manifest).forEach(key => {
      if (!manifest[key] || (typeof manifest[key] === 'object' && Object.keys(manifest[key]).length === 0)) {
        delete manifest[key];
      }
    });

    return manifest;
  }

  /**
   * Extract service identity
   * @private
   */
  _extractService(spec) {
    const info = spec.info || {};
    const service = {
      name: info.title || 'unknown-api',
      version: info.version || '0.0.0'
    };

    // Generate URN if enabled
    if (this.options.generateURNs) {
      service.urn = this._generateServiceURN(service);
    }

    if (info.description) {
      service.description = info.description;
    }

    return service;
  }

  /**
   * Generate a stable URN for the service
   * @private
   */
  _generateServiceURN(service) {
    const serviceName = service?.name || 'api';
    const serviceSlug = this._slugify(serviceName);
    const version = this._normalizeVersionForUrn(service?.version);

    const baseUrn = `urn:proto:api:${serviceSlug}/service`;
    return version ? `${baseUrn}@${version}` : baseUrn;
  }

  /**
   * Normalize version string for URN usage (semver only)
   * @private
   */
  _normalizeVersionForUrn(version) {
    if (!version || typeof version !== 'string') {
      return null;
    }

    const normalized = version.trim().replace(/^v/i, '');
    return /^\d+\.\d+\.\d+$/.test(normalized) ? normalized : null;
  }

  /**
   * Extract capabilities from tags
   * @private
   */
  _extractCapabilities(spec) {
    if (!spec.tags || spec.tags.length === 0) return undefined;

    const capabilities = {};
    for (const tag of spec.tags) {
      capabilities[tag.name] = {
        description: tag.description || `Operations related to ${tag.name}`,
        ...(tag['x-capability'] && { metadata: tag['x-capability'] })
      };
    }

    return Object.keys(capabilities).length > 0 ? capabilities : undefined;
  }

  /**
   * Extract interface (auth + endpoints)
   * @private
   */
  _extractInterface(spec, service) {
    const iface = {
      authentication: this._extractAuthentication(spec),
      endpoints: this._extractEndpoints(spec, service)
    };

    // Remove empty auth
    if (!iface.authentication || Object.keys(iface.authentication).length === 0) {
      delete iface.authentication;
    }

    return iface;
  }

  /**
   * Extract authentication configuration
   * @private
   */
  _extractAuthentication(spec) {
    const security = spec.security || [];
    const securitySchemes = spec.components?.securitySchemes || spec.securityDefinitions || {};

    if (security.length === 0 && Object.keys(securitySchemes).length === 0) {
      return { type: 'none' };
    }

    // Find first security requirement
    const firstSecurity = security[0];
    if (!firstSecurity) return { type: 'none' };

    const schemeName = Object.keys(firstSecurity)[0];
    const scheme = securitySchemes[schemeName];

    if (!scheme) return { type: 'none' };

    // Map OpenAPI security scheme to API Protocol auth types
    const auth = {};

    switch (scheme.type) {
      case 'apiKey':
        auth.type = 'apiKey';
        auth.in = scheme.in; // header, query, cookie
        if (scheme.name) auth.name = scheme.name;
        break;
      case 'http':
        auth.type = scheme.scheme === 'bearer' ? 'apiKey' : 'hmac';
        auth.in = 'header';
        break;
      case 'oauth2':
        auth.type = 'oauth2';
        // Extract scopes from first flow
        const flows = scheme.flows || {};
        const firstFlow = Object.values(flows)[0];
        if (firstFlow?.scopes) {
          auth.scopes = Object.keys(firstFlow.scopes);
        }
        break;
      default:
        auth.type = 'none';
    }

    return auth;
  }

  /**
   * Extract endpoints from paths
   * @private
   */
  _extractEndpoints(spec, service) {
    const endpoints = [];
    const paths = spec.paths || {};

    for (const [path, pathItem] of Object.entries(paths)) {
      const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

      for (const method of methods) {
        const operation = pathItem[method];
        if (!operation) continue;

        const endpoint = {
          method: method.toUpperCase(),
          path: path,
          ...(operation.summary && { summary: operation.summary }),
          ...(operation.description && { description: operation.description }),
          ...(operation.operationId && { operationId: operation.operationId })
        };

        if (this.options.generateURNs) {
          endpoint.urn = this._generateEndpointURN(service, method, path, operation);
        }

        // Parameters
        const params = this._extractParameters(operation, pathItem);
        if (params.length > 0) endpoint.params = params;

        // Request body
        const requestBody = this._extractRequestBody(operation);
        if (requestBody) endpoint.request = requestBody;

        // Responses
        const responses = this._extractResponses(operation);
        if (responses.length > 0) endpoint.responses = responses;

        // Errors (from 4xx/5xx responses)
        const errors = this._extractErrors(operation);
        if (errors.length > 0) endpoint.errors = errors;

        // Pattern detection
        if (this.options.inferPatterns) {
          const detectionTarget = { ...operation, method };
          const pagination = detectPagination(detectionTarget, params);
          if (pagination.detected) {
            endpoint.pagination = {
              style: pagination.style,
              ...(pagination.params && { params: pagination.params }),
              ...(pagination.confidence < 1.0 && { _confidence: pagination.confidence })
            };
          }

          const longRunning = detectLongRunning(detectionTarget, responses);
          if (longRunning.detected) {
            endpoint.long_running = {
              pattern: longRunning.pattern,
              ...(longRunning.status_endpoint && { status_endpoint: longRunning.status_endpoint }),
              ...(longRunning.confidence < 1.0 && { _confidence: longRunning.confidence })
            };
          }
        }

        // Preserve valuable x-* extensions
        const extensions = this._collectExtensions(operation);
        if (Object.keys(extensions).length > 0) {
          endpoint.extensions = extensions;
        }

        // Tags
        if (operation.tags && operation.tags.length > 0) {
          endpoint.tags = operation.tags;
        }

        endpoints.push(endpoint);
      }
    }

    return endpoints;
  }

  /**
   * Extract and merge parameters
   * @private
   */
  _extractParameters(operation, pathItem) {
    const params = [];
    const allParams = [
      ...(pathItem.parameters || []),
      ...(operation.parameters || [])
    ];

    for (const param of allParams) {
      params.push({
        name: param.name,
        in: param.in,
        required: param.required || param.in === 'path',
        ...(param.description && { description: param.description }),
        ...(param.schema && { schema: param.schema })
      });
    }

    return params;
  }

  /**
   * Extract request body
   * @private
   */
  _extractRequestBody(operation) {
    const requestBody = operation.requestBody;
    if (!requestBody) return null;

    const content = requestBody.content || {};
    const contentType = Object.keys(content)[0];
    if (!contentType) return null;

    return {
      contentType,
      required: requestBody.required || false,
      ...(content[contentType].schema && { schema: content[contentType].schema })
    };
  }

  /**
   * Extract responses
   * @private
   */
  _extractResponses(operation) {
    const responses = [];
    const operationResponses = operation.responses || {};

    for (const [status, response] of Object.entries(operationResponses)) {
      const statusCode = parseInt(status);
      if (isNaN(statusCode) || statusCode >= 400) continue; // Skip errors

      const resp = { status: statusCode };

      if (response.description) {
        resp.description = response.description;
      }

      // Extract schema from first content type
      const content = response.content || {};
      const contentType = Object.keys(content)[0];
      if (contentType && content[contentType].schema) {
        resp.schema = content[contentType].schema;
      }

      responses.push(resp);
    }

    return responses;
  }

  /**
   * Extract typed errors from 4xx/5xx responses
   * @private
   */
  _extractErrors(operation) {
    const errors = [];
    const responses = operation.responses || {};

    // Error type mappings based on research
    const errorTypeMap = {
      400: { type: 'validation', retriable: false },
      401: { type: 'authentication', retriable: false },
      403: { type: 'authorization', retriable: false },
      404: { type: 'not_found', retriable: false },
      429: { type: 'rate_limit', retriable: true },
      500: { type: 'server', retriable: true },
      502: { type: 'server', retriable: true },
      503: { type: 'server', retriable: true },
      504: { type: 'server', retriable: true }
    };

    for (const [status, response] of Object.entries(responses)) {
      const statusCode = parseInt(status);
      if (isNaN(statusCode) || statusCode < 400) continue;

      const errorType = errorTypeMap[statusCode] || { type: 'unknown', retriable: false };

      errors.push({
        code: errorType.type.toUpperCase(),
        http: statusCode,
        retriable: errorType.retriable,
        ...(response.description && { docs: response.description })
      });
    }

    return errors;
  }

  /**
   * Extract rate limits from x-rate-limit extensions
   * @private
   */
  _extractOperations(spec) {
    const rateLimits = [];

    // Check for global rate limit extensions
    if (spec['x-rate-limit']) {
      const rl = spec['x-rate-limit'];
      rateLimits.push({
        scope: rl.scope || 'global',
        limit: rl.limit || 1000,
        window: rl.window || '1m',
        ...(rl.burst && { burst: rl.burst })
      });
    }

    return rateLimits.length > 0 ? { rate_limits: rateLimits } : undefined;
  }

  /**
   * Extract context metadata
   * @private
   */
  _extractContext(spec) {
    const context = {};

    if (spec.info?.contact) {
      context.contact = spec.info.contact;
    }

    if (spec.servers && spec.servers.length > 0) {
      context.servers = spec.servers.map(s => ({
        url: s.url,
        ...(s.description && { description: s.description })
      }));
    }

    if (spec.externalDocs) {
      context.documentation = spec.externalDocs.url;
    }

    return Object.keys(context).length > 0 ? context : undefined;
  }

  /**
   * Extract validation schemas
   * @private
   */
  _extractValidation(spec) {
    const schemas = spec.components?.schemas || spec.definitions || {};

    if (Object.keys(schemas).length === 0) return undefined;

    return { schemas };
  }

  /**
   * Extract quality metadata
   * @private
   */
  _extractQuality(spec) {
    const quality = {};

    // Check for x-quality extensions
    if (spec['x-quality']) {
      Object.assign(quality, spec['x-quality']);
    }

    return Object.keys(quality).length > 0 ? quality : undefined;
  }

  /**
   * Extract metadata (lifecycle, etc.)
   * @private
   */
  _extractMetadata(spec) {
    const metadata = {};

    // Extract lifecycle from x-lifecycle extension
    if (spec['x-lifecycle']) {
      metadata.lifecycle = spec['x-lifecycle'];
    }

    // Preserve other valuable x-* extensions at spec level
    const extensions = this._collectExtensions(spec);
    if (Object.keys(extensions).length > 0) {
      metadata.extensions = extensions;
    }

    return metadata;
  }

  /**
   * Extract relationships from x-* extensions
   * @private
   */
  _extractRelationships(spec) {
    const relationships = {};

    if (spec['x-dependencies']) {
      relationships.dependencies = spec['x-dependencies'];
    }

    if (spec['x-consumers']) {
      relationships.consumers = spec['x-consumers'];
    }

    return Object.keys(relationships).length > 0 ? relationships : undefined;
  }

  /**
   * Collect extensions based on importer configuration
   * @private
   */
  _collectExtensions(obj) {
    return this.options.preserveAllExtensions
      ? extractExtensions(obj)
      : preserveValuedExtensions(obj);
  }

  /**
   * Generate a stable URN for an endpoint
   * @private
   */
  _generateEndpointURN(service, method, path, operation) {
    const serviceName = service?.name || 'api';
    const serviceSlug = this._slugify(serviceName);
    const version = this._normalizeVersionForUrn(service?.version);
    const methodPart = (method || 'get').toLowerCase();

    if (operation?.operationId) {
      const opSlug = this._slugify(operation.operationId);
      const baseUrn = `urn:proto:api.endpoint:${serviceSlug}/op/${opSlug}`;
      return version ? `${baseUrn}@${version}` : baseUrn;
    }

    const normalizedPath = this._normalizePathForUrn(path);
    const id = `route/${normalizedPath}-${methodPart}`;
    const baseUrn = `urn:proto:api.endpoint:${serviceSlug}/${id}`;
    return version ? `${baseUrn}@${version}` : baseUrn;
  }

  /**
   * Normalize OpenAPI path to URN-friendly segment
   * @private
   */
  _normalizePathForUrn(path) {
    if (!path || path === '/') {
      return 'root';
    }

    return path
      .replace(/^\//, '')
      .split('/')
      .map(segment => segment.replace(/\{([^}]+)\}/g, 'param-$1'))
      .map(segment => segment.replace(/[^a-zA-Z0-9._-]/g, '-'))
      .filter(Boolean)
      .join('.').toLowerCase();
  }

  /**
   * Compute a stable hash for provenance tracking
   * @private
   */
  _computeSpecHash(spec) {
    try {
      const serialized = this._safeStringify(spec);
      if (!serialized) return null;
      return crypto.createHash('sha256').update(serialized).digest('hex');
    } catch (_) {
      return null;
    }
  }

  /**
   * Safely stringify possibly-cyclical objects
   * @private
   */
  _safeStringify(value) {
    const seen = new WeakSet();
    return JSON.stringify(value, (key, val) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return;
        seen.add(val);
      }
      return val;
    });
  }

  /**
   * Basic URL heuristic for provenance recording
   * @private
   */
  _looksLikeUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value);
  }

  /**
   * Create error manifest for failed imports
   * @private
   */
  _createErrorManifest(source, error) {
    return {
      service: {
        name: 'import-failed',
        version: '0.0.0'
      },
      interface: {
        endpoints: []
      },
      metadata: {
        status: 'error',
        error: {
          message: error.message,
          source: typeof source === 'string' ? source : 'object',
          timestamp: new Date().toISOString()
        }
      }
    };
  }

  /**
   * Slugify string for URN generation
   * @private
   */
  _slugify(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

module.exports = { OpenAPIImporter };
