/**
 * A2A (Agent-to-Agent) HTTP Client Types and Error Classes
 * 
 * Defines the interfaces, types, and error classes for the A2A HTTP client.
 * Provides typed error handling with structured error information.
 */

/**
 * A2A Request Configuration
 * @typedef {Object} A2ARequestConfig
 * @property {string} targetUrn - Target agent URN
 * @property {string} route - API route/path
 * @property {Object} [init] - Fetch init options
 * @property {Object} [init.body] - Request body
 * @property {Object} [init.headers] - Additional headers
 * @property {number} [init.timeout] - Request timeout in ms
 * @property {number} [init.maxRetries] - Maximum retry attempts
 */

/**
 * A2A Response
 * @typedef {Object} A2AResponse
 * @property {number} status - HTTP status code
 * @property {Object} headers - Response headers
 * @property {T} data - Response data
 */

/**
 * Auth Provider Interface
 * @typedef {Object} AuthProvider
 * @property {() => Promise<string>} getToken - Get Bearer token
 * @property {() => boolean} hasToken - Check if token is available
 */

/**
 * Request ID generator for tracking
 * @returns {string} Unique request ID
 */
export function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Base A2A Error class
 */
export class A2AError extends Error {
  constructor(message, cause = null, status = null) {
    super(message);
    this.name = 'A2AError';
    this.cause = cause;
    this.status = status;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Authentication Error
 * Thrown when authentication fails (401, 403)
 */
export class AuthError extends A2AError {
  constructor(message, cause = null, status = null) {
    super(message, cause, status);
    this.name = 'AuthError';
  }
}

/**
 * Timeout Error
 * Thrown when request times out
 */
export class TimeoutError extends A2AError {
  constructor(message, cause = null, timeout = null) {
    super(message, cause);
    this.name = 'TimeoutError';
    this.timeout = timeout;
  }
}

/**
 * Network Error
 * Thrown when network operations fail
 */
export class NetworkError extends A2AError {
  constructor(message, cause = null) {
    super(message, cause);
    this.name = 'NetworkError';
  }
}

/**
 * Retry Error
 * Thrown when all retry attempts are exhausted
 */
export class RetryError extends A2AError {
  constructor(message, cause = null, attempts = 0) {
    super(message, cause);
    this.name = 'RetryError';
    this.attempts = attempts;
  }
}

/**
 * Default configuration for A2A client
 */
export const DEFAULT_CONFIG = {
  timeout: 30000, // 30 seconds
  maxRetries: 3,
  retryDelay: 1000, // 1 second base delay
  retryBackoff: 2, // Exponential backoff multiplier
  retryJitter: 0.1, // 10% jitter
  retryStatuses: [429, 500, 502, 503, 504], // Status codes to retry
  authStatuses: [401, 403], // Status codes indicating auth issues
};

/**
 * Check if a status code should trigger a retry
 * @param {number} status - HTTP status code
 * @returns {boolean} True if should retry
 */
export function shouldRetry(status) {
  return DEFAULT_CONFIG.retryStatuses.includes(status);
}

/**
 * Check if a status code indicates an auth error
 * @param {number} status - HTTP status code
 * @returns {boolean} True if auth error
 */
export function isAuthError(status) {
  return DEFAULT_CONFIG.authStatuses.includes(status);
}

/**
 * Calculate retry delay with exponential backoff and jitter
 * @param {number} attempt - Current attempt number (0-based)
 * @param {number} baseDelay - Base delay in ms
 * @param {number} backoff - Backoff multiplier
 * @param {number} jitter - Jitter factor (0-1)
 * @returns {number} Delay in ms
 */
export function calculateRetryDelay(attempt, baseDelay = DEFAULT_CONFIG.retryDelay, backoff = DEFAULT_CONFIG.retryBackoff, jitter = DEFAULT_CONFIG.retryJitter) {
  const exponentialDelay = baseDelay * Math.pow(backoff, attempt);
  const jitterAmount = exponentialDelay * jitter * Math.random();
  return Math.floor(exponentialDelay + jitterAmount);
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
    throw new A2AError(`Invalid agent URN format: ${urn}`);
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
 * Create structured log entry for A2A operations
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
