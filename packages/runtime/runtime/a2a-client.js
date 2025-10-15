/**
 * A2A (Agent-to-Agent) HTTP Client
 * 
 * Production-ready HTTP client for agent-to-agent communication with:
 * - Bearer token authentication
 * - Delegation header support
 * - Exponential backoff retry logic
 * - Request timeouts and cancellation
 * - Structured error handling
 * - Comprehensive logging
 */

import { 
  A2AError, 
  AuthError, 
  TimeoutError, 
  NetworkError, 
  RetryError,
  DEFAULT_CONFIG,
  shouldRetry,
  isAuthError,
  calculateRetryDelay,
  parseAgentUrn,
  generateRequestId,
  createLogEntry
} from './a2a-types.js';

import { 
  createAuthHeaders, 
  validateAuthResponse,
  extractDelegationUrn 
} from './a2a-auth.js';

import { 
  ErrorHandler, 
  handleError,
  ErrorMappers,
  ErrorContext
} from './error-handler.js';

import { 
  createCircuitBreaker,
  withCircuitBreaker
} from './circuit-breaker.js';

import { 
  createRetryPolicy,
  withRetryPolicy,
  PREDEFINED_POLICIES
} from './retry-policies.js';

import { 
  createStructuredLogger,
  LOG_LEVELS,
  context
} from './structured-logger.js';

/**
 * A2A HTTP Client
 */
export class A2AClient {
  constructor(options = {}) {
    this.authProvider = options.authProvider;
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.defaultTimeout = options.timeout ?? DEFAULT_CONFIG.timeout;
    this.maxRetries = options.maxRetries ?? DEFAULT_CONFIG.maxRetries;
    this.retryDelay = options.retryDelay ?? DEFAULT_CONFIG.retryDelay;
    this.retryBackoff = options.retryBackoff ?? DEFAULT_CONFIG.retryBackoff;
    this.retryJitter = options.retryJitter ?? DEFAULT_CONFIG.retryJitter;
    this.enableLogging = options.enableLogging !== false;
    
    // Initialize error handling and resilience components
    this.errorHandler = new ErrorHandler({
      enableLogging: this.enableLogging,
      enableMetrics: options.enableMetrics !== false
    });
    
    this.circuitBreaker = createCircuitBreaker({
      failureThreshold: options.circuitBreakerThreshold ?? 5,
      successThreshold: options.circuitBreakerSuccessThreshold ?? 3,
      timeout: options.circuitBreakerTimeout ?? 60000,
      enableLogging: this.enableLogging,
      enableMetrics: options.enableMetrics !== false
    });
    
    this.retryPolicy = createRetryPolicy({
      maxRetries: this.maxRetries,
      baseDelay: this.retryDelay,
      maxDelay: options.maxRetryDelay ?? 30000,
      backoffMultiplier: this.retryBackoff,
      jitter: this.retryJitter,
      enableLogging: this.enableLogging,
      enableMetrics: options.enableMetrics !== false
    });
    
    this.logger = createStructuredLogger({
      level: options.logLevel ?? LOG_LEVELS.INFO,
      enableConsole: this.enableLogging,
      enableMetrics: options.enableMetrics !== false,
      enableTracing: options.enableTracing !== false
    });
  }

  /**
   * Make an A2A request
   * @template T
   * @param {string} targetUrn - Target agent URN
   * @param {string} route - API route/path
   * @param {Object} [init] - Fetch init options
   * @param {Object} [init.body] - Request body
   * @param {Object} [init.headers] - Additional headers
   * @param {number} [init.timeout] - Request timeout in ms
   * @param {number} [init.maxRetries] - Maximum retry attempts
   * @param {Object} [init.context] - Request context for delegation
   * @returns {Promise<{status: number, headers: Object, data: T}>} Response
   */
  async request(targetUrn, route, init = {}) {
    const correlationId = context.createCorrelationId();
    const requestId = context.createRequestId();
    const startTime = Date.now();
    
    // Start request trace
    const traceId = this.logger.startTrace('a2a-request', {
      correlationId,
      requestId,
      component: 'A2AClient',
      operation: 'request',
      targetUrn,
      route
    });
    
    try {
      // Execute with circuit breaker protection
      const response = await this.circuitBreaker.execute(async () => {
        // Execute with retry policy
        return await this.retryPolicy.execute(
          () => this._makeRequestWithRetry(requestId, targetUrn, route, init),
          { maxRetries: 0 }
        );
      });
      
      const latency = Date.now() - startTime;
      
      // Log success
      this.logger.info('A2A request successful', {
        correlationId,
        requestId,
        component: 'A2AClient',
        operation: 'request',
        targetUrn,
        route,
        status: response.status,
        latency
      });
      
      // Complete trace
      this.logger.completeTrace(traceId, 'completed', {
        result: 'success',
        status: response.status,
        latency
      });

      return response;
    } catch (error) {
      const latency = Date.now() - startTime;
      
      // Handle error with centralized error handler
      const typedError = this.errorHandler.handleError(error, {
        correlationId,
        requestId,
        component: 'A2AClient',
        operation: 'request',
        targetUrn,
        route,
        latency
      });
      
      // Log error
      this.logger.error('A2A request failed', {
        correlationId,
        requestId,
        component: 'A2AClient',
        operation: 'request',
        targetUrn,
        route,
        error: typedError.message,
        errorType: typedError.constructor.name,
        latency
      });
      
      // Complete trace
      this.logger.completeTrace(traceId, 'failed', {
        error: typedError.message,
        errorType: typedError.constructor.name,
        latency
      });

      throw typedError;
    }
  }

  /**
   * Make request with retry logic
   * @private
   * @param {string} reqId - Request ID
   * @param {string} targetUrn - Target agent URN
   * @param {string} route - API route
   * @param {Object} init - Request init
   * @returns {Promise<Object>} Response
   */
  async _makeRequestWithRetry(reqId, targetUrn, route, init) {
    const maxRetries = init.maxRetries ?? this.maxRetries;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this._makeSingleRequest(reqId, targetUrn, route, init, attempt);
        
        // Check for auth errors (don't retry these)
        if (isAuthError(response.status)) {
          validateAuthResponse(response, reqId);
        }

        // Check if we should retry
        if (shouldRetry(response.status) && attempt < maxRetries) {
          const delay = calculateRetryDelay(attempt, this.retryDelay, this.retryBackoff, this.retryJitter);
          
          if (this.enableLogging) {
            const logEntry = createLogEntry(reqId, 'retry_scheduled', {
              attempt: attempt + 1,
              maxRetries,
              status: response.status,
              delay
            });
            console.warn('[A2A Client]', logEntry);
          }

          await this._sleep(delay);
          continue;
        }

        // If we shouldn't retry but got a retryable status, throw error
        if (shouldRetry(response.status) && attempt >= maxRetries) {
          throw new RetryError(
            `Request failed after ${maxRetries + 1} attempts with status ${response.status}`,
            null,
            maxRetries + 1
          );
        }

        // Parse response data
        const data = await this._parseResponse(response);
        
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          data
        };
      } catch (error) {
        lastError = error;

        // Don't retry auth errors or timeout errors
        if (error instanceof AuthError || error instanceof TimeoutError) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt >= maxRetries) {
          break;
        }

        // Calculate delay for network errors
        const delay = calculateRetryDelay(attempt, this.retryDelay, this.retryBackoff, this.retryJitter);
        
        if (this.enableLogging) {
          const logEntry = createLogEntry(reqId, 'retry_scheduled', {
            attempt: attempt + 1,
            maxRetries,
            error: error.message,
            delay
          });
          console.warn('[A2A Client]', logEntry);
        }

        await this._sleep(delay);
      }
    }

    // All retries exhausted
    throw new RetryError(
      `Request failed after ${maxRetries + 1} attempts`,
      lastError,
      maxRetries + 1
    );
  }

  /**
   * Make a single HTTP request
   * @private
   * @param {string} reqId - Request ID
   * @param {string} targetUrn - Target agent URN
   * @param {string} route - API route
   * @param {Object} init - Request init
   * @param {number} attempt - Attempt number
   * @returns {Promise<Response>} Fetch response
   */
  async _makeSingleRequest(reqId, targetUrn, route, init, attempt) {
    const timeout = init.timeout ?? this.defaultTimeout;
    const controller = new AbortController();
    
    // Set up timeout
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);

    try {
      // Parse agent URN to get endpoint
      const agentInfo = parseAgentUrn(targetUrn);
      const url = this._buildUrl(agentInfo, route);
      
      // Create headers with auth
      const delegationUrn = extractDelegationUrn(init.context);
      const headers = await createAuthHeaders(this.authProvider, {
        delegationUrn,
        additionalHeaders: init.headers
      });

      // Prepare request options
      const requestInit = {
        method: init.method || 'POST',
        headers,
        signal: controller.signal,
        ...init
      };

      // Add body if provided
      if (init.body) {
        requestInit.body = JSON.stringify(init.body);
      }

      if (this.enableLogging) {
        const logEntry = createLogEntry(reqId, 'request_start', {
          targetUrn,
          route,
          url,
          attempt: attempt + 1,
          method: requestInit.method
        });
        console.debug('[A2A Client]', logEntry);
      }

      const response = await fetch(url, requestInit);
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new TimeoutError(
          `Request timed out after ${timeout}ms`,
          error,
          timeout
        );
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new NetworkError(
          `Network error: ${error.message}`,
          error
        );
      }

      throw new A2AError(
        `Request failed: ${error.message}`,
        error
      );
    }
  }

  /**
   * Build URL from agent info and route
   * @private
   * @param {Object} agentInfo - Parsed agent URN info
   * @param {string} route - API route
   * @returns {string} Full URL
   */
  _buildUrl(agentInfo, route) {
    // For now, use a simple mapping based on agent domain/name
    // In a real implementation, this would resolve to actual endpoints
    const endpoint = `${agentInfo.domain}-${agentInfo.name}`;
    const basePath = `/agents/${endpoint}`;
    const cleanRoute = route.startsWith('/') ? route : `/${route}`;
    
    return `${this.baseUrl}${basePath}${cleanRoute}`;
  }

  /**
   * Parse response data
   * @private
   * @param {Response} response - Fetch response
   * @returns {Promise<any>} Parsed data
   */
  async _parseResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      try {
        return await response.json();
      } catch (error) {
        throw new A2AError(
          `Failed to parse JSON response: ${error.message}`,
          error
        );
      }
    }

    if (contentType.includes('text/')) {
      return await response.text();
    }

    // For other content types, return as-is
    return response;
  }

  /**
   * Sleep utility for retry delays
   * @private
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create A2A client with default configuration
 * @param {Object} options - Client options
 * @returns {A2AClient} Client instance
 */
export function createA2AClient(options = {}) {
  return new A2AClient(options);
}

/**
 * Convenience function for making A2A requests
 * @template T
 * @param {string} targetUrn - Target agent URN
 * @param {string} route - API route
 * @param {Object} [init] - Request options
 * @param {Object} [options] - Client options
 * @returns {Promise<{status: number, headers: Object, data: T}>} Response
 */
export async function request(targetUrn, route, init = {}, options = {}) {
  const client = createA2AClient(options);
  return client.request(targetUrn, route, init);
}
