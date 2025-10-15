/**
 * External Reference Resolver
 * Resolves external $ref references (HTTP/HTTPS/file://) with caching and retry logic
 *
 * Features:
 * - HTTP/HTTPS URL fetching
 * - file:// protocol support
 * - LRU caching to prevent redundant fetches
 * - Retry logic with exponential backoff
 * - Timeout handling
 * - Batch resolution
 */

import fetch from 'node-fetch';
import { LRUCache } from 'lru-cache';
import pRetry from 'p-retry';
import { readFile } from 'fs/promises';
import { URL } from 'url';
import path from 'path';
import { ParserError, createError } from './error-model.js';

/**
 * External reference resolver with caching and retry logic
 */
class ExternalRefResolver {
  constructor(options = {}) {
    this.options = {
      // Caching
      cacheEnabled: options.cacheEnabled !== false,
      cacheMaxSize: options.cacheMaxSize || 100,
      cacheTTL: options.cacheTTL || 1000 * 60 * 10, // 10 minutes

      // Network
      timeout: options.timeout || 5000, // 5 seconds
      maxRedirects: options.maxRedirects || 5,
      rejectUnauthorized: options.rejectUnauthorized !== false,

      // Retry
      maxRetries: options.maxRetries || 3,
      retryMinTimeout: options.retryMinTimeout || 1000,
      retryMaxTimeout: options.retryMaxTimeout || 5000,
      retryFactor: options.retryFactor || 2,

      // Base path for relative refs
      basePath: options.basePath || process.cwd(),
      baseUrl: options.baseUrl || null,

      ...options
    };

    // Initialize cache
    this.cache = this.options.cacheEnabled
      ? new LRUCache({
          max: this.options.cacheMaxSize,
          ttl: this.options.cacheTTL
        })
      : null;

    // Stats
    this.stats = {
      hits: 0,
      misses: 0,
      fetches: 0,
      errors: 0,
      retries: 0
    };
  }

  /**
   * Resolve an external reference
   * @param {string} refUri - URI to resolve (http://, https://, file://)
   * @param {Object} options - Resolution options
   * @returns {Promise<ResolvedRef>}
   */
  async resolveExternal(refUri, options = {}) {
    // Check cache first
    if (this.cache && this.cache.has(refUri)) {
      this.stats.hits++;
      return this.cache.get(refUri);
    }

    this.stats.misses++;
    this.stats.fetches++;

    try {
      // Parse URI
      const uri = this._parseUri(refUri);

      // Resolve based on protocol
      let content;
      if (uri.protocol === 'file:') {
        content = await this._resolveFile(uri);
      } else if (uri.protocol === 'http:' || uri.protocol === 'https:') {
        content = await this._resolveHttp(uri);
      } else {
        throw createError('REF_003', `Unsupported protocol: ${uri.protocol}`, {
          path: refUri,
          metadata: { uri: refUri }
        });
      }

      // Parse content (JSON or YAML)
      const resolved = await this._parseContent(content, refUri);

      // Extract fragment if present (#/components/schemas/User)
      const finalResult = this._extractFragment(resolved, uri);

      // Build result
      const result = {
        uri: refUri,
        content: finalResult,
        resolvedAt: new Date().toISOString(),
        cached: false
      };

      // Cache result
      if (this.cache) {
        this.cache.set(refUri, result);
      }

      return result;
    } catch (error) {
      this.stats.errors++;

      // Wrap or rethrow as ParserError
      if (error instanceof ParserError) {
        throw error;
      }

      throw this._wrapFetchError(error, refUri);
    }
  }

  /**
   * Resolve multiple references in parallel
   * @param {string[]} refUris - Array of URIs to resolve
   * @param {Object} options - Resolution options
   * @returns {Promise<Map<string, ResolvedRef>>}
   */
  async resolveBatch(refUris, options = {}) {
    const results = new Map();
    const errors = [];

    // Resolve in parallel
    const promises = refUris.map(async (uri) => {
      try {
        const result = await this.resolveExternal(uri, options);
        results.set(uri, result);
      } catch (error) {
        errors.push({ uri, error });
      }
    });

    await Promise.allSettled(promises);

    // Handle errors based on options
    if (errors.length > 0 && options.throwOnError !== false) {
      const error = createError(
        'REF_001',
        `Failed to resolve ${errors.length} of ${refUris.length} external references`,
        {
          metadata: {
            failed: errors.map(e => ({
              uri: e.uri,
              error: e.error.message
            }))
          }
        }
      );
      throw error;
    }

    return results;
  }

  /**
   * Clear resolution cache
   */
  clearCache() {
    if (this.cache) {
      this.cache.clear();
    }
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  /**
   * Get resolver statistics
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache ? this.cache.size : 0,
      cacheHitRate: this.stats.hits + this.stats.misses > 0
        ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  // ==================== Private Methods ====================

  /**
   * Parse and validate URI
   * @private
   */
  _parseUri(refUri) {
    try {
      // Handle relative URIs
      if (!refUri.includes('://')) {
        // Relative file path
        if (this.options.basePath) {
          const absPath = path.isAbsolute(refUri)
            ? refUri
            : path.resolve(this.options.basePath, refUri);
          return new URL(`file://${absPath}`);
        }
        // Relative URL
        if (this.options.baseUrl) {
          return new URL(refUri, this.options.baseUrl);
        }
      }

      return new URL(refUri);
    } catch (error) {
      throw createError('REF_003', `Invalid reference URI: ${refUri}`, {
        path: refUri,
        metadata: { originalError: error.message }
      });
    }
  }

  /**
   * Resolve file:// reference
   * @private
   */
  async _resolveFile(uri) {
    try {
      // Convert file:// URL to path
      const filePath = uri.pathname;

      // Read file with retry
      const content = await pRetry(
        async () => {
          return await readFile(filePath, 'utf-8');
        },
        {
          retries: this.options.maxRetries,
          minTimeout: this.options.retryMinTimeout,
          maxTimeout: this.options.retryMaxTimeout,
          factor: this.options.retryFactor,
          onFailedAttempt: (error) => {
            this.stats.retries++;
          }
        }
      );

      return content;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw createError('PARSE_003', `File not found: ${uri.pathname}`, {
          path: uri.href,
          metadata: { filePath: uri.pathname }
        });
      }
      if (error.code === 'EACCES') {
        throw createError('PARSE_004', `Permission denied: ${uri.pathname}`, {
          path: uri.href,
          metadata: { filePath: uri.pathname }
        });
      }
      throw error;
    }
  }

  /**
   * Resolve HTTP/HTTPS reference
   * @private
   */
  async _resolveHttp(uri) {
    try {
      // Fetch with retry and timeout
      const response = await pRetry(
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

          try {
            const res = await fetch(uri.href, {
              signal: controller.signal,
              redirect: 'follow',
              headers: {
                'User-Agent': 'OSSP-AGI OpenAPI Parser/1.0',
                'Accept': 'application/json, application/yaml, application/x-yaml, text/yaml, text/x-yaml, */*'
              }
            });

            clearTimeout(timeoutId);

            if (!res.ok) {
              throw createError('NET_004', `HTTP ${res.status}: ${res.statusText}`, {
                path: uri.href,
                metadata: {
                  status: res.status,
                  statusText: res.statusText
                }
              });
            }

            return res.text();
          } catch (error) {
            clearTimeout(timeoutId);
            throw error;
          }
        },
        {
          retries: this.options.maxRetries,
          minTimeout: this.options.retryMinTimeout,
          maxTimeout: this.options.retryMaxTimeout,
          factor: this.options.retryFactor,
          onFailedAttempt: (error) => {
            this.stats.retries++;
          }
        }
      );

      return response;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw createError('NET_001', `Request timeout after ${this.options.timeout}ms`, {
          path: uri.href,
          metadata: { timeout: this.options.timeout }
        });
      }
      throw error;
    }
  }

  /**
   * Parse content (JSON or YAML)
   * @private
   */
  async _parseContent(content, refUri) {
    try {
      // Try JSON first
      return JSON.parse(content);
    } catch (jsonError) {
      // Try YAML
      try {
        // Lazy load YAML parser (optional dependency)
        const yaml = await import('js-yaml');
        return yaml.load(content);
      } catch (yamlError) {
        throw createError('PARSE_001', 'Failed to parse as JSON or YAML', {
          path: refUri,
          metadata: {
            jsonError: jsonError.message,
            yamlError: yamlError.message
          }
        });
      }
    }
  }

  /**
   * Extract fragment from resolved content
   * @private
   */
  _extractFragment(content, uri) {
    if (!uri.hash) {
      return content;
    }

    // Remove leading #
    const fragment = uri.hash.substring(1);

    // Parse JSON Pointer
    const parts = fragment.split('/').filter(Boolean);

    let current = content;
    for (const part of parts) {
      const key = this._decodePointerToken(part);
      if (!current || typeof current !== 'object') {
        throw createError('REF_004', `Reference target not found: ${uri.href}`, {
          path: uri.href,
          metadata: { fragment }
        });
      }
      current = current[key];
      if (current === undefined) {
        throw createError('REF_004', `Reference target not found: ${uri.href}`, {
          path: uri.href,
          metadata: { fragment, failedAt: key }
        });
      }
    }

    return current;
  }

  /**
   * Decode JSON Pointer token
   * @private
   */
  _decodePointerToken(token) {
    return token
      .replace(/~1/g, '/')
      .replace(/~0/g, '~');
  }

  /**
   * Wrap fetch errors as ParserError
   * @private
   */
  _wrapFetchError(error, refUri) {
    if (error.code === 'ENOTFOUND') {
      return createError('NET_005', `DNS resolution failed for ${refUri}`, {
        path: refUri,
        metadata: { hostname: error.hostname }
      });
    }

    if (error.code === 'ECONNREFUSED') {
      return createError('NET_002', `Connection refused: ${refUri}`, {
        path: refUri
      });
    }

    if (error.code === 'CERT_HAS_EXPIRED' || error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      return createError('NET_003', `TLS/SSL error: ${error.message}`, {
        path: refUri,
        metadata: { code: error.code }
      });
    }

    // Generic network error
    return createError('REF_001', `External reference resolution failed: ${error.message}`, {
      path: refUri,
      metadata: {
        originalError: error.message,
        code: error.code
      }
    });
  }
}

export { ExternalRefResolver };
