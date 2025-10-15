/**
 * Schema Extractor
 * Extracts schemas from OpenAPI specs with local $ref resolution
 *
 * Features:
 * - Extract component schemas
 * - Resolve local $ref references
 * - Handle allOf, oneOf, anyOf compositions
 * - Build schema dependency tree
 * - Extract inline schemas from endpoints
 */

import { RefResolver } from './ref-resolver.js';

/**
 * Schema extraction with dependency tracking
 */
class SchemaExtractor {
  constructor(options = {}) {
    this.options = {
      resolveRefs: true,          // Resolve local $refs
      includeInline: true,        // Include inline schemas from endpoints
      extractDependencies: true,   // Build dependency tree
      ...options
    };

    this.refResolver = new RefResolver();
  }

  /**
   * Extract all schemas from OpenAPI spec
   * @param {Object} spec - Parsed OpenAPI specification
   * @returns {Schema[]}
   */
  extract(spec) {
    const schemas = [];
    const dependencies = new Map(); // schema name -> dependencies

    // Extract component schemas
    const componentSchemas = spec.components?.schemas || {};

    for (const [schemaName, schema] of Object.entries(componentSchemas)) {
      const extractedSchema = this._extractSchema(
        schemaName,
        schema,
        spec
      );

      if (extractedSchema) {
        schemas.push(extractedSchema);

        // Build dependency tree if enabled
        if (this.options.extractDependencies) {
          const deps = this._extractDependencies(schema, spec);
          dependencies.set(schemaName, deps);
        }
      }
    }

    // Extract inline schemas from paths if enabled
    if (this.options.includeInline) {
      const inlineSchemas = this._extractInlineSchemas(spec);
      schemas.push(...inlineSchemas);
    }

    // Attach dependency tree
    if (this.options.extractDependencies) {
      return schemas.map(schema => ({
        ...schema,
        dependencies: dependencies.get(schema.name) || []
      }));
    }

    return schemas;
  }

  /**
   * Extract single schema with metadata
   * @private
   */
  _extractSchema(name, schema, spec) {
    // Resolve $ref if present
    let resolvedSchema = schema;
    if (this.options.resolveRefs && this.refResolver.isRef(schema)) {
      const refPath = this.refResolver.getRefPath(schema);
      const resolved = this.refResolver.resolve(refPath, spec);
      resolvedSchema = resolved || schema;
    }

    const extracted = {
      name,
      type: resolvedSchema.type || this._inferType(resolvedSchema),
      title: resolvedSchema.title || null,
      description: resolvedSchema.description || null,
      format: resolvedSchema.format || null,
      required: resolvedSchema.required || [],
      properties: resolvedSchema.properties || {},
      additionalProperties: resolvedSchema.additionalProperties,
      nullable: resolvedSchema.nullable || false,
      readOnly: resolvedSchema.readOnly || false,
      writeOnly: resolvedSchema.writeOnly || false,
      deprecated: resolvedSchema.deprecated || false,
    };

    // Handle array types
    if (resolvedSchema.type === 'array') {
      extracted.items = resolvedSchema.items || null;
      extracted.minItems = resolvedSchema.minItems;
      extracted.maxItems = resolvedSchema.maxItems;
      extracted.uniqueItems = resolvedSchema.uniqueItems || false;
    }

    // Handle string constraints
    if (resolvedSchema.type === 'string') {
      extracted.minLength = resolvedSchema.minLength;
      extracted.maxLength = resolvedSchema.maxLength;
      extracted.pattern = resolvedSchema.pattern;
      extracted.enum = resolvedSchema.enum;
    }

    // Handle number constraints
    if (resolvedSchema.type === 'number' || resolvedSchema.type === 'integer') {
      extracted.minimum = resolvedSchema.minimum;
      extracted.maximum = resolvedSchema.maximum;
      extracted.exclusiveMinimum = resolvedSchema.exclusiveMinimum;
      extracted.exclusiveMaximum = resolvedSchema.exclusiveMaximum;
      extracted.multipleOf = resolvedSchema.multipleOf;
    }

    // Handle compositions (allOf, oneOf, anyOf)
    if (resolvedSchema.allOf) {
      extracted.allOf = this._processComposition(resolvedSchema.allOf, spec);
    }
    if (resolvedSchema.oneOf) {
      extracted.oneOf = this._processComposition(resolvedSchema.oneOf, spec);
    }
    if (resolvedSchema.anyOf) {
      extracted.anyOf = this._processComposition(resolvedSchema.anyOf, spec);
    }

    // Handle discriminator for polymorphism
    if (resolvedSchema.discriminator) {
      extracted.discriminator = {
        propertyName: resolvedSchema.discriminator.propertyName,
        mapping: resolvedSchema.discriminator.mapping || null
      };
    }

    // Handle enum
    if (resolvedSchema.enum) {
      extracted.enum = resolvedSchema.enum;
    }

    // Example values
    if (resolvedSchema.example !== undefined) {
      extracted.example = resolvedSchema.example;
    }

    // Default values
    if (resolvedSchema.default !== undefined) {
      extracted.default = resolvedSchema.default;
    }

    // Remove null/undefined values
    Object.keys(extracted).forEach(key => {
      if (extracted[key] === null || extracted[key] === undefined) {
        delete extracted[key];
      }
    });

    return extracted;
  }

  /**
   * Process composition schemas (allOf, oneOf, anyOf)
   * @private
   */
  _processComposition(composition, spec) {
    if (!Array.isArray(composition)) {
      return composition;
    }

    return composition.map(item => {
      if (this.options.resolveRefs && this.refResolver.isRef(item)) {
        const refPath = this.refResolver.getRefPath(item);
        const resolved = this.refResolver.resolve(refPath, spec);
        return resolved || item;
      }
      return item;
    });
  }

  /**
   * Infer schema type from properties
   * @private
   */
  _inferType(schema) {
    if (schema.properties) return 'object';
    if (schema.items) return 'array';
    if (schema.allOf || schema.oneOf || schema.anyOf) return 'composition';
    return 'any';
  }

  /**
   * Extract dependencies (referenced schemas) from a schema
   * @private
   */
  _extractDependencies(schema, spec) {
    const refs = this.refResolver.extractRefs(schema);
    const dependencies = [];

    for (const ref of refs) {
      // Only track component schema references
      if (ref.startsWith('#/components/schemas/')) {
        const schemaName = ref.split('/').pop();
        if (schemaName && !dependencies.includes(schemaName)) {
          dependencies.push(schemaName);
        }
      }
    }

    return dependencies;
  }

  /**
   * Extract inline schemas from path operations
   * @private
   */
  _extractInlineSchemas(spec) {
    const inlineSchemas = [];
    const paths = spec.paths || {};
    let inlineCounter = 0;

    for (const [path, pathItem] of Object.entries(paths)) {
      const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

      for (const method of methods) {
        const operation = pathItem[method];
        if (!operation) continue;

        // Extract from request body
        if (operation.requestBody?.content) {
          for (const [contentType, mediaType] of Object.entries(operation.requestBody.content)) {
            if (mediaType.schema && !this.refResolver.isRef(mediaType.schema)) {
              const schemaName = operation.operationId
                ? `${operation.operationId}_request`
                : `inline_request_${inlineCounter++}`;

              const extracted = this._extractSchema(schemaName, mediaType.schema, spec);
              if (extracted) {
                extracted.inline = true;
                extracted.source = { path, method, type: 'request', contentType };
                inlineSchemas.push(extracted);
              }
            }
          }
        }

        // Extract from responses
        if (operation.responses) {
          for (const [statusCode, response] of Object.entries(operation.responses)) {
            if (response.content) {
              for (const [contentType, mediaType] of Object.entries(response.content)) {
                if (mediaType.schema && !this.refResolver.isRef(mediaType.schema)) {
                  const schemaName = operation.operationId
                    ? `${operation.operationId}_response_${statusCode}`
                    : `inline_response_${inlineCounter++}`;

                  const extracted = this._extractSchema(schemaName, mediaType.schema, spec);
                  if (extracted) {
                    extracted.inline = true;
                    extracted.source = { path, method, type: 'response', statusCode, contentType };
                    inlineSchemas.push(extracted);
                  }
                }
              }
            }
          }
        }
      }
    }

    return inlineSchemas;
  }
}

/**
 * Schema type definition
 * @typedef {Object} Schema
 * @property {string} name - Schema name
 * @property {string} type - Schema type (object, array, string, etc.)
 * @property {string|null} title - Schema title
 * @property {string|null} description - Description
 * @property {string|null} format - Format (e.g., date-time, email)
 * @property {string[]} required - Required property names
 * @property {Object} properties - Schema properties
 * @property {boolean|Object} additionalProperties - Additional properties config
 * @property {boolean} nullable - Whether null is allowed
 * @property {boolean} readOnly - Read-only flag
 * @property {boolean} writeOnly - Write-only flag
 * @property {boolean} deprecated - Deprecated flag
 * @property {string[]} [dependencies] - Referenced schema names
 * @property {boolean} [inline] - Whether schema is inline (not in components)
 * @property {Object} [source] - Source location for inline schemas
 */

export { SchemaExtractor };
