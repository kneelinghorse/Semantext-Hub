import {
  estimateGraphFootprint,
  buildGuardrailWarnings
} from '../../../src/visualization/drawio/guardrails.ts';
import { splitGraphByProperty, createLayerPlan } from '../../../src/visualization/drawio/decompose.ts';
import type { CanonicalGraph } from '../../../src/visualization/drawio/exporter.ts';

describe('draw.io guardrails', () => {
  it('classifies small graphs as optimal', () => {
    const graph: CanonicalGraph = {
      nodes: [
        { id: 'a', label: 'A', type: 'service', domain: 'core' },
        { id: 'b', label: 'B', type: 'service', domain: 'support' }
      ],
      edges: [{ source: 'a', target: 'b', type: 'depends_on' }]
    };

    const estimate = estimateGraphFootprint(graph);

    expect(estimate.tier).toBe('optimal');
    expect(estimate.stats.nodeCount).toBe(2);
    expect(buildGuardrailWarnings(estimate)).toHaveLength(0);
  });

  it('escalates to critical tier for very large graphs and surfaces mitigation', () => {
    const nodes = Array.from({ length: 410 }, (_, index) => ({
      id: `n${index}`,
      label: `Node ${index}`,
      type: 'protocol',
      domain: index % 2 === 0 ? 'core' : 'support'
    }));
    const edges = Array.from({ length: nodes.length - 1 }, (_, index) => ({
      source: `n${index}`,
      target: `n${index + 1}`,
      type: 'depends_on'
    }));

    const largeGraph: CanonicalGraph = {
      nodes,
      edges
    };

    const estimate = estimateGraphFootprint(largeGraph);
    const warnings = buildGuardrailWarnings(estimate);

    expect(estimate.tier).toBe('critical');
    expect(estimate.reasons.some((reason) => reason.includes('Node count'))).toBe(true);
    expect(warnings[0]).toContain('Guardrail critical');
    expect(warnings[0]).toContain('Mitigation');
  });
});

describe('draw.io decomposition strategies', () => {
  const graph: CanonicalGraph = {
    nodes: [
      { id: 'core-a', label: 'Core A', type: 'service', domain: 'core' },
      { id: 'core-b', label: 'Core B', type: 'service', domain: 'core' },
      { id: 'support-a', label: 'Support A', type: 'service', domain: 'support' }
    ],
    edges: [
      { source: 'core-a', target: 'core-b', type: 'depends_on' },
      { source: 'core-b', target: 'support-a', type: 'depends_on' }
    ]
  };

  it('splits graphs by property into isolated pages', () => {
    const splitPlan = splitGraphByProperty(graph, 'domain');
    expect(splitPlan.enabled).toBe(true);
    expect(splitPlan.groups).toHaveLength(2);
    expect(splitPlan.stats.crossGroupEdges).toBe(1);

    const coreGroup = splitPlan.groups.find((group) => group.key === 'core');
    const supportGroup = splitPlan.groups.find((group) => group.key === 'support');

    expect(coreGroup?.stats.nodeCount).toBe(2);
    expect(coreGroup?.stats.edgeCount).toBe(1);
    expect(supportGroup?.stats.nodeCount).toBe(1);
    expect(supportGroup?.stats.edgeCount).toBe(0);
  });

  it('creates layer plans with unassigned fallbacks', () => {
    const layeredGraph: CanonicalGraph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        { id: 'missing-domain', label: 'No Domain', type: 'service' }
      ]
    };

    const plan = createLayerPlan(layeredGraph, 'domain');

    expect(plan.enabled).toBe(true);
    expect(plan.layers.length).toBe(3);
    expect(plan.stats.missingCount).toBe(1);

    const unassignedLayer = plan.layers.find((layer) => layer.label === 'Unassigned');
    expect(unassignedLayer?.missing).toBe(true);
    expect(plan.assignments['missing-domain']).toBe(unassignedLayer?.id);
  });
});
