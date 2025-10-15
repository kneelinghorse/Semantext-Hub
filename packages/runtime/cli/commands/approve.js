/**
 * Approve Command
 *
 * Approves a draft manifest and transitions it to approved status.
 * Creates an approved manifest file with updated metadata.
 */

import fs from 'fs-extra';
import path from 'path';
import { printInfo, printSuccess, printError, printWarning } from '../utils/output.js';
import { approve } from '../../workflow/state-machine.js';
import {
  applyOverrides,
  loadOverrides,
  getOverridePath,
  hasOverrides
} from '../../workflow/overrides.js';
import { getApprovedPath } from '../../workflow/paths.js';
import { runFullValidation } from '../../workflow/validation-service.js';

/**
 * Approve command handler
 *
 * @param {string} manifestPath - Path to manifest file
 * @param {Object} options - Command options
 * @param {boolean} options.force - Force approval despite warnings
 */
async function approveCommand(manifestPath, options) {
  try {
    // Check if manifest exists
    if (!await fs.pathExists(manifestPath)) {
      printError(`Manifest not found: ${manifestPath}`);
      process.exit(1);
    }

    // Read manifest
    const content = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);

    const overrides = await loadOverrides(manifestPath) || [];
    const manifestForApproval = overrides.length > 0
      ? applyOverrides(manifest, overrides)
      : manifest;
    const overrideFilePath = overrides.length > 0 ? getOverridePath(manifestPath) : null;
    const hasManualOverrides = hasOverrides(manifestForApproval);

    console.log('\n✅ Approving Manifest');
    console.log('═══════════════════════════════════════════════════\n');

    if (overrideFilePath) {
      console.log(`⚙️  Applied ${overrides.length} override(s) from ${overrideFilePath}`);
    }

    if (hasManualOverrides) {
      const count = manifestForApproval.metadata.overrides?.length || 0;
      console.log(`🔧 Override history entries: ${count}`);
    }

    // Check current status
    if (manifestForApproval.metadata?.status === 'approved') {
      printWarning('⚠️  Manifest is already approved');
      console.log('\n📄 Current approved file:', manifestPath);
      return;
    }

    // Validate manifest
    console.log('🔍 Running validation...\n');
    const validation = await runFullValidation({
      manifestPath,
      manifest: manifestForApproval,
      options: {
        includeDiff: true,
        includeMigration: false
      }
    });

    const { combined, structural, cross, diff, breaking } = validation;

    if (combined.errors.length > 0) {
      printError(`❌ Found ${combined.errors.length} blocking validation error(s):`);

      const structuralErrors = structural.errors.length;
      const crossErrors = cross.issues.errors.length;

      if (structuralErrors > 0) {
        console.log(`   Structural errors: ${structuralErrors}`);
      }
      if (crossErrors > 0) {
        console.log(`   Cross-protocol errors: ${crossErrors}`);
      }
      console.log('');

      if (!options.force) {
        printError('Cannot approve manifest with errors.');
        console.log('💡 Run review to inspect detailed issues or use --force to override\n');
        process.exit(1);
      }

      printWarning('⚠️  Force flag enabled - approving despite validation errors');
      console.log('');
    }

    if (combined.warnings.length > 0) {
      printWarning(`⚠️  Warnings detected (${combined.warnings.length})`);
      combined.warnings.slice(0, 5).forEach((warning, idx) => {
        const field = warning.field ? `${warning.field}: ` : '';
        console.log(`   ${idx + 1}. ${field}${warning.message || warning.rule}`);
      });
      if (combined.warnings.length > 5) {
        console.log(`   ...and ${combined.warnings.length - 5} more warning(s)`);
      }
      console.log('');

      if (options.force) {
        printInfo('Proceeding with approval (force flag enabled)');
      } else {
        printInfo('Warnings present but not blocking approval');
      }
      console.log('');
    }

    if (combined.valid && combined.warnings.length === 0) {
      printSuccess('✅ Validation passed with no issues');
      console.log('');
    }

    if (diff) {
      const breakingCount = diff.summary.breaking;
      console.log('📈 Diff summary:');
      console.log(`   Total changes ${diff.summary.totalChanges}, breaking ${breakingCount}, compatible ${diff.summary.compatible}`);
      if (breakingCount > 0 && breaking?.riskScore !== undefined) {
        console.log(`   Breaking risk score: ${breaking.riskScore}/100 (${breaking.recommendation.level})`);
      }
      console.log('');
    }

    // Transition to approved state
    console.log('📝 Transitioning state: draft → approved\n');

    const approvedManifest = approve(manifestForApproval, {
      force: options.force || false,
      approvedBy: process.env.USER || 'cli'
    });

    // Generate approved file path
    // Convert: artifacts/manifest.draft.json → artifacts/manifest.approved.json
    const approvedPath = getApprovedPath(manifestPath);

    // Write approved manifest
    await fs.ensureDir(path.dirname(approvedPath));
    await fs.writeJson(approvedPath, approvedManifest, { spaces: 2 });

    // Success summary
    console.log('═══════════════════════════════════════════════════\n');
    printSuccess('✅ Manifest approved successfully!');
    console.log('');
    console.log('📄 Draft manifest:', manifestPath);
    console.log('✅ Approved manifest:', approvedPath);
    console.log('');
    console.log('📊 Status:', approvedManifest.metadata.status);
    console.log('📅 Approved at:', approvedManifest.metadata.approved_at);
    if (approvedManifest.metadata.approved_by) {
      console.log('👤 Approved by:', approvedManifest.metadata.approved_by);
    }

    if (approvedManifest.metadata.overrides?.length) {
      console.log('🔧 Overrides preserved:', approvedManifest.metadata.overrides.length);
    }

    if (combined.warnings.length > 0) {
      console.log('');
      printWarning(`Note: ${combined.warnings.length} warning(s) were present at approval`);
    }

    if (combined.errors.length > 0 && options.force) {
      console.log('');
      printWarning(`⚠️  Force-approved with ${combined.errors.length} error(s)`);
    }

    console.log('');

  } catch (error) {
    printError(`Approve failed: ${error.message}`);
    if (error.stack && process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

export { approveCommand, getApprovedPath };
