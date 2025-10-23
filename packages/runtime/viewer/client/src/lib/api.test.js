import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { api, ApiError } from './api.js';

describe('API Client', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getHealth', () => {
    it('fetches health data successfully', async () => {
      const mockData = { status: 'ok', uptime: 123 };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockData,
      });

      const result = await api.getHealth();

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/health',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result).toEqual(mockData);
    });

    it('throws ApiError on failure', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Server error' }),
      });

      await expect(api.getHealth()).rejects.toThrow(ApiError);
    });

    it('falls back to API when static seed missing', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          headers: new Headers({ 'content-type': 'text/html' }),
          text: async () => '<!DOCTYPE html>',
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            index: { node_count: 1, edge_count: 0, depth: 1, parts: 1 },
            parts: [{ id: 'chunk-1', url: '/api/graph/part/chunk-1', size: 64 }]
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            nodes: [{ id: 'fallback-node' }],
            edges: [],
            summary: { nodes: 1, edges: 0, depth: 1 }
          }),
        });

      const result = await api.getGraph(undefined, { seed: 'graph10k', useWorker: false });

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        '/graph/seeds/graph10k/index.json',
        expect.objectContaining({ cache: 'force-cache' })
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        '/api/graph/seed/graph10k',
        expect.any(Object)
      );
      expect(result.nodes[0].id).toBe('fallback-node');
    });
  });

  describe('getManifests', () => {
    it('fetches manifests successfully', async () => {
      const mockData = [{ id: 'test', format: 'openapi' }];
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ manifests: mockData }),
      });

      const result = await api.getManifests();

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/manifests',
        expect.any(Object)
      );
      expect(result).toEqual(mockData);
    });

    it('returns array responses directly', async () => {
      const mockData = [{ id: 'legacy', format: 'graphql' }];
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockData,
      });

      const result = await api.getManifests();

      expect(result).toEqual(mockData);
    });
  });

  describe('getManifest', () => {
    it('fetches single manifest with encoded ID', async () => {
      const mockData = { id: 'test', data: 'content' };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockData,
      });

      const result = await api.getManifest('test:id');

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/manifest/test%3Aid',
        expect.any(Object)
      );
      expect(result).toEqual(mockData);
    });
  });

  describe('getValidation', () => {
    it('posts manifest list and returns live results', async () => {
      const responseBody = {
        summary: { total: 1, passed: 1, warnings: 0, failed: 0 },
        manifests: [
          { id: 'api-test', urn: 'urn:proto:manifest:api-test', validationStatus: 'pass', errors: [], warnings: [] }
        ],
        valid: true
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => responseBody,
      });

      const result = await api.getValidation(['api-test.json']);

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/validate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ manifests: ['api-test.json'] })
        })
      );

      expect(result.summary.total).toBe(1);
      expect(result.source).toBe('live');
      expect(result.manifests[0].id).toBe('api-test');
    });

    it('fetches manifest list when none provided', async () => {
      const manifestsResponse = { manifests: [{ filename: 'api-test.json' }] };
      const validateResponse = {
        summary: { total: 1, passed: 1, warnings: 0, failed: 0 },
        manifests: [
          { id: 'api-test', urn: 'urn:proto:manifest:api-test', validationStatus: 'pass', errors: [], warnings: [] }
        ],
        valid: true
      };

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => manifestsResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => validateResponse,
        });

      const result = await api.getValidation();

      expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/manifests', expect.any(Object));
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        '/api/validate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ manifests: ['api-test.json'] })
        })
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('getGraph', () => {
    it('posts manifests and fetches first graph chunk', async () => {
      const graphResponse = {
        index: { node_count: 2, edge_count: 1, depth: 2, parts: 1 },
        parts: [{ id: 'chunk-1', url: '/api/graph/part/chunk-1', size: 128 }]
      };
      const chunkResponse = {
        nodes: [{ id: 'api-test', urn: 'urn:proto:manifest:api-test', type: 'api', format: 'api' }],
        edges: [{ source: 'api-test', target: 'data-test', type: 'depends-on', urn: 'urn:proto:graph:edge:api-test:data-test' }],
        summary: { nodes: 1, edges: 1, depth: 2 }
      };

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => graphResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => chunkResponse,
        });

      const result = await api.getGraph(['api-test.json']);

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        '/api/graph',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ manifests: ['api-test.json'] })
        })
      );

      expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/graph/part/chunk-1', expect.any(Object));
      expect(result.nodes.length).toBe(1);
      expect(result.metadata.nodeCount).toBe(2);
      expect(result.source).toBe('live');
      expect(result.chunks[0].chunk).toEqual(chunkResponse);
      expect(result.primary).toEqual(chunkResponse);
    });

    it('pulls manifest list when not provided', async () => {
      const manifestsResponse = { manifests: [{ filename: 'api-test.json' }] };
      const graphResponse = {
        index: { node_count: 1, edge_count: 0, depth: 1, parts: 1 },
        parts: [{ id: 'chunk-1', url: '/api/graph/part/chunk-1', size: 64 }]
      };
      const chunkResponse = {
        nodes: [{ id: 'api-test', urn: 'urn:proto:manifest:api-test', type: 'api', format: 'api' }],
        edges: [],
        summary: { nodes: 1, edges: 0, depth: 1 }
      };

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => manifestsResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => graphResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => chunkResponse,
        });

      const result = await api.getGraph();

      expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/manifests', expect.any(Object));
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        '/api/graph',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ manifests: ['api-test.json'] })
        })
      );
      expect(result.nodes.length).toBe(1);
      expect(result.chunks.length).toBe(1);
      expect(result.metadata.nodeCount).toBe(1);
    });

    it('loads seed graph when seed option provided', async () => {
      const graphResponse = {
        index: { node_count: 5, edge_count: 2, depth: 2, parts: 1 },
        parts: [{ id: 'chunk-seed', url: '/api/graph/part/chunk-seed', size: 256 }]
      };
      const chunkResponse = {
        nodes: [{ id: 'seed-node', urn: 'urn:seed:node', type: 'seed', format: 'seed' }],
        edges: [],
        summary: { nodes: 1, edges: 0, depth: 1 }
      };

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => graphResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => chunkResponse,
        });

      const result = await api.getGraph(undefined, { seed: 'graph10k', useWorker: false });

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        '/graph/seeds/graph10k/index.json',
        expect.objectContaining({ cache: 'force-cache' })
      );
      expect(result.source).toBe('seed');
      expect(result.metadata.nodeCount).toBe(5);
    });
  });

  describe('getGovernance', () => {
    it('returns semantic governance stub data', async () => {
      const result = await api.getGovernance();

      expect(result.urn).toBe('urn:proto:governance:summary');
      expect(result.policies).toBeDefined();
      expect(result.compliance).toBeDefined();
      expect(result.recentActivity).toBeDefined();
    });

    it('includes URNs for each policy', async () => {
      const result = await api.getGovernance();

      result.policies.forEach((policy) => {
        expect(policy.urn).toMatch(/^urn:proto:policy:/);
        expect(policy.status).toBeDefined();
        expect(policy.violations).toBeGreaterThanOrEqual(0);
      });
    });

    it('provides compliance metrics', async () => {
      const result = await api.getGovernance();

      expect(result.compliance.totalPolicies).toBeGreaterThanOrEqual(0);
      expect(result.compliance.passing).toBeGreaterThanOrEqual(0);
      expect(result.compliance.violations).toBeGreaterThanOrEqual(0);
      expect(result.compliance.complianceRate).toBeGreaterThanOrEqual(0);
      expect(result.compliance.complianceRate).toBeLessThanOrEqual(1);
    });
  });

  describe('Error handling', () => {
    it('handles network errors', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      await expect(api.getHealth()).rejects.toThrow(ApiError);
    });

    it('includes status code in ApiError', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Not found' }),
      });

      try {
        await api.getHealth();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(error.status).toBe(404);
        expect(error.message).toBe('Not found');
      }
    });
  });
});
