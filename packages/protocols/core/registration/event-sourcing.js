/**
 * Event Sourcing for Registration Pipeline
 *
 * Implements append-only event log pattern for complete audit trail and recovery.
 * Events are persisted in JSON Lines format (one JSON object per line).
 *
 * Benefits:
 * - Complete audit trail of all state changes
 * - Recovery from corrupted state snapshots
 * - Temporal queries (reconstruct state at any point in time)
 * - Immutable event history
 *
 * @module core/registration/event-sourcing
 */

const { appendAtomic, readSafe, fileExists } = require('./atomic-writer');
const crypto = require('crypto');

/**
 * Event schema structure
 */
const EVENT_SCHEMA = {
  eventId: 'string (UUID)',
  timestamp: 'string (ISO 8601)',
  eventType: 'string',
  manifestId: 'string',
  payload: 'object',
  metadata: 'object (optional)'
};

/**
 * Event types for registration lifecycle
 */
const EVENT_TYPES = {
  STATE_CHANGED: 'registration.state.changed',
  MANIFEST_CREATED: 'registration.manifest.created',
  MANIFEST_UPDATED: 'registration.manifest.updated',
  REVIEW_SUBMITTED: 'registration.review.submitted',
  APPROVAL_GRANTED: 'registration.approval.granted',
  APPROVAL_REJECTED: 'registration.approval.rejected',
  REGISTRATION_COMPLETED: 'registration.completed',
  ERROR_OCCURRED: 'registration.error'
};

/**
 * Generate a unique event ID
 *
 * @returns {string} UUID v4
 */
function generateEventId() {
  return crypto.randomUUID();
}

/**
 * Create a structured event object
 *
 * @param {string} eventType - Event type
 * @param {string} manifestId - Manifest identifier
 * @param {Object} payload - Event payload data
 * @param {Object} metadata - Optional metadata
 * @returns {Object} Structured event
 */
function createEvent(eventType, manifestId, payload, metadata = {}) {
  if (!eventType || !manifestId) {
    throw new Error('eventType and manifestId are required');
  }

  return {
    eventId: generateEventId(),
    timestamp: new Date().toISOString(),
    eventType,
    manifestId,
    payload: payload || {},
    metadata
  };
}

/**
 * Create a state transition event
 *
 * @param {string} manifestId - Manifest identifier
 * @param {string} fromState - Previous state
 * @param {string} toState - New state
 * @param {string} triggeringEvent - Event that triggered transition
 * @param {Object} context - Additional context data
 * @returns {Object} State transition event
 */
function createStateTransitionEvent(manifestId, fromState, toState, triggeringEvent, context = {}) {
  return createEvent(
    EVENT_TYPES.STATE_CHANGED,
    manifestId,
    {
      fromState,
      toState,
      triggeringEvent,
      reviewer: context.reviewer,
      rejectionReason: context.rejectionReason,
      reviewNotes: context.reviewNotes
    },
    {
      urn: context.manifest?.urn,
      transitionDuration: context.transitionDuration
    }
  );
}

/**
 * Serialize event to JSON Lines format (one event per line)
 *
 * @param {Object} event - Event object
 * @returns {string} JSON string with newline
 */
function serializeEvent(event) {
  return JSON.stringify(event) + '\n';
}

/**
 * Parse events from JSON Lines format
 *
 * @param {string} jsonLines - JSON Lines string
 * @returns {Array<Object>} Array of parsed events
 */
function parseEvents(jsonLines) {
  if (!jsonLines || jsonLines.trim() === '') {
    return [];
  }

  const lines = jsonLines.trim().split('\n');
  const events = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;

    try {
      const event = JSON.parse(line);
      events.push(event);
    } catch (error) {
      throw new Error(`Failed to parse event at line ${i + 1}: ${error.message}`);
    }
  }

  return events;
}

/**
 * Append an event to the event log
 *
 * @param {string} eventLogPath - Path to events.log file
 * @param {Object} event - Event to append
 * @returns {Promise<void>}
 */
async function appendEvent(eventLogPath, event) {
  const serialized = serializeEvent(event);
  await appendAtomic(eventLogPath, serialized);
}

/**
 * Read all events from the event log
 *
 * @param {string} eventLogPath - Path to events.log file
 * @returns {Promise<Array<Object>>} Array of events in chronological order
 */
async function readEventLog(eventLogPath) {
  try {
    const exists = await fileExists(eventLogPath);
    if (!exists) {
      return [];
    }

    const jsonLines = await readSafe(eventLogPath);
    return parseEvents(jsonLines);
  } catch (error) {
    if (error.message.includes('File not found')) {
      return [];
    }
    throw new Error(`Failed to read event log ${eventLogPath}: ${error.message}`);
  }
}

/**
 * Replay events to reconstruct state
 *
 * @param {Array<Object>} events - Events to replay
 * @param {Function} applyEventFn - Function to apply event to state
 * @param {Object} initialState - Initial state to start from
 * @returns {Object} Reconstructed state
 */
function replayEvents(events, applyEventFn, initialState = {}) {
  let state = { ...initialState };

  for (const event of events) {
    try {
      state = applyEventFn(state, event);
    } catch (error) {
      throw new Error(`Failed to replay event ${event.eventId}: ${error.message}`);
    }
  }

  return state;
}

/**
 * Apply a state transition event to current state
 *
 * @param {Object} state - Current state
 * @param {Object} event - Event to apply
 * @returns {Object} New state
 */
function applyStateTransitionEvent(state, event) {
  if (event.eventType !== EVENT_TYPES.STATE_CHANGED) {
    // Ignore non-state-change events
    return state;
  }

  const { toState, reviewer, rejectionReason, reviewNotes } = event.payload;

  return {
    ...state,
    currentState: toState,
    lastTransitionAt: event.timestamp,
    lastTransitionEvent: event.eventId,
    reviewer: reviewer || state.reviewer,
    rejectionReason: rejectionReason || state.rejectionReason,
    reviewNotes: reviewNotes || state.reviewNotes
  };
}

/**
 * Recover state from event log
 *
 * @param {string} eventLogPath - Path to events.log file
 * @param {Object} initialState - Initial state
 * @returns {Promise<Object>} Recovered state
 */
async function recoverStateFromEvents(eventLogPath, initialState = {}) {
  const events = await readEventLog(eventLogPath);
  return replayEvents(events, applyStateTransitionEvent, initialState);
}

/**
 * Filter events by type
 *
 * @param {Array<Object>} events - Events to filter
 * @param {string|Array<string>} eventTypes - Event type(s) to include
 * @returns {Array<Object>} Filtered events
 */
function filterEventsByType(events, eventTypes) {
  const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
  return events.filter(event => types.includes(event.eventType));
}

/**
 * Filter events by time range
 *
 * @param {Array<Object>} events - Events to filter
 * @param {string} startTime - ISO 8601 start time (inclusive)
 * @param {string} endTime - ISO 8601 end time (inclusive)
 * @returns {Array<Object>} Filtered events
 */
function filterEventsByTimeRange(events, startTime, endTime) {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();

  return events.filter(event => {
    const eventTime = new Date(event.timestamp).getTime();
    return eventTime >= start && eventTime <= end;
  });
}

module.exports = {
  EVENT_SCHEMA,
  EVENT_TYPES,
  generateEventId,
  createEvent,
  createStateTransitionEvent,
  serializeEvent,
  parseEvents,
  appendEvent,
  readEventLog,
  replayEvents,
  applyStateTransitionEvent,
  recoverStateFromEvents,
  filterEventsByType,
  filterEventsByTimeRange
};
