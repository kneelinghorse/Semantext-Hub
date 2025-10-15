import type { CanonicalGraph } from './exporter.ts';

import {
  createLayerPlan as createLayerPlanImpl,
  splitGraphByProperty as splitGraphByPropertyImpl
} from './decompose.js';

export interface LayerPlanLayer {
  id: string;
  key: string;
  label: string;
  nodeIds: string[];
  missing?: boolean;
}

export interface LayerPlan {
  enabled: boolean;
  property?: string | null;
  layers: LayerPlanLayer[];
  assignments: Record<string, string>;
  stats: {
    missingCount: number;
    totalLayers: number;
  };
}

export interface SplitGroupStats {
  nodeCount: number;
  edgeCount: number;
  crossGroupEdges: number;
}

export interface SplitGroup {
  key: string;
  label: string;
  graph: CanonicalGraph;
  stats: SplitGroupStats;
  isFallback: boolean;
}

export interface SplitPlanStats {
  totalGroups: number;
  missingAssignments: number;
  crossGroupEdges: number;
}

export interface SplitPlan {
  enabled: boolean;
  property?: string | null;
  groups: SplitGroup[];
  stats: SplitPlanStats;
}

export const createLayerPlan = createLayerPlanImpl as (graph: CanonicalGraph, property?: string | null) => LayerPlan;

export const splitGraphByProperty = splitGraphByPropertyImpl as (
  graph: CanonicalGraph,
  property?: string | null
) => SplitPlan;

export default {
  createLayerPlan,
  splitGraphByProperty
};
