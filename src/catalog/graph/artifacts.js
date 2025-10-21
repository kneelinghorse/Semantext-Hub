import fs from 'node:fs/promises';
import path from 'node:path';

import { buildCatalogGraph } from './builder.js';

async function fileExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function ensureWritable(outputPath, overwrite = false) {
  if (!overwrite && (await fileExists(outputPath))) {
    throw new Error(`Output file already exists (use --overwrite to replace): ${outputPath}`);
  }
}

export function resolveCatalogWorkspace(workspace) {
  return workspace ? path.resolve(workspace) : process.cwd();
}

export function resolveCatalogGraphOutput(workspace, output) {
  if (output) {
    return path.resolve(output);
  }
  return path.join(workspace, 'artifacts', 'catalog-graph.json');
}

export async function generateCatalogGraph(options = {}) {
  const workspace = resolveCatalogWorkspace(options.workspace);

  const graph = await buildCatalogGraph({
    workspace,
    catalogPaths: options.catalogPaths,
    filters: options.filters,
    graphId: options.graphId,
    graphName: options.graphName,
    graphDescription: options.graphDescription,
    graphVersion: options.graphVersion,
  });

  return {
    workspace,
    graph,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
  };
}

export async function writeCatalogGraph(options = {}) {
  const { workspace, graph, nodeCount, edgeCount } = await generateCatalogGraph(options);
  const payload = JSON.stringify(graph, null, options.pretty ? 2 : 0);

  if (options.stdout) {
    return {
      workspace,
      graph,
      nodeCount,
      edgeCount,
      outputPath: null,
      payload,
    };
  }

  const outputPath = resolveCatalogGraphOutput(workspace, options.output);
  await ensureWritable(outputPath, options.overwrite);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, payload, 'utf8');

  return {
    workspace,
    graph,
    nodeCount,
    edgeCount,
    outputPath,
    payload,
  };
}
