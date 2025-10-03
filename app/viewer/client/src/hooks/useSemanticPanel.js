import { useMemo } from 'react';

/**
 * Semantic Panel Hook
 * Generates semantic metadata for UI components to support inspection overlay (B3.4)
 *
 * This hook returns data attributes that can be spread onto React elements
 * to enable semantic inspection and dogfooding of the protocol system itself.
 *
 * @param {string} urn - Canonical URN identifier (e.g., 'urn:proto:manifest:api-test')
 * @param {object} metadata - Additional context metadata
 * @param {string} metadata.type - Resource type (manifest, validation, graph, etc.)
 * @param {string} metadata.version - Version identifier
 * @param {object} metadata.context - Additional context data
 * @returns {object} Data attributes object to spread onto elements
 *
 * @example
 * const attrs = useSemanticPanel('urn:proto:manifest:api-test', {
 *   type: 'manifest',
 *   version: '1.0.0'
 * });
 * return <div {...attrs}>Content</div>;
 */
export function useSemanticPanel(urn, metadata = {}) {
  return useMemo(() => {
    if (!urn) {
      return {};
    }

    const attributes = {
      'data-semantic-urn': urn,
      'data-semantic-type': metadata.type || 'unknown',
    };

    // Add optional metadata
    if (metadata.version) {
      attributes['data-semantic-version'] = metadata.version;
    }

    if (metadata.context) {
      attributes['data-semantic-context'] = JSON.stringify(metadata.context);
    }

    return attributes;
  }, [urn, metadata.type, metadata.version, metadata.context]);
}

/**
 * Generate semantic attributes for a manifest item
 * @param {object} manifest - Manifest object
 * @returns {object} Semantic attributes
 */
export function manifestSemanticAttrs(manifest, options = {}) {
  if (!manifest || !manifest.id) {
    return {};
  }

  const attrs = {
    'data-semantic-urn': `urn:proto:manifest:${manifest.id}`,
    'data-semantic-type': 'manifest',
    'data-semantic-format': manifest.format || 'unknown',
    'data-semantic-path': manifest.path || '',
  };

  if (options.view) {
    attrs['data-semantic-view'] = options.view;
  }

  if (options.role) {
    attrs['data-semantic-role'] = options.role;
  }

  if (options.section) {
    attrs['data-semantic-section'] = options.section;
  }

  if (options.state) {
    attrs['data-semantic-state'] = options.state;
  }

  if (options.context) {
    attrs['data-semantic-context'] = JSON.stringify(options.context);
  }

  return attrs;
}

/**
 * Generate semantic attributes for a validation result
 * @param {string} manifestId - Manifest ID
 * @param {string} validationType - Type of validation
 * @returns {object} Semantic attributes
 */
export function validationSemanticAttrs(manifestId, validationType = 'schema') {
  return {
    'data-semantic-urn': `urn:proto:validation:${manifestId}`,
    'data-semantic-type': 'validation',
    'data-semantic-validation-type': validationType,
  };
}

/**
 * Generate semantic attributes for a graph node
 * @param {string} nodeId - Node identifier
 * @param {string} nodeType - Type of node
 * @returns {object} Semantic attributes
 */
export function graphNodeSemanticAttrs(nodeId, nodeType = 'unknown') {
  return {
    'data-semantic-urn': `urn:proto:graph:node:${nodeId}`,
    'data-semantic-type': 'graph-node',
    'data-semantic-node-type': nodeType,
  };
}
