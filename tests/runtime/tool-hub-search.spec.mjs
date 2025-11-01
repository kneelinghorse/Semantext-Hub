import { describe, expect, test, beforeEach } from '@jest/globals';

import { ToolHubSearchService } from '../../packages/runtime/services/tool-hub/search-service.js';

class StubEmbeddingService {
  constructor() {
    this.queries = [];
  }

  async initialize() {}

  async embedQuery(text) {
    this.queries.push(text);
    return [0.75, 0.25, 0];
  }
}

class StubVectorStore {
  constructor() {
    this.calls = [];
  }

  async initialize() {}

  async search(vector, options) {
    this.calls.push({ vector, options });
    return [
      {
        score: 0.91,
        payload: {
          tool_id: 'urn:alpha',
          name: 'Alpha Tool',
          summary: 'Executes alpha workflows',
          tags: ['alpha', 'workflow'],
          capabilities: ['tool.execute']
        }
      },
      {
        score: 0.63,
        payload: {
          tool_id: 'urn:beta',
          name: 'Beta Tool',
          summary: 'Observes beta pipelines',
          tags: ['beta'],
          capabilities: ['tool.observe']
        }
      }
    ];
  }

  async close() {}
}

class StubIAMFilter {
  constructor() {
    this.calls = [];
  }

  async filter(results, actor) {
    this.calls.push({ results, actor });
    // Allow only results whose capabilities intersect actor capabilities
    const actorCaps = new Set(actor?.capabilities ?? []);
    return results.filter((result) =>
      result.capabilities.some((cap) => actorCaps.has(cap))
    );
  }
}

describe('ToolHubSearchService', () => {
  let embeddingService;
  let vectorStore;
  let iamFilter;
  let searchService;

  beforeEach(() => {
    embeddingService = new StubEmbeddingService();
    vectorStore = new StubVectorStore();
    iamFilter = new StubIAMFilter();

    searchService = new ToolHubSearchService({
      embeddingService,
      vectorStore,
      iamFilter,
      metadataResolver: async (urns) => ({
        'urn:alpha': {
          schemaUri: 'schema://alpha',
          capabilities: ['tool.execute']
        },
        'urn:beta': {
          schemaUri: 'schema://beta',
          capabilities: ['tool.observe']
        }
      }),
      logger: {
        debug: () => {},
        warn: () => {}
      }
    });
  });

  test('returns ranked, IAM-filtered results with metadata', async () => {
    const response = await searchService.search({
      query: 'Execute workflow automation',
      limit: 5,
      actor: {
        id: 'agent://operator',
        capabilities: ['tool.execute']
      }
    });

    expect(response.ok).toBe(true);
    expect(response.results).toHaveLength(1);
    expect(response.results[0].tool_id).toBe('urn:alpha');
    expect(response.results[0].schema_uri).toBe('schema://alpha');
    expect(response.results[0].score).toBeCloseTo(0.91);
    expect(response.limit).toBe(5);
    expect(response.totalCandidates).toBe(2);
    expect(Object.keys(response.timings)).toEqual(
      expect.arrayContaining(['embeddingMs', 'vectorSearchMs', 'enrichmentMs', 'iamFilterMs', 'totalMs'])
    );

    expect(embeddingService.queries[0]).toBe('Execute workflow automation');
    expect(vectorStore.calls[0].vector).toEqual([0.75, 0.25, 0]);
    expect(iamFilter.calls[0].actor.id).toBe('agent://operator');
  });
});
