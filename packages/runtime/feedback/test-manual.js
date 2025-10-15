#!/usr/bin/env node

/**
 * Manual Test Runner for Feedback System
 * Validates core functionality and performance targets
 */

import {
  FeedbackFormatter,
  FeedbackAggregator,
  ErrorCodes,
  ProgressTracker,
  generateTraceId,
  generateSpanId,
  isRetryable,
  getRecoveryPattern
} from './index.js';

console.log('🧪 Feedback System Manual Tests\n');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ ${message}`);
    passed++;
  } else {
    console.log(`❌ ${message}`);
    failed++;
  }
}

function assertLessThan(value, threshold, message) {
  if (value < threshold) {
    console.log(`✅ ${message} (${value.toFixed(2)}ms < ${threshold}ms)`);
    passed++;
  } else {
    console.log(`❌ ${message} (${value.toFixed(2)}ms >= ${threshold}ms)`);
    failed++;
  }
}

// Test 1: Error Formatting
console.log('📝 Test: Error Formatting');
const formatter = new FeedbackFormatter({ serviceName: 'test' });
const error = formatter.formatError(ErrorCodes.INVALID_PARAMETER, {
  detail: 'Test error',
  details: { field: 'test' },
  correlationId: 'trace-123'
});

assert(error.code === 40001, 'Error code is correct');
assert(error.category === 'CLIENT_ERROR', 'Error category is correct');
assert(error.message === 'Invalid parameter provided', 'Error message is correct');
assert(error.detail === 'Test error', 'Error detail is correct');
assert(error.correlationId === 'trace-123', 'Correlation ID is set');
assert(error.suggestedFix !== undefined, 'Suggested fix is provided');
console.log();

// Test 2: Error Formatting Performance
console.log('⚡ Test: Error Formatting Performance (<5ms target)');
const iterations = 100;
const start1 = Date.now();
for (let i = 0; i < iterations; i++) {
  formatter.formatError(ErrorCodes.INVALID_PARAMETER, { detail: `Test ${i}` });
}
const elapsed1 = (Date.now() - start1) / iterations;
assertLessThan(elapsed1, 5, 'Error formatting meets performance target');
console.log();

// Test 3: Progress Tracker
console.log('📊 Test: Progress Tracker');
const tracker = new ProgressTracker({
  taskId: 'test-task',
  totalSteps: 10
});

let progressCount = 0;
tracker.on('progress', () => progressCount++);

tracker.start('Test operation');
assert(tracker.status === 'IN_PROGRESS', 'Tracker status is IN_PROGRESS');

tracker.updateProgress({ currentStep: 5 });
tracker.flush();
assert(tracker.progress.percent === 50, 'Progress calculation is correct');

tracker.complete('http://result.url');
assert(tracker.status === 'COMPLETED', 'Tracker status is COMPLETED');
assert(progressCount >= 2, 'Progress events were emitted');
console.log();

// Test 4: Progress Performance
console.log('⚡ Test: Progress Tracking Performance (<2ms target)');
const tracker2 = new ProgressTracker({ taskId: 'perf-test' });
const start2 = Date.now();
for (let i = 0; i < 100; i++) {
  tracker2.updateProgress({ currentStep: i, description: `Step ${i}` });
}
const elapsed2 = (Date.now() - start2) / 100;
assertLessThan(elapsed2, 2, 'Progress tracking meets performance target');
console.log();

// Test 5: Correlation ID Generation
console.log('🔗 Test: Correlation ID Generation');
const traceId = generateTraceId();
const spanId = generateSpanId();

assert(traceId.length === 32, 'Trace ID has correct length (32 hex chars)');
assert(spanId.length === 16, 'Span ID has correct length (16 hex chars)');
assert(/^[0-9a-f]+$/.test(traceId), 'Trace ID is valid hex');
assert(/^[0-9a-f]+$/.test(spanId), 'Span ID is valid hex');
console.log();

// Test 6: Correlation ID Performance
console.log('⚡ Test: Correlation ID Generation Performance (<1ms target)');
const start3 = Date.now();
for (let i = 0; i < 100; i++) {
  generateTraceId();
}
const elapsed3 = (Date.now() - start3) / 100;
assertLessThan(elapsed3, 1, 'Correlation ID generation meets performance target');
console.log();

// Test 7: Feedback Aggregator
console.log('📦 Test: Feedback Aggregator');
const aggregator = new FeedbackAggregator({ serviceName: 'test' });

aggregator.reportError(ErrorCodes.INVALID_PARAMETER, { detail: 'Error 1' });
aggregator.reportError(ErrorCodes.INTERNAL_ERROR, { detail: 'Error 2' });
aggregator.reportHint('TEST_HINT', 'Test hint', { severity: 'WARNING' });

const tracker3 = aggregator.getProgressTracker('task-1');
tracker3.start();

const summary = aggregator.getSummary();

assert(summary.errors.total === 2, 'Error count is correct');
assert(summary.errors.byCategory.client === 1, 'Client error count is correct');
assert(summary.errors.byCategory.server === 1, 'Server error count is correct');
assert(summary.hints.total === 1, 'Hint count is correct');
assert(summary.progress.inProgress === 1, 'Active tracker count is correct');
console.log();

// Test 8: Error Code Utilities
console.log('🔧 Test: Error Code Utilities');
assert(isRetryable(50000) === true, 'Server errors are retryable');
assert(isRetryable(40001) === false, 'Client errors are not retryable');
assert(getRecoveryPattern(40001) === 'FAIL_FAST', 'Client error recovery pattern is FAIL_FAST');
assert(getRecoveryPattern(50000) === 'RETRY_WITH_BACKOFF', 'Server error recovery pattern is RETRY_WITH_BACKOFF');
assert(getRecoveryPattern(60001) === 'HANDLE_IN_APP_LOGIC', 'Business error recovery pattern is HANDLE_IN_APP_LOGIC');
console.log();

// Test 9: Filtering
console.log('🔍 Test: Filtering');
aggregator.clear();
aggregator.reportError(ErrorCodes.INVALID_PARAMETER, { correlationId: 'trace-abc' });
aggregator.reportError(ErrorCodes.INTERNAL_ERROR, { correlationId: 'trace-abc' });
aggregator.reportError(ErrorCodes.QUOTA_EXCEEDED, { correlationId: 'trace-xyz' });

const clientErrors = aggregator.getErrors({ category: 'CLIENT_ERROR' });
const trace = aggregator.getTrace('trace-abc');

assert(clientErrors.length === 1, 'Category filter works');
assert(trace.errors.length === 2, 'Trace correlation works');
console.log();

// Test 10: Hint System
console.log('💡 Test: Hint System');
const hint = formatter.formatHint('WORKFLOW_HINT', 'Check workflow schema', {
  severity: 'WARNING',
  context: { workflow: 'test-workflow' },
  documentationUrl: 'https://docs.example.com'
});

assert(hint.code === 'WORKFLOW_HINT', 'Hint code is correct');
assert(hint.message === 'Check workflow schema', 'Hint message is correct');
assert(hint.severity === 'WARNING', 'Hint severity is correct');
assert(hint.documentationUrl === 'https://docs.example.com', 'Documentation URL is set');
console.log();

// Summary
console.log('═'.repeat(50));
console.log(`\n📊 Test Summary:`);
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   📈 Total:  ${passed + failed}`);

if (failed === 0) {
  console.log('\n🎉 All tests passed!\n');
  process.exit(0);
} else {
  console.log(`\n⚠️  ${failed} test(s) failed\n`);
  process.exit(1);
}
