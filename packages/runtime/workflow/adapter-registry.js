/**
 * Workflow Adapter Registry
 * 
 * Central registry for managing workflow adapters by kind.
 * Provides adapter resolution, registration, and metadata access.
 */

import { AdapterRegistry as BaseRegistry, AdapterExecutionError } from './types.js';
import HttpAdapter from './adapters/httpAdapter.js';
import EventAdapter from './adapters/eventAdapter.js';
import ToolAdapter from './adapters/toolAdapter.js';

/**
 * Enhanced Adapter Registry with built-in adapters
 */
export class WorkflowAdapterRegistry extends BaseRegistry {
  constructor(options = {}) {
    super();
    this.options = options;
    this.initializeDefaultAdapters();
  }

  /**
   * Initialize default adapters
   */
  initializeDefaultAdapters() {
    // Register HTTP adapter
    this.register('http', new HttpAdapter(this.options.http || {}));
    
    // Register Event adapter
    this.register('event', new EventAdapter(this.options.event || {}));
    
    // Register Tool adapter
    this.register('tool', new ToolAdapter(this.options.tool || {}));
  }

  /**
   * Get adapter by kind with enhanced error handling
   * @param {string} kind - Adapter kind
   * @returns {Object} Adapter instance
   */
  getAdapter(kind) {
    try {
      return super.getAdapter(kind);
    } catch (error) {
      // Provide helpful error message with available adapters
      const availableAdapters = this.listAdapters();
      throw new AdapterExecutionError(
        `No adapter found for kind: ${kind}. Available adapters: ${availableAdapters.join(', ')}`,
        kind,
        error
      );
    }
  }

  /**
   * Execute workflow step using appropriate adapter
   * @param {string} kind - Adapter kind
   * @param {Object} context - Workflow context
   * @param {Object} input - Step input
   * @returns {Promise<Object>} Execution result
   */
  async executeStep(kind, context, input) {
    const adapter = this.getAdapter(kind);
    return await adapter.execute(context, input);
  }

  /**
   * Validate step input using appropriate adapter
   * @param {string} kind - Adapter kind
   * @param {Object} input - Step input
   * @returns {Object} Validation result
   */
  validateStep(kind, input) {
    const adapter = this.getAdapter(kind);
    return adapter.validateInput(input);
  }

  /**
   * Get adapter metadata by kind
   * @param {string} kind - Adapter kind
   * @returns {Object} Adapter metadata
   */
  getAdapterMetadata(kind) {
    const adapter = this.getAdapter(kind);
    return adapter.getMetadata();
  }

  /**
   * Get all adapter metadata
   * @returns {Object} Map of adapter kinds to metadata
   */
  getAllMetadata() {
    const metadata = {};
    for (const kind of this.listAdapters()) {
      metadata[kind] = this.getAdapterMetadata(kind);
    }
    return metadata;
  }

  /**
   * Check if adapter supports specific feature
   * @param {string} kind - Adapter kind
   * @param {string} feature - Feature name
   * @returns {boolean} True if feature is supported
   */
  supportsFeature(kind, feature) {
    try {
      const adapter = this.getAdapter(kind);
      const metadata = adapter.getMetadata();
      return metadata.features && metadata.features.includes(feature);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get adapter capabilities summary
   * @returns {Object} Capabilities summary
   */
  getCapabilities() {
    const capabilities = {
      adapters: this.listAdapters(),
      count: this.listAdapters().length,
      metadata: this.getAllMetadata()
    };

    // Add feature support matrix
    capabilities.features = {};
    for (const kind of this.listAdapters()) {
      capabilities.features[kind] = {
        retry: this.supportsFeature(kind, 'retry'),
        timeout: this.supportsFeature(kind, 'timeout'),
        validation: this.supportsFeature(kind, 'validation')
      };
    }

    return capabilities;
  }

  /**
   * Create adapter instance with custom configuration
   * @param {string} kind - Adapter kind
   * @param {Object} config - Adapter configuration
   * @returns {Object} Adapter instance
   */
  createAdapter(kind, config = {}) {
    switch (kind) {
      case 'http':
        return new HttpAdapter(config);
      case 'event':
        return new EventAdapter(config);
      case 'tool':
        return new ToolAdapter(config);
      default:
        throw new AdapterExecutionError(`Unknown adapter kind: ${kind}`, kind);
    }
  }

  /**
   * Register adapter with validation
   * @param {string} kind - Adapter kind
   * @param {Object} adapter - Adapter instance
   */
  register(kind, adapter) {
    // Validate adapter
    if (!adapter || typeof adapter.execute !== 'function') {
      throw new AdapterExecutionError(
        `Invalid adapter: must have execute method`,
        kind
      );
    }

    if (typeof adapter.validateInput !== 'function') {
      throw new AdapterExecutionError(
        `Invalid adapter: must have validateInput method`,
        kind
      );
    }

    if (typeof adapter.getMetadata !== 'function') {
      throw new AdapterExecutionError(
        `Invalid adapter: must have getMetadata method`,
        kind
      );
    }

    super.register(kind, adapter);
  }

  /**
   * Unregister adapter
   * @param {string} kind - Adapter kind
   * @returns {boolean} True if adapter was removed
   */
  unregister(kind) {
    return this.adapters.delete(kind);
  }

  /**
   * Clear all adapters
   */
  clear() {
    this.adapters.clear();
    this.initializeDefaultAdapters();
  }

  /**
   * Reset registry to default state
   */
  reset() {
    this.clear();
  }
}

// Create default registry instance
export const defaultRegistry = new WorkflowAdapterRegistry();

// Export convenience functions
export const getAdapter = (kind) => defaultRegistry.getAdapter(kind);
export const executeStep = (kind, context, input) => defaultRegistry.executeStep(kind, context, input);
export const validateStep = (kind, input) => defaultRegistry.validateStep(kind, input);
export const getAdapterMetadata = (kind) => defaultRegistry.getAdapterMetadata(kind);
export const getAllMetadata = () => defaultRegistry.getAllMetadata();
export const getCapabilities = () => defaultRegistry.getCapabilities();

export default WorkflowAdapterRegistry;
