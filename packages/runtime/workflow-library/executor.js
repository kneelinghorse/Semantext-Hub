/**
 * Workflow Executor
 * Executes workflow definitions with support for sequential, parallel, conditional, and saga patterns
 */

import { EventEmitter } from 'events';

/**
 * Workflow execution states
 */
const ExecutionState = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  COMPENSATING: 'compensating',
  COMPENSATED: 'compensated'
};

/**
 * Step execution result
 */
class StepResult {
  constructor(stepId, status, output = null, error = null, duration = 0) {
    this.stepId = stepId;
    this.status = status;
    this.output = output;
    this.error = error;
    this.duration = duration;
    this.timestamp = Date.now();
  }
}

/**
 * Workflow execution context
 */
class ExecutionContext {
  constructor(workflowId, inputs = {}) {
    this.workflowId = workflowId;
    this.inputs = inputs;
    this.outputs = {};
    this.stepResults = new Map();
    this.state = ExecutionState.PENDING;
    this.startTime = null;
    this.endTime = null;
    this.compensationStack = [];
  }

  setStepResult(stepId, result) {
    this.stepResults.set(stepId, result);
    if (result.output) {
      this.outputs[stepId] = result.output;
    }
  }

  getStepResult(stepId) {
    return this.stepResults.get(stepId);
  }

  getStepOutput(stepId) {
    const result = this.stepResults.get(stepId);
    return result ? result.output : undefined;
  }

  isStepCompleted(stepId) {
    const result = this.stepResults.get(stepId);
    return result && result.status === 'completed';
  }

  addCompensation(stepId, compensationFn) {
    this.compensationStack.push({ stepId, compensationFn });
  }

  getDuration() {
    if (!this.startTime) return 0;
    const end = this.endTime || Date.now();
    return end - this.startTime;
  }
}

/**
 * Workflow Executor
 */
class WorkflowExecutor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      dryRun: options.dryRun || false,
      taskExecutor: options.taskExecutor || this._defaultTaskExecutor.bind(this),
      maxConcurrency: options.maxConcurrency || 10
    };
  }

  /**
   * Execute a workflow definition
   * @param {object} workflow - The workflow definition
   * @param {object} inputs - Input parameters for the workflow
   * @returns {Promise<ExecutionContext>} - The execution context with results
   */
  async execute(workflow, inputs = {}) {
    const context = new ExecutionContext(workflow.workflowId, inputs);
    context.state = ExecutionState.RUNNING;
    context.startTime = Date.now();

    this.emit('workflow:start', { workflowId: workflow.workflowId, inputs });

    try {
      // Execute workflow steps
      await this._executeSteps(workflow.steps, context, workflow);

      context.state = ExecutionState.COMPLETED;
      context.endTime = Date.now();

      this.emit('workflow:complete', {
        workflowId: workflow.workflowId,
        duration: context.getDuration(),
        outputs: context.outputs
      });

      return context;
    } catch (error) {
      context.state = ExecutionState.FAILED;
      context.endTime = Date.now();

      this.emit('workflow:failed', {
        workflowId: workflow.workflowId,
        error: error.message,
        duration: context.getDuration()
      });

      // Execute compensation if enabled
      if (workflow.compensationPolicy && workflow.compensationPolicy !== 'none') {
        await this._executeCompensation(context, workflow.compensationPolicy);
      }

      throw error;
    }
  }

  /**
   * Execute a list of steps
   * @private
   */
  async _executeSteps(steps, context, workflow) {
    if (!steps || steps.length === 0) return;

    for (const step of steps) {
      await this._executeStep(step, context, workflow);
    }
  }

  /**
   * Execute a single step
   * @private
   */
  async _executeStep(step, context, workflow) {
    // Check if step should be skipped due to dependencies
    if (!this._checkDependencies(step, context)) {
      this.emit('step:skipped', { stepId: step.stepId, reason: 'dependencies not met' });
      return;
    }

    // Check condition for execution
    if (step.condition && !this._evaluateCondition(step.condition, context)) {
      this.emit('step:skipped', { stepId: step.stepId, reason: 'condition not met' });
      return;
    }

    const startTime = Date.now();
    this.emit('step:start', { stepId: step.stepId, type: step.type });

    try {
      let result;

      switch (step.type) {
        case 'task':
          result = await this._executeTask(step, context, workflow);
          break;
        case 'parallel':
          result = await this._executeParallel(step, context, workflow);
          break;
        case 'conditional':
          result = await this._executeConditional(step, context, workflow);
          break;
        case 'compensation':
          result = await this._executeCompensationStep(step, context, workflow);
          break;
        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }

      const duration = Date.now() - startTime;
      const stepResult = new StepResult(step.stepId, 'completed', result, null, duration);
      context.setStepResult(step.stepId, stepResult);

      this.emit('step:complete', {
        stepId: step.stepId,
        duration,
        output: result
      });

      // Register compensation if specified
      if (step.compensation) {
        context.addCompensation(step.stepId, async () => {
          const compensationStep = this._findStepById(workflow.steps, step.compensation);
          if (compensationStep) {
            await this._executeStep(compensationStep, context, workflow);
          }
        });
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const stepResult = new StepResult(step.stepId, 'failed', null, error, duration);
      context.setStepResult(step.stepId, stepResult);

      this.emit('step:failed', {
        stepId: step.stepId,
        error: error.message,
        duration
      });

      // Handle failure based on onFailure policy
      const onFailure = step.onFailure || 'fail';
      if (onFailure === 'fail') {
        throw error;
      } else if (onFailure === 'compensate') {
        throw error; // Will trigger compensation at workflow level
      }
      // 'continue' - just log and continue
    }
  }

  /**
   * Execute a task step
   * @private
   */
  async _executeTask(step, context, workflow) {
    if (!step.task) {
      throw new Error(`Task step '${step.stepId}' missing task definition`);
    }

    const inputs = this._resolveInputs(step.task.inputs, context);
    const timeout = step.timeout || workflow.timeout;
    const retryPolicy = step.retryPolicy || workflow.retryPolicy;

    let lastError;
    const maxAttempts = retryPolicy?.maxAttempts || 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this._executeWithTimeout(
          () => this.options.taskExecutor(step.task.action, inputs, context),
          timeout
        );

        return this._mapOutputs(result, step.task.outputs);
      } catch (error) {
        lastError = error;

        if (attempt < maxAttempts && this._isRetryable(error, retryPolicy)) {
          const backoff = this._calculateBackoff(attempt, retryPolicy);
          this.emit('step:retry', {
            stepId: step.stepId,
            attempt,
            maxAttempts,
            backoff,
            error: error.message
          });
          await this._sleep(backoff);
        } else {
          break;
        }
      }
    }

    throw lastError;
  }

  /**
   * Execute parallel branches
   * @private
   */
  async _executeParallel(step, context, workflow) {
    if (!step.branches || step.branches.length === 0) {
      throw new Error(`Parallel step '${step.stepId}' has no branches`);
    }

    const startTime = Date.now();
    this.emit('parallel:start', {
      stepId: step.stepId,
      branches: step.branches.length
    });

    const branchPromises = step.branches.map(async (branch) => {
      const branchContext = Object.create(context);
      try {
        await this._executeSteps(branch.steps, branchContext, workflow);
        return { branchId: branch.branchId, success: true };
      } catch (error) {
        return { branchId: branch.branchId, success: false, error };
      }
    });

    const results = await Promise.all(branchPromises);
    const duration = Date.now() - startTime;

    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
      this.emit('parallel:failed', {
        stepId: step.stepId,
        failed: failed.map(f => f.branchId),
        duration
      });
      throw new Error(`Parallel execution failed: ${failed.map(f => f.branchId).join(', ')}`);
    }

    this.emit('parallel:complete', {
      stepId: step.stepId,
      branches: results.length,
      duration
    });

    return { branches: results };
  }

  /**
   * Execute conditional step
   * @private
   */
  async _executeConditional(step, context, workflow) {
    if (!step.cases || step.cases.length === 0) {
      throw new Error(`Conditional step '${step.stepId}' has no cases`);
    }

    // Evaluate cases in order
    for (const caseItem of step.cases) {
      if (this._evaluateCondition(caseItem.condition, context)) {
        this.emit('conditional:matched', {
          stepId: step.stepId,
          condition: caseItem.condition
        });
        await this._executeSteps(caseItem.steps, context, workflow);
        return { matched: caseItem.condition };
      }
    }

    // Execute default case if present
    if (step.default && step.default.length > 0) {
      this.emit('conditional:default', { stepId: step.stepId });
      await this._executeSteps(step.default, context, workflow);
      return { matched: 'default' };
    }

    this.emit('conditional:no-match', { stepId: step.stepId });
    return { matched: null };
  }

  /**
   * Execute compensation step
   * @private
   */
  async _executeCompensationStep(step, context, workflow) {
    this.emit('compensation:execute', { stepId: step.stepId });

    if (step.task) {
      return await this._executeTask(step, context, workflow);
    }

    return { compensated: true };
  }

  /**
   * Execute compensation stack
   * @private
   */
  async _executeCompensation(context, policy) {
    context.state = ExecutionState.COMPENSATING;

    this.emit('compensation:start', {
      workflowId: context.workflowId,
      stackSize: context.compensationStack.length,
      policy
    });

    const compensations = policy === 'full'
      ? context.compensationStack
      : context.compensationStack.slice(-1);

    // Execute compensations in reverse order (LIFO)
    for (let i = compensations.length - 1; i >= 0; i--) {
      const { stepId, compensationFn } = compensations[i];
      try {
        this.emit('compensation:step', { stepId });
        await compensationFn();
      } catch (error) {
        this.emit('compensation:failed', {
          stepId,
          error: error.message
        });
        // Continue with remaining compensations
      }
    }

    context.state = ExecutionState.COMPENSATED;
    this.emit('compensation:complete', { workflowId: context.workflowId });
  }

  /**
   * Check if step dependencies are satisfied
   * @private
   */
  _checkDependencies(step, context) {
    if (!step.dependsOn || step.dependsOn.length === 0) {
      return true;
    }

    return step.dependsOn.every(depId => context.isStepCompleted(depId));
  }

  /**
   * Evaluate a condition expression
   * @private
   */
  _evaluateCondition(condition, context) {
    try {
      // Simple expression evaluation
      // In production, use a safe expression evaluator
      const fn = new Function('context', `
        with (context.outputs) {
          return ${condition};
        }
      `);
      return Boolean(fn(context));
    } catch (error) {
      this.emit('condition:error', {
        condition,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Resolve input parameters with context values
   * @private
   */
  _resolveInputs(inputs, context) {
    if (!inputs) return {};

    const resolved = {};
    for (const [key, value] of Object.entries(inputs)) {
      if (typeof value === 'string' && value.startsWith('$')) {
        // Reference to context output
        const stepId = value.substring(1);
        resolved[key] = context.getStepOutput(stepId);
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }

  /**
   * Map task outputs
   * @private
   */
  _mapOutputs(result, outputMapping) {
    if (!outputMapping) return result;

    const mapped = {};
    for (const [key, sourcePath] of Object.entries(outputMapping)) {
      mapped[key] = this._getNestedValue(result, sourcePath);
    }
    return mapped;
  }

  /**
   * Get nested value from object by path
   * @private
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Check if error is retryable
   * @private
   */
  _isRetryable(error, retryPolicy) {
    if (!retryPolicy || !retryPolicy.retryableErrors) {
      return true; // Retry all errors by default
    }

    return retryPolicy.retryableErrors.some(pattern =>
      error.message.includes(pattern) || error.code === pattern
    );
  }

  /**
   * Calculate backoff delay
   * @private
   */
  _calculateBackoff(attempt, retryPolicy) {
    if (!retryPolicy) return 1000;

    const baseBackoff = retryPolicy.backoffMs || 1000;
    const multiplier = retryPolicy.backoffMultiplier || 2;
    const maxBackoff = retryPolicy.maxBackoffMs || 60000;

    const backoff = baseBackoff * Math.pow(multiplier, attempt - 1);
    return Math.min(backoff, maxBackoff);
  }

  /**
   * Execute with timeout
   * @private
   */
  async _executeWithTimeout(fn, timeout) {
    if (!timeout) return await fn();

    return await Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
      )
    ]);
  }

  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Find step by ID recursively
   * @private
   */
  _findStepById(steps, stepId) {
    for (const step of steps) {
      if (step.stepId === stepId) return step;

      if (step.branches) {
        for (const branch of step.branches) {
          const found = this._findStepById(branch.steps, stepId);
          if (found) return found;
        }
      }

      if (step.cases) {
        for (const caseItem of step.cases) {
          const found = this._findStepById(caseItem.steps, stepId);
          if (found) return found;
        }
      }

      if (step.default) {
        const found = this._findStepById(step.default, stepId);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Default task executor (dry-run simulation)
   * @private
   */
  async _defaultTaskExecutor(action, inputs, context) {
    // Simulate task execution
    await this._sleep(10); // Simulate some work
    return {
      action,
      inputs,
      simulated: true,
      timestamp: Date.now()
    };
  }
}

export {
  WorkflowExecutor,
  ExecutionContext,
  ExecutionState,
  StepResult
};
