import fs from 'fs/promises';
import path from 'path';
import { generateDiagram } from '../../../cli/commands/catalog-generate-diagram.js';
import type { CanonicalGraph } from '../../../src/visualization/drawio/exporter.ts';

const tempOutput = path.join(
  process.cwd(),
  'app',
  'artifacts',
  'diagrams',
  `test-smoke-${Date.now()}.drawio`
);

const minimalGraph: CanonicalGraph = {
  nodes: [
    { id: 'a', label: 'Source', type: 'protocol' },
    { id: 'b', label: 'Target', type: 'service' }
  ],
  edges: [{ source: 'a', target: 'b', type: 'depends_on' }]
};

describe('catalog-generate-diagram CLI wrapper', () => {
  afterAll(async () => {
    try {
      await fs.rm(tempOutput, { force: true });
    } catch (error) {
      // Ignore cleanup errors so the test suite is resilient on CI.
      console.warn('Failed to clean up Draw.io smoke artifact', error);
    }
  });

  it('writes a Draw.io artifact to the diagrams directory', async () => {
    const result = await generateDiagram({
      graph: minimalGraph,
      output: tempOutput,
      overwrite: true,
      silent: true
    });

    const file = await fs.readFile(tempOutput, 'utf-8');
    expect(file).toContain('<mxfile');
    expect(result.nodeCount).toBe(2);
    expect(result.edgeCount).toBe(1);
    expect(result.diagramCount).toBe(1);
    expect(result.warnings).toHaveLength(0);
    expect(result.guardrail.tier).toBe('optimal');
    expect(result.outputPath).toBe(tempOutput);
  });
});
