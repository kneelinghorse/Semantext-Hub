/**
 * Performance Summarizer Unit Tests
 * 
 * Tests the performance summarizer:
 * - Unknown classification (missing ok != error)
 * - Percentile calculations
 * - Monotonic percentile assertions (p95 >= p50 >= p5)
 */

import { describe, it, expect } from '@jest/globals';
import { classifyEntry, computeStats, percentile } from '../../scripts/perf/summarize.mjs';

describe('Performance Summarizer', () => {
  describe('classifyEntry', () => {
    it('should classify ok:true as success', () => {
      const entry = {
        ts: '2025-10-21T00:00:00Z',
        sessionId: 'test',
        tool: 'registry',
        step: 'health',
        ms: 50,
        ok: true,
      };
      expect(classifyEntry(entry)).toBe('success');
    });

    it('should classify ok:false as error', () => {
      const entry = {
        ts: '2025-10-21T00:00:00Z',
        sessionId: 'test',
        tool: 'registry',
        step: 'health',
        ms: 50,
        ok: false,
        errorReason: 'timeout',
      };
      expect(classifyEntry(entry)).toBe('error');
    });

    it('should classify missing ok as unknown', () => {
      const entry = {
        ts: '2025-10-21T00:00:00Z',
        sessionId: 'test',
        tool: 'registry',
        step: 'health',
        ms: 50,
      };
      expect(classifyEntry(entry)).toBe('unknown');
    });

    it('should treat undefined ok as unknown', () => {
      const entry = {
        ts: '2025-10-21T00:00:00Z',
        sessionId: 'test',
        tool: 'registry',
        step: 'health',
        ms: 50,
        ok: undefined,
      };
      expect(classifyEntry(entry)).toBe('unknown');
    });

    it('should treat null ok as unknown', () => {
      const entry = {
        ts: '2025-10-21T00:00:00Z',
        sessionId: 'test',
        tool: 'registry',
        step: 'health',
        ms: 50,
        ok: null,
      };
      expect(classifyEntry(entry)).toBe('unknown');
    });

    it('should treat non-boolean ok as unknown', () => {
      const entry = {
        ts: '2025-10-21T00:00:00Z',
        sessionId: 'test',
        tool: 'registry',
        step: 'health',
        ms: 50,
        ok: 'yes',
      };
      expect(classifyEntry(entry)).toBe('unknown');
    });
  });

  describe('percentile', () => {
    it('should compute p50 correctly for odd-length array', () => {
      const values = [1, 2, 3, 4, 5];
      expect(percentile(values, 50)).toBe(3);
    });

    it('should compute p50 correctly for even-length array', () => {
      const values = [1, 2, 3, 4];
      expect(percentile(values, 50)).toBe(2.5);
    });

    it('should compute p95 correctly', () => {
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      const p95 = percentile(values, 95);
      expect(p95).toBeCloseTo(95.05, 1);
    });

    it('should compute p5 correctly', () => {
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      const p5 = percentile(values, 5);
      expect(p5).toBeCloseTo(5.95, 1);
    });

    it('should return single value for single-element array', () => {
      const values = [42];
      expect(percentile(values, 50)).toBe(42);
      expect(percentile(values, 95)).toBe(42);
      expect(percentile(values, 5)).toBe(42);
    });

    it('should return null for empty array', () => {
      const values = [];
      expect(percentile(values, 50)).toBeNull();
    });

    it('should handle two-element array', () => {
      const values = [10, 20];
      expect(percentile(values, 50)).toBe(15);
      expect(percentile(values, 0)).toBe(10);
      expect(percentile(values, 100)).toBe(20);
    });
  });

  describe('computeStats', () => {
    it('should compute all statistics correctly', () => {
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const stats = computeStats(values);

      expect(stats.count).toBe(10);
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(100);
      expect(stats.avg).toBe(55);
      expect(stats.p5).toBeCloseTo(14.5, 1);
      expect(stats.p50).toBe(55);
      expect(stats.p95).toBeCloseTo(95.5, 1);
      expect(stats.monotonicValid).toBe(true);
    });

    it('should detect monotonic percentiles are valid', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const stats = computeStats(values);

      expect(stats.p95).toBeGreaterThanOrEqual(stats.p50);
      expect(stats.p50).toBeGreaterThanOrEqual(stats.p5);
      expect(stats.monotonicValid).toBe(true);
    });

    it('should handle single value', () => {
      const values = [42];
      const stats = computeStats(values);

      expect(stats.count).toBe(1);
      expect(stats.min).toBe(42);
      expect(stats.max).toBe(42);
      expect(stats.avg).toBe(42);
      expect(stats.p5).toBe(42);
      expect(stats.p50).toBe(42);
      expect(stats.p95).toBe(42);
      expect(stats.monotonicValid).toBe(true);
    });

    it('should handle empty array', () => {
      const values = [];
      const stats = computeStats(values);

      expect(stats.count).toBe(0);
      expect(stats.min).toBeNull();
      expect(stats.max).toBeNull();
      expect(stats.avg).toBeNull();
      expect(stats.p5).toBeNull();
      expect(stats.p50).toBeNull();
      expect(stats.p95).toBeNull();
      expect(stats.monotonicValid).toBeNull();
    });

    it('should round statistics to 2 decimal places', () => {
      const values = [1.111, 2.222, 3.333];
      const stats = computeStats(values);

      expect(stats.avg).toBe(2.22);
      // Check that values are rounded to at most 2 decimal places
      expect(stats.p50).toBeCloseTo(2.22, 2);
      expect(String(stats.p50).split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
    });

    it('should handle large dataset', () => {
      const values = Array.from({ length: 1000 }, (_, i) => i + 1);
      const stats = computeStats(values);

      expect(stats.count).toBe(1000);
      expect(stats.min).toBe(1);
      expect(stats.max).toBe(1000);
      expect(stats.avg).toBe(500.5);
      expect(stats.p50).toBeCloseTo(500.5, 1);
      expect(stats.p95).toBeCloseTo(950.05, 1);
      expect(stats.monotonicValid).toBe(true);
    });

    it('should handle uniform distribution', () => {
      const values = Array(100).fill(50);
      const stats = computeStats(values);

      expect(stats.min).toBe(50);
      expect(stats.max).toBe(50);
      expect(stats.avg).toBe(50);
      expect(stats.p5).toBe(50);
      expect(stats.p50).toBe(50);
      expect(stats.p95).toBe(50);
      expect(stats.monotonicValid).toBe(true);
    });
  });

  describe('Monotonic Percentile Validation', () => {
    it('should validate p95 >= p50 >= p5 for normal distribution', () => {
      // Generate values: 1-100
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      const stats = computeStats(values);

      expect(stats.p95).toBeGreaterThanOrEqual(stats.p50);
      expect(stats.p50).toBeGreaterThanOrEqual(stats.p5);
      expect(stats.monotonicValid).toBe(true);
    });

    it('should validate monotonicity for skewed distribution', () => {
      // Heavily skewed: mostly low values with few high outliers
      const values = [
        ...Array(90).fill(10),
        ...Array(5).fill(50),
        ...Array(5).fill(100),
      ];
      const stats = computeStats(values);

      expect(stats.p95).toBeGreaterThanOrEqual(stats.p50);
      expect(stats.p50).toBeGreaterThanOrEqual(stats.p5);
      expect(stats.monotonicValid).toBe(true);
    });

    it('should validate monotonicity for bimodal distribution', () => {
      // Two peaks
      const values = [
        ...Array(50).fill(20),
        ...Array(50).fill(80),
      ];
      const stats = computeStats(values);

      expect(stats.p95).toBeGreaterThanOrEqual(stats.p50);
      expect(stats.p50).toBeGreaterThanOrEqual(stats.p5);
      expect(stats.monotonicValid).toBe(true);
    });

    it('should validate monotonicity for realistic latency data', () => {
      // Realistic HTTP latencies
      const values = [
        45, 48, 50, 52, 55, 58, 60, 62, 65, 68, // Fast responses
        70, 72, 75, 78, 80, 82, 85, 88, 90, 92, // Normal responses
        95, 98, 100, 105, 110, 115, 120, 130, 140, 150, // Slow responses
        200, 250, 300, // Outliers
      ];
      const stats = computeStats(values);

      expect(stats.p95).toBeGreaterThanOrEqual(stats.p50);
      expect(stats.p50).toBeGreaterThanOrEqual(stats.p5);
      expect(stats.monotonicValid).toBe(true);
    });

    it('should always maintain monotonicity (property-based)', () => {
      // Generate 100 random datasets and verify all maintain monotonicity
      for (let i = 0; i < 100; i++) {
        const size = Math.floor(Math.random() * 100) + 10;
        const values = Array.from({ length: size }, () => Math.random() * 1000);
        const stats = computeStats(values);

        expect(stats.p95).toBeGreaterThanOrEqual(stats.p50);
        expect(stats.p50).toBeGreaterThanOrEqual(stats.p5);
        expect(stats.monotonicValid).toBe(true);
      }
    });
  });

  describe('Unknown vs Error Classification', () => {
    it('should exclude unknown from error count', () => {
      const entries = [
        { ok: true, ms: 50 },    // success
        { ok: false, ms: 100 },  // error
        { ms: 75 },              // unknown (no ok field)
        { ok: true, ms: 60 },    // success
        { ok: null, ms: 80 },    // unknown (null ok)
      ];

      const successes = entries.filter(e => classifyEntry(e) === 'success');
      const errors = entries.filter(e => classifyEntry(e) === 'error');
      const unknowns = entries.filter(e => classifyEntry(e) === 'unknown');

      expect(successes).toHaveLength(2);
      expect(errors).toHaveLength(1);
      expect(unknowns).toHaveLength(2);

      // Unknown should NOT be counted as errors
      expect(errors).not.toContainEqual(expect.objectContaining({ ms: 75 }));
      expect(errors).not.toContainEqual(expect.objectContaining({ ms: 80 }));
    });

    it('should only include success entries in performance calculations', () => {
      const entries = [
        { ok: true, ms: 50 },
        { ok: false, ms: 5000, errorReason: 'timeout' },
        { ms: 999 }, // unknown
        { ok: true, ms: 60 },
        { ok: true, ms: 55 },
      ];

      const successValues = entries
        .filter(e => classifyEntry(e) === 'success')
        .map(e => e.ms);

      const stats = computeStats(successValues);

      expect(stats.count).toBe(3);
      expect(stats.avg).toBeCloseTo(55, 0);
      // Should not be affected by the error or unknown entries
      expect(stats.max).toBe(60);
      expect(successValues).not.toContain(5000);
      expect(successValues).not.toContain(999);
    });
  });
});

