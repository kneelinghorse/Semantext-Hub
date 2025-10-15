/**
 * State Machine Definition for Protocol Manifest Registration Lifecycle
 *
 * Defines the finite states, allowed transitions, guard conditions, and actions
 * for the protocol registration workflow. Based on hierarchical state machine
 * patterns (Statecharts) without external dependencies.
 *
 * State Lifecycle:
 * DRAFT → REVIEWED → APPROVED → REGISTERED
 *
 * @module core/registration/state-machine-definition
 */

/**
 * Valid states in the registration lifecycle
 */
const STATES = {
  DRAFT: 'DRAFT',
  REVIEWED: 'REVIEWED',
  APPROVED: 'APPROVED',
  REGISTERED: 'REGISTERED',
  REJECTED: 'REJECTED'
};

/**
 * Valid events that trigger state transitions
 */
const EVENTS = {
  SUBMIT_FOR_REVIEW: 'submit_for_review',
  APPROVE: 'approve',
  REJECT: 'reject',
  REGISTER: 'register',
  REVERT_TO_DRAFT: 'revert_to_draft'
};

/**
 * State machine transition table
 * Maps current state → allowed events → target state
 */
const TRANSITIONS = {
  [STATES.DRAFT]: {
    [EVENTS.SUBMIT_FOR_REVIEW]: STATES.REVIEWED
  },
  [STATES.REVIEWED]: {
    [EVENTS.APPROVE]: STATES.APPROVED,
    [EVENTS.REJECT]: STATES.REJECTED,
    [EVENTS.REVERT_TO_DRAFT]: STATES.DRAFT
  },
  [STATES.APPROVED]: {
    [EVENTS.REGISTER]: STATES.REGISTERED,
    [EVENTS.REJECT]: STATES.REJECTED,
    [EVENTS.REVERT_TO_DRAFT]: STATES.DRAFT
  },
  [STATES.REGISTERED]: {
    // Terminal state - no transitions allowed
  },
  [STATES.REJECTED]: {
    [EVENTS.REVERT_TO_DRAFT]: STATES.DRAFT
  }
};

/**
 * Guard conditions that must be satisfied for transitions
 * Guards are functions that return true/false to allow/block a transition
 */
const GUARDS = {
  /**
   * Check if manifest is valid before submitting for review
   */
  canSubmitForReview: (state, context) => {
    if (!context.manifest) {
      return { allowed: false, reason: 'Manifest is required' };
    }
    if (!context.manifest.urn) {
      return { allowed: false, reason: 'Manifest must have a valid URN' };
    }
    return { allowed: true };
  },

  /**
   * Check if reviewer is authorized to approve
   */
  canApprove: (state, context) => {
    if (!context.reviewer) {
      return { allowed: false, reason: 'Reviewer identity is required' };
    }
    if (!context.reviewNotes) {
      return { allowed: false, reason: 'Review notes are required for approval' };
    }
    return { allowed: true };
  },

  /**
   * Check if rejection reason is provided
   */
  canReject: (state, context) => {
    if (!context.rejectionReason) {
      return { allowed: false, reason: 'Rejection reason is required' };
    }
    return { allowed: true };
  },

  /**
   * Check if manifest can be registered (URN available, no conflicts)
   */
  canRegister: (state, context) => {
    if (!context.manifest) {
      return { allowed: false, reason: 'Manifest is required for registration' };
    }
    if (!context.manifest.urn) {
      return { allowed: false, reason: 'Manifest must have a valid URN for registration' };
    }
    if (context.conflictingUrn) {
      return { allowed: false, reason: `URN conflict detected: ${context.conflictingUrn}` };
    }
    return { allowed: true };
  }
};

/**
 * Actions to execute on state entry, exit, or transition
 * Actions are side effects (logging, notifications, etc.)
 */
const ACTIONS = {
  onEnterDraft: (state, context) => {
    console.log(`[Registration] Entered DRAFT state for manifest: ${context.manifestId}`);
  },

  onEnterReviewed: (state, context) => {
    console.log(`[Registration] Entered REVIEWED state for manifest: ${context.manifestId}`);
  },

  onEnterApproved: (state, context) => {
    console.log(`[Registration] Entered APPROVED state for manifest: ${context.manifestId} by ${context.reviewer}`);
  },

  onEnterRegistered: (state, context) => {
    console.log(`[Registration] Manifest REGISTERED: ${context.manifest?.urn}`);
  },

  onEnterRejected: (state, context) => {
    console.log(`[Registration] Manifest REJECTED: ${context.rejectionReason}`);
  }
};

/**
 * Validate if a state is valid
 * @param {string} state - State to validate
 * @returns {boolean}
 */
function isValidState(state) {
  return Object.values(STATES).includes(state);
}

/**
 * Validate if an event is valid
 * @param {string} event - Event to validate
 * @returns {boolean}
 */
function isValidEvent(event) {
  return Object.values(EVENTS).includes(event);
}

/**
 * Check if a transition is allowed from current state with given event
 * @param {string} currentState - Current state
 * @param {string} event - Event to trigger
 * @returns {{allowed: boolean, targetState?: string, reason?: string}}
 */
function canTransition(currentState, event) {
  if (!isValidState(currentState)) {
    return { allowed: false, reason: `Invalid state: ${currentState}` };
  }

  if (!isValidEvent(event)) {
    return { allowed: false, reason: `Invalid event: ${event}` };
  }

  const stateTransitions = TRANSITIONS[currentState];
  if (!stateTransitions) {
    return { allowed: false, reason: `No transitions defined for state: ${currentState}` };
  }

  const targetState = stateTransitions[event];
  if (!targetState) {
    return {
      allowed: false,
      reason: `Event '${event}' not allowed in state '${currentState}'`
    };
  }

  return { allowed: true, targetState };
}

/**
 * Evaluate guard condition for a transition
 * @param {string} event - Event triggering transition
 * @param {string} currentState - Current state
 * @param {Object} context - Context data
 * @returns {{allowed: boolean, reason?: string}}
 */
function evaluateGuard(event, currentState, context) {
  // Map events to guard functions
  const eventGuardMap = {
    [EVENTS.SUBMIT_FOR_REVIEW]: GUARDS.canSubmitForReview,
    [EVENTS.APPROVE]: GUARDS.canApprove,
    [EVENTS.REJECT]: GUARDS.canReject,
    [EVENTS.REGISTER]: GUARDS.canRegister
  };

  const guardFn = eventGuardMap[event];
  if (!guardFn) {
    // No guard defined for this event - allow by default
    return { allowed: true };
  }

  return guardFn(currentState, context);
}

/**
 * Execute action on state entry
 * @param {string} state - State being entered
 * @param {Object} context - Context data
 */
function executeEntryAction(state, context) {
  const actionMap = {
    [STATES.DRAFT]: ACTIONS.onEnterDraft,
    [STATES.REVIEWED]: ACTIONS.onEnterReviewed,
    [STATES.APPROVED]: ACTIONS.onEnterApproved,
    [STATES.REGISTERED]: ACTIONS.onEnterRegistered,
    [STATES.REJECTED]: ACTIONS.onEnterRejected
  };

  const actionFn = actionMap[state];
  if (actionFn) {
    actionFn(state, context);
  }
}

/**
 * Get initial state for a new manifest
 * @returns {string}
 */
function getInitialState() {
  return STATES.DRAFT;
}

/**
 * Check if state is terminal (no further transitions)
 * @param {string} state
 * @returns {boolean}
 */
function isTerminalState(state) {
  return state === STATES.REGISTERED;
}

module.exports = {
  STATES,
  EVENTS,
  TRANSITIONS,
  GUARDS,
  ACTIONS,
  isValidState,
  isValidEvent,
  canTransition,
  evaluateGuard,
  executeEntryAction,
  getInitialState,
  isTerminalState
};
