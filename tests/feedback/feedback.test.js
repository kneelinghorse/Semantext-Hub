/**
 * Feedback System Tests
 * Comprehensive tests for error formatting, progress tracking, and validation
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  FeedbackFormatter,
  FeedbackAggregator,
  validateFeedbackMessage,
  HintRegistry,
  ErrorCodes,
  getErrorByCode,
  isRetryable,
  getRecoveryPattern
} from '../../packages/runtime/feedback/index.js';
import {
  ProgressTracker,
  ProgressAggregator,
  ProgressStatus,
  generateTraceId,
  generateSpanId
} from '../../packages/runtime/feedback/progress.js';

describe('FeedbackFormatter', () => {
  let formatter;

  beforeEach(() => {
    formatter = new FeedbackFormatter({
      serviceName: 'test-service',
      verbose: false
    });
  });

  describe('formatError', () => {
    it('should format error with all required fields', () => {
      const error = formatter.formatError(ErrorCodes.INVALID_PARAMETER, {
        detail: 'Email format is invalid',
        details: { field: 'email', value: 'invalid' }
      });

      expect(error).toMatchObject({
        code: 40001,
        category: 'CLIENT_ERROR',
        message: 'Invalid parameter provided',
        type: 'https://ossp-agi.dev/errors/invalid-parameter',
        detail: 'Email format is invalid'
      });

      expect(error.details).toEqual({ field: 'email', value: 'invalid' });
      expect(error.timestamp).toBeDefined();
    });

    it('should include suggested fix', () => {
      const error = formatter.formatError(ErrorCodes.VALIDATION_FAILED);

      expect(error.suggestedFix).toBe('Review validation errors and correct the input');
    });

    it('should include correlation context', () => {
      const error = formatter.formatError(ErrorCodes.INTERNAL_ERROR, {
        correlationId: 'trace-123',
        spanId: 'span-456'
      });

      expect(error.correlationId).toBe('trace-123');
      expect(error.spanId).toBe('span-456');
    });

    it('should meet <5ms performance target', () => {
      const iterations = 100;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        formatter.formatError(ErrorCodes.INVALID_PARAMETER, {
          detail: 'Test error',
          details: { iteration: i }
        });
      }

      const elapsed = Date.now() - start;
      const avgTime = elapsed / iterations;

      expect(avgTime).toBeLessThan(5);
    });
  });

  describe('formatHint', () => {
    it('should format hint with all fields', () => {
      const hint = formatter.formatHint('TEST_HINT', 'This is a test hint', {
        severity: 'WARNING',
        context: { key: 'value' },
        documentationUrl: 'https://docs.example.com'
      });

      expect(hint).toMatchObject({
        code: 'TEST_HINT',
        message: 'This is a test hint',
        severity: 'WARNING',
        context: { key: 'value' },
        documentationUrl: 'https://docs.example.com'
      });
    });

    it('should default severity to INFO', () => {
      const hint = formatter.formatHint('TEST', 'Test');
      expect(hint.severity).toBe('INFO');
    });
  });

  describe('fromException', () => {
    it('should create error from JavaScript exception', () => {
      const exception = new Error('Test error');
      exception.name = 'TestError';

      const error = formatter.fromException(exception, ErrorCodes.INTERNAL_ERROR, {
        correlationId: 'trace-123'
      });

      expect(error.detail).toBe('Test error');
      expect(error.details.name).toBe('TestError');
      expect(error.correlationId).toBe('trace-123');
    });
  });
});

describe('ProgressTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new ProgressTracker({
      taskId: 'test-task',
      totalSteps: 10,
      throttleMs: 50
    });
  });

  it('should initialize with pending status', () => {
    expect(tracker.status).toBe(ProgressStatus.PENDING);
    expect(tracker.progress.percent).toBe(0);
  });

  it('should start operation', (done) => {
    tracker.on('progress', (event) => {
      expect(event.status).toBe(ProgressStatus.IN_PROGRESS);
      expect(event.progress.description).toBe('Starting test');
      done();
    });

    tracker.start('Starting test');
  });

  it('should update progress', (done) => {
    tracker.start();

    tracker.on('progress', (event) => {
      if (event.progress.currentStep === 5) {
        expect(event.progress.percent).toBe(50);
        done();
      }
    });

    tracker.updateProgress({
      currentStep: 5,
      description: 'Half way done'
    });

    tracker.flush(); // Force emit
  });

  it('should complete operation', (done) => {
    tracker.on('completed', (event) => {
      expect(event.status).toBe(ProgressStatus.COMPLETED);
      expect(event.progress.percent).toBe(100);
      expect(event.resultUrl).toBe('http://result.url');
      done();
    });

    tracker.complete('http://result.url');
  });

  it('should fail operation', (done) => {
    const error = { code: 50000, message: 'Test error' };

    tracker.on('failed', (event) => {
      expect(event.status).toBe(ProgressStatus.FAILED);
      expect(event.error).toEqual(error);
      done();
    });

    tracker.fail(error);
  });

  it('should throttle progress updates', (done) => {
    let emitCount = 0;

    tracker.on('progress', () => {
      emitCount++;
    });

    tracker.start();

    // Rapid updates (should be throttled)
    for (let i = 0; i < 10; i++) {
      tracker.updateProgress({ currentStep: i });
    }

    setTimeout(() => {
      tracker.flush();
      // Should have fewer emits than updates due to throttling
      expect(emitCount).toBeLessThan(10);
      done();
    }, 100);
  });

  it('should create child trackers', () => {
    const child = tracker.createChild('child-1', { totalSteps: 5 });

    expect(child.taskId).toBe('child-1');
    expect(child.correlationId).toBe(tracker.correlationId);
    expect(tracker.children.size).toBe(1);
  });

  it('should calculate aggregate progress', () => {
    tracker.updateProgress({ percent: 50 });

    const child1 = tracker.createChild('child-1');
    child1.updateProgress({ percent: 100 });

    const child2 = tracker.createChild('child-2');
    child2.updateProgress({ percent: 0 });

    const aggregateProgress = tracker.getAggregateProgress();
    expect(aggregateProgress).toBe(50); // (50 + 100 + 0) / 3
  });

  it('should meet <2ms performance target', () => {
    const iterations = 100;
    const start = Date.now();

    for (let i = 0; i < iterations; i++) {
      tracker.updateProgress({
        currentStep: i,
        description: `Step ${i}`
      });
    }

    const elapsed = Date.now() - start;
    const avgTime = elapsed / iterations;

    expect(avgTime).toBeLessThan(2);
  });
});

describe('ProgressAggregator', () => {
  let aggregator;

  beforeEach(() => {
    aggregator = new ProgressAggregator();
  });

  it('should create and track multiple trackers', () => {
    const tracker1 = aggregator.getTracker('task-1');
    const tracker2 = aggregator.getTracker('task-2');

    expect(aggregator.trackers.size).toBe(2);
    expect(tracker1.taskId).toBe('task-1');
    expect(tracker2.taskId).toBe('task-2');
  });

  it('should return existing tracker for same task ID', () => {
    const tracker1 = aggregator.getTracker('task-1');
    const tracker2 = aggregator.getTracker('task-1');

    expect(tracker1).toBe(tracker2);
    expect(aggregator.trackers.size).toBe(1);
  });

  it('should get active trackers', () => {
    const tracker1 = aggregator.getTracker('task-1');
    const tracker2 = aggregator.getTracker('task-2');
    const tracker3 = aggregator.getTracker('task-3');

    tracker1.start();
    tracker2.start();
    tracker3.complete();

    const active = aggregator.getActiveTrackers();
    expect(active.length).toBe(2);
  });

  it('should provide summary statistics', () => {
    const tracker1 = aggregator.getTracker('task-1');
    const tracker2 = aggregator.getTracker('task-2');
    const tracker3 = aggregator.getTracker('task-3');
    const tracker4 = aggregator.getTracker('task-4');

    tracker1.start();
    tracker2.start();
    tracker3.complete();
    tracker4.fail({ message: 'Test error' });

    const summary = aggregator.getSummary();

    expect(summary.total).toBe(4);
    expect(summary.inProgress).toBe(2);
    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(1);
  });
});

describe('Error Codes', () => {
  it('should get error by code', () => {
    const error = getErrorByCode(40001);

    expect(error).toBeDefined();
    expect(error.code).toBe(40001);
    expect(error.category).toBe('CLIENT_ERROR');
  });

  it('should identify retryable errors', () => {
    expect(isRetryable(50000)).toBe(true);  // Server error
    expect(isRetryable(40001)).toBe(false); // Client error
    expect(isRetryable(60001)).toBe(false); // Business logic
  });

  it('should get recovery pattern', () => {
    expect(getRecoveryPattern(40001)).toBe('FAIL_FAST');
    expect(getRecoveryPattern(50000)).toBe('RETRY_WITH_BACKOFF');
    expect(getRecoveryPattern(60001)).toBe('HANDLE_IN_APP_LOGIC');
  });
});

describe('FeedbackAggregator', () => {
  let aggregator;

  beforeEach(() => {
    aggregator = new FeedbackAggregator({
      serviceName: 'test-service'
    });
  });

  it('should report and store errors', () => {
    const error = aggregator.reportError(ErrorCodes.INVALID_PARAMETER, {
      detail: 'Test error'
    });

    expect(error.code).toBe(40001);
    expect(aggregator.errors.length).toBe(1);
  });

  it('should report and store hints', () => {
    const hint = aggregator.reportHint('TEST_HINT', 'Test message', {
      severity: 'WARNING'
    });

    expect(hint.code).toBe('TEST_HINT');
    expect(aggregator.hints.length).toBe(1);
  });

  it('should get or create progress trackers', () => {
    const tracker = aggregator.getProgressTracker('task-1');

    expect(tracker).toBeDefined();
    expect(tracker.taskId).toBe('task-1');
  });

  it('should filter errors by category', () => {
    aggregator.reportError(ErrorCodes.INVALID_PARAMETER);
    aggregator.reportError(ErrorCodes.INTERNAL_ERROR);
    aggregator.reportError(ErrorCodes.QUOTA_EXCEEDED);

    const clientErrors = aggregator.getErrors({ category: 'CLIENT_ERROR' });
    expect(clientErrors.length).toBe(1);

    const serverErrors = aggregator.getErrors({ category: 'SERVER_ERROR' });
    expect(serverErrors.length).toBe(1);
  });

  it('should filter hints by severity', () => {
    aggregator.reportHint('H1', 'Info', { severity: 'INFO' });
    aggregator.reportHint('H2', 'Warning', { severity: 'WARNING' });
    aggregator.reportHint('H3', 'Error', { severity: 'ERROR' });

    const warnings = aggregator.getHints({ severity: 'WARNING' });
    expect(warnings.length).toBe(1);
  });

  it('should provide comprehensive summary', () => {
    aggregator.reportError(ErrorCodes.INVALID_PARAMETER);
    aggregator.reportError(ErrorCodes.INTERNAL_ERROR);
    aggregator.reportHint('H1', 'Test', { severity: 'WARNING' });

    const tracker = aggregator.getProgressTracker('task-1');
    tracker.start();

    const summary = aggregator.getSummary();

    expect(summary.errors.total).toBe(2);
    expect(summary.errors.byCategory.client).toBe(1);
    expect(summary.errors.byCategory.server).toBe(1);
    expect(summary.hints.total).toBe(1);
    expect(summary.progress.inProgress).toBe(1);
  });

  it('should trace by correlation ID', () => {
    const correlationId = 'trace-123';

    aggregator.reportError(ErrorCodes.INTERNAL_ERROR, {
      correlationId,
      detail: 'Test error'
    });

    aggregator.reportHint('TEST', 'Test hint', {
      context: { correlationId }
    });

    const trace = aggregator.getTrace(correlationId);

    expect(trace.correlationId).toBe(correlationId);
    expect(trace.errors.length).toBe(1);
    expect(trace.hints.length).toBe(1);
  });

  it('should enforce max stored messages', () => {
    const smallAggregator = new FeedbackAggregator({
      maxStoredMessages: 5
    });

    for (let i = 0; i < 10; i++) {
      smallAggregator.reportError(ErrorCodes.INVALID_PARAMETER);
    }

    expect(smallAggregator.errors.length).toBe(5);
  });

  it('should clear all feedback', () => {
    aggregator.reportError(ErrorCodes.INVALID_PARAMETER);
    aggregator.reportHint('TEST', 'Test');

    expect(aggregator.errors.length).toBe(1);
    expect(aggregator.hints.length).toBe(1);

    aggregator.clear();

    expect(aggregator.errors.length).toBe(0);
    expect(aggregator.hints.length).toBe(0);
  });
});

describe('Correlation IDs', () => {
  it('should generate W3C-compliant trace ID (32 hex chars)', () => {
    const traceId = generateTraceId();

    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('should generate W3C-compliant span ID (16 hex chars)', () => {
    const spanId = generateSpanId();

    expect(spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('should generate unique IDs', () => {
    const ids = new Set();

    for (let i = 0; i < 100; i++) {
      ids.add(generateTraceId());
    }

    expect(ids.size).toBe(100);
  });

  it('should meet <1ms generation target', () => {
    const iterations = 100;
    const start = Date.now();

    for (let i = 0; i < iterations; i++) {
      generateTraceId();
    }

    const elapsed = Date.now() - start;
    const avgTime = elapsed / iterations;

    expect(avgTime).toBeLessThan(1);
  });
});

describe('Schema Validation', () => {
  it('should validate correct feedback message', () => {
    const message = {
      type: 'error',
      timestamp: new Date().toISOString(),
      service: 'test-service',
      payload: {
        code: 40001,
        category: 'CLIENT_ERROR',
        message: 'Test error',
        type: 'https://ossp-agi.dev/errors/test'
      }
    };

    const result = validateFeedbackMessage(message);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject invalid feedback message', () => {
    const message = {
      type: 'invalid-type', // Invalid enum value
      timestamp: 'not-a-date',
      payload: {}
    };

    const result = validateFeedbackMessage(message);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('HintRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new HintRegistry();
  });

  it('should register and retrieve hints', () => {
    const hint = {
      message: 'Test hint',
      severity: 'INFO'
    };

    registry.register('TEST_HINT', hint);

    const retrieved = registry.get('TEST_HINT');
    expect(retrieved).toEqual(hint);
  });

  it('should find hints by pattern', () => {
    registry.register('WORKFLOW_VALIDATION', { message: 'Workflow hint' });
    registry.register('WORKFLOW_EXECUTION', { message: 'Execution hint' });
    registry.register('PROTOCOL_PARSING', { message: 'Protocol hint' });

    const workflowHints = registry.findByPattern(/^WORKFLOW_/);
    expect(workflowHints.length).toBe(2);
  });
});
