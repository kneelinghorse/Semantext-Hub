/**
 * HTTP Workflow Adapter
 * 
 * Handles HTTP requests for workflow execution with input validation,
 * error propagation, and retry logic.
 */

import { randomUUID } from 'node:crypto';
import { WorkflowAdapter, HttpAdapterConfig, ValidationError, AdapterExecutionError } from '../types.js';
import { TimeoutError } from '../../runtime/error-handler.js';

/**
 * HTTP Adapter for workflow execution
 */
export class HttpAdapter extends WorkflowAdapter {
  constructor(config = {}) {
    super();
    this.config = new HttpAdapterConfig(config);
  }

  /**
   * Normalize headers to provide consistent access helpers
   * @param {Map|Headers|Object} rawHeaders
   * @returns {{get: function(string): any, toObject: function(): Object}}
   */
  normalizeHeaders(rawHeaders) {
    if (!rawHeaders) {
      return {
        get: () => undefined,
        toObject: () => ({})
      };
    }

    if (typeof rawHeaders.entries === 'function') {
      const entries = Array.from(rawHeaders.entries());
      const headerMap = new Map(entries.map(([key, value]) => [key.toLowerCase(), value]));
      return {
        get: (name) => headerMap.get(name.toLowerCase()),
        toObject: () => Object.fromEntries(entries)
      };
    }

    if (rawHeaders instanceof Map) {
      const entries = Array.from(rawHeaders.entries());
      const headerMap = new Map(entries.map(([key, value]) => [key.toLowerCase(), value]));
      return {
        get: (name) => headerMap.get(name.toLowerCase()),
        toObject: () => Object.fromEntries(entries)
      };
    }

    if (typeof rawHeaders === 'object') {
      const normalizedEntries = Object.entries(rawHeaders).map(([key, value]) => [key.toLowerCase(), value]);
      const headerMap = new Map(normalizedEntries);
      return {
        get: (name) => headerMap.get(name.toLowerCase()),
        toObject: () => Object.fromEntries(normalizedEntries)
      };
    }

    return {
      get: () => undefined,
      toObject: () => ({})
    };
  }

  /**
   * Validate HTTP adapter input
   * @param {Object} input - Input to validate
   * @returns {Object} Validation result
   */
  validateInput(input) {
    const errors = [];

    if (!input) {
      errors.push(new ValidationError('Input is required', 'input'));
      return { isValid: false, errors };
    }

    if (!input.method) {
      errors.push(new ValidationError('HTTP method is required', 'method'));
    } else if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(input.method.toUpperCase())) {
      errors.push(new ValidationError('Invalid HTTP method', 'method'));
    }

    const urlValue = typeof input.url === 'string' ? input.url.trim() : '';
    if (!urlValue) {
      errors.push(new ValidationError('URL is required', 'url'));
    } else {
      try {
        new URL(urlValue);
      } catch (e) {
        errors.push(new ValidationError('Invalid URL format', 'url'));
      }
    }

    if (input.body && typeof input.body !== 'string' && typeof input.body !== 'object') {
      errors.push(new ValidationError('Body must be string or object', 'body'));
    }

    if (Object.prototype.hasOwnProperty.call(input, 'timeout')) {
      const timeoutNumber = Number(input.timeout);
      if (!Number.isFinite(timeoutNumber) || timeoutNumber <= 0) {
        errors.push(new ValidationError('Timeout must be a positive number', 'timeout'));
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Execute HTTP request
   * @param {Object} context - Workflow context
   * @param {Object} input - HTTP request parameters
   * @returns {Promise<Object>} HTTP response
   */
  async execute(context, input) {
    const validation = this.validateInput(input);
    if (!validation.isValid) {
      throw new AdapterExecutionError(
        `HTTP adapter validation failed: ${validation.errors.map(e => e.message).join(', ')}`,
        'http',
        validation.errors[0]
      );
    }

    const requestConfig = this.buildRequestConfig(input, context);
    
    try {
      const response = await this.makeRequest(requestConfig);
      return this.processResponse(response);
    } catch (error) {
      throw new AdapterExecutionError(
        `HTTP request failed: ${error.message}`,
        'http',
        error
      );
    }
  }

  /**
   * Build request configuration
   * @param {Object} input - Input parameters
   * @param {Object} context - Workflow context
   * @returns {Object} Request configuration
   */
  buildRequestConfig(input, context) {
    const baseUrl = typeof input.url === 'string' ? input.url.trim() : input.url;
    const timeoutCandidate = Object.prototype.hasOwnProperty.call(input, 'timeout')
      ? Number(input.timeout)
      : this.config.timeout;
    const timeout =
      Number.isFinite(timeoutCandidate) && timeoutCandidate > 0
        ? timeoutCandidate
        : this.config.timeout;

    const config = {
      method: input.method.toUpperCase(),
      url: baseUrl,
      timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'OSSP-Workflow-Adapter/1.0',
        'X-Trace-Id': context.traceId,
        ...this.config.headers,
        ...input.headers
      }
    };

    // Add body for non-GET requests
    if (input.body && config.method !== 'GET') {
      if (typeof input.body === 'object') {
        config.body = JSON.stringify(input.body);
      } else {
        config.body = input.body;
      }
    }

    // Add query parameters
    if (input.query) {
      const url = new URL(config.url);
      Object.entries(input.query).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
      config.url = url.toString();
    }

    return config;
  }

  /**
   * Make HTTP request with retry logic
   * @param {Object} config - Request configuration
   * @returns {Promise<Object>} Response
   */
  async makeRequest(config) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(config);
        
        if (response.ok) {
          return response;
        }
        
        // Don't retry on client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          const clientError = new Error(`HTTP ${response.status}: ${response.statusText}`);
          clientError.retryable = false;
          throw clientError;
        }
        
        // Retry on server errors (5xx) or network errors
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        
      } catch (error) {
        lastError = error;
        
        // Don't retry on validation errors, timeouts, or explicit non-retryable errors
        if (error instanceof ValidationError || error instanceof TimeoutError || error.retryable === false) {
          throw error;
        }
      }
      
      // Wait before retry (except on last attempt)
      if (attempt < this.config.retries) {
        await this.sleep(this.config.retryDelay * Math.pow(2, attempt));
      }
    }
    
    throw lastError;
  }

  /**
   * Fetch with timeout
   * @param {Object} config - Request configuration
   * @returns {Promise<Object>} Response
   */
  async fetchWithTimeout(config) {
    const controller = new AbortController();
    let timeoutId;
    const timeoutMsCandidate = Number(
      Object.prototype.hasOwnProperty.call(config, 'timeout') ? config.timeout : this.config.timeout,
    );
    const timeoutMs =
      Number.isFinite(timeoutMsCandidate) && timeoutMsCandidate > 0
        ? timeoutMsCandidate
        : Number(this.config.timeout) || 30000;

    try {
      const fetchPromise = fetch(config.url, {
        method: config.method,
        headers: config.headers,
        body: config.body,
        signal: controller.signal
      });

      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          const timeoutError = new TimeoutError('timeout', null, timeoutMs);
          timeoutError.retryable = false;
          reject(timeoutError);
        }, timeoutMs);
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);
      return response;
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw error;
      }
      if (error.name === 'AbortError') {
        const timeoutError = new TimeoutError('timeout', error, timeoutMs);
        timeoutError.retryable = false;
        throw timeoutError;
      }
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Process HTTP response
   * @param {Response} response - Fetch response
   * @returns {Object} Processed response
   */
  async processResponse(response) {
    const headers = this.normalizeHeaders(response.headers);
    const result = {
      status: response.status,
      statusText: response.statusText,
      headers: headers.toObject(),
      ok: response.ok
    };

    // Try to parse response body
    const getHeader = headers.get.bind(headers);
    const contentType = (getHeader('content-type') || '').toString().toLowerCase();
    
    if (contentType.includes('application/json')) {
      try {
        result.data = await response.json();
      } catch (e) {
        result.data = await response.text();
      }
    } else if (typeof response.json === 'function') {
      try {
        result.data = await response.json();
      } catch {
        // Fall through to text parsing below if JSON parsing fails
      }
    }

    if (result.data === undefined) {
      if (contentType.includes('text/')) {
        result.data = await response.text();
      } else if (typeof response.arrayBuffer === 'function') {
        result.data = await response.arrayBuffer();
      } else if (typeof response.buffer === 'function') {
        const buffer = await response.buffer();
        result.data = buffer;
      } else if (typeof response.blob === 'function') {
        const blob = await response.blob();
        result.data = await blob.arrayBuffer();
      } else {
        result.data = null;
      }
    }

    const requestId = this.ensureRequestId(result);
    if (result.data && typeof result.data === 'object' && result.data !== null) {
      result.data.requestId = requestId;
    }
    result.requestId = requestId;

    return result;
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get adapter metadata
   * @returns {Object} Adapter metadata
   */
  getMetadata() {
    return {
      kind: 'http',
      version: '1.0.0',
      description: 'HTTP adapter for workflow execution',
      config: {
        baseUrl: this.config.baseUrl,
        timeout: this.config.timeout,
        retries: this.config.retries
      }
    };
  }

  /**
   * Ensure the response result contains a requestId
   * @param {Object} result - Processed response result
   * @returns {string} Request identifier
   */
  ensureRequestId(result) {
    const headerRequestId =
      (result.headers && typeof result.headers['x-request-id'] === 'string'
        ? result.headers['x-request-id'].trim()
        : '') ||
      (result.headers && typeof result.headers['request-id'] === 'string'
        ? result.headers['request-id'].trim()
        : '');

    if (headerRequestId) {
      return headerRequestId;
    }

    if (result.data && typeof result.data === 'object' && result.data !== null) {
      const existing = result.data.requestId;
      if (typeof existing === 'string' && existing.trim()) {
        return existing;
      }
      if (typeof existing === 'number' && Number.isFinite(existing)) {
        return existing;
      }
    }

    return randomUUID();
  }
}

export default HttpAdapter;
