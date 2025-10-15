/*
 * Override System - Main Entry Point
 *
 * Community-contributed override rules for enhanced protocol discovery.
 *
 * Features:
 * - Rule loading with precedence (project > org > community)
 * - Pattern matching with confidence scoring
 * - Temporal decay for aging rules
 * - Rule export for sharing corrections
 *
 * Usage:
 *   const { OverrideEngine } = require('./core/overrides');
 *   const engine = new OverrideEngine('/path/to/project');
 *   const match = engine.matchPIIPattern('email', { context: 'customers' });
 */

const { RuleLoader, createStandardLoader } = require('./loader');
const { PatternMatcher } = require('./matcher');
const { RuleExporter } = require('./exporter');
const {
  validateRule,
  calculateEffectiveConfidence,
  getPrecedence,
  RULE_TYPES,
  PRECEDENCE
} = require('./schema');

/**
 * Override engine - main interface
 */
class OverrideEngine {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.loader = createStandardLoader(projectRoot);
    this.matcher = new PatternMatcher(this.loader);
    this.exporter = new RuleExporter();
  }

  /**
   * Match a field against PII pattern rules
   * @param {string} fieldName - Field name
   * @param {object} options - Matching options
   * @returns {object|null} Best match with rule and confidence
   */
  matchPIIPattern(fieldName, options = {}) {
    return this.matcher.matchPIIPattern(fieldName, options);
  }

  /**
   * Match an API endpoint against API pattern rules
   * @param {string} endpoint - Endpoint path
   * @param {string} method - HTTP method
   * @param {object} operation - Operation details
   * @returns {object|null} Best match with rule and confidence
   */
  matchAPIPattern(endpoint, method, operation = {}) {
    return this.matcher.matchAPIPattern(endpoint, method, operation);
  }

  /**
   * Enhance a detection result with override rules
   * @param {object} detection - Original detection result
   * @param {string} type - Detection type (pii, api, classification)
   * @returns {object} Enhanced detection with override confidence
   */
  enhanceDetection(detection, type = 'pii') {
    if (type === 'pii') {
      const match = this.matchPIIPattern(detection.fieldName || detection.field, {
        context: detection.context,
        dataType: detection.dataType,
        sampleData: detection.sampleData,
        protocol: detection.protocol
      });

      if (match) {
        return {
          ...detection,
          overrideApplied: true,
          overrideConfidence: match.confidence,
          overrideRule: match.rule.id,
          confidence: Math.max(detection.confidence || 0, match.confidence),
          signals: [...(detection.signals || []), ...match.signals]
        };
      }
    } else if (type === 'api') {
      const match = this.matchAPIPattern(detection.endpoint, detection.method, detection.operation);

      if (match) {
        return {
          ...detection,
          overrideApplied: true,
          overrideConfidence: match.confidence,
          overrideRule: match.rule.id,
          confidence: Math.max(detection.confidence || 0, match.confidence),
          signals: [...(detection.signals || []), ...match.signals]
        };
      }
    }

    // No override match
    return {
      ...detection,
      overrideApplied: false
    };
  }

  /**
   * Create a rule from a detection result
   * @param {object} detection - Detection result
   * @param {string} type - Rule type (pii, api, classification)
   * @param {object} options - Export options
   * @returns {object} Created rule
   */
  createRule(detection, type = 'pii', options = {}) {
    if (type === 'pii') {
      return this.exporter.createPIIRule(detection, options);
    } else if (type === 'api') {
      return this.exporter.createAPIRule(detection, options);
    } else if (type === 'classification') {
      return this.exporter.createClassificationRule(detection, options);
    }

    throw new Error(`Unsupported rule type: ${type}`);
  }

  /**
   * Export pending rules to a file
   * @param {string} filePath - Output file path
   * @param {object} options - Export options
   * @returns {object} Export result
   */
  exportRules(filePath, options = {}) {
    return this.exporter.exportToFile(filePath, options);
  }

  /**
   * Export as a rule pack
   * @param {string} packName - Pack name
   * @param {string} outputDir - Output directory
   * @param {object} packMetadata - Pack metadata
   * @returns {object} Export result
   */
  exportPack(packName, outputDir, packMetadata = {}) {
    return this.exporter.exportAsPack(packName, outputDir, packMetadata);
  }

  /**
   * Load additional rules from a directory or file
   * @param {string} path - Directory or file path
   * @param {string} source - Rule source (project, organization, community)
   * @returns {number} Number of rules loaded
   */
  loadRules(path, source = 'community') {
    const fs = require('fs');
    const stats = fs.statSync(path);

    if (stats.isDirectory()) {
      return this.loader.loadFromDirectory(path, source);
    } else {
      return this.loader.loadFromFile(path, source);
    }
  }

  /**
   * Get rule statistics
   * @returns {object} Statistics
   */
  getStats() {
    const loaderStats = this.loader.getStats();
    const cacheStats = this.matcher.getCacheStats();

    return {
      rules: loaderStats,
      cache: cacheStats,
      pending: this.exporter.getPendingRules().length,
      exported: this.exporter.getExportedCount()
    };
  }

  /**
   * Get all rules
   * @returns {array} All loaded rules
   */
  getRules() {
    return this.loader.getAllRules();
  }

  /**
   * Get rules by type
   * @param {string} type - Rule type
   * @returns {array} Rules of the specified type
   */
  getRulesByType(type) {
    return this.loader.getRulesByType(type);
  }

  /**
   * Clear match cache
   */
  clearCache() {
    this.matcher.clearCache();
  }

  /**
   * Get loading errors
   * @returns {array} Loading errors
   */
  getErrors() {
    return this.loader.getErrors();
  }
}

module.exports = {
  OverrideEngine,
  RuleLoader,
  PatternMatcher,
  RuleExporter,
  validateRule,
  calculateEffectiveConfidence,
  getPrecedence,
  RULE_TYPES,
  PRECEDENCE
};
