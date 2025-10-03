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
    it('returns semantic validation stub data', async () => {
      const result = await api.getValidation();

      expect(result.urn).toBe('urn:proto:validation:summary');
      expect(result.manifests).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary.total).toBeGreaterThanOrEqual(0);
    });

    it('includes URN identifiers for each manifest', async () => {
      const result = await api.getValidation();

      result.manifests.forEach((manifest) => {
        expect(manifest.urn).toMatch(/^urn:proto:manifest:/);
        expect(manifest.validationStatus).toMatch(/^(pass|warning|fail)$/);
      });
    });
  });

  describe('getGraph', () => {
    it('returns semantic graph stub data', async () => {
      const result = await api.getGraph();

      expect(result.urn).toBe('urn:proto:graph:protocol-network');
      expect(result.nodes).toBeDefined();
      expect(result.edges).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('includes URNs for nodes and edges', async () => {
      const result = await api.getGraph();

      result.nodes.forEach((node) => {
        expect(node.urn).toMatch(/^urn:proto:manifest:/);
      });

      result.edges.forEach((edge) => {
        expect(edge.urn).toMatch(/^urn:proto:graph:edge:/);
      });
    });

    it('provides graph metadata', async () => {
      const result = await api.getGraph();

      expect(result.metadata.nodeCount).toBeGreaterThanOrEqual(0);
      expect(result.metadata.edgeCount).toBeGreaterThanOrEqual(0);
      expect(result.metadata.depth).toBeGreaterThanOrEqual(0);
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
