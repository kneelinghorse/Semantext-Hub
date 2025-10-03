/*
 * Enhanced API Pattern Detection with Override Support
 *
 * Wraps base pattern detectors with override engine integration.
 */

const {
  detectPagination: baseDetectPagination,
  detectLongRunning: baseDetectLongRunning,
  detectRateLimiting: baseDetectRateLimiting
} = require('./patterns');
const { OverrideEngine } = require('../../core/overrides');

/**
 * Enhanced pagination detection with overrides
 * @param {object} operation - OpenAPI operation
 * @param {array} params - Operation parameters
 * @param {object} options - Detection options
 * @param {string} options.endpoint - Endpoint path
 * @param {string} options.method - HTTP method
 * @param {string} options.protocol - Protocol hint
 * @param {OverrideEngine} options.overrideEngine - Override engine
 * @returns {object} Enhanced detection result
 */
function detectPaginationWithOverrides(operation, params = [], options = {}) {
  // Run base detection
  const baseResult = baseDetectPagination(operation, params);

  // If no override engine, return base result
  if (!options.overrideEngine || !options.endpoint) {
    return baseResult;
  }

  // Try to match override rules
  const overrideMatch = options.overrideEngine.matchAPIPattern(
    options.endpoint,
    options.method || 'GET',
    { ...operation, parameters: params }
  );

  if (overrideMatch && overrideMatch.rule.classification === 'pagination') {
    // Override found - enhance result
    return {
      ...baseResult,
      detected: true,
      confidence: Math.max(baseResult.confidence || 0, overrideMatch.confidence),
      overrideApplied: true,
      overrideRule: overrideMatch.rule.id,
      overrideConfidence: overrideMatch.confidence,
      overrideSignals: overrideMatch.signals
    };
  }

  return {
    ...baseResult,
    overrideApplied: false
  };
}

/**
 * Enhanced long-running operation detection with overrides
 * @param {object} operation - OpenAPI operation
 * @param {array} responses - Operation responses
 * @param {object} options - Detection options
 * @returns {object} Enhanced detection result
 */
function detectLongRunningWithOverrides(operation, responses = [], options = {}) {
  const baseResult = baseDetectLongRunning(operation, responses);

  if (!options.overrideEngine || !options.endpoint) {
    return baseResult;
  }

  const overrideMatch = options.overrideEngine.matchAPIPattern(
    options.endpoint,
    options.method || 'POST',
    { ...operation, responses }
  );

  if (overrideMatch && ['lro', 'polling', 'webhook', 'sse'].includes(overrideMatch.rule.classification)) {
    return {
      ...baseResult,
      detected: true,
      pattern: overrideMatch.rule.classification,
      confidence: Math.max(baseResult.confidence || 0, overrideMatch.confidence),
      overrideApplied: true,
      overrideRule: overrideMatch.rule.id,
      overrideConfidence: overrideMatch.confidence
    };
  }

  return {
    ...baseResult,
    overrideApplied: false
  };
}

/**
 * Enhanced rate limiting detection with overrides
 * @param {object} operation - OpenAPI operation
 * @param {object} options - Detection options
 * @returns {object} Enhanced detection result
 */
function detectRateLimitingWithOverrides(operation, options = {}) {
  const baseResult = baseDetectRateLimiting(operation);

  if (!options.overrideEngine || !options.endpoint) {
    return baseResult;
  }

  const overrideMatch = options.overrideEngine.matchAPIPattern(
    options.endpoint,
    options.method || 'GET',
    operation
  );

  if (overrideMatch && overrideMatch.rule.classification === 'rate_limiting') {
    return {
      ...baseResult,
      detected: true,
      confidence: Math.max(baseResult.confidence || 0, overrideMatch.confidence),
      overrideApplied: true,
      overrideRule: overrideMatch.rule.id,
      overrideConfidence: overrideMatch.confidence
    };
  }

  return {
    ...baseResult,
    overrideApplied: false
  };
}

/**
 * Create an override engine for OpenAPI imports
 * @param {string} projectRoot - Project root directory
 * @returns {OverrideEngine} Override engine instance
 */
function createOpenAPIOverrideEngine(projectRoot) {
  return new OverrideEngine(projectRoot);
}

module.exports = {
  detectPaginationWithOverrides,
  detectLongRunningWithOverrides,
  detectRateLimitingWithOverrides,
  createOpenAPIOverrideEngine
};
