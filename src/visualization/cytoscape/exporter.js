import { access, writeFile } from 'fs/promises';
import path from 'path';
import Ajv from 'ajv';
import { ensureDir } from 'fs-extra';

import { getCytoscapeTheme } from '../theme/serializer.js';

const ajv = new Ajv({
  allErrors: true,
  strict: false
});

const canonicalGraphSchema = {
  type: 'object',
  required: ['nodes', 'edges'],
  properties: {
    id: { type: 'string', nullable: true },
    name: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    version: { type: 'string', nullable: true },
    generatedAt: { type: 'string', nullable: true },
    metadata: { type: 'object', nullable: true, additionalProperties: true },
    nodes: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'label'],
        additionalProperties: true,
        properties: {
          id: { type: 'string', minLength: 1 },
          label: { type: 'string', minLength: 1 },
          type: { type: 'string' },
          domain: { type: 'string' },
          urn: { type: 'string' },
          description: { type: 'string' },
          metadata: { type: 'object', additionalProperties: true },
          position: {
            type: 'object',
            additionalProperties: false,
            properties: {
              x: { type: 'number' },
              y: { type: 'number' }
            }
          }
        }
      }
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        required: ['source', 'target'],
        additionalProperties: true,
        properties: {
          id: { type: ['string', 'null'] },
          source: { type: 'string', minLength: 1 },
          target: { type: 'string', minLength: 1 },
          type: { type: 'string' },
          label: { type: 'string' },
          metadata: { type: 'object', additionalProperties: true }
        }
      }
    }
  },
  additionalProperties: true
};

const validateGraph = ajv.compile(canonicalGraphSchema);

export class CytoscapeExportError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'CytoscapeExportError';
    this.details = Array.isArray(details) ? details : details ? [details] : [];
  }
}

function assertGraph(graph) {
  if (!validateGraph(graph)) {
    const errors = (validateGraph.errors || []).map((error) => `${error.instancePath || '/'} ${error.message ?? ''}`.trim());
    throw new CytoscapeExportError('Invalid canonical graph payload.', errors);
  }
}

function normaliseLayout(themeLayout, options = {}) {
  const base = themeLayout && typeof themeLayout === 'object' ? themeLayout : {};
  return Object.freeze({
    ...base,
    ...(options && typeof options === 'object' ? options : {})
  });
}

function createNodeElement(node, warnings) {
  const classes = [];
  if (node.type) {
    classes.push(`type-${node.type}`);
  }
  if (node.domain) {
    classes.push(`domain-${node.domain}`);
  }
  const hasPosition = node.position && typeof node.position.x === 'number' && typeof node.position.y === 'number';
  if (!node.domain || node.domain === 'unknown') {
    warnings.add(`Node "${node.label}" (${node.id}) is missing a recognised domain. Default styling will be applied.`);
  }

  return {
    data: {
      id: node.id,
      label: node.label,
      type: node.type ?? null,
      domain: node.domain ?? null,
      description: node.description ?? node.metadata?.description ?? null,
      metadata: node.metadata ?? null,
      urn: node.urn ?? null
    },
    ...(hasPosition
      ? {
          position: {
            x: node.position.x,
            y: node.position.y
          }
        }
      : {}),
    ...(classes.length > 0 ? { classes: classes.join(' ') } : {})
  };
}

function createEdgeElement(edge, index) {
  const edgeId =
    edge.id && typeof edge.id === 'string' && edge.id.length > 0
      ? edge.id
      : `edge-${index}-${edge.source}-${edge.target}`;
  const classes = [];
  if (edge.type) {
    classes.push(`type-${edge.type}`);
  }
  return {
    data: {
      id: edgeId,
      source: edge.source,
      target: edge.target,
      type: edge.type ?? null,
      label: edge.label ?? null,
      metadata: edge.metadata ?? null
    },
    ...(classes.length > 0 ? { classes: classes.join(' ') } : {})
  };
}

function dedupeWarnings(warnings) {
  return Array.from(new Set(Array.from(warnings).filter(Boolean)));
}

export function exportCytoscape(graph, options = {}) {
  assertGraph(graph);

  const warnings = new Set();

  const nodeIdSet = new Set(graph.nodes.map((node) => node.id));
  const cytoscapeTheme = getCytoscapeTheme(options.themeId);
  const themeStyle = cytoscapeTheme.style.map((entry) => ({
    selector: entry.selector,
    style: { ...entry.style }
  }));
  const layout = normaliseLayout(cytoscapeTheme.layout, options.layout);

  const payload = {
    format: 'cytoscape-v1',
    generatedAt: new Date().toISOString(),
    graph: {
      id: graph.id ?? null,
      name: graph.name ?? null,
      description: graph.description ?? null,
      version: graph.version ?? null
    },
    stats: {
      nodes: graph.nodes.length,
      edges: graph.edges.length
    },
    metadata: options.includeMetadata === false ? undefined : graph.metadata ?? null,
    elements: {
      nodes: graph.nodes.map((node) => createNodeElement(node, warnings)),
      edges: graph.edges.map((edge, index) => createEdgeElement(edge, index))
    },
    style: themeStyle,
    layout,
    warnings: []
  };

  if (payload.metadata === null) {
    delete payload.metadata;
  }

  for (const node of graph.nodes) {
    if (node.type && !cytoscapeTheme.hasNodeType(node.type)) {
      warnings.add(`No Cytoscape style entry for node type "${node.type}". Using base node styling.`);
    }
    if (node.domain && !cytoscapeTheme.hasDomain(node.domain)) {
      warnings.add(`No Cytoscape style entry for domain "${node.domain}". Using theme defaults.`);
    }
  }

  for (const edge of graph.edges) {
    if (edge.type && !cytoscapeTheme.hasEdgeType(edge.type)) {
      warnings.add(`No Cytoscape edge style for type "${edge.type}". Using default edge styling.`);
    }
  }

  for (const edge of payload.elements.edges) {
    if (!nodeIdSet.has(edge.data.source) || !nodeIdSet.has(edge.data.target)) {
      warnings.add('Some edges reference unknown nodes. Verify catalog integrity.');
      break;
    }
  }

  payload.warnings = dedupeWarnings(warnings);

  return payload;
}

async function ensureWritable(targetPath, overwrite = false) {
  try {
    await access(targetPath);
    if (!overwrite) {
      throw new CytoscapeExportError(
        `File already exists at ${targetPath}. Pass { overwrite: true } to replace the existing export.`
      );
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return;
    }
    if (error instanceof CytoscapeExportError) {
      throw error;
    }
    throw new CytoscapeExportError(`Unable to write export file at ${targetPath}`, error?.message ?? error);
  }
}

export async function writeCytoscape(graph, outputPath, options = {}) {
  const resolvedPath = path.resolve(String(outputPath));
  const payload = exportCytoscape(graph, options);

  await ensureDir(path.dirname(resolvedPath));
  await ensureWritable(resolvedPath, Boolean(options.overwrite));

  await writeFile(resolvedPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  return {
    ...payload,
    outputPath: resolvedPath
  };
}

export default {
  exportCytoscape,
  writeCytoscape,
  CytoscapeExportError
};
