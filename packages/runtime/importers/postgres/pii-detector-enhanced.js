/*
 * Enhanced PII Detector with Override Support
 *
 * Wraps the base PII detector with override engine integration.
 * Applies community/org/project override rules with precedence.
 */

const { detectPII: baseDetectPII, batchDetectPII: baseBatchDetectPII } = require('./pii-detector');
const { OverrideEngine } = require('../../core/overrides');

/**
 * Enhanced PII detection with overrides
 * @param {string} columnName - Column name
 * @param {string} dataType - Data type
 * @param {array} sampleData - Sample values
 * @param {object} stats - Stats object
 * @param {object} options - Detection options
 * @param {string} options.context - Context (table name)
 * @param {string} options.protocol - Protocol hint
 * @param {OverrideEngine} options.overrideEngine - Override engine instance
 * @returns {object} Enhanced detection result
 */
function detectPIIWithOverrides(columnName, dataType, sampleData, stats = {}, options = {}) {
  // Run base detection
  const baseResult = baseDetectPII(columnName, dataType, sampleData, stats);

  // If no override engine, return base result
  if (!options.overrideEngine) {
    return baseResult;
  }

  // Try to match override rules
  const overrideMatch = options.overrideEngine.matchPIIPattern(columnName, {
    context: options.context,
    dataType: dataType,
    sampleData: sampleData,
    protocol: options.protocol
  });

  if (overrideMatch) {
    // Override found - enhance result
    return {
      ...baseResult,
      detected: true,
      type: overrideMatch.rule.classification,
      confidence: Math.max(baseResult.confidence || 0, overrideMatch.confidence),
      overrideApplied: true,
      overrideRule: overrideMatch.rule.id,
      overrideConfidence: overrideMatch.confidence,
      overrideSignals: overrideMatch.signals,
      signals: [
        ...(baseResult.signals || []),
        { signal: 'override_rule', confidence: overrideMatch.confidence }
      ]
    };
  }

  // No override - return base result with flag
  return {
    ...baseResult,
    overrideApplied: false
  };
}

/**
 * Batch PII detection with overrides
 * @param {array} columns - Columns with metadata
 * @param {object} samplesByColumn - Samples by column name
 * @param {object} options - Detection options
 * @param {string} options.context - Context (table name)
 * @param {string} options.protocol - Protocol hint
 * @param {OverrideEngine} options.overrideEngine - Override engine
 * @returns {object} Detection results by column
 */
function batchDetectPIIWithOverrides(columns, samplesByColumn, options = {}) {
  // Run base batch detection
  const baseResults = baseBatchDetectPII(columns, samplesByColumn);

  // If no override engine, return base results
  if (!options.overrideEngine) {
    return baseResults;
  }

  // Enhance each result with overrides
  const enhancedResults = {};

  for (const [columnName, baseResult] of Object.entries(baseResults)) {
    const column = columns.find(c => c.column_name === columnName);
    const sampleData = samplesByColumn[columnName] || [];

    const overrideMatch = options.overrideEngine.matchPIIPattern(columnName, {
      context: options.context,
      dataType: column?.data_type || column?.udt_name,
      sampleData: sampleData,
      protocol: options.protocol
    });

    if (overrideMatch) {
      enhancedResults[columnName] = {
        ...baseResult,
        detected: true,
        type: overrideMatch.rule.classification,
        confidence: Math.max(baseResult.confidence || 0, overrideMatch.confidence),
        overrideApplied: true,
        overrideRule: overrideMatch.rule.id,
        overrideConfidence: overrideMatch.confidence,
        overrideSignals: overrideMatch.signals,
        signals: [
          ...(baseResult.signals || []),
          { signal: 'override_rule', confidence: overrideMatch.confidence }
        ]
      };
    } else {
      enhancedResults[columnName] = {
        ...baseResult,
        overrideApplied: false
      };
    }
  }

  return enhancedResults;
}

/**
 * Create an override engine for Postgres imports
 * @param {string} projectRoot - Project root directory
 * @returns {OverrideEngine} Override engine instance
 */
function createPostgresOverrideEngine(projectRoot) {
  return new OverrideEngine(projectRoot);
}

module.exports = {
  detectPIIWithOverrides,
  batchDetectPIIWithOverrides,
  createPostgresOverrideEngine
};
