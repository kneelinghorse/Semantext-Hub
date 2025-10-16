/**
 * Progress Tracker - Hierarchical progress tracking with correlation IDs
 * Performance target: <2ms per event overhead
 */

import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';

/**
 * Generate W3C-compliant trace ID (16 bytes, 32 hex chars)
 * Performance target: <1ms
 */
export function generateTraceId() {
  const start = Date.now();
  const traceId = randomBytes(16).toString('hex');
  const elapsed = Date.now() - start;

  if (elapsed > 1) {
    console.warn(`[PERF] generateTraceId exceeded 1ms target: ${elapsed}ms`);
  }

  return traceId;
}

/**
 * Generate W3C-compliant span ID (8 bytes, 16 hex chars)
 */
export function generateSpanId() {
  return randomBytes(8).toString('hex');
}

/**
 * Progress status enumeration
 */
export const ProgressStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
};

/**
 * ProgressTracker - Manages progress for long-running operations
 * with throttling and hierarchical tracking
 */
export class ProgressTracker extends EventEmitter {
  constructor(options = {}) {
    super();

    this.taskId = options.taskId || generateTraceId();
    this.correlationId = options.correlationId || generateTraceId();
    this.spanId = options.spanId || generateSpanId();

    // Throttling configuration (default: emit at most once per 100ms)
    this.throttleMs = options.throttleMs || 100;
    this.lastEmitTime = 0;
    this.pendingUpdate = null;

    // Progress state
    this.status = ProgressStatus.PENDING;
    this.progress = {
      percent: 0,
      currentStep: 0,
      totalSteps: options.totalSteps || 100,
      description: ''
    };

    this.verbose = options.verbose || false;
    this.startTime = Date.now();
    this.endTime = null;

    // Child trackers for hierarchical operations
    this.children = new Map();
  }

  /**
   * Update progress with throttling
   * @param {object} update - Progress update
   */
  updateProgress(update) {
    const start = Date.now();

    // Merge update into current progress
    Object.assign(this.progress, update);

    // Calculate percent if not provided
    if (update.currentStep !== undefined && !update.percent) {
      this.progress.percent = (update.currentStep / this.progress.totalSteps) * 100;
    }

    // Throttle emissions
    const now = Date.now();
    const timeSinceLastEmit = now - this.lastEmitTime;

    if (timeSinceLastEmit < this.throttleMs) {
      // Store pending update, will emit on next window
      this.pendingUpdate = this._createProgressEvent();
    } else {
      // Emit immediately
      this._emitProgress();
      this.lastEmitTime = now;
      this.pendingUpdate = null;
    }

    const elapsed = Date.now() - start;

    // Performance assertion
    if (this.verbose && elapsed > 2) {
      console.warn(`[PERF] updateProgress exceeded 2ms target: ${elapsed}ms`);
    }
  }

  /**
   * Force emit pending update (flush throttle)
   */
  flush() {
    if (this.pendingUpdate) {
      this.emit('progress', this.pendingUpdate);
      this.lastEmitTime = Date.now();
      this.pendingUpdate = null;
    }
  }

  /**
   * Start the operation
   * @param {string} description - Initial description
   */
  start(description = '') {
    this.status = ProgressStatus.IN_PROGRESS;
    this.progress.description = description;
    this.startTime = Date.now();
    this._emitProgress();
  }

  /**
   * Complete the operation
   * @param {string} resultUrl - URL to result
   */
  complete(resultUrl = null) {
    this.status = ProgressStatus.COMPLETED;
    this.progress.percent = 100;
    this.endTime = Date.now();

    const event = this._createProgressEvent();
    if (resultUrl) {
      event.resultUrl = resultUrl;
    }

    this.emit('progress', event);
    this.emit('completed', event);
  }

  /**
   * Fail the operation
   * @param {object} error - Error object
   */
  fail(error) {
    this.status = ProgressStatus.FAILED;
    this.endTime = Date.now();

    const event = this._createProgressEvent();
    event.error = error;

    this.emit('progress', event);
    this.emit('failed', event);
  }

  /**
   * Create a child tracker for sub-operations
   * @param {string} childId - Child identifier
   * @param {object} options - Child options
   * @returns {ProgressTracker} Child tracker
   */
  createChild(childId, options = {}) {
    const child = new ProgressTracker({
      taskId: childId,
      correlationId: this.correlationId,
      spanId: generateSpanId(),
      throttleMs: this.throttleMs,
      verbose: this.verbose,
      ...options
    });

    this.children.set(childId, child);

    // Bubble up child events
    child.on('progress', (event) => {
      this.emit('child-progress', { childId, event });
    });

    return child;
  }

  /**
   * Get overall progress including children
   * @returns {number} Aggregate progress percentage
   */
  getAggregateProgress() {
    if (this.children.size === 0) {
      return this.progress.percent;
    }

    let totalProgress = this.progress.percent;
    for (const child of this.children.values()) {
      totalProgress += child.getAggregateProgress();
    }

    return totalProgress / (this.children.size + 1);
  }

  /**
   * Get elapsed time in milliseconds
   * @returns {number} Elapsed time
   */
  getElapsedTime() {
    const end = this.endTime || Date.now();
    return end - this.startTime;
  }

  /**
   * Create progress event object
   * @private
   */
  _createProgressEvent() {
    return {
      taskId: this.taskId,
      correlationId: this.correlationId,
      spanId: this.spanId,
      status: this.status,
      timestamp: new Date().toISOString(),
      progress: { ...this.progress },
      elapsedMs: this.getElapsedTime()
    };
  }

  /**
   * Emit progress event
   * @private
   */
  _emitProgress() {
    const event = this._createProgressEvent();
    this.emit('progress', event);
  }
}

/**
 * ProgressAggregator - Collects and manages multiple progress trackers
 */
export class ProgressAggregator {
  constructor(options = {}) {
    this.trackers = new Map();
    this.verbose = options.verbose || false;
  }

  /**
   * Create or get a progress tracker
   * @param {string} taskId - Task identifier
   * @param {object} options - Tracker options
   * @returns {ProgressTracker} Progress tracker
   */
  getTracker(taskId, options = {}) {
    if (!this.trackers.has(taskId)) {
      const tracker = new ProgressTracker({
        taskId,
        verbose: this.verbose,
        ...options
      });

      this.trackers.set(taskId, tracker);

      // Auto-cleanup on completion or failure
      tracker.once('completed', () => this._scheduleCleanup(taskId));
      tracker.once('failed', () => this._scheduleCleanup(taskId));
    }

    return this.trackers.get(taskId);
  }

  /**
   * Get all active trackers
   * @returns {Array} Active trackers
   */
  getActiveTrackers() {
    return Array.from(this.trackers.values()).filter(
      t => t.status === ProgressStatus.IN_PROGRESS
    );
  }

  /**
   * Get tracker summary
   * @returns {object} Summary statistics
   */
  getSummary() {
    const trackers = Array.from(this.trackers.values());

    return {
      total: trackers.length,
      pending: trackers.filter(t => t.status === ProgressStatus.PENDING).length,
      inProgress: trackers.filter(t => t.status === ProgressStatus.IN_PROGRESS).length,
      completed: trackers.filter(t => t.status === ProgressStatus.COMPLETED).length,
      failed: trackers.filter(t => t.status === ProgressStatus.FAILED).length
    };
  }

  /**
   * Schedule cleanup of completed tracker (TTL: 5 minutes)
   * @private
   */
  _scheduleCleanup(taskId) {
    const timeout = setTimeout(() => {
      this.trackers.delete(taskId);
    }, 5 * 60 * 1000); // 5 minutes

    // Ensure the cleanup timer does not hold the event loop open in CI/test environments.
    if (typeof timeout.unref === 'function') {
      timeout.unref();
    }
  }
}

export default {
  ProgressTracker,
  ProgressAggregator,
  ProgressStatus,
  generateTraceId,
  generateSpanId
};
