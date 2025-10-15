/**
 * Endpoint Extractor
 * Extracts endpoints with full metadata from OpenAPI specs
 *
 * Extracts:
 * - Paths and operations (GET, POST, PUT, PATCH, DELETE, etc.)
 * - Parameters (path, query, header, cookie)
 * - Request bodies and content types
 * - Responses with schemas
 * - Security requirements
 * - Operation metadata (tags, summary, description)
 */

/**
 * Endpoint extraction with 95%+ accuracy target
 */
class EndpointExtractor {
  constructor(options = {}) {
    this.options = {
      includeDeprecated: true,    // Include deprecated endpoints
      includeOptions: false,       // Include OPTIONS/HEAD methods
      extractExamples: true,       // Extract request/response examples
      ...options
    };
  }

  /**
   * Extract all endpoints from OpenAPI spec
   * @param {Object} spec - Parsed OpenAPI specification
   * @returns {Endpoint[]}
   */
  extract(spec) {
    const endpoints = [];
    const paths = spec.paths || {};

    for (const [path, pathItem] of Object.entries(paths)) {
      // Skip if pathItem is not an object (can happen with $ref issues)
      if (!pathItem || typeof pathItem !== 'object') {
        continue;
      }

      // Extract path-level parameters (shared across operations)
      const pathParameters = pathItem.parameters || [];

      // Process each HTTP method
      const methods = this._getHttpMethods(pathItem);

      for (const method of methods) {
        const operation = pathItem[method];
        if (!operation || typeof operation !== 'object') {
          continue;
        }

        // Skip deprecated endpoints if configured
        if (operation.deprecated && !this.options.includeDeprecated) {
          continue;
        }

        const endpoint = this._extractEndpoint(
          path,
          method,
          operation,
          pathParameters,
          spec
        );

        if (endpoint) {
          endpoints.push(endpoint);
        }
      }
    }

    return endpoints;
  }

  /**
   * Extract single endpoint with full metadata
   * @private
   */
  _extractEndpoint(path, method, operation, pathParameters, spec) {
    const endpoint = {
      path,
      method: method.toUpperCase(),
      operationId: operation.operationId || null,
      summary: operation.summary || null,
      description: operation.description || null,
      deprecated: operation.deprecated || false,
      tags: operation.tags || [],
    };

    // Extract parameters
    const parameters = this._extractParameters(operation, pathParameters);
    if (parameters.length > 0) {
      endpoint.parameters = parameters;
    }

    // Extract request body
    const requestBody = this._extractRequestBody(operation);
    if (requestBody) {
      endpoint.requestBody = requestBody;
    }

    // Extract responses
    const responses = this._extractResponses(operation);
    if (responses.length > 0) {
      endpoint.responses = responses;
    }

    // Extract security requirements
    const security = this._extractSecurity(operation, spec);
    if (security.length > 0) {
      endpoint.security = security;
    }

    // Extract servers (operation-level overrides)
    if (operation.servers && operation.servers.length > 0) {
      endpoint.servers = operation.servers.map(s => ({
        url: s.url,
        description: s.description || null
      }));
    }

    // Extract external docs
    if (operation.externalDocs) {
      endpoint.externalDocs = {
        url: operation.externalDocs.url,
        description: operation.externalDocs.description || null
      };
    }

    // Extract callbacks (webhook-style patterns)
    if (operation.callbacks) {
      endpoint.callbacks = Object.keys(operation.callbacks);
    }

    return endpoint;
  }

  /**
   * Extract and merge parameters from operation and path level
   * @private
   */
  _extractParameters(operation, pathParameters) {
    const params = [];
    const seen = new Set();

    // Merge path-level and operation-level parameters
    const allParams = [
      ...(pathParameters || []),
      ...(operation.parameters || [])
    ];

    for (const param of allParams) {
      // Skip duplicates (operation params override path params)
      const key = `${param.in}-${param.name}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const parameter = {
        name: param.name,
        in: param.in, // path, query, header, cookie
        required: param.required || param.in === 'path', // path params always required
        description: param.description || null,
        deprecated: param.deprecated || false,
        schema: param.schema || null,
        style: param.style || null,
        explode: param.explode !== undefined ? param.explode : null,
        allowEmptyValue: param.allowEmptyValue || false,
      };

      // Extract examples if enabled
      if (this.options.extractExamples) {
        if (param.example !== undefined) {
          parameter.example = param.example;
        }
        if (param.examples) {
          parameter.examples = param.examples;
        }
      }

      // Remove null values to keep output clean
      Object.keys(parameter).forEach(key => {
        if (parameter[key] === null) {
          delete parameter[key];
        }
      });

      params.push(parameter);
    }

    return params;
  }

  /**
   * Extract request body information
   * @private
   */
  _extractRequestBody(operation) {
    const requestBody = operation.requestBody;
    if (!requestBody) {
      return null;
    }

    const body = {
      required: requestBody.required || false,
      description: requestBody.description || null,
      content: {}
    };

    // Extract content types and schemas
    const content = requestBody.content || {};
    for (const [contentType, mediaType] of Object.entries(content)) {
      body.content[contentType] = {
        schema: mediaType.schema || null,
      };

      // Extract examples if enabled
      if (this.options.extractExamples) {
        if (mediaType.example !== undefined) {
          body.content[contentType].example = mediaType.example;
        }
        if (mediaType.examples) {
          body.content[contentType].examples = mediaType.examples;
        }
      }

      // Extract encoding info for multipart/form-data
      if (mediaType.encoding) {
        body.content[contentType].encoding = mediaType.encoding;
      }
    }

    return body;
  }

  /**
   * Extract responses with schemas
   * @private
   */
  _extractResponses(operation) {
    const responses = [];
    const operationResponses = operation.responses || {};

    for (const [statusCode, response] of Object.entries(operationResponses)) {
      // Skip 'default' for now, handle it separately
      if (statusCode === 'default') {
        continue;
      }

      const resp = {
        statusCode,
        description: response.description || null,
        headers: {},
        content: {}
      };

      // Extract response headers
      if (response.headers) {
        for (const [headerName, header] of Object.entries(response.headers)) {
          resp.headers[headerName] = {
            description: header.description || null,
            schema: header.schema || null,
            required: header.required || false
          };
        }
      }

      // Extract response content types and schemas
      const content = response.content || {};
      for (const [contentType, mediaType] of Object.entries(content)) {
        resp.content[contentType] = {
          schema: mediaType.schema || null,
        };

        // Extract examples if enabled
        if (this.options.extractExamples) {
          if (mediaType.example !== undefined) {
            resp.content[contentType].example = mediaType.example;
          }
          if (mediaType.examples) {
            resp.content[contentType].examples = mediaType.examples;
          }
        }
      }

      // Clean up empty objects
      if (Object.keys(resp.headers).length === 0) {
        delete resp.headers;
      }
      if (Object.keys(resp.content).length === 0) {
        delete resp.content;
      }

      responses.push(resp);
    }

    // Handle default response if present
    if (operationResponses.default) {
      const defaultResp = operationResponses.default;
      responses.push({
        statusCode: 'default',
        description: defaultResp.description || 'Default response',
        content: defaultResp.content || {}
      });
    }

    return responses;
  }

  /**
   * Extract security requirements
   * @private
   */
  _extractSecurity(operation, spec) {
    // Operation-level security overrides global security
    const securityReqs = operation.security !== undefined
      ? operation.security
      : spec.security || [];

    const security = [];

    for (const req of securityReqs) {
      for (const [schemeName, scopes] of Object.entries(req)) {
        security.push({
          scheme: schemeName,
          scopes: scopes || []
        });
      }
    }

    return security;
  }

  /**
   * Get HTTP methods from path item
   * @private
   */
  _getHttpMethods(pathItem) {
    const standardMethods = ['get', 'post', 'put', 'patch', 'delete'];
    const optionalMethods = ['options', 'head', 'trace'];

    const methods = standardMethods.filter(m => pathItem[m]);

    if (this.options.includeOptions) {
      methods.push(...optionalMethods.filter(m => pathItem[m]));
    }

    return methods;
  }
}

/**
 * Endpoint type definition
 * @typedef {Object} Endpoint
 * @property {string} path - URL path pattern
 * @property {string} method - HTTP method (uppercase)
 * @property {string|null} operationId - Operation identifier
 * @property {string|null} summary - Short summary
 * @property {string|null} description - Detailed description
 * @property {boolean} deprecated - Whether endpoint is deprecated
 * @property {string[]} tags - Operation tags
 * @property {Parameter[]} [parameters] - Request parameters
 * @property {RequestBody} [requestBody] - Request body spec
 * @property {Response[]} [responses] - Response definitions
 * @property {Security[]} [security] - Security requirements
 * @property {Server[]} [servers] - Server overrides
 * @property {ExternalDocs} [externalDocs] - External documentation
 * @property {string[]} [callbacks] - Callback names
 */

export { EndpointExtractor };
