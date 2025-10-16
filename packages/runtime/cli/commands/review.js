/**
 * Review Command
 *
 * Reviews a draft manifest and performs validation checks.
 * Shows errors, warnings, and suggestions.
 */

import fs from 'fs-extra';
import { printInfo, printWarning, printError, printSuccess } from '../utils/output.js';
import {
  loadOverrides,
  hasOverrides,
  applyOverrides,
  getOverridePath
} from '../../workflow/overrides.js';
import { runFullValidation } from '../../workflow/validation-service.js';

/**
 * Review command handler
 *
 * @param {string} manifestPath - Path to manifest file
 * @param {Object} options - Command options
 * @param {boolean} options.autoApprove - Automatically approve if no errors
 */
async function reviewCommand(manifestPath, options) {
  try {
    // Check if manifest exists
    if (!await fs.pathExists(manifestPath)) {
      printError(`Manifest not found: ${manifestPath}`);
      process.exit(1);
    }

    // Read manifest
    const content = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);

    // Apply external overrides if present
    const overrides = await loadOverrides(manifestPath) || [];
    const reviewManifest = overrides.length > 0
      ? applyOverrides(manifest, overrides)
      : manifest;
    const hasManualOverrides = hasOverrides(reviewManifest);
    const overrideFilePath = overrides.length > 0 ? getOverridePath(manifestPath) : null;

    // Display manifest overview
    console.log('\n📋 Manifest Review');
    console.log('═══════════════════════════════════════════════════\n');

    console.log('📄 File:', manifestPath);
    console.log('📊 Status:', reviewManifest.metadata?.status || 'unknown');

    if (reviewManifest.catalog) {
      console.log('📦 Type: API Contract');
      console.log('🔖 Catalog:', reviewManifest.catalog.type || 'unknown');
      console.log('🔗 Endpoints:', reviewManifest.catalog.endpoints?.length || 0);
    } else if (reviewManifest.service) {
      console.log('📦 Type: Data Contract');
      console.log('🔖 Service:', reviewManifest.service.name);
      console.log('🗄️  Entities:', reviewManifest.service.entities?.length || 0);
    }

    if (reviewManifest.metadata?.source) {
      console.log('📥 Source:', reviewManifest.metadata.source.type);
      console.log('📅 Imported:', reviewManifest.metadata.source.imported_at || 'unknown');
    }

    if (overrideFilePath) {
      console.log(`⚙️  Applied ${overrides.length} override(s) from ${overrideFilePath}`);
    }

    if (hasManualOverrides) {
      const historyLength = reviewManifest.metadata.overrides?.length || 0;
      console.log(`🔧 Override history entries: ${historyLength}`);
    }

    // Perform validation
    console.log('\n🔍 Validation Results');
    console.log('───────────────────────────────────────────────────\n');

    const validation = options.validationResult || await runFullValidation({
      manifestPath,
      manifest: reviewManifest,
      options: {
        includeDiff: true,
        includeMigration: true
      }
    });

    const { structural, cross, combined, diff, breaking, migration, graph, context } = validation;

    // Display structural validation
    if (structural.errors.length > 0) {
      console.log(`❌ Structural Errors (${structural.errors.length}):`);
      structural.errors.forEach((error, idx) => {
        console.log(`   ${idx + 1}. ${error.field}: ${error.message}`);
      });
      console.log('');
    }

    if (structural.warnings.length > 0) {
      console.log(`⚠️  Structural Warnings (${structural.warnings.length}):`);
      structural.warnings.forEach((warning, idx) => {
        console.log(`   ${idx + 1}. ${warning.field}: ${warning.message}`);
      });
      console.log('');
    }

    if (structural.suggestions.length > 0) {
      console.log(`💡 Suggestions (${structural.suggestions.length}):`);
      structural.suggestions.forEach((suggestion, idx) => {
        console.log(`   ${idx + 1}. ${suggestion.field}: ${suggestion.message}`);
      });
      console.log('');
    }

    // Display cross-protocol validation
    if (cross.issues.errors.length > 0) {
      console.log(`❌ Cross-Protocol Errors (${cross.issues.errors.length}):`);
      cross.issues.errors.forEach((issue, idx) => {
        const location = issue.field ? `${issue.field}: ` : '';
        const rule = issue.rule ? `[${issue.rule}] ` : '';
        console.log(`   ${idx + 1}. ${location}${rule}${issue.message}`);
      });
      console.log('');
    }

    if (cross.issues.warnings.length > 0) {
      console.log(`⚠️  Cross-Protocol Warnings (${cross.issues.warnings.length}):`);
      cross.issues.warnings.forEach((issue, idx) => {
        const location = issue.field ? `${issue.field}: ` : '';
        const rule = issue.rule ? `[${issue.rule}] ` : '';
        console.log(`   ${idx + 1}. ${location}${rule}${issue.message}`);
        if (issue.suggestion) {
          console.log(`       Suggestion: ${issue.suggestion}`);
        }
      });
      console.log('');
    }

    if (cross.issues.info.length > 0) {
      console.log(`ℹ️  Cross-Protocol Notes (${cross.issues.info.length}):`);
      cross.issues.info.forEach((issue, idx) => {
        const location = issue.field ? `${issue.field}: ` : '';
        const rule = issue.rule ? `[${issue.rule}] ` : '';
        console.log(`   ${idx + 1}. ${location}${rule}${issue.message}`);
      });
      console.log('');
    }

    // Display override history
    if (hasManualOverrides) {
      const overrideHistory = reviewManifest.metadata.overrides || [];
      console.log(`🔧 Override History (${overrideHistory.length} operations):`);
      overrideHistory.slice(-5).forEach((override, idx) => {
        const timestamp = new Date(override.timestamp).toLocaleString();
        console.log(`   ${idx + 1}. ${override.operation} ${override.path} - ${timestamp}`);
        if (override.reason) {
          console.log(`      Reason: ${override.reason}`);
        }
      });
      if (overrideHistory.length > 5) {
        console.log(`   ... and ${overrideHistory.length - 5} more`);
      }
      console.log('');
    }

    // Summary
    console.log('═══════════════════════════════════════════════════\n');

    // Graph context summary
    console.log('\n🧭 Graph Context');
    console.log('───────────────────────────────────────────────────\n');
    console.log(`Nodes: ${graph.nodes} | Edges: ${graph.edges}`);
    if (graph.cache) {
      const cacheStats = graph.cache;
      if (typeof cacheStats.hitRatio === 'number') {
        console.log(`Cache hit ratio: ${(cacheStats.hitRatio * 100).toFixed(1)}%`);
      }
    }
    if (context.loadErrors.length > 0) {
      console.log(`⚠️  Failed to load ${context.loadErrors.length} manifest(s):`);
      context.loadErrors.slice(0, 3).forEach((entry, idx) => {
        console.log(`   ${idx + 1}. ${entry.path} (${entry.error.message})`);
      });
      if (context.loadErrors.length > 3) {
        console.log(`   ...and ${context.loadErrors.length - 3} more`);
      }
    }

    if (diff) {
      console.log('\n🪚 Diff Summary');
      console.log('───────────────────────────────────────────────────\n');
      console.log(`Total changes: ${diff.summary.totalChanges}`);
      console.log(`Breaking: ${diff.summary.breaking} | Non-breaking: ${diff.summary.nonBreaking} | Compatible: ${diff.summary.compatible}`);
      console.log(`Internal: ${diff.summary.internal} | Breaking present: ${diff.summary.hasBreakingChanges ? 'yes' : 'no'}`);

      if (diff.summary.hasBreakingChanges) {
        const topBreaking = diff.changes.breaking.slice(0, 5);
        console.log('\nTop breaking changes:');
        topBreaking.forEach((change, idx) => {
          console.log(`   ${idx + 1}. ${change.description} (${change.path})`);
        });
        if (diff.changes.breaking.length > 5) {
          console.log(`   ...and ${diff.changes.breaking.length - 5} more`);
        }
      }
    }

    if (breaking) {
      console.log('\n🚨 Breaking Change Analysis');
      console.log('───────────────────────────────────────────────────\n');
      console.log(`Risk score: ${breaking.riskScore}/100 (${breaking.recommendation.level})`);
      console.log(`Downstream manifests impacted: ${breaking.downstreamImpact.totalAffected}`);
      if (breaking.downstreamImpact.criticalPath) {
        console.log('Critical path impact detected.');
      }
      if (breaking.recommendation?.actions?.length) {
        console.log('Recommended actions:');
        breaking.recommendation.actions.slice(0, 5).forEach((action, idx) => {
          console.log(`   ${idx + 1}. ${action}`);
        });
      }
    }

    if (migration) {
      console.log('\n🛠️ Migration Guidance');
      console.log('───────────────────────────────────────────────────\n');
      const effort = migration.effort;
      if (effort) {
        console.log(`Estimated effort: ${effort.estimatedHours}h (${effort.complexity}, confidence ${Math.round(effort.confidence * 100)}%)`);
      }
      const suggestions = migration.suggestions.slice(0, 3);
      if (suggestions.length > 0) {
        console.log('Top suggestions:');
        suggestions.forEach((suggestion, idx) => {
          console.log(`   ${idx + 1}. [Priority ${suggestion.priority}] ${suggestion.change}`);
          const stepsPreview = suggestion.steps.slice(0, 2).join('; ');
          if (stepsPreview) {
            console.log(`      Steps: ${stepsPreview}${suggestion.steps.length > 2 ? ' ...' : ''}`);
          }
        });
        if (migration.suggestions.length > suggestions.length) {
          console.log(`   ...and ${migration.suggestions.length - suggestions.length} more suggestion(s)`);
        }
      }
    }

    const errorCount = combined.errors.length;

    if (combined.valid) {
      printSuccess('✅ Manifest is valid and ready for approval');

      if (combined.warnings.length > 0) {
        printWarning(`Note: ${combined.warnings.length} warning(s) present`);
      }

      if (options.autoApprove) {
        console.log('');
        printInfo('Auto-approve enabled - use the approve command to proceed');
      } else {
        console.log('');
        console.log('💡 Next step: Run approve command to create approved manifest');
        console.log(`   node app/cli/index.js approve ${manifestPath}`);
      }

      process.exit(0);
    } else {
      printError(`❌ Manifest has ${errorCount} blocking error(s) - cannot approve`);
      console.log('');
      console.log('💡 Fix the errors above and review again');
      process.exit(1);
    }

  } catch (error) {
    printError(`Review failed: ${error.message}`);
    if (error.stack && process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

export { reviewCommand };
