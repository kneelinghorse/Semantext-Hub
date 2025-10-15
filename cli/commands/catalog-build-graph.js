#!/usr/bin/env node

/**
 * Catalog Graph Builder CLI
 *
 * Generates the canonical catalog graph (nodes + edges) used by the Draw.io exporter
 * and persists the payload to artifacts/catalog-graph.json (unless overridden).
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

import { buildCatalogGraph } from '../../src/catalog/graph/builder.js';

export async function catalogBuildGraphCommand(options = {}) {
  const workspace = resolveWorkspace(options.workspace);

  const graph = await buildCatalogGraph({
    workspace,
    catalogPaths: options.catalogPaths,
    filters: options.filters,
    graphId: options.graphId,
    graphName: options.graphName,
    graphDescription: options.graphDescription,
    graphVersion: options.graphVersion
  });

  const jsonPayload = JSON.stringify(graph, null, options.pretty ? 2 : 0);

  if (options.stdout) {
    process.stdout.write(`${jsonPayload}\n`);
    return {
      outputPath: null,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      graph
    };
  }

  const outputPath = resolveOutputPath(workspace, options.output);
  await ensureWritable(outputPath, options.overwrite);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, jsonPayload, 'utf8');

  if (!options.silent) {
    printSummary({
      outputPath,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      filters: options.filters
    });
  }

  return {
    outputPath,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    graph
  };
}

function resolveWorkspace(workspace) {
  return workspace ? path.resolve(workspace) : process.cwd();
}

function resolveOutputPath(workspace, output) {
  if (output) {
    return path.resolve(output);
  }
  return path.join(workspace, 'artifacts', 'catalog-graph.json');
}

async function ensureWritable(outputPath, overwrite = false) {
  if (!overwrite && (await fileExists(outputPath))) {
    throw new Error(`Output file already exists (use --overwrite to replace): ${outputPath}`);
  }
}

async function fileExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function printSummary(summary) {
  console.log(chalk.green('\n✅ Catalog graph generated'));
  console.log(chalk.gray(`Nodes:   ${summary.nodeCount}`));
  console.log(chalk.gray(`Edges:   ${summary.edgeCount}`));
  console.log(chalk.gray(`Output:  ${summary.outputPath || '<stdout>'}`));

  const filters = summary.filters;
  if (filters && Object.keys(filters).length > 0) {
    console.log(chalk.gray('Filters:'));
    if (filters.domain?.length) {
      console.log(chalk.gray(`  Domains: ${filters.domain.join(', ')}`));
    }
    if (filters.type?.length) {
      console.log(chalk.gray(`  Types:   ${filters.type.join(', ')}`));
    }
    if (filters.urnPrefix?.length) {
      console.log(chalk.gray(`  URN:     ${filters.urnPrefix.join(', ')}`));
    }
  }
}

function parseArgList(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseArguments(argv) {
  const options = {
    catalogPaths: [],
    filters: {}
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--workspace':
      case '-w':
        options.workspace = argv[++i];
        break;
      case '--catalog':
      case '-c': {
        const paths = parseArgList(argv[++i]);
        options.catalogPaths.push(...paths);
        break;
      }
      case '--output':
      case '-o':
        options.output = argv[++i];
        break;
      case '--domain':
      case '-d': {
        const domains = parseArgList(argv[++i]);
        options.filters.domain = [...(options.filters.domain || []), ...domains];
        break;
      }
      case '--type':
      case '-t': {
        const types = parseArgList(argv[++i]);
        options.filters.type = [...(options.filters.type || []), ...types];
        break;
      }
      case '--urn-prefix':
      case '-u': {
        const prefixes = parseArgList(argv[++i]);
        options.filters.urnPrefix = [...(options.filters.urnPrefix || []), ...prefixes];
        break;
      }
      case '--graph-id':
        options.graphId = argv[++i];
        break;
      case '--graph-name':
        options.graphName = argv[++i];
        break;
      case '--graph-description':
        options.graphDescription = argv[++i];
        break;
      case '--graph-version':
        options.graphVersion = argv[++i];
        break;
      case '--overwrite':
        options.overwrite = true;
        break;
      case '--stdout':
        options.stdout = true;
        break;
      case '--pretty':
        options.pretty = true;
        break;
      case '--silent':
        options.silent = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  // Normalise duplicates
  if (options.filters.domain) {
    options.filters.domain = Array.from(new Set(options.filters.domain));
  }
  if (options.filters.type) {
    options.filters.type = Array.from(new Set(options.filters.type));
  }
  if (options.filters.urnPrefix) {
    options.filters.urnPrefix = Array.from(new Set(options.filters.urnPrefix));
  }

  return options;
}

function printHelp() {
  console.log(`
Catalog Graph Builder

Usage: node catalog-build-graph.js [options]

Options:
  --workspace, -w <path>       Workspace root (defaults to current working directory)
  --catalog, -c <paths>        Comma separated catalog directories/files (relative to workspace)
  --output, -o <path>          Output JSON file (defaults to artifacts/catalog-graph.json)
  --domain, -d <domains>       Filter by domain (comma separated, case insensitive)
  --type, -t <types>           Filter by manifest type/kind
  --urn-prefix, -u <prefixes>  Filter by URN prefixes
  --graph-id <value>           Override graph id (default: catalog-graph)
  --graph-name <value>         Override graph name
  --graph-description <value>  Override graph description
  --graph-version <value>      Override graph version metadata
  --overwrite                  Allow overwriting an existing output file
  --stdout                     Print graph JSON to stdout rather than writing a file
  --pretty                     Pretty-print JSON output
  --silent                     Suppress summary output
  --help, -h                   Show this help message

Examples:
  node catalog-build-graph.js
  node catalog-build-graph.js --catalog examples/catalogs/sample-set --output artifacts/catalog-graph.json --pretty
  node catalog-build-graph.js -d api,event -u urn:proto:event:
`);
}

async function runFromCli() {
  try {
    const args = parseArguments(process.argv.slice(2));
    if (args.help) {
      printHelp();
      return;
    }

    await catalogBuildGraphCommand(args);
  } catch (error) {
    console.error(chalk.red(`\n❌ Catalog graph generation failed: ${error.message}`));
    if (process.env.DEBUG_CATALOG_GRAPH === '1') {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFromCli();
}

export default {
  catalogBuildGraphCommand
};
