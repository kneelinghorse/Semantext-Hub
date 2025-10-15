/**
 * Feedback System - Core Module
 * Provides structured error reporting with suggested fixes
 * Performance target: <5ms per message formatting
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ErrorCodes, getErrorByCode, isRetryable, getRecoveryPattern } from './error-codes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load and compile feedback schema
 */
const schema = JSON.parse(
  readFileSync(join(__dirname, 'schema', 'feedback.schema.json'), 'utf-8')
);

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateFeedback = ajv.compile(schema);

/**
 * FeedbackFormatter - Creates structured feedback messages
 */
export class FeedbackFormatter {
  constructor(options = {}) {
    this.serviceName = options.serviceName || 'ossp-agi';
    this.includeStack = options.includeStack !== false;
    this.verbose = options.verbose || false;
  }

  /**
   * Format an error with structured details
   * @param {object} errorDef - Error definition from ErrorCodes
   * @param {object} options - Error-specific details
   * @returns {object} Formatted error object
   */
  formatError(errorDef, options = {}) {
    const start = Date.now();

    const error = {
      code: errorDef.code,
      category: errorDef.category,
      message: errorDef.message,
      type: errorDef.type,
      timestamp: new Date().toISOString()
    };

    // Add optional fields
    if (options.detail) {
      error.detail = options.detail;
    }

    if (options.suggestedFix || errorDef.suggestedFix) {
      error.suggestedFix = options.suggestedFix || errorDef.suggestedFix;
    }

    if (options.details) {
      error.details = options.details;
    }

    if (options.instance) {
      error.instance = options.instance;
    }

    // Include stack trace for server errors (if enabled)
    if (this.includeStack && options.stack && errorDef.category === 'SERVER_ERROR') {
      error.stack = options.stack;
    }

    // Add correlation context
    if (options.correlationId) {
      error.correlationId = options.correlationId;
    }

    if (options.spanId) {
      error.spanId = options.spanId;
    }

    const elapsed = Date.now() - start;

    // Performance assertion
    if (this.verbose && elapsed > 5) {
      console.warn(`[PERF] formatError exceeded 5ms target: ${elapsed}ms`);
    }

    return error;
  }

  /**
   * Create a feedback message envelope
   * @param {string} type - Message type (error, hint, progress)
   * @param {object} payload - Message payload
   * @param {object} context - Correlation context
   * @returns {object} Feedback message
   */
  createMessage(type, payload, context = {}) {
    return {
      type,
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      correlationId: context.correlationId,
      spanId: context.spanId,
      payload
    };
  }

  /**
   * Format a hint message
   * @param {string} code - Hint code
   * @param {string} message - Hint message
   * @param {object} options - Additional options
   * @returns {object} Formatted hint
   */
  formatHint(code, message, options = {}) {
    return {
      code,
      message,
      severity: options.severity || 'INFO',
      context: options.context || {},
      documentationUrl: options.documentationUrl
    };
  }

  /**
   * Create error from exception
   * @param {Error} exception - JavaScript error object
   * @param {object} errorDef - Error definition
   * @param {object} context - Additional context
   * @returns {object} Formatted error
   */
  fromException(exception, errorDef = ErrorCodes.INTERNAL_ERROR, context = {}) {
    return this.formatError(errorDef, {
      detail: exception.message,
      stack: exception.stack,
      details: {
        name: exception.name,
        ...context.details
      },
      correlationId: context.correlationId,
      spanId: context.spanId
    });
  }
}

/**
 * Validate feedback message against schema
 * @param {object} message - Feedback message to validate
 * @returns {object} Validation result
 */
export function validateFeedbackMessage(message) {
  const valid = validateFeedback(message);

  return {
    valid,
    errors: valid ? [] : validateFeedback.errors.map(err => ({
      path: err.instancePath,
      message: err.message,
      params: err.params
    }))
  };
}

/**
 * HintRegistry - Manages contextual hints
 */
export class HintRegistry {
  constructor() {
    this.hints = new Map();
  }

  /**
   * Register a hint
   * @param {string} code - Hint code
   * @param {object} hint - Hint definition
   */
  register(code, hint) {
    this.hints.set(code, hint);
  }

  /**
   * Get hint by code
   * @param {string} code - Hint code
   * @returns {object|null} Hint definition
   */
  get(code) {
    return this.hints.get(code) || null;
  }

  /**
   * Get all hints matching a pattern
   * @param {RegExp} pattern - Pattern to match
   * @returns {Array} Matching hints
   */
  findByPattern(pattern) {
    return Array.from(this.hints.entries())
      .filter(([code]) => pattern.test(code))
      .map(([code, hint]) => ({ code, ...hint }));
  }
}

/**
 * Pre-defined common hints
 */
export const CommonHints = {
  WORKFLOW_VALIDATION: {
    code: 'WORKFLOW_VALIDATION',
    message: 'Ensure workflow definition follows the schema',
    severity: 'WARNING',
    documentationUrl: 'https://ossp-agi.dev/docs/workflows'
  },
  PROTOCOL_PARSING: {
    code: 'PROTOCOL_PARSING',
    message: 'Check protocol specification format (OpenAPI, AsyncAPI, gRPC)',
    severity: 'INFO',
    documentationUrl: 'https://ossp-agi.dev/docs/protocols'
  },
  REGISTRATION_CONFLICT: {
    code: 'REGISTRATION_CONFLICT',
    message: 'URN already registered. Use a different identifier or update existing entry',
    severity: 'ERROR',
    documentationUrl: 'https://ossp-agi.dev/docs/registration'
  },
  SECURITY_REDACTION: {
    code: 'SECURITY_REDACTION',
    message: 'Sensitive data detected and redacted. Review security patterns',
    severity: 'WARNING',
    documentationUrl: 'https://ossp-agi.dev/docs/security'
  },
  SCAFFOLD_VALIDATION: {
    code: 'SCAFFOLD_VALIDATION',
    message: 'Validate configuration before generating files',
    severity: 'INFO',
    documentationUrl: 'https://ossp-agi.dev/docs/scaffolding'
  },
  SCAFFOLD_NAME_FORMAT: {
    code: 'SCAFFOLD_NAME_FORMAT',
    message: 'Protocol name should use alphanumeric characters, hyphens, and underscores only',
    severity: 'WARNING',
    documentationUrl: 'https://ossp-agi.dev/docs/scaffolding#naming'
  },
  SCAFFOLD_VERSION_FORMAT: {
    code: 'SCAFFOLD_VERSION_FORMAT',
    message: 'Version must follow semver format (e.g., 1.0.0)',
    severity: 'WARNING',
    documentationUrl: 'https://ossp-agi.dev/docs/scaffolding#versioning'
  },
  SCAFFOLD_FILE_EXISTS: {
    code: 'SCAFFOLD_FILE_EXISTS',
    message: 'Output file already exists. Use --force to overwrite',
    severity: 'WARNING',
    documentationUrl: 'https://ossp-agi.dev/docs/scaffolding#overwrite'
  },
  SCAFFOLD_PREVIEW: {
    code: 'SCAFFOLD_PREVIEW',
    message: 'Review generated files before writing to disk',
    severity: 'INFO',
    documentationUrl: 'https://ossp-agi.dev/docs/scaffolding#preview'
  }
};

export default {
  FeedbackFormatter,
  validateFeedbackMessage,
  HintRegistry,
  CommonHints,
  ErrorCodes,
  getErrorByCode,
  isRetryable,
  getRecoveryPattern
};
