#!/usr/bin/env node

/**
 * Showcase pipeline automation.
 *
 * Copies curated manifests into artifacts for isolated processing,
 * builds the canonical graph, and exports a Draw.io diagram so the
 * full demo loop (import → validate → visualize) stays reproducible.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createConsole } from '../../src/cli/ux/console.js';
import { generateCatalogGraph } from '../../src/catalog/graph/artifacts.js';
import { generateCatalogDiagram } from '../../src/visualization/drawio/catalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const options = {
    workspace: process.cwd(),
    overwrite: false,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--workspace':
      case '-w':
        options.workspace = path.resolve(argv[++index]);
        break;
      case '--overwrite':
        options.overwrite = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Showcase Pipeline

Usage: node scripts/demo/run-showcase.mjs [options]

Options:
  -w, --workspace <path>  Workspace root (defaults to current directory)
      --overwrite         Allow replacing existing diagram output
      --dry-run           Validate inputs but skip writing artifacts
  -h, --help              Show this help message
`);
}

async function ensureDirectory(targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
}

async function copyManifest(source, destinationDir, filename, dryRun) {
  const buffer = await fs.readFile(source, 'utf8');
  JSON.parse(buffer);

  if (dryRun) {
    return {
      path: path.join(destinationDir, filename),
      skipped: true
    };
  }

  await ensureDirectory(destinationDir);
  const targetPath = path.join(destinationDir, filename);
  await fs.writeFile(targetPath, buffer, 'utf8');

  return {
    path: targetPath,
    skipped: false
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const consoleUi = createConsole();

  const workspace = args.workspace ?? process.cwd();
  const manifestSources = [
    {
      id: 'order-api',
      source: path.join(workspace, 'approved', 'demo-api', 'manifest.json'),
      filename: 'order-api.json'
    },
    {
      id: 'order-event',
      source: path.join(workspace, 'approved', 'demo-event', 'manifest.json'),
      filename: 'order-placed-event.json'
    },
    {
      id: 'order-workflow',
      source: path.join(workspace, 'approved', 'demo-workflow', 'manifest.json'),
      filename: 'order-fulfillment-workflow.json'
    }
  ];

  const showcaseDir = path.join(workspace, 'artifacts', 'catalogs', 'showcase');
  const graphDir = path.join(workspace, 'artifacts', 'graphs', 'showcase');
  const graphOutputPath = path.join(graphDir, 'catalog-graph.json');
  const legacyGraphPath = path.join(showcaseDir, 'catalog-graph.json');
  const diagramOutputPath = path.join(workspace, 'artifacts', 'diagrams', 'showcase.drawio');

  consoleUi.info(`Workspace: ${workspace}`);
  consoleUi.info(`Showcase manifests: ${showcaseDir}`);

  const copies = [];
  for (const manifest of manifestSources) {
    try {
      await fs.access(manifest.source);
    } catch {
      throw new Error(`Missing curated manifest: ${manifest.source}`);
    }

    const result = await copyManifest(manifest.source, showcaseDir, manifest.filename, args.dryRun);
    copies.push({
      id: manifest.id,
      path: result.path,
      skipped: result.skipped
    });
  }

  if (args.dryRun) {
    consoleUi.success('Dry run succeeded', [
      'All showcase manifests parsed successfully.'
    ]);
    for (const copy of copies) {
      consoleUi.info(`Would copy: ${copy.path}`);
    }
    return;
  }

  await fs.rm(legacyGraphPath, { force: true });

  const { graph, nodeCount, edgeCount } = await generateCatalogGraph({
    workspace,
    catalogPaths: [path.relative(workspace, showcaseDir)],
    graphId: 'demo-showcase-catalog',
    graphName: 'Demo Showcase Catalog',
    graphDescription: 'Curated order orchestration flow for Sprint 23 demo.',
    graphVersion: '1.0.0'
  });

  await ensureDirectory(graphDir);
  await fs.writeFile(graphOutputPath, JSON.stringify(graph, null, 2), 'utf8');

  const protoSummary = graph.nodes
    .filter((node) => node.metadata?.external !== true)
    .map((node) => `${node.label} [${node.type}]`);

  const diagramResult = await generateCatalogDiagram({
    workspace,
    graph,
    output: diagramOutputPath,
    overwrite: args.overwrite,
    prefix: 'showcase'
  });

  consoleUi.success('Showcase pipeline completed', [
    `Manifests copied: ${copies.length}`,
    `Graph nodes: ${nodeCount}`,
    `Graph edges: ${edgeCount}`,
    `Graph output: ${graphOutputPath}`,
    `Diagram output: ${diagramResult.outputPath}`
  ]);

  if (protoSummary.length > 0) {
    consoleUi.info(`Protocols discovered:\n  - ${protoSummary.join('\n  - ')}`);
  }

  if (diagramResult.warnings?.length) {
    consoleUi.warn('Diagram guardrails', diagramResult.warnings);
  }
}

main().catch((error) => {
  const consoleUi = createConsole();
  consoleUi.error('Showcase pipeline failed', [error.message ?? String(error)]);
  process.exitCode = 1;
});
