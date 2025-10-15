/**
 * Migration Suggester
 *
 * Generates migration guides and code suggestions for protocol changes.
 * Provides confidence-scored recommendations for updating consumers.
 */

import { ChangeType, ImpactLevel } from './engine.js';
import { BreakingCategory } from './breaking-detector.js';

/**
 * Migration pattern templates
 */
const MigrationPatterns = {
  ENDPOINT_REPLACEMENT: 'endpoint_replacement',
  FIELD_MAPPING: 'field_mapping',
  TYPE_CONVERSION: 'type_conversion',
  AUTH_UPDATE: 'auth_update',
  SCHEMA_EVOLUTION: 'schema_evolution',
  PAGINATION_CHANGE: 'pagination_change'
};

/**
 * Migration suggester
 */
class MigrationSuggester {
  constructor(options = {}) {
    this.options = {
      includeCodeExamples: options.includeCodeExamples !== false,
      targetLanguage: options.targetLanguage || 'javascript',
      minConfidence: options.minConfidence || 0.5,
      ...options
    };
  }

  /**
   * Generate migration suggestions for a diff report
   * @param {Object} diffReport - Diff report from DiffEngine
   * @param {Object} breakingAnalysis - Breaking change analysis
   * @returns {Object} Migration guide with suggestions and examples
   */
  generateMigrationGuide(diffReport, breakingAnalysis = null) {
    const suggestions = [];
    const allChanges = [
      ...(diffReport.changes.breaking || []),
      ...(diffReport.changes.nonBreaking || []),
      ...(diffReport.changes.compatible || [])
    ];

    // Generate suggestions for each change
    for (const change of allChanges) {
      const suggestion = this._generateSuggestion(change);
      if (suggestion && suggestion.confidence >= this.options.minConfidence) {
        suggestions.push(suggestion);
      }
    }

    // Generate overall migration strategy
    const strategy = this._generateMigrationStrategy(diffReport, breakingAnalysis);

    // Estimate migration effort
    const effort = this._estimateMigrationEffort(suggestions);

    return {
      version: {
        from: diffReport.oldVersion,
        to: diffReport.newVersion
      },
      summary: diffReport.summary,
      strategy,
      effort,
      suggestions: suggestions.sort((a, b) => b.priority - a.priority),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate suggestion for a single change
   * @private
   */
  _generateSuggestion(change) {
    const suggestion = {
      change: change.description,
      path: change.path,
      type: change.type,
      impact: change.impact,
      priority: this._calculatePriority(change),
      confidence: 0.7,
      steps: [],
      codeExamples: []
    };

    // Pattern-specific suggestions
    if (change.path.includes('endpoints')) {
      return this._suggestEndpointMigration(change, suggestion);
    } else if (change.path.includes('columns') || change.path.includes('properties')) {
      return this._suggestFieldMigration(change, suggestion);
    } else if (change.path.includes('auth')) {
      return this._suggestAuthMigration(change, suggestion);
    } else if (change.path.includes('required')) {
      return this._suggestRequiredFieldMigration(change, suggestion);
    }

    // Generic suggestion
    return this._suggestGenericMigration(change, suggestion);
  }

  /**
   * Suggest migration for endpoint changes
   * @private
   */
  _suggestEndpointMigration(change, suggestion) {
    suggestion.pattern = MigrationPatterns.ENDPOINT_REPLACEMENT;
    suggestion.confidence = 0.8;

    if (change.type === ChangeType.REMOVED) {
      suggestion.steps = [
        'Identify all API calls to the removed endpoint',
        'Find replacement endpoint in new API version',
        'Update request/response handling if schema changed',
        'Test integration thoroughly',
        'Update error handling if needed'
      ];

      if (this.options.includeCodeExamples) {
        suggestion.codeExamples.push({
          language: this.options.targetLanguage,
          description: 'Update API call',
          before: this._generateEndpointCallExample(change.oldValue, 'before'),
          after: '// TODO: Replace with new endpoint\n// Check API documentation for replacement'
        });
      }
    } else if (change.type === ChangeType.MODIFIED) {
      suggestion.steps = [
        'Review changes to request/response schemas',
        'Update request payload to match new schema',
        'Update response parsing logic',
        'Test with new schema validation'
      ];
    }

    return suggestion;
  }

  /**
   * Suggest migration for field changes
   * @private
   */
  _suggestFieldMigration(change, suggestion) {
    suggestion.pattern = MigrationPatterns.FIELD_MAPPING;
    suggestion.confidence = 0.85;

    if (change.type === ChangeType.REMOVED) {
      suggestion.steps = [
        `Remove references to field: ${this._extractFieldName(change.path)}`,
        'Check if data migration is needed',
        'Update validation logic',
        'Remove field from DTOs/models'
      ];

      if (this.options.includeCodeExamples) {
        suggestion.codeExamples.push({
          language: this.options.targetLanguage,
          description: 'Remove field reference',
          before: `const value = response.${this._extractFieldName(change.path)};`,
          after: `// Field removed - use alternative or remove usage`
        });
      }
    } else if (change.type === ChangeType.ADDED) {
      const fieldName = this._extractFieldName(change.path);
      suggestion.steps = [
        `Add support for new field: ${fieldName}`,
        'Update DTOs/models to include new field',
        'Add validation if required',
        'Update documentation'
      ];

      if (change.impact === ImpactLevel.BREAKING) {
        suggestion.steps.unshift('REQUIRED: This field must be provided in all requests');
        suggestion.confidence = 0.9;
      }
    } else if (change.type === ChangeType.MODIFIED && change.path.includes('.type')) {
      suggestion.pattern = MigrationPatterns.TYPE_CONVERSION;
      suggestion.steps = [
        `Convert field type: ${change.oldValue} → ${change.newValue}`,
        'Update type annotations/interfaces',
        'Add type conversion logic if needed',
        'Update validation rules',
        'Test with new type'
      ];

      if (this.options.includeCodeExamples) {
        suggestion.codeExamples.push({
          language: this.options.targetLanguage,
          description: 'Type conversion',
          before: `// Old type: ${change.oldValue}`,
          after: `// New type: ${change.newValue}\n${this._generateTypeConversionExample(change)}`
        });
      }
    }

    return suggestion;
  }

  /**
   * Suggest migration for auth changes
   * @private
   */
  _suggestAuthMigration(change, suggestion) {
    suggestion.pattern = MigrationPatterns.AUTH_UPDATE;
    suggestion.confidence = 0.75;
    suggestion.steps = [
      'Update authentication configuration',
      'Obtain new credentials if required',
      'Update auth headers/tokens',
      'Test authentication flow',
      'Update error handling for auth failures'
    ];

    if (this.options.includeCodeExamples) {
      suggestion.codeExamples.push({
        language: this.options.targetLanguage,
        description: 'Update authentication',
        before: `// Old auth: ${change.oldValue}`,
        after: `// New auth: ${change.newValue}\n// Update auth mechanism accordingly`
      });
    }

    return suggestion;
  }

  /**
   * Suggest migration for required field changes
   * @private
   */
  _suggestRequiredFieldMigration(change, suggestion) {
    suggestion.confidence = 0.9;
    suggestion.steps = [
      `Add required field to all requests: ${change.newValue}`,
      'Determine appropriate value for the field',
      'Update request builders/DTOs',
      'Add validation',
      'Test with required field present'
    ];

    if (this.options.includeCodeExamples) {
      suggestion.codeExamples.push({
        language: this.options.targetLanguage,
        description: 'Add required field',
        before: '// Request without required field',
        after: `{\n  // ... existing fields\n  ${change.newValue}: <value> // REQUIRED\n}`
      });
    }

    return suggestion;
  }

  /**
   * Generic migration suggestion
   * @private
   */
  _suggestGenericMigration(change, suggestion) {
    suggestion.confidence = 0.6;
    suggestion.steps = [
      `Review change: ${change.description}`,
      'Assess impact on your integration',
      'Update code accordingly',
      'Test changes'
    ];

    return suggestion;
  }

  /**
   * Generate overall migration strategy
   * @private
   */
  _generateMigrationStrategy(diffReport, breakingAnalysis) {
    const hasBreaking = diffReport.summary.breaking > 0;
    const riskScore = breakingAnalysis?.riskScore || 0;

    if (hasBreaking && riskScore >= 80) {
      return {
        approach: 'phased',
        description: 'High-risk changes require careful migration',
        phases: [
          {
            phase: 1,
            name: 'Preparation',
            tasks: [
              'Review all breaking changes',
              'Identify affected code paths',
              'Create migration checklist',
              'Set up testing environment'
            ]
          },
          {
            phase: 2,
            name: 'Implementation',
            tasks: [
              'Implement backward compatibility if possible',
              'Update code to handle new schema',
              'Add feature flags for gradual rollout',
              'Update tests'
            ]
          },
          {
            phase: 3,
            name: 'Deployment',
            tasks: [
              'Deploy to staging first',
              'Run integration tests',
              'Gradual rollout to production',
              'Monitor for issues'
            ]
          }
        ]
      };
    } else if (hasBreaking) {
      return {
        approach: 'direct',
        description: 'Standard migration process for breaking changes',
        phases: [
          {
            phase: 1,
            name: 'Update & Test',
            tasks: [
              'Apply all suggested changes',
              'Update tests',
              'Verify integration',
              'Deploy'
            ]
          }
        ]
      };
    } else {
      return {
        approach: 'simple',
        description: 'No breaking changes - safe to update',
        phases: [
          {
            phase: 1,
            name: 'Update',
            tasks: [
              'Review optional improvements',
              'Update to new version',
              'Test integration'
            ]
          }
        ]
      };
    }
  }

  /**
   * Estimate migration effort
   * @private
   */
  _estimateMigrationEffort(suggestions) {
    let hours = 0;
    let complexity = 'low';

    for (const suggestion of suggestions) {
      // Estimate hours based on impact and pattern
      if (suggestion.impact === ImpactLevel.BREAKING) {
        hours += 4;
      } else if (suggestion.impact === ImpactLevel.NON_BREAKING) {
        hours += 2;
      } else {
        hours += 0.5;
      }
    }

    // Adjust for complexity
    if (suggestions.some(s => s.pattern === MigrationPatterns.SCHEMA_EVOLUTION)) {
      hours *= 1.5;
    }

    if (hours > 16) {
      complexity = 'high';
    } else if (hours > 8) {
      complexity = 'medium';
    }

    return {
      estimatedHours: Math.round(hours * 10) / 10,
      complexity,
      confidence: 0.7,
      note: 'Estimate based on typical scenarios. Actual time may vary.'
    };
  }

  /**
   * Calculate suggestion priority (0-100)
   * @private
   */
  _calculatePriority(change) {
    let priority = 50;

    if (change.impact === ImpactLevel.BREAKING) {
      priority = 90;
    } else if (change.impact === ImpactLevel.NON_BREAKING) {
      priority = 60;
    } else if (change.impact === ImpactLevel.COMPATIBLE) {
      priority = 30;
    } else {
      priority = 10;
    }

    // Boost priority for security-related changes
    if (change.path.includes('auth') || change.path.includes('security')) {
      priority = Math.min(priority + 20, 100);
    }

    return priority;
  }

  /**
   * Extract field name from path
   * @private
   */
  _extractFieldName(path) {
    const parts = path.split('.');
    const last = parts[parts.length - 1];
    return last.replace(/\[|\]/g, '');
  }

  /**
   * Generate endpoint call example
   * @private
   */
  _generateEndpointCallExample(endpoint, phase) {
    if (!endpoint) return '// Endpoint info not available';

    const lang = this.options.targetLanguage;

    if (lang === 'javascript') {
      return `await fetch('${endpoint.path}', {
  method: '${endpoint.method}',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(requestData)
});`;
    }

    return `${endpoint.method} ${endpoint.path}`;
  }

  /**
   * Generate type conversion example
   * @private
   */
  _generateTypeConversionExample(change) {
    const { oldValue, newValue } = change;
    const lang = this.options.targetLanguage;

    if (lang === 'javascript') {
      if (oldValue === 'string' && newValue === 'number') {
        return 'const numValue = parseInt(stringValue, 10);';
      } else if (oldValue === 'number' && newValue === 'string') {
        return 'const stringValue = numValue.toString();';
      }
    }

    return `// Convert from ${oldValue} to ${newValue}`;
  }
}

export {
  MigrationSuggester,
  MigrationPatterns
};
