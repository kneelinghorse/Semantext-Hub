#!/usr/bin/env node

/**
 * Protocol Migration CLI Command
 * 
 * Implements protocol versioning and migration utilities for schema evolution
 * without manual edits. Supports diff reporting and breaking change detection.
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { Command } from 'commander';

/**
 * Protocol Migration Engine
 */
class ProtocolMigrationEngine {
  constructor() {
    this.supportedVersions = ['v1.0', 'v1.1', 'v2.0'];
    this.breakingChangePatterns = [
      'removed_field',
      'changed_field_type',
      'required_field_added',
      'endpoint_removed',
      'authentication_changed'
    ];
  }

  /**
   * Load and parse a protocol manifest
   */
  async loadManifest(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const manifest = JSON.parse(content);
      
      // Ensure version field exists
      if (!manifest.version) {
        manifest.version = 'v1.0'; // Default version
      }
      
      return manifest;
    } catch (error) {
      throw new Error(`Failed to load manifest ${filePath}: ${error.message}`);
    }
  }

  /**
   * Generate diff report between two manifest versions
   */
  generateDiffReport(fromManifest, toManifest) {
    const report = {
      summary: {
        fromVersion: fromManifest.version || 'v1.0',
        toVersion: toManifest.version || 'v2.0',
        breakingChanges: 0,
        additiveChanges: 0,
        modifications: 0
      },
      changes: [],
      breakingChanges: [],
      recommendations: []
    };

    // Compare top-level fields
    const fromKeys = Object.keys(fromManifest);
    const toKeys = Object.keys(toManifest);

    // Detect removed fields (breaking)
    for (const key of fromKeys) {
      if (!toKeys.includes(key) && key !== 'version' && key !== '_protocolType') {
        report.changes.push({
          type: 'removed',
          field: key,
          breaking: true,
          description: `Field '${key}' was removed`
        });
        report.breakingChanges.push({
          type: 'removed_field',
          field: key,
          severity: 'high'
        });
        report.summary.breakingChanges++;
      }
    }

    // Detect added fields (additive)
    for (const key of toKeys) {
      if (!fromKeys.includes(key) && key !== 'version' && key !== '_protocolType') {
        report.changes.push({
          type: 'added',
          field: key,
          breaking: false,
          description: `Field '${key}' was added`
        });
        report.summary.additiveChanges++;
      }
    }

    // Detect modified fields
    for (const key of fromKeys) {
      if (toKeys.includes(key) && key !== 'version' && key !== '_protocolType') {
        const fromValue = fromManifest[key];
        const toValue = toManifest[key];
        
        if (JSON.stringify(fromValue) !== JSON.stringify(toValue)) {
          const isBreaking = this.isBreakingChange(key, fromValue, toValue);
          
          report.changes.push({
            type: 'modified',
            field: key,
            breaking: isBreaking,
            description: `Field '${key}' was modified`,
            fromValue: this.sanitizeValue(fromValue),
            toValue: this.sanitizeValue(toValue)
          });
          
          if (isBreaking) {
            report.breakingChanges.push({
              type: 'modified_field',
              field: key,
              severity: 'medium'
            });
            report.summary.breakingChanges++;
          } else {
            report.summary.modifications++;
          }
        }
      }
    }

    // Generate recommendations
    if (report.summary.breakingChanges > 0) {
      report.recommendations.push(
        'Review breaking changes carefully before deploying',
        'Consider maintaining backward compatibility',
        'Update dependent services and consumers'
      );
    }

    if (report.summary.additiveChanges > 0) {
      report.recommendations.push(
        'New fields are backward compatible',
        'Update documentation for new features'
      );
    }

    return report;
  }

  /**
   * Determine if a field change is breaking
   */
  isBreakingChange(field, fromValue, toValue) {
    // Type changes are breaking
    if (typeof fromValue !== typeof toValue) {
      return true;
    }

    // Array length changes for required fields
    if (Array.isArray(fromValue) && Array.isArray(toValue)) {
      if (field.includes('required') || field.includes('dependencies')) {
        return fromValue.length !== toValue.length;
      }
    }

    // Object structure changes
    if (typeof fromValue === 'object' && typeof toValue === 'object') {
      const fromKeys = Object.keys(fromValue);
      const toKeys = Object.keys(toValue);
      
      // Removed keys in objects are breaking
      for (const key of fromKeys) {
        if (!toKeys.includes(key)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Sanitize values for display (remove sensitive data)
   */
  sanitizeValue(value) {
    if (typeof value === 'string' && value.length > 100) {
      return value.substring(0, 100) + '...';
    }
    if (typeof value === 'object' && value !== null) {
      const sanitized = { ...value };
      // Remove sensitive fields
      delete sanitized.password;
      delete sanitized.token;
      delete sanitized.secret;
      delete sanitized.key;
      return sanitized;
    }
    return value;
  }

  /**
   * Transform manifest from one version to another
   */
  transformManifest(manifest, fromVersion, toVersion) {
    const transformed = JSON.parse(JSON.stringify(manifest));
    
    // Update version field
    transformed.version = toVersion;

    // Apply version-specific transformations
    if (fromVersion === 'v1.0' && toVersion === 'v1.1') {
      // v1.0 to v1.1 transformations
      if (transformed.service && !transformed.service.version) {
        transformed.service.version = '1.1.0';
      }
    }

    if (fromVersion === 'v1.0' && toVersion === 'v2.0') {
      // v1.0 to v2.0 transformations
      if (transformed.service) {
        // Add new v2.0 fields
        transformed.service.apiVersion = '2.0';
        transformed.service.deprecated = false;
      }
    }

    if (fromVersion === 'v1.1' && toVersion === 'v2.0') {
      // v1.1 to v2.0 transformations
      if (transformed.service) {
        // Add new v2.0 fields
        transformed.service.apiVersion = '2.0';
        transformed.service.deprecated = false;
      }
    }

    return transformed;
  }

  /**
   * Validate manifest structure
   */
  validateManifest(manifest) {
    const errors = [];
    const warnings = [];

    // Check required fields
    if (!manifest.service && !manifest.dataset && !manifest.event && !manifest.agent) {
      errors.push('Manifest must contain service, dataset, event, or agent section');
    }

    // Check version format
    if (manifest.version && !manifest.version.match(/^v\d+\.\d+$/)) {
      warnings.push(`Version format '${manifest.version}' should follow vX.Y pattern`);
    }

    return { errors, warnings };
  }
}

/**
 * CLI Command Implementation
 */
async function migrateCommand(source, options) {
  const engine = new ProtocolMigrationEngine();
  
  try {
    console.log(chalk.blue('🔄 Protocol Migration Tool'));
    console.log(chalk.gray(`Source: ${source}`));
    console.log(chalk.gray(`From: ${options.from}`));
    console.log(chalk.gray(`To: ${options.to}`));
    console.log('');

    // Load source manifest
    const manifest = await engine.loadManifest(source);
    console.log(chalk.green(`✅ Loaded manifest version: ${manifest.version || 'v1.0'}`));

    // Validate current manifest
    const validation = engine.validateManifest(manifest);
    if (validation.errors.length > 0) {
      console.log(chalk.red('❌ Validation errors:'));
      validation.errors.forEach(error => console.log(chalk.red(`  • ${error}`)));
      return;
    }

    if (validation.warnings.length > 0) {
      console.log(chalk.yellow('⚠️  Validation warnings:'));
      validation.warnings.forEach(warning => console.log(chalk.yellow(`  • ${warning}`)));
    }

    // Transform manifest
    const transformedManifest = engine.transformManifest(manifest, options.from, options.to);
    
    // Generate diff report
    const diffReport = engine.generateDiffReport(manifest, transformedManifest);
    
    // Display diff report
    console.log(chalk.blue('\n📊 Migration Report'));
    console.log(chalk.gray('─'.repeat(50)));
    
    console.log(chalk.bold('Summary:'));
    console.log(`  From Version: ${diffReport.summary.fromVersion}`);
    console.log(`  To Version: ${diffReport.summary.toVersion}`);
    console.log(`  Breaking Changes: ${chalk.red(diffReport.summary.breakingChanges)}`);
    console.log(`  Additive Changes: ${chalk.green(diffReport.summary.additiveChanges)}`);
    console.log(`  Modifications: ${chalk.yellow(diffReport.summary.modifications)}`);

    if (diffReport.changes.length > 0) {
      console.log(chalk.bold('\nChanges:'));
      diffReport.changes.forEach(change => {
        const icon = change.breaking ? '🔴' : change.type === 'added' ? '🟢' : '🟡';
        const color = change.breaking ? chalk.red : change.type === 'added' ? chalk.green : chalk.yellow;
        console.log(color(`  ${icon} ${change.description}`));
        
        if (change.fromValue !== undefined && change.toValue !== undefined) {
          console.log(chalk.gray(`    From: ${JSON.stringify(change.fromValue)}`));
          console.log(chalk.gray(`    To:   ${JSON.stringify(change.toValue)}`));
        }
      });
    }

    if (diffReport.breakingChanges.length > 0) {
      console.log(chalk.red('\n🚨 Breaking Changes:'));
      diffReport.breakingChanges.forEach(change => {
        console.log(chalk.red(`  • ${change.field}: ${change.type} (${change.severity})`));
      });
    }

    if (diffReport.recommendations.length > 0) {
      console.log(chalk.blue('\n💡 Recommendations:'));
      diffReport.recommendations.forEach(rec => {
        console.log(chalk.blue(`  • ${rec}`));
      });
    }

    // Write output if specified
    if (options.output) {
      const outputPath = path.resolve(options.output);
      await fs.writeFile(outputPath, JSON.stringify(transformedManifest, null, 2));
      console.log(chalk.green(`\n✅ Transformed manifest written to: ${outputPath}`));
    }

    // Write diff report if specified
    if (options.diff) {
      const diffPath = path.resolve(options.diff);
      await fs.writeFile(diffPath, JSON.stringify(diffReport, null, 2));
      console.log(chalk.green(`📄 Diff report written to: ${diffPath}`));
    }

    if (options.dryRun) {
      console.log(chalk.yellow('\n🔍 Dry run complete - no files written'));
    }

  } catch (error) {
    console.error(chalk.red(`❌ Migration failed: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Export command for CLI registration
 */
function createMigrateCommand() {
  const command = new Command('migrate <source>');
  
  command
    .description('Migrate protocol manifest between versions')
    .requiredOption('--from <version>', 'Source version (e.g., v1.0)')
    .requiredOption('--to <version>', 'Target version (e.g., v2.0)')
    .option('--output <file>', 'Output file path for transformed manifest')
    .option('--diff <file>', 'Output file path for diff report')
    .option('--dry-run', 'Preview changes without writing files')
    .action(migrateCommand);

  return command;
}

export {
  migrateCommand,
  createMigrateCommand,
  ProtocolMigrationEngine
};
