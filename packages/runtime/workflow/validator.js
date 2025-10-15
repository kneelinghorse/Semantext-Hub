/**
 * Manifest Validator
 *
 * Validates protocol manifest structure, URN formats, and required fields.
 * Returns validation results with errors, warnings, and suggestions.
 */

import { isValidURN as isProtocolURN } from '../../protocols/core/graph/urn-utils.js';
/**
 * Validation result structure
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether manifest passes validation
 * @property {Array<Object>} errors - Critical issues preventing approval
 * @property {Array<Object>} warnings - Non-critical issues
 * @property {Array<Object>} suggestions - Optional improvements
 */

/**
 * Validate a protocol manifest
 *
 * @param {Object} manifest - The manifest to validate
 * @returns {ValidationResult} Validation results
 */
function validateManifest(manifest) {
  const errors = [];
  const warnings = [];
  const suggestions = [];

  // Basic structure validation
  if (!manifest || typeof manifest !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'root', message: 'Manifest must be a valid JSON object' }],
      warnings: [],
      suggestions: []
    };
  }

  // Required top-level fields based on contract type
  validateRequiredFields(manifest, errors, warnings);

  // Metadata validation
  validateMetadata(manifest.metadata, errors, warnings, suggestions);

  // Catalog validation (API contracts)
  if (manifest.catalog) {
    validateCatalog(manifest.catalog, errors, warnings, suggestions);
  }

  // Service validation (Data contracts)
  if (manifest.service) {
    validateService(manifest.service, errors, warnings, suggestions);
  }

  // Workflow validation (Workflow contracts)
  if (manifest.workflow) {
    validateWorkflow(manifest.workflow, errors, warnings, suggestions);
  }

  // URN format validation
  validateURNs(manifest, errors, warnings);

  // Provenance validation
  validateProvenance(manifest.provenance, errors, warnings, suggestions);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions
  };
}

/**
 * Validate required fields based on contract type
 */
function validateRequiredFields(manifest, errors, warnings) {
  // Must have either catalog (API), service (Data), or workflow section
  if (!manifest.catalog && !manifest.service && !manifest.workflow) {
    errors.push({
      field: 'contract_type',
      message: 'Manifest must contain either "catalog" (API contract), "service" (Data contract), or "workflow" (Workflow contract)'
    });
    return;
  }

  // Cannot have multiple contract types
  const contractTypes = [];
  if (manifest.catalog) contractTypes.push('catalog');
  if (manifest.service) contractTypes.push('service');
  if (manifest.workflow) contractTypes.push('workflow');
  
  if (contractTypes.length > 1) {
    errors.push({
      field: 'contract_type',
      message: `Manifest cannot contain multiple contract types: ${contractTypes.join(', ')} - must be only one contract type`
    });
  }

  // Metadata is required
  if (!manifest.metadata) {
    errors.push({
      field: 'metadata',
      message: 'Missing required field: metadata'
    });
  }
}

/**
 * Validate metadata section
 */
function validateMetadata(metadata, errors, warnings, suggestions) {
  if (!metadata) {
    return; // Already caught in required fields
  }

  // Status validation
  const validStatuses = ['draft', 'approved', 'deprecated'];
  if (!metadata.status) {
    errors.push({
      field: 'metadata.status',
      message: 'Missing required field: metadata.status'
    });
  } else if (!validStatuses.includes(metadata.status)) {
    errors.push({
      field: 'metadata.status',
      message: `Invalid status "${metadata.status}". Must be one of: ${validStatuses.join(', ')}`
    });
  }

  // Version validation
  if (metadata.version) {
    if (!isValidVersion(metadata.version)) {
      warnings.push({
        field: 'metadata.version',
        message: `Version "${metadata.version}" does not follow semantic versioning (e.g., "1.0.0")`
      });
    }
  } else {
    suggestions.push({
      field: 'metadata.version',
      message: 'Consider adding a version field to track manifest evolution'
    });
  }

  // Source validation
  if (!metadata.source) {
    warnings.push({
      field: 'metadata.source',
      message: 'Missing source information - unable to track manifest origin'
    });
  } else {
    if (!metadata.source.type) {
      warnings.push({
        field: 'metadata.source.type',
        message: 'Source type not specified'
      });
    }
    if (!metadata.source.imported_at) {
      warnings.push({
        field: 'metadata.source.imported_at',
        message: 'Import timestamp not recorded'
      });
    }
  }

  // Approved_at validation
  if (metadata.status === 'approved' && !metadata.approved_at) {
    warnings.push({
      field: 'metadata.approved_at',
      message: 'Approved manifest should have approved_at timestamp'
    });
  }

  if (metadata.status === 'draft' && metadata.approved_at) {
    warnings.push({
      field: 'metadata.approved_at',
      message: 'Draft manifest should not have approved_at timestamp'
    });
  }
}

/**
 * Validate catalog section (API contracts)
 */
function validateCatalog(catalog, errors, warnings, suggestions) {
  if (!catalog) return;

  // Type validation
  if (!catalog.type) {
    errors.push({
      field: 'catalog.type',
      message: 'Missing required field: catalog.type'
    });
  }

  // Endpoints validation
  if (!catalog.endpoints || !Array.isArray(catalog.endpoints)) {
    errors.push({
      field: 'catalog.endpoints',
      message: 'Missing or invalid endpoints array'
    });
  } else {
    catalog.endpoints.forEach((endpoint, idx) => {
      validateEndpoint(endpoint, idx, errors, warnings);
    });

    if (catalog.endpoints.length === 0) {
      warnings.push({
        field: 'catalog.endpoints',
        message: 'No endpoints defined in catalog'
      });
    }
  }
}

/**
 * Validate workflow section (Workflow contracts)
 */
function validateWorkflow(workflow, errors, warnings, suggestions) {
  if (!workflow) return;

  // Version validation
  if (!workflow.version) {
    errors.push({
      field: 'workflow.version',
      message: 'Missing required field: workflow.version'
    });
  }

  // Description validation
  if (!workflow.description) {
    warnings.push({
      field: 'workflow.description',
      message: 'Missing workflow description'
    });
  }

  // Basic workflow structure validation
  if (workflow.version && typeof workflow.version !== 'string') {
    errors.push({
      field: 'workflow.version',
      message: 'Workflow version must be a string'
    });
  }
}

/**
 * Validate individual endpoint
 */
function validateEndpoint(endpoint, index, errors, warnings) {
  const prefix = `catalog.endpoints[${index}]`;

  if (!endpoint.id) {
    errors.push({
      field: `${prefix}.id`,
      message: 'Endpoint missing required id field'
    });
  } else if (!isValidURN(endpoint.id)) {
    errors.push({
      field: `${prefix}.id`,
      message: `Invalid URN format: "${endpoint.id}"`
    });
  }

  if (!endpoint.pattern) {
    errors.push({
      field: `${prefix}.pattern`,
      message: 'Endpoint missing required pattern field'
    });
  }

  if (!endpoint.method) {
    errors.push({
      field: `${prefix}.method`,
      message: 'Endpoint missing required method field'
    });
  } else {
    const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    if (!validMethods.includes(endpoint.method.toUpperCase())) {
      warnings.push({
        field: `${prefix}.method`,
        message: `Unusual HTTP method: "${endpoint.method}"`
      });
    }
  }
}

/**
 * Validate service section (Data contracts)
 */
function validateService(service, errors, warnings, suggestions) {
  if (!service) return;

  // Name validation
  if (!service.name) {
    errors.push({
      field: 'service.name',
      message: 'Missing required field: service.name'
    });
  }

  // URN validation
  if (!service.urn) {
    errors.push({
      field: 'service.urn',
      message: 'Missing required field: service.urn'
    });
  } else if (!isValidURN(service.urn)) {
    errors.push({
      field: 'service.urn',
      message: `Invalid URN format: "${service.urn}"`
    });
  }

  // Entities validation
  if (!service.entities || !Array.isArray(service.entities)) {
    warnings.push({
      field: 'service.entities',
      message: 'No entities defined in service'
    });
  } else {
    service.entities.forEach((entity, idx) => {
      validateEntity(entity, idx, errors, warnings);
    });
  }
}

/**
 * Validate individual entity
 */
function validateEntity(entity, index, errors, warnings) {
  const prefix = `service.entities[${index}]`;

  if (!entity.id) {
    errors.push({
      field: `${prefix}.id`,
      message: 'Entity missing required id field'
    });
  } else if (!isValidURN(entity.id)) {
    errors.push({
      field: `${prefix}.id`,
      message: `Invalid URN format: "${entity.id}"`
    });
  }

  if (!entity.name) {
    errors.push({
      field: `${prefix}.name`,
      message: 'Entity missing required name field'
    });
  }

  if (!entity.attributes || !Array.isArray(entity.attributes)) {
    warnings.push({
      field: `${prefix}.attributes`,
      message: 'Entity has no attributes defined'
    });
  }
}

/**
 * Validate all URNs in manifest
 */
function validateURNs(manifest, errors, warnings) {
  // Catalog URN
  if (manifest.catalog?.urn) {
    if (!isValidURN(manifest.catalog.urn)) {
      errors.push({
        field: 'catalog.urn',
        message: `Invalid URN format: "${manifest.catalog.urn}"`
      });
    }
  }

  // Service URN
  if (manifest.service?.urn) {
    if (!isValidURN(manifest.service.urn)) {
      errors.push({
        field: 'service.urn',
        message: `Invalid URN format: "${manifest.service.urn}"`
      });
    }
  }
}

/**
 * Validate provenance section
 */
function validateProvenance(provenance, errors, warnings, suggestions) {
  if (!provenance) {
    warnings.push({
      field: 'provenance',
      message: 'Missing provenance information - unable to track manifest lineage'
    });
    return;
  }

  if (!provenance.importer) {
    warnings.push({
      field: 'provenance.importer',
      message: 'Importer not specified'
    });
  }

  if (!provenance.imported_at) {
    warnings.push({
      field: 'provenance.imported_at',
      message: 'Import timestamp not recorded'
    });
  }

  if (!provenance.spec_hash) {
    suggestions.push({
      field: 'provenance.spec_hash',
      message: 'Consider adding spec_hash for change detection'
    });
  }
}

/**
 * Check if string is valid URN format using the ProtocolGraph schema
 * Expected: urn:proto:<kind>:<authority>/<id>[@<version>]
 */
function isValidURN(urn) {
  return isProtocolURN(urn);
}

/**
 * Check if version follows semantic versioning
 */
function isValidVersion(version) {
  if (!version || typeof version !== 'string') {
    return false;
  }

  // Semantic versioning: MAJOR.MINOR.PATCH
  // Also allow pre-release and build metadata
  const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/;
  return semverRegex.test(version);
}

export {
  validateManifest,
  isValidURN,
  isValidVersion
};
