import type { CanonicalGraph, DrawioWriteResult } from '../../src/visualization/drawio/exporter.ts';

import {
  generateDiagram as generateDiagramJs,
  catalogGenerateDiagramCommand as catalogGenerateDiagramCommandJs
} from './catalog-generate-diagram.js';

export interface GenerateDiagramOptions {
  workspace?: string;
  input?: string;
  output?: string;
  overwrite?: boolean;
  layerBy?: string;
  splitBy?: string;
  graph?: CanonicalGraph;
  silent?: boolean;
  prefix?: string;
  themeId?: string;
}

export type GenerateDiagramResult = DrawioWriteResult;

export interface CatalogGenerateDiagramOptions extends Omit<GenerateDiagramOptions, 'graph'> {
  format?: 'drawio';
  open?: boolean;
}

export interface CatalogGenerateDiagramResult extends GenerateDiagramResult {
  focus: string;
}

export const generateDiagram = generateDiagramJs as (
  options?: GenerateDiagramOptions
) => Promise<GenerateDiagramResult>;

export const catalogGenerateDiagramCommand = catalogGenerateDiagramCommandJs as (
  identifier?: string | null,
  options?: CatalogGenerateDiagramOptions
) => Promise<CatalogGenerateDiagramResult>;

export default {
  generateDiagram,
  catalogGenerateDiagramCommand
};
