/*
 * Override Rule Loader
 *
 * Loads override rules from multiple sources with precedence:
 * 1. Project - .proto/overrides/ (highest)
 * 2. Organization - Shared org repository
 * 3. Community - Public community packs (lowest)
 *
 * Supports:
 * - Directory scanning for rule files
 * - JSON rule file parsing
 * - Rule validation and error reporting
 * - Precedence-based merging
 */

const fs = require('fs');
const path = require('path');
const { validateRule, getPrecedence, calculateEffectiveConfidence } = require('./schema');

/**
 * Rule loader class
 */
class RuleLoader {
  constructor() {
    this.rules = [];           // All loaded rules
    this.rulesByType = {};     // Rules indexed by type
    this.rulesById = {};       // Rules indexed by id
    this.errors = [];          // Loading errors
  }

  /**
   * Load rules from a directory
   * @param {string} dirPath - Directory path
   * @param {string} source - Rule source (project, organization, community)
   * @returns {number} Number of rules loaded
   */
  loadFromDirectory(dirPath, source = 'community') {
    if (!fs.existsSync(dirPath)) {
      return 0;
    }

    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      this.errors.push({ path: dirPath, error: 'Not a directory' });
      return 0;
    }

    let loadedCount = 0;
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const fileStat = fs.statSync(filePath);

      if (fileStat.isDirectory()) {
        // Recursively load subdirectories
        loadedCount += this.loadFromDirectory(filePath, source);
      } else if (file.endsWith('.json')) {
        const count = this.loadFromFile(filePath, source);
        loadedCount += count;
      }
    }

    return loadedCount;
  }

  /**
   * Load rules from a JSON file
   * @param {string} filePath - File path
   * @param {string} source - Rule source
   * @returns {number} Number of rules loaded
   */
  loadFromFile(filePath, source = 'community') {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);

      // Support both single rule and array of rules
      const rules = Array.isArray(data) ? data : [data];

      let loadedCount = 0;
      for (const rule of rules) {
        // Set source if not specified
        if (!rule.metadata) {
          rule.metadata = {};
        }
        if (!rule.metadata.source) {
          rule.metadata.source = source;
        }

        // Validate and add rule
        const validation = validateRule(rule);
        if (validation.valid) {
          this.addRule(rule);
          loadedCount++;
        } else {
          this.errors.push({
            file: filePath,
            rule: rule.id || 'unknown',
            errors: validation.errors
          });
        }
      }

      return loadedCount;
    } catch (error) {
      this.errors.push({
        file: filePath,
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Add a rule to the loader
   * @param {object} rule - Rule to add
   */
  addRule(rule) {
    // Check for duplicates
    const existingRule = this.rulesById[rule.id];
    if (existingRule) {
      // Apply precedence - higher precedence wins
      const existingPrecedence = getPrecedence(existingRule.metadata?.source);
      const newPrecedence = getPrecedence(rule.metadata?.source);

      if (newPrecedence > existingPrecedence) {
        // Replace with higher precedence rule
        this.removeRule(existingRule.id);
        this._addRule(rule);
      } else if (newPrecedence === existingPrecedence) {
        // Same precedence - use higher confidence
        const existingConfidence = calculateEffectiveConfidence(existingRule);
        const newConfidence = calculateEffectiveConfidence(rule);

        if (newConfidence > existingConfidence) {
          this.removeRule(existingRule.id);
          this._addRule(rule);
        }
      }
      // Lower precedence - ignore
    } else {
      this._addRule(rule);
    }
  }

  /**
   * Internal method to add rule without precedence check
   * @param {object} rule - Rule to add
   */
  _addRule(rule) {
    this.rules.push(rule);
    this.rulesById[rule.id] = rule;

    // Index by type
    if (!this.rulesByType[rule.type]) {
      this.rulesByType[rule.type] = [];
    }
    this.rulesByType[rule.type].push(rule);
  }

  /**
   * Remove a rule by ID
   * @param {string} ruleId - Rule ID to remove
   */
  removeRule(ruleId) {
    const rule = this.rulesById[ruleId];
    if (!rule) return;

    // Remove from main array
    this.rules = this.rules.filter(r => r.id !== ruleId);

    // Remove from type index
    if (this.rulesByType[rule.type]) {
      this.rulesByType[rule.type] = this.rulesByType[rule.type].filter(r => r.id !== ruleId);
    }

    // Remove from ID index
    delete this.rulesById[ruleId];
  }

  /**
   * Get all rules of a specific type
   * @param {string} type - Rule type
   * @returns {array} Rules of the specified type
   */
  getRulesByType(type) {
    return this.rulesByType[type] || [];
  }

  /**
   * Get rule by ID
   * @param {string} ruleId - Rule ID
   * @returns {object|null} Rule or null if not found
   */
  getRuleById(ruleId) {
    return this.rulesById[ruleId] || null;
  }

  /**
   * Get all rules
   * @returns {array} All loaded rules
   */
  getAllRules() {
    return this.rules;
  }

  /**
   * Get loading errors
   * @returns {array} Array of error objects
   */
  getErrors() {
    return this.errors;
  }

  /**
   * Get rule statistics
   * @returns {object} Statistics about loaded rules
   */
  getStats() {
    const stats = {
      total: this.rules.length,
      errors: this.errors.length,
      byType: {},
      bySource: {}
    };

    for (const rule of this.rules) {
      // Count by type
      stats.byType[rule.type] = (stats.byType[rule.type] || 0) + 1;

      // Count by source
      const source = rule.metadata?.source || 'unknown';
      stats.bySource[source] = (stats.bySource[source] || 0) + 1;
    }

    return stats;
  }

  /**
   * Clear all loaded rules
   */
  clear() {
    this.rules = [];
    this.rulesByType = {};
    this.rulesById = {};
    this.errors = [];
  }
}

/**
 * Create a loader with standard directory structure
 * @param {string} projectRoot - Project root directory
 * @returns {RuleLoader} Configured loader
 */
function createStandardLoader(projectRoot) {
  const loader = new RuleLoader();

  // Load in precedence order (lowest to highest)
  // Community rules (bundled with package)
  const communityPath = path.join(__dirname, '../../overrides/community');
  loader.loadFromDirectory(communityPath, 'community');

  // Organization rules (if configured)
  const orgPath = process.env.PROTO_ORG_OVERRIDES;
  if (orgPath) {
    loader.loadFromDirectory(orgPath, 'organization');
  }

  // Project rules (highest precedence)
  const projectPath = path.join(projectRoot, '.proto/overrides');
  loader.loadFromDirectory(projectPath, 'project');

  return loader;
}

module.exports = {
  RuleLoader,
  createStandardLoader
};
