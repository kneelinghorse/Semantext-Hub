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
  async getValidation() {
    // TODO: Implement when backend endpoint is ready
    // Return structured semantic sample data for dogfooding
    return Promise.resolve({
      urn: 'urn:proto:validation:summary',
      status: 'pending',
      message: 'Validation endpoint not yet implemented',
      manifests: [
        {
          id: 'api-test',
          urn: 'urn:proto:manifest:api-test',
          validationStatus: 'pass',
          checks: {
            schema: { status: 'pass', errors: [] },
            breaking: { status: 'pass', changes: [] },
            governance: { status: 'pass', violations: [] }
          },
          lastValidated: new Date().toISOString()
        },
        {
          id: 'openapi-sample',
          urn: 'urn:proto:manifest:openapi-sample',
          validationStatus: 'warning',
          checks: {
            schema: { status: 'pass', errors: [] },
            breaking: { status: 'warning', changes: ['field renamed'] },
            governance: { status: 'pass', violations: [] }
          },
          lastValidated: new Date().toISOString()
        }
      ],
      summary: {
        total: 2,
        passed: 1,
        warnings: 1,
        failed: 0
      }
    });
  },

  /**
   * Get graph data (placeholder with semantic stubs)
   * @returns {Promise<object>} Graph data
   */
  async getGraph() {
    // TODO: Implement when backend endpoint is ready
    // Return structured semantic sample data for dogfooding
    return Promise.resolve({
      urn: 'urn:proto:graph:protocol-network',
      message: 'Graph endpoint not yet implemented',
      nodes: [
        {
          id: 'api-test',
          urn: 'urn:proto:manifest:api-test',
          type: 'manifest',
          format: 'proto',
          dependencies: ['common-types']
        },
        {
          id: 'common-types',
          urn: 'urn:proto:manifest:common-types',
          type: 'manifest',
          format: 'proto',
          dependencies: []
        },
        {
          id: 'openapi-sample',
          urn: 'urn:proto:manifest:openapi-sample',
          type: 'manifest',
          format: 'openapi',
          dependencies: ['api-test']
        }
      ],
      edges: [
        {
          source: 'api-test',
          target: 'common-types',
          type: 'depends-on',
          urn: 'urn:proto:graph:edge:api-test:common-types'
        },
        {
          source: 'openapi-sample',
          target: 'api-test',
          type: 'depends-on',
          urn: 'urn:proto:graph:edge:openapi-sample:api-test'
        }
      ],
      metadata: {
        nodeCount: 3,
        edgeCount: 2,
        depth: 2
      }
    });
  },

  /**
   * Get governance data (placeholder with semantic stubs)
   * @returns {Promise<object>} Governance data
   */
  async getGovernance() {
    // TODO: Implement when backend endpoint is ready
    // Return structured semantic sample data for dogfooding
    return Promise.resolve({
      urn: 'urn:proto:governance:summary',
      message: 'Governance endpoint not yet implemented',
      policies: [
        {
          id: 'breaking-changes',
          urn: 'urn:proto:policy:breaking-changes',
          name: 'Breaking Change Detection',
          status: 'active',
          violations: 0,
          lastChecked: new Date().toISOString()
        },
        {
          id: 'ownership-required',
          urn: 'urn:proto:policy:ownership-required',
          name: 'Ownership Metadata Required',
          status: 'active',
          violations: 1,
          lastChecked: new Date().toISOString()
        },
        {
          id: 'versioning-semver',
          urn: 'urn:proto:policy:versioning-semver',
          name: 'Semantic Versioning Compliance',
          status: 'active',
          violations: 0,
          lastChecked: new Date().toISOString()
        }
      ],
      compliance: {
        totalPolicies: 3,
        passing: 2,
        violations: 1,
        complianceRate: 0.67
      },
      recentActivity: [
        {
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          event: 'policy-violation',
          policy: 'ownership-required',
          manifest: 'openapi-sample'
        },
        {
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          event: 'policy-check',
          policy: 'breaking-changes',
          manifest: 'api-test',
          result: 'pass'
        }
      ]
    });
  }
};
