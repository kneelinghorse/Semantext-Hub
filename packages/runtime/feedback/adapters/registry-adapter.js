/**
 * Registry Feedback Adapter
 * Wraps RegistrationPipeline events into structured feedback
 */

import { FeedbackFormatter } from '../feedback.js';
import { ErrorCodes } from '../error-codes.js';
import { ProgressTracker } from '../progress.js';

/**
 * RegistryFeedbackAdapter - Converts registration events to feedback
 */
export class RegistryFeedbackAdapter {
  constructor(registrationPipeline, options = {}) {
    this.pipeline = registrationPipeline;
    this.formatter = new FeedbackFormatter({
      serviceName: 'registration-pipeline',
      ...options
    });

    this.progressTrackers = new Map();
    this._attachListeners();
  }

  /**
   * Attach event listeners to registration pipeline
   * @private
   */
  _attachListeners() {
    // State transition events (pipeline emits 'stateChange')
    this.pipeline.on('stateChange', (event) => {
      const { manifestId, fromState, toState } = event;

      // Create or update progress tracker
      let tracker = this.progressTrackers.get(manifestId);
      if (!tracker) {
        tracker = new ProgressTracker({
          taskId: manifestId,
          totalSteps: 4, // DRAFT → REVIEWED → APPROVED → REGISTERED
          correlationId: manifestId
        });
        this.progressTrackers.set(manifestId, tracker);

        // Forward progress events
        tracker.on('progress', (progressEvent) => {
          this.pipeline.emit('feedback:progress', progressEvent);
        });
      }

      // Map states to progress steps
      const stateToStep = {
        'DRAFT': 0,
        'REVIEWED': 1,
        'APPROVED': 2,
        'REGISTERED': 3
      };

      const currentStep = stateToStep[toState] || 0;
      tracker.updateProgress({
        currentStep,
        description: `Registration state: ${toState}`
      });

      // Complete on REGISTERED
      if (toState === 'REGISTERED') {
        tracker.complete();
        this.progressTrackers.delete(manifestId);
      }
    });

    // Errors on pipeline/orchestrator
    // RegistrationPipeline and Orchestrator both emit generic 'error'
    this.pipeline.on('error', (event) => {
      const { manifestId, fromState, toState, error } = event || {};

      const feedbackError = this.formatter.formatError(ErrorCodes.REGISTRATION_CONFLICT, {
        detail: fromState && toState && error
          ? `Cannot transition from ${fromState} to ${toState}: ${error}`
          : `Registration error: ${error || 'Unknown error'}`,
        details: {
          manifestId,
          fromState,
          toState,
          errorMessage: error
        },
        suggestedFix: 'Ensure the manifest meets all requirements for this transition',
        correlationId: manifestId
      });

      const tracker = this.progressTrackers.get(manifestId);
      if (tracker) {
        tracker.fail(feedbackError);
        this.progressTrackers.delete(manifestId);
      }

      this.pipeline.emit('feedback:error', feedbackError);
    });

    // Optional: listen for orchestrator success events if provided
    if (typeof this.pipeline.on === 'function') {
      // Orchestrator forwards registry writer success as 'catalogRegistered' and full success as 'registered'
      this.pipeline.on('catalogRegistered', (event) => {
        const { manifestId } = event || {};
        const tracker = this.progressTrackers.get(manifestId);
        if (tracker) {
          tracker.updateProgress({ description: 'Registry updated successfully' });
        }
      });
      this.pipeline.on('registered', (event) => {
        const { manifestId } = event || {};
        const tracker = this.progressTrackers.get(manifestId);
        if (tracker) {
          tracker.complete();
          this.progressTrackers.delete(manifestId);
        }
      });
    }

    // Retry attempts are surfaced via compare-and-swap; no direct event in pipeline
  }

  /**
   * Get active progress tracker
   * @param {string} manifestId - Manifest identifier
   * @returns {ProgressTracker|null}
   */
  getProgressTracker(manifestId) {
    return this.progressTrackers.get(manifestId) || null;
  }

  /**
   * Get all active trackers
   * @returns {Array<ProgressTracker>}
   */
  getAllTrackers() {
    return Array.from(this.progressTrackers.values());
  }

  /**
   * Get registration summary
   * @returns {object} Summary of registrations
   */
  getSummary() {
    const trackers = Array.from(this.progressTrackers.values());
    return {
      total: trackers.length,
      inProgress: trackers.filter(t => t.status === 'IN_PROGRESS').length,
      completed: trackers.filter(t => t.status === 'COMPLETED').length,
      failed: trackers.filter(t => t.status === 'FAILED').length
    };
  }
}

export default RegistryFeedbackAdapter;
