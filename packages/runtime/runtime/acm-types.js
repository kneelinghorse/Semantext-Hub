/**
 * ACM (Agent Capability Manifest) Types and Error Classes
 * 
 * Defines the interfaces, types, and error classes for ACM generation and validation.
 * Provides typed error handling with structured error information.
 */

/**
 * ACM Error base class
 */
export class ACMError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = 'ACMError';
    this.cause = cause;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * ACM Validation Error
 * Thrown when ACM manifest validation fails
 */
export class ACMValidationError extends ACMError {
  constructor(message, cause = null) {
    super(message, cause);
    this.name = 'ACMValidationError';
  }
}

/**
 * ACM Schema Error
 * Thrown when ACM schema validation fails
 */
export class ACMSchemaError extends ACMError {
  constructor(message, cause = null) {
    super(message, cause);
    this.name = 'ACMSchemaError';
  }
}

/**
 * Default configuration for ACM generator
 */
export const DEFAULT_CONFIG = {
  schemaVersion: 'v1',
  validateSchema: true,
  enableLogging: true
};

/**
 * Request ID generator for tracking
 * @returns {string} Unique request ID
 */
export function generateRequestId() {
  return `acm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create structured log entry for ACM operations
 * @param {string} reqId - Request ID
 * @param {string} operation - Operation name
 * @param {Object} data - Log data
 * @returns {Object} Structured log entry
 */
export function createLogEntry(reqId, operation, data = {}) {
  return {
    timestamp: new Date().toISOString(),
    reqId,
    operation,
    ...data
  };
}
