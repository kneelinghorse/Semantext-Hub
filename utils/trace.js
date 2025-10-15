/**
 * Trace Utilities - B11.8
 * 
 * Provides correlation ID generation, propagation, and trace context management
 * for distributed tracing across adapters and CLI operations.
 */

import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Trace context storage using AsyncLocalStorage for request-scoped context
 */
const traceStorage = new AsyncLocalStorage();

/**
 * Default trace configuration
 */
export const DEFAULT_TRACE_CONFIG = {
  enableTracing: process.env.TRACE === '1' || process.env.TRACE === 'true',
  enableAdapterTracing: process.env.TRACE === 'adapters' || process.env.TRACE === '1',
  correlationIdHeader: 'x-correlation-id',
  traceIdHeader: 'x-trace-id',
  spanIdHeader: 'x-span-id',
  maxTraceDepth: 10
};

/**
 * Trace context class
 */
export class TraceContext {
  constructor(options = {}) {
    this.traceId = options.traceId || randomUUID();
    this.spanId = options.spanId || randomUUID();
    this.correlationId = options.correlationId || randomUUID();
    this.parentSpanId = options.parentSpanId || null;
    this.baggage = options.baggage || {};
    this.tags = options.tags || {};
    this.startTime = options.startTime || Date.now();
    this.depth = options.depth || 0;
  }

  /**
   * Create a child span
   */
  createChildSpan(operation) {
    if (this.depth >= DEFAULT_TRACE_CONFIG.maxTraceDepth) {
      console.warn(`[TRACE] Max trace depth reached (${DEFAULT_TRACE_CONFIG.maxTraceDepth}), not creating child span`);
      return this;
    }

    return new TraceContext({
      traceId: this.traceId,
      spanId: randomUUID(),
      correlationId: this.correlationId,
      parentSpanId: this.spanId,
      baggage: { ...this.baggage },
      tags: { ...this.tags, operation },
      depth: this.depth + 1
    });
  }

  /**
   * Add baggage (key-value metadata)
   */
  addBaggage(key, value) {
    this.baggage[key] = value;
    return this;
  }

  /**
   * Add tag
   */
  addTag(key, value) {
    this.tags[key] = value;
    return this;
  }

  /**
   * Get baggage value
   */
  getBaggage(key) {
    return this.baggage[key];
  }

  /**
   * Get tag value
   */
  getTag(key) {
    return this.tags[key];
  }

  /**
   * Convert to headers for HTTP propagation
   */
  toHeaders() {
    return {
      [DEFAULT_TRACE_CONFIG.correlationIdHeader]: this.correlationId,
      [DEFAULT_TRACE_CONFIG.traceIdHeader]: this.traceId,
      [DEFAULT_TRACE_CONFIG.spanIdHeader]: this.spanId,
      'x-parent-span-id': this.parentSpanId,
      'x-trace-baggage': JSON.stringify(this.baggage),
      'x-trace-tags': JSON.stringify(this.tags)
    };
  }

  /**
   * Create from headers (for incoming requests)
   */
  static fromHeaders(headers) {
    const correlationId = headers[DEFAULT_TRACE_CONFIG.correlationIdHeader] || randomUUID();
    const traceId = headers[DEFAULT_TRACE_CONFIG.traceIdHeader] || randomUUID();
    const spanId = headers[DEFAULT_TRACE_CONFIG.spanIdHeader] || randomUUID();
    const parentSpanId = headers['x-parent-span-id'] || null;
    
    let baggage = {};
    let tags = {};
    
    try {
      if (headers['x-trace-baggage']) {
        baggage = JSON.parse(headers['x-trace-baggage']);
      }
      if (headers['x-trace-tags']) {
        tags = JSON.parse(headers['x-trace-tags']);
      }
    } catch (error) {
      console.warn('[TRACE] Failed to parse trace headers:', error.message);
    }

    return new TraceContext({
      traceId,
      spanId,
      correlationId,
      parentSpanId,
      baggage,
      tags
    });
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      correlationId: this.correlationId,
      parentSpanId: this.parentSpanId,
      baggage: this.baggage,
      tags: this.tags,
      startTime: this.startTime,
      depth: this.depth
    };
  }

  /**
   * Convert to string representation
   */
  toString() {
    return `TraceContext(traceId=${this.traceId}, spanId=${this.spanId}, correlationId=${this.correlationId})`;
  }
}

/**
 * Trace manager for handling trace operations
 */
export class TraceManager {
  constructor(options = {}) {
    this.config = { ...DEFAULT_TRACE_CONFIG, ...options };
    this.activeTraces = new Map();
  }

  /**
   * Start a new trace
   */
  startTrace(operation, context = {}) {
    if (!this.config.enableTracing) {
      return null;
    }

    const traceContext = new TraceContext({
      tags: { operation },
      ...context
    });

    this.activeTraces.set(traceContext.spanId, traceContext);
    
    if (this.config.enableTracing) {
      console.log(`[TRACE] Started: ${operation} (${traceContext.spanId})`);
    }

    return traceContext;
  }

  /**
   * Start a child span
   */
  startSpan(operation, parentContext = null) {
    if (!this.config.enableTracing) {
      return null;
    }

    const currentContext = parentContext || this.getCurrentContext();
    if (!currentContext) {
      return this.startTrace(operation);
    }

    const childContext = currentContext.createChildSpan(operation);
    this.activeTraces.set(childContext.spanId, childContext);
    
    if (this.config.enableTracing) {
      console.log(`[TRACE] Started span: ${operation} (${childContext.spanId})`);
    }

    return childContext;
  }

  /**
   * Finish a span
   */
  finishSpan(spanId, result = {}) {
    if (!this.config.enableTracing || !spanId) {
      return;
    }

    const context = this.activeTraces.get(spanId);
    if (!context) {
      console.warn(`[TRACE] Span not found: ${spanId}`);
      return;
    }

    const duration = Date.now() - context.startTime;
    this.activeTraces.delete(spanId);
    
    if (this.config.enableTracing) {
      console.log(`[TRACE] Finished: ${context.getTag('operation')} (${spanId}) - ${duration}ms`);
    }

    return {
      context,
      duration,
      result
    };
  }

  /**
   * Get current trace context from AsyncLocalStorage
   */
  getCurrentContext() {
    return traceStorage.getStore();
  }

  /**
   * Run function with trace context
   */
  runWithContext(context, fn) {
    return traceStorage.run(context, fn);
  }

  /**
   * Get active traces
   */
  getActiveTraces() {
    return Array.from(this.activeTraces.values());
  }

  /**
   * Clear all traces
   */
  clearTraces() {
    this.activeTraces.clear();
  }
}

/**
 * Global trace manager instance
 */
export const traceManager = new TraceManager();

/**
 * Generate a new correlation ID
 */
export function correlationId() {
  return randomUUID();
}

/**
 * Generate a new trace ID
 */
export function traceId() {
  return randomUUID();
}

/**
 * Generate a new span ID
 */
export function spanId() {
  return randomUUID();
}

/**
 * Create a new trace context
 */
export function createTraceContext(options = {}) {
  return new TraceContext(options);
}

/**
 * Get current trace context
 */
export function getCurrentTraceContext() {
  return traceManager.getCurrentContext();
}

/**
 * Start a new trace
 */
export function startTrace(operation, context = {}) {
  return traceManager.startTrace(operation, context);
}

/**
 * Start a new span
 */
export function startSpan(operation, parentContext = null) {
  return traceManager.startSpan(operation, parentContext);
}

/**
 * Finish a span
 */
export function finishSpan(spanId, result = {}) {
  return traceManager.finishSpan(spanId, result);
}

/**
 * Run function with trace context
 */
export function runWithTraceContext(context, fn) {
  return traceManager.runWithContext(context, fn);
}

/**
 * Middleware for Express.js applications
 */
export function traceMiddleware(options = {}) {
  const config = { ...DEFAULT_TRACE_CONFIG, ...options };
  
  return (req, res, next) => {
    if (!config.enableTracing) {
      return next();
    }

    // Extract trace context from headers
    const traceContext = TraceContext.fromHeaders(req.headers);
    
    // Add trace headers to response
    res.set(traceContext.toHeaders());
    
    // Run request with trace context
    traceManager.runWithContext(traceContext, () => {
      // Add trace context to request object
      req.traceContext = traceContext;
      next();
    });
  };
}

/**
 * HTTP client interceptor for adding trace headers
 */
export function traceInterceptor(options = {}) {
  const config = { ...DEFAULT_TRACE_CONFIG, ...options };
  
  return {
    request: (config) => {
      if (!config.enableTracing) {
        return config;
      }

      const currentContext = getCurrentTraceContext();
      if (currentContext) {
        const headers = currentContext.toHeaders();
        config.headers = { ...config.headers, ...headers };
      }

      return config;
    },
    
    response: (response) => {
      // Could extract trace context from response headers if needed
      return response;
    }
  };
}

/**
 * Adapter-specific trace utilities
 */
export const adapterTracing = {
  /**
   * Trace MCP adapter operations
   */
  traceMCPOperation: (operation, fn) => {
    if (!DEFAULT_TRACE_CONFIG.enableAdapterTracing) {
      return fn();
    }

    const context = startSpan(`mcp.${operation}`);
    const startTime = Date.now();

    return Promise.resolve(fn())
      .then(result => {
        finishSpan(context.spanId, { 
          success: true, 
          duration: Date.now() - startTime 
        });
        return result;
      })
      .catch(error => {
        finishSpan(context.spanId, { 
          success: false, 
          error: error.message,
          duration: Date.now() - startTime 
        });
        throw error;
      });
  },

  /**
   * Trace discovery operations
   */
  traceDiscoveryOperation: (operation, fn) => {
    if (!DEFAULT_TRACE_CONFIG.enableAdapterTracing) {
      return fn();
    }

    const context = startSpan(`discovery.${operation}`);
    const startTime = Date.now();

    return Promise.resolve(fn())
      .then(result => {
        finishSpan(context.spanId, { 
          success: true, 
          duration: Date.now() - startTime 
        });
        return result;
      })
      .catch(error => {
        finishSpan(context.spanId, { 
          success: false, 
          error: error.message,
          duration: Date.now() - startTime 
        });
        throw error;
      });
  },

  /**
   * Trace CLI operations
   */
  traceCLIOperation: (command, fn) => {
    if (!DEFAULT_TRACE_CONFIG.enableTracing) {
      return fn();
    }

    const context = startTrace(`cli.${command}`);
    const startTime = Date.now();

    return Promise.resolve(fn())
      .then(result => {
        finishSpan(context.spanId, { 
          success: true, 
          duration: Date.now() - startTime 
        });
        return result;
      })
      .catch(error => {
        finishSpan(context.spanId, { 
          success: false, 
          error: error.message,
          duration: Date.now() - startTime 
        });
        throw error;
      });
  }
};

/**
 * Utility to check if tracing is enabled
 */
export function isTracingEnabled() {
  return DEFAULT_TRACE_CONFIG.enableTracing;
}

/**
 * Utility to check if adapter tracing is enabled
 */
export function isAdapterTracingEnabled() {
  return DEFAULT_TRACE_CONFIG.enableAdapterTracing;
}

/**
 * Get trace configuration
 */
export function getTraceConfig() {
  return { ...DEFAULT_TRACE_CONFIG };
}

/**
 * Set trace configuration
 */
export function setTraceConfig(config) {
  Object.assign(DEFAULT_TRACE_CONFIG, config);
}

/**
 * Export default utilities
 */
export default {
  TraceContext,
  TraceManager,
  traceManager,
  correlationId,
  traceId,
  spanId,
  createTraceContext,
  getCurrentTraceContext,
  startTrace,
  startSpan,
  finishSpan,
  runWithTraceContext,
  traceMiddleware,
  traceInterceptor,
  adapterTracing,
  isTracingEnabled,
  isAdapterTracingEnabled,
  getTraceConfig,
  setTraceConfig
};
