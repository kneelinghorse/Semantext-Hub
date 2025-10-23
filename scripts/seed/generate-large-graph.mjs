#!/usr/bin/env node
/**
 * Generate a synthetic 10k-node graph for performance testing
 * Emits both artifact JSON and pre-partitioned static assets for the viewer.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { partitionGraph } from '../../packages/runtime/viewer/graph/partition.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const N = 10000;
const E = 25000;
const MAX_NODES_PER_PART = 500;
const DEPTH_ESTIMATE = 2;
const SEED_NAME = 'graph10k';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data, pretty = false) {
  const payload = JSON.stringify(data, pretty ? null : undefined, pretty ? 2 : undefined);
  fs.writeFileSync(filePath, payload);
}

function buildChunk(nodes, edges, start, end) {
  const chunkNodes = nodes.slice(start, end);
  const idLookup = new Set(chunkNodes.map((node) => node.id ?? `node-${node}`));

  const chunkEdges = edges.filter((edge) => {
    const src = edge.source ?? edge.s;
    const tgt = edge.target ?? edge.t;
    return idLookup.has(src) && idLookup.has(tgt);
  });

  return {
    nodes: chunkNodes,
    edges: chunkEdges,
    summary: {
      nodes: chunkNodes.length,
      edges: chunkEdges.length,
      depth: DEPTH_ESTIMATE
    }
  };
}

const nodes = Array.from({ length: N }, (_, i) => ({
  id: `n${i}`,
  label: `Node ${i}`
}));

const edges = Array.from({ length: E }, (_, i) => ({
  s: `n${i % N}`,
  t: `n${(i * 7) % N}`
}));

const graph = { nodes, edges };

// Write canonical artifact JSON (pretty for readability)
const artifactDir = path.resolve(__dirname, '../../artifacts', SEED_NAME);
ensureDir(artifactDir);
writeJson(path.join(artifactDir, 'graph.json'), graph, true);

console.log(`[seed] wrote ${N} nodes, ${E} edges to ${artifactDir}/graph.json`);

// Partition graph for lazy loading
const partition = partitionGraph(nodes, edges, { maxNodesPerPart: MAX_NODES_PER_PART });
console.log(
  `[seed] partitioned into ${partition.parts.length} parts (max ${partition.stats.maxSize} nodes)`
);

const staticSeedDir = path.resolve(
  __dirname,
  '../../packages/runtime/viewer/public/graph/seeds',
  SEED_NAME
);
const staticPartsDir = path.join(staticSeedDir, 'parts');
ensureDir(staticPartsDir);

const artifactPartsDir = path.join(artifactDir, 'parts');
ensureDir(artifactPartsDir);

const indexParts = [];

partition.parts.forEach((part) => {
  const chunk = buildChunk(nodes, edges, part.start, part.end);
  const chunkJson = JSON.stringify(chunk);
  const partFilename = `${part.id}.json`;
  const staticPartPath = path.join(staticPartsDir, partFilename);
  const artifactPartPath = path.join(artifactPartsDir, partFilename);

  fs.writeFileSync(staticPartPath, chunkJson);
  fs.writeFileSync(artifactPartPath, chunkJson);

  indexParts.push({
    id: part.id,
    url: `/graph/seeds/${SEED_NAME}/parts/${partFilename}`,
    size: Buffer.byteLength(chunkJson),
    nodes: chunk.summary.nodes,
    edges: chunk.summary.edges,
    depth: chunk.summary.depth,
    partition: {
      id: part.id,
      size: chunk.summary.nodes,
      edgeCount: chunk.summary.edges,
      start: part.start,
      end: part.end
    }
  });
});

const indexPayload = {
  seed: SEED_NAME,
  index: {
    generated_at: new Date().toISOString(),
    parts: indexParts.length,
    node_count: nodes.length,
    edge_count: edges.length,
    depth: DEPTH_ESTIMATE,
    partition: partition.stats,
    expires_in_ms: 300_000
  },
  parts: indexParts
};

writeJson(path.join(staticSeedDir, 'index.json'), indexPayload);
writeJson(path.join(artifactDir, 'index.json'), indexPayload, true);

console.log(
  `[seed] wrote static seed assets to ${staticSeedDir} (index + ${indexParts.length} parts)`
);
