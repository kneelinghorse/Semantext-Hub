#!/usr/bin/env node

/**
 * Catalog Import CLI Command - B11.4
 * 
 * Imports protocol catalog from a JSON snapshot file into a workspace.
 * Supports workspace isolation and conflict resolution.
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { performance } from 'perf_hooks';
import { URNCatalogIndex } from '../../packages/protocols/src/catalog/index.js';
import { validateSnapshotSchema } from './utils/snapshot-validator.js';

/**
 * Import catalog from snapshot file
 */
async function importCatalog(options = {}) {
  const startTime = performance.now();
  
  try {
    const {
      input,
      workspace = process.cwd(),
      offline = false,
      verbose = false,
      overwrite = false,
      dryRun = false
    } = options;

    if (!input) {
      throw new Error('Input file is required');
    }

    if (verbose) {
      console.log(chalk.blue(`\n📥 Importing catalog snapshot...`));
      console.log(chalk.gray(`Input: ${input}`));
      console.log(chalk.gray(`Workspace: ${workspace}`));
      console.log(chalk.gray(`Offline mode: ${offline}`));
      console.log(chalk.gray(`Dry run: ${dryRun}`));
    }

    // Load and validate snapshot
    const snapshot = await loadSnapshot(input);
    const validationResult = await validateSnapshotSchema(snapshot);
    if (!validationResult.valid) {
      throw new Error(`Snapshot validation failed: ${validationResult.errors.join(', ')}`);
    }

    if (options.verbose) {
      console.log(chalk.green(`✓ Snapshot validated successfully`));
      console.log(chalk.gray(`Artifacts: ${snapshot.statistics.totalArtifacts}`));
      console.log(chalk.gray(`Created: ${snapshot.created}`));
    }

    // Prepare workspace
    const workspacePaths = await prepareWorkspace(workspace, { offline, verbose: options.verbose });

    // Check for conflicts
    const conflicts = await checkConflicts(snapshot, workspacePaths, { verbose: options.verbose });
    if (conflicts.length > 0 && !overwrite) {
      console.log(chalk.yellow(`\n⚠ Found ${conflicts.length} conflicts:`));
      conflicts.forEach(conflict => {
        console.log(chalk.gray(`  • ${conflict.type}: ${conflict.urn}`));
      });
      console.log(chalk.gray(`\nUse --overwrite to replace existing files`));
      throw new Error('Import aborted due to conflicts');
    }

    if (dryRun) {
      console.log(chalk.blue(`\n🔍 Dry run completed - no files written`));
      return {
        success: true,
        dryRun: true,
        statistics: snapshot.statistics,
        conflicts: conflicts.length
      };
    }

    // Import artifacts
    const importResult = await importArtifacts(snapshot, workspacePaths, {
      overwrite,
      verbose: options.verbose
    });

    // Import relationships
    if (snapshot.relationships) {
      await importRelationships(snapshot.relationships, workspacePaths, { verbose: options.verbose });
    }

    const importTime = performance.now() - startTime;

    // Display results
    console.log(chalk.green(`\n✅ Catalog imported successfully!`));
    console.log(chalk.gray(`Workspace: ${workspace}`));
    console.log(chalk.gray(`Artifacts: ${importResult.imported}`));
    console.log(chalk.gray(`Skipped: ${importResult.skipped}`));
    console.log(chalk.gray(`Errors: ${importResult.errors}`));
    console.log(chalk.gray(`Import time: ${importTime.toFixed(2)}ms`));

    if (options.verbose && importResult.details.length > 0) {
      console.log(chalk.gray(`\nImport details:`));
      importResult.details.forEach(detail => {
        console.log(chalk.gray(`  • ${detail}`));
      });
    }

    return {
      success: true,
      workspace,
      statistics: snapshot.statistics,
      importResult,
      importTime
    };

  } catch (error) {
    const importTime = performance.now() - startTime;
    console.error(chalk.red(`\n❌ Import failed: ${error.message}`));
    
    if (options.verbose) {
      console.error(chalk.gray(`Import time: ${importTime.toFixed(2)}ms`));
      console.error(chalk.gray(`Error details: ${error.stack}`));
    }
    
    throw error;
  }
}

/**
 * Load snapshot from file
 */
async function loadSnapshot(inputPath) {
  try {
    const content = await fs.readFile(inputPath, 'utf8');
    const snapshot = JSON.parse(content);
    
    // Validate snapshot format
    if (!snapshot.version || !snapshot.format) {
      throw new Error('Invalid snapshot format');
    }
    
    if (snapshot.format !== 'catalog-snapshot-v1') {
      throw new Error(`Unsupported snapshot format: ${snapshot.format}`);
    }
    
    return snapshot;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Snapshot file not found: ${inputPath}`);
    }
    throw new Error(`Failed to load snapshot: ${error.message}`);
  }
}

/**
 * Prepare workspace for import
 */
async function prepareWorkspace(workspace, options = {}) {
  const { offline = false, verbose = false } = options;
  
  const workspacePaths = {
    root: path.resolve(workspace),
    artifacts: path.resolve(workspace, 'artifacts'),
    manifests: path.resolve(workspace, 'artifacts', 'manifests'),
    overrides: path.resolve(workspace, 'overrides')
  };

  // Create directories if they don't exist
  for (const [name, dirPath] of Object.entries(workspacePaths)) {
    if (name === 'root') continue;
    
    try {
      await fs.mkdir(dirPath, { recursive: true });
      if (verbose) {
        console.log(chalk.gray(`✓ Created directory: ${dirPath}`));
      }
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
      }
    }
  }

  return workspacePaths;
}

/**
 * Check for conflicts with existing files
 */
async function checkConflicts(snapshot, workspacePaths, options = {}) {
  const { verbose = false } = options;
  const conflicts = [];

  for (const [urn, artifact] of Object.entries(snapshot.artifacts)) {
    // Check if manifest file already exists
    const manifestPath = path.join(workspacePaths.manifests, `${artifact.name}-${artifact.version}.json`);
    
    try {
      await fs.access(manifestPath);
      conflicts.push({
        type: 'manifest',
        urn,
        path: manifestPath
      });
      
      if (verbose) {
        console.log(chalk.yellow(`⚠ Conflict detected: ${manifestPath}`));
      }
    } catch (error) {
      // File doesn't exist, no conflict
    }
  }

  return conflicts;
}

/**
 * Import artifacts to workspace
 */
async function importArtifacts(snapshot, workspacePaths, options = {}) {
  const { overwrite = false, verbose = false } = options;
  
  const result = {
    imported: 0,
    skipped: 0,
    errors: 0,
    details: []
  };

  for (const [urn, artifact] of Object.entries(snapshot.artifacts)) {
    try {
      // Determine output path
      const manifestPath = path.join(workspacePaths.manifests, `${artifact.name}-${artifact.version}.json`);
      
      // Check if file exists and overwrite is not enabled
      if (!overwrite) {
        try {
          await fs.access(manifestPath);
          result.skipped++;
          result.details.push(`Skipped ${urn} (file exists)`);
          continue;
        } catch (error) {
          // File doesn't exist, proceed with import
        }
      }

      // Write manifest file
      if (typeof artifact.manifest === 'object') {
        await fs.writeFile(manifestPath, JSON.stringify(artifact.manifest, null, 2));
        result.imported++;
        result.details.push(`Imported ${urn} to ${manifestPath}`);
        
        if (verbose) {
          console.log(chalk.green(`✓ Imported ${urn}`));
        }
      } else {
        // Manifest is just a URN reference, create minimal manifest
        const minimalManifest = {
          urn: artifact.urn,
          metadata: {
            name: artifact.name,
            version: artifact.version,
            description: artifact.metadata?.description || '',
            tags: artifact.metadata?.tags || []
          },
          type: artifact.type,
          namespace: artifact.namespace
        };
        
        await fs.writeFile(manifestPath, JSON.stringify(minimalManifest, null, 2));
        result.imported++;
        result.details.push(`Imported ${urn} (minimal manifest)`);
        
        if (verbose) {
          console.log(chalk.green(`✓ Imported ${urn} (minimal)`));
        }
      }
      
    } catch (error) {
      result.errors++;
      result.details.push(`Error importing ${urn}: ${error.message}`);
      
      if (verbose) {
        console.error(chalk.red(`✗ Failed to import ${urn}: ${error.message}`));
      }
    }
  }

  return result;
}

/**
 * Import relationships to workspace
 */
async function importRelationships(relationships, workspacePaths, options = {}) {
  const { verbose = false } = options;
  
  try {
    // Create relationships index file
    const relationshipsPath = path.join(workspacePaths.artifacts, 'relationships.json');
    
    const relationshipsData = {
      version: '1.0.0',
      format: 'relationships-v1',
      created: new Date().toISOString(),
      relationships
    };
    
    await fs.writeFile(relationshipsPath, JSON.stringify(relationshipsData, null, 2));
    
    if (verbose) {
      console.log(chalk.green(`✓ Imported relationships to ${relationshipsPath}`));
    }
    
  } catch (error) {
    if (verbose) {
      console.error(chalk.red(`✗ Failed to import relationships: ${error.message}`));
    }
    throw error;
  }
}

/**
 * Main import command handler
 */
export async function catalogimportCommand(options = {}) {
  try {
    return await importCatalog(options);
  } catch (error) {
    console.error(chalk.red(`\n❌ Import failed: ${error.message}`));
    
    if (options.verbose) {
      console.error(chalk.gray(`Error details: ${error.stack}`));
    }
    
    process.exit(1);
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--input' && i + 1 < args.length) {
      options.input = args[++i];
    } else if (arg === '--workspace' && i + 1 < args.length) {
      options.workspace = args[++i];
    } else if (arg === '--offline') {
      options.offline = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--overwrite') {
      options.overwrite = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--help') {
      console.log(`
Catalog Import Command

Usage: node catalog-import.js [options]

Options:
  --input <file>         Input snapshot file path (required)
  --workspace <path>     Target workspace path (default: current directory)
  --offline              Import in offline mode (no network access)
  --verbose              Show detailed output
  --overwrite            Overwrite existing files
  --dry-run              Preview import without writing files
  --help                 Show this help

Examples:
  node catalog-import.js --input snapshot.json
  node catalog-import.js --input snapshot.json --workspace ./my-workspace
  node catalog-import.js --input snapshot.json --dry-run --verbose
  node catalog-import.js --input snapshot.json --overwrite
`);
      process.exit(0);
    }
  }
  
  await catalogimportCommand(options);
}

// Export for dynamic registry - function already exported above
