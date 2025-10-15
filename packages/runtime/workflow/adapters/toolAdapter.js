/**
 * Tool Workflow Adapter
 * 
 * Handles tool invocation for workflow execution with input validation,
 * error propagation, and runtime tool registry integration.
 */

import { WorkflowAdapter, ToolAdapterConfig, ValidationError, AdapterExecutionError } from '../types.js';

/**
 * Tool Adapter for workflow execution
 */
export class ToolAdapter extends WorkflowAdapter {
  constructor(config = {}) {
    super();
    this.config = new ToolAdapterConfig(config);
    this.toolRegistry = config.toolRegistry || this.createDefaultToolRegistry();
  }

  /**
   * Create default in-memory tool registry
   * @returns {Object} Tool registry instance
   */
  createDefaultToolRegistry() {
    const tools = new Map();
    
    // Add some default tools for testing
    tools.set('echo', {
      name: 'echo',
      description: 'Echo input back',
      execute: async (input) => ({ result: input })
    });
    
    tools.set('add', {
      name: 'add',
      description: 'Add two numbers',
      execute: async (input) => {
        const { a, b } = input;
        if (typeof a !== 'number' || typeof b !== 'number') {
          throw new Error('Both a and b must be numbers');
        }
        return { result: a + b };
      }
    });
    
    tools.set('delay', {
      name: 'delay',
      description: 'Delay execution for specified milliseconds',
      execute: async (input) => {
        const { ms } = input;
        if (typeof ms !== 'number' || ms < 0) {
          throw new Error('ms must be a non-negative number');
        }
        await new Promise(resolve => setTimeout(resolve, ms));
        return { result: `Delayed for ${ms}ms` };
      }
    });
    
    return {
      getTool: (name) => tools.get(name),
      listTools: () => Array.from(tools.keys()),
      registerTool: (name, tool) => {
        if (!tool || typeof tool !== 'object') {
          throw new Error('Tool must have execute function');
        }
        if (typeof tool.execute !== 'function') {
          throw new Error('Tool must have execute function');
        }
        if (typeof tool.name !== 'string' || tool.name.trim() === '') {
          throw new Error('Tool must have execute function');
        }
        const resolvedName = typeof name === 'string' && name.trim()
          ? name.trim()
          : tool.name.trim();
        tools.set(resolvedName, tool);
      },
      hasTool: (name) => tools.has(name)
    };
  }

  /**
   * Validate tool adapter input
   * @param {Object} input - Input to validate
   * @returns {Object} Validation result
   */
  validateInput(input) {
    const errors = [];

    if (!input) {
      errors.push(new ValidationError('Input is required', 'input'));
      return { isValid: false, errors };
    }

    if (input.tool === undefined || input.tool === null) {
      errors.push(new ValidationError('Tool name is required', 'tool'));
    } else if (typeof input.tool !== 'string') {
      errors.push(new ValidationError('Tool name must be a string', 'tool'));
    } else if (input.tool.trim() === '') {
      errors.push(new ValidationError('Tool name must be a non-empty string', 'tool'));
    }

    if ('timeout' in input) {
      const timeout = input.timeout;
      if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0) {
        errors.push(new ValidationError('Timeout must be a positive number', 'timeout'));
      }
    }

    if ('maxRetries' in input) {
      const maxRetries = input.maxRetries;
      if (
        typeof maxRetries !== 'number' ||
        !Number.isFinite(maxRetries) ||
        !Number.isInteger(maxRetries) ||
        maxRetries < 0 ||
        maxRetries > 10
      ) {
        errors.push(new ValidationError('Max retries must be a number between 0 and 10', 'maxRetries'));
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Execute tool invocation
   * @param {Object} context - Workflow context
   * @param {Object} input - Tool parameters
   * @returns {Promise<Object>} Tool execution result
   */
  async execute(context, input) {
    const validation = this.validateInput(input);
    if (!validation.isValid) {
      throw new AdapterExecutionError(
        `Tool adapter validation failed: ${validation.errors.map(e => e.message).join(', ')}`,
        'tool',
        validation.errors[0]
      );
    }

    try {
      const tool = this.getTool(input.tool);
      const toolInput = this.buildToolInput(input, context);
      const result = await this.invokeTool(tool, toolInput, input);
      return this.processResult(result, context, input);
    } catch (error) {
      throw new AdapterExecutionError(
        `Tool invocation failed: ${error.message}`,
        'tool',
        error
      );
    }
  }

  /**
   * Get tool from registry
   * @param {string} toolName - Tool name
   * @returns {Object} Tool definition
   */
  getTool(toolName) {
    if (!this.toolRegistry || typeof this.toolRegistry.getTool !== 'function') {
      throw new Error('Tool registry not available or invalid');
    }

    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) {
      const availableTools = this.toolRegistry.listTools ? this.toolRegistry.listTools() : [];
      throw new Error(`Tool '${toolName}' not found. Available tools: ${availableTools.join(', ')}`);
    }

    return tool;
  }

  /**
   * Build tool input from adapter input and context
   * @param {Object} input - Adapter input
   * @param {Object} context - Workflow context
   * @returns {Object} Tool input
   */
  buildToolInput(input, context) {
    return {
      ...input.args,
      _context: {
        traceId: context.traceId,
        sessionId: context.sessionId,
        userId: context.userId,
        metadata: context.metadata
      }
    };
  }

  /**
   * Invoke tool with retry logic
   * @param {Object} tool - Tool definition
   * @param {Object} toolInput - Tool input
   * @param {Object} input - Original adapter input
   * @returns {Promise<Object>} Tool result
   */
  async invokeTool(tool, toolInput, input) {
    const timeout = input.timeout || this.config.timeout;
    const maxRetries = input.maxRetries !== undefined ? input.maxRetries : this.config.maxRetries;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.executeWithTimeout(tool, toolInput, timeout);
        return result;
      } catch (error) {
        lastError = error;
        
        // Don't retry on validation errors or user errors
        if (error.message.includes('must be') || error.message.includes('required')) {
          throw error;
        }
      }

      // Wait before retry (except on last attempt)
      if (attempt < maxRetries) {
        const baseDelay = this.config.retryDelay;
        const delay = Math.min(baseDelay * Math.pow(2, attempt), baseDelay * 10);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Execute tool with timeout
   * @param {Object} tool - Tool definition
   * @param {Object} toolInput - Tool input
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>} Tool result
   */
  async executeWithTimeout(tool, toolInput, timeout) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Tool execution timeout after ${timeout}ms`));
      }, timeout);

      try {
        const result = await tool.execute(toolInput);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Process tool execution result
   * @param {Object} result - Raw tool result
   * @param {Object} context - Workflow context
   * @param {Object} input - Original adapter input
   * @returns {Object} Processed result
   */
  processResult(result, context, input) {
    return {
      success: true,
      tool: input.tool,
      result: result.result || result,
      metadata: {
        traceId: context.traceId,
        elapsedTime: typeof context.getElapsedTime === 'function' ? context.getElapsedTime() : null,
        adapterKind: 'tool',
        toolName: input.tool,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Get adapter metadata
   * @returns {Object} Adapter metadata
   */
  getMetadata() {
    const availableTools = this.toolRegistry.listTools ? this.toolRegistry.listTools() : [];
    
    return {
      kind: 'tool',
      version: '1.0.0',
      description: 'Tool adapter for workflow execution',
      config: {
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries,
        toolRegistry: !!this.config.toolRegistry
      },
      availableTools
    };
  }
}

export default ToolAdapter;
