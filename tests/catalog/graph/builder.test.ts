import fs from 'fs/promises';
import path from 'path';

import { buildCatalogGraph, validateCatalogGraph } from '../../../src/catalog/graph/builder.js';
import { catalogBuildGraphCommand } from '../../../cli/commands/catalog-build-graph.js';

const workspace = path.join(process.cwd());
const sampleCatalog = 'examples/catalogs/sample-set';

describe('catalog graph builder', () => {
  const tempFiles: string[] = [];

  afterAll(async () => {
    await Promise.all(
      tempFiles.map(async (file) => {
        try {
          await fs.rm(file, { force: true });
        } catch (error) {
          // Swallow cleanup errors to keep the suite resilient across environments.
          console.warn(`Failed to remove temp catalog graph artifact ${file}`, error);
        }
      })
    );
  });

  it('builds a canonical graph for the sample catalog', async () => {
    const graph = await buildCatalogGraph({
      workspace,
      catalogPaths: [sampleCatalog]
    });

    expect(graph.nodes).toHaveLength(6);
    expect(graph.edges).toHaveLength(11);
    expect(graph.metadata.counts.nodes).toBe(6);
    expect(graph.metadata.counts.edges).toBe(11);

    const validation = validateCatalogGraph(graph);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toBeUndefined();

    const apiNode = graph.nodes.find((node) => node.urn === 'urn:proto:api:sample.set/customer-api@v1.0.0');
    expect(apiNode?.domain).toBe('api');
    expect(apiNode?.type).toBe('api');
  });

  it('supports filtering by domain', async () => {
    const graph = await buildCatalogGraph({
      workspace,
      catalogPaths: [sampleCatalog],
      filters: {
        domain: ['event']
      }
    });

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].domain).toBe('event');
    expect(graph.edges).toHaveLength(0);
  });

  it('supports filtering by URN prefix', async () => {
    const graph = await buildCatalogGraph({
      workspace,
      catalogPaths: [sampleCatalog],
      filters: {
        urnPrefix: ['urn:proto:workflow:']
      }
    });

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].urn.startsWith('urn:proto:workflow:')).toBe(true);
    expect(graph.edges).toHaveLength(0);
  });

  it('writes graph payloads via the CLI command helper', async () => {
    const outputPath = path.join(workspace, 'artifacts', `catalog-graph-test-${Date.now()}.json`);
    tempFiles.push(outputPath);

    const result = await catalogBuildGraphCommand({
      workspace,
      catalogPaths: [sampleCatalog],
      output: outputPath,
      overwrite: true,
      pretty: true,
      silent: true
    });

    expect(result.outputPath).toBe(outputPath);
    expect(await fileExists(outputPath)).toBe(true);

    const payload = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    expect(Array.isArray(payload.nodes)).toBe(true);
    expect(Array.isArray(payload.edges)).toBe(true);
    expect(payload.nodes.length).toBe(result.nodeCount);
    expect(payload.edges.length).toBe(result.edgeCount);
  });
});

async function fileExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
