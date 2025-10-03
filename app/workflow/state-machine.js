/**
 * Manifest State Machine
 *
 * Manages state transitions for protocol manifests.
 * Validates and executes transitions between states: draft → approved
 */

/**
 * Valid manifest states
 */
const STATES = {
  DRAFT: 'draft',
  APPROVED: 'approved',
  DEPRECATED: 'deprecated'
};

/**
 * Valid state transitions
 * Maps current state to allowed next states
 */
const TRANSITIONS = {
  [STATES.DRAFT]: [STATES.APPROVED],
  [STATES.APPROVED]: [STATES.DEPRECATED, STATES.DRAFT], // Can revert or deprecate
  [STATES.DEPRECATED]: [] // Terminal state
};

/**
 * State transition error
 */
class StateTransitionError extends Error {
  constructor(message, currentState, targetState) {
    super(message);
    this.name = 'StateTransitionError';
    this.currentState = currentState;
    this.targetState = targetState;
  }
}

/**
 * Check if state transition is valid
 *
 * @param {string} currentState - Current manifest state
 * @param {string} targetState - Target state to transition to
 * @returns {boolean} True if transition is allowed
 */
function isValidTransition(currentState, targetState) {
  if (!currentState || !targetState) {
    return false;
  }

  const allowedTransitions = TRANSITIONS[currentState];
  if (!allowedTransitions) {
    return false;
  }

  return allowedTransitions.includes(targetState);
}

/**
 * Transition manifest to a new state
 *
 * @param {Object} manifest - The manifest to transition
 * @param {string} targetState - The target state
 * @param {Object} options - Transition options
 * @param {boolean} options.force - Force transition even if invalid
 * @param {string} options.approvedBy - User/system that approved
 * @returns {Object} New manifest with updated state
 * @throws {StateTransitionError} If transition is invalid and not forced
 */
function transition(manifest, targetState, options = {}) {
  const currentState = manifest.metadata?.status;

  if (!currentState) {
    throw new StateTransitionError(
      'Manifest has no current state',
      undefined,
      targetState
    );
  }

  // Validate target state exists
  if (!Object.values(STATES).includes(targetState)) {
    throw new StateTransitionError(
      `Invalid target state: ${targetState}`,
      currentState,
      targetState
    );
  }

  // Check if already in target state
  if (currentState === targetState) {
    // No-op: already in target state
    return manifest;
  }

  // Validate transition is allowed
  if (!isValidTransition(currentState, targetState) && !options.force) {
    throw new StateTransitionError(
      `Invalid transition from ${currentState} to ${targetState}`,
      currentState,
      targetState
    );
  }

  // Create new manifest with updated state
  const newManifest = JSON.parse(JSON.stringify(manifest)); // Deep clone

  // Update state
  newManifest.metadata.status = targetState;

  // Add transition metadata
  const timestamp = new Date().toISOString();

  if (targetState === STATES.APPROVED) {
    newManifest.metadata.approved_at = timestamp;
    if (options.approvedBy) {
      newManifest.metadata.approved_by = options.approvedBy;
    }
  }

  // Track state history
  if (!newManifest.metadata.state_history) {
    newManifest.metadata.state_history = [];
  }

  newManifest.metadata.state_history.push({
    from: currentState,
    to: targetState,
    timestamp,
    forced: options.force || false,
    ...(options.approvedBy && { by: options.approvedBy })
  });

  return newManifest;
}

/**
 * Approve a draft manifest
 *
 * @param {Object} manifest - Draft manifest to approve
 * @param {Object} options - Approval options
 * @returns {Object} Approved manifest
 * @throws {StateTransitionError} If not in draft state
 */
function approve(manifest, options = {}) {
  return transition(manifest, STATES.APPROVED, options);
}

/**
 * Revert an approved manifest back to draft
 *
 * @param {Object} manifest - Approved manifest to revert
 * @param {Object} options - Revert options
 * @returns {Object} Draft manifest
 * @throws {StateTransitionError} If not in approved state
 */
function revertToDraft(manifest, options = {}) {
  // Remove approval metadata when reverting
  const result = transition(manifest, STATES.DRAFT, options);
  delete result.metadata.approved_at;
  delete result.metadata.approved_by;
  return result;
}

/**
 * Deprecate a manifest
 *
 * @param {Object} manifest - Manifest to deprecate
 * @param {Object} options - Deprecation options
 * @param {string} options.reason - Reason for deprecation
 * @returns {Object} Deprecated manifest
 */
function deprecate(manifest, options = {}) {
  const result = transition(manifest, STATES.DEPRECATED, options);

  if (options.reason) {
    result.metadata.deprecation_reason = options.reason;
  }

  result.metadata.deprecated_at = new Date().toISOString();

  return result;
}

/**
 * Get possible next states for a manifest
 *
 * @param {Object} manifest - The manifest
 * @returns {Array<string>} List of valid next states
 */
function getNextStates(manifest) {
  const currentState = manifest.metadata?.status;
  if (!currentState) {
    return [];
  }

  return TRANSITIONS[currentState] || [];
}

/**
 * Check if manifest is in a terminal state
 *
 * @param {Object} manifest - The manifest
 * @returns {boolean} True if in terminal state
 */
function isTerminalState(manifest) {
  const currentState = manifest.metadata?.status;
  return currentState === STATES.DEPRECATED;
}

module.exports = {
  STATES,
  TRANSITIONS,
  StateTransitionError,
  isValidTransition,
  transition,
  approve,
  revertToDraft,
  deprecate,
  getNextStates,
  isTerminalState
};
