import type { CanonicalGraph } from './exporter.ts';

import {
  DEFAULT_THRESHOLDS as DEFAULT_THRESHOLDS_IMPL,
  estimateGraphFootprint as estimateGraphFootprintImpl,
  buildGuardrailWarnings as buildGuardrailWarningsImpl
} from './guardrails.js';

export type GuardrailTier = 'optimal' | 'warning' | 'critical';

export interface GuardrailThresholdBand {
  nodes: number;
  sizeMB: number;
}

export interface GuardrailThresholds {
  warning: GuardrailThresholdBand;
  critical: GuardrailThresholdBand;
}

export interface GuardrailStats {
  nodeCount: number;
  edgeCount: number;
  labelChars: number;
  edgeLabelChars: number;
  descriptionChars: number;
  metadataEntries: number;
  estimatedBytes: number;
  estimatedSizeMB: number;
}

export interface GuardrailEstimate {
  tier: GuardrailTier;
  stats: GuardrailStats;
  thresholds: GuardrailThresholds;
  reasons: string[];
  suggestions: string[];
}

export const DEFAULT_THRESHOLDS = DEFAULT_THRESHOLDS_IMPL as GuardrailThresholds;

export const estimateGraphFootprint = estimateGraphFootprintImpl as (
  graph: CanonicalGraph,
  thresholds?: GuardrailThresholds
) => GuardrailEstimate;

export const buildGuardrailWarnings = buildGuardrailWarningsImpl as (
  estimate: GuardrailEstimate | null | undefined
) => string[];

export default {
  DEFAULT_THRESHOLDS,
  estimateGraphFootprint,
  buildGuardrailWarnings
};
