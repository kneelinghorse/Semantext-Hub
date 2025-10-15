#!/usr/bin/env node

/**
 * Shared helpers for catalog CLI commands.
 * Provides utilities for loading manifests, finding nodes, and shaping graph subsets.
 */

import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';

import { buildCatalogGraph } from '../../src/catalog/graph/builder.js';

const DEFAULT_CATALOG_PATHS = [
  'artifacts/catalog',
  'artifacts/catalogs',
  'artifacts/manifests',
  'examples/catalogs'
];

export class CatalogCliError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'CatalogCliError';
    this.details = options.details ?? [];
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

export async function loadCatalogGraph({ workspace, filters, catalogPaths } = {}) {
  const resolvedWorkspace = workspace ? path.resolve(workspace) : process.cwd();

  const graph = await buildCatalogGraph({
    workspace: resolvedWorkspace,
    catalogPaths: catalogPaths ?? DEFAULT_CATALOG_PATHS,
    filters
  });

  return {
    workspace: resolvedWorkspace,
    graph
  };
}

export function filterPrimaryNodes(graph) {
  return graph.nodes.filter((node) => node.path && node.metadata?.external !== true);
}

export function findProtocolNode(graph, identifier) {
  if (!identifier) return null;
  const target = identifier.trim().toLowerCase();

  const primaryNodes = filterPrimaryNodes(graph);

  return (
    primaryNodes.find((node) => node.urn?.toLowerCase() === target) ??
    primaryNodes.find((node) => node.label?.toLowerCase() === target) ??
    primaryNodes.find((node) => {
      const shorthand = extractProtocolKey(node.urn);
      return shorthand && shorthand.toLowerCase() === target;
    })
  );
}

export async function loadManifestForNode(workspace, node) {
  if (!node?.path) {
    throw new Error('Node is missing source path metadata.');
  }

  const absolutePath = path.resolve(workspace, node.path);
  const content = await fs.readFile(absolutePath, 'utf8');
  const extension = path.extname(absolutePath).toLowerCase();

  if (extension === '.yaml' || extension === '.yml') {
    return YAML.parse(content);
  }

  return JSON.parse(content);
}

export function createSubgraphForNode(graph, node) {
  const includedIds = new Set([node.id]);

  const relatedEdges = graph.edges.filter((edge) => {
    if (edge.source === node.id || edge.target === node.id) {
      includedIds.add(edge.source);
      includedIds.add(edge.target);
      return true;
    }
    return false;
  });

  const relatedNodes = graph.nodes.filter((candidate) => includedIds.has(candidate.id));

  return {
    ...graph,
    name: `${node.label} — Focus Diagram`,
    nodes: relatedNodes,
    edges: relatedEdges,
    metadata: {
      ...graph.metadata,
      scope: 'focused',
      focus: {
        urn: node.urn,
        label: node.label
      }
    }
  };
}

export function extractProtocolKey(urn) {
  if (!urn) return null;
  const withoutVersion = urn.split('@')[0] || urn;
  return withoutVersion.split('/').pop() || null;
}

export function timestampedFilename(prefix = 'catalog', extension = '.drawio') {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');

  const formatted = [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate())
  ].join('');

  const time = [pad(now.getUTCHours()), pad(now.getUTCMinutes()), pad(now.getUTCSeconds())].join('');

  return `${prefix}-${formatted}-${time}${extension}`;
}

export async function ensureDirectory(targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
}

export async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export default {
  loadCatalogGraph,
  filterPrimaryNodes,
  findProtocolNode,
  loadManifestForNode,
  createSubgraphForNode,
  extractProtocolKey,
  timestampedFilename,
  ensureDirectory,
  pathExists,
  CatalogCliError
};
