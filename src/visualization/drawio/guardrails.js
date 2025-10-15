const DEFAULT_THRESHOLDS = Object.freeze({
  warning: Object.freeze({ nodes: 250, sizeMB: 5 }),
  critical: Object.freeze({ nodes: 400, sizeMB: 10 })
});

const MITIGATION_TIPS = Object.freeze([
  'Use --layer-by <property> to toggle heavy domains or product areas.',
  'Use --split-by <property> to generate smaller pages for large catalogs.',
  'Filter or target a specific protocol before exporting to reduce scope.'
]);

function normalizeThresholds(thresholds = {}) {
  const warning = thresholds.warning ?? DEFAULT_THRESHOLDS.warning;
  const critical = thresholds.critical ?? DEFAULT_THRESHOLDS.critical;
  return {
    warning: {
      nodes: typeof warning.nodes === 'number' ? warning.nodes : DEFAULT_THRESHOLDS.warning.nodes,
      sizeMB: typeof warning.sizeMB === 'number' ? warning.sizeMB : DEFAULT_THRESHOLDS.warning.sizeMB
    },
    critical: {
      nodes: typeof critical.nodes === 'number' ? critical.nodes : DEFAULT_THRESHOLDS.critical.nodes,
      sizeMB: typeof critical.sizeMB === 'number' ? critical.sizeMB : DEFAULT_THRESHOLDS.critical.sizeMB
    }
  };
}

function countMetadataEntries(value, depth = 0) {
  if (value === null || value === undefined) {
    return 0;
  }

  if (depth > 4) {
    // Guard against extremely deep objects that could skew heuristics.
    return 0;
  }

  if (Array.isArray(value)) {
    return value.reduce((total, entry) => total + countMetadataEntries(entry, depth + 1), 0);
  }

  if (typeof value === 'object') {
    return Object.values(value).reduce((total, entry) => total + 1 + countMetadataEntries(entry, depth + 1), 0);
  }

  return 1;
}

function computeEstimatedBytes(stats) {
  const baseNodeCost = 420;
  const baseEdgeCost = 220;
  const labelWeight = 4;
  const descriptionWeight = 4;
  const metadataWeight = 64;

  return (
    stats.nodeCount * baseNodeCost +
    stats.edgeCount * baseEdgeCost +
    (stats.labelChars + stats.edgeLabelChars) * labelWeight +
    stats.descriptionChars * descriptionWeight +
    stats.metadataEntries * metadataWeight
  );
}

function buildStats(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];

  let labelChars = 0;
  let edgeLabelChars = 0;
  let descriptionChars = 0;
  let metadataEntries = 0;

  for (const node of nodes) {
    if (typeof node?.label === 'string') {
      labelChars += node.label.length;
    }
    if (typeof node?.description === 'string') {
      descriptionChars += node.description.length;
    }
    metadataEntries += countMetadataEntries(node?.metadata);
  }

  for (const edge of edges) {
    if (typeof edge?.label === 'string') {
      edgeLabelChars += edge.label.length;
    }
    metadataEntries += countMetadataEntries(edge?.metadata);
  }

  const estimatedBytes = computeEstimatedBytes({
    nodeCount: nodes.length,
    edgeCount: edges.length,
    labelChars,
    edgeLabelChars,
    descriptionChars,
    metadataEntries
  });

  const estimatedSizeMB = Number((estimatedBytes / (1024 * 1024)).toFixed(2));

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    labelChars,
    edgeLabelChars,
    descriptionChars,
    metadataEntries,
    estimatedBytes,
    estimatedSizeMB
  };
}

function evaluateTier(stats, thresholds) {
  const reasons = [];
  let tier = 'optimal';

  if (stats.nodeCount >= thresholds.critical.nodes) {
    tier = 'critical';
    reasons.push(`Node count ${stats.nodeCount} exceeds critical threshold ${thresholds.critical.nodes}.`);
  } else if (stats.nodeCount >= thresholds.warning.nodes) {
    tier = 'warning';
    reasons.push(`Node count ${stats.nodeCount} exceeds warning threshold ${thresholds.warning.nodes}.`);
  }

  if (stats.estimatedSizeMB >= thresholds.critical.sizeMB) {
    tier = 'critical';
    reasons.push(
      `Estimated diagram size ${stats.estimatedSizeMB} MB exceeds critical threshold ${thresholds.critical.sizeMB} MB.`
    );
  } else if (stats.estimatedSizeMB >= thresholds.warning.sizeMB && tier !== 'critical') {
    tier = 'warning';
    reasons.push(
      `Estimated diagram size ${stats.estimatedSizeMB} MB exceeds warning threshold ${thresholds.warning.sizeMB} MB.`
    );
  }

  return { tier, reasons };
}

export function estimateGraphFootprint(graph, thresholdsOverride) {
  const thresholds = normalizeThresholds(thresholdsOverride);
  const stats = buildStats(graph);
  const evaluation = evaluateTier(stats, thresholds);

  return {
    tier: evaluation.tier,
    stats,
    thresholds,
    reasons: evaluation.reasons,
    suggestions: evaluation.tier === 'optimal' ? [] : MITIGATION_TIPS.map((tip) => tip)
  };
}

export function buildGuardrailWarnings(estimate) {
  if (!estimate || estimate.tier === 'optimal') {
    return [];
  }

  const prefix = estimate.tier === 'critical' ? 'Guardrail critical' : 'Guardrail warning';
  const reasons =
    estimate.reasons && estimate.reasons.length > 0 ? estimate.reasons.join(' ') : 'Large diagram detected.';
  const mitigation =
    estimate.suggestions && estimate.suggestions.length > 0
      ? `Mitigation: ${estimate.suggestions.join(' ')}`
      : '';

  return mitigation ? [`${prefix}: ${reasons} ${mitigation}`.trim()] : [`${prefix}: ${reasons}`];
}

export { DEFAULT_THRESHOLDS };

export default {
  DEFAULT_THRESHOLDS,
  estimateGraphFootprint,
  buildGuardrailWarnings
};
