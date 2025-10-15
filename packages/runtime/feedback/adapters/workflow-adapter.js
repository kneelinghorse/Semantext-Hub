/**
 * Workflow Feedback Adapter
 * Wraps WorkflowExecutor events into structured feedback
 */

import { FeedbackFormatter } from '../feedback.js';
import { ErrorCodes } from '../error-codes.js';
import { ProgressTracker, ProgressStatus } from '../progress.js';

/**
 * WorkflowFeedbackAdapter - Converts workflow execution events to feedback
 */
export class WorkflowFeedbackAdapter {
  constructor(workflowExecutor, options = {}) {
    this.executor = workflowExecutor;
    this.formatter = new FeedbackFormatter({
      serviceName: 'workflow-executor',
      ...options
    });

    this.progressTrackers = new Map();
    this._attachListeners();
  }

  /**
   * Attach event listeners to workflow executor
   * @private
   */
  _attachListeners() {
    // Track the currently running workflow ID on this executor instance.
    // Note: this assumes a single concurrent workflow per executor.
    this._activeWorkflowId = null;

    // Workflow started (executor emits 'workflow:start')
    this.executor.on('workflow:start', (event) => {
      const workflowId = event.workflowId;
      this._activeWorkflowId = workflowId;

      const tracker = new ProgressTracker({
        taskId: workflowId,
        // Total steps unknown from event payload; use 100 default for smooth percent updates
        totalSteps: 100,
        correlationId: workflowId
      });

      this.progressTrackers.set(workflowId, tracker);
      tracker.start(`Executing workflow: ${workflowId}`);

      // Forward progress events
      tracker.on('progress', (progressEvent) => {
        this.executor.emit('feedback:progress', progressEvent);
      });
    });

    // Step started (executor emits 'step:start')
    this.executor.on('step:start', (event) => {
      const tracker = this._activeWorkflowId
        ? this.progressTrackers.get(this._activeWorkflowId)
        : null;
      if (tracker) {
        tracker.updateProgress({ description: `Executing step: ${event.stepId}` });
      }
    });

    // Step completed (executor emits 'step:complete')
    this.executor.on('step:complete', (event) => {
      const tracker = this._activeWorkflowId
        ? this.progressTrackers.get(this._activeWorkflowId)
        : null;
      if (tracker) {
        // Increment current step counter if using default totalSteps
        const nextStep = (tracker.progress.currentStep || 0) + 1;
        tracker.updateProgress({
          currentStep: nextStep,
          description: `Completed step: ${event.stepId}`
        });
      }
    });

    // Step failed (executor emits 'step:failed')
    this.executor.on('step:failed', (event) => {
      const workflowId = this._activeWorkflowId;
      const error = this.formatter.formatError(ErrorCodes.WORKFLOW_VALIDATION_FAILED, {
        detail: `Step ${event.stepId} failed: ${event.error}`,
        details: {
          stepId: event.stepId,
          errorMessage: event.error
        },
        suggestedFix: 'Review the step configuration and ensure all dependencies are met',
        correlationId: workflowId
      });

      this.executor.emit('feedback:error', error);
    });

    // Workflow completed (executor emits 'workflow:complete')
    this.executor.on('workflow:complete', (event) => {
      const workflowId = event.workflowId;
      const tracker = this.progressTrackers.get(workflowId);
      if (tracker) {
        tracker.complete();
        this.progressTrackers.delete(workflowId);
      }
      if (this._activeWorkflowId === workflowId) this._activeWorkflowId = null;
    });

    // Workflow failed (executor emits 'workflow:failed')
    this.executor.on('workflow:failed', (event) => {
      const workflowId = event.workflowId;
      const tracker = this.progressTrackers.get(workflowId);

      const error = this.formatter.formatError(ErrorCodes.WORKFLOW_VALIDATION_FAILED, {
        detail: `Workflow execution failed: ${event.error}`,
        details: {
          workflowId,
          duration: event.duration
        },
        correlationId: workflowId
      });

      if (tracker) {
        tracker.fail(error);
        this.progressTrackers.delete(workflowId);
      }

      this.executor.emit('feedback:error', error);
      if (this._activeWorkflowId === workflowId) this._activeWorkflowId = null;
    });

    // Compensation started (executor emits 'compensation:start')
    this.executor.on('compensation:start', (event) => {
      const workflowId = event.workflowId || this._activeWorkflowId;
      const tracker = workflowId ? this.progressTrackers.get(workflowId) : null;
      if (tracker) {
        tracker.updateProgress({
          description: `Running compensation actions (${event.stackSize} step(s))`,
          currentStep: 0
        });
      }
    });
  }

  /**
   * Estimate total steps in workflow
   * @private
   */
  _estimateTotalSteps(workflow) {
    if (!workflow.steps) return 1;

    let count = 0;
    const countSteps = (steps) => {
      for (const step of steps) {
        count++;
        if (step.steps) {
          countSteps(step.steps);
        }
        if (step.branches) {
          for (const branch of step.branches) {
            if (branch.steps) {
              countSteps(branch.steps);
            }
          }
        }
      }
    };

    countSteps(workflow.steps);
    return count || 1;
  }

  /**
   * Get active progress tracker
   * @param {string} workflowId - Workflow identifier
   * @returns {ProgressTracker|null}
   */
  getProgressTracker(workflowId) {
    return this.progressTrackers.get(workflowId) || null;
  }

  /**
   * Get all active trackers
   * @returns {Array<ProgressTracker>}
   */
  getAllTrackers() {
    return Array.from(this.progressTrackers.values());
  }
}

export default WorkflowFeedbackAdapter;
