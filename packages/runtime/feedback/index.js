/**
 * Feedback System - Main Entry Point
 * Unified structured feedback for errors, hints, and progress
 */

import { FeedbackFormatter, validateFeedbackMessage, HintRegistry, CommonHints } from './feedback.js';
import { ErrorCodes, ErrorCategory, getErrorByCode, getErrorByType, isRetryable, getRecoveryPattern } from './error-codes.js';
import { ProgressTracker, ProgressAggregator, ProgressStatus, generateTraceId, generateSpanId } from './progress.js';
import WorkflowFeedbackAdapter from './adapters/workflow-adapter.js';
import RegistryFeedbackAdapter from './adapters/registry-adapter.js';

/**
 * FeedbackAggregator - Centralized feedback collection and reporting
 */
export class FeedbackAggregator {
  constructor(options = {}) {
    this.serviceName = options.serviceName || 'ossp-agi';
    this.verbose = options.verbose || false;

    // Initialize components
    this.formatter = new FeedbackFormatter({
      serviceName: this.serviceName,
      verbose: this.verbose
    });

    this.progressAggregator = new ProgressAggregator({ verbose: this.verbose });
    this.hintRegistry = new HintRegistry();

    // Message storage (in-memory, with TTL)
    this.errors = [];
    this.hints = [];
    this.maxStoredMessages = options.maxStoredMessages || 1000;

    // Register common hints
    Object.entries(CommonHints).forEach(([code, hint]) => {
      this.hintRegistry.register(code, hint);
    });
  }

  /**
   * Report an error
   * @param {object} errorDef - Error definition
   * @param {object} options - Error details
   */
  reportError(errorDef, options = {}) {
    const error = this.formatter.formatError(errorDef, options);
    this.errors.push(error);

    // Trim if exceeds max
    if (this.errors.length > this.maxStoredMessages) {
      this.errors.shift();
    }

    return error;
  }

  /**
   * Report a hint
   * @param {string} code - Hint code
   * @param {string} message - Hint message
   * @param {object} options - Hint options
   */
  reportHint(code, message, options = {}) {
    const hint = this.formatter.formatHint(code, message, options);
    this.hints.push(hint);

    // Trim if exceeds max
    if (this.hints.length > this.maxStoredMessages) {
      this.hints.shift();
    }

    return hint;
  }

  /**
   * Get or create a progress tracker
   * @param {string} taskId - Task identifier
   * @param {object} options - Tracker options
   * @returns {ProgressTracker}
   */
  getProgressTracker(taskId, options = {}) {
    return this.progressAggregator.getTracker(taskId, options);
  }

  /**
   * Get all errors
   * @param {object} filter - Filter options
   * @returns {Array} Filtered errors
   */
  getErrors(filter = {}) {
    let errors = [...this.errors];

    if (filter.category) {
      errors = errors.filter(e => e.category === filter.category);
    }

    if (filter.code) {
      errors = errors.filter(e => e.code === filter.code);
    }

    if (filter.since) {
      const since = new Date(filter.since);
      errors = errors.filter(e => new Date(e.timestamp) >= since);
    }

    return errors;
  }

  /**
   * Get all hints
   * @param {object} filter - Filter options
   * @returns {Array} Filtered hints
   */
  getHints(filter = {}) {
    let hints = [...this.hints];

    if (filter.severity) {
      hints = hints.filter(h => h.severity === filter.severity);
    }

    if (filter.code) {
      hints = hints.filter(h => h.code === filter.code);
    }

    return hints;
  }

  /**
   * Get summary statistics
   * @returns {object} Summary
   */
  getSummary() {
    const progressSummary = this.progressAggregator.getSummary();

    return {
      errors: {
        total: this.errors.length,
        byCategory: {
          client: this.errors.filter(e => e.category === ErrorCategory.CLIENT_ERROR).length,
          server: this.errors.filter(e => e.category === ErrorCategory.SERVER_ERROR).length,
          business: this.errors.filter(e => e.category === ErrorCategory.BUSINESS_LOGIC).length
        }
      },
      hints: {
        total: this.hints.length,
        bySeverity: {
          info: this.hints.filter(h => h.severity === 'INFO').length,
          warning: this.hints.filter(h => h.severity === 'WARNING').length,
          error: this.hints.filter(h => h.severity === 'ERROR').length
        }
      },
      progress: progressSummary
    };
  }

  /**
   * Get trace by correlation ID
   * @param {string} correlationId - Correlation ID to trace
   * @returns {object} Trace details
   */
  getTrace(correlationId) {
    const errors = this.errors.filter(e => e.correlationId === correlationId);
    const hints = this.hints.filter(h => h.context?.correlationId === correlationId);

    // Find progress tracker
    const tracker = Array.from(this.progressAggregator.trackers.values())
      .find(t => t.correlationId === correlationId);

    return {
      correlationId,
      errors,
      hints,
      progress: tracker ? {
        taskId: tracker.taskId,
        status: tracker.status,
        progress: tracker.progress,
        elapsedMs: tracker.getElapsedTime()
      } : null
    };
  }

  /**
   * Clear all feedback
   */
  clear() {
    this.errors = [];
    this.hints = [];
  }
}

// Export all components
export {
  FeedbackFormatter,
  validateFeedbackMessage,
  HintRegistry,
  CommonHints,
  ErrorCodes,
  ErrorCategory,
  getErrorByCode,
  getErrorByType,
  isRetryable,
  getRecoveryPattern,
  ProgressTracker,
  ProgressAggregator,
  ProgressStatus,
  generateTraceId,
  generateSpanId,
  WorkflowFeedbackAdapter,
  RegistryFeedbackAdapter
};

export default {
  FeedbackAggregator,
  FeedbackFormatter,
  validateFeedbackMessage,
  HintRegistry,
  CommonHints,
  ErrorCodes,
  ErrorCategory,
  getErrorByCode,
  getErrorByType,
  isRetryable,
  getRecoveryPattern,
  ProgressTracker,
  ProgressAggregator,
  ProgressStatus,
  generateTraceId,
  generateSpanId,
  WorkflowFeedbackAdapter,
  RegistryFeedbackAdapter
};
