/**
 * File-Based State Persistence
 *
 * Implements dual-file persistence strategy:
 * - state.json: Snapshot of latest state (for fast rehydration)
 * - events.log: Append-only event log (for recovery and audit)
 *
 * Directory structure:
 * /var/lib/protocol-manager/resources/{manifest-id}/
 *   ├── state.json
 *   └── events.log
 *
 * @module core/registration/file-persistence
 */

const path = require('path');
const {
  writeJsonAtomic,
  readJsonSafe,
  fileExists,
  ensureDir
} = require('./atomic-writer');
const { createVersionedState } = require('./optimistic-lock');
const { recoverStateFromEvents, appendEvent } = require('./event-sourcing');

/**
 * Default base directory for state persistence
 */
const DEFAULT_BASE_DIR = path.join(
  process.env.STATE_BASE_DIR || '/tmp',
  'protocol-manager',
  'resources'
);

/**
 * File names for state persistence
 */
const STATE_SNAPSHOT_FILE = 'state.json';
const EVENT_LOG_FILE = 'events.log';

/**
 * Get the directory path for a manifest
 *
 * @param {string} manifestId - Manifest identifier
 * @param {string} baseDir - Base directory (optional)
 * @returns {string} Directory path
 */
function getManifestDir(manifestId, baseDir = DEFAULT_BASE_DIR) {
  if (!manifestId) {
    throw new Error('manifestId is required');
  }

  return path.join(baseDir, manifestId);
}

/**
 * Get the path to the state snapshot file
 *
 * @param {string} manifestId - Manifest identifier
 * @param {string} baseDir - Base directory (optional)
 * @returns {string} Path to state.json
 */
function getStateSnapshotPath(manifestId, baseDir = DEFAULT_BASE_DIR) {
  return path.join(getManifestDir(manifestId, baseDir), STATE_SNAPSHOT_FILE);
}

/**
 * Get the path to the event log file
 *
 * @param {string} manifestId - Manifest identifier
 * @param {string} baseDir - Base directory (optional)
 * @returns {string} Path to events.log
 */
function getEventLogPath(manifestId, baseDir = DEFAULT_BASE_DIR) {
  return path.join(getManifestDir(manifestId, baseDir), EVENT_LOG_FILE);
}

/**
 * Ensure manifest directory exists
 *
 * @param {string} manifestId - Manifest identifier
 * @param {string} baseDir - Base directory (optional)
 * @returns {Promise<void>}
 */
async function ensureManifestDir(manifestId, baseDir = DEFAULT_BASE_DIR) {
  const manifestDir = getManifestDir(manifestId, baseDir);
  await ensureDir(manifestDir);
}

/**
 * Save state snapshot to disk
 *
 * @param {string} manifestId - Manifest identifier
 * @param {Object} versionedState - Versioned state object
 * @param {string} baseDir - Base directory (optional)
 * @returns {Promise<void>}
 */
async function saveStateSnapshot(manifestId, versionedState, baseDir = DEFAULT_BASE_DIR) {
  await ensureManifestDir(manifestId, baseDir);
  const snapshotPath = getStateSnapshotPath(manifestId, baseDir);
  await writeJsonAtomic(snapshotPath, versionedState);
}

/**
 * Load state snapshot from disk
 *
 * @param {string} manifestId - Manifest identifier
 * @param {string} baseDir - Base directory (optional)
 * @returns {Promise<Object|null>} Versioned state or null if not found
 */
async function loadStateSnapshot(manifestId, baseDir = DEFAULT_BASE_DIR) {
  const snapshotPath = getStateSnapshotPath(manifestId, baseDir);
  const exists = await fileExists(snapshotPath);

  if (!exists) {
    return null;
  }

  try {
    return await readJsonSafe(snapshotPath);
  } catch (error) {
    throw new Error(`Failed to load state snapshot for ${manifestId}: ${error.message}`);
  }
}

/**
 * Append an event to the event log
 *
 * @param {string} manifestId - Manifest identifier
 * @param {Object} event - Event to append
 * @param {string} baseDir - Base directory (optional)
 * @returns {Promise<void>}
 */
async function appendEventToLog(manifestId, event, baseDir = DEFAULT_BASE_DIR) {
  await ensureManifestDir(manifestId, baseDir);
  const eventLogPath = getEventLogPath(manifestId, baseDir);
  await appendEvent(eventLogPath, event);
}

/**
 * Recover state from event log (fallback when snapshot is corrupted)
 *
 * @param {string} manifestId - Manifest identifier
 * @param {Object} initialState - Initial state to start from
 * @param {string} baseDir - Base directory (optional)
 * @returns {Promise<Object>} Recovered state
 */
async function recoverFromEventLog(manifestId, initialState, baseDir = DEFAULT_BASE_DIR) {
  const eventLogPath = getEventLogPath(manifestId, baseDir);
  const recoveredState = await recoverStateFromEvents(eventLogPath, initialState);

  // Recovered state doesn't have version - add it
  return createVersionedState(recoveredState, 1);
}

/**
 * Load state with fallback to event log recovery
 *
 * Strategy:
 * 1. Try to load from state.json
 * 2. If missing or corrupted, recover from events.log
 * 3. If both fail, return null (new resource)
 *
 * @param {string} manifestId - Manifest identifier
 * @param {Object} initialState - Initial state for recovery
 * @param {string} baseDir - Base directory (optional)
 * @returns {Promise<Object|null>} Versioned state or null
 */
async function loadStateWithRecovery(manifestId, initialState, baseDir = DEFAULT_BASE_DIR) {
  try {
    // First, try to load snapshot
    const snapshot = await loadStateSnapshot(manifestId, baseDir);
    if (snapshot) {
      return snapshot;
    }

    // No snapshot - try recovery from event log
    console.log(`[Persistence] No snapshot found for ${manifestId}, attempting event log recovery...`);
    const recovered = await recoverFromEventLog(manifestId, initialState, baseDir);

    // Check if recovered state has actual data (not just empty initial state)
    if (recovered && recovered.state && recovered.state.currentState) {
      console.log(`[Persistence] Successfully recovered state for ${manifestId} from event log`);
      // Save recovered state as new snapshot
      await saveStateSnapshot(manifestId, recovered, baseDir);
      return recovered;
    }

    // No snapshot and no meaningful event log - this is a new resource
    console.log(`[Persistence] No existing state found for ${manifestId}, treating as new resource`);
    return null;

  } catch (error) {
    // If snapshot load fails but event log exists, try recovery
    if (error.message.includes('JSON parse failed')) {
      console.log(`[Persistence] Corrupted snapshot for ${manifestId}, attempting recovery...`);
      try {
        const recovered = await recoverFromEventLog(manifestId, initialState, baseDir);
        console.log(`[Persistence] Successfully recovered state for ${manifestId} from event log`);
        // Save recovered state as new snapshot
        await saveStateSnapshot(manifestId, recovered, baseDir);
        return recovered;
      } catch (recoveryError) {
        throw new Error(`Failed to recover state for ${manifestId}: ${recoveryError.message}`);
      }
    }

    throw error;
  }
}

/**
 * Delete all state files for a manifest (cleanup)
 *
 * @param {string} manifestId - Manifest identifier
 * @param {string} baseDir - Base directory (optional)
 * @returns {Promise<void>}
 */
async function deleteManifestState(manifestId, baseDir = DEFAULT_BASE_DIR) {
  const fs = require('fs').promises;
  const manifestDir = getManifestDir(manifestId, baseDir);

  try {
    await fs.rm(manifestDir, { recursive: true, force: true });
  } catch (error) {
    throw new Error(`Failed to delete state for ${manifestId}: ${error.message}`);
  }
}

module.exports = {
  DEFAULT_BASE_DIR,
  STATE_SNAPSHOT_FILE,
  EVENT_LOG_FILE,
  getManifestDir,
  getStateSnapshotPath,
  getEventLogPath,
  ensureManifestDir,
  saveStateSnapshot,
  loadStateSnapshot,
  appendEventToLog,
  recoverFromEventLog,
  loadStateWithRecovery,
  deleteManifestState
};
