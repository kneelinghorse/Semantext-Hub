/**
 * URN Resolver Types and Error Classes
 * 
 * Defines the interfaces, types, and error classes for URN resolution and agent discovery.
 * Provides typed error handling with structured error information.
 */

/**
 * URN Error base class
 */
export class URNError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = 'URNError';
    this.cause = cause;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * URN Resolution Error
 * Thrown when URN resolution fails
 */
export class URNResolutionError extends URNError {
  constructor(message, cause = null, urn = null) {
    super(message, cause);
    this.name = 'URNResolutionError';
    this.urn = urn;
  }
}

/**
 * URN Format Error
 * Thrown when URN format is invalid
 */
export class URNFormatError extends URNError {
  constructor(message, cause = null) {
    super(message, cause);
    this.name = 'URNFormatError';
  }
}

/**
 * Default configuration for URN resolver
 */
export const DEFAULT_CONFIG = {
  cacheTtl: 300000, // 5 minutes
  maxRetries: 3,
  retryDelay: 1000, // 1 second base delay
  retryBackoff: 2, // Exponential backoff multiplier
  enableLogging: true
};

/**
 * Request ID generator for tracking
 * @returns {string} Unique request ID
 */
export function generateRequestId() {
  return `urn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create structured log entry for URN operations
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

/**
 * Parse URN to extract endpoint information
 * @param {string} urn - Agent URN
 * @returns {Object} Parsed URN info
 */
export function parseAgentUrn(urn) {
  // Expected format: urn:agent:domain:name[@version]
  const match = urn.match(/^urn:agent:([^:]+):([^@]+)(?:@(.+))?$/);
  if (!match) {
    throw new URNFormatError(`Invalid agent URN format: ${urn}`);
  }
  
  const [, domain, name, version] = match;
  return {
    domain,
    name,
    version: version || 'latest',
    urn
  };
}

/**
 * Calculate retry delay with exponential backoff
 * @param {number} attempt - Current attempt number (0-based)
 * @param {number} baseDelay - Base delay in ms
 * @param {number} backoff - Backoff multiplier
 * @returns {number} Delay in ms
 */
export function calculateRetryDelay(attempt, baseDelay = DEFAULT_CONFIG.retryDelay, backoff = DEFAULT_CONFIG.retryBackoff) {
  return Math.floor(baseDelay * Math.pow(backoff, attempt));
}
