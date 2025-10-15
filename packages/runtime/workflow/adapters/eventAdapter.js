/**
 * Event Workflow Adapter
 * 
 * Handles event emission for workflow execution with input validation,
 * error propagation, and event bus integration.
 */

import { WorkflowAdapter, EventAdapterConfig, ValidationError, AdapterExecutionError } from '../types.js';

/**
 * Event Adapter for workflow execution
 */
export class EventAdapter extends WorkflowAdapter {
  constructor(config = {}) {
    super();
    this.config = new EventAdapterConfig(config);
    this.eventBus = config.eventBus || this.createDefaultEventBus();
  }

  /**
   * Create default in-memory event bus
   * @returns {Object} Event bus instance
   */
  createDefaultEventBus() {
    const listeners = new Map();
    
    return {
      emit: async (event, data) => {
        const eventListeners = listeners.get(event) || [];
        const results = [];
        
        for (const listener of eventListeners) {
          try {
            const result = await listener(data);
            results.push({ success: true, result });
          } catch (error) {
            results.push({ success: false, error: error.message });
          }
        }
        
        return {
          event,
          emitted: true,
          listenerCount: eventListeners.length,
          results
        };
      },
      
      on: (event, listener) => {
        if (!listeners.has(event)) {
          listeners.set(event, []);
        }
        listeners.get(event).push(listener);
      },
      
      off: (event, listener) => {
        const eventListeners = listeners.get(event) || [];
        const index = eventListeners.indexOf(listener);
        if (index > -1) {
          eventListeners.splice(index, 1);
        }
      }
    };
  }

  /**
   * Validate event adapter input
   * @param {Object} input - Input to validate
   * @returns {Object} Validation result
   */
  validateInput(input) {
    const errors = [];

    if (!input) {
      errors.push(new ValidationError('Input is required', 'input'));
      return { isValid: false, errors };
    }

    if (input.event === undefined || input.event === null) {
      errors.push(new ValidationError('Event name is required', 'event'));
    } else if (typeof input.event !== 'string') {
      errors.push(new ValidationError('Event name must be a string', 'event'));
    } else if (input.event.trim() === '') {
      errors.push(new ValidationError('Event name must be a non-empty string', 'event'));
    }

    if (input.priority !== undefined) {
      if (typeof input.priority !== 'number' || input.priority < 0 || input.priority > 10) {
        errors.push(new ValidationError('Priority must be a number between 0 and 10', 'priority'));
      }
    }

    if (input.ttl !== undefined) {
      if (typeof input.ttl !== 'number' || input.ttl <= 0) {
        errors.push(new ValidationError('TTL must be a positive number', 'ttl'));
      }
    }

    if (input.routingKey && typeof input.routingKey !== 'string') {
      errors.push(new ValidationError('Routing key must be a string', 'routingKey'));
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Execute event emission
   * @param {Object} context - Workflow context
   * @param {Object} input - Event parameters
   * @returns {Promise<Object>} Event emission result
   */
  async execute(context, input) {
    const validation = this.validateInput(input);
    if (!validation.isValid) {
      throw new AdapterExecutionError(
        `Event adapter validation failed: ${validation.errors.map(e => e.message).join(', ')}`,
        'event',
        validation.errors[0]
      );
    }

    try {
      const eventData = this.buildEventData(input, context);
      const result = await this.emitEvent(eventData);
      return this.processResult(result, context);
    } catch (error) {
      throw new AdapterExecutionError(
        `Event emission failed: ${error.message}`,
        'event',
        error
      );
    }
  }

  /**
   * Build event data from input and context
   * @param {Object} input - Input parameters
   * @param {Object} context - Workflow context
   * @returns {Object} Event data
   */
  buildEventData(input, context) {
    const eventData = {
      event: input.event,
      data: input.data || {},
      metadata: {
        traceId: context.traceId,
        sessionId: context.sessionId,
        userId: context.userId,
        timestamp: new Date().toISOString(),
        priority: input.priority || this.config.priority,
        persistent: input.persistent !== undefined ? input.persistent : this.config.persistent,
        routingKey: input.routingKey || this.config.routingKey,
        ...context.metadata,
        ...input.metadata
      }
    };

    // Add TTL if specified
    if (input.ttl) {
      eventData.metadata.ttl = input.ttl;
      eventData.metadata.expiresAt = new Date(Date.now() + input.ttl * 1000).toISOString();
    }

    return eventData;
  }

  /**
   * Emit event to event bus
   * @param {Object} eventData - Event data
   * @returns {Promise<Object>} Emission result
   */
  async emitEvent(eventData) {
    if (!this.eventBus || typeof this.eventBus.emit !== 'function') {
      throw new Error('Event bus not available or invalid');
    }

    const result = await this.eventBus.emit(eventData.event, eventData);
    
    // Add event metadata to result
    return {
      ...result,
      eventData: {
        event: eventData.event,
        timestamp: eventData.metadata.timestamp,
        traceId: eventData.metadata.traceId,
        priority: eventData.metadata.priority
      }
    };
  }

  /**
   * Process emission result
   * @param {Object} result - Raw emission result
   * @param {Object} context - Workflow context
   * @returns {Object} Processed result
   */
  processResult(result, context) {
    const processed = {
      success: result.emitted,
      event: result.eventData.event,
      timestamp: result.eventData.timestamp,
      traceId: result.eventData.traceId,
      listenerCount: result.listenerCount,
      metadata: {
        contextTraceId: context.traceId,
        elapsedTime: typeof context?.getElapsedTime === 'function' ? context.getElapsedTime() : null,
        adapterKind: 'event'
      }
    };

    // Add listener results if available
    if (result.results && result.results.length > 0) {
      processed.listenerResults = result.results;
      
      // Check for any listener failures
      const failures = result.results.filter(r => !r.success);
      if (failures.length > 0) {
        processed.warnings = failures.map(f => f.error);
      }
    }

    return processed;
  }

  /**
   * Get adapter metadata
   * @returns {Object} Adapter metadata
   */
  getMetadata() {
    return {
      kind: 'event',
      version: '1.0.0',
      description: 'Event adapter for workflow execution',
      config: {
        eventBus: this.config.eventBus,
        routingKey: this.config.routingKey,
        persistent: this.config.persistent,
        priority: this.config.priority
      }
    };
  }
}

export default EventAdapter;
