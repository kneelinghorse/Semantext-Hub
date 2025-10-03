/*
 * Override Rule Exporter
 *
 * Exports user corrections and patterns as shareable override rules.
 * Supports:
 * - Converting detection results to rules
 * - Packaging rules for distribution
 * - Rule quality validation
 * - Metadata enrichment
 */

const fs = require('fs');
const path = require('path');
const { validateRule } = require('./schema');

/**
 * Rule exporter class
 */
class RuleExporter {
  constructor() {
    this.pendingRules = [];
    this.exportedRules = [];
  }

  /**
   * Create a PII pattern rule from a field detection
   * @param {object} detection - Detection result
   * @param {string} detection.fieldName - Field name
   * @param {string} detection.context - Context (table, endpoint, etc.)
   * @param {string} detection.type - Detected PII type
   * @param {number} detection.confidence - Detection confidence
   * @param {object} options - Export options
   * @param {string} options.author - Rule author
   * @param {string} options.protocol - Protocol hint
   * @param {string} options.description - Rule description
   * @returns {object} Generated rule
   */
  createPIIRule(detection, options = {}) {
    const ruleId = this._generateRuleId('pii', detection.fieldName, detection.context);

    const rule = {
      id: ruleId,
      type: 'pii_pattern',
      pattern: {
        field: detection.fieldName,
        context: detection.context || null,
        data_pattern: detection.dataPattern || null,
        type_hint: detection.dataType || null
      },
      classification: detection.type || 'pii',
      confidence: Math.min(detection.confidence || 0.8, 1.0),
      metadata: {
        source: 'community',
        author: options.author || 'anonymous',
        created: new Date().toISOString(),
        verified_by: 0,
        description: options.description || `PII pattern for ${detection.fieldName}`,
        tags: detection.tags || [],
        protocol_hints: options.protocol ? [options.protocol] : []
      }
    };

    // Validate before adding
    const validation = validateRule(rule);
    if (!validation.valid) {
      throw new Error(`Invalid rule: ${validation.errors.join(', ')}`);
    }

    this.pendingRules.push(rule);
    return rule;
  }

  /**
   * Create an API pattern rule from an operation detection
   * @param {object} detection - Detection result
   * @param {string} detection.endpoint - Endpoint path
   * @param {string} detection.method - HTTP method
   * @param {string} detection.pattern - Pattern type (pagination, lro, rate_limit)
   * @param {number} detection.confidence - Detection confidence
   * @param {object} options - Export options
   * @returns {object} Generated rule
   */
  createAPIRule(detection, options = {}) {
    const ruleId = this._generateRuleId('api', detection.pattern, detection.endpoint);

    const rule = {
      id: ruleId,
      type: 'api_pattern',
      pattern: {
        endpoint: detection.endpoint,
        method: detection.method || 'GET',
        parameters: detection.parameters || [],
        response: detection.response || null
      },
      classification: detection.pattern,
      confidence: Math.min(detection.confidence || 0.8, 1.0),
      metadata: {
        source: 'community',
        author: options.author || 'anonymous',
        created: new Date().toISOString(),
        verified_by: 0,
        description: options.description || `${detection.pattern} pattern for ${detection.endpoint}`,
        tags: options.tags || [],
        protocol_hints: options.protocol ? [options.protocol] : []
      }
    };

    const validation = validateRule(rule);
    if (!validation.valid) {
      throw new Error(`Invalid rule: ${validation.errors.join(', ')}`);
    }

    this.pendingRules.push(rule);
    return rule;
  }

  /**
   * Create a classification rule
   * @param {object} detection - Detection result
   * @param {object} options - Export options
   * @returns {object} Generated rule
   */
  createClassificationRule(detection, options = {}) {
    const ruleId = this._generateRuleId('classification', detection.fieldName, detection.context);

    const rule = {
      id: ruleId,
      type: 'classification',
      pattern: {
        field: detection.fieldName,
        context: detection.context || null,
        value_pattern: detection.valuePattern || null
      },
      classification: detection.classification || 'public',
      confidence: Math.min(detection.confidence || 0.8, 1.0),
      metadata: {
        source: 'community',
        author: options.author || 'anonymous',
        created: new Date().toISOString(),
        verified_by: 0,
        description: options.description || `Classification rule for ${detection.fieldName}`,
        tags: options.tags || [],
        protocol_hints: options.protocol ? [options.protocol] : []
      }
    };

    const validation = validateRule(rule);
    if (!validation.valid) {
      throw new Error(`Invalid rule: ${validation.errors.join(', ')}`);
    }

    this.pendingRules.push(rule);
    return rule;
  }

  /**
   * Create a data format rule
   * @param {object} detection - Detection result
   * @param {object} options - Export options
   * @returns {object} Generated rule
   */
  createDataFormatRule(detection, options = {}) {
    const ruleId = this._generateRuleId('format', detection.format);

    const rule = {
      id: ruleId,
      type: 'data_format',
      pattern: {
        format: detection.format,
        regex: detection.regex,
        validator: detection.validator || null
      },
      classification: detection.classification || 'format',
      confidence: Math.min(detection.confidence || 0.8, 1.0),
      metadata: {
        source: 'community',
        author: options.author || 'anonymous',
        created: new Date().toISOString(),
        verified_by: 0,
        description: options.description || `Data format rule for ${detection.format}`,
        tags: options.tags || []
      }
    };

    const validation = validateRule(rule);
    if (!validation.valid) {
      throw new Error(`Invalid rule: ${validation.errors.join(', ')}`);
    }

    this.pendingRules.push(rule);
    return rule;
  }

  /**
   * Generate a unique rule ID
   * @param {string} type - Rule type
   * @param {string} ...parts - ID parts
   * @returns {string} Generated ID
   */
  _generateRuleId(type, ...parts) {
    const slug = parts
      .filter(p => p)
      .map(p => String(p).toLowerCase().replace(/[^a-z0-9]+/g, '-'))
      .join('-');

    return `${type}-${slug}`;
  }

  /**
   * Export pending rules to a file
   * @param {string} filePath - Output file path
   * @param {object} options - Export options
   * @param {boolean} options.pretty - Pretty print JSON
   * @param {boolean} options.clear - Clear pending rules after export
   * @returns {object} Export result
   */
  exportToFile(filePath, options = {}) {
    if (this.pendingRules.length === 0) {
      return {
        success: false,
        error: 'No pending rules to export'
      };
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Format JSON
      const content = options.pretty
        ? JSON.stringify(this.pendingRules, null, 2)
        : JSON.stringify(this.pendingRules);

      // Write file
      fs.writeFileSync(filePath, content, 'utf8');

      // Track exported rules
      this.exportedRules.push(...this.pendingRules);

      const count = this.pendingRules.length;

      // Clear pending if requested
      if (options.clear !== false) {
        this.pendingRules = [];
      }

      return {
        success: true,
        file: filePath,
        count
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Export as a rule pack with metadata
   * @param {string} packName - Pack name
   * @param {string} outputDir - Output directory
   * @param {object} packMetadata - Pack metadata
   * @returns {object} Export result
   */
  exportAsPack(packName, outputDir, packMetadata = {}) {
    if (this.pendingRules.length === 0) {
      return {
        success: false,
        error: 'No pending rules to export'
      };
    }

    try {
      // Create pack directory
      const packDir = path.join(outputDir, packName);
      if (!fs.existsSync(packDir)) {
        fs.mkdirSync(packDir, { recursive: true });
      }

      // Create pack manifest
      const manifest = {
        name: packName,
        version: packMetadata.version || '1.0.0',
        description: packMetadata.description || '',
        author: packMetadata.author || 'anonymous',
        created: new Date().toISOString(),
        rules_count: this.pendingRules.length,
        tags: packMetadata.tags || []
      };

      // Write manifest
      fs.writeFileSync(
        path.join(packDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf8'
      );

      // Group rules by type
      const rulesByType = {};
      for (const rule of this.pendingRules) {
        if (!rulesByType[rule.type]) {
          rulesByType[rule.type] = [];
        }
        rulesByType[rule.type].push(rule);
      }

      // Write rules by type
      for (const [type, rules] of Object.entries(rulesByType)) {
        const fileName = `${type}.json`;
        fs.writeFileSync(
          path.join(packDir, fileName),
          JSON.stringify(rules, null, 2),
          'utf8'
        );
      }

      // Track exported rules
      this.exportedRules.push(...this.pendingRules);

      const count = this.pendingRules.length;
      this.pendingRules = [];

      return {
        success: true,
        pack: packName,
        directory: packDir,
        count,
        manifest
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get pending rules
   * @returns {array} Pending rules
   */
  getPendingRules() {
    return this.pendingRules;
  }

  /**
   * Get exported rules count
   * @returns {number} Count of exported rules
   */
  getExportedCount() {
    return this.exportedRules.length;
  }

  /**
   * Clear pending rules
   */
  clearPending() {
    this.pendingRules = [];
  }

  /**
   * Validate all pending rules
   * @returns {object} Validation result
   */
  validatePending() {
    const errors = [];

    for (const rule of this.pendingRules) {
      const validation = validateRule(rule);
      if (!validation.valid) {
        errors.push({
          rule: rule.id,
          errors: validation.errors
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = {
  RuleExporter
};
