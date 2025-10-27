import { getGraph as loadPartitionedGraph } from './graph.js';

/**
 * API Client for Protocol Viewer
 * Handles all backend communication with error normalization
 */

const API_BASE = '/api';

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Make a fetch request with error handling
 * @param {string} endpoint - API endpoint (e.g., '/health')
 * @param {object} options - Fetch options
 * @returns {Promise<any>} Response data
 */
async function fetchApi(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    // Try to parse response as JSON
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // Handle error responses
    if (!response.ok) {
      const message = data?.error || data?.message || `Request failed with status ${response.status}`;
      throw new ApiError(message, response.status, data);
    }

    return data;
  } catch (error) {
    // Re-throw ApiError as-is
    if (error instanceof ApiError) {
      throw error;
    }

    // Network errors, timeouts, etc.
    throw new ApiError(
      error.message || 'Network request failed',
      0,
      null
    );
  }
}

/**
 * API Client
 */
export const api = {
  async _resolveManifestFiles(manifests = []) {
    let entries = manifests;

    if (!Array.isArray(entries) || entries.length === 0) {
      const manifestMeta = await this.getManifests();
      entries = manifestMeta;
    }

    const files = entries
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.endsWith('.json') ? entry : `${entry}.json`;
        }

        if (entry && typeof entry === 'object') {
          if (typeof entry.filename === 'string') {
            return entry.filename;
          }

          if (typeof entry.id === 'string') {
            return entry.id.endsWith('.json') ? entry.id : `${entry.id}.json`;
          }

          if (typeof entry.urn === 'string') {
            const slug = entry.urn.split(':').pop();
            if (!slug) return null;
            const base = slug.includes('@') ? slug.split('@')[0] : slug;
            return `${base}.json`;
          }
        }

        return null;
      })
      .filter(Boolean);

    return [...new Set(files)];
  },

  /**
   * Get health status
   * @returns {Promise<object>} Health data
   */
  async getHealth() {
    return fetchApi('/health');
  },

  /**
   * Get all protocol manifests
   * @returns {Promise<Array>} Array of manifest metadata
   */
  async getManifests() {
    const response = await fetchApi('/manifests');

    if (Array.isArray(response)) {
      return response;
    }

    return response?.manifests || [];
  },

  /**
   * Get a specific manifest by ID
   * @param {string} id - Manifest ID
   * @returns {Promise<object>} Manifest data
   */
  async getManifest(id) {
    return fetchApi(`/manifest/${encodeURIComponent(id)}`);
  },

  /**
   * Get validation results (placeholder with semantic stubs)
   * @returns {Promise<object>} Validation data
   */
  async getValidation(manifests = []) {
    const manifestFiles = await this._resolveManifestFiles(manifests);

    if (manifestFiles.length === 0) {
      throw new ApiError('No manifests available for validation', 404, null);
    }

    const response = await fetchApi('/validate', {
      method: 'POST',
      body: JSON.stringify({ manifests: manifestFiles })
    });

    return {
      ...response,
      source: 'live',
      summary: response.summary || { total: 0, passed: 0, warnings: 0, failed: 0 },
      manifests: response.manifests || []
    };
  },

  /**
   * Get graph data (placeholder with semantic stubs)
   * @returns {Promise<object>} Graph data
   */
  async getGraph(manifests = [], options = {}) {
    const { seed = null, useWorker, maxConcurrent, onPartLoaded } = options;

    let manifestFiles = [];
    if (!seed) {
      manifestFiles = await this._resolveManifestFiles(manifests);

      if (manifestFiles.length === 0) {
        throw new ApiError('No manifests available for graph generation', 404, null);
      }
    }

    if (typeof window !== 'undefined') {
      const debugPayload = {
        seed,
        manifests: manifestFiles.length,
        useWorker: typeof window !== 'undefined' ? useWorker !== false : false
      };
      console.log('[graph] api.getGraph request', debugPayload);
    }

    const graph = await loadPartitionedGraph(manifestFiles, {
      seed,
      useWorker: typeof window !== 'undefined' ? useWorker !== false : false,
      maxConcurrent,
      onPartLoaded
    });

    const primaryChunk = graph.chunks?.[0]?.chunk ?? null;

    return {
      ...graph,
      manifests: manifestFiles,
      primary: primaryChunk
    };
  },

  async getGovernance() {
    const response = await fetchApi('/governance');
    const manifests = Array.isArray(response?.manifests) ? response.manifests : [];

    if (manifests.length === 0) {
      throw new ApiError(
        'No governance data available.',
        404,
        response || null
      );
    }

    return {
      generatedAt: response.generated_at || response.generatedAt || null,
      manifests,
      summary: response.summary || { total: manifests.length },
      alerts: response.summary?.alerts || response.alerts || [],
      artifacts: response.artifacts || null,
      source: 'live'
    };
  }
};
