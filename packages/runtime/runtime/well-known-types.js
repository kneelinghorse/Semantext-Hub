/**
 * Well-Known Server Types and Error Classes
 * 
 * Defines the interfaces, types, and error classes for the well-known server.
 * Provides typed error handling with structured error information.
 */

/**
 * Well-Known Error base class
 */
export class WellKnownError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = 'WellKnownError';
    this.cause = cause;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Well-Known Server Error
 * Thrown when server operations fail
 */
export class WellKnownServerError extends WellKnownError {
  constructor(message, cause = null) {
    super(message, cause);
    this.name = 'WellKnownServerError';
  }
}

/**
 * Well-Known Validation Error
 * Thrown when request validation fails
 */
export class WellKnownValidationError extends WellKnownError {
  constructor(message, cause = null) {
    super(message, cause);
    this.name = 'WellKnownValidationError';
  }
}

/**
 * Default configuration for well-known server
 */
export const DEFAULT_CONFIG = {
  port: 3000,
  host: 'localhost',
  cors: {
    origin: '*',
    methods: ['GET', 'OPTIONS'],
    headers: ['Content-Type', 'Authorization']
  },
  enableLogging: true
};

/**
 * Request ID generator for tracking
 * @returns {string} Unique request ID
 */
export function generateRequestId() {
  return `wk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create structured log entry for well-known operations
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
