/**
 * Cross-Protocol Validator
 *
 * Validates URN references across protocol manifests using ProtocolGraph.
 * Checks reference integrity, version compatibility, and semantic consistency.
 */

const { parseURN, normalizeURN, isValidURN, versionMatchesRange } = require('../core/graph/urn-utils');

/**
 * Validation rule types
 */
const RuleType = {
  URN_FORMAT: 'urn_format',
  URN_RESOLUTION: 'urn_resolution',
  VERSION_COMPATIBILITY: 'version_compatibility',
  SEMANTIC_CONSISTENCY: 'semantic_consistency',
  CIRCULAR_DEPENDENCY: 'circular_dependency',
  PII_EXPOSURE: 'pii_exposure'
};

/**
 * Validation severity levels
 */
const Severity = {
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

/**
 * Cross-protocol validator registry
 */
class CrossValidator {
  constructor(protocolGraph) {
    this.graph = protocolGraph;
    this.rules = new Map();
    this._registerDefaultRules();
  }

  /**
   * Register a validation rule
   * @param {string} name - Rule name
   * @param {Function} fn - Validation function (manifest, graph) => issues[]
   * @param {Object} options - Rule options (enabled, severity, etc.)
   */
  registerRule(name, fn, options = {}) {
    this.rules.set(name, {
      name,
      fn,
      enabled: options.enabled !== false,
      severity: options.severity || Severity.ERROR,
      type: options.type || RuleType.URN_RESOLUTION
    });
  }

  /**
   * Validate a manifest against all registered rules
   * @param {Object} manifest - Protocol manifest
   * @param {Object} options - Validation options
   * @returns {Object} Validation result with issues grouped by severity
   */
  validate(manifest, options = {}) {
    const issues = {
      errors: [],
      warnings: [],
      info: []
    };

    const enabledRules = Array.from(this.rules.values()).filter(rule =>
      rule.enabled && (!options.rules || options.rules.includes(rule.name))
    );

    for (const rule of enabledRules) {
      try {
        const ruleIssues = rule.fn(manifest, this.graph) || [];
        for (const issue of ruleIssues) {
          const severity = issue.severity || rule.severity;
          const issueObj = {
            rule: rule.name,
            type: rule.type,
            severity,
            message: issue.message,
            field: issue.field,
            value: issue.value,
            suggestion: issue.suggestion
          };

          if (severity === Severity.ERROR) {
            issues.errors.push(issueObj);
          } else if (severity === Severity.WARNING) {
            issues.warnings.push(issueObj);
          } else {
            issues.info.push(issueObj);
          }
        }
      } catch (error) {
        issues.errors.push({
          rule: rule.name,
          type: 'validation_error',
          severity: Severity.ERROR,
          message: `Validation rule failed: ${error.message}`,
          error: error.stack
        });
      }
    }

    return {
      valid: issues.errors.length === 0,
      totalIssues: issues.errors.length + issues.warnings.length + issues.info.length,
      issues
    };
  }

  /**
   * Validate URN references in a manifest
   * @param {Object} manifest - Manifest to validate
   * @returns {Array} List of URN validation issues
   */
  validateURNReferences(manifest) {
    const issues = [];
    const urns = this._extractURNs(manifest);

    for (const { urn, field } of urns) {
      // Check URN format
      if (!isValidURN(urn)) {
        issues.push({
          message: `Invalid URN format: ${urn}`,
          field,
          value: urn,
          severity: Severity.ERROR
        });
        continue;
      }

      // Check if URN can be resolved in graph
      const resolved = this.graph.resolveURN(urn);
      if (!resolved || resolved.length === 0) {
        issues.push({
          message: `Unresolved URN reference: ${urn}`,
          field,
          value: urn,
          severity: Severity.WARNING,
          suggestion: 'Ensure the referenced manifest is loaded into the graph'
        });
      }
    }

    return issues;
  }

  /**
   * Validate version compatibility between manifests
   * @param {Object} manifest - Source manifest
   * @returns {Array} Version compatibility issues
   */
  validateVersionCompatibility(manifest) {
    const issues = [];
    const urn = manifest.metadata?.urn;

    if (!urn) return issues;

    const parsed = parseURN(urn);
    if (!parsed?.version) return issues;

    // Check for breaking changes compared to other versions
    const normalized = normalizeURN(urn);

    // Access urnIndex directly since findNodesByURNBase doesn't exist
    const allVersions = this.graph.urnIndex?.get(normalized);
    if (!allVersions || allVersions.size === 0) return issues;

    for (const otherURN of allVersions) {
      if (otherURN === urn) continue;

      const otherParsed = parseURN(otherURN);
      if (!otherParsed?.version) continue;

      // Semantic versioning check: major version changes are breaking
      const [myMajor] = parsed.version.split('.').map(Number);
      const [otherMajor] = otherParsed.version.split('.').map(Number);

      if (myMajor > otherMajor) {
        issues.push({
          message: `Major version increase from ${otherParsed.version} to ${parsed.version} indicates breaking changes`,
          field: 'metadata.version',
          value: parsed.version,
          severity: Severity.INFO,
          suggestion: 'Ensure migration documentation is provided'
        });
      }
    }

    return issues;
  }

  /**
   * Check for circular dependencies
   * @param {Object} manifest - Manifest to check
   * @returns {Array} Circular dependency issues
   */
  validateCircularDependencies(manifest) {
    const issues = [];
    const urn = manifest.metadata?.urn;

    if (!urn || !this.graph.hasNode(urn)) return issues;

    const cycle = this.graph.getCycle(urn);

    if (cycle && cycle.length > 0) {
      issues.push({
        message: `Circular dependency detected involving ${cycle.length} manifests`,
        field: 'dependencies',
        value: cycle.join(' -> '),
        severity: Severity.WARNING,
        suggestion: 'Consider breaking the cycle by introducing an abstraction layer'
      });
    }

    return issues;
  }

  /**
   * Validate PII exposure paths
   * @param {Object} manifest - Manifest to check
   * @returns {Array} PII exposure issues
   */
  validatePIIExposure(manifest) {
    const issues = [];
    const urn = manifest.metadata?.urn;

    if (!urn || !this.graph.hasNode(urn)) return issues;

    // Check if this manifest exposes PII
    const nodeData = this.graph.getNode(urn);
    const hasPII = this._manifestContainsPII(nodeData.manifest);

    if (!hasPII) return issues;

    // Trace PII flow to public endpoints using the PII tracer
    const { findPIIExposingEndpoints } = require('../core/graph/pii-tracer');
    const exposingEndpoints = findPIIExposingEndpoints(this.graph);

    // Filter to endpoints that use this URN as a source
    const relevantEndpoints = exposingEndpoints.filter(ep =>
      ep.sources && ep.sources.includes(urn)
    );

    if (relevantEndpoints.length > 0) {
      issues.push({
        message: `PII data is exposed through ${relevantEndpoints.length} public endpoint(s)`,
        field: 'pii_exposure',
        value: relevantEndpoints.map(ep => ep.endpoint).slice(0, 5).join(', '),
        severity: Severity.WARNING,
        suggestion: 'Review data masking, encryption, and access controls'
      });
    }

    return issues;
  }

  /**
   * Extract all URN references from a manifest
   * @private
   */
  _extractURNs(manifest, prefix = '') {
    const urns = [];

    const extract = (obj, path) => {
      if (!obj || typeof obj !== 'object') return;

      // Check common URN fields
      if (obj.urn && typeof obj.urn === 'string') {
        urns.push({ urn: obj.urn, field: path ? `${path}.urn` : 'urn' });
      }

      // Check reference fields
      const refFields = ['depends_on', 'produces', 'consumes', 'reads_from', 'writes_to', 'exposes', 'derives_from'];
      for (const field of refFields) {
        if (obj[field]) {
          if (typeof obj[field] === 'string') {
            urns.push({ urn: obj[field], field: path ? `${path}.${field}` : field });
          } else if (Array.isArray(obj[field])) {
            obj[field].forEach((ref, idx) => {
              if (typeof ref === 'string') {
                urns.push({ urn: ref, field: path ? `${path}.${field}[${idx}]` : `${field}[${idx}]` });
              } else if (ref?.urn) {
                urns.push({ urn: ref.urn, field: path ? `${path}.${field}[${idx}].urn` : `${field}[${idx}].urn` });
              }
            });
          }
        }
      }

      // Recurse into nested objects
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null && !refFields.includes(key)) {
          extract(value, path ? `${path}.${key}` : key);
        }
      }
    };

    extract(manifest, prefix);
    return urns;
  }

  /**
   * Check if manifest contains PII markers
   * @private
   */
  _manifestContainsPII(manifest) {
    const checkPII = (obj) => {
      if (!obj || typeof obj !== 'object') return false;

      if (obj.pii === true || obj.is_pii === true || obj.contains_pii === true) {
        return true;
      }

      if (obj.classification === 'pii' || obj.sensitivity === 'high') {
        return true;
      }

      return Object.values(obj).some(val =>
        typeof val === 'object' && val !== null && checkPII(val)
      );
    };

    return checkPII(manifest);
  }

  /**
   * Register default validation rules
   * @private
   */
  _registerDefaultRules() {
    this.registerRule('urn_references', (manifest, graph) => {
      return this.validateURNReferences(manifest);
    }, { type: RuleType.URN_RESOLUTION });

    this.registerRule('version_compatibility', (manifest, graph) => {
      return this.validateVersionCompatibility(manifest);
    }, { type: RuleType.VERSION_COMPATIBILITY, severity: Severity.INFO });

    this.registerRule('circular_dependencies', (manifest, graph) => {
      return this.validateCircularDependencies(manifest);
    }, { type: RuleType.CIRCULAR_DEPENDENCY, severity: Severity.WARNING });

    this.registerRule('pii_exposure', (manifest, graph) => {
      return this.validatePIIExposure(manifest);
    }, { type: RuleType.PII_EXPOSURE, severity: Severity.WARNING });
  }
}

module.exports = {
  CrossValidator,
  RuleType,
  Severity
};
