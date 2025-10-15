#!/usr/bin/env node

/**
 * Catalog Export CLI Command - B11.4
 * 
 * Exports current workspace catalog to a JSON snapshot file.
 * Supports offline mode for validation without network access.
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';

import { URNCatalogIndex } from '../../packages/protocols/src/catalog/index.js';
import { writeCytoscape } from '../../src/visualization/cytoscape/exporter.js';
import { loadCatalogGraph, ensureDirectory, timestampedFilename, pathExists } from './catalog-shared.js';
import { isInteractive } from '../../src/cli/ux/console.js';
import { validateSnapshotSchema } from './utils/snapshot-validator.js';
import { launch as launchWithGuardian } from '../../src/cli/utils/open-guardian.js';

const SUPPORTED_EXPORT_FORMATS = new Set(['snapshot', 'cytoscape']);
const CYTOSCAPE_DEFAULT_PREFIX = 'catalog-cytoscape';

/**
 * Export catalog to snapshot file
 */
async function exportCatalogSnapshot(options = {}) {
  const startTime = performance.now();
  
  try {
    const {
      output = 'catalog-snapshot.json',
      workspace = process.cwd(),
      includeManifests = true,
      includeRelationships = true,
      offline = false,
      verbose = false,
      silent = false
    } = options;

    if (verbose && !silent) {
      console.log(chalk.blue(`\n📦 Exporting catalog snapshot...`));
      console.log(chalk.gray(`Workspace: ${workspace}`));
      console.log(chalk.gray(`Output: ${output}`));
      console.log(chalk.gray(`Offline mode: ${offline}`));
    }

    // Load catalog index
    const catalogIndex = await loadCatalogIndex(workspace, { offline, verbose: options.verbose });
    
    if (catalogIndex.size() === 0) {
      throw new Error('No protocols found in workspace. Run discovery commands first.');
    }

    // Create snapshot
    const snapshot = await createSnapshot(catalogIndex, {
      workspace,
      includeManifests,
      includeRelationships,
      offline,
      verbose: options.verbose
    });

    // Validate snapshot against schema
    const validationResult = await validateSnapshotSchema(snapshot);
    if (!validationResult.valid) {
      throw new Error(`Snapshot validation failed: ${validationResult.errors.join(', ')}`);
    }

    // Write snapshot file
    const outputPath = path.resolve(output);
    await fs.writeFile(outputPath, JSON.stringify(snapshot, null, 2));

    const exportTime = performance.now() - startTime;

    // Display results
    if (!silent) {
      console.log(chalk.green(`\n✅ Catalog exported successfully!`));
      console.log(chalk.gray(`File: ${outputPath}`));
      console.log(chalk.gray(`Artifacts: ${snapshot.statistics.totalArtifacts}`));
      console.log(chalk.gray(`Export time: ${exportTime.toFixed(2)}ms`));
    }

    if (verbose && !silent) {
      console.log(chalk.gray(`\nStatistics:`));
      console.log(chalk.gray(`  By type: ${JSON.stringify(snapshot.statistics.byType)}`));
      console.log(chalk.gray(`  By classification: ${JSON.stringify(snapshot.statistics.byClassification)}`));
      console.log(chalk.gray(`  Dependencies: ${snapshot.statistics.totalDependencies}`));
      console.log(chalk.gray(`  Consumers: ${snapshot.statistics.totalConsumers}`));
    }

    return {
      success: true,
      outputPath,
      statistics: snapshot.statistics,
      exportTime
    };

  } catch (error) {
    const exportTime = performance.now() - startTime;
    console.error(chalk.red(`\n❌ Export failed: ${error.message}`));
    
    if (verbose) {
      console.error(chalk.gray(`Export time: ${exportTime.toFixed(2)}ms`));
      console.error(chalk.gray(`Error details: ${error.stack}`));
    }
    
    throw error;
  }
}

function resolveWorkspaceRoot(workspace) {
  return workspace ? path.resolve(workspace) : process.cwd();
}

function resolveViewerPath() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(scriptDir, '../../viewers/cytoscape/index.html');
}

function createViewerLaunchUrl(exportPath) {
  const viewerPath = resolveViewerPath();
  const hint = encodeURIComponent(exportPath);
  return `file://${viewerPath}?hint=${hint}`;
}

async function resolveCytoscapeOutputPath(workspace, output, prefix = CYTOSCAPE_DEFAULT_PREFIX) {
  const resolvedWorkspace = resolveWorkspaceRoot(workspace);
  if (!output) {
    const defaultDir = path.join(resolvedWorkspace, 'artifacts', 'visualizations', 'cytoscape');
    await ensureDirectory(defaultDir);
    return path.join(defaultDir, timestampedFilename(prefix, '.json'));
  }

  const resolved = path.resolve(output);
  const ext = path.extname(resolved);
  if (!ext) {
    await ensureDirectory(resolved);
    return path.join(resolved, timestampedFilename(prefix, '.json'));
  }

  await ensureDirectory(path.dirname(resolved));
  return resolved;
}

async function exportCatalogCytoscape(options = {}) {
  const startTime = performance.now();
  const workspace = resolveWorkspaceRoot(options.workspace);
  const verbose = Boolean(options.verbose);
  const silent = Boolean(options.silent);

  if (verbose) {
    console.log(chalk.blue(`\n🌐 Exporting catalog to Cytoscape JSON...`));
    console.log(chalk.gray(`Workspace: ${workspace}`));
  }

  const { graph } = await loadCatalogGraph({ workspace });
  if (!graph?.nodes?.length) {
    throw new Error('Canonical catalog graph is empty. Generate manifests before exporting.');
  }

  const outputPath = await resolveCytoscapeOutputPath(workspace, options.output, options.prefix);
  const result = await writeCytoscape(graph, outputPath, {
    overwrite: Boolean(options.overwrite),
    includeMetadata: options.includeMetadata !== false,
    layout: options.layout
  });

  const exportTime = performance.now() - startTime;

  if (!silent) {
    console.log(chalk.green(`\n✅ Cytoscape export ready`));
    console.log(chalk.gray(`File: ${result.outputPath}`));
    console.log(chalk.gray(`Nodes: ${result.stats.nodes}`));
    console.log(chalk.gray(`Edges: ${result.stats.edges}`));
    console.log(chalk.gray(`Export time: ${exportTime.toFixed(2)}ms`));

    if (Array.isArray(result.warnings) && result.warnings.length > 0) {
      console.warn(chalk.yellow(`Warnings:`));
      for (const warning of result.warnings) {
        console.warn(chalk.yellow(`  • ${warning}`));
      }
    }
  }

  if (options.open) {
    const viewerPath = resolveViewerPath();
    const viewerExists = await pathExists(viewerPath);
    if (!viewerExists) {
      if (!silent) {
        console.warn(chalk.yellow('Unable to open Cytoscape viewer automatically.'));
        console.warn(chalk.yellow(`  Viewer bundle not found at ${viewerPath}`));
      }
    } else {
      const launchUrl = createViewerLaunchUrl(result.outputPath);
      const openOutcome = await launchWithGuardian(launchUrl, {
        type: 'url',
        interactive: isInteractive(),
        env: process.env
      });

      if (openOutcome.skipped) {
        if (!silent) {
          const reason = openOutcome.reason ?? 'Environment does not allow GUI operations.';
          console.warn(chalk.yellow('Skipping --open (guardian prevented launch).'));
          console.warn(chalk.yellow(`  ${reason}`));
          console.warn(chalk.yellow('  Open the viewer manually if needed.'));
        }
      } else if (!openOutcome.launched) {
        if (!silent) {
          const detail = openOutcome.error?.message ?? 'Failed to launch system viewer.';
          console.warn(chalk.yellow('Unable to open Cytoscape viewer automatically.'));
          console.warn(chalk.yellow(`  ${detail}`));
          if (openOutcome.command) {
            const commandLine = [openOutcome.command, ...(openOutcome.args ?? [])].join(' ').trim();
            console.warn(chalk.yellow(`  Command: ${commandLine}`));
          }
          console.warn(chalk.yellow('  Open the viewer manually if needed.'));
        }
      } else if (!silent) {
        console.log(chalk.gray('Opening Cytoscape viewer in default browser...'));
      }
    }
  }

  return {
    success: true,
    format: 'cytoscape',
    outputPath: result.outputPath,
    exportTime,
    nodeCount: result.stats.nodes,
    edgeCount: result.stats.edges,
    warnings: result.warnings
  };
}

/**
 * Load catalog index from workspace
 */
async function loadCatalogIndex(workspace, options = {}) {
  const { offline = false, verbose = false } = options;
  
  const catalogIndex = new URNCatalogIndex();
  
  // Load from artifacts directory
  const artifactsDir = path.resolve(workspace, 'artifacts');
  
  try {
    await fs.access(artifactsDir);
  } catch (error) {
    throw new Error(`Artifacts directory not found: ${artifactsDir}`);
  }

  // Find all manifest files
  const manifestFiles = await findManifestFiles(artifactsDir);
  
  if (options.verbose) {
    console.log(chalk.gray(`Found ${manifestFiles.length} manifest files`));
  }

  // Load manifests
  for (const filePath of manifestFiles) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const manifest = JSON.parse(content);
      
      // Normalize manifest to catalog schema
      const normalizedManifest = normalizeManifest(manifest, filePath, options);
      if (normalizedManifest) {
        catalogIndex.add(normalizedManifest);
      }
    } catch (error) {
      if (options.verbose) {
        console.warn(chalk.yellow(`⚠ Skipping invalid manifest: ${filePath}`));
      }
    }
  }

  return catalogIndex;
}

/**
 * Find all manifest files in directory recursively
 */
async function findManifestFiles(dir) {
  const files = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        const subFiles = await findManifestFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && (
        entry.name.endsWith('.json') || 
        entry.name.endsWith('.yaml') || 
        entry.name.endsWith('.yml')
      )) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
  }
  
  return files;
}

/**
 * Normalize manifest to catalog schema
 */
function normalizeManifest(manifest, filePath, options = {}) {
  const { includeManifests = true } = options;
  // Extract URN from various possible locations
  const urn = manifest.urn || manifest.metadata?.urn || manifest.service?.urn;
  if (!urn) {
    console.warn(chalk.yellow(`⚠ Manifest missing URN: ${filePath}`));
    return null;
  }

  // Extract basic info
  const name = manifest.metadata?.name || manifest.service?.name || extractNameFromUrn(urn);
  const version = manifest.metadata?.version || manifest.service?.version || extractVersionFromUrn(urn);
  const description = manifest.metadata?.description || manifest.service?.description || '';
  
  // Determine protocol type
  const type = determineProtocolType(manifest, urn);
  const namespace = determineNamespace(type);

  // Extract dependencies
  const dependencies = manifest.dependencies || [];

  // Create normalized manifest
  return {
    urn,
    name,
    version,
    namespace,
    type,
    manifest: includeManifests ? manifest : urn, // Include full manifest or just URN reference
    dependencies,
    metadata: {
      tags: manifest.metadata?.tags || [],
      description,
      governance: {
        classification: manifest.metadata?.governance?.classification || 'public',
        owner: manifest.metadata?.governance?.owner || manifest.metadata?.owner || 'unknown',
        pii: manifest.metadata?.governance?.pii || false
      }
    }
  };
}

/**
 * Extract name from URN
 */
function extractNameFromUrn(urn) {
  const parts = urn.split(':');
  if (parts.length >= 4) {
    return parts[3].split('@')[0];
  }
  return 'unknown';
}

/**
 * Extract version from URN
 */
function extractVersionFromUrn(urn) {
  const versionMatch = urn.match(/@([^#]+)/);
  return versionMatch ? versionMatch[1] : '1.0.0';
}

/**
 * Determine protocol type from manifest
 */
function determineProtocolType(manifest, urn) {
  if (urn.includes(':api:')) return 'api-protocol';
  if (urn.includes(':data:')) return 'data-protocol';
  if (urn.includes(':event:')) return 'event-protocol';
  if (urn.includes(':workflow:')) return 'workflow-protocol';
  if (urn.includes(':ui:')) return 'ui-protocol';
  if (urn.includes(':semantic:')) return 'semantic-protocol';
  
  // Fallback based on manifest content
  if (manifest.api) return 'api-protocol';
  if (manifest.service?.type === 'api') return 'api-protocol';
  if (manifest.event) return 'event-protocol';
  if (manifest.workflow) return 'workflow-protocol';
  if (manifest.semantic) return 'semantic-protocol';
  
  return 'api-protocol'; // Default
}

/**
 * Determine namespace from protocol type
 */
function determineNamespace(type) {
  const namespaceMap = {
    'api-protocol': 'urn:protocol:api',
    'data-protocol': 'urn:protocol:data',
    'event-protocol': 'urn:protocol:event',
    'workflow-protocol': 'urn:protocol:workflow',
    'ui-protocol': 'urn:protocol:ui',
    'semantic-protocol': 'urn:protocol:semantic'
  };
  return namespaceMap[type] || 'urn:protocol:api';
}

/**
 * Create snapshot from catalog index
 */
async function createSnapshot(catalogIndex, options = {}) {
  const {
    workspace,
    includeManifests = true,
    includeRelationships = true,
    offline = false,
    verbose = false
  } = options;

  const now = new Date().toISOString();
  const workspaceName = path.basename(workspace);
  const workspacePath = workspace;

  // Extract workspace metadata
  const workspaceMetadata = {
    name: workspaceName,
    path: workspacePath,
    description: `Snapshot from ${workspaceName}`,
    tags: ['snapshot', 'export']
  };

  // Build artifacts object
  const artifacts = {};
  const statistics = {
    totalArtifacts: 0,
    byType: {},
    byClassification: {},
    totalDependencies: 0,
    totalConsumers: 0
  };

  // Process each artifact
  for (const [urn, artifact] of catalogIndex.artifacts) {
    artifacts[urn] = {
      urn: artifact.urn,
      name: artifact.name,
      version: artifact.version,
      namespace: artifact.namespace,
      type: artifact.type,
      manifest: includeManifests ? artifact.manifest : artifact.urn,
      dependencies: artifact.dependencies || [],
      metadata: artifact.metadata || {}
    };

    // Update statistics
    statistics.totalArtifacts++;
    
    // Count by type
    statistics.byType[artifact.type] = (statistics.byType[artifact.type] || 0) + 1;
    
    // Count by classification
    const classification = artifact.metadata?.governance?.classification || 'public';
    statistics.byClassification[classification] = (statistics.byClassification[classification] || 0) + 1;
    
    // Count dependencies
    statistics.totalDependencies += (artifact.dependencies || []).length;
  }

  // Build relationships if requested
  const relationships = {
    dependencies: {},
    consumers: {},
    providers: {}
  };

  if (includeRelationships) {
    for (const [urn, artifact] of catalogIndex.artifacts) {
      // Dependencies
      if (artifact.dependencies && artifact.dependencies.length > 0) {
        relationships.dependencies[urn] = artifact.dependencies;
      }

      // Find consumers (protocols that depend on this one)
      const consumers = [];
      for (const [otherUrn, otherArtifact] of catalogIndex.artifacts) {
        if (otherArtifact.dependencies && otherArtifact.dependencies.includes(urn)) {
          consumers.push(otherUrn);
        }
      }
      if (consumers.length > 0) {
        relationships.consumers[urn] = consumers;
        statistics.totalConsumers += consumers.length;
      }
    }
  }

  // Create export metadata
  const exportMetadata = {
    exportedBy: process.env.USER || 'unknown',
    exportTool: 'ossp-cli-catalog-export',
    exportOptions: {
      includeManifests,
      includeRelationships,
      offlineMode: offline
    }
  };

  return {
    version: '1.0.0',
    format: 'catalog-snapshot-v1',
    created: now,
    workspace: workspaceMetadata,
    artifacts,
    relationships,
    statistics,
    exportMetadata
  };
}

async function exportCatalog(options = {}) {
  const format = String(options.format ?? 'snapshot').toLowerCase();
  if (!SUPPORTED_EXPORT_FORMATS.has(format)) {
    const supported = Array.from(SUPPORTED_EXPORT_FORMATS).join(', ');
    throw new Error(`Unsupported export format "${format}". Supported formats: ${supported}`);
  }

  if (format === 'cytoscape') {
    return exportCatalogCytoscape(options);
  }

  return exportCatalogSnapshot(options);
}

/**
 * Main export command handler
 */
export async function catalogexportCommand(options = {}) {
  try {
    return await exportCatalog(options);
  } catch (error) {
    console.error(chalk.red(`\n❌ Export failed: ${error.message}`));
    
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
    
    if (arg === '--output' && i + 1 < args.length) {
      options.output = args[++i];
    } else if (arg === '--workspace' && i + 1 < args.length) {
      options.workspace = args[++i];
    } else if (arg === '--offline') {
      options.offline = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--silent') {
      options.silent = true;
    } else if (arg === '--no-manifests') {
      options.includeManifests = false;
    } else if (arg === '--no-relationships') {
      options.includeRelationships = false;
    } else if (arg === '--no-metadata') {
      options.includeMetadata = false;
    } else if (arg === '--format' && i + 1 < args.length) {
      options.format = args[++i];
    } else if (arg === '--open') {
      options.open = true;
    } else if (arg === '--overwrite') {
      options.overwrite = true;
    } else if (arg === '--prefix' && i + 1 < args.length) {
      options.prefix = args[++i];
    } else if (arg === '--help') {
      console.log(`
Catalog Export Command

Usage: node catalog-export.js [options]

Options:
  --output <file>        Output file path (default: catalog-snapshot.json)
  --workspace <path>     Workspace path (default: current directory)
  --offline              Export in offline mode (no network access)
  --verbose              Show detailed output
  --silent               Suppress success output (useful for automation)
  --format <type>        Export format (snapshot | cytoscape)
  --no-manifests         Exclude full manifests (URNs only)
  --no-relationships     Exclude relationship data
  --no-metadata          (cytoscape) Omit catalog metadata from payload
  --open                 (cytoscape) Launch the interactive viewer after export
  --overwrite            Allow replacing an existing file
  --prefix <name>        Naming prefix for generated files (default varies by format)
  --help                 Show this help

Examples:
  node catalog-export.js --output my-snapshot.json
  node catalog-export.js --workspace ./my-workspace --offline
  node catalog-export.js --format cytoscape --open --verbose
`);
      process.exit(0);
    }
  }
  
  await catalogexportCommand(options);
}

// Export for dynamic registry - function already exported above
