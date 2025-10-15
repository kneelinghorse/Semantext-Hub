/**
 * Progress Tracker
 * Event-based progress tracking for parser operations
 *
 * Features:
 * - EventEmitter-based progress events
 * - Stage-based tracking
 * - Percentage progress calculation
 * - Detailed metadata per stage
 * - Optional progress callbacks
 */

import { EventEmitter } from 'eventemitter3';

/**
 * Parsing stages with weights for progress calculation
 */
const PARSER_STAGES = {
  initializing: { weight: 5, label: 'Initializing' },
  streaming: { weight: 15, label: 'Streaming spec' },
  validating: { weight: 10, label: 'Validating spec' },
  resolving_local_refs: { weight: 15, label: 'Resolving local references' },
  resolving_external_refs: { weight: 25, label: 'Resolving external references' },
  detecting_circular: { weight: 10, label: 'Detecting circular references' },
  extracting_endpoints: { weight: 10, label: 'Extracting endpoints' },
  extracting_schemas: { weight: 5, label: 'Extracting schemas' },
  generating_hash: { weight: 3, label: 'Generating hash' },
  converting_manifest: { weight: 2, label: 'Converting to manifest' },
  finalizing: { weight: 0, label: 'Finalizing' }
};

/**
 * Progress tracker with event emission
 */
class ProgressTracker extends EventEmitter {
  /**
   * Create a progress tracker
   * @param {Object} options - Tracking options
   * @param {Array<string>} options.stages - Custom stages (optional)
   * @param {boolean} options.enabled - Enable tracking (default: true)
   * @param {number} options.throttle - Throttle events (ms, default: 50)
   */
  constructor(options = {}) {
    super();

    this.options = {
      stages: options.stages || Object.keys(PARSER_STAGES),
      enabled: options.enabled !== false,
      throttle: options.throttle || 50,
      ...options
    };

    // State
    this.currentStage = null;
    this.currentStageIndex = 0;
    this.stageProgress = 0;
    this.metadata = {};
    this.startTime = null;
    this.stageStartTime = null;

    // Throttling
    this.lastEmit = 0;

    // Calculate total weight for progress calculation
    this.totalWeight = this.options.stages.reduce((sum, stage) => {
      return sum + (PARSER_STAGES[stage]?.weight || 0);
    }, 0);

    // Completed stages
    this.completedStages = new Set();
  }

  /**
   * Start tracking
   */
  start() {
    if (!this.options.enabled) return;

    this.startTime = Date.now();
    this.emit('start', {
      timestamp: new Date().toISOString(),
      totalStages: this.options.stages.length
    });
  }

  /**
   * Update progress for current stage
   * @param {string} stage - Current stage name
   * @param {number} progress - Progress percentage (0-100) within stage
   * @param {Object} metadata - Additional metadata
   */
  update(stage, progress = 0, metadata = {}) {
    if (!this.options.enabled) return;

    // Check if stage changed
    if (stage !== this.currentStage) {
      this._enterStage(stage);
    }

    this.stageProgress = Math.min(100, Math.max(0, progress));
    this.metadata = { ...this.metadata, ...metadata };

    // Calculate overall progress
    const overallProgress = this._calculateOverallProgress();

    // Throttle events
    const now = Date.now();
    if (now - this.lastEmit < this.options.throttle) {
      return;
    }
    this.lastEmit = now;

    // Emit progress event
    this.emit('progress', {
      stage,
      stageLabel: PARSER_STAGES[stage]?.label || stage,
      stageIndex: this.currentStageIndex,
      totalStages: this.options.stages.length,
      stageProgress: this.stageProgress,
      overallProgress,
      metadata: this.metadata,
      timestamp: new Date().toISOString(),
      elapsed: now - this.startTime
    });
  }

  /**
   * Mark current stage as complete
   * @param {string} stage - Stage to complete
   * @param {Object} metadata - Stage completion metadata
   */
  completeStage(stage, metadata = {}) {
    if (!this.options.enabled) return;

    this.completedStages.add(stage);

    const duration = this.stageStartTime
      ? Date.now() - this.stageStartTime
      : null;

    this.emit('stage-complete', {
      stage,
      stageLabel: PARSER_STAGES[stage]?.label || stage,
      stageIndex: this.currentStageIndex,
      totalStages: this.options.stages.length,
      metadata,
      duration,
      timestamp: new Date().toISOString()
    });

    // Update to 100% for this stage
    this.update(stage, 100, metadata);
  }

  /**
   * Complete all tracking
   * @param {Object} metadata - Final metadata
   */
  complete(metadata = {}) {
    if (!this.options.enabled) return;

    const duration = this.startTime
      ? Date.now() - this.startTime
      : null;

    this.emit('complete', {
      totalStages: this.options.stages.length,
      completedStages: this.completedStages.size,
      metadata,
      duration,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Report an error during tracking
   * @param {Error} error - Error that occurred
   * @param {Object} metadata - Error context
   */
  error(error, metadata = {}) {
    if (!this.options.enabled) return;

    this.emit('error', {
      stage: this.currentStage,
      error: {
        message: error.message,
        code: error.code,
        stack: error.stack
      },
      metadata,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get current progress summary
   * @returns {Object}
   */
  getSummary() {
    return {
      currentStage: this.currentStage,
      currentStageLabel: PARSER_STAGES[this.currentStage]?.label,
      stageProgress: this.stageProgress,
      overallProgress: this._calculateOverallProgress(),
      completedStages: this.completedStages.size,
      totalStages: this.options.stages.length,
      elapsed: this.startTime ? Date.now() - this.startTime : 0,
      metadata: this.metadata
    };
  }

  /**
   * Reset tracker state
   */
  reset() {
    this.currentStage = null;
    this.currentStageIndex = 0;
    this.stageProgress = 0;
    this.metadata = {};
    this.startTime = null;
    this.stageStartTime = null;
    this.completedStages.clear();
    this.lastEmit = 0;
  }

  // ==================== Private Methods ====================

  /**
   * Enter a new stage
   * @private
   */
  _enterStage(stage) {
    this.currentStage = stage;
    this.currentStageIndex = this.options.stages.indexOf(stage);
    this.stageProgress = 0;
    this.stageStartTime = Date.now();

    this.emit('stage-start', {
      stage,
      stageLabel: PARSER_STAGES[stage]?.label || stage,
      stageIndex: this.currentStageIndex,
      totalStages: this.options.stages.length,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Calculate overall progress percentage
   * @private
   * @returns {number} Progress percentage (0-100)
   */
  _calculateOverallProgress() {
    if (this.totalWeight === 0) {
      // Simple stage-based progress if no weights
      const completedProgress = (this.completedStages.size / this.options.stages.length) * 100;
      const currentStageProgress = this.currentStage
        ? (this.stageProgress / 100) * (1 / this.options.stages.length) * 100
        : 0;
      return Math.min(100, completedProgress + currentStageProgress);
    }

    // Weight-based progress calculation
    let completedWeight = 0;

    for (const stage of this.options.stages) {
      if (this.completedStages.has(stage)) {
        completedWeight += PARSER_STAGES[stage]?.weight || 0;
      }
    }

    // Add partial progress for current stage
    if (this.currentStage && !this.completedStages.has(this.currentStage)) {
      const stageWeight = PARSER_STAGES[this.currentStage]?.weight || 0;
      completedWeight += (stageWeight * this.stageProgress) / 100;
    }

    return Math.min(100, (completedWeight / this.totalWeight) * 100);
  }
}

/**
 * Create a simple callback-based progress handler
 * @param {Function} callback - Callback function (progressData) => void
 * @returns {ProgressTracker}
 */
function createCallbackTracker(callback) {
  const tracker = new ProgressTracker();

  tracker.on('progress', (data) => {
    callback(data);
  });

  return tracker;
}

/**
 * Create a console progress logger
 * @param {Object} options - Logger options
 * @returns {ProgressTracker}
 */
function createConsoleTracker(options = {}) {
  const tracker = new ProgressTracker(options);

  tracker.on('start', () => {
    console.log('🚀 Starting parser...');
  });

  tracker.on('progress', (data) => {
    const percent = data.overallProgress.toFixed(1);
    const bar = '█'.repeat(Math.floor(percent / 2)) + '░'.repeat(50 - Math.floor(percent / 2));
    process.stdout.write(`\r[${bar}] ${percent}% - ${data.stageLabel}`);
  });

  tracker.on('stage-complete', (data) => {
    const duration = data.duration ? ` (${data.duration}ms)` : '';
    console.log(`\n✓ ${data.stageLabel}${duration}`);
  });

  tracker.on('complete', (data) => {
    const duration = data.duration ? ` in ${(data.duration / 1000).toFixed(2)}s` : '';
    console.log(`\n✅ Parsing complete${duration}`);
  });

  tracker.on('error', (data) => {
    console.error(`\n❌ Error in ${data.stage}: ${data.error.message}`);
  });

  return tracker;
}

export {
  ProgressTracker,
  PARSER_STAGES,
  createCallbackTracker,
  createConsoleTracker
};
