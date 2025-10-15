/**
 * Parser Error Codes Registry
 * Comprehensive error taxonomy for OpenAPI parser operations
 *
 * Code Format: DOMAIN_NNN where:
 * - DOMAIN: Error category (OPENAPI, REF, SCHEMA, NET, PARSE)
 * - NNN: Sequential number within domain
 *
 * Severity Levels:
 * - ERROR: Blocks parsing, unrecoverable
 * - WARN: Parsing continues, may affect quality
 * - INFO: Advisory, parsing unaffected
 */

const ERROR_CODES = {
  // ==================== OpenAPI Spec Validation (100-199) ====================
  OPENAPI_001: {
    code: 'OPENAPI_001',
    message: 'Invalid or unsupported OpenAPI version',
    severity: 'ERROR',
    recoverable: false,
    suggestion: 'Ensure OpenAPI version is 3.0.x or 3.1.x'
  },

  OPENAPI_002: {
    code: 'OPENAPI_002',
    message: 'Missing required field',
    severity: 'ERROR',
    recoverable: false,
    suggestion: 'Add the required field according to OpenAPI specification'
  },

  OPENAPI_003: {
    code: 'OPENAPI_003',
    message: 'Invalid spec structure',
    severity: 'ERROR',
    recoverable: false,
    suggestion: 'Validate spec against OpenAPI JSON Schema'
  },

  OPENAPI_004: {
    code: 'OPENAPI_004',
    message: 'Deprecated field usage',
    severity: 'WARN',
    recoverable: true,
    suggestion: 'Update to use current OpenAPI 3.x fields'
  },

  // ==================== Reference Resolution (200-299) ====================
  REF_001: {
    code: 'REF_001',
    message: 'External reference resolution failed',
    severity: 'ERROR',
    recoverable: true,
    suggestion: 'Check that the external resource is accessible'
  },

  REF_002: {
    code: 'REF_002',
    message: 'Circular reference detected',
    severity: 'WARN',
    recoverable: true,
    suggestion: 'Enable allowCircular option or refactor schema to break cycle'
  },

  REF_003: {
    code: 'REF_003',
    message: 'Invalid reference URI format',
    severity: 'ERROR',
    recoverable: false,
    suggestion: 'Ensure $ref follows RFC 3986 URI format'
  },

  REF_004: {
    code: 'REF_004',
    message: 'Reference target not found',
    severity: 'ERROR',
    recoverable: false,
    suggestion: 'Verify the reference path points to an existing component'
  },

  REF_005: {
    code: 'REF_005',
    message: 'Maximum reference depth exceeded',
    severity: 'ERROR',
    recoverable: false,
    suggestion: 'Reduce reference nesting or increase maxRefDepth option'
  },

  REF_006: {
    code: 'REF_006',
    message: 'Relative reference resolution failed',
    severity: 'ERROR',
    recoverable: true,
    suggestion: 'Ensure base URL is correctly configured'
  },

  REF_007: {
    code: 'REF_007',
    message: 'External reference timeout',
    severity: 'ERROR',
    recoverable: true,
    suggestion: 'Increase timeout or check network connectivity'
  },

  // ==================== Schema Validation (300-399) ====================
  SCHEMA_001: {
    code: 'SCHEMA_001',
    message: 'Invalid schema definition',
    severity: 'ERROR',
    recoverable: false,
    suggestion: 'Validate schema against JSON Schema Draft 7 or OAS 3.1'
  },

  SCHEMA_002: {
    code: 'SCHEMA_002',
    message: 'Unsupported schema feature',
    severity: 'WARN',
    recoverable: true,
    suggestion: 'Some schema features may not be fully supported'
  },

  SCHEMA_003: {
    code: 'SCHEMA_003',
    message: 'Schema composition error (allOf/oneOf/anyOf)',
    severity: 'ERROR',
    recoverable: false,
    suggestion: 'Check schema composition for conflicts'
  },

  SCHEMA_004: {
    code: 'SCHEMA_004',
    message: 'Discriminator mapping error',
    severity: 'ERROR',
    recoverable: false,
    suggestion: 'Verify discriminator property exists in all schema variants'
  },

  // ==================== Network Errors (400-499) ====================
  NET_001: {
    code: 'NET_001',
    message: 'Network request timeout',
    severity: 'ERROR',
    recoverable: true,
    suggestion: 'Check network connectivity and increase timeout if needed'
  },

  NET_002: {
    code: 'NET_002',
    message: 'Connection refused',
    severity: 'ERROR',
    recoverable: true,
    suggestion: 'Verify the remote server is accessible and running'
  },

  NET_003: {
    code: 'NET_003',
    message: 'TLS/SSL certificate error',
    severity: 'ERROR',
    recoverable: true,
    suggestion: 'Verify SSL certificate or use rejectUnauthorized option'
  },

  NET_004: {
    code: 'NET_004',
    message: 'HTTP error response',
    severity: 'ERROR',
    recoverable: true,
    suggestion: 'Check HTTP status code and response body for details'
  },

  NET_005: {
    code: 'NET_005',
    message: 'DNS resolution failed',
    severity: 'ERROR',
    recoverable: true,
    suggestion: 'Verify hostname is correct and DNS is functional'
  },

  NET_006: {
    code: 'NET_006',
    message: 'Maximum redirects exceeded',
    severity: 'ERROR',
    recoverable: true,
    suggestion: 'Check for redirect loops or increase maxRedirects'
  },

  // ==================== Parsing Errors (500-599) ====================
  PARSE_001: {
    code: 'PARSE_001',
    message: 'JSON/YAML syntax error',
    severity: 'ERROR',
    recoverable: false,
    suggestion: 'Fix syntax errors in the OpenAPI specification'
  },

  PARSE_002: {
    code: 'PARSE_002',
    message: 'Character encoding error',
    severity: 'ERROR',
    recoverable: false,
    suggestion: 'Ensure file is UTF-8 encoded'
  },

  PARSE_003: {
    code: 'PARSE_003',
    message: 'File not found',
    severity: 'ERROR',
    recoverable: false,
    suggestion: 'Verify file path is correct and file exists'
  },

  PARSE_004: {
    code: 'PARSE_004',
    message: 'File read permission denied',
    severity: 'ERROR',
    recoverable: false,
    suggestion: 'Check file permissions'
  },

  PARSE_005: {
    code: 'PARSE_005',
    message: 'Stream processing error',
    severity: 'ERROR',
    recoverable: false,
    suggestion: 'Check stream source and format'
  },

  PARSE_006: {
    code: 'PARSE_006',
    message: 'Memory limit exceeded',
    severity: 'ERROR',
    recoverable: false,
    suggestion: 'Increase memory allocation or use streaming mode'
  },

  // ==================== General Errors (600-699) ====================
  GENERAL_001: {
    code: 'GENERAL_001',
    message: 'Unknown error occurred',
    severity: 'ERROR',
    recoverable: false,
    suggestion: 'Check logs for more details'
  },

  GENERAL_002: {
    code: 'GENERAL_002',
    message: 'Operation cancelled by user',
    severity: 'INFO',
    recoverable: true,
    suggestion: null
  },

  GENERAL_003: {
    code: 'GENERAL_003',
    message: 'Feature not implemented',
    severity: 'WARN',
    recoverable: true,
    suggestion: 'This feature is planned for a future release'
  }
};

/**
 * Get error metadata by code
 * @param {string} code - Error code (e.g., 'REF_001')
 * @returns {Object} Error metadata
 */
function getErrorMeta(code) {
  return ERROR_CODES[code] || {
    code: 'GENERAL_001',
    message: 'Unknown error occurred',
    severity: 'ERROR',
    recoverable: false,
    suggestion: `Error code ${code} not found in registry`
  };
}

/**
 * Get all error codes for a domain
 * @param {string} domain - Domain prefix (e.g., 'REF', 'SCHEMA')
 * @returns {Object[]} Array of error metadata
 */
function getErrorsByDomain(domain) {
  return Object.values(ERROR_CODES).filter(err => err.code.startsWith(domain));
}

/**
 * Get all error codes by severity
 * @param {string} severity - 'ERROR' | 'WARN' | 'INFO'
 * @returns {Object[]} Array of error metadata
 */
function getErrorsBySeverity(severity) {
  return Object.values(ERROR_CODES).filter(err => err.severity === severity);
}

export {
  ERROR_CODES,
  getErrorMeta,
  getErrorsByDomain,
  getErrorsBySeverity
};
