/**
 * Tests for perf:report CLI command
 * Mission: S22.2 - Perf Snapshot CLI/Dashboard
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtemp, rm, writeFile, mkdir, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { perfReportCommand } from '../../cli/commands/perf-report.js';

describe('perf:report CLI command', () => {
  let tempWorkspace: string;
  let artifactsDir: string;

  beforeEach(async () => {
    tempWorkspace = await mkdtemp(path.join(tmpdir(), 'perf-report-test-'));
    artifactsDir = path.join(tempWorkspace, 'artifacts', 'perf');
    await mkdir(artifactsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempWorkspace, { recursive: true, force: true });
  });

  describe('table format output', () => {
    it('generates table report with p50/p95/p99 metrics from logs', async () => {
      // Arrange: Create sample performance log
      const logFile = path.join(artifactsDir, 'test-metrics.jsonl');
      const entries = [
        { step: 'discovery-resolve', ms: 42, ok: true, message: 'Discovery URN resolution' },
        { step: 'discovery-cache', ms: 55, ok: true, message: 'Discovery cache hit' },
        { step: 'discovery-resolve', ms: 38, ok: true, message: 'Discovery completed' },
        { step: 'mcp-tool', ms: 125, ok: true, message: 'MCP tool execution' },
        { step: 'mcp-tool', ms: 150, ok: true, message: 'MCP tool execution' },
      ];
      await writeFile(logFile, entries.map((e) => JSON.stringify(e)).join('\n'), 'utf8');

      // Act: Run perf:report in table format
      const result = await perfReportCommand({
        workspace: tempWorkspace,
        format: 'table',
        verbose: false,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
      expect(result.summary.discovery.p50).toBeGreaterThan(0);
      expect(result.summary.discovery.p95).toBeGreaterThan(0);
      expect(result.summary.discovery.p99).toBeGreaterThan(0);
      expect(result.summary.mcp.p50).toBeGreaterThan(0);
      expect(result.summary.mcp.p95).toBeGreaterThan(0);
      expect(result.summary.mcp.p99).toBeGreaterThan(0);
    });

    it('includes budget compliance status in table output', async () => {
      const logFile = path.join(artifactsDir, 'passing-metrics.jsonl');
      const entries = [
        { step: 'discovery', ms: 200, ok: true, message: 'Discovery operation' },
        { step: 'mcp', ms: 500, ok: true, message: 'MCP operation' },
      ];
      await writeFile(logFile, entries.map((e) => JSON.stringify(e)).join('\n'), 'utf8');

      const result = await perfReportCommand({
        workspace: tempWorkspace,
        format: 'table',
      });

      expect(result.success).toBe(true);
      expect(result.budgetViolated).toBe(false);
      expect(result.summary.discovery.p95).toBeLessThanOrEqual(1000);
      expect(result.summary.mcp.p95).toBeLessThanOrEqual(3000);
    });

    it('displays verbose output with source log paths when requested', async () => {
      const logFile = path.join(artifactsDir, 'verbose-metrics.jsonl');
      await writeFile(
        logFile,
        JSON.stringify({ step: 'discovery', ms: 100, ok: true, message: 'Discovery resolve' }) + '\n',
        'utf8'
      );

      const result = await perfReportCommand({
        workspace: tempWorkspace,
        format: 'table',
        verbose: true,
      });

      expect(result.success).toBe(true);
      expect(result.summary.sourceLogs).toBeDefined();
      expect(result.summary.sourceLogs.length).toBeGreaterThan(0);
      expect(result.summary.sourceLogs[0]).toHaveProperty('absolute');
      expect(result.summary.sourceLogs[0]).toHaveProperty('relative');
    });
  });

  describe('json format output', () => {
    it('outputs machine-readable JSON with all metrics', async () => {
      const logFile = path.join(artifactsDir, 'json-metrics.jsonl');
      const entries = [
        { step: 'discovery', ms: 100, ok: true, message: 'Discovery operation' },
        { step: 'discovery', ms: 150, ok: true, message: 'Discovery operation' },
        { step: 'mcp', ms: 200, ok: true, message: 'MCP tool execution' },
      ];
      await writeFile(logFile, entries.map((e) => JSON.stringify(e)).join('\n'), 'utf8');

      const result = await perfReportCommand({
        workspace: tempWorkspace,
        format: 'json',
      });

      expect(result.success).toBe(true);
      expect(result.summary).toMatchObject({
        discovery: expect.objectContaining({
          p50: expect.any(Number),
          p95: expect.any(Number),
          p99: expect.any(Number),
          avg: expect.any(Number),
          total: expect.any(Number),
        }),
        mcp: expect.objectContaining({
          p50: expect.any(Number),
          p95: expect.any(Number),
          p99: expect.any(Number),
          avg: expect.any(Number),
          total: expect.any(Number),
        }),
        logs: expect.objectContaining({
          stale: expect.any(Boolean),
          thresholdMinutes: expect.any(Number),
        }),
        correlationId: expect.any(String),
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    });

    it('includes cache hit rate in discovery metrics', async () => {
      const logFile = path.join(artifactsDir, 'cache-metrics.jsonl');
      const entries = [
        { step: 'discovery', ms: 50, ok: true, message: 'Discovery cache hit' },
        { step: 'discovery', ms: 200, ok: true, message: 'Discovery cache miss' },
      ];
      await writeFile(logFile, entries.map((e) => JSON.stringify(e)).join('\n'), 'utf8');

      const result = await perfReportCommand({
        workspace: tempWorkspace,
        format: 'json',
      });

      expect(result.summary.discovery.cacheHitRate).toBeGreaterThanOrEqual(0);
      expect(result.summary.discovery.cacheHitRate).toBeLessThanOrEqual(1);
    });
  });

  describe('budget violation exit codes', () => {
    it('exits with code 1 when discovery p95 exceeds budget', async () => {
      const logFile = path.join(artifactsDir, 'slow-discovery.jsonl');
      const entries = Array.from({ length: 100 }, (_, i) => ({
        step: 'discovery',
        ms: 1500 + i * 10, // All above 1000ms budget
        ok: true,
        message: 'Discovery resolve',
      }));
      await writeFile(logFile, entries.map((e) => JSON.stringify(e)).join('\n'), 'utf8');

      const result = await perfReportCommand({
        workspace: tempWorkspace,
        format: 'json',
      });

      expect(result.success).toBe(false);
      expect(result.budgetViolated).toBe(true);
      expect(result.summary.discovery.p95).toBeGreaterThan(1000);
      expect(process.exitCode).toBe(1);
      
      // Reset exit code for other tests
      process.exitCode = 0;
    });

    it('exits with code 1 when mcp p95 exceeds budget', async () => {
      const logFile = path.join(artifactsDir, 'slow-mcp.jsonl');
      const entries = Array.from({ length: 100 }, (_, i) => ({
        step: 'mcp',
        ms: 3500 + i * 10, // All above 3000ms budget
        ok: true,
        message: 'MCP tool execution',
      }));
      await writeFile(logFile, entries.map((e) => JSON.stringify(e)).join('\n'), 'utf8');

      const result = await perfReportCommand({
        workspace: tempWorkspace,
        format: 'json',
      });

      expect(result.success).toBe(false);
      expect(result.budgetViolated).toBe(true);
      expect(result.summary.mcp.p95).toBeGreaterThan(3000);
      expect(process.exitCode).toBe(1);

      // Reset exit code
      process.exitCode = 0;
    });

    it('exits with code 0 when all budgets are met', async () => {
      const logFile = path.join(artifactsDir, 'fast-metrics.jsonl');
      const entries = [
        ...Array.from({ length: 50 }, () => ({
          step: 'discovery',
          ms: Math.random() * 500, // Well under budget
          ok: true,
          message: 'Discovery resolve',
        })),
        ...Array.from({ length: 50 }, () => ({
          step: 'mcp',
          ms: Math.random() * 1000, // Well under budget
          ok: true,
          message: 'MCP tool execution',
        })),
      ];
      await writeFile(logFile, entries.map((e) => JSON.stringify(e)).join('\n'), 'utf8');

      const result = await perfReportCommand({
        workspace: tempWorkspace,
        format: 'json',
      });

      expect(result.success).toBe(true);
      expect(result.budgetViolated).toBe(false);
      expect(result.logsStale).toBe(false);
      expect(process.exitCode).not.toBe(1);
    });
  });

  describe('error handling', () => {
    it('exits with code 1 when artifacts directory is missing', async () => {
      const nonExistentWorkspace = path.join(tmpdir(), 'nonexistent-workspace-' + Date.now());

      const result = await perfReportCommand({
        workspace: nonExistentWorkspace,
        format: 'json',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(process.exitCode).toBe(1);

      // Reset exit code
      process.exitCode = 0;
    });

    it('exits with code 1 when no performance logs found', async () => {
      // Empty artifacts directory
      const result = await perfReportCommand({
        workspace: tempWorkspace,
        format: 'json',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/No performance logs/);
      expect(process.exitCode).toBe(1);

      // Reset exit code
      process.exitCode = 0;
    });

    it('exits with code 1 when logs exist but contain no valid metrics', async () => {
      const logFile = path.join(artifactsDir, 'empty-metrics.jsonl');
      await writeFile(logFile, '{"unrelated": "data"}\n', 'utf8');

      const result = await perfReportCommand({
        workspace: tempWorkspace,
        format: 'json',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/no parseable metrics/);
      expect(process.exitCode).toBe(1);

      // Reset exit code
      process.exitCode = 0;
    });
  });

  describe('log freshness enforcement', () => {
    it('exits with code 1 when telemetry logs are stale', async () => {
      const logFile = path.join(artifactsDir, 'stale.jsonl');
      await writeFile(
        logFile,
        JSON.stringify({ step: 'discovery', ms: 100, ok: true, message: 'Stale discovery entry' }) + '\n',
        'utf8',
      );

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await utimes(logFile, twoHoursAgo, twoHoursAgo);

      const result = await perfReportCommand({
        workspace: tempWorkspace,
        format: 'json',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/stale/i);
      expect(result.summary).toBeUndefined();
      expect(process.exitCode).toBe(1);

      process.exitCode = 0;
    });
  });

  describe('percentile calculations', () => {
    it('correctly computes p50/p95/p99 for discovery metrics', async () => {
      const logFile = path.join(artifactsDir, 'percentile-test.jsonl');
      // Create 100 entries with known distribution
      const entries = Array.from({ length: 100 }, (_, i) => ({
        step: 'discovery',
        ms: i + 1, // Values from 1 to 100
        ok: true,
        message: 'Discovery resolve',
      }));
      await writeFile(logFile, entries.map((e) => JSON.stringify(e)).join('\n'), 'utf8');

      const result = await perfReportCommand({
        workspace: tempWorkspace,
        format: 'json',
      });

      expect(result.success).toBe(true);
      // p50 should be around 50, p95 around 95, p99 around 99
      expect(result.summary.discovery.p50).toBeGreaterThanOrEqual(40);
      expect(result.summary.discovery.p50).toBeLessThanOrEqual(60);
      expect(result.summary.discovery.p95).toBeGreaterThanOrEqual(90);
      expect(result.summary.discovery.p95).toBeLessThanOrEqual(100);
      expect(result.summary.discovery.p99).toBeGreaterThanOrEqual(95);
      expect(result.summary.discovery.p99).toBeLessThanOrEqual(100);
    });

    it('handles edge case with single data point', async () => {
      const logFile = path.join(artifactsDir, 'single-point.jsonl');
      await writeFile(
        logFile,
        JSON.stringify({ step: 'discovery', ms: 100, ok: true, message: 'Discovery resolve' }) + '\n',
        'utf8'
      );

      const result = await perfReportCommand({
        workspace: tempWorkspace,
        format: 'json',
      });

      expect(result.success).toBe(true);
      expect(result.summary.discovery.p50).toBe(100);
      expect(result.summary.discovery.p95).toBe(100);
      expect(result.summary.discovery.p99).toBe(100);
    });
  });

  describe('error tracking', () => {
    it('counts errors correctly in discovery metrics', async () => {
      const logFile = path.join(artifactsDir, 'errors.jsonl');
      const entries = [
        { step: 'discovery', ms: 100, ok: true, message: 'Discovery resolve' },
        { step: 'discovery', ms: 200, ok: false, message: 'Discovery error' },
        { step: 'discovery', ms: 150, ok: true, message: 'Discovery resolve' },
      ];
      await writeFile(logFile, entries.map((e) => JSON.stringify(e)).join('\n'), 'utf8');

      const result = await perfReportCommand({
        workspace: tempWorkspace,
        format: 'json',
      });

      expect(result.summary.discovery.errors).toBe(1);
      expect(result.summary.discovery.total).toBe(3);
    });

    it('counts tool executions in mcp metrics', async () => {
      const logFile = path.join(artifactsDir, 'tools.jsonl');
      const entries = [
        { step: 'mcp-tool', ms: 100, ok: true, message: 'MCP tool executed' },
        { step: 'mcp-tool', ms: 200, ok: true, message: 'MCP tool completed' },
      ];
      await writeFile(logFile, entries.map((e) => JSON.stringify(e)).join('\n'), 'utf8');

      const result = await perfReportCommand({
        workspace: tempWorkspace,
        format: 'json',
      });

      expect(result.summary.mcp.toolExecutions).toBeGreaterThan(0);
      expect(result.summary.mcp.total).toBe(2);
    });
  });

  describe('metadata and tracing', () => {
    it('includes correlation ID and timestamp in all outputs', async () => {
      const logFile = path.join(artifactsDir, 'metadata.jsonl');
      await writeFile(
        logFile,
        JSON.stringify({ step: 'discovery', ms: 100, ok: true, message: 'Discovery resolve' }) + '\n',
        'utf8'
      );

      const result = await perfReportCommand({
        workspace: tempWorkspace,
        format: 'json',
      });

      expect(result.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(result.summary.correlationId).toBe(result.correlationId);
      expect(result.summary.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('tracks execution time for performance monitoring', async () => {
      const logFile = path.join(artifactsDir, 'timing.jsonl');
      await writeFile(
        logFile,
        JSON.stringify({ step: 'discovery', ms: 100, ok: true, message: 'Discovery resolve' }) + '\n',
        'utf8'
      );

      const result = await perfReportCommand({
        workspace: tempWorkspace,
        format: 'json',
      });

      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.executionTime).toBeLessThan(5000); // Should complete quickly
    });
  });
});
