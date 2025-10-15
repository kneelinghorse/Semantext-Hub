#!/usr/bin/env node

/**
 * Protocol Diff CLI Command - B11.6
 * 
 * Detects and gates breaking changes to protocol artifacts via CLI diff.
 * Uses existing diff engine and breaking change detector.
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { performance } from 'perf_hooks';
import { DiffEngine, ImpactLevel } from '../../packages/protocols/diff/engine.js';
import { BreakingChangeDetector } from '../../packages/protocols/diff/breaking-detector.js';

/**
 * Protocol diff command handler
 */
async function protocolDiffCommand(options = {}) {
  const startTime = performance.now();
  
  try {
    const {
      old: oldPath,
      new: newPath,
      allowBreaking = false,
      migrationFile = null,
      output = null,
      format = 'summary',
      verbose = false
    } = options;

    if (!oldPath || !newPath) {
      throw new Error('Both --old and --new parameters are required');
    }

    if (options.verbose) {
      console.log(chalk.blue(`\n🔍 Analyzing protocol differences...`));
      console.log(chalk.gray(`Old: ${oldPath}`));
      console.log(chalk.gray(`New: ${newPath}`));
      console.log(chalk.gray(`Allow breaking: ${allowBreaking}`));
      console.log(chalk.gray(`Migration file: ${migrationFile || 'none'}`));
    }

    // Load manifests
    const oldManifest = await loadManifest(oldPath);
    const newManifest = await loadManifest(newPath);

    // Create diff engine
    const diffEngine = new DiffEngine({
      includeMetadata: true,
      detectMoves: true,
      semanticDiff: true
    });

    // Generate diff report
    const diffReport = diffEngine.diff(oldManifest, newManifest);

    // Check for breaking changes
    const hasBreakingChanges = diffReport.summary.hasBreakingChanges;
    const breakingCount = diffReport.summary.breaking;

    if (options.verbose) {
      console.log(chalk.gray(`\nDiff analysis completed:`));
      console.log(chalk.gray(`  Total changes: ${diffReport.summary.totalChanges}`));
      console.log(chalk.gray(`  Breaking changes: ${breakingCount}`));
      console.log(chalk.gray(`  Non-breaking changes: ${diffReport.summary.nonBreaking}`));
      console.log(chalk.gray(`  Compatible changes: ${diffReport.summary.compatible}`));
    }

    // Check if migration file exists when breaking changes are detected
    if (hasBreakingChanges && !allowBreaking) {
      const migrationExists = await checkMigrationFile(migrationFile, oldPath, newPath);
      
      if (!migrationExists) {
        console.error(chalk.red(`\n❌ Breaking changes detected without migration file!`));
        console.error(chalk.yellow(`Found ${breakingCount} breaking changes:`));
        
        // Show breaking changes
        diffReport.changes.breaking.forEach((change, index) => {
          console.error(chalk.red(`  ${index + 1}. ${change.description}`));
          console.error(chalk.gray(`     Path: ${change.path}`));
        });

        console.error(chalk.yellow(`\nTo proceed:`));
        console.error(chalk.gray(`  1. Create a migration file documenting the breaking changes`));
        console.error(chalk.gray(`  2. Use --allow-breaking flag to override this check`));
        console.error(chalk.gray(`  3. Use --migration-file <path> to specify migration file location`));
        
        process.exit(1);
      }
    }

    // Generate output
    const outputData = generateOutput(diffReport, format, options);
    
    if (output) {
      await fs.writeFile(output, outputData);
      console.log(chalk.green(`\n✅ Diff report written to: ${output}`));
    } else {
      console.log(outputData);
    }

    const diffTime = performance.now() - startTime;

    // Summary
    if (hasBreakingChanges) {
      console.log(chalk.yellow(`\n⚠️  Breaking changes detected: ${breakingCount}`));
      if (allowBreaking || migrationFile) {
        console.log(chalk.green(`✅ Proceeding with breaking changes (override enabled)`));
      }
    } else {
      console.log(chalk.green(`\n✅ No breaking changes detected`));
    }

    if (options.verbose) {
      console.log(chalk.gray(`Analysis time: ${diffTime.toFixed(2)}ms`));
    }

    return {
      success: true,
      hasBreakingChanges,
      breakingCount,
      diffReport,
      diffTime
    };

  } catch (error) {
    const diffTime = performance.now() - startTime;
    console.error(chalk.red(`\n❌ Protocol diff failed: ${error.message}`));
    
    if (options.verbose) {
      console.error(chalk.gray(`Analysis time: ${diffTime.toFixed(2)}ms`));
      console.error(chalk.gray(`Error details: ${error.stack}`));
    }
    
    throw error;
  }
}

/**
 * Load manifest from file path
 */
async function loadManifest(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    
    // Try to parse as JSON first
    try {
      return JSON.parse(content);
    } catch (jsonError) {
      // If JSON fails, try YAML (basic implementation)
      if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        // For now, assume it's valid YAML and let the diff engine handle it
        // In a real implementation, you'd use a YAML parser like js-yaml
        throw new Error('YAML parsing not implemented. Please use JSON format.');
      }
      throw jsonError;
    }
  } catch (error) {
    throw new Error(`Failed to load manifest from ${filePath}: ${error.message}`);
  }
}

/**
 * Check if migration file exists
 */
async function checkMigrationFile(migrationFile, oldPath, newPath) {
  if (migrationFile) {
    try {
      await fs.access(migrationFile);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Auto-detect migration file based on paths
  const oldDir = path.dirname(oldPath);
  const newDir = path.dirname(newPath);
  
  if (oldDir === newDir) {
    // Same directory, look for migration file
    const migrationPaths = [
      path.join(oldDir, 'MIGRATION.md'),
      path.join(oldDir, 'BREAKING_CHANGES.md'),
      path.join(oldDir, 'CHANGELOG.md')
    ];

    for (const migrationPath of migrationPaths) {
      try {
        await fs.access(migrationPath);
        return true;
      } catch (error) {
        // Continue checking other paths
      }
    }
  }

  return false;
}

/**
 * Generate output based on format
 */
function generateOutput(diffReport, format, options) {
  switch (format) {
    case 'json':
      return JSON.stringify(diffReport, null, 2);
    
    case 'summary':
      return generateSummaryOutput(diffReport, options);
    
    case 'detailed':
      return generateDetailedOutput(diffReport, options);
    
    case 'github':
      return generateGitHubOutput(diffReport, options);
    
    default:
      return generateSummaryOutput(diffReport, options);
  }
}

/**
 * Generate summary output
 */
function generateSummaryOutput(diffReport, options) {
  const { summary, changes } = diffReport;
  
  let output = chalk.blue(`\n📊 Protocol Diff Summary\n`);
  output += chalk.gray(`Old version: ${diffReport.oldVersion || 'unknown'}\n`);
  output += chalk.gray(`New version: ${diffReport.newVersion || 'unknown'}\n`);
  output += chalk.gray(`Timestamp: ${diffReport.timestamp}\n\n`);

  // Summary statistics
  output += chalk.green(`Total changes: ${summary.totalChanges}\n`);
  
  if (summary.breaking > 0) {
    output += chalk.red(`Breaking changes: ${summary.breaking}\n`);
  } else {
    output += chalk.green(`Breaking changes: ${summary.breaking}\n`);
  }
  
  output += chalk.yellow(`Non-breaking changes: ${summary.nonBreaking}\n`);
  output += chalk.blue(`Compatible changes: ${summary.compatible}\n`);
  output += chalk.gray(`Internal changes: ${summary.internal}\n\n`);

  // Breaking changes details
  if (summary.breaking > 0) {
    output += chalk.red(`\n🚨 Breaking Changes:\n`);
    changes.breaking.forEach((change, index) => {
      output += chalk.red(`  ${index + 1}. ${change.description}\n`);
      output += chalk.gray(`     Path: ${change.path}\n`);
      if (options.verbose) {
        output += chalk.gray(`     Old: ${JSON.stringify(change.oldValue)}\n`);
        output += chalk.gray(`     New: ${JSON.stringify(change.newValue)}\n`);
      }
    });
  }

  // Non-breaking changes (if verbose)
  if (options.verbose && summary.nonBreaking > 0) {
    output += chalk.yellow(`\n⚠️  Non-breaking Changes:\n`);
    changes.nonBreaking.forEach((change, index) => {
      output += chalk.yellow(`  ${index + 1}. ${change.description}\n`);
      output += chalk.gray(`     Path: ${change.path}\n`);
    });
  }

  return output;
}

/**
 * Generate detailed output
 */
function generateDetailedOutput(diffReport, options) {
  const { summary, changes } = diffReport;
  
  let output = chalk.blue(`\n📋 Detailed Protocol Diff Report\n`);
  output += chalk.gray(`Old version: ${diffReport.oldVersion || 'unknown'}\n`);
  output += chalk.gray(`New version: ${diffReport.newVersion || 'unknown'}\n`);
  output += chalk.gray(`Timestamp: ${diffReport.timestamp}\n\n`);

  // All changes by category
  const categories = [
    { name: 'Breaking Changes', changes: changes.breaking, color: chalk.red },
    { name: 'Non-breaking Changes', changes: changes.nonBreaking, color: chalk.yellow },
    { name: 'Compatible Changes', changes: changes.compatible, color: chalk.green },
    { name: 'Internal Changes', changes: changes.internal, color: chalk.gray }
  ];

  for (const category of categories) {
    if (category.changes.length > 0) {
      output += category.color(`\n${category.name}:\n`);
      category.changes.forEach((change, index) => {
        output += category.color(`  ${index + 1}. ${change.description}\n`);
        output += chalk.gray(`     Path: ${change.path}\n`);
        output += chalk.gray(`     Type: ${change.type}\n`);
        if (change.oldValue !== null) {
          output += chalk.gray(`     Old: ${JSON.stringify(change.oldValue)}\n`);
        }
        if (change.newValue !== null) {
          output += chalk.gray(`     New: ${JSON.stringify(change.newValue)}\n`);
        }
        output += '\n';
      });
    }
  }

  return output;
}

/**
 * Generate GitHub Actions output
 */
function generateGitHubOutput(diffReport, options) {
  const { summary, changes } = diffReport;
  
  let output = '';
  
  // GitHub Actions summary
  if (summary.breaking > 0) {
    output += `::warning::Breaking changes detected: ${summary.breaking}\n`;
    output += `::error::Protocol diff found ${summary.breaking} breaking changes that require attention\n`;
  } else {
    output += `::notice::No breaking changes detected\n`;
  }

  // Detailed report for GitHub
  output += `\n## Protocol Diff Report\n\n`;
  output += `- **Old version:** ${diffReport.oldVersion || 'unknown'}\n`;
  output += `- **New version:** ${diffReport.newVersion || 'unknown'}\n`;
  output += `- **Total changes:** ${summary.totalChanges}\n`;
  output += `- **Breaking changes:** ${summary.breaking}\n`;
  output += `- **Non-breaking changes:** ${summary.nonBreaking}\n`;
  output += `- **Compatible changes:** ${summary.compatible}\n\n`;

  if (summary.breaking > 0) {
    output += `### 🚨 Breaking Changes\n\n`;
    changes.breaking.forEach((change, index) => {
      output += `${index + 1}. **${change.description}**\n`;
      output += `   - Path: \`${change.path}\`\n`;
      output += `   - Type: ${change.type}\n\n`;
    });
  }

  return output;
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--old' && i + 1 < args.length) {
      options.old = args[++i];
    } else if (arg === '--new' && i + 1 < args.length) {
      options.new = args[++i];
    } else if (arg === '--allow-breaking') {
      options.allowBreaking = true;
    } else if (arg === '--migration-file' && i + 1 < args.length) {
      options.migrationFile = args[++i];
    } else if (arg === '--output' && i + 1 < args.length) {
      options.output = args[++i];
    } else if (arg === '--format' && i + 1 < args.length) {
      options.format = args[++i];
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--help') {
      console.log(`
Protocol Diff Command

Usage: node protocol-diff.js [options]

Options:
  --old <file>              Old manifest file path
  --new <file>              New manifest file path
  --allow-breaking          Allow breaking changes without migration file
  --migration-file <file>   Path to migration file (optional)
  --output <file>           Output file path (optional)
  --format <format>         Output format: summary, detailed, json, github (default: summary)
  --verbose                 Show detailed output
  --help                    Show this help

Examples:
  node protocol-diff.js --old v1.json --new v2.json
  node protocol-diff.js --old v1.json --new v2.json --format github --output diff.md
  node protocol-diff.js --old v1.json --new v2.json --allow-breaking
  node protocol-diff.js --old v1.json --new v2.json --migration-file MIGRATION.md
`);
      process.exit(0);
    }
  }
  
  await protocolDiffCommand(options);
}

// Export for dynamic registry
export { protocolDiffCommand as protocoldiffCommand };
