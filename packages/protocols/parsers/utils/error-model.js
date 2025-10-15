/**
 * Parser Error Model
 * Structured error handling for OpenAPI parser operations
 *
 * Features:
 * - Hierarchical error codes with severity levels
 * - Contextual information (path, location, metadata)
 * - Recovery suggestions
 * - Machine-readable structure
 */

import { getErrorMeta } from './error-codes.js';

/**
 * Base parser error class
 */
class ParserError extends Error {
  /**
   * Create a structured parser error
   * @param {string} code - Error code from ERROR_CODES registry
   * @param {string} message - Optional custom message (overrides default)
   * @param {Object} context - Additional context
   * @param {string} context.severity - ERROR | WARN | INFO
   * @param {string} context.path - JSON path to error location
   * @param {Object} context.location - File location {line, column}
   * @param {boolean} context.recoverable - Can parsing continue?
   * @param {Object} context.metadata - Additional error-specific data
   */
  constructor(code, message = null, context = {}) {
    const errorMeta = getErrorMeta(code);
    const finalMessage = message || errorMeta.message;

    super(finalMessage);

    this.name = 'ParserError';
    this.code = code;
    this.message = finalMessage;
    this.severity = context.severity || errorMeta.severity;
    this.path = context.path || null;
    this.location = context.location || null;
    this.recoverable = context.recoverable !== undefined
      ? context.recoverable
      : errorMeta.recoverable;
    this.suggestion = errorMeta.suggestion;
    this.metadata = context.metadata || {};
    this.timestamp = new Date().toISOString();

    // Stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON-serializable format
   * @returns {Object}
   */
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      severity: this.severity,
      path: this.path,
      location: this.location,
      recoverable: this.recoverable,
      suggestion: this.suggestion,
      metadata: this.metadata,
      timestamp: this.timestamp
    };
  }

  /**
   * Get formatted error message for display
   * @returns {string}
   */
  format() {
    const parts = [
      `[${this.code}]`,
      this.message
    ];

    if (this.path) {
      parts.push(`at ${this.path}`);
    }

    if (this.location) {
      parts.push(`(line ${this.location.line}, col ${this.location.column})`);
    }

    if (this.suggestion) {
      parts.push(`\nSuggestion: ${this.suggestion}`);
    }

    return parts.join(' ');
  }

  /**
   * Check if error is recoverable
   * @returns {boolean}
   */
  isRecoverable() {
    return this.recoverable === true;
  }

  /**
   * Check if error is fatal
   * @returns {boolean}
   */
  isFatal() {
    return this.severity === 'ERROR' && !this.recoverable;
  }
}

/**
 * Error collector for accumulating errors during parsing
 */
class ErrorCollector {
  constructor(options = {}) {
    this.options = {
      maxErrors: options.maxErrors || 100,
      maxWarnings: options.maxWarnings || 200,
      stopOnError: options.stopOnError || false,
      ...options
    };

    this.errors = [];
    this.warnings = [];
    this.infos = [];
  }

  /**
   * Add an error to the collection
   * @param {ParserError} error - Error to add
   * @throws {ParserError} If stopOnError is true and error is fatal
   */
  add(error) {
    if (!(error instanceof ParserError)) {
      error = new ParserError('GENERAL_001', error.message, {
        metadata: { originalError: error }
      });
    }

    // Route by severity
    switch (error.severity) {
      case 'ERROR':
        if (this.errors.length >= this.options.maxErrors) {
          return; // Silently drop if max reached
        }
        this.errors.push(error);
        if (this.options.stopOnError && error.isFatal()) {
          throw error;
        }
        break;

      case 'WARN':
        if (this.warnings.length >= this.options.maxWarnings) {
          return;
        }
        this.warnings.push(error);
        break;

      case 'INFO':
        this.infos.push(error);
        break;
    }
  }

  /**
   * Add multiple errors
   * @param {ParserError[]} errors
   */
  addMany(errors) {
    for (const error of errors) {
      this.add(error);
    }
  }

  /**
   * Check if any fatal errors exist
   * @returns {boolean}
   */
  hasFatalErrors() {
    return this.errors.some(e => e.isFatal());
  }

  /**
   * Check if any errors exist
   * @returns {boolean}
   */
  hasErrors() {
    return this.errors.length > 0;
  }

  /**
   * Check if any warnings exist
   * @returns {boolean}
   */
  hasWarnings() {
    return this.warnings.length > 0;
  }

  /**
   * Get all errors and warnings
   * @returns {ParserError[]}
   */
  getAll() {
    return [...this.errors, ...this.warnings, ...this.infos];
  }

  /**
   * Get errors by severity
   * @param {string} severity - ERROR | WARN | INFO
   * @returns {ParserError[]}
   */
  getBySeverity(severity) {
    switch (severity) {
      case 'ERROR':
        return this.errors;
      case 'WARN':
        return this.warnings;
      case 'INFO':
        return this.infos;
      default:
        return [];
    }
  }

  /**
   * Get errors by code
   * @param {string} code - Error code
   * @returns {ParserError[]}
   */
  getByCode(code) {
    return this.getAll().filter(e => e.code === code);
  }

  /**
   * Clear all errors
   */
  clear() {
    this.errors = [];
    this.warnings = [];
    this.infos = [];
  }

  /**
   * Get summary of errors
   * @returns {Object}
   */
  getSummary() {
    return {
      total: this.errors.length + this.warnings.length + this.infos.length,
      errors: this.errors.length,
      warnings: this.warnings.length,
      infos: this.infos.length,
      hasFatal: this.hasFatalErrors(),
      recoverable: this.errors.filter(e => e.isRecoverable()).length
    };
  }

  /**
   * Convert to JSON-serializable format
   * @returns {Object}
   */
  toJSON() {
    return {
      summary: this.getSummary(),
      errors: this.errors.map(e => e.toJSON()),
      warnings: this.warnings.map(e => e.toJSON()),
      infos: this.infos.map(e => e.toJSON())
    };
  }

  /**
   * Format all errors for display
   * @returns {string}
   */
  format() {
    const lines = [];

    if (this.errors.length > 0) {
      lines.push(`\n${this.errors.length} Error(s):`);
      this.errors.forEach((e, i) => {
        lines.push(`  ${i + 1}. ${e.format()}`);
      });
    }

    if (this.warnings.length > 0) {
      lines.push(`\n${this.warnings.length} Warning(s):`);
      this.warnings.forEach((e, i) => {
        lines.push(`  ${i + 1}. ${e.format()}`);
      });
    }

    return lines.join('\n');
  }
}

/**
 * Helper function to create error with common context
 * @param {string} code - Error code
 * @param {string} message - Custom message
 * @param {Object} context - Error context
 * @returns {ParserError}
 */
function createError(code, message, context = {}) {
  return new ParserError(code, message, context);
}

/**
 * Helper to wrap native errors
 * @param {Error} error - Native error
 * @param {string} code - Error code to use
 * @param {Object} context - Additional context
 * @returns {ParserError}
 */
function wrapError(error, code = 'GENERAL_001', context = {}) {
  return new ParserError(code, error.message, {
    ...context,
    metadata: {
      ...context.metadata,
      originalError: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    }
  });
}

export {
  ParserError,
  ErrorCollector,
  createError,
  wrapError
};
