/**
 * Graph Builder
 *
 * Loads protocol manifests from the local workspace and produces
 * a ProtocolGraph instance with nodes and dependency edges.
 */

import fs from 'fs-extra';
import path from 'path';
import * as protocolGraphModule from '../../protocols/core/graph/protocol-graph.js';

const graphExports = protocolGraphModule?.default ?? protocolGraphModule;
const { ProtocolGraph, NodeKind, EdgeKind } = graphExports;

const RELATION_FIELDS = {
  depends_on: EdgeKind.DEPENDS_ON,
  produces: EdgeKind.PRODUCES,
  consumes: EdgeKind.CONSUMES,
  reads_from: EdgeKind.READS_FROM,
  writes_to: EdgeKind.WRITES_TO,
  exposes: EdgeKind.EXPOSES,
  derives_from: EdgeKind.DERIVES_FROM
};

/**
 * Recursively collect manifests in a directory.
 *
 * @param {string} baseDir - Directory to scan
 * @returns {Promise<Array<{ path: string, manifest: Object }>>}
 */
async function loadManifestsFromDirectory(baseDir) {
  const entries = await fs.readdir(baseDir);
  const manifests = [];

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;

    const fullPath = path.join(baseDir, entry);
    try {
      const data = await fs.readJson(fullPath);
      if (data && data.metadata && typeof data.metadata.urn === 'string') {
        manifests.push({ path: fullPath, manifest: data });
      }
    } catch (error) {
      manifests.push({
        path: fullPath,
        manifest: null,
        error
      });
    }
  }

  return manifests;
}

/**
 * Infer node kind for a manifest.
 */
function inferNodeKind(manifest) {
  const metadataKind = manifest?.metadata?.kind;
  if (metadataKind && Object.values(NodeKind).includes(metadataKind)) {
    return metadataKind;
  }

  if (manifest.catalog) return NodeKind.API;
  if (manifest.service) return NodeKind.DATA;
  if (manifest.events) return NodeKind.EVENT;
  if (manifest.schema) return NodeKind.SEMANTIC;
  if (manifest.spec?.nodes) return NodeKind.WORKFLOW;
  if (manifest.spec?.agent) return NodeKind.AGENT;
  if (manifest.spec?.source && manifest.spec?.destination) return NodeKind.INTEGRATION;

  return NodeKind.API;
}

function collectRelationURNs(value, results) {
  if (!value) return;
  if (typeof value === 'string') {
    results.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectRelationURNs(item, results);
    }
    return;
  }

  if (typeof value === 'object') {
    if (typeof value.urn === 'string') {
      results.push(value.urn);
      return;
    }

    for (const nested of Object.values(value)) {
      collectRelationURNs(nested, results);
    }
  }
}

function collectManifestRelations(manifest) {
  const relations = [];

  const visit = (node) => {
    if (!node || typeof node !== 'object') {
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (RELATION_FIELDS[key]) {
        const urns = [];
        collectRelationURNs(value, urns);
        urns.forEach(target => {
          relations.push({ kind: RELATION_FIELDS[key], target });
        });
      }

      if (value && typeof value === 'object') {
        visit(value);
      }
    }
  };

  visit(manifest);

  return relations;
}

function buildGraph(manifests) {
  const graph = new ProtocolGraph({ cacheSize: Math.max(50, manifests.length * 4) });
  const duplicateURNs = [];
  const nodesAdded = [];
  const pendingEdges = [];

  for (const entry of manifests) {
    const manifest = entry.manifest;
    if (!manifest || !manifest.metadata || typeof manifest.metadata.urn !== 'string') {
      continue;
    }

    const urn = manifest.metadata.urn;
    const kind = inferNodeKind(manifest);

    const added = graph.addNode(urn, kind, manifest);
    if (!added) {
      duplicateURNs.push(urn);
    } else {
      nodesAdded.push(urn);
    }

    const relations = collectManifestRelations(manifest);
    relations.forEach(relation => {
      pendingEdges.push({ from: urn, kind: relation.kind, to: relation.target });
    });
  }

  const edgeKeys = new Set();
  let edgesAdded = 0;
  const unresolvedEdges = [];

  for (const edge of pendingEdges) {
    if (!graph.graph.hasNode(edge.from)) continue;
    if (!graph.graph.hasNode(edge.to)) {
      unresolvedEdges.push(edge);
      continue;
    }

    const key = `${edge.from}|${edge.kind}|${edge.to}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);

    graph.addEdge(edge.from, edge.kind, edge.to);
    edgesAdded += 1;
  }

  return {
    graph,
    stats: {
      nodesAdded: nodesAdded.length,
      edgesAdded,
      duplicateURNs,
      unresolvedEdges
    }
  };
}

export {
  loadManifestsFromDirectory,
  buildGraph
};
