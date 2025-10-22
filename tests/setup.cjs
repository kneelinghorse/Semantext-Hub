/**
 * Jest Setup File (CommonJS)
 *
 * Mission B9.1: Performance Optimization & Hardening
 *
 * Configures Jest for optimal CI performance and provides
 * compatibility shims for ESM/CJS mixed tests.
 */

const path = require('path');
const { createRequire } = require('module');
const { jest: jestGlobals, expect } = require('@jest/globals');

// Ensure global jest is available in ESM tests
global.jest = global.jest || jestGlobals;

// Provide a require() bridge for tests using CommonJS style under ESM
const localRequire = createRequire(path.join(process.cwd(), 'tests', 'setup.cjs'));
global.require = global.require || localRequire;

// Set test timeout
jestGlobals.setTimeout(30000);

// Mock console methods in tests to reduce noise
global.console = {
  ...console,
  log: jestGlobals.fn(),
  debug: jestGlobals.fn(),
  info: jestGlobals.fn(),
};

// Performance monitoring for tests
const nativePerformanceNow = performance.now.bind(performance);
const originalPerformance = global.performance;
let testStartTime;
let performancePatched = false;

function assignPerformanceNow(fn) {
  try {
    performance.now = fn;
    performancePatched = true;
    return;
  } catch {
    // Ignore and fall through to defineProperty.
  }

  try {
    Object.defineProperty(performance, 'now', {
      value: fn,
      configurable: true,
      writable: true,
    });
    performancePatched = true;
    return;
  } catch {
    // Ignore and fall through to object replacement.
  }

  const replacement = Object.assign(
    Object.create(Object.getPrototypeOf(originalPerformance)),
    originalPerformance,
    { now: fn },
  );

  global.performance = replacement;
  performancePatched = true;
}

function resetPerformanceNow() {
  if (!performancePatched) {
    return;
  }

  global.performance = originalPerformance;

  try {
    Object.defineProperty(originalPerformance, 'now', {
      value: nativePerformanceNow,
      configurable: true,
      writable: true,
    });
  } catch {
    try {
      originalPerformance.now = nativePerformanceNow;
    } catch {
      // If restoring fails, rely on the original binding we captured.
    }
  }

  performancePatched = false;
}

beforeEach(() => {
  testStartTime = nativePerformanceNow();
});

afterEach(() => {
  const testDuration = nativePerformanceNow() - testStartTime;
  if (testDuration > 5000) {
    console.warn(
      `Slow test detected: ${expect.getState().currentTestName} took ${testDuration.toFixed(2)}ms`,
    );
  }
});

// Global test utilities
global.testUtils = {
  mockPerformanceNow: (mockTime = 0) => {
    let currentTime = mockTime;
    assignPerformanceNow(jestGlobals.fn(() => {
      currentTime += 1;
      return currentTime;
    }));
  },

  restorePerformanceNow: () => {
    resetPerformanceNow();
  },

  createMockMetrics: () => ({
    requests: { total: 0, successful: 0, failed: 0 },
    cache: { hits: 0, misses: 0, hitRatio: 0 },
    memory: { heapUsed: 0, heapTotal: 0 },
    discovery: { total: 0, cached: 0, latency: { p50: 0, p95: 0, p99: 0 } },
    mcp: { total: 0, cached: 0, latency: { p50: 0, p95: 0, p99: 0 } },
  }),
};

afterAll(() => {
  resetPerformanceNow();
});
