/**
 * Breaking Change Detector
 *
 * Analyzes manifest diffs to identify and classify breaking changes.
 * Uses graph traversal to assess downstream impact.
 */

import { ImpactLevel } from './engine.js';

/**
 * Breaking change categories
 */
const BreakingCategory = {
  REMOVED_ENDPOINT: 'removed_endpoint',
  REMOVED_FIELD: 'removed_field',
  TYPE_CHANGE: 'type_change',
  REQUIRED_FIELD_ADDED: 'required_field_added',
  AUTH_CHANGE: 'auth_change',
  CONTRACT_VIOLATION: 'contract_violation',
  SEMANTIC_CHANGE: 'semantic_change'
};

/**
 * Breaking change detector
 */
class BreakingChangeDetector {
  constructor(protocolGraph) {
    this.graph = protocolGraph;
  }

  /**
   * Detect breaking changes from a diff report
   * @param {Object} diffReport - Diff report from DiffEngine
   * @param {string} manifestURN - URN of the manifest being analyzed
   * @returns {Object} Breaking change analysis with impact assessment
   */
  detectBreakingChanges(diffReport, manifestURN) {
    const breakingChanges = diffReport.changes.breaking || [];

    // Classify breaking changes
    const classified = breakingChanges.map(change =>
      this._classifyBreakingChange(change)
    );

    // Assess downstream impact using graph
    const downstreamImpact = this._assessDownstreamImpact(manifestURN, classified);

    // Calculate risk score
    const riskScore = this._calculateRiskScore(classified, downstreamImpact);

    return {
      hasBreakingChanges: classified.length > 0,
      breakingChanges: classified,
      downstreamImpact,
      riskScore,
      recommendation: this._generateRecommendation(classified, riskScore)
    };
  }

  /**
   * Classify a breaking change into categories
   * @private
   */
  _classifyBreakingChange(change) {
    let category = BreakingCategory.CONTRACT_VIOLATION;
    let severity = 'medium';

    if (change.path.includes('endpoints') && change.type === 'removed') {
      category = BreakingCategory.REMOVED_ENDPOINT;
      severity = 'high';
    } else if (change.path.includes('required') && change.type === 'added') {
      category = BreakingCategory.REQUIRED_FIELD_ADDED;
      severity = 'high';
    } else if (change.path.includes('.type') && change.type === 'modified') {
      category = BreakingCategory.TYPE_CHANGE;
      severity = 'high';
    } else if (change.path.includes('.auth')) {
      category = BreakingCategory.AUTH_CHANGE;
      severity = 'high';
    } else if (change.type === 'removed') {
      category = BreakingCategory.REMOVED_FIELD;
      severity = 'medium';
    }

    return {
      ...change,
      category,
      severity
    };
  }

  /**
   * Assess impact on downstream consumers
   * @private
   */
  _assessDownstreamImpact(manifestURN, breakingChanges) {
    if (!manifestURN || !this.graph.hasNode(manifestURN)) {
      return {
        affectedManifests: [],
        totalAffected: 0,
        criticalPath: false
      };
    }

    // Find all manifests that depend on this one (using graph traversal)
    const downstreamNodes = [];
    const visited = new Set();
    const queue = [manifestURN];

    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);

      // Get all nodes that have edges pointing from current
      const inNeighbors = this.graph.graph.inNeighbors(current);
      for (const neighbor of inNeighbors) {
        if (!visited.has(neighbor)) {
          downstreamNodes.push(neighbor);
          queue.push(neighbor);
        }
      }
    }

    // Check if any downstream manifests are critical (e.g., public APIs)
    const criticalPath = downstreamNodes.some(urn => {
      const node = this.graph.getNode(urn);
      return node?.manifest?.metadata?.critical === true ||
             node?.manifest?.metadata?.visibility === 'public';
    });

    return {
      affectedManifests: downstreamNodes.slice(0, 10), // Top 10
      totalAffected: downstreamNodes.length,
      criticalPath
    };
  }

  /**
   * Calculate risk score (0-100)
   * @private
   */
  _calculateRiskScore(breakingChanges, downstreamImpact) {
    let score = 0;

    // Base score from number of breaking changes (0-30 points)
    score += Math.min(breakingChanges.length * 5, 30);

    // Severity multiplier (0-40 points)
    const highSeverity = breakingChanges.filter(c => c.severity === 'high').length;
    score += Math.min(highSeverity * 10, 40);

    // Downstream impact (0-30 points)
    if (downstreamImpact.criticalPath) {
      score += 20;
    }
    score += Math.min(downstreamImpact.totalAffected * 2, 10);

    return Math.min(score, 100);
  }

  /**
   * Generate recommendation based on analysis
   * @private
   */
  _generateRecommendation(breakingChanges, riskScore) {
    if (riskScore >= 80) {
      return {
        level: 'critical',
        message: 'High-risk breaking changes detected. Consider deprecation period and extensive communication.',
        actions: [
          'Implement versioning strategy',
          'Provide migration documentation',
          'Set up deprecation warnings',
          'Notify all downstream consumers',
          'Consider backward compatibility layer'
        ]
      };
    } else if (riskScore >= 50) {
      return {
        level: 'warning',
        message: 'Moderate breaking changes detected. Plan migration path carefully.',
        actions: [
          'Document breaking changes clearly',
          'Provide code examples for migration',
          'Consider phased rollout',
          'Notify affected teams'
        ]
      };
    } else if (riskScore >= 20) {
      return {
        level: 'caution',
        message: 'Minor breaking changes detected. Communicate to consumers.',
        actions: [
          'Update changelog',
          'Include migration notes in release',
          'Bump major version number'
        ]
      };
    } else {
      return {
        level: 'info',
        message: 'Low-risk breaking changes. Standard release process recommended.',
        actions: [
          'Document changes in release notes',
          'Update version appropriately'
        ]
      };
    }
  }

  /**
   * Generate migration hints for breaking changes
   * @param {Array} breakingChanges - Classified breaking changes
   * @returns {Array} Migration hints
   */
  generateMigrationHints(breakingChanges) {
    const hints = [];

    for (const change of breakingChanges) {
      const hint = {
        change: change.description,
        path: change.path,
        confidence: 0.8
      };

      switch (change.category) {
        case BreakingCategory.REMOVED_ENDPOINT:
          hint.suggestion = `Replace calls to removed endpoint with alternative. Check for replacement endpoints in new version.`;
          hint.code = `// Old: ${change.oldValue?.method} ${change.oldValue?.path}\n// New: [Find alternative endpoint]`;
          break;

        case BreakingCategory.REQUIRED_FIELD_ADDED:
          hint.suggestion = `Add required field '${change.newValue}' to all requests.`;
          hint.code = `// Add to request payload:\n${change.newValue}: <value>`;
          break;

        case BreakingCategory.TYPE_CHANGE:
          hint.suggestion = `Update field type from '${change.oldValue}' to '${change.newValue}'.`;
          hint.code = `// Update type conversion:\n// Old type: ${change.oldValue}\n// New type: ${change.newValue}`;
          break;

        case BreakingCategory.AUTH_CHANGE:
          hint.suggestion = `Update authentication mechanism to '${change.newValue}'.`;
          hint.code = `// Update auth configuration:\nauth: '${change.newValue}'`;
          break;

        case BreakingCategory.REMOVED_FIELD:
          hint.suggestion = `Remove references to deleted field. Check if data needs to be migrated.`;
          hint.code = `// Field '${change.oldValue}' no longer available`;
          break;

        default:
          hint.suggestion = `Review change and update integration accordingly.`;
      }

      hints.push(hint);
    }

    return hints;
  }
}

export {
  BreakingChangeDetector,
  BreakingCategory
};
