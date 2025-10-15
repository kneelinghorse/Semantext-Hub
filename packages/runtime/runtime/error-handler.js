/**
 * Centralized Error Handler
 * 
 * Provides centralized error handling and resilience patterns for runtime integration components.
 * Includes typed errors, error mapping, and structured error context.
 */

import { randomUUID } from 'crypto';

/**
 * Base error class for runtime integration
 */
export class RuntimeError extends Error {
  constructor(message, cause = null, context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.cause = cause;
    this.context = context;
    this.timestamp = new Date().toISOString();
    this.errorId = randomUUID();
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get error details for logging
   * @returns {Object} Error details
   */
  getDetails() {
    return {
      name: this.name,
      message: this.message,
      errorId: this.errorId,
      timestamp: this.timestamp,
      context: this.context,
      cause: this.cause ? {
        name: this.cause.name,
        message: this.cause.message
      } : null
    };
  }

  /**
   * Convert to JSON-safe object
   * @returns {Object} JSON-safe error representation
   */
  toJSON() {
    return this.getDetails();
  }
}

/**
 * A2A (Agent-to-Agent) specific errors
 */
export class A2AError extends RuntimeError {
  constructor(message, cause = null, context = {}) {
    super(message, cause, { ...context, component: 'A2A' });
  }
}

/**
 * MCP (Model Context Protocol) specific errors
 */
export class MCPError extends RuntimeError {
  constructor(message, cause = null, context = {}) {
    super(message, cause, { ...context, component: 'MCP' });
  }
}

/**
 * Authentication errors
 */
export class AuthError extends RuntimeError {
  constructor(message, cause = null, context = {}) {
    super(message, cause, { ...context, type: 'auth' });
    this.status = context.status ?? null;
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends RuntimeError {
  constructor(message, cause = null, timeout = null, context = {}) {
    super(message, cause, { ...context, type: 'timeout', timeout });
    this.timeout = timeout ?? context.timeout ?? null;
  }
}

/**
 * Validation errors
 */
export class ValidationError extends RuntimeError {
  constructor(message, cause = null, field = null, context = {}) {
    super(message, cause, { ...context, type: 'validation', field });
  }
}

/**
 * Network errors
 */
export class NetworkError extends RuntimeError {
  constructor(message, cause = null, context = {}) {
    super(message, cause, { ...context, type: 'network' });
  }
}

/**
 * Circuit breaker errors
 */
export class CircuitBreakerError extends RuntimeError {
  constructor(message, cause = null, state = null, context = {}) {
    super(message, cause, { ...context, type: 'circuit_breaker', state });
  }
}

/**
 * Retry exhaustion errors
 */
export class RetryError extends RuntimeError {
  constructor(message, cause = null, attempts = null, context = {}) {
    super(message, cause, { ...context, type: 'retry', attempts });
    this.attempts = attempts ?? context.attempts ?? null;
  }
}

/**
 * Registry errors
 */
export class RegistryError extends RuntimeError {
  constructor(message, cause = null, context = {}) {
    super(message, cause, { ...context, component: 'Registry' });
  }
}

/**
 * Discovery errors
 */
export class DiscoveryError extends RuntimeError {
  constructor(message, cause = null, context = {}) {
    super(message, cause, { ...context, component: 'Discovery' });
  }
}

/**
 * Error handler class
 */
export class ErrorHandler {
  constructor(options = {}) {
    this.enableLogging = options.enableLogging !== false;
    this.enableMetrics = options.enableMetrics !== false;
    this.errorCounts = new Map();
    this.errorHistory = [];
    this.maxHistorySize = options.maxHistorySize || 1000;
  }

  /**
   * Handle an error and return typed error
   * @param {Error|string} error - Error to handle
   * @param {Object} context - Additional context
   * @returns {RuntimeError} Typed error
   */
  handleError(error, context = {}) {
    let typedError;

    // Handle different error types
    if (error instanceof RuntimeError) {
      typedError = error;
    } else if (error instanceof Error) {
      typedError = this._mapError(error, context);
    } else if (typeof error === 'string') {
      typedError = new RuntimeError(error, null, context);
    } else {
      typedError = new RuntimeError('Unknown error', error, context);
    }

    // Update metrics
    if (this.enableMetrics) {
      this._updateMetrics(typedError);
    }

    // Log error
    if (this.enableLogging) {
      this._logError(typedError);
    }

    return typedError;
  }

  /**
   * Map generic error to typed error
   * @private
   * @param {Error} error - Generic error
   * @param {Object} context - Context
   * @returns {RuntimeError} Typed error
   */
  _mapError(error, context) {
    const message = error.message;
    const name = error.name;

    // Map based on error name/message patterns
    if (name === 'AbortError' || message.includes('timeout')) {
      return new TimeoutError(message, error, null, context);
    }

    if (name === 'TypeError' && message.includes('fetch')) {
      return new NetworkError(message, error, context);
    }

    if (message.includes('auth') || message.includes('unauthorized') || message.includes('forbidden')) {
      return new AuthError(message, error, context);
    }

    if (message.includes('validation') || message.includes('invalid')) {
      return new ValidationError(message, error, null, context);
    }

    if (message.includes('circuit') || message.includes('breaker')) {
      return new CircuitBreakerError(message, error, null, context);
    }

    if (message.includes('retry') || message.includes('attempts')) {
      return new RetryError(message, error, null, context);
    }

    if (message.includes('MCP') || message.includes('mcp')) {
      return new MCPError(message, error, context);
    }

    if (message.includes('A2A') || message.includes('agent')) {
      return new A2AError(message, error, context);
    }

    if (message.includes('registry') || message.includes('URN')) {
      return new RegistryError(message, error, context);
    }

    if (message.includes('discovery') || message.includes('discover')) {
      return new DiscoveryError(message, error, context);
    }

    // Default to generic runtime error
    return new RuntimeError(message, error, context);
  }

  /**
   * Update error metrics
   * @private
   * @param {RuntimeError} error - Error to track
   */
  _updateMetrics(error) {
    const errorType = error.constructor.name;
    const count = this.errorCounts.get(errorType) || 0;
    this.errorCounts.set(errorType, count + 1);

    // Add to history
    this.errorHistory.push({
      errorId: error.errorId,
      type: errorType,
      timestamp: error.timestamp,
      context: error.context
    });

    // Trim history if needed
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Log error
   * @private
   * @param {RuntimeError} error - Error to log
   */
  _logError(error) {
    const logEntry = {
      level: 'error',
      errorId: error.errorId,
      type: error.constructor.name,
      message: error.message,
      timestamp: error.timestamp,
      context: error.context,
      cause: error.cause ? {
        name: error.cause.name,
        message: error.cause.message
      } : null
    };

    console.error('[ErrorHandler]', JSON.stringify(logEntry, null, 2));
  }

  /**
   * Get error statistics
   * @returns {Object} Error statistics
   */
  getStats() {
    const totalErrors = Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0);
    const errorTypes = Object.fromEntries(this.errorCounts.entries());
    
    return {
      totalErrors,
      errorTypes,
      historySize: this.errorHistory.length,
      recentErrors: this.errorHistory.slice(-10)
    };
  }

  /**
   * Clear error history and metrics
   */
  clearStats() {
    this.errorCounts.clear();
    this.errorHistory = [];
  }

  /**
   * Check if error is retryable
   * @param {RuntimeError} error - Error to check
   * @returns {boolean} True if retryable
   */
  isRetryable(error) {
    // Don't retry auth errors, validation errors, or circuit breaker errors
    if (error instanceof AuthError || 
        error instanceof ValidationError || 
        error instanceof CircuitBreakerError) {
      return false;
    }

    // Retry network errors, timeout errors, and some MCP/A2A errors
    return error instanceof NetworkError || 
           error instanceof TimeoutError ||
           error instanceof MCPError ||
           error instanceof A2AError ||
           error instanceof RegistryError ||
           error instanceof DiscoveryError;
  }

  /**
   * Check if error is fatal
   * @param {RuntimeError} error - Error to check
   * @returns {boolean} True if fatal
   */
  isFatal(error) {
    return error instanceof AuthError || 
           error instanceof ValidationError ||
           error instanceof CircuitBreakerError;
  }
}

/**
 * Create error handler instance
 * @param {Object} options - Handler options
 * @returns {ErrorHandler} Error handler instance
 */
export function createErrorHandler(options = {}) {
  return new ErrorHandler(options);
}

/**
 * Convenience function to handle errors
 * @param {Error|string} error - Error to handle
 * @param {Object} context - Additional context
 * @param {Object} options - Handler options
 * @returns {RuntimeError} Typed error
 */
export function handleError(error, context = {}, options = {}) {
  const handler = createErrorHandler(options);
  return handler.handleError(error, context);
}

/**
 * Error mapping utilities
 */
export const ErrorMappers = {
  /**
   * Map HTTP status to error type
   * @param {number} status - HTTP status code
   * @param {string} message - Error message
   * @param {Object} context - Context
   * @returns {RuntimeError} Mapped error
   */
  fromHttpStatus(status, message, context = {}) {
    if (status >= 400 && status < 500) {
      if (status === 401 || status === 403) {
        return new AuthError(message, null, { ...context, status });
      }
      if (status === 400 || status === 422) {
        return new ValidationError(message, null, null, { ...context, status });
      }
      return new A2AError(message, null, { ...context, status });
    }
    
    if (status >= 500) {
      return new NetworkError(message, null, { ...context, status });
    }
    
    return new RuntimeError(message, null, { ...context, status });
  },

  /**
   * Map MCP error to typed error
   * @param {Object} mcpError - MCP error object
   * @param {Object} context - Context
   * @returns {RuntimeError} Mapped error
   */
  fromMCPError(mcpError, context = {}) {
    const message = mcpError.message || 'MCP operation failed';
    const code = mcpError.code;
    
    if (code === -32600 || code === -32602) {
      return new ValidationError(message, null, null, { ...context, mcpCode: code });
    }
    
    if (code === -32603) {
      return new MCPError(message, null, { ...context, mcpCode: code });
    }
    
    return new MCPError(message, null, { ...context, mcpCode: code });
  },

  /**
   * Map fetch error to typed error
   * @param {Error} fetchError - Fetch error
   * @param {Object} context - Context
   * @returns {RuntimeError} Mapped error
   */
  fromFetchError(fetchError, context = {}) {
    if (fetchError.name === 'AbortError') {
      return new TimeoutError('Request was aborted', fetchError, null, context);
    }
    
    if (fetchError.message.includes('fetch')) {
      return new NetworkError(fetchError.message, fetchError, context);
    }
    
    return new RuntimeError(fetchError.message, fetchError, context);
  }
};

/**
 * Error context utilities
 */
export const ErrorContext = {
  /**
   * Create request context
   * @param {string} requestId - Request ID
   * @param {string} method - HTTP method
   * @param {string} url - Request URL
   * @param {Object} additional - Additional context
   * @returns {Object} Request context
   */
  createRequestContext(requestId, method, url, additional = {}) {
    return {
      requestId,
      method,
      url,
      timestamp: new Date().toISOString(),
      ...additional
    };
  },

  /**
   * Create operation context
   * @param {string} operation - Operation name
   * @param {string} component - Component name
   * @param {Object} additional - Additional context
   * @returns {Object} Operation context
   */
  createOperationContext(operation, component, additional = {}) {
    return {
      operation,
      component,
      timestamp: new Date().toISOString(),
      ...additional
    };
  },

  /**
   * Create agent context
   * @param {string} agentUrn - Agent URN
   * @param {string} operation - Operation
   * @param {Object} additional - Additional context
   * @returns {Object} Agent context
   */
  createAgentContext(agentUrn, operation, additional = {}) {
    return {
      agentUrn,
      operation,
      timestamp: new Date().toISOString(),
      ...additional
    };
  }
};

/**
 * Default error handler instance
 */
export const defaultErrorHandler = createErrorHandler({
  enableLogging: true,
  enableMetrics: true,
  maxHistorySize: 1000
});

/**
 * Export all error types for convenience
 */
// All error types are already exported as individual classes above
