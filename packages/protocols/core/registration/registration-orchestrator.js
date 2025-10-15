/**
 * Registration Orchestrator - Complete Integration Layer
 *
 * Orchestrates the full registration workflow by coordinating:
 * - RegistrationPipeline (state machine)
 * - RegistryWriter (catalog + graph updates)
 * - CatalogIndexAdapter (URN conflict checks)
 *
 * Implements the REGISTER transition hook that atomically:
 * 1. Validates URN conflicts
 * 2. Transitions state machine
 * 3. Updates catalog and graph
 * 4. Emits lifecycle events
 *
 * @module core/registration/registration-orchestrator
 */

import EventEmitter from 'eventemitter3';
import RegistrationPipeline from './registration-pipeline.js';
import { RegistryWriter } from './registry-writer.js';
import { CatalogIndexAdapter } from './adapters/catalog-index.js';
import { EVENTS, STATES } from './state-machine-definition.js';
import { createEvent, EVENT_TYPES } from './event-sourcing.js';
import { appendEventToLog } from './file-persistence.js';
import { URNCatalogIndex } from '../../src/catalog/index.js';

/**
 * Registration Orchestrator Class
 *
 * Coordinates complete registration lifecycle with integrated registry updates
 */
class RegistrationOrchestrator extends EventEmitter {
  /**
   * Create a new Registration Orchestrator
   *
   * @param {Object} options - Configuration options
   * @param {string} options.baseDir - Base directory for state persistence
   * @param {Object} options.catalogIndex - Catalog index instance
   * @param {Object} options.protocolGraph - Protocol graph instance
   * @param {Object} options.retryConfig - Retry configuration
   */
  constructor(options = {}) {
    super();

    this.baseDir = options.baseDir;

    // Initialize core components
    this.pipeline = new RegistrationPipeline({
      baseDir: options.baseDir,
      retryConfig: options.retryConfig
    });

    this.catalogAdapter = new CatalogIndexAdapter(
      options.catalogIndex || new URNCatalogIndex()
    );

    this.registryWriter = new RegistryWriter({
      catalogIndex: this.catalogAdapter.catalogIndex,
      protocolGraph: options.protocolGraph,
      baseDir: options.baseDir
    });

    // Forward events from pipeline
    this.pipeline.on('initialized', (data) => this.emit('initialized', data));
    this.pipeline.on('stateChange', (data) => this.emit('stateChange', data));

    // Forward events from registry writer
    this.registryWriter.on('registered', (data) => this.emit('catalogRegistered', data));
    this.registryWriter.on('error', (data) => this.emit('catalogError', data));
  }

  /**
   * Initialize a new manifest in DRAFT state
   *
   * @param {string} manifestId - Unique manifest identifier
   * @param {Object} manifest - Manifest data
   * @returns {Promise<Object>} Initial versioned state
   */
  async initialize(manifestId, manifest) {
    // Validate manifest structure
    const validation = this.catalogAdapter.validateManifest(manifest);
    if (!validation.valid) {
      throw new Error(`Manifest validation failed: ${validation.errors.join(', ')}`);
    }

    return await this.pipeline.initialize(manifestId, manifest);
  }

  /**
   * Submit manifest for review (DRAFT → REVIEWED)
   *
   * @param {string} manifestId - Manifest identifier
   * @returns {Promise<Object>} New versioned state
   */
  async submitForReview(manifestId) {
    return await this.pipeline.submitForReview(manifestId);
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
    return await this.pipeline.approve(manifestId, reviewer, reviewNotes);
  }

  /**
   * Reject manifest (REVIEWED|APPROVED → REJECTED)
   *
   * @param {string} manifestId - Manifest identifier
   * @param {string} rejectionReason - Reason for rejection
   * @returns {Promise<Object>} New versioned state
   */
  async reject(manifestId, rejectionReason) {
    return await this.pipeline.reject(manifestId, rejectionReason);
  }

  /**
   * Register manifest (APPROVED → REGISTERED)
   *
   * This is the key integration point that:
   * 1. Checks URN conflicts
   * 2. Transitions state machine
   * 3. Updates catalog and graph atomically
   * 4. Logs events
   *
   * @param {string} manifestId - Manifest identifier
   * @param {Object} options - Registration options
   * @param {boolean} options.skipConflictCheck - Skip URN conflict check (default: false)
   * @returns {Promise<Object>} Complete registration result
   */
  async register(manifestId, options = {}) {
    const operationStart = performance.now();

    try {
      // 1. Load current state
      const currentState = await this.pipeline.loadState(manifestId);
      if (!currentState) {
        throw new Error(`Manifest ${manifestId} not found`);
      }

      const manifest = currentState.state.manifest;

      // 2. URN conflict check (unless explicitly skipped)
      if (!options.skipConflictCheck) {
        const conflictCheck = this.catalogAdapter.checkConflict(manifest.urn);

        if (conflictCheck.conflict) {
          throw new Error(`URN conflict: ${conflictCheck.message}`);
        }
      }

      // 3. Transition state machine to REGISTERED
      const newState = await this.pipeline.register(manifestId, {
        urn: manifest.urn,
        conflictCheckPassed: true
      });

      // 4. Update catalog and graph (atomic operation)
      const registryResult = await this.registryWriter.register(
        manifestId,
        manifest,
        {
          approver: currentState.state.reviewer,
          approvedAt: currentState.state.updatedAt
        }
      );

      // 5. Log integration event
      await this._logIntegrationEvent(manifestId, manifest, {
        stateTransition: newState,
        registryUpdate: registryResult
      });

      const totalTime = performance.now() - operationStart;

      const result = {
        success: true,
        manifestId,
        urn: manifest.urn,
        state: newState,
        registry: registryResult,
        performance: {
          total: totalTime,
          stateTransition: newState.state.lastTransition?.timestamp,
          catalogWrite: registryResult.performance.catalogWrite,
          graphUpdate: registryResult.performance.graphUpdate
        }
      };

      // Emit integrated event
      this.emit('registered', result);

      return result;

    } catch (error) {
      // Log error event
      const errorEvent = createEvent(
        EVENT_TYPES.ERROR_OCCURRED,
        manifestId,
        {
          operation: 'register',
          error: error.message,
          stack: error.stack
        },
        {
          timestamp: new Date().toISOString()
        }
      );

      if (this.baseDir) {
        await appendEventToLog(manifestId, errorEvent, this.baseDir);
      }

      this.emit('error', {
        manifestId,
        operation: 'register',
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Revert to draft (REVIEWED|APPROVED|REJECTED → DRAFT)
   *
   * @param {string} manifestId - Manifest identifier
   * @returns {Promise<Object>} New versioned state
   */
  async revertToDraft(manifestId) {
    return await this.pipeline.revertToDraft(manifestId);
  }

  /**
   * Get current state for a manifest
   *
   * @param {string} manifestId - Manifest identifier
   * @returns {Promise<Object|null>} Versioned state or null
   */
  async loadState(manifestId) {
    return await this.pipeline.loadState(manifestId);
  }

  /**
   * Get current state value (without version info)
   *
   * @param {string} manifestId - Manifest identifier
   * @returns {Promise<string|null>} Current state or null
   */
  async getCurrentState(manifestId) {
    return await this.pipeline.getCurrentState(manifestId);
  }

  /**
   * Check if manifest can be registered
   *
   * Validates:
   * - Current state is APPROVED
   * - URN does not conflict
   * - Manifest structure is valid
   *
   * @param {string} manifestId - Manifest identifier
   * @returns {Promise<Object>} Registration eligibility result
   */
  async canRegister(manifestId) {
    const currentState = await this.pipeline.loadState(manifestId);

    if (!currentState) {
      return {
        allowed: false,
        reason: 'Manifest not found'
      };
    }

    // Check state is APPROVED
    if (currentState.state.currentState !== STATES.APPROVED) {
      return {
        allowed: false,
        reason: `Manifest must be in APPROVED state (current: ${currentState.state.currentState})`
      };
    }

    const manifest = currentState.state.manifest;

    // Check manifest validity
    const validation = this.catalogAdapter.validateManifest(manifest);
    if (!validation.valid) {
      return {
        allowed: false,
        reason: 'Manifest validation failed',
        errors: validation.errors
      };
    }

    // Check URN conflicts
    const conflictCheck = this.catalogAdapter.checkConflict(manifest.urn);
    if (conflictCheck.conflict) {
      return {
        allowed: false,
        reason: 'URN conflict detected',
        conflict: conflictCheck
      };
    }

    return {
      allowed: true,
      manifestId,
      urn: manifest.urn,
      currentState: currentState.state.currentState
    };
  }

  /**
   * List all manifests in a specific state
   *
   * NOTE: This requires state file scanning. In production, this would
   * be backed by an index or database query.
   *
   * @param {string} state - State to filter by
   * @returns {Promise<Array<Object>>} Array of manifests in state
   */
  async listByState(state) {
    // This is a placeholder - full implementation would require
    // directory scanning or a state index
    return [];
  }

  /**
   * Get comprehensive statistics
   *
   * @returns {Object} Statistics from all components
   */
  getStats() {
    return {
      registry: this.registryWriter.getStats(),
      catalog: this.catalogAdapter.getStats()
    };
  }

  /**
   * Log integration event
   *
   * @param {string} manifestId - Manifest identifier
   * @param {Object} manifest - Manifest data
   * @param {Object} details - Integration details
   * @returns {Promise<void>}
   * @private
   */
  async _logIntegrationEvent(manifestId, manifest, details) {
    const event = createEvent(
      'registration.integration.completed',
      manifestId,
      {
        urn: manifest.urn,
        type: manifest.type,
        namespace: manifest.namespace,
        stateVersion: details.stateTransition.version,
        catalogSize: this.catalogAdapter.size(),
        graphStats: details.registryUpdate.graph
      },
      {
        performance: {
          stateTransition: details.stateTransition.state.lastTransition?.timestamp,
          registryUpdate: details.registryUpdate.performance
        }
      }
    );

    if (this.baseDir) {
      await appendEventToLog(manifestId, event, this.baseDir);
    }
  }
}

export default RegistrationOrchestrator;
