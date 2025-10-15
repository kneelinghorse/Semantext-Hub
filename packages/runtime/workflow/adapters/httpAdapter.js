/**
 * HTTP Workflow Adapter
 * 
 * Handles HTTP requests for workflow execution with input validation,
 * error propagation, and retry logic.
 */

import { WorkflowAdapter, HttpAdapterConfig, ValidationError, AdapterExecutionError } from '../types.js';

/**
 * HTTP Adapter for workflow execution
 */
export class HttpAdapter extends WorkflowAdapter {
  constructor(config = {}) {
    super();
    this.config = new HttpAdapterConfig(config);
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

    if (!input.url) {
      errors.push(new ValidationError('URL is required', 'url'));
    } else {
      try {
        new URL(input.url);
      } catch (e) {
        errors.push(new ValidationError('Invalid URL format', 'url'));
      }
    }

    if (input.body && typeof input.body !== 'string' && typeof input.body !== 'object') {
      errors.push(new ValidationError('Body must be string or object', 'body'));
    }

    if (input.timeout !== undefined && (typeof input.timeout !== 'number' || input.timeout <= 0)) {
      errors.push(new ValidationError('Timeout must be a positive number', 'timeout'));
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
    const config = {
      method: input.method.toUpperCase(),
      url: input.url,
      timeout: input.timeout || this.config.timeout,
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
        
        // Don't retry on validation errors or explicit non-retryable errors
        if (error instanceof ValidationError || error.retryable === false) {
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
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);
    
    try {
      const response = await fetch(config.url, {
        method: config.method,
        headers: config.headers,
        body: config.body,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${config.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Process HTTP response
   * @param {Response} response - Fetch response
   * @returns {Object} Processed response
   */
  async processResponse(response) {
    const result = {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      ok: response.ok
    };

    // Try to parse response body
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      try {
        result.data = await response.json();
      } catch (e) {
        result.data = await response.text();
      }
    } else if (contentType.includes('text/')) {
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
}

export default HttpAdapter;
