/**
 * Schema traversal and extraction utilities for AsyncAPI messages
 */

/**
 * Traverse schema recursively and apply callback to each field
 * @param {Object} schema - AsyncAPI schema object
 * @param {Function} callback - Callback(field, path) => result
 * @param {string} path - Current path (for recursion)
 * @returns {Array} Array of callback results
 */
function traverseSchema(schema, callback, path = '') {
  const results = [];

  if (!schema) return results;

  // Handle both AsyncAPI parser objects and plain objects
  const schemaData = schema.json ? schema.json() : schema;
  const type = getSchemaType(schema);

  if (type === 'object') {
    const properties = getSchemaProperties(schema);
    const entries = Object.entries(properties);

    for (const [key, prop] of entries) {
      const fieldPath = path ? `${path}.${key}` : key;
      const subResults = traverseSchema(prop, callback, fieldPath);

      // Ensure subResults is an array before spreading
      if (Array.isArray(subResults)) {
        results.push(...subResults);
      }
    }
  } else if (type === 'array') {
    const items = getSchemaItems(schema);
    if (items) {
      const subResults = traverseSchema(items, callback, `${path}[]`);

      // Ensure subResults is an array before spreading
      if (Array.isArray(subResults)) {
        results.push(...subResults);
      }
    }
  } else {
    // Leaf node - apply callback
    const result = callback(schema, path);
    if (result) results.push(result);
  }

  return results;
}

/**
 * Extract payload schema from messages
 * @param {Array} messages - Array of message objects
 * @returns {Object} Combined payload schema
 */
function extractPayloadSchema(messages) {
  if (messages.length === 0) {
    return { type: 'object', properties: {} };
  }

  // Use first message payload as primary schema
  const primaryMessage = messages[0];
  const payload = primaryMessage.payload();

  if (!payload) {
    return { type: 'object', properties: {} };
  }

  // Convert to plain JSON schema
  return payload.json ? payload.json() : payload;
}

/**
 * Get schema type (handles both parser objects and plain objects)
 * @param {Object} schema - Schema object
 * @returns {string} Schema type
 */
function getSchemaType(schema) {
  try {
    if (schema.type && typeof schema.type === 'function') {
      return schema.type();
    }
    const schemaData = schema.json ? schema.json() : schema;
    return schemaData.type || 'unknown';
  } catch (error) {
    return 'unknown';
  }
}

/**
 * Get schema properties (handles both parser objects and plain objects)
 * @param {Object} schema - Schema object
 * @returns {Object} Schema properties
 */
function getSchemaProperties(schema) {
  try {
    if (schema.properties && typeof schema.properties === 'function') {
      const props = schema.properties();
      if (!props) {
        return {};
      }

      // Convert Map to object if needed
      if (props instanceof Map) {
        const result = {};
        for (const [key, value] of props.entries()) {
          result[key] = value;
        }
        return result;
      }

      if (typeof props.toJSON === 'function') {
        return props.toJSON();
      }

      if (typeof props === 'object') {
        return props;
      }
    }
    const schemaData = schema.json ? schema.json() : schema;
    return schemaData.properties || {};
  } catch (error) {
    return {};
  }
}

/**
 * Get schema items (for array types)
 * @param {Object} schema - Schema object
 * @returns {Object|null} Items schema
 */
function getSchemaItems(schema) {
  try {
    if (schema.items && typeof schema.items === 'function') {
      return schema.items();
    }
    const schemaData = schema.json ? schema.json() : schema;
    return schemaData.items || null;
  } catch (error) {
    return null;
  }
}

/**
 * Extract all field paths from schema
 * @param {Object} schema - Schema object
 * @returns {Array} Array of field paths
 */
function extractFieldPaths(schema) {
  const paths = [];

  traverseSchema(schema, (field, path) => {
    if (path) {
      paths.push(path);
    }
    return null;
  });

  return paths;
}

/**
 * Count total fields in schema
 * @param {Object} schema - Schema object
 * @returns {number} Field count
 */
function countSchemaFields(schema) {
  let count = 0;

  traverseSchema(schema, (field, path) => {
    if (path) count++;
    return null;
  });

  return count;
}

/**
 * Merge multiple schemas (for oneOf/anyOf/allOf handling)
 * @param {Array} schemas - Array of schema objects
 * @returns {Object} Merged schema
 */
function mergeSchemas(schemas) {
  if (schemas.length === 0) {
    return { type: 'object', properties: {} };
  }

  if (schemas.length === 1) {
    return schemas[0].json ? schemas[0].json() : schemas[0];
  }

  // Simple merge: combine all properties
  const merged = {
    type: 'object',
    properties: {}
  };

  for (const schema of schemas) {
    const schemaData = schema.json ? schema.json() : schema;
    if (schemaData.properties) {
      Object.assign(merged.properties, schemaData.properties);
    }
  }

  return merged;
}

/**
 * Extract schema format information
 * @param {Object} schema - Schema object
 * @returns {Object} Format information
 */
function extractSchemaFormat(schema) {
  const schemaData = schema.json ? schema.json() : schema;

  return {
    type: schemaData.type,
    format: schemaData.format,
    contentType: schemaData.contentMediaType || schemaData.contentType,
    encoding: schemaData.contentEncoding
  };
}

module.exports = {
  traverseSchema,
  extractPayloadSchema,
  getSchemaType,
  getSchemaProperties,
  getSchemaItems,
  extractFieldPaths,
  countSchemaFields,
  mergeSchemas,
  extractSchemaFormat
};
