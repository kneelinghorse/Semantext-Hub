import type { PathLike } from 'fs';
import type { CanonicalGraph } from '../drawio/exporter.ts';

import {
  exportCytoscape as exportCytoscapeUntyped,
  writeCytoscape as writeCytoscapeUntyped,
  CytoscapeExportError as CytoscapeExportErrorBase
} from './exporter.js';

export interface CytoscapeElementData {
  id: string;
  label: string;
  type?: string;
  domain?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  urn?: string;
}

export interface CytoscapeNodeElement {
  data: CytoscapeElementData;
  position?: {
    x: number;
    y: number;
  };
  classes?: string[];
  locked?: boolean;
  selectable?: boolean;
}

export interface CytoscapeEdgeElement {
  data: {
    id: string;
    source: string;
    target: string;
    type?: string;
    label?: string;
    metadata?: Record<string, unknown>;
  };
  classes?: string[];
  selectable?: boolean;
}

export interface CytoscapeStyleDefinition {
  selector: string;
  style: Record<string, string | number>;
}

export interface CytoscapeLayoutOptions {
  name?: string;
  maxSimulationTime?: number;
  refresh?: number;
  animate?: boolean;
  fit?: boolean;
  padding?: number;
  edgeElasticity?: number;
  nodeSpacing?: number;
  [key: string]: unknown;
}

export interface CytoscapeExportOptions {
  layout?: CytoscapeLayoutOptions;
  overwrite?: boolean;
  includeMetadata?: boolean;
  themeId?: string;
}

export interface CytoscapeExportPayload {
  format: 'cytoscape-v1';
  generatedAt: string;
  graph: {
    id?: string;
    name?: string;
    description?: string;
    version?: string;
  };
  stats: {
    nodes: number;
    edges: number;
  };
  metadata?: Record<string, unknown>;
  elements: {
    nodes: CytoscapeNodeElement[];
    edges: CytoscapeEdgeElement[];
  };
  style: CytoscapeStyleDefinition[];
  layout: Required<CytoscapeLayoutOptions>;
  warnings: string[];
}

export interface CytoscapeExportResult extends CytoscapeExportPayload {}

export interface CytoscapeWriteResult extends CytoscapeExportResult {
  outputPath: string;
}

type ExportCytoscapeSignature = (graph: CanonicalGraph, options?: CytoscapeExportOptions) => CytoscapeExportResult;
type WriteCytoscapeSignature = (
  graph: CanonicalGraph,
  outputPath: PathLike | string,
  options?: CytoscapeExportOptions
) => Promise<CytoscapeWriteResult>;

const exportCytoscapeImpl = exportCytoscapeUntyped as unknown as ExportCytoscapeSignature;
const writeCytoscapeImpl = writeCytoscapeUntyped as unknown as WriteCytoscapeSignature;

export class CytoscapeExportError extends CytoscapeExportErrorBase {}

export function exportCytoscape(
  graph: CanonicalGraph,
  options: CytoscapeExportOptions = {}
): CytoscapeExportResult {
  return exportCytoscapeImpl(graph, options);
}

export function writeCytoscape(
  graph: CanonicalGraph,
  outputPath: PathLike | string,
  options: CytoscapeExportOptions = {}
): Promise<CytoscapeWriteResult> {
  return writeCytoscapeImpl(graph, outputPath, options);
}

export default {
  exportCytoscape,
  writeCytoscape,
  CytoscapeExportError
};
