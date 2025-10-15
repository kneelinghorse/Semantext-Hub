import { create } from 'xmlbuilder2';
import { exportDrawio, DrawioExportError } from '../../../src/visualization/drawio/exporter.js';
import type { CanonicalGraph } from '../../../src/visualization/drawio/exporter.ts';

const sampleGraph: CanonicalGraph = {
  id: 'diagram-test',
  name: 'Sample Diagram',
  nodes: [
    {
      id: 'n1',
      label: 'Catalog API',
      type: 'protocol',
      domain: 'core'
    },
    {
      id: 'n2',
      label: 'Inventory Service',
      type: 'service',
      domain: 'platform'
    },
    {
      id: 'n3',
      label: 'Event Stream',
      type: 'dataset',
      domain: 'governance'
    }
  ],
  edges: [
    {
      id: 'e1',
      source: 'n1',
      target: 'n2',
      type: 'depends_on',
      label: 'consumes'
    },
    {
      source: 'n2',
      target: 'n3',
      type: 'publishes'
    }
  ]
};

describe('exportDrawio', () => {
  it('creates a valid mxGraphModel XML document', () => {
    const { xml, nodeCount, edgeCount, diagramName } = exportDrawio(sampleGraph);

    expect(nodeCount).toBe(3);
    expect(edgeCount).toBe(2);
    expect(diagramName).toBe('Sample Diagram');

    const parsed = create(xml).end({ format: 'object' }) as Record<string, unknown>;
    expect(parsed).toHaveProperty('mxfile');
    const mxfile = parsed.mxfile as Record<string, unknown>;
    expect(mxfile).toHaveProperty('diagram');
  });

  it('applies style overrides for node types and surfaces warnings for missing domains', () => {
    const { xml, warnings } = exportDrawio({
      ...sampleGraph,
      nodes: [
        {
          ...sampleGraph.nodes[0],
          type: 'external',
          domain: 'unknown-domain'
        }
      ],
      edges: []
    });

    expect(xml).toContain('dashed=1');
    expect(xml).toContain('strokeColor=#94A3B8');
    expect(warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('No explicit domain style')
    ]));
  });

  it('throws a validation error for malformed graphs', () => {
    expect(() =>
      exportDrawio({
        nodes: [],
        edges: []
      } as unknown as CanonicalGraph)
    ).toThrow(DrawioExportError);
  });
});
