/**
 * A2A (Agent-to-Agent) Authentication Module
 * 
 * Provides Bearer token authentication and delegation header support
 * for agent-to-agent HTTP communication.
 */

import { AuthError, createLogEntry } from './a2a-types.js';

/**
 * Default Auth Provider that reads token from environment
 */
export class DefaultAuthProvider {
  constructor(options = {}) {
    this.tokenEnvVar = options.tokenEnvVar || 'A2A_TOKEN';
    this.token = null;
    this.tokenPromise = null;
  }

  /**
   * Get Bearer token
   * @returns {Promise<string>} Bearer token
   */
  async getToken() {
    if (this.token) {
      return this.token;
    }

    if (this.tokenPromise) {
      return this.tokenPromise;
    }

    this.tokenPromise = this._loadToken();
    this.token = await this.tokenPromise;
    return this.token;
  }

  /**
   * Check if token is available
   * @returns {boolean} True if token is available
   */
  hasToken() {
    return !!this.token || !!process.env[this.tokenEnvVar];
  }

  /**
   * Load token from environment
   * @private
   * @returns {Promise<string>} Token
   */
  async _loadToken() {
    const token = process.env[this.tokenEnvVar];
    if (!token) {
      throw new AuthError(`No token found in environment variable ${this.tokenEnvVar}`);
    }
    return token.trim();
  }

  /**
   * Clear cached token (for testing)
   */
  clearToken() {
    this.token = null;
    this.tokenPromise = null;
    // Also clear the environment variable for testing
    if (process.env[this.tokenEnvVar]) {
      delete process.env[this.tokenEnvVar];
    }
  }
}

/**
 * Static Auth Provider that uses a fixed token
 */
export class StaticAuthProvider {
  constructor(token) {
    this.token = token;
  }

  /**
   * Get Bearer token
   * @returns {Promise<string>} Bearer token
   */
  async getToken() {
    if (!this.token) {
      throw new AuthError('No token provided to StaticAuthProvider');
    }
    return this.token;
  }

  /**
   * Check if token is available
   * @returns {boolean} True if token is available
   */
  hasToken() {
    return !!this.token;
  }
}

/**
 * No-op Auth Provider for unauthenticated requests
 */
export class NoAuthProvider {
  /**
   * Get Bearer token
   * @returns {Promise<string>} Empty string
   */
  async getToken() {
    return '';
  }

  /**
   * Check if token is available
   * @returns {boolean} Always false
   */
  hasToken() {
    return false;
  }
}

/**
 * Create auth headers for A2A requests
 * @param {AuthProvider} authProvider - Auth provider instance
 * @param {Object} options - Options
 * @param {string} [options.delegationUrn] - Delegation URN for x-agent-delegation header
 * @param {Object} [options.additionalHeaders] - Additional headers to include
 * @returns {Promise<Object>} Headers object
 */
export async function createAuthHeaders(authProvider, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'OSSP-AGI-A2A-Client/1.0.0',
    ...options.additionalHeaders
  };

  // Add Bearer token if available
  if (authProvider.hasToken()) {
    try {
      const token = await authProvider.getToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      // Log warning but don't fail - some requests might work without auth
      console.warn(`[A2A Auth] Failed to get token: ${error.message}`);
    }
  }

  // Add delegation header if specified
  if (options.delegationUrn) {
    headers['x-agent-delegation'] = options.delegationUrn;
  }

  return headers;
}

/**
 * Validate auth response and throw appropriate errors
 * @param {Response} response - Fetch response
 * @param {string} reqId - Request ID for logging
 * @throws {AuthError} If authentication failed
 */
export function validateAuthResponse(response, reqId) {
  if (response.status === 401) {
    const logEntry = createLogEntry(reqId, 'auth_failed', {
      status: response.status,
      reason: 'Unauthorized - invalid or missing token'
    });
    console.error('[A2A Auth]', logEntry);
    throw new AuthError('Authentication failed: Unauthorized', null, 401);
  }

  if (response.status === 403) {
    const logEntry = createLogEntry(reqId, 'auth_failed', {
      status: response.status,
      reason: 'Forbidden - insufficient permissions'
    });
    console.error('[A2A Auth]', logEntry);
    throw new AuthError('Authentication failed: Forbidden', null, 403);
  }
}

/**
 * Create auth provider from configuration
 * @param {Object} config - Auth configuration
 * @param {string} [config.type] - Provider type: 'default', 'static', 'none'
 * @param {string} [config.token] - Token for static provider
 * @param {string} [config.tokenEnvVar] - Environment variable name for default provider
 * @returns {AuthProvider} Auth provider instance
 */
export function createAuthProvider(config = {}) {
  const type = config.type || 'default';

  switch (type) {
    case 'static':
      if (!config.token) {
        throw new AuthError('Static auth provider requires token');
      }
      return new StaticAuthProvider(config.token);

    case 'none':
      return new NoAuthProvider();

    case 'default':
    default:
      return new DefaultAuthProvider({
        tokenEnvVar: config.tokenEnvVar
      });
  }
}

/**
 * Extract delegation URN from request context
 * @param {Object} context - Request context
 * @param {string} [context.currentAgentUrn] - Current agent URN
 * @param {string} [context.delegationChain] - Delegation chain
 * @returns {string|null} Delegation URN or null
 */
export function extractDelegationUrn(context = {}) {
  // If there's an existing delegation chain, append current agent
  if (context.delegationChain) {
    return `${context.delegationChain} -> ${context.currentAgentUrn}`;
  }

  // If this is a delegated request, use current agent as delegation source
  if (context.currentAgentUrn) {
    return context.currentAgentUrn;
  }

  return null;
}
