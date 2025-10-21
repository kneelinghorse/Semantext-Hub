import fs from 'node:fs/promises';
import path from 'node:path';

import { DrawioExportError, writeDrawio } from './exporter.js';
import { ensureDirectory, timestampedFilename } from '../../catalog/shared.js';
import { resolveCatalogWorkspace } from '../../catalog/graph/artifacts.js';

const DEFAULT_DIAGRAM_PREFIX = 'catalog';

async function readGraphPayload(graphPath) {
  const payload = await fs.readFile(graphPath, 'utf8');
  try {
    return JSON.parse(payload);
  } catch (error) {
    throw new DrawioExportError(`Failed to parse canonical graph JSON at ${graphPath}`, error);
  }
}

async function resolveOutputTarget(workspace, output, prefix = DEFAULT_DIAGRAM_PREFIX) {
  if (!output) {
    const defaultDir = path.join(workspace, 'artifacts', 'diagrams');
    await ensureDirectory(defaultDir);
    return path.join(defaultDir, timestampedFilename(prefix));
  }

  const resolved = path.resolve(output);
  try {
    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
      await ensureDirectory(resolved);
      return path.join(resolved, timestampedFilename(prefix));
    }
  } catch {
    if (!path.extname(resolved)) {
      await ensureDirectory(resolved);
      return path.join(resolved, timestampedFilename(prefix));
    }
  }

  await ensureDirectory(path.dirname(resolved));
  return resolved;
}

export async function generateCatalogDiagram(options = {}) {
  const workspace = resolveCatalogWorkspace(options.workspace);
  const graph =
    options.graph ??
    (await readGraphPayload(
      options.input
        ? path.resolve(options.input)
        : path.join(workspace, 'artifacts', 'catalog-graph.json'),
    ));

  const outputPath = await resolveOutputTarget(
    workspace,
    options.output,
    options.prefix ?? DEFAULT_DIAGRAM_PREFIX,
  );

  return writeDrawio(graph, outputPath, {
    overwrite: Boolean(options.overwrite),
    layerBy: options.layerBy,
    splitBy: options.splitBy,
    themeId: options.themeId,
  });
}

export { DEFAULT_DIAGRAM_PREFIX };
