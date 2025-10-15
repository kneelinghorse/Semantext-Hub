import type { PathLike } from 'fs';
import type { GuardrailEstimate } from './guardrails.ts';
import {
  exportDrawio as exportDrawioUnTyped,
  writeDrawio as writeDrawioUnTyped,
  DrawioExportError as DrawioExportErrorBase
} from './exporter.js';

export interface CanonicalGraphNode {
  id: string;
  label: string;
  type: string;
  domain?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  position?: {
    x?: number;
    y?: number;
  };
  size?: {
    width?: number;
    height?: number;
  };
  style?: Record<string, string | number>;
}

export interface CanonicalGraphEdge {
  id?: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
  metadata?: Record<string, unknown>;
  style?: Record<string, string | number>;
}

export interface CanonicalGraph {
  id?: string;
  name?: string;
  description?: string;
  version?: string;
  generatedAt?: string;
  nodes: CanonicalGraphNode[];
  edges: CanonicalGraphEdge[];
  metadata?: Record<string, unknown>;
}

export interface DrawioExportOptions {
  diagramName?: string;
  host?: string;
  layerBy?: string;
  splitBy?: string;
  themeId?: string;
  layout?: Partial<{
    columns: number;
    horizontalSpacing: number;
    verticalSpacing: number;
    originX: number;
    originY: number;
  }>;
  overwrite?: boolean;
}

export interface DrawioExportResult {
  xml: string;
  diagramName: string;
  nodeCount: number;
  edgeCount: number;
  diagramCount: number;
  warnings: string[];
  guardrail: GuardrailEstimate;
}

export type DrawioWriteResult = DrawioExportResult & { outputPath: string };

type ExportDrawioSignature = (graph: CanonicalGraph, options?: DrawioExportOptions) => DrawioExportResult;
type WriteDrawioSignature = (
  graph: CanonicalGraph,
  outputPath: PathLike | string,
  options?: DrawioExportOptions
) => Promise<DrawioWriteResult>;

const exportDrawioImpl = exportDrawioUnTyped as unknown as ExportDrawioSignature;
const writeDrawioImpl = writeDrawioUnTyped as unknown as WriteDrawioSignature;

export class DrawioExportError extends DrawioExportErrorBase {}

export function exportDrawio(graph: CanonicalGraph, options: DrawioExportOptions = {}): DrawioExportResult {
  return exportDrawioImpl(graph, options);
}

export function writeDrawio(
  graph: CanonicalGraph,
  outputPath: PathLike | string,
  options: DrawioExportOptions = {}
): Promise<DrawioWriteResult> {
  return writeDrawioImpl(graph, outputPath, options);
}

export default {
  exportDrawio,
  writeDrawio,
  DrawioExportError
};
