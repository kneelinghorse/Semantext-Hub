/**
 * Registration Pipeline - State Machine for Protocol Manifest Lifecycle
 *
 * Orchestrates the complete lifecycle of protocol manifest registration using:
 * - Hierarchical state machine for lifecycle management
 * - File-based persistence with event sourcing
 * - Optimistic concurrency control for safe concurrent updates
 * - Event emission for integration with external systems
 *
 * Lifecycle: DRAFT → REVIEWED → APPROVED → REGISTERED
 *
 * @module core/registration/registration-pipeline
 */

const EventEmitter = require('eventemitter3');
const {
  STATES,
  EVENTS,
  getInitialState,
  canTransition,
  evaluateGuard,
  executeEntryAction,
  isTerminalState
} = require('./state-machine-definition');
const {
  compareAndSwap,
  createVersionedState,
  DEFAULT_RETRY_CONFIG,
  ALREADY_APPLIED
} = require('./optimistic-lock');
const {
  loadStateWithRecovery,
  saveStateSnapshot,
  appendEventToLog
} = require('./file-persistence');
const {
  createStateTransitionEvent,
  EVENT_TYPES
} = require('./event-sourcing');

/**
 * Registration Pipeline Class
 *
 * Manages the complete registration lifecycle for protocol manifests
 */
class RegistrationPipeline extends EventEmitter {
  /**
   * Create a new Registration Pipeline
   *
   * @param {Object} options - Configuration options
   * @param {string} options.baseDir - Base directory for state persistence
   * @param {Object} options.retryConfig - Retry configuration for optimistic locking
   */
  constructor(options = {}) {
    super();
    this.baseDir = options.baseDir;
    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...(options.retryConfig || {})
    };
    this.metrics = {
      optimisticLock: {
        retries: {
          versionConflict: 0,
          alreadyApplied: 0,
          exhausted: 0
        }
      }
    };
    this._alreadyAppliedOperations = new Map();
  }

  /**
   * Initialize a new manifest in DRAFT state
   *
   * @param {string} manifestId - Unique manifest identifier
   * @param {Object} manifest - Manifest data
   * @returns {Promise<Object>} Initial versioned state
   */
  async initialize(manifestId, manifest) {
    if (!manifestId) {
      throw new Error('manifestId is required');
    }

    if (!manifest) {
      throw new Error('manifest is required');
    }

    // Check if already exists
    const existing = await loadStateWithRecovery(
      manifestId,
      {},
      this.baseDir
    );

    if (existing) {
      throw new Error(`Manifest ${manifestId} already exists in state ${existing.state.currentState}`);
    }

    // Create initial state
    const initialState = {
      manifestId,
      currentState: getInitialState(),
      manifest,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const versionedState = createVersionedState(initialState, 1);

    // Persist initial state
    await saveStateSnapshot(manifestId, versionedState, this.baseDir);

    // Log creation event
    const event = {
      eventId: require('crypto').randomUUID(),
      timestamp: new Date().toISOString(),
      eventType: EVENT_TYPES.MANIFEST_CREATED,
      manifestId,
      payload: { manifest },
      metadata: {}
    };
    await appendEventToLog(manifestId, event, this.baseDir);

    // Emit event
    this.emit('initialized', { manifestId, state: versionedState });

    return versionedState;
  }

  /**
   * Transition manifest to a new state
   *
   * @param {string} manifestId - Manifest identifier
   * @param {string} event - Event to trigger (e.g., 'submit_for_review')
   * @param {Object} context - Additional context data
   * @returns {Promise<Object>} New versioned state after transition
   */
  async transitionState(manifestId, event, context = {}) {
    if (!manifestId) {
      throw new Error('manifestId is required');
    }

    if (!event) {
      throw new Error('event is required');
    }

    const startTime = Date.now();

    // Use compare-and-swap pattern for optimistic locking
    const newVersionedState = await compareAndSwap(
      // Read function
      async () => {
        const state = await this.loadState(manifestId);
        if (!state) {
          throw new Error(`Manifest ${manifestId} not found`);
        }
        return state;
      },

      // Write function
      async (newVersionedState) => {
        await saveStateSnapshot(manifestId, newVersionedState, this.baseDir);
      },

      // Compute new state function
      async (currentState, attempt) => {
        const { currentState: fromState, manifest } = currentState;

        // Check if transition is allowed
        const transitionCheck = canTransition(fromState, event);
        if (!transitionCheck.allowed) {
          if (wasTransitionAlreadyApplied(currentState, event)) {
            this._recordAlreadyApplied(manifestId, event, attempt);
            return ALREADY_APPLIED;
          }

          if (isTerminalState(fromState)) {
            throw new Error(`No transitions defined for state ${fromState}`);
          }
          throw new Error(transitionCheck.reason);
        }

        const toState = transitionCheck.targetState;

        // Evaluate guard condition
        const guardResult = evaluateGuard(event, fromState, {
          ...context,
          manifestId,
          manifest
        });

        if (!guardResult.allowed) {
          throw new Error(`Guard condition failed: ${guardResult.reason}`);
        }

        // Construct new state
        const newState = {
          ...currentState,
          currentState: toState,
          updatedAt: new Date().toISOString(),
          lastTransition: {
            from: fromState,
            to: toState,
            event,
            timestamp: new Date().toISOString(),
            attempt
          },
          // Merge context into state
          ...context
        };

        // Execute entry action
        executeEntryAction(toState, {
          ...context,
          manifestId,
          manifest
        });

        return newState;
      },

      manifestId,
      this._createRetryConfig(manifestId, event)
    );

    const transitionDuration = Date.now() - startTime;
    const alreadyApplied = this._consumeAlreadyApplied(manifestId, event);

    if (alreadyApplied) {
      return newVersionedState;
    }

    // Log state transition event
    const transitionEvent = createStateTransitionEvent(
      manifestId,
      newVersionedState.state.lastTransition.from,
      newVersionedState.state.lastTransition.to,
      event,
      {
        ...context,
        transitionDuration,
        manifest: newVersionedState.state.manifest
      }
    );

    await appendEventToLog(manifestId, transitionEvent, this.baseDir);

    // Emit state change event
    this.emit('stateChange', {
      manifestId,
      fromState: newVersionedState.state.lastTransition.from,
      toState: newVersionedState.state.lastTransition.to,
      event,
      version: newVersionedState.version,
      transitionDuration
    });

    return newVersionedState;
  }

  /**
   * Load current state for a manifest
   *
   * @param {string} manifestId - Manifest identifier
   * @returns {Promise<Object|null>} Versioned state or null if not found
  */
  async loadState(manifestId) {
    const versionedState = await loadStateWithRecovery(
      manifestId,
      { currentState: getInitialState() },
      this.baseDir
    );

    if (
      !versionedState ||
      !versionedState.state ||
      !versionedState.state.manifestId
    ) {
      return null;
    }

    return versionedState;
  }

  /**
   * Get current state value (without version info)
   *
   * @param {string} manifestId - Manifest identifier
   * @returns {Promise<string|null>} Current state or null
   */
  async getCurrentState(manifestId) {
    const versionedState = await this.loadState(manifestId);
    return versionedState ? versionedState.state.currentState : null;
  }

  /**
   * Check if manifest is in a terminal state (no further transitions)
   *
   * @param {string} manifestId - Manifest identifier
   * @returns {Promise<boolean>}
   */
  async isInTerminalState(manifestId) {
    const currentState = await this.getCurrentState(manifestId);
    return currentState ? isTerminalState(currentState) : false;
  }

  /**
   * Submit manifest for review (DRAFT → REVIEWED)
   *
   * @param {string} manifestId - Manifest identifier
   * @returns {Promise<Object>} New versioned state
   */
  async submitForReview(manifestId) {
    return await this.transitionState(manifestId, EVENTS.SUBMIT_FOR_REVIEW);
  }

  /**
   * Approve manifest (REVIEWED → APPROVED)
   *
   * @param {string} manifestId - Manifest identifier
   * @param {string} reviewer - Reviewer identity
   * @param {string} reviewNotes - Review notes
   * @returns {Promise<Object>} New versioned state
   */
  async approve(manifestId, reviewer, reviewNotes) {
    return await this.transitionState(manifestId, EVENTS.APPROVE, {
      reviewer,
      reviewNotes
    });
  }

  /**
   * Reject manifest (REVIEWED|APPROVED → REJECTED)
   *
   * @param {string} manifestId - Manifest identifier
   * @param {string} rejectionReason - Reason for rejection
   * @returns {Promise<Object>} New versioned state
   */
  async reject(manifestId, rejectionReason) {
    return await this.transitionState(manifestId, EVENTS.REJECT, {
      rejectionReason
    });
  }

  /**
   * Register manifest (APPROVED → REGISTERED)
   *
   * @param {string} manifestId - Manifest identifier
   * @param {Object} context - Additional context (e.g., URN conflict check)
   * @returns {Promise<Object>} New versioned state
   */
  async register(manifestId, context = {}) {
    return await this.transitionState(manifestId, EVENTS.REGISTER, context);
  }

  /**
   * Revert to draft (REVIEWED|APPROVED|REJECTED → DRAFT)
   *
   * @param {string} manifestId - Manifest identifier
   * @returns {Promise<Object>} New versioned state
   */
  async revertToDraft(manifestId) {
    return await this.transitionState(manifestId, EVENTS.REVERT_TO_DRAFT);
  }
}

/**
 * Determine whether the requested transition was already applied by a prior call.
 *
 * @param {Object} state - Current manifest state snapshot
 * @param {string} event - Requested event name
 * @returns {boolean}
 */
function wasTransitionAlreadyApplied(state, event) {
  if (!state || !state.lastTransition) {
    return false;
  }

  const { lastTransition, currentState } = state;
  return (
    lastTransition.event === event &&
    lastTransition.to === currentState
  );
}

RegistrationPipeline.prototype._createRetryConfig = function(manifestId, event) {
  const baseConfig = this.retryConfig || {};
  const pipeline = this;

  return {
    ...baseConfig,
    resourceId: manifestId,
    onRetry(info) {
      if (typeof baseConfig.onRetry === 'function') {
        baseConfig.onRetry(info);
      }
      pipeline._recordVersionConflict(manifestId, event, info);
    },
    onSuccess(info) {
      if (typeof baseConfig.onSuccess === 'function') {
        baseConfig.onSuccess(info);
      }
      pipeline._recordRetrySuccess(manifestId, event, info);
    },
    onExhausted(info) {
      if (typeof baseConfig.onExhausted === 'function') {
        baseConfig.onExhausted(info);
      }
      pipeline._recordRetryExhausted(manifestId, event, info);
    }
  };
};

RegistrationPipeline.prototype._recordVersionConflict = function(manifestId, event, info) {
  this.metrics.optimisticLock.retries.versionConflict += 1;
  const payload = {
    manifestId,
    event,
    attempt: info.attempt + 1,
    maxAttempts: info.maxAttempts,
    backoffMs: info.delay,
    error: info.error ? info.error.message : undefined
  };
  this._logOptimisticLock('retry', payload);
  this.emit('optimisticLock.retry', payload);
};

RegistrationPipeline.prototype._recordRetrySuccess = function(manifestId, event, info) {
  if (info.attempt === 0) {
    return;
  }
  const payload = {
    manifestId,
    event,
    attempts: info.totalAttempts
  };
  this._logOptimisticLock('retry_success', payload);
  this.emit('optimisticLock.retrySuccess', payload);
};

RegistrationPipeline.prototype._recordRetryExhausted = function(manifestId, event, info) {
  this.metrics.optimisticLock.retries.exhausted += 1;
  const payload = {
    manifestId,
    event,
    attempts: info.attempts,
    error: info.error ? info.error.message : undefined
  };
  this._logOptimisticLock('retry_exhausted', payload);
  this.emit('optimisticLock.retryExhausted', payload);
};

RegistrationPipeline.prototype._recordAlreadyApplied = function(manifestId, event, attempt) {
  this.metrics.optimisticLock.retries.alreadyApplied += 1;
  const payload = {
    manifestId,
    event,
    attempt: attempt + 1
  };
  const key = this._operationKey(manifestId, event);
  const current = this._alreadyAppliedOperations.get(key) || 0;
  this._alreadyAppliedOperations.set(key, current + 1);

  this._logOptimisticLock('already_applied', payload);
  this.emit('optimisticLock.alreadyApplied', payload);
};

RegistrationPipeline.prototype._consumeAlreadyApplied = function(manifestId, event) {
  const key = this._operationKey(manifestId, event);
  const current = this._alreadyAppliedOperations.get(key) || 0;
  if (current <= 0) {
    return false;
  }
  if (current === 1) {
    this._alreadyAppliedOperations.delete(key);
  } else {
    this._alreadyAppliedOperations.set(key, current - 1);
  }
  return true;
};

RegistrationPipeline.prototype._operationKey = function(manifestId, event) {
  return `${manifestId}:${event}`;
};

RegistrationPipeline.prototype._logOptimisticLock = function(eventName, details) {
  const logPayload = {
    level: 'info',
    category: 'registration.optimistic_lock',
    event: eventName,
    timestamp: new Date().toISOString(),
    ...details
  };

  try {
    console.log(JSON.stringify(logPayload));
  } catch {
    console.log('[Registration][OptimisticLock]', eventName, details);
  }
};

RegistrationPipeline.prototype.getMetrics = function() {
  return JSON.parse(JSON.stringify(this.metrics));
};

module.exports = RegistrationPipeline;
