/**
 * Standard Error Code Registry
 * Provides consistent error codes and categorization
 * Based on RFC 7807 and research findings
 */

/**
 * Error categories aligned with recovery patterns
 */
export const ErrorCategory = {
  CLIENT_ERROR: 'CLIENT_ERROR',      // 40000-49999: Fail fast, don't retry
  SERVER_ERROR: 'SERVER_ERROR',      // 50000-59999: Retry with backoff
  BUSINESS_LOGIC: 'BUSINESS_LOGIC'   // 60000-69999: Handle in app logic
};

/**
 * Standard error codes with metadata
 */
export const ErrorCodes = {
  // Client Errors (40000-49999)
  INVALID_PARAMETER: {
    code: 40001,
    category: ErrorCategory.CLIENT_ERROR,
    message: 'Invalid parameter provided',
    type: 'https://ossp-agi.dev/errors/invalid-parameter',
    suggestedFix: 'Review the parameter documentation and ensure correct format and values'
  },
  MISSING_REQUIRED_FIELD: {
    code: 40002,
    category: ErrorCategory.CLIENT_ERROR,
    message: 'Required field is missing',
    type: 'https://ossp-agi.dev/errors/missing-field',
    suggestedFix: 'Provide all required fields as specified in the schema'
  },
  INVALID_FORMAT: {
    code: 40003,
    category: ErrorCategory.CLIENT_ERROR,
    message: 'Invalid format',
    type: 'https://ossp-agi.dev/errors/invalid-format',
    suggestedFix: 'Check the format specification and adjust your input'
  },
  UNAUTHORIZED: {
    code: 40101,
    category: ErrorCategory.CLIENT_ERROR,
    message: 'Unauthorized access',
    type: 'https://ossp-agi.dev/errors/unauthorized',
    suggestedFix: 'Ensure you have valid credentials and try again'
  },
  FORBIDDEN: {
    code: 40103,
    category: ErrorCategory.CLIENT_ERROR,
    message: 'Forbidden: insufficient permissions',
    type: 'https://ossp-agi.dev/errors/forbidden',
    suggestedFix: 'Request appropriate permissions from your administrator'
  },
  NOT_FOUND: {
    code: 40104,
    category: ErrorCategory.CLIENT_ERROR,
    message: 'Resource not found',
    type: 'https://ossp-agi.dev/errors/not-found',
    suggestedFix: 'Verify the resource identifier and try again'
  },
  CONFLICT: {
    code: 40109,
    category: ErrorCategory.CLIENT_ERROR,
    message: 'Resource conflict',
    type: 'https://ossp-agi.dev/errors/conflict',
    suggestedFix: 'Resolve the conflict before retrying the operation'
  },
  VALIDATION_FAILED: {
    code: 40122,
    category: ErrorCategory.CLIENT_ERROR,
    message: 'Validation failed',
    type: 'https://ossp-agi.dev/errors/validation-failed',
    suggestedFix: 'Review validation errors and correct the input'
  },

  // Server Errors (50000-59999)
  INTERNAL_ERROR: {
    code: 50000,
    category: ErrorCategory.SERVER_ERROR,
    message: 'Internal server error',
    type: 'https://ossp-agi.dev/errors/internal-error',
    suggestedFix: 'Retry the operation. If the problem persists, contact support'
  },
  SERVICE_UNAVAILABLE: {
    code: 50003,
    category: ErrorCategory.SERVER_ERROR,
    message: 'Service temporarily unavailable',
    type: 'https://ossp-agi.dev/errors/service-unavailable',
    suggestedFix: 'Wait a moment and retry with exponential backoff'
  },
  TIMEOUT: {
    code: 50004,
    category: ErrorCategory.SERVER_ERROR,
    message: 'Operation timeout',
    type: 'https://ossp-agi.dev/errors/timeout',
    suggestedFix: 'Retry the operation. Consider breaking it into smaller chunks if timeouts persist'
  },
  DOWNSTREAM_ERROR: {
    code: 50002,
    category: ErrorCategory.SERVER_ERROR,
    message: 'Downstream service error',
    type: 'https://ossp-agi.dev/errors/downstream-error',
    suggestedFix: 'Retry the operation. The downstream service may be experiencing issues'
  },
  DATABASE_ERROR: {
    code: 50010,
    category: ErrorCategory.SERVER_ERROR,
    message: 'Database operation failed',
    type: 'https://ossp-agi.dev/errors/database-error',
    suggestedFix: 'Retry the operation. Contact support if the problem persists'
  },

  // Business Logic Errors (60000-69999)
  INSUFFICIENT_RESOURCES: {
    code: 60001,
    category: ErrorCategory.BUSINESS_LOGIC,
    message: 'Insufficient resources',
    type: 'https://ossp-agi.dev/errors/insufficient-resources',
    suggestedFix: 'Allocate additional resources and try again'
  },
  QUOTA_EXCEEDED: {
    code: 60002,
    category: ErrorCategory.BUSINESS_LOGIC,
    message: 'Quota exceeded',
    type: 'https://ossp-agi.dev/errors/quota-exceeded',
    suggestedFix: 'Wait for quota reset or request a quota increase'
  },
  RATE_LIMIT_EXCEEDED: {
    code: 60003,
    category: ErrorCategory.BUSINESS_LOGIC,
    message: 'Rate limit exceeded',
    type: 'https://ossp-agi.dev/errors/rate-limit',
    suggestedFix: 'Slow down your request rate and implement exponential backoff'
  },
  DUPLICATE_ENTRY: {
    code: 60004,
    category: ErrorCategory.BUSINESS_LOGIC,
    message: 'Duplicate entry',
    type: 'https://ossp-agi.dev/errors/duplicate-entry',
    suggestedFix: 'Use a unique identifier or update the existing entry'
  },
  WORKFLOW_VALIDATION_FAILED: {
    code: 60010,
    category: ErrorCategory.BUSINESS_LOGIC,
    message: 'Workflow validation failed',
    type: 'https://ossp-agi.dev/errors/workflow-validation',
    suggestedFix: 'Review workflow definition and correct validation errors'
  },
  PROTOCOL_PARSING_FAILED: {
    code: 60011,
    category: ErrorCategory.BUSINESS_LOGIC,
    message: 'Protocol parsing failed',
    type: 'https://ossp-agi.dev/errors/protocol-parsing',
    suggestedFix: 'Verify the protocol specification format and schema compliance'
  },
  REGISTRATION_CONFLICT: {
    code: 60012,
    category: ErrorCategory.BUSINESS_LOGIC,
    message: 'Agent registration conflict',
    type: 'https://ossp-agi.dev/errors/registration-conflict',
    suggestedFix: 'Check for duplicate URNs or resolve the conflict before registering'
  }
};

/**
 * Get error definition by code
 * @param {number} code - Error code
 * @returns {object|null} Error definition or null
 */
export function getErrorByCode(code) {
  return Object.values(ErrorCodes).find(err => err.code === code) || null;
}

/**
 * Get error definition by type URI
 * @param {string} typeUri - Error type URI
 * @returns {object|null} Error definition or null
 */
export function getErrorByType(typeUri) {
  return Object.values(ErrorCodes).find(err => err.type === typeUri) || null;
}

/**
 * Check if error is retryable based on category
 * @param {number} code - Error code
 * @returns {boolean} True if error should be retried
 */
export function isRetryable(code) {
  const error = getErrorByCode(code);
  return error && error.category === ErrorCategory.SERVER_ERROR;
}

/**
 * Get recovery pattern for error code
 * @param {number} code - Error code
 * @returns {string} Recovery pattern recommendation
 */
export function getRecoveryPattern(code) {
  const error = getErrorByCode(code);
  if (!error) return 'UNKNOWN';

  switch (error.category) {
    case ErrorCategory.CLIENT_ERROR:
      return 'FAIL_FAST';
    case ErrorCategory.SERVER_ERROR:
      return 'RETRY_WITH_BACKOFF';
    case ErrorCategory.BUSINESS_LOGIC:
      return 'HANDLE_IN_APP_LOGIC';
    default:
      return 'UNKNOWN';
  }
}

export default {
  ErrorCategory,
  ErrorCodes,
  getErrorByCode,
  getErrorByType,
  isRetryable,
  getRecoveryPattern
};
