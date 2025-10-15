/**
 * Jest Setup File
 *
 * Mission B9.1: Performance Optimization & Hardening
 *
 * Configures Jest for optimal CI performance and provides
 * compatibility shims for ESM/CJS mixed tests.
 */

import { createRequire } from 'module';
import { jest as jestGlobals } from '@jest/globals';
import path from 'path';

// Ensure global jest is available in ESM tests
// (Jest recommends importing from @jest/globals in ESM, but many tests assume a global)
// eslint-disable-next-line no-undef
global.jest = global.jest || jestGlobals;

// Provide a require() bridge for tests using CommonJS style under ESM
// eslint-disable-next-line no-undef
global.require = global.require || createRequire(path.join(process.cwd(), 'tests', 'setup.js'));

// Set test timeout
// eslint-disable-next-line no-undef
jest.setTimeout(30000);

// Mock console methods in tests to reduce noise
global.console = {
  ...console,
  // Keep error and warn for debugging
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
};

// Performance monitoring for tests
// Capture the native performance.now to avoid recursion when tests mock it
const nativePerformanceNow = performance.now.bind(performance);
let testStartTime;

beforeEach(() => {
  testStartTime = nativePerformanceNow();
});

afterEach(() => {
  const testDuration = nativePerformanceNow() - testStartTime;
  if (testDuration > 5000) { // 5 seconds
    console.warn(`Slow test detected: ${expect.getState().currentTestName} took ${testDuration.toFixed(2)}ms`);
  }
});

// Global test utilities
global.testUtils = {
  // Mock performance.now for consistent testing
  mockPerformanceNow: (mockTime = 0) => {
    let currentTime = mockTime;
    performance.now = jest.fn(() => {
      currentTime += 1;
      return currentTime;
    });
  },
  
  // Restore performance.now
  restorePerformanceNow: () => {
    performance.now = nativePerformanceNow;
  },
  
  // Create mock metrics
  createMockMetrics: () => ({
    requests: { total: 0, successful: 0, failed: 0 },
    cache: { hits: 0, misses: 0, hitRatio: 0 },
    memory: { heapUsed: 0, heapTotal: 0 },
    discovery: { total: 0, cached: 0, latency: { p50: 0, p95: 0, p99: 0 } },
    mcp: { total: 0, cached: 0, latency: { p50: 0, p95: 0, p99: 0 } }
  })
};

// Cleanup after all tests
afterAll(() => {
  // Restore original performance.now
  performance.now = nativePerformanceNow;
});
