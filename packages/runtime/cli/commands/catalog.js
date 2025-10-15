#!/usr/bin/env node

/**
 * Catalog Search CLI Command - B10.4
 * 
 * Provides protocol catalog search and browsing functionality.
 * Performance target: <100ms response time for common queries.
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { performance } from 'perf_hooks';
import { URNCatalogIndex } from '../../src/catalog/index.js';
import { CatalogQuery } from '../../src/catalog/query.js';

// Performance tracking
const searchMetrics = {
  totalSearches: 0,
  totalTime: 0,
  cacheHits: 0
};

// Search result cache for repeated queries
const searchCache = new Map();

/**
 * Normalize manifest to catalog schema
 */
function normalizeManifest(manifest) {
  // Extract URN from various possible locations
  const urn = manifest.urn || manifest.metadata?.urn;
  if (!urn) return null;

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
    manifest: urn, // Use URN as manifest reference
    dependencies,
    metadata: {
      tags: manifest.metadata?.tags || [],
      description,
      governance: {
        classification: 'public',
        owner: manifest.metadata?.owner || 'unknown',
        pii: false
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
  
  // Fallback based on manifest content
  if (manifest.api) return 'api-protocol';
  if (manifest.service?.type === 'api') return 'api-protocol';
  if (manifest.event) return 'event-protocol';
  if (manifest.workflow) return 'workflow-protocol';
  
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
    'ui-protocol': 'urn:protocol:ui'
  };
  return namespaceMap[type] || 'urn:protocol:api';
}

/**
 * Load catalog index with caching
 */
async function loadCatalogIndex() {
  const cacheKey = 'catalog-index';
  
  if (searchCache.has(cacheKey)) {
    searchMetrics.cacheHits++;
    return searchCache.get(cacheKey);
  }
  
  const startTime = performance.now();
  
  try {
    // Load from artifacts directory
    const artifactsDir = path.resolve(process.cwd(), 'artifacts');
    const catalogIndex = new URNCatalogIndex();
    
    // Load all manifest files
    const manifestFiles = await findManifestFiles(artifactsDir);
    
    for (const filePath of manifestFiles) {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const manifest = JSON.parse(content);
        
        // Normalize manifest to catalog schema
        const normalizedManifest = normalizeManifest(manifest);
        if (normalizedManifest) {
          catalogIndex.add(normalizedManifest);
        }
      } catch (error) {
        console.warn(chalk.yellow(`⚠ Skipping invalid manifest: ${filePath}`));
      }
    }
    
    const loadTime = performance.now() - startTime;
    console.log(chalk.gray(`📦 Loaded ${catalogIndex.size()} protocols in ${loadTime.toFixed(2)}ms`));
    
    searchCache.set(cacheKey, catalogIndex);
    return catalogIndex;
    
  } catch (error) {
    throw new Error(`Failed to load catalog: ${error.message}`);
  }
}

/**
 * Find all manifest files in directory
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
      } else if (entry.isFile() && (entry.name.endsWith('.json') || entry.name.endsWith('.yaml'))) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
  }
  
  return files;
}

/**
 * Search protocols by term
 */
async function searchProtocols(term, options = {}) {
  const startTime = performance.now();
  const catalogIndex = await loadCatalogIndex();
  const catalogQuery = new CatalogQuery(catalogIndex);
  
  const results = [];
  const limit = parseInt(options.limit) || 10;
  
  // Search by URN pattern
  if (term.includes('urn:')) {
    const urnResults = catalogIndex.findByURNPattern(term);
    results.push(...urnResults.results.map(artifact => ({
      urn: artifact.urn,
      type: 'urn-match',
      score: 1.0
    })));
  }
  
  // Search by namespace
  if (term.includes(':')) {
    const namespaceResults = catalogIndex.findByNamespace(term);
    results.push(...namespaceResults.results.map(artifact => ({
      urn: artifact.urn,
      type: 'namespace-match',
      score: 0.9
    })));
  }
  
  // Search by protocol type
  const typeMap = {
    'api': 'api-protocol',
    'data': 'data-protocol', 
    'event': 'event-protocol',
    'workflow': 'workflow-protocol',
    'semantic': 'semantic-protocol'
  };
  
  if (typeMap[term.toLowerCase()]) {
    const typeResults = catalogIndex.findByType(typeMap[term.toLowerCase()]);
    results.push(...typeResults.results.map(artifact => ({
      urn: artifact.urn,
      type: 'type-match',
      score: 0.8
    })));
  }
  
  // Search by tags/metadata
  const allArtifacts = Array.from(catalogIndex.artifacts.values());
  const textSearch = term.toLowerCase();
  
  for (const artifact of allArtifacts) {
    let score = 0;
    
    // Search in URN
    if (artifact.urn.toLowerCase().includes(textSearch)) {
      score += 0.7;
    }
    
    // Search in description
    if (artifact.metadata?.description?.toLowerCase().includes(textSearch)) {
      score += 0.6;
    }
    
    // Search in tags
    if (artifact.metadata?.tags) {
      for (const tag of artifact.metadata.tags) {
        if (tag.toLowerCase().includes(textSearch)) {
          score += 0.5;
        }
      }
    }
    
    // Search in namespace
    if (artifact.namespace?.toLowerCase().includes(textSearch)) {
      score += 0.4;
    }
    
    if (score > 0) {
      results.push({
        urn: artifact.urn,
        type: 'text-match',
        score
      });
    }
  }
  
  // Remove duplicates and sort by score
  const uniqueResults = results.reduce((acc, result) => {
    const existing = acc.find(r => r.urn === result.urn);
    if (existing) {
      existing.score = Math.max(existing.score, result.score);
    } else {
      acc.push(result);
    }
    return acc;
  }, []);
  
  uniqueResults.sort((a, b) => b.score - a.score);
  
  const searchTime = performance.now() - startTime;
  searchMetrics.totalSearches++;
  searchMetrics.totalTime += searchTime;
  
  return {
    results: uniqueResults.slice(0, limit),
    total: uniqueResults.length,
    searchTime,
    term
  };
}

/**
 * List all protocols
 */
async function listProtocols(options = {}) {
  const startTime = performance.now();
  const catalogIndex = await loadCatalogIndex();
  
  const limit = parseInt(options.limit) || 50;
  const typeFilter = options.type;
  const namespaceFilter = options.namespace;
  
  let results = Array.from(catalogIndex.artifacts.values());
  
  // Apply filters
  if (typeFilter) {
    const typeMap = {
      'api': 'api-protocol',
      'data': 'data-protocol',
      'event': 'event-protocol',
      'workflow': 'workflow-protocol',
      'semantic': 'semantic-protocol'
    };
    
    const targetType = typeMap[typeFilter.toLowerCase()];
    if (targetType) {
      results = results.filter(artifact => artifact.type === targetType);
    }
  }
  
  if (namespaceFilter) {
    results = results.filter(artifact => 
      artifact.namespace?.toLowerCase().includes(namespaceFilter.toLowerCase())
    );
  }
  
  // Sort by URN
  results.sort((a, b) => a.urn.localeCompare(b.urn));
  
  const listTime = performance.now() - startTime;
  
  return {
    results: results.slice(0, limit),
    total: results.length,
    listTime,
    filters: { type: typeFilter, namespace: namespaceFilter }
  };
}

/**
 * Show detailed protocol information
 */
async function showProtocol(urn) {
  const startTime = performance.now();
  const catalogIndex = await loadCatalogIndex();
  
  const artifact = catalogIndex.get(urn);
  if (!artifact) {
    throw new Error(`Protocol not found: ${urn}`);
  }
  
  const showTime = performance.now() - startTime;
  
  return {
    artifact,
    showTime
  };
}

/**
 * Show cross-reference information for a protocol
 */
async function showCrossReferences(urn) {
  const startTime = performance.now();
  const catalogIndex = await loadCatalogIndex();
  
  const artifact = catalogIndex.get(urn);
  if (!artifact) {
    throw new Error(`Protocol not found: ${urn}`);
  }
  
  const crossRefs = catalogIndex.getCrossReferences(urn);
  const showTime = performance.now() - startTime;
  
  return {
    artifact,
    crossReferences: crossRefs,
    showTime
  };
}

/**
 * Format search results for display
 */
function formatSearchResults(searchResult, options = {}) {
  const { results, total, searchTime, term } = searchResult;
  const format = options.format || 'table';
  
  if (format === 'json') {
    return JSON.stringify({
      term,
      results: results.map(r => ({
        urn: r.urn,
        type: r.type,
        score: r.score
      })),
      total,
      searchTime
    }, null, 2);
  }
  
  // Table format
  let output = chalk.blue(`\n🔍 Search Results for "${term}"\n`);
  output += chalk.gray(`Found ${total} protocols in ${searchTime.toFixed(2)}ms\n\n`);
  
  if (results.length === 0) {
    output += chalk.yellow('No protocols found.\n');
    output += chalk.gray('Try:\n');
    output += chalk.gray('  • ossp catalog search api\n');
    output += chalk.gray('  • ossp catalog search event\n');
    output += chalk.gray('  • ossp catalog list\n');
    return output;
  }
  
  // Header
  output += chalk.bold('URN'.padEnd(60)) + ' ' + chalk.bold('Type'.padEnd(15)) + ' ' + chalk.bold('Score\n');
  output += chalk.gray('-'.repeat(80) + '\n');
  
  // Results
  results.forEach(result => {
    const artifact = searchCache.get('catalog-index')?.get(result.urn);
    const type = artifact?.type || 'unknown';
    const score = result.score.toFixed(2);
    
    output += chalk.white(result.urn.padEnd(60)) + ' ';
    output += chalk.cyan(type.padEnd(15)) + ' ';
    output += chalk.green(score) + '\n';
  });
  
  if (total > results.length) {
    output += chalk.gray(`\n... and ${total - results.length} more results\n`);
  }
  
  return output;
}

/**
 * Format list results for display
 */
function formatListResults(listResult, options = {}) {
  const { results, total, listTime, filters } = listResult;
  const format = options.format || 'table';
  
  if (format === 'json') {
    return JSON.stringify({
      results: results.map(r => ({
        urn: r.urn,
        type: r.type,
        namespace: r.namespace,
        description: r.metadata?.description
      })),
      total,
      listTime,
      filters
    }, null, 2);
  }
  
  // Table format
  let output = chalk.blue(`\n📋 Protocol Catalog\n`);
  output += chalk.gray(`Found ${total} protocols in ${listTime.toFixed(2)}ms\n`);
  
  if (filters.type || filters.namespace) {
    output += chalk.gray(`Filters: ${JSON.stringify(filters)}\n`);
  }
  output += '\n';
  
  if (results.length === 0) {
    output += chalk.yellow('No protocols found.\n');
    output += chalk.gray('Try:\n');
    output += chalk.gray('  • ossp catalog list --type api\n');
    output += chalk.gray('  • ossp catalog list --namespace urn:protocol:api\n');
    return output;
  }
  
  // Header
  output += chalk.bold('URN'.padEnd(60)) + ' ' + chalk.bold('Type'.padEnd(20)) + ' ' + chalk.bold('Namespace\n');
  output += chalk.gray('-'.repeat(100) + '\n');
  
  // Results
  results.forEach(artifact => {
    const type = artifact.type || 'unknown';
    const namespace = artifact.namespace || 'unknown';
    
    output += chalk.white(artifact.urn.padEnd(60)) + ' ';
    output += chalk.cyan(type.padEnd(20)) + ' ';
    output += chalk.gray(namespace) + '\n';
  });
  
  if (total > results.length) {
    output += chalk.gray(`\n... and ${total - results.length} more protocols\n`);
  }
  
  return output;
}

/**
 * Format protocol details for display
 */
function formatProtocolDetails(showResult) {
  const { artifact, showTime } = showResult;
  
  let output = chalk.blue(`\n📖 Protocol Details\n`);
  output += chalk.gray(`Loaded in ${showTime.toFixed(2)}ms\n\n`);
  
  output += chalk.bold('URN: ') + chalk.white(artifact.urn) + '\n';
  output += chalk.bold('Type: ') + chalk.cyan(artifact.type) + '\n';
  output += chalk.bold('Namespace: ') + chalk.gray(artifact.namespace) + '\n';
  
  if (artifact.metadata?.description) {
    output += chalk.bold('Description: ') + artifact.metadata.description + '\n';
  }
  
  if (artifact.metadata?.version) {
    output += chalk.bold('Version: ') + artifact.metadata.version + '\n';
  }
  
  if (artifact.metadata?.tags && artifact.metadata.tags.length > 0) {
    output += chalk.bold('Tags: ') + artifact.metadata.tags.join(', ') + '\n';
  }
  
  if (artifact.metadata?.governance) {
    output += chalk.bold('Governance:\n');
    const gov = artifact.metadata.governance;
    if (gov.owner) output += chalk.gray(`  Owner: ${gov.owner}\n`);
    if (gov.classification) output += chalk.gray(`  Classification: ${gov.classification}\n`);
    if (gov.pii) output += chalk.gray(`  PII: ${gov.pii}\n`);
  }
  
  return output;
}

/**
 * Format cross-reference details for display
 */
function formatCrossReferenceDetails(showResult) {
  const { artifact, crossReferences, showTime } = showResult;
  
  let output = chalk.blue(`\n🔗 Cross-Reference Details\n`);
  output += chalk.gray(`Loaded in ${showTime.toFixed(2)}ms\n\n`);
  
  output += chalk.bold('Protocol: ') + chalk.white(artifact.urn) + '\n';
  output += chalk.bold('Name: ') + artifact.name + '\n';
  output += chalk.bold('Type: ') + chalk.cyan(artifact.type) + '\n\n';
  
  // Referencing protocols
  if (crossReferences.referencing.count > 0) {
    output += chalk.bold(`📥 Referenced by (${crossReferences.referencing.count}):\n`);
    crossReferences.referencing.artifacts.forEach(ref => {
      output += chalk.gray(`  • ${ref.urn}\n`);
      if (ref.description) {
        output += chalk.gray(`    ${ref.description}\n`);
      }
    });
    output += '\n';
  } else {
    output += chalk.gray('📥 Referenced by: None\n\n');
  }
  
  // Referenced protocols
  if (crossReferences.referenced.count > 0) {
    output += chalk.bold(`📤 References (${crossReferences.referenced.count}):\n`);
    crossReferences.referenced.artifacts.forEach(ref => {
      output += chalk.gray(`  • ${ref.urn}\n`);
      if (ref.description) {
        output += chalk.gray(`    ${ref.description}\n`);
      }
    });
    output += '\n';
  } else {
    output += chalk.gray('📤 References: None\n\n');
  }
  
  // Consumer protocols
  if (crossReferences.consumers.count > 0) {
    output += chalk.bold(`🔄 Consumers (${crossReferences.consumers.count}):\n`);
    crossReferences.consumers.artifacts.forEach(consumer => {
      output += chalk.gray(`  • ${consumer.urn}\n`);
      if (consumer.description) {
        output += chalk.gray(`    ${consumer.description}\n`);
      }
    });
    output += '\n';
  } else {
    output += chalk.gray('🔄 Consumers: None\n\n');
  }
  
  return output;
}

/**
 * Main catalog command handler
 */
export async function catalogCommand(subcommand, term, options = {}) {
  try {
    switch (subcommand) {
      case 'search':
        if (!term) {
          throw new Error('Search term is required');
        }
        
        const searchResult = await searchProtocols(term, options);
        console.log(formatSearchResults(searchResult, options));
        break;
        
      case 'list':
        const listResult = await listProtocols(options);
        console.log(formatListResults(listResult, options));
        break;
        
      case 'show':
        if (!term) {
          throw new Error('URN is required for show command');
        }
        
        const showResult = await showProtocol(term);
        console.log(formatProtocolDetails(showResult));
        break;
        
      case 'xref':
      case 'crossref':
        if (!term) {
          throw new Error('URN is required for cross-reference command');
        }
        
        const xrefResult = await showCrossReferences(term);
        console.log(formatCrossReferenceDetails(xrefResult));
        break;
        
      case 'metrics':
        console.log(chalk.blue('\n📊 Catalog Search Metrics\n'));
        console.log(chalk.gray(`Total searches: ${searchMetrics.totalSearches}`));
        console.log(chalk.gray(`Total time: ${searchMetrics.totalTime.toFixed(2)}ms`));
        console.log(chalk.gray(`Average time: ${(searchMetrics.totalTime / Math.max(searchMetrics.totalSearches, 1)).toFixed(2)}ms`));
        console.log(chalk.gray(`Cache hits: ${searchMetrics.cacheHits}`));
        console.log(chalk.gray(`Cache size: ${searchCache.size}`));
        break;
        
      default:
        console.log(chalk.red(`\n❌ Unknown subcommand: ${subcommand}`));
        console.log(chalk.gray('\nAvailable subcommands:'));
        console.log(chalk.gray('  search <term>     - Search protocols by term'));
        console.log(chalk.gray('  list              - List all protocols'));
        console.log(chalk.gray('  show <urn>        - Show protocol details'));
        console.log(chalk.gray('  xref <urn>        - Show cross-reference details'));
        console.log(chalk.gray('  crossref <urn>    - Show cross-reference details'));
        console.log(chalk.gray('  metrics           - Show search metrics'));
        console.log(chalk.gray('\nExamples:'));
        console.log(chalk.gray('  ossp catalog search api'));
        console.log(chalk.gray('  ossp catalog list --type event'));
        console.log(chalk.gray('  ossp catalog show urn:protocol:api:example:1.0.0'));
        console.log(chalk.gray('  ossp catalog xref urn:protocol:api:example:1.0.0'));
        break;
    }
    
  } catch (error) {
    console.error(chalk.red(`\n❌ Catalog error: ${error.message}`));
    
    if (error.message.includes('not found')) {
      console.log(chalk.blue('\n💡 Suggestions:'));
      console.log(chalk.gray('  • Use "ossp catalog list" to see all available protocols'));
      console.log(chalk.gray('  • Use "ossp catalog search <term>" to find protocols'));
      console.log(chalk.gray('  • Check if the URN is correct and the protocol exists'));
    }
    
    process.exit(1);
  }
}
