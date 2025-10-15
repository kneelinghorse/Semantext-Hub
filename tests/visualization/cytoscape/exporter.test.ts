import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { exportCytoscape, writeCytoscape, CytoscapeExportError } from '../../../src/visualization/cytoscape/exporter.js';
import type { CanonicalGraph } from '../../../src/visualization/drawio/exporter.ts';

const sampleGraph: CanonicalGraph = {
  id: 'cy-sample',
  name: 'Cytoscape Sample',
  nodes: [
    {
      id: 'svc-A',
      label: 'Service Alpha',
      type: 'service',
      domain: 'platform',
      metadata: {
        description: 'Handles onboarding flows.'
      },
      position: {
        x: 120,
        y: 80
      }
    },
    {
      id: 'ext-api',
      label: 'External API',
      type: 'external',
      metadata: {
        external: true
      }
    }
  ],
  edges: [
    {
      id: 'edge-1',
      source: 'svc-A',
      target: 'ext-api',
      type: 'depends_on',
      label: 'Calls'
    }
  ],
  metadata: {
    scope: 'sample'
  }
};

describe('exportCytoscape', () => {
  it('produces Cytoscape JSON payload with styling and stats', () => {
    const result = exportCytoscape(sampleGraph);

    expect(result.format).toBe('cytoscape-v1');
    expect(result.stats.nodes).toBe(2);
    expect(result.stats.edges).toBe(1);
    expect(result.elements.nodes).toHaveLength(2);
    expect(result.elements.edges).toHaveLength(1);
    expect(result.elements.nodes[0].data).toMatchObject({
      id: 'svc-A',
      label: 'Service Alpha',
      type: 'service',
      domain: 'platform'
    });
    expect(result.style.find((entry) => entry.selector === 'node')).toBeDefined();
    expect(result.layout.name).toBe('cola');
  });

  it('surfaces warnings for nodes missing domain classification', () => {
    const payload = exportCytoscape({
      ...sampleGraph,
      nodes: [
        {
          id: 'mystery',
          label: 'Mystery Node',
          type: 'service'
        }
      ]
    });

    expect(payload.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Mystery Node')])
    );
  });

  it('throws when the canonical graph is invalid', () => {
    expect(() => exportCytoscape({ nodes: [], edges: [] } as unknown as CanonicalGraph)).toThrow(
      CytoscapeExportError
    );
  });
});

describe('writeCytoscape', () => {
  it('writes payload to disk and preserves stats', async () => {
    const tempPath = path.join(os.tmpdir(), `cy-export-${Date.now()}.json`);

    try {
      const result = await writeCytoscape(sampleGraph, tempPath, { overwrite: true });
      expect(result.outputPath).toBe(tempPath);
      expect(result.stats.nodes).toBe(2);

      const fileContents = await fs.readFile(tempPath, 'utf8');
      const parsed = JSON.parse(fileContents);
      expect(parsed.format).toBe('cytoscape-v1');
      expect(parsed.elements.nodes).toHaveLength(2);
    } finally {
      await fs.rm(tempPath, { force: true });
    }
  });
});
