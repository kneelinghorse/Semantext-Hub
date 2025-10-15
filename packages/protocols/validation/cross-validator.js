/**
 * Cross-Protocol Validator
 *
 * Validates URN references across protocol manifests using ProtocolGraph.
 * Checks reference integrity, version compatibility, and semantic consistency.
 */

import { parseURN, normalizeURN, isValidURN, versionMatchesRange } from '../core/graph/urn-utils.js';

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
    
    // Performance optimization caches
    this._urnCache = new Map();
    this._dependencyCache = new Map();
    this._conflictCache = new Map();
    this._protocolTypeCache = new Map();
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
   * Validate a manifest against all registered rules with performance optimization
   * @param {Object} manifest - Protocol manifest
   * @param {Object} options - Validation options
   * @returns {Object} Validation result with issues grouped by severity
   */
  validate(manifest, options = {}) {
    const startTime = performance.now();
    const issues = {
      errors: [],
      warnings: [],
      info: []
    };

    const enabledRules = Array.from(this.rules.values()).filter(rule =>
      rule.enabled && (!options.rules || options.rules.includes(rule.name))
    );

    // Performance optimization: batch process rules
    const ruleResults = this._batchValidateRules(manifest, enabledRules, options);

    for (const result of ruleResults) {
      if (result.error) {
        issues.errors.push({
          rule: result.ruleName,
          type: 'validation_error',
          severity: Severity.ERROR,
          message: `Validation rule failed: ${result.error.message}`,
          error: result.error.stack
        });
        continue;
      }

      for (const issue of result.issues || []) {
        const severity = issue.severity || result.severity;
        const issueObj = {
          rule: result.ruleName,
          type: result.type,
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
    }

    const endTime = performance.now();
    const validationTime = endTime - startTime;

    return {
      valid: issues.errors.length === 0,
      totalIssues: issues.errors.length + issues.warnings.length + issues.info.length,
      issues,
      performance: {
        validationTime,
        rulesExecuted: enabledRules.length,
        averageRuleTime: validationTime / enabledRules.length
      }
    };
  }

  /**
   * Batch validate rules for performance optimization
   * @private
   */
  _batchValidateRules(manifest, rules, options) {
    const results = [];
    
    // Group rules by type for batch processing
    const ruleGroups = this._groupRulesByType(rules);
    
    for (const [ruleType, ruleGroup] of ruleGroups) {
      const batchStart = performance.now();
      
      for (const rule of ruleGroup) {
        try {
          const ruleIssues = rule.fn(manifest, this.graph) || [];
          results.push({
            ruleName: rule.name,
            type: rule.type,
            severity: rule.severity,
            issues: ruleIssues,
            executionTime: performance.now() - batchStart
          });
        } catch (error) {
          results.push({
            ruleName: rule.name,
            type: rule.type,
            severity: rule.severity,
            error,
            executionTime: performance.now() - batchStart
          });
        }
      }
    }
    
    return results;
  }

  /**
   * Group rules by type for efficient batch processing
   * @private
   */
  _groupRulesByType(rules) {
    const groups = new Map();
    
    for (const rule of rules) {
      const type = rule.type || 'general';
      if (!groups.has(type)) {
        groups.set(type, []);
      }
      groups.get(type).push(rule);
    }
    
    return groups;
  }

  /**
   * Validate URN references in a manifest
   * @param {Object} manifest - Manifest to validate
   * @returns {Array} List of URN validation issues
   */
  validateURNReferences(manifest) {
    const issues = [];
    const urns = this._extractURNs(manifest);
    const manifestUrn = manifest.metadata?.urn || manifest.urn;

    for (const { urn, field } of urns) {
      // Check URN format using enhanced validation for all 18 protocol types
      const formatValidation = this._validateURNFormat(urn);
      if (!formatValidation.valid) {
        issues.push({
          message: `Invalid URN format: ${urn}. ${formatValidation.reason}`,
          field,
          value: urn,
          severity: Severity.ERROR,
          suggestion: formatValidation.suggestion
        });
        continue;
      }

      if (manifestUrn && urn === manifestUrn) {
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
      } else {
        // Validate cross-protocol compatibility
        const compatibilityIssues = this._validateCrossProtocolCompatibility(urn, resolved, manifest);
        issues.push(...compatibilityIssues);
      }
    }

    return issues;
  }

  /**
   * Enhanced URN format validation for all 18 protocol types
   * @private
   */
  _validateURNFormat(urn) {
    if (typeof urn !== 'string') {
      return { valid: false, reason: 'URN must be a string', suggestion: 'Provide a valid URN string' };
    }
    const parsed = parseURN(urn);
    if (!parsed) {
      return {
        valid: false,
        reason: 'URN does not match required pattern',
        suggestion: 'Use format: urn:proto:<kind>:<authority>/<id>@<version>'
      };
    }
    if (!parsed.version) {
      return { valid: false, reason: 'URN missing version', suggestion: 'Append @<version> (e.g., @1.0.0)' };
    }
    return { valid: true };
  }

  /**
   * Validate cross-protocol compatibility between URNs
   * @private
   */
  _validateCrossProtocolCompatibility(urn, resolvedUrns, sourceManifest) {
    const issues = [];
    
    for (const targetUrn of resolvedUrns) {
      const targetNode = this.graph.getNode(targetUrn);
      const targetManifest = targetNode?.manifest;
      if (!targetManifest) continue;

      // Check protocol type compatibility
      const sourceType = this._extractProtocolType(sourceManifest);
      const targetType = this._extractProtocolType(targetManifest);
      
      if (sourceType && targetType) {
        const compatibility = this._checkProtocolCompatibility(sourceType, targetType);
        if (!compatibility.compatible) {
          issues.push({
            message: `Protocol type incompatibility: ${sourceType} cannot reference ${targetType}`,
            field: 'cross_protocol_reference',
            value: urn,
            severity: Severity.WARNING,
            suggestion: compatibility.suggestion
          });
        }
      }

      // Version compatibility checks can be added here if needed
    }

    return issues;
  }

  /**
   * Extract protocol type from manifest with caching
   * @private
   */
  _extractProtocolType(manifest) {
    const urn = manifest.metadata?.urn || manifest.urn;
    if (urn && this._protocolTypeCache.has(urn)) {
      return this._protocolTypeCache.get(urn);
    }

    let protocolType = null;

    // Check common protocol type indicators
    if (manifest.catalog) protocolType = 'api';
    else if (manifest.service) protocolType = 'data';
    else if (manifest.event) protocolType = 'event';
    else if (manifest.workflow) protocolType = 'workflow';
    else if (manifest.agent) protocolType = 'agent';
    else if (manifest.component) protocolType = 'ui';
    else if (manifest.resource) protocolType = 'infra';
    else if (manifest.observability) protocolType = 'obs';
    else if (manifest.identity || manifest.access) protocolType = 'iam';
    else if (manifest.release || manifest.deployment) protocolType = 'release';
    else if (manifest.configuration || manifest.settings) protocolType = 'config';
    else if (manifest.documentation || manifest.docs) protocolType = 'docs';
    else if (manifest.analytics || manifest.metrics) protocolType = 'metric';
    else if (manifest.testing || manifest.quality) protocolType = 'testing';
    else if (manifest.integration) protocolType = 'integration';
    else if (manifest.ai || manifest.ml) protocolType = 'ai';
    else if (manifest.device || manifest.hardware) protocolType = 'device';
    else if (manifest.semantic || manifest.ontology) protocolType = 'semantic';
    
    // Fallback to URN parsing
    if (!protocolType && urn) {
      const parts = urn.split(':');
      if (parts.length >= 3 && parts[1] === 'proto') {
        protocolType = parts[2];
      }
    }
    
    // Cache the result
    if (urn) {
      this._protocolTypeCache.set(urn, protocolType);
    }
    
    return protocolType;
  }

  /**
   * Check compatibility between protocol types
   * @private
   */
  _checkProtocolCompatibility(sourceType, targetType) {
    // Define compatibility matrix
    const compatibilityMatrix = {
      'api': ['data', 'event', 'workflow', 'agent', 'ui', 'iam', 'obs', 'config'],
      'data': ['api', 'event', 'workflow', 'agent', 'ui', 'iam', 'obs'],
      'event': ['api', 'data', 'workflow', 'agent', 'ui', 'obs'],
      'workflow': ['api', 'data', 'event', 'agent', 'ui', 'iam', 'obs'],
      'agent': ['api', 'data', 'event', 'workflow', 'ui', 'iam', 'obs', 'ai'],
      'ui': ['api', 'data', 'event', 'workflow', 'agent', 'obs'],
      'infra': ['api', 'data', 'event', 'workflow', 'agent', 'ui', 'obs', 'config'],
      'obs': ['api', 'data', 'event', 'workflow', 'agent', 'ui', 'infra'],
      'iam': ['api', 'data', 'event', 'workflow', 'agent', 'ui'],
      'release': ['api', 'data', 'event', 'workflow', 'agent', 'ui', 'infra'],
      'config': ['api', 'data', 'event', 'workflow', 'agent', 'ui', 'infra'],
      'docs': ['api', 'data', 'event', 'workflow', 'agent', 'ui'],
      'metric': ['api', 'data', 'event', 'workflow', 'agent', 'ui', 'obs'],
      'testing': ['api', 'data', 'event', 'workflow', 'agent', 'ui'],
      'integration': ['api', 'data', 'event', 'workflow', 'agent', 'ui'],
      'ai': ['api', 'data', 'event', 'workflow', 'agent', 'ui'],
      'device': ['api', 'data', 'event', 'workflow', 'agent', 'ui', 'infra'],
      'semantic': ['api', 'data', 'event', 'workflow', 'agent', 'ui']
    };

    const compatibleTypes = compatibilityMatrix[sourceType] || [];
    const compatible = compatibleTypes.includes(targetType);

    return {
      compatible,
      suggestion: compatible 
        ? null 
        : `${sourceType} protocols typically don't reference ${targetType} protocols directly. Consider using an intermediate protocol or reviewing the architecture.`
    };
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
   * Check for circular dependencies with enhanced detection
   * @param {Object} manifest - Manifest to check
   * @returns {Array} Circular dependency issues
   */
  validateCircularDependencies(manifest) {
    const issues = [];
    const urn = manifest.metadata?.urn;

    if (!urn || !this.graph.hasNode(urn)) return issues;

    // Enhanced circular dependency detection
    const cycleAnalysis = this._detectCircularDependencies(urn);
    
    if (cycleAnalysis.hasCycle) {
      for (const cycle of cycleAnalysis.cycles) {
        const cycleLength = cycle.length;
        const severity = cycleLength <= 3 ? Severity.ERROR : Severity.WARNING;
        
        issues.push({
          message: `Circular dependency detected: ${cycle.join(' → ')}`,
          field: 'dependencies',
          value: cycle.join(' -> '),
          severity,
          suggestion: this._getCircularDependencySuggestion(cycle, cycleLength)
        });
      }
    }

    // Check for potential circular dependencies (indirect cycles)
    const potentialCycles = this._detectPotentialCircularDependencies(urn);
    for (const potentialCycle of potentialCycles) {
      issues.push({
        message: `Potential circular dependency: ${potentialCycle.join(' → ')}`,
        field: 'dependencies',
        value: potentialCycle.join(' -> '),
        severity: Severity.INFO,
        suggestion: 'Review dependency chain to prevent future circular references'
      });
    }

    return issues;
  }

  /**
   * Enhanced circular dependency detection using DFS
   * @private
   */
  _detectCircularDependencies(startUrn) {
    const visited = new Set();
    const recursionStack = new Set();
    const cycles = [];
    const path = [];

    const dfs = (urn) => {
      if (recursionStack.has(urn)) {
        // Found a cycle - extract it from path
        const cycleStart = path.indexOf(urn);
        const cycle = [...path.slice(cycleStart), urn];
        cycles.push(cycle);
        return;
      }

      if (visited.has(urn)) return;

      visited.add(urn);
      recursionStack.add(urn);
      path.push(urn);

      // Get all dependencies for this node
      const dependencies = this._getAllDependencies(urn);
      for (const depUrn of dependencies) {
        if (this.graph.hasNode(depUrn)) {
          dfs(depUrn);
        }
      }

      recursionStack.delete(urn);
      path.pop();
    };

    dfs(startUrn);

    return {
      hasCycle: cycles.length > 0,
      cycles
    };
  }

  /**
   * Get all dependencies for a URN (including indirect dependencies) with caching
   * @private
   */
  _getAllDependencies(urn) {
    if (this._dependencyCache.has(urn)) {
      return this._dependencyCache.get(urn);
    }

    const dependencies = new Set();
    const node = this.graph.getNode(urn);
    
    if (!node) {
      this._dependencyCache.set(urn, []);
      return [];
    }

    // Get direct dependencies from manifest
    const manifest = node.manifest;
    if (manifest) {
      const urns = this._extractURNs(manifest);
      for (const { urn: depUrn } of urns) {
        if (depUrn !== urn) {
          dependencies.add(depUrn);
        }
      }
    }

    // Get dependencies from graph outgoing edges
    const edges = this.graph.getOutEdges(urn);
    for (const edge of edges) {
      const kind = edge.kind || edge.type;
      const target = edge.to || edge.target;
      if (kind === 'depends_on' || kind === 'reads_from' || kind === 'writes_to') {
        if (target) dependencies.add(target);
      }
    }

    const result = Array.from(dependencies);
    this._dependencyCache.set(urn, result);
    return result;
  }

  /**
   * Detect potential circular dependencies (indirect cycles)
   * @private
   */
  _detectPotentialCircularDependencies(urn) {
    const potentialCycles = [];
    const visited = new Set();
    const path = [];

    const dfs = (currentUrn, depth = 0) => {
      if (depth > 10) return; // Prevent infinite recursion
      
      if (visited.has(currentUrn)) {
        // Check if this creates a potential cycle
        const cycleStart = path.indexOf(currentUrn);
        if (cycleStart !== -1 && path.length - cycleStart > 1) {
          const potentialCycle = [...path.slice(cycleStart), currentUrn];
          potentialCycles.push(potentialCycle);
        }
        return;
      }

      visited.add(currentUrn);
      path.push(currentUrn);

      const dependencies = this._getAllDependencies(currentUrn);
      for (const depUrn of dependencies) {
        if (this.graph.hasNode(depUrn)) {
          dfs(depUrn, depth + 1);
        }
      }

      path.pop();
      visited.delete(currentUrn);
    };

    dfs(urn);
    return potentialCycles;
  }

  /**
   * Get suggestion for resolving circular dependency
   * @private
   */
  _getCircularDependencySuggestion(cycle, cycleLength) {
    if (cycleLength <= 2) {
      return 'Direct circular dependency detected. Consider merging protocols or introducing a shared abstraction.';
    } else if (cycleLength <= 5) {
      return 'Short circular dependency chain detected. Consider introducing an intermediate protocol or event-driven architecture.';
    } else {
      return 'Long circular dependency chain detected. Consider breaking into smaller, independent protocols with clear boundaries.';
    }
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

      // Extended reference fields for all 18 protocol types
      const refFields = [
        // Core protocol fields
        'depends_on', 'produces', 'consumes', 'reads_from', 'writes_to', 'exposes', 'derives_from',
        // API protocol fields
        'endpoints', 'schemas', 'models', 'operations',
        // Data protocol fields
        'entities', 'tables', 'columns', 'relationships', 'foreign_keys',
        // Event protocol fields
        'channels', 'topics', 'subscriptions', 'publishers',
        // Workflow protocol fields
        'steps', 'nodes', 'edges', 'inputs', 'outputs', 'triggers',
        // Agent protocol fields
        'tools', 'resources', 'prompts', 'models', 'workflows', 'apis', 'data', 'events', 'ui', 'infra', 'iam', 'obs',
        // UI protocol fields
        'components', 'props', 'states', 'flows', 'fetching',
        // Infrastructure protocol fields
        'infrastructure', 'downstream', 'hosts_protocol', 'hosts_urn', 'deployment_artifact',
        // Observability protocol fields
        'targets', 'checks', 'rules', 'alerts', 'dashboards', 'metrics', 'logs', 'traces',
        // IAM protocol fields
        'roles', 'permissions', 'policies', 'principals', 'resources', 'actions',
        // Release/Deployment protocol fields
        'pipelines', 'stages', 'environments', 'artifacts', 'deployments',
        // Configuration protocol fields
        'settings', 'flags', 'secrets', 'configs', 'overrides',
        // Documentation protocol fields
        'docs', 'guides', 'tutorials', 'references', 'examples',
        // Analytics & Metrics protocol fields
        'analytics', 'metrics', 'reports', 'dashboards', 'kpis',
        // Testing/Quality protocol fields
        'tests', 'suites', 'quality_gates', 'coverage', 'benchmarks',
        // Integration protocol fields
        'integrations', 'connectors', 'adapters', 'mappings',
        // AI/ML protocol fields
        'models', 'training', 'inference', 'datasets', 'pipelines',
        // Hardware Device protocol fields
        'devices', 'sensors', 'actuators', 'firmware', 'drivers',
        // Semantic protocol fields
        'ontologies', 'vocabularies', 'concepts', 'relationships', 'bindings'
      ];

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
              } else if (typeof ref === 'object' && ref !== null) {
                // Recurse into array item objects (e.g., endpoints with reads_from fields)
                extract(ref, path ? `${path}.${field}[${idx}]` : `${field}[${idx}]`);
              }
            });
          } else if (typeof obj[field] === 'object' && obj[field] !== null) {
            // Handle nested objects that might contain URNs
            extract(obj[field], path ? `${path}.${field}` : field);
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

    this.registerRule('integration_conflicts', (manifest, graph) => {
      return this.validateIntegrationConflicts(manifest);
    }, { type: RuleType.SEMANTIC_CONSISTENCY, severity: Severity.WARNING });
  }

  /**
   * Validate integration conflicts across protocols
   * @param {Object} manifest - Manifest to check
   * @returns {Array} Integration conflict issues
   */
  validateIntegrationConflicts(manifest) {
    const issues = [];
    const urn = manifest.metadata?.urn;

    if (!urn || !this.graph.hasNode(urn)) return issues;

    // Check for conflicting endpoint definitions
    const endpointConflicts = this._detectEndpointConflicts(manifest);
    issues.push(...endpointConflicts);

    // Check for conflicting data schemas
    const schemaConflicts = this._detectSchemaConflicts(manifest);
    issues.push(...schemaConflicts);

    // Check for conflicting event definitions
    const eventConflicts = this._detectEventConflicts(manifest);
    issues.push(...eventConflicts);

    // Check for conflicting workflow definitions
    const workflowConflicts = this._detectWorkflowConflicts(manifest);
    issues.push(...workflowConflicts);

    // Check for conflicting agent capabilities
    const agentConflicts = this._detectAgentConflicts(manifest);
    issues.push(...agentConflicts);

    // Check for conflicting infrastructure resources
    const infraConflicts = this._detectInfrastructureConflicts(manifest);
    issues.push(...infraConflicts);

    return issues;
  }

  /**
   * Detect conflicting endpoint definitions
   * @private
   */
  _detectEndpointConflicts(manifest) {
    const issues = [];
    
    if (!manifest.catalog?.endpoints) return issues;

    for (const endpoint of manifest.catalog.endpoints) {
      if (!endpoint.path) continue;

      // Check for duplicate paths in the same protocol
      const duplicateEndpoints = manifest.catalog.endpoints.filter(e => 
        e.path === endpoint.path && e !== endpoint
      );
      
      if (duplicateEndpoints.length > 0) {
        issues.push({
          message: `Duplicate endpoint path: ${endpoint.path}`,
          field: 'catalog.endpoints',
          value: endpoint.path,
          severity: Severity.ERROR,
          suggestion: 'Ensure endpoint paths are unique within the protocol'
        });
      }

      // Check for conflicting paths across protocols
      const conflictingProtocols = this._findConflictingProtocols(manifest, 'endpoint', endpoint.path);
      for (const conflict of conflictingProtocols) {
        issues.push({
          message: `Endpoint path conflict: ${endpoint.path} conflicts with ${conflict.protocol}`,
          field: 'catalog.endpoints',
          value: endpoint.path,
          severity: Severity.WARNING,
          suggestion: `Consider using different path or namespace to avoid conflict with ${conflict.protocol}`
        });
      }
    }

    return issues;
  }

  /**
   * Detect conflicting schema definitions
   * @private
   */
  _detectSchemaConflicts(manifest) {
    const issues = [];
    
    if (!manifest.service?.entities) return issues;

    for (const entity of manifest.service.entities) {
      if (!entity.name) continue;

      // Check for duplicate entity names in the same protocol
      const duplicateEntities = manifest.service.entities.filter(e => 
        e.name === entity.name && e !== entity
      );
      
      if (duplicateEntities.length > 0) {
        issues.push({
          message: `Duplicate entity name: ${entity.name}`,
          field: 'service.entities',
          value: entity.name,
          severity: Severity.ERROR,
          suggestion: 'Ensure entity names are unique within the protocol'
        });
      }

      // Check for conflicting schemas across protocols
      const conflictingProtocols = this._findConflictingProtocols(manifest, 'entity', entity.name);
      for (const conflict of conflictingProtocols) {
        issues.push({
          message: `Entity name conflict: ${entity.name} conflicts with ${conflict.protocol}`,
          field: 'service.entities',
          value: entity.name,
          severity: Severity.WARNING,
          suggestion: `Consider using different name or namespace to avoid conflict with ${conflict.protocol}`
        });
      }
    }

    return issues;
  }

  /**
   * Detect conflicting event definitions
   * @private
   */
  _detectEventConflicts(manifest) {
    const issues = [];
    
    if (!manifest.event?.channels) return issues;

    for (const channel of manifest.event.channels) {
      if (!channel.name) continue;

      // Check for duplicate channel names in the same protocol
      const duplicateChannels = manifest.event.channels.filter(c => 
        c.name === channel.name && c !== channel
      );
      
      if (duplicateChannels.length > 0) {
        issues.push({
          message: `Duplicate channel name: ${channel.name}`,
          field: 'event.channels',
          value: channel.name,
          severity: Severity.ERROR,
          suggestion: 'Ensure channel names are unique within the protocol'
        });
      }

      // Check for conflicting channels across protocols
      const conflictingProtocols = this._findConflictingProtocols(manifest, 'channel', channel.name);
      for (const conflict of conflictingProtocols) {
        issues.push({
          message: `Channel name conflict: ${channel.name} conflicts with ${conflict.protocol}`,
          field: 'event.channels',
          value: channel.name,
          severity: Severity.WARNING,
          suggestion: `Consider using different name or namespace to avoid conflict with ${conflict.protocol}`
        });
      }
    }

    return issues;
  }

  /**
   * Detect conflicting workflow definitions
   * @private
   */
  _detectWorkflowConflicts(manifest) {
    const issues = [];
    
    if (!manifest.workflow?.steps) return issues;

    for (const step of manifest.workflow.steps) {
      if (!step.id) continue;

      // Check for duplicate step IDs in the same protocol
      const duplicateSteps = manifest.workflow.steps.filter(s => 
        s.id === step.id && s !== step
      );
      
      if (duplicateSteps.length > 0) {
        issues.push({
          message: `Duplicate step ID: ${step.id}`,
          field: 'workflow.steps',
          value: step.id,
          severity: Severity.ERROR,
          suggestion: 'Ensure step IDs are unique within the protocol'
        });
      }

      // Check for conflicting steps across protocols
      const conflictingProtocols = this._findConflictingProtocols(manifest, 'step', step.id);
      for (const conflict of conflictingProtocols) {
        issues.push({
          message: `Step ID conflict: ${step.id} conflicts with ${conflict.protocol}`,
          field: 'workflow.steps',
          value: step.id,
          severity: Severity.WARNING,
          suggestion: `Consider using different ID or namespace to avoid conflict with ${conflict.protocol}`
        });
      }
    }

    return issues;
  }

  /**
   * Detect conflicting agent capabilities
   * @private
   */
  _detectAgentConflicts(manifest) {
    const issues = [];
    
    if (!manifest.agent?.capabilities?.tools) return issues;

    for (const tool of manifest.agent.capabilities.tools) {
      if (!tool.name) continue;

      // Check for duplicate tool names in the same protocol
      const duplicateTools = manifest.agent.capabilities.tools.filter(t => 
        t.name === tool.name && t !== tool
      );
      
      if (duplicateTools.length > 0) {
        issues.push({
          message: `Duplicate tool name: ${tool.name}`,
          field: 'agent.capabilities.tools',
          value: tool.name,
          severity: Severity.ERROR,
          suggestion: 'Ensure tool names are unique within the protocol'
        });
      }

      // Check for conflicting tools across protocols
      const conflictingProtocols = this._findConflictingProtocols(manifest, 'tool', tool.name);
      for (const conflict of conflictingProtocols) {
        issues.push({
          message: `Tool name conflict: ${tool.name} conflicts with ${conflict.protocol}`,
          field: 'agent.capabilities.tools',
          value: tool.name,
          severity: Severity.WARNING,
          suggestion: `Consider using different name or namespace to avoid conflict with ${conflict.protocol}`
        });
      }
    }

    return issues;
  }

  /**
   * Detect conflicting infrastructure resources
   * @private
   */
  _detectInfrastructureConflicts(manifest) {
    const issues = [];
    
    if (!manifest.resource) return issues;

    const resourceId = manifest.resource.id;
    if (!resourceId) return issues;

    // Check for conflicting resource IDs across protocols
    const conflictingProtocols = this._findConflictingProtocols(manifest, 'resource', resourceId);
    for (const conflict of conflictingProtocols) {
      issues.push({
        message: `Resource ID conflict: ${resourceId} conflicts with ${conflict.protocol}`,
        field: 'resource.id',
        value: resourceId,
        severity: Severity.WARNING,
        suggestion: `Consider using different ID or namespace to avoid conflict with ${conflict.protocol}`
      });
    }

    return issues;
  }

  /**
   * Find conflicting protocols for a given resource type and name
   * @private
   */
  _findConflictingProtocols(manifest, resourceType, resourceName) {
    const conflicts = [];
    const sourceUrn = manifest.metadata?.urn || manifest.urn;
    
    if (!sourceUrn) return conflicts;

    // Get all nodes in the graph
    const allNodes = this.graph.getAllNodes();
    
    for (const node of allNodes) {
      if (node.urn === sourceUrn) continue;
      
      const nodeManifest = node.manifest;
      if (!nodeManifest) continue;

      let hasConflict = false;

      switch (resourceType) {
        case 'endpoint':
          hasConflict = nodeManifest.catalog?.endpoints?.some(e => e.path === resourceName);
          break;
        case 'entity':
          hasConflict = nodeManifest.service?.entities?.some(e => e.name === resourceName);
          break;
        case 'channel':
          hasConflict = nodeManifest.event?.channels?.some(c => c.name === resourceName);
          break;
        case 'step':
          hasConflict = nodeManifest.workflow?.steps?.some(s => s.id === resourceName);
          break;
        case 'tool':
          hasConflict = nodeManifest.agent?.capabilities?.tools?.some(t => t.name === resourceName);
          break;
        case 'resource':
          hasConflict = nodeManifest.resource?.id === resourceName;
          break;
      }

      if (hasConflict) {
        conflicts.push({
          protocol: nodeUrn,
          type: resourceType,
          name: resourceName
        });
      }
    }

    return conflicts;
  }
}

export {
  CrossValidator,
  RuleType,
  Severity
};
