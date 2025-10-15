import { writeFile } from 'fs/promises';
import path from 'path';
import { create } from 'xmlbuilder2';
import Ajv from 'ajv';
import { ensureDir } from 'fs-extra';

import { estimateGraphFootprint, buildGuardrailWarnings } from './guardrails.js';
import { createLayerPlan, splitGraphByProperty } from './decompose.js';
import { getDrawioTheme, styleObjectToString } from '../theme/serializer.js';

const ajv = new Ajv({
  allErrors: true,
  strict: false
});

const graphSchema = {
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
        required: ['id', 'label', 'type'],
        additionalProperties: true,
        properties: {
          id: { type: 'string', minLength: 1 },
          label: { type: 'string', minLength: 1 },
          type: { type: 'string', minLength: 1 },
          domain: { type: 'string' },
          description: { type: 'string' },
          metadata: { type: 'object', additionalProperties: true },
          position: {
            type: 'object',
            additionalProperties: false,
            properties: {
              x: { type: 'number' },
              y: { type: 'number' }
            }
          },
          size: {
            type: 'object',
            additionalProperties: false,
            properties: {
              width: { type: 'number', minimum: 1 },
              height: { type: 'number', minimum: 1 }
            }
          },
          style: {
            type: 'object',
            additionalProperties: {
              anyOf: [
                { type: 'string' },
                { type: 'number' }
              ]
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
          id: { type: 'string' },
          source: { type: 'string', minLength: 1 },
          target: { type: 'string', minLength: 1 },
          type: { type: 'string' },
          label: { type: 'string' },
          metadata: { type: 'object', additionalProperties: true },
          style: {
            type: 'object',
            additionalProperties: {
              anyOf: [
                { type: 'string' },
                { type: 'number' }
              ]
            }
          }
        }
      }
    }
  },
  additionalProperties: false
};

const validateGraph = ajv.compile(graphSchema);

const defaultLayout = {
  columns: 4,
  horizontalSpacing: 220,
  verticalSpacing: 140,
  originX: 40,
  originY: 40
};

export class DrawioExportError extends Error {
  constructor(message, details) {
    super(message);
    this.details = details;
    this.name = 'DrawioExportError';
  }
}

function assertGraph(value) {
  if (!validateGraph(value)) {
    const messages = (validateGraph.errors || [])
      .map((error) => `${error.instancePath || '/'} ${error.message ?? ''}`.trim());
    throw new DrawioExportError('Invalid canonical graph payload', messages);
  }
}

function applyGridLayout(nodes, options = {}, drawioTheme) {
  const layout = { ...defaultLayout, ...options };
  return nodes.map((node, index) => {
    const resolved = drawioTheme.resolveNodeStyle(node);
    const column = index % layout.columns;
    const row = Math.floor(index / layout.columns);

    const x = node.position?.x ?? layout.originX + column * layout.horizontalSpacing;
    const y = node.position?.y ?? layout.originY + row * layout.verticalSpacing;

    return {
      node,
      resolved,
      geometry: {
        x,
        y,
        width: resolved.width,
        height: resolved.height
      }
    };
  });
}

function nowIso() {
  return new Date().toISOString();
}

function pushWarning(collection, message) {
  if (!message) {
    return;
  }
  if (!collection.includes(message)) {
    collection.push(message);
  }
}

function renderDiagram(diagramElement, graph, options, warnings, layerPlan, drawioTheme) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];

  const layoutNodes = applyGridLayout(nodes, options.layout, drawioTheme);

  for (const { node } of layoutNodes) {
    if (node.type && !drawioTheme.hasNodeType(node.type)) {
      pushWarning(warnings, `No explicit node style for type "${node.type}", falling back to defaults.`);
    }
    if (node.domain && !drawioTheme.hasDomain(node.domain)) {
      pushWarning(warnings, `No explicit domain style for "${node.domain}", using type/default styles.`);
    }
  }

  for (const edge of edges) {
    if (edge.type && !drawioTheme.hasEdgeType(edge.type)) {
      pushWarning(warnings, `No explicit edge style for type "${edge.type}", using default edge style.`);
    }
  }

  const model = diagramElement.ele('mxGraphModel', {
    dx: 1024,
    dy: 768,
    grid: 1,
    gridSize: 10,
    guides: 1,
    tooltips: 1,
    connect: 1,
    arrows: 1,
    fold: 1,
    page: 1,
    pageScale: 1,
    pageWidth: 1100,
    pageHeight: 850,
    math: 0,
    shadow: 0
  });

  const root = model.ele('root');
  root.ele('mxCell', { id: '0' });
  root.ele('mxCell', { id: '1', parent: '0' });

  const layerAssignments = layerPlan?.enabled ? layerPlan.assignments ?? {} : null;

  if (layerPlan?.enabled) {
    for (const layer of layerPlan.layers) {
      root.ele('mxCell', {
        id: layer.id,
        value: layer.label,
        parent: '0',
        visible: 1,
        locked: 0,
        layer: 1
      });
    }
  }

  for (const layoutNode of layoutNodes) {
    const { node, resolved, geometry } = layoutNode;
    const parentId = layerAssignments?.[node.id] ?? '1';

    const cell = root.ele('mxCell', {
      id: node.id,
      value: node.label,
      style: styleObjectToString(resolved.style),
      vertex: 1,
      parent: parentId
    });

    cell.ele('mxGeometry', {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      as: 'geometry'
    });
  }

  edges.forEach((edge, index) => {
    const resolved = drawioTheme.resolveEdgeStyle(edge);
    const sourceLayer = layerAssignments?.[edge.source];
    const targetLayer = layerAssignments?.[edge.target];
    const parentId = sourceLayer && sourceLayer === targetLayer ? sourceLayer : '1';

    const cell = root.ele('mxCell', {
      id: edge.id ?? `edge-${index + 1}`,
      value: edge.label ?? '',
      style: styleObjectToString(resolved.style),
      edge: 1,
      parent: parentId,
      source: edge.source,
      target: edge.target
    });

    cell.ele('mxGeometry', {
      relative: 1,
      as: 'geometry'
    });
  });
}

export function exportDrawio(graph, options = {}) {
  assertGraph(graph);

  const warnings = [];
  const guardrail = estimateGraphFootprint(graph);
  const guardrailWarnings = buildGuardrailWarnings(guardrail);
  for (const message of guardrailWarnings) {
    pushWarning(warnings, message);
  }

  const diagramName = options.diagramName ?? graph.name ?? 'Catalog Graph';
  const host = options.host ?? 'app.diagrams.net';

  const splitPlan = splitGraphByProperty(graph, options.splitBy);
  const drawioTheme = getDrawioTheme(options.themeId);

  if (splitPlan.enabled && options.splitBy) {
    pushWarning(
      warnings,
      `Split diagram into ${splitPlan.stats.totalGroups} page(s) using "${options.splitBy}".`
    );
    if (splitPlan.stats.crossGroupEdges > 0) {
      pushWarning(
        warnings,
        `${splitPlan.stats.crossGroupEdges} cross-group edge(s) omitted from individual pages.`
      );
    }
    if (splitPlan.stats.missingAssignments > 0) {
      const fallbackGroup = splitPlan.groups.find((group) => group.isFallback) ?? splitPlan.groups[0];
      pushWarning(
        warnings,
        `${splitPlan.stats.missingAssignments} node(s) without "${options.splitBy}" grouped under "${fallbackGroup.label}".`
      );
    }
  } else if (options.splitBy) {
    pushWarning(
      warnings,
      `Split requested via "${options.splitBy}" but only one group detected.`
    );
  }

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('mxfile', {
      host,
      modified: nowIso(),
      agent: 'ossp-agi-drawio-exporter',
      etag: `${Date.now()}`,
      version: '21.7.9',
      type: 'device'
    });

  const layerSummaries = [];

  splitPlan.groups.forEach((group, index) => {
    const diagramId = group.graph.id ?? `diagram-${index + 1}`;
    const labelSuffix = splitPlan.enabled ? group.label : null;
    const diagramLabel =
      group.graph.name ??
      (labelSuffix ? `${diagramName} – ${labelSuffix}` : diagramName);

    const diagram = doc.ele('diagram', {
      id: diagramId,
      name: diagramLabel
    });

    const layerPlan = options.layerBy ? createLayerPlan(group.graph, options.layerBy) : null;
    if (layerPlan?.enabled) {
      layerSummaries.push(layerPlan.stats);
    }

    renderDiagram(diagram, group.graph, options, warnings, layerPlan, drawioTheme);
  });

  if (layerSummaries.length > 0 && options.layerBy) {
    const maxLayers = layerSummaries.reduce(
      (max, summary) => Math.max(max, summary.totalLayers),
      0
    );
    const missingTotal = layerSummaries.reduce(
      (sum, summary) => sum + summary.missingCount,
      0
    );

    pushWarning(
      warnings,
      `Applied layer grouping by "${options.layerBy}" with up to ${maxLayers} layer(s) per page.`
    );

    if (missingTotal > 0) {
      pushWarning(
        warnings,
        `${missingTotal} node(s) missing "${options.layerBy}" assigned to an "Unassigned" layer.`
      );
    }
  } else if (options.layerBy) {
    pushWarning(
      warnings,
      `Layer grouping requested via "${options.layerBy}" but only one layer detected.`
    );
  }

  const xml = doc.end({ prettyPrint: true });

  return {
    xml,
    diagramName,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    diagramCount: splitPlan.groups.length,
    warnings,
    guardrail
  };
}

export async function writeDrawio(graph, outputPath, options = {}) {
  const result = exportDrawio(graph, options);
  const resolvedPath = path.resolve(outputPath);
  const directory = path.dirname(resolvedPath);

  await ensureDir(directory);

  if (!options.overwrite) {
    try {
      await writeFile(resolvedPath, result.xml, { flag: 'wx' });
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw new DrawioExportError(`File already exists at ${resolvedPath}. Pass overwrite option to replace it.`);
      }
      throw error;
    }
  } else {
    await writeFile(resolvedPath, result.xml, { flag: 'w' });
  }

  return {
    ...result,
    outputPath: resolvedPath
  };
}

export default {
  exportDrawio,
  writeDrawio,
  DrawioExportError
};
