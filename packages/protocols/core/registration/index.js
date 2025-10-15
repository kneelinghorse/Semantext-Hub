/**
 * Registration Pipeline Module - Barrel Exports
 *
 * @module core/registration
 */

const RegistrationPipeline = require('./registration-pipeline');
const {
  STATES,
  EVENTS,
  TRANSITIONS,
  isValidState,
  isValidEvent,
  canTransition,
  getInitialState,
  isTerminalState
} = require('./state-machine-definition');
const {
  OptimisticLockException,
  DEFAULT_RETRY_CONFIG
} = require('./optimistic-lock');
const {
  EVENT_TYPES,
  createEvent,
  createStateTransitionEvent
} = require('./event-sourcing');
const {
  DEFAULT_BASE_DIR,
  getManifestDir,
  deleteManifestState
} = require('./file-persistence');

module.exports = {
  // Main class
  RegistrationPipeline,

  // State machine
  STATES,
  EVENTS,
  TRANSITIONS,
  isValidState,
  isValidEvent,
  canTransition,
  getInitialState,
  isTerminalState,

  // Optimistic locking
  OptimisticLockException,
  DEFAULT_RETRY_CONFIG,

  // Event sourcing
  EVENT_TYPES,
  createEvent,
  createStateTransitionEvent,

  // File persistence
  DEFAULT_BASE_DIR,
  getManifestDir,
  deleteManifestState
};
