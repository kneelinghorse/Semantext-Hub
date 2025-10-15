/**
 * Workflow Adapter Types
 * 
 * Shared contracts and interfaces for workflow adapters.
 */

/**
 * Base adapter interface that all workflow adapters must implement
 */
export class WorkflowAdapter {
  /**
   * Execute the adapter with given context and input
   * @param {Object} context - Execution context
   * @param {Object} input - Input data
   * @returns {Promise<Object>} Execution result
   */
  async execute(context, input) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Validate input before execution
   * @param {Object} input - Input to validate
   * @returns {Object} Validation result with isValid and errors
   */
  validateInput(input) {
    return { isValid: true, errors: [] };
  }

  /**
   * Get adapter metadata
   * @returns {Object} Adapter metadata
   */
  getMetadata() {
    return {
      kind: 'unknown',
      version: '1.0.0',
      description: 'Base workflow adapter'
    };
  }
}

/**
 * HTTP adapter configuration
 */
export class HttpAdapterConfig {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || '';
    this.timeout = options.timeout || 30000;
    this.headers = options.headers || {};
    this.retries = options.retries || 3;
    this.retryDelay = options.retryDelay || 1000;
  }
}

/**
 * Event adapter configuration
 */
export class EventAdapterConfig {
  constructor(options = {}) {
    this.eventBus = options.eventBus || 'default';
    this.routingKey = options.routingKey || '';
    this.persistent = options.persistent || false;
    this.priority = options.priority || 0;
  }
}

/**
 * Tool adapter configuration
 */
export class ToolAdapterConfig {
  constructor(options = {}) {
    this.toolRegistry = options.toolRegistry || null;
    this.timeout = options.timeout || 30000;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 50;
  }
}

/**
 * Workflow execution context
 */
export class WorkflowContext {
  constructor(options = {}) {
    this.traceId = options.traceId || this.generateTraceId();
    this.sessionId = options.sessionId || null;
    this.userId = options.userId || null;
    this.metadata = options.metadata || {};
    this.startTime = Date.now();
  }

  generateTraceId() {
    return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getElapsedTime() {
    return Date.now() - this.startTime;
  }
}

/**
 * Workflow execution result
 */
export class WorkflowResult {
  constructor(options = {}) {
    this.success = options.success || false;
    this.data = options.data || null;
    this.error = options.error || null;
    this.metadata = options.metadata || {};
    this.traceId = options.traceId || null;
    this.duration = options.duration || 0;
  }

  static success(data, metadata = {}) {
    return new WorkflowResult({
      success: true,
      data,
      metadata
    });
  }

  static error(error, metadata = {}) {
    return new WorkflowResult({
      success: false,
      error: error.message || error,
      metadata
    });
  }
}

/**
 * Validation error
 */
export class ValidationError extends Error {
  constructor(message, field = null, code = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.code = code;
  }
}

/**
 * Adapter execution error
 */
export class AdapterExecutionError extends Error {
  constructor(message, adapterKind = 'unknown', originalError = null) {
    super(message);
    this.name = 'AdapterExecutionError';
    this.adapterKind = adapterKind;
    this.originalError = originalError;
  }
}

/**
 * Adapter registry interface
 */
export class AdapterRegistry {
  constructor() {
    this.adapters = new Map();
  }

  /**
   * Register an adapter
   * @param {string} kind - Adapter kind
   * @param {WorkflowAdapter} adapter - Adapter instance
   */
  register(kind, adapter) {
    if (!(adapter instanceof WorkflowAdapter)) {
      throw new Error('Adapter must extend WorkflowAdapter');
    }
    this.adapters.set(kind, adapter);
  }

  /**
   * Get adapter by kind
   * @param {string} kind - Adapter kind
   * @returns {WorkflowAdapter} Adapter instance
   */
  getAdapter(kind) {
    const adapter = this.adapters.get(kind);
    if (!adapter) {
      throw new AdapterExecutionError(`No adapter found for kind: ${kind}`, kind);
    }
    return adapter;
  }

  /**
   * Check if adapter exists
   * @param {string} kind - Adapter kind
   * @returns {boolean} True if adapter exists
   */
  hasAdapter(kind) {
    return this.adapters.has(kind);
  }

  /**
   * List all registered adapter kinds
   * @returns {Array<string>} List of adapter kinds
   */
  listAdapters() {
    return Array.from(this.adapters.keys());
  }
}

// All classes are exported individually above
