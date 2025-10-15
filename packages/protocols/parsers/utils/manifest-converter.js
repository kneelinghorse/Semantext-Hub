/**
 * Manifest Converter
 * Converts OpenAPI specs to Protocol manifest format
 *
 * Features:
 * - Generate URNs for services and endpoints
 * - Map OpenAPI structures to Protocol manifest
 * - Include metadata (version, title, description)
 * - Validate output against manifest schema
 * - Preserve provenance information
 */

/**
 * Convert OpenAPI spec to Protocol manifest
 */
class ManifestConverter {
  constructor(options = {}) {
    this.options = {
      generateURNs: true,         // Generate URNs for identifiers
      includeSchemas: true,       // Include schema definitions
      includeProvenance: true,    // Include provenance metadata
      status: 'draft',            // Default manifest status
      ...options
    };
  }

  /**
   * Convert parsed spec to Protocol manifest
   * @param {ParsedSpec} parsedSpec - Parsed OpenAPI spec
   * @param {Endpoint[]} endpoints - Extracted endpoints
   * @param {Schema[]} schemas - Extracted schemas
   * @returns {ProtocolManifest}
   */
  convert(parsedSpec, endpoints, schemas) {
    const spec = parsedSpec.spec || parsedSpec;
    const info = spec.info || {};

    // Build manifest structure
    const manifest = {
      service: this._buildService(spec),
      interface: this._buildInterface(spec, endpoints),
      metadata: this._buildMetadata(spec, parsedSpec),
    };

    // Add optional sections
    if (this.options.includeSchemas && schemas.length > 0) {
      manifest.validation = {
        schemas: this._formatSchemas(schemas)
      };
    }

    // Add context if available
    const context = this._buildContext(spec);
    if (context && Object.keys(context).length > 0) {
      manifest.context = context;
    }

    // Add capabilities from tags
    const capabilities = this._buildCapabilities(spec);
    if (capabilities && Object.keys(capabilities).length > 0) {
      manifest.capabilities = capabilities;
    }

    // Add provenance
    if (this.options.includeProvenance) {
      manifest.provenance = this._buildProvenance(parsedSpec);
    }

    return manifest;
  }

  // ==================== Private Methods ====================

  /**
   * Build service identity section
   * @private
   */
  _buildService(spec) {
    const info = spec.info || {};
    const service = {
      name: info.title || 'unknown-api',
      version: info.version || '0.0.0',
    };

    if (info.description) {
      service.description = info.description;
    }

    // Generate URN if enabled
    if (this.options.generateURNs) {
      service.urn = this._generateServiceURN(service);
    }

    return service;
  }

  /**
   * Build interface section (endpoints + auth)
   * @private
   */
  _buildInterface(spec, endpoints) {
    const iface = {
      endpoints: this._formatEndpoints(spec, endpoints)
    };

    // Add authentication if present
    const auth = this._extractAuthentication(spec);
    if (auth && Object.keys(auth).length > 0) {
      iface.authentication = auth;
    }

    return iface;
  }

  /**
   * Format endpoints for manifest
   * @private
   */
  _formatEndpoints(spec, endpoints) {
    const service = {
      name: spec.info?.title || 'api',
      version: spec.info?.version || '0.0.0'
    };

    return endpoints.map(endpoint => {
      const formatted = {
        method: endpoint.method,
        path: endpoint.path,
      };

      // Add URN if generation enabled
      if (this.options.generateURNs) {
        formatted.urn = this._generateEndpointURN(
          service,
          endpoint.method.toLowerCase(),
          endpoint.path,
          endpoint
        );
      }

      // Add optional fields
      if (endpoint.operationId) formatted.operationId = endpoint.operationId;
      if (endpoint.summary) formatted.summary = endpoint.summary;
      if (endpoint.description) formatted.description = endpoint.description;
      if (endpoint.deprecated) formatted.deprecated = endpoint.deprecated;
      if (endpoint.tags && endpoint.tags.length > 0) formatted.tags = endpoint.tags;
      if (endpoint.parameters) formatted.params = endpoint.parameters;
      if (endpoint.requestBody) formatted.request = endpoint.requestBody;
      if (endpoint.responses) formatted.responses = endpoint.responses;
      if (endpoint.security) formatted.security = endpoint.security;

      return formatted;
    });
  }

  /**
   * Extract authentication configuration
   * @private
   */
  _extractAuthentication(spec) {
    const security = spec.security || [];
    const securitySchemes = spec.components?.securitySchemes || {};

    if (security.length === 0 && Object.keys(securitySchemes).length === 0) {
      return { type: 'none' };
    }

    // Get first security requirement
    const firstSecurity = security[0];
    if (!firstSecurity) return { type: 'none' };

    const schemeName = Object.keys(firstSecurity)[0];
    const scheme = securitySchemes[schemeName];

    if (!scheme) return { type: 'none' };

    // Map OpenAPI security to Protocol auth types
    const auth = {};

    switch (scheme.type) {
      case 'apiKey':
        auth.type = 'apiKey';
        auth.in = scheme.in;
        if (scheme.name) auth.name = scheme.name;
        break;

      case 'http':
        auth.type = scheme.scheme === 'bearer' ? 'apiKey' : 'hmac';
        auth.in = 'header';
        if (scheme.scheme) auth.scheme = scheme.scheme;
        break;

      case 'oauth2':
        auth.type = 'oauth2';
        const flows = scheme.flows || {};
        const firstFlow = Object.values(flows)[0];
        if (firstFlow?.scopes) {
          auth.scopes = Object.keys(firstFlow.scopes);
        }
        break;

      case 'openIdConnect':
        auth.type = 'oauth2';
        if (scheme.openIdConnectUrl) {
          auth.openIdConnectUrl = scheme.openIdConnectUrl;
        }
        break;

      default:
        auth.type = 'none';
    }

    return auth;
  }

  /**
   * Format schemas for validation section
   * @private
   */
  _formatSchemas(schemas) {
    const formatted = {};

    for (const schema of schemas) {
      // Only include component schemas (not inline)
      if (!schema.inline) {
        formatted[schema.name] = {
          type: schema.type,
          ...(schema.title && { title: schema.title }),
          ...(schema.description && { description: schema.description }),
          ...(schema.properties && { properties: schema.properties }),
          ...(schema.required && schema.required.length > 0 && { required: schema.required }),
          ...(schema.format && { format: schema.format }),
          ...(schema.enum && { enum: schema.enum }),
          ...(schema.deprecated && { deprecated: schema.deprecated })
        };
      }
    }

    return formatted;
  }

  /**
   * Build context section
   * @private
   */
  _buildContext(spec) {
    const context = {};

    // Contact information
    if (spec.info?.contact) {
      context.contact = spec.info.contact;
    }

    // Server URLs
    if (spec.servers && spec.servers.length > 0) {
      context.servers = spec.servers.map(s => ({
        url: s.url,
        ...(s.description && { description: s.description })
      }));
    }

    // External documentation
    if (spec.externalDocs) {
      context.documentation = {
        url: spec.externalDocs.url,
        ...(spec.externalDocs.description && { description: spec.externalDocs.description })
      };
    }

    // License
    if (spec.info?.license) {
      context.license = {
        name: spec.info.license.name,
        ...(spec.info.license.url && { url: spec.info.license.url })
      };
    }

    return context;
  }

  /**
   * Build capabilities from tags
   * @private
   */
  _buildCapabilities(spec) {
    if (!spec.tags || spec.tags.length === 0) {
      return null;
    }

    const capabilities = {};

    for (const tag of spec.tags) {
      capabilities[tag.name] = {
        description: tag.description || `Operations related to ${tag.name}`,
        ...(tag.externalDocs && { externalDocs: tag.externalDocs })
      };
    }

    return capabilities;
  }

  /**
   * Build metadata section
   * @private
   */
  _buildMetadata(spec, parsedSpec) {
    const metadata = {
      status: this.options.status,
      openapi_version: spec.openapi || spec.swagger,
    };

    // Add hash if available
    if (parsedSpec.hash) {
      metadata.spec_hash = parsedSpec.hash;
    }

    // Add parse metadata
    if (parsedSpec.metadata) {
      metadata.parsed_at = parsedSpec.metadata.parsedAt;
      metadata.source_type = parsedSpec.metadata.sourceType;
    }

    return metadata;
  }

  /**
   * Build provenance section
   * @private
   */
  _buildProvenance(parsedSpec) {
    return {
      parser: 'OpenAPIParser',
      parser_version: '1.0.0',
      parsed_at: parsedSpec.metadata?.parsedAt || new Date().toISOString(),
      spec_version: parsedSpec.version,
      spec_hash: parsedSpec.hash || null,
      source: parsedSpec.metadata?.source || null,
      source_type: parsedSpec.metadata?.sourceType || 'unknown'
    };
  }

  /**
   * Generate service URN
   * @private
   */
  _generateServiceURN(service) {
    const serviceName = service.name || 'api';
    const serviceSlug = this._slugify(serviceName);
    const version = this._normalizeVersion(service.version);

    const baseUrn = `urn:proto:api:${serviceSlug}/service`;
    return version ? `${baseUrn}@${version}` : baseUrn;
  }

  /**
   * Generate endpoint URN
   * @private
   */
  _generateEndpointURN(service, method, path, endpoint) {
    const serviceName = service.name || 'api';
    const serviceSlug = this._slugify(serviceName);
    const version = this._normalizeVersion(service.version);
    const methodPart = method.toLowerCase();

    // Prefer operationId if available
    if (endpoint.operationId) {
      const opSlug = this._slugify(endpoint.operationId);
      const baseUrn = `urn:proto:api.endpoint:${serviceSlug}/op/${opSlug}`;
      return version ? `${baseUrn}@${version}` : baseUrn;
    }

    // Otherwise use path + method
    const normalizedPath = this._normalizePathForUrn(path);
    const id = `route/${normalizedPath}-${methodPart}`;
    const baseUrn = `urn:proto:api.endpoint:${serviceSlug}/${id}`;
    return version ? `${baseUrn}@${version}` : baseUrn;
  }

  /**
   * Normalize path for URN
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
      .join('.')
      .toLowerCase();
  }

  /**
   * Normalize version for URN (semver only)
   * @private
   */
  _normalizeVersion(version) {
    if (!version || typeof version !== 'string') {
      return null;
    }

    const normalized = version.trim().replace(/^v/i, '');
    return /^\d+\.\d+\.\d+$/.test(normalized) ? normalized : null;
  }

  /**
   * Slugify string
   * @private
   */
  _slugify(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

/**
 * ProtocolManifest type definition
 * @typedef {Object} ProtocolManifest
 * @property {Object} service - Service identity
 * @property {Object} interface - API interface (endpoints + auth)
 * @property {Object} metadata - Manifest metadata
 * @property {Object} [validation] - Validation schemas
 * @property {Object} [context] - Context information
 * @property {Object} [capabilities] - Service capabilities
 * @property {Object} [provenance] - Provenance tracking
 */

export { ManifestConverter };
