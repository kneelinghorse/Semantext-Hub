import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const createdGraphs = [];

class FakeProtocolGraph {
  constructor(options = {}) {
    this.options = options;
    this.nodes = new Map();
    this.edgeList = [];
    this.graph = {
      hasNode: (urn) => this.nodes.has(urn),
      order: 0,
      size: 0
    };
    createdGraphs.push(this);
  }

  addNode(urn, kind, manifest) {
    if (this.nodes.has(urn)) {
      return false;
    }
    this.nodes.set(urn, { kind, manifest });
    this.graph.order = this.nodes.size;
    return true;
  }

  addEdge(from, kind, to) {
    this.edgeList.push({ from, kind, to });
    this.graph.size = this.edgeList.length;
  }

  getCacheStats() {
    return {
      size: this.nodes.size,
      entries: this.nodes.size
    };
  }
}

const NodeKind = {
  API: 'API',
  DATA: 'DATA',
  EVENT: 'EVENT',
  SEMANTIC: 'SEMANTIC',
  WORKFLOW: 'WORKFLOW',
  AGENT: 'AGENT',
  INTEGRATION: 'INTEGRATION'
};

const EdgeKind = {
  DEPENDS_ON: 'DEPENDS_ON',
  PRODUCES: 'PRODUCES',
  CONSUMES: 'CONSUMES',
  READS_FROM: 'READS_FROM',
  WRITES_TO: 'WRITES_TO',
  EXPOSES: 'EXPOSES',
  DERIVES_FROM: 'DERIVES_FROM'
};

const PROTOCOL_GRAPH_MODULE_SPEC = '../packages/protocols/core/graph/protocol-graph.js';
const GRAPH_BUILDER_MODULE_URL = new URL('../../packages/runtime/workflow/graph-builder.js', import.meta.url).href;

jest.unstable_mockModule(PROTOCOL_GRAPH_MODULE_SPEC, () => ({
  ProtocolGraph: FakeProtocolGraph,
  NodeKind,
  EdgeKind
}));

const { loadManifestsFromDirectory, buildGraph } = await import(GRAPH_BUILDER_MODULE_URL);

describe('workflow graph builder', () => {
  let tempDir;

  beforeEach(async () => {
    createdGraphs.length = 0;
    tempDir = await mkdtemp(path.join(tmpdir(), 'graph-builder-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('loadManifestsFromDirectory loads valid manifests and captures parse errors', async () => {
    const validManifest = {
      metadata: {
        urn: 'urn:proto:workflow:example',
        kind: 'WORKFLOW'
      },
      workflow: { version: '1.0.0' }
    };

    await writeFile(path.join(tempDir, 'valid.manifest.json'), JSON.stringify(validManifest), 'utf8');
    await writeFile(path.join(tempDir, 'invalid.manifest.json'), '{ "metadata": { "urn": "invalid" }', 'utf8');

    const manifests = await loadManifestsFromDirectory(tempDir);
    expect(manifests).toHaveLength(2);

    const valid = manifests.find((entry) => Boolean(entry.manifest));
    const invalid = manifests.find((entry) => entry.manifest === null);

    expect(valid.path).toContain('valid.manifest.json');
    expect(valid.manifest.metadata.urn).toBe('urn:proto:workflow:example');
    expect(invalid.error).toBeInstanceOf(Error);
    expect(invalid.path).toContain('invalid.manifest.json');
  });

  test('buildGraph adds nodes, deduplicates, and records unresolved edges', () => {
    const manifests = [
      {
        path: 'workflow.json',
        manifest: {
          metadata: { urn: 'urn:proto:workflow:order@1.0.0', kind: 'WORKFLOW' },
          workflow: { version: '1.0.0' },
          spec: {
            depends_on: [
              'urn:proto:data:inventory@1.0.0',
              { urn: 'urn:proto:event:shipment@1.0.0' }
            ],
            exposes: ['urn:proto:api:orders@1.0.0']
          }
        }
      },
      {
        path: 'data.json',
        manifest: {
          metadata: { urn: 'urn:proto:data:inventory@1.0.0', kind: 'DATA' },
          service: { name: 'inventory-service' }
        }
      },
      {
        path: 'event.json',
        manifest: {
          metadata: { urn: 'urn:proto:event:shipment@1.0.0', kind: 'EVENT' },
          events: [{ derives_from: 'urn:proto:data:inventory@1.0.0' }]
        }
      },
      {
        path: 'duplicate.json',
        manifest: {
          metadata: { urn: 'urn:proto:data:inventory@1.0.0', kind: 'DATA' },
          service: { name: 'duplicate-inventory' }
        }
      },
      {
        path: 'api.json',
        manifest: {
          metadata: { urn: 'urn:proto:api:orders@1.0.0', kind: 'API' },
          catalog: {
            depends_on: 'urn:proto:workflow:missing@1.0.0'
          }
        }
      }
    ];

    const { graph, stats } = buildGraph(manifests);

    expect(createdGraphs).toHaveLength(1);
    const fakeGraph = createdGraphs[0];

    expect(stats.nodesAdded).toBe(4);
    expect(stats.duplicateURNs).toEqual(['urn:proto:data:inventory@1.0.0']);
    expect(stats.unresolvedEdges).toContainEqual({
      from: 'urn:proto:api:orders@1.0.0',
      kind: EdgeKind.DEPENDS_ON,
      to: 'urn:proto:workflow:missing@1.0.0'
    });

    expect(fakeGraph.nodes.size).toBe(4);
    expect(fakeGraph.edgeList).toEqual(
      expect.arrayContaining([
        { from: 'urn:proto:workflow:order@1.0.0', kind: EdgeKind.DEPENDS_ON, to: 'urn:proto:data:inventory@1.0.0' },
        { from: 'urn:proto:workflow:order@1.0.0', kind: EdgeKind.DEPENDS_ON, to: 'urn:proto:event:shipment@1.0.0' },
        { from: 'urn:proto:event:shipment@1.0.0', kind: EdgeKind.DERIVES_FROM, to: 'urn:proto:data:inventory@1.0.0' },
        { from: 'urn:proto:workflow:order@1.0.0', kind: EdgeKind.EXPOSES, to: 'urn:proto:api:orders@1.0.0' }
      ])
    );

    expect(graph.getCacheStats()).toEqual({ size: 4, entries: 4 });
    expect(graph.graph.order).toBe(4);
    expect(graph.graph.size).toBe(4);
  });
});
