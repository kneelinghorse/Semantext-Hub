import type { CanonicalGraph } from '../../visualization/drawio/exporter.ts';

import { buildCatalogGraph as buildCatalogGraphJs, validateCatalogGraph as validateCatalogGraphJs } from './builder.js';

export interface CatalogGraphFilters {
  domain?: string[];
  type?: string[];
  urnPrefix?: string[];
  relationship?: string[];
}

export interface BuildCatalogGraphOptions {
  workspace?: string;
  catalogPaths?: string[];
  filters?: CatalogGraphFilters;
  graphId?: string;
  graphName?: string;
  graphDescription?: string;
  graphVersion?: string;
}

export interface CatalogGraphValidationResult {
  valid: boolean;
  errors?: string[];
}

type BuildCatalogGraphSignature = (options?: BuildCatalogGraphOptions) => Promise<CanonicalGraph>;
type ValidateCatalogGraphSignature = (graph: CanonicalGraph) => CatalogGraphValidationResult;

const buildCatalogGraph = buildCatalogGraphJs as BuildCatalogGraphSignature;
const validateCatalogGraph = validateCatalogGraphJs as ValidateCatalogGraphSignature;

export { buildCatalogGraph, validateCatalogGraph };

export default {
  buildCatalogGraph,
  validateCatalogGraph
};
