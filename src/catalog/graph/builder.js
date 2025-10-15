import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { createRequire } from 'module';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import YAML from 'yaml';

const require = createRequire(import.meta.url);
const schema = require('./schema.json');

const DEFAULT_GRAPH_ID = 'catalog-graph';
const DEFAULT_GRAPH_NAME = 'OSSP-AGI Protocol Catalog';
const DEFAULT_GRAPH_VERSION = '1.0.0';

const ajv = new Ajv({
  allErrors: true,
  strict: false
});
addFormats(ajv);

const validateGraphPayload = ajv.compile(schema);

/**
 * Build a canonical catalog graph from manifest inputs.
 * @param {object} [options]
 * @param {string} [options.workspace]
 * @param {string[]} [options.catalogPaths]
 * @param {object} [options.filters]
 * @param {string[]} [options.filters.domain]
 * @param {string[]} [options.filters.type]
 * @param {string[]} [options.filters.urnPrefix]
 * @param {string} [options.graphId]
 * @param {string} [options.graphName]
 * @param {string} [options.graphVersion]
 * @returns {Promise<object>}
 */
export async function buildCatalogGraph(options = {}) {
  const workspace = options.workspace ? path.resolve(options.workspace) : process.cwd();
  const filters = normaliseFilters(options.filters);
  const catalogPaths = await resolveCatalogPaths(options.catalogPaths, workspace);

  const manifestFiles = await collectManifestFiles(catalogPaths);
  if (manifestFiles.length === 0) {
    throw new Error(
      `No manifest files found. Checked: ${catalogPaths.length > 0 ? catalogPaths.join(', ') : 'no inputs provided'}`
    );
  }

  const manifests = await Promise.all(
    manifestFiles.map(async (filePath) => {
      const manifest = await loadManifest(filePath);
      return normaliseManifest(manifest, filePath, workspace);
    })
  );

  const { nodes, nodeIndex, stats } = buildNodes(manifests, filters);
  const { edges, externalNodes, edgeStats } = buildEdges(manifests, nodeIndex, filters);

  for (const externalNode of externalNodes.values()) {
    if (!nodeIndex.has(externalNode.urn)) {
      nodes.push(externalNode.node);
      nodeIndex.set(externalNode.urn, externalNode);
    }
  }

  const graph = {
    id: options.graphId || DEFAULT_GRAPH_ID,
    name: options.graphName || DEFAULT_GRAPH_NAME,
    description:
      options.graphDescription ||
      'Canonical property graph representation of the OSSP-AGI catalog manifests.',
    version: options.graphVersion || DEFAULT_GRAPH_VERSION,
    generatedAt: new Date().toISOString(),
    nodes,
    edges,
    metadata: {
      workspace,
      inputs: manifestFiles.map((filePath) => toPosixRelative(workspace, filePath)),
      counts: {
        manifests: manifests.length,
        nodes: nodes.length,
        edges: edges.length
      },
      filters: filters ?? null,
      stats: {
        discarded: stats.discarded,
        externalNodes: externalNodes.size,
        relationshipsProcessed: edgeStats.relationshipsProcessed
      }
    }
  };

  const validationResult = validateCatalogGraph(graph);
  if (!validationResult.valid) {
    const details = validationResult.errors?.join('; ') ?? 'unknown validation failure';
    throw new Error(`Canonical graph failed schema validation: ${details}`);
  }

  return graph;
}

/**
 * Validate a canonical catalog graph object.
 * @param {object} graph
 * @returns {{valid: boolean, errors?: string[]}}
 */
export function validateCatalogGraph(graph) {
  const valid = validateGraphPayload(graph);
  if (valid) {
    return { valid: true };
  }

  const errors = (validateGraphPayload.errors || []).map((error) => {
    const pathRef = error.instancePath || '/';
    const message = error.message || 'Invalid value';
    return `${pathRef} ${message}`.trim();
  });

  return { valid: false, errors };
}

async function resolveCatalogPaths(inputPaths = [], workspace) {
  if (inputPaths.length > 0) {
    const resolved = await filterExistingPaths(inputPaths.map((candidate) => path.resolve(workspace, candidate)));
    if (resolved.length === 0) {
      throw new Error(
        `Catalog paths not found: ${inputPaths
          .map((candidate) => path.resolve(workspace, candidate))
          .join(', ')}`
      );
    }
    return resolved;
  }

  const defaults = [
    path.join(workspace, 'artifacts', 'catalog'),
    path.join(workspace, 'artifacts', 'catalogs'),
    path.join(workspace, 'artifacts', 'manifests'),
    path.join(workspace, 'artifacts'),
    path.join(workspace, 'examples', 'catalogs')
  ];

  const resolvedDefaults = await filterExistingPaths(defaults);
  if (resolvedDefaults.length === 0) {
    throw new Error(`Unable to locate catalog manifests in workspace: ${workspace}`);
  }

  return resolvedDefaults;
}

async function filterExistingPaths(candidates) {
  const results = [];
  const seen = new Set();

  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (await exists(candidate)) {
      results.push(candidate);
    }
  }

  return results;
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    return false;
  }
}

async function collectManifestFiles(catalogPaths) {
  const files = new Set();

  for (const inputPath of catalogPaths) {
    const stat = await safeStat(inputPath);
    if (!stat) continue;

    if (stat.isFile()) {
      if (isManifestFile(inputPath)) {
        files.add(path.resolve(inputPath));
      }
      continue;
    }

    if (stat.isDirectory()) {
      const discovered = await walkManifests(inputPath);
      for (const file of discovered) {
        files.add(file);
      }
    }
  }

  return Array.from(files).sort();
}

async function safeStat(targetPath) {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}

function isManifestFile(filePath) {
  const lower = filePath.toLowerCase();
  return lower.endsWith('.json') || lower.endsWith('.yaml') || lower.endsWith('.yml');
}

async function walkManifests(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkManifests(fullPath);
      for (const nestedFile of nested) {
        files.push(nestedFile);
      }
    } else if (entry.isFile() && isManifestFile(entry.name)) {
      files.push(path.resolve(fullPath));
    }
  }

  return files;
}

async function loadManifest(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const extension = path.extname(filePath).toLowerCase();

  try {
    if (extension === '.yaml' || extension === '.yml') {
      return YAML.parse(content);
    }
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse manifest at ${filePath}: ${error.message}`);
  }
}

function normaliseManifest(manifest, filePath, workspace) {
  const urn = extractUrn(manifest);
  if (!urn) {
    throw new Error(`Manifest missing URN: ${filePath}`);
  }

  const kind = extractKind(manifest, urn);
  const label = extractName(manifest, urn);
  const version = extractVersion(manifest, urn);

  const relationships = extractRelationships(manifest);
  const domain = extractDomain(manifest, kind);

  const relativePath = toPosixRelative(workspace, filePath);

  return {
    urn,
    label,
    kind,
    version,
    path: relativePath,
    domain,
    manifest,
    relationships
  };
}

function extractUrn(manifest) {
  return manifest.urn || manifest.metadata?.urn || manifest.service?.urn || manifest.integration?.urn || null;
}

function extractKind(manifest, urn) {
  if (manifest.metadata?.kind) {
    return manifest.metadata.kind;
  }

  if (typeof urn === 'string') {
    if (urn.includes(':api:')) return 'api';
    if (urn.includes(':data:')) return 'data';
    if (urn.includes(':event:')) return 'event';
    if (urn.includes(':workflow:')) return 'workflow';
    if (urn.includes(':agent:')) return 'agent';
    if (urn.includes(':integration:')) return 'integration';
  }

  if (manifest.api) return 'api';
  if (manifest.data) return 'data';
  if (manifest.event) return 'event';
  if (manifest.workflow) return 'workflow';
  if (manifest.agent) return 'agent';
  if (manifest.integration) return 'integration';

  return 'unknown';
}

function extractName(manifest, urn) {
  return (
    manifest.metadata?.name ||
    manifest.service?.name ||
    manifest.integration?.name ||
    manifest.event?.name ||
    inferNameFromUrn(urn) ||
    urn
  );
}

function extractVersion(manifest, urn) {
  if (manifest.metadata?.version) {
    return manifest.metadata.version;
  }

  const match = typeof urn === 'string' ? urn.match(/@([^#]+)/) : null;
  return match ? match[1] : '1.0.0';
}

function inferNameFromUrn(urn) {
  if (typeof urn !== 'string') return null;
  const parts = urn.split(':');
  const payload = parts[parts.length - 1];
  if (!payload) return null;
  return payload.split('@')[0]?.replace(/\//g, ' ') || null;
}

function extractDomain(manifest, fallbackKind) {
  const domain = manifest.metadata?.domain;
  if (!domain) {
    return manifest.metadata?.area || manifest.metadata?.category || fallbackKind || 'unknown';
  }

  if (typeof domain === 'string') {
    return domain;
  }

  if (Array.isArray(domain)) {
    return domain[0] || fallbackKind || 'unknown';
  }

  const candidates = [
    domain.primary,
    domain.name,
    domain.slug,
    domain.id,
    domain.type,
    domain.category
  ];

  for (const value of candidates) {
    if (value) {
      return value;
    }
  }

  if (manifest.metadata?.tags?.length) {
    return manifest.metadata.tags[0];
  }

  return fallbackKind || 'unknown';
}

function extractRelationships(manifest) {
  if (manifest.relationships && typeof manifest.relationships === 'object') {
    return manifest.relationships;
  }
  return {};
}

function buildNodes(manifests, filters) {
  const nodes = [];
  const nodeIndex = new Map();
  const stats = {
    discarded: {
      nodes: 0
    }
  };

  for (const entry of manifests) {
    const nodeId = hashId('node', entry.urn, entry.path || '');
    const node = {
      id: nodeId,
      label: entry.label,
      type: entry.kind,
      domain: entry.domain || 'unknown',
      urn: entry.urn,
      path: entry.path,
      metadata: buildNodeMetadata(entry)
    };

    if (filters && !matchesFilters(node, filters)) {
      stats.discarded.nodes += 1;
      continue;
    }

    nodes.push(node);
    nodeIndex.set(entry.urn, {
      urn: entry.urn,
      node,
      manifest: entry
    });
  }

  return { nodes, nodeIndex, stats };
}

function buildNodeMetadata(entry) {
  const metadata = {
    version: entry.version,
    kind: entry.kind,
    domain: entry.domain || 'unknown'
  };

  const manifestMeta = entry.manifest.metadata || {};

  if (manifestMeta.description) metadata.description = manifestMeta.description;
  if (manifestMeta.status) metadata.status = manifestMeta.status;
  if (manifestMeta.visibility) metadata.visibility = manifestMeta.visibility;
  if (Array.isArray(manifestMeta.tags) && manifestMeta.tags.length > 0) metadata.tags = manifestMeta.tags;

  const owner =
    manifestMeta.governance?.owner ||
    manifestMeta.owner ||
    manifestMeta.governance?.classification ||
    null;
  if (owner) {
    metadata.owner = owner;
  }

  return metadata;
}

function buildEdges(manifests, nodeIndex, filters) {
  const edges = [];
  const externalNodes = new Map();
  const edgeSeen = new Set();
  const stats = {
    relationshipsProcessed: 0
  };

  for (const entry of manifests) {
    const sourceNode = nodeIndex.get(entry.urn);
    if (!sourceNode) continue;

    const relationships = entry.relationships;
    for (const [relationshipName, targets] of Object.entries(relationships)) {
      if (!Array.isArray(targets) || targets.length === 0) continue;

      for (const rawTarget of targets) {
        const targetUrn = typeof rawTarget === 'string' ? rawTarget : rawTarget?.urn;
        if (!targetUrn) {
          continue;
        }

        stats.relationshipsProcessed += 1;

        let targetNode = nodeIndex.get(targetUrn);

        if (!targetNode) {
          const external = buildExternalNode(targetUrn);
          if (!filters || matchesFilters(external.node, filters)) {
            externalNodes.set(targetUrn, external);
            targetNode = external;
          } else {
            continue;
          }
        }

        const relationshipType = relationshipName.toLowerCase();
        const edgeKey = `${sourceNode.node.id}->${targetNode.node.id}:${relationshipType}`;
        if (edgeSeen.has(edgeKey)) {
          continue;
        }
        edgeSeen.add(edgeKey);

        const edge = {
          id: hashId('edge', sourceNode.node.id, targetNode.node.id, relationshipType),
          source: sourceNode.node.id,
          target: targetNode.node.id,
          type: relationshipType,
          label: toTitle(relationshipType.replace(/_/g, ' ')),
          metadata: {
            relationship: relationshipName,
            sourceUrn: entry.urn,
            targetUrn,
            sourcePath: entry.path,
            targetPath: targetNode.manifest?.path ?? null
          }
        };

        if (filters && !matchesEdgeFilters(edge, filters, sourceNode.node, targetNode.node)) {
          continue;
        }

        edges.push(edge);
      }
    }
  }

  return { edges, externalNodes, edgeStats: stats };
}

function buildExternalNode(urn) {
  const node = {
    id: hashId('node', urn, 'external'),
    label: urn,
    type: 'external',
    domain: 'external',
    urn,
    path: null,
    metadata: {
      external: true,
      urn
    }
  };

  return {
    urn,
    node,
    manifest: null
  };
}

function matchesFilters(node, filters) {
  if (!filters) return true;

  if (filters.domain?.length) {
    const domain = node.domain?.toLowerCase() ?? '';
    if (!filters.domain.includes(domain)) {
      return false;
    }
  }

  if (filters.type?.length) {
    const type = node.type?.toLowerCase() ?? '';
    if (!filters.type.includes(type)) {
      return false;
    }
  }

  if (filters.urnPrefix?.length) {
    const urn = node.urn ?? '';
    const match = filters.urnPrefix.some((prefix) => urn.startsWith(prefix));
    if (!match) {
      return false;
    }
  }

  return true;
}

function matchesEdgeFilters(edge, filters, sourceNode, targetNode) {
  if (!filters) return true;
  if (!matchesFilters(sourceNode, filters)) return false;
  if (!matchesFilters(targetNode, filters)) return false;
  if (filters.relationship?.length) {
    const type = edge.type?.toLowerCase() ?? '';
    if (!filters.relationship.includes(type)) {
      return false;
    }
  }
  return true;
}

function normaliseFilters(filters) {
  if (!filters) return null;
  const normalised = {};

  if (Array.isArray(filters.domain) && filters.domain.length > 0) {
    normalised.domain = filters.domain.map((value) => value.toLowerCase());
  }
  if (Array.isArray(filters.type) && filters.type.length > 0) {
    normalised.type = filters.type.map((value) => value.toLowerCase());
  }
  if (Array.isArray(filters.urnPrefix) && filters.urnPrefix.length > 0) {
    normalised.urnPrefix = filters.urnPrefix;
  }
  if (Array.isArray(filters.relationship) && filters.relationship.length > 0) {
    normalised.relationship = filters.relationship.map((value) => value.toLowerCase());
  }

  return Object.keys(normalised).length > 0 ? normalised : null;
}

function hashId(...parts) {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(String(part ?? ''));
    hash.update('|');
  }
  return hash.digest('hex').slice(0, 16);
}

function toTitle(value) {
  return value
    .split(' ')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
    .trim();
}

function toPosixRelative(workspace, filePath) {
  const relative = path.relative(workspace, filePath);
  return relative.split(path.sep).join('/');
}

export default {
  buildCatalogGraph,
  validateCatalogGraph
};
