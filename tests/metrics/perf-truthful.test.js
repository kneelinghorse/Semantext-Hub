/**
 * Tests for Truthful Performance Pipeline (Sprint 22)
 * 
 * Verifies that performance metrics collection:
 * - Throws errors when logs are missing (no mock fallback)
 * - Requires real execution data
 * - Validates log formats correctly
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtemp, rm, mkdir, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  collectWorkspacePerfMetrics,
  PerformanceCollector,
  parsePerfLogEntry,
} from '../../src/metrics/perf.js';

describe('Truthful Performance Pipeline', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'perf-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('collectWorkspacePerfMetrics - No Mock Fallback', () => {
    it('should throw error when workspace parameter is missing', async () => {
      await expect(
        collectWorkspacePerfMetrics({ workspace: null })
      ).rejects.toThrow('Missing workspace parameter');
    });

    it('should throw error when artifacts directory does not exist', async () => {
      await expect(
        collectWorkspacePerfMetrics({ 
          workspace: tempDir,
          artifactsDir: 'non-existent-dir'
        })
      ).rejects.toThrow('Artifacts directory not found');
    });

    it('should throw error when no performance logs found', async () => {
      const artifactsDir = path.join(tempDir, 'artifacts');
      await mkdir(artifactsDir, { recursive: true });

      await expect(
        collectWorkspacePerfMetrics({ 
          workspace: tempDir,
          artifactsDir: 'artifacts'
        })
      ).rejects.toThrow('No performance logs found');
    });

    it('should throw error when logs exist but contain no parseable metrics', async () => {
      const artifactsDir = path.join(tempDir, 'artifacts');
      await mkdir(artifactsDir, { recursive: true });
      
      // Create an empty log file
      const logFile = path.join(artifactsDir, 'performance.jsonl');
      await writeFile(logFile, '{"invalid":"entry"}\n', 'utf8');

      await expect(
        collectWorkspacePerfMetrics({ 
          workspace: tempDir,
          artifactsDir: 'artifacts'
        })
      ).rejects.toThrow('contain no parseable metrics');
    });

    it('should successfully collect metrics from valid logs', async () => {
      const artifactsDir = path.join(tempDir, 'artifacts');
      await mkdir(artifactsDir, { recursive: true });
      
      // Create a valid log file with discovery and MCP metrics
      // Note: parsePerfLogEntry detects discovery/mcp from message or step fields
      const logFile = path.join(artifactsDir, 'performance.jsonl');
      const logEntries = [
        { step: 'discovery', ms: 150, ok: true, message: 'discovery operation' },
        { step: 'discovery', ms: 200, ok: true, message: 'catalog lookup' },
        { step: 'tool_exec', ms: 500, ok: true, message: 'mcp tool execution' },
        { step: 'tool_call', ms: 600, ok: true, message: 'mcp request' },
      ];
      
      const logContent = logEntries.map(entry => JSON.stringify(entry)).join('\n');
      await writeFile(logFile, logContent, 'utf8');

      const collector = await collectWorkspacePerfMetrics({ 
        workspace: tempDir,
        artifactsDir: 'artifacts'
      });

      const summary = collector.getSummary();
      
      expect(summary.discovery.total).toBeGreaterThan(0);
      expect(summary.mcp.total).toBeGreaterThan(0);
      expect(summary.discovery.p95).toBeGreaterThan(0);
      expect(summary.mcp.p95).toBeGreaterThan(0);
      expect(Array.isArray(collector.sourceLogFiles)).toBe(true);
      expect(collector.sourceLogFiles.length).toBeGreaterThan(0);
      expect(collector.sourceLogFiles[0]).toContain('performance.jsonl');
    });

    it('should skip logs older than the max log age', async () => {
      const artifactsDir = path.join(tempDir, 'artifacts');
      await mkdir(artifactsDir, { recursive: true });

      const staleLog = path.join(artifactsDir, 'stale.jsonl');
      const freshLog = path.join(artifactsDir, 'fresh.jsonl');

      await writeFile(
        staleLog,
        JSON.stringify({ step: 'discovery', ms: 200, ok: true, message: 'discovery operation' }) +
          '\n',
        'utf8',
      );
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await utimes(staleLog, twoHoursAgo, twoHoursAgo);

      await writeFile(
        freshLog,
        JSON.stringify({ step: 'mcp', ms: 80, ok: true, message: 'mcp tool execution' }) + '\n',
        'utf8',
      );

      const collector = await collectWorkspacePerfMetrics({
        workspace: tempDir,
        artifactsDir: 'artifacts',
        maxLogAgeMs: 30 * 60 * 1000,
      });

      const summary = collector.getSummary();
      expect(summary.discovery.total).toBe(0);
      expect(summary.mcp.total).toBe(1);
      expect(Array.isArray(collector.sourceLogFiles)).toBe(true);
      expect(collector.sourceLogFiles).toHaveLength(1);
      expect(collector.sourceLogFiles[0]).toContain('fresh.jsonl');
    });
  });

  describe('parsePerfLogEntry', () => {
    let collector;

    beforeEach(() => {
      collector = new PerformanceCollector();
    });

    it('should parse discovery entries correctly', () => {
      const entry = {
        step: 'resolve',
        ms: 123,
        ok: true,
        message: 'discovery URN resolution',
      };

      parsePerfLogEntry(entry, collector);
      const summary = collector.getSummary();
      
      expect(summary.discovery.total).toBe(1);
      expect(summary.discovery.avg).toBeCloseTo(123, 0);
    });

    it('should parse MCP entries correctly', () => {
      const entry = {
        step: 'tool_exec',
        ms: 456,
        ok: true,
        message: 'mcp tool execution',
      };

      parsePerfLogEntry(entry, collector);
      const summary = collector.getSummary();
      
      expect(summary.mcp.total).toBe(1);
      expect(summary.mcp.avg).toBeCloseTo(456, 0);
    });

    it('should handle entries with message-based detection', () => {
      const entry = {
        message: 'discovery cache hit',
        duration: 50,
      };

      parsePerfLogEntry(entry, collector);
      const summary = collector.getSummary();
      
      expect(summary.discovery.total).toBe(1);
      // Cache hit should increase cache hit rate
      expect(summary.discovery.cacheHitRate).toBeGreaterThan(0);
    });

    it('should detect errors from ok flag', () => {
      const entry = {
        step: 'resolve',
        ms: 100,
        ok: false,
        message: 'discovery failed',
      };

      parsePerfLogEntry(entry, collector);
      const summary = collector.getSummary();
      
      expect(summary.discovery.errors).toBe(1);
    });

    it('should detect errors from message content', () => {
      const entry = {
        step: 'tool_exec',
        ms: 100,
        message: 'mcp tool execution failed',
      };

      parsePerfLogEntry(entry, collector);
      const summary = collector.getSummary();
      
      expect(summary.mcp.errors).toBe(1);
    });

    it('should classify wsap pipeline entries as discovery metrics', () => {
      const entry = {
        tool: 'wsap',
        step: 'catalog',
        ms: 42.5,
        ok: true,
      };

      parsePerfLogEntry(entry, collector);
      const summary = collector.getSummary();

      expect(summary.discovery.total).toBe(1);
      expect(summary.discovery.p95).toBeGreaterThan(0);
    });

    it('should classify registry HTTP routes as discovery metrics', () => {
      const entry = {
        route: '/v1/registry/items',
        duration: 85.1,
        status: 200,
        success: true,
      };

      parsePerfLogEntry(entry, collector);
      const summary = collector.getSummary();

      expect(summary.discovery.total).toBe(1);
      expect(summary.discovery.p95).toBeGreaterThan(0);
    });

    it('should classify release canary entries as MCP metrics and track errors', () => {
      const entry = {
        tool: 'release:canary',
        step: 'a2a.echo',
        ms: 517,
        ok: false,
        err: 'Registry resolve failed (404)',
      };

      parsePerfLogEntry(entry, collector);
      const summary = collector.getSummary();

      expect(summary.mcp.total).toBe(1);
      expect(summary.mcp.errors).toBe(1);
      expect(summary.mcp.p95).toBeGreaterThan(0);
    });

    it('should ignore entries without duration', () => {
      const entry = {
        step: 'resolve',
        message: 'discovery operation',
        // no ms/duration field
      };

      parsePerfLogEntry(entry, collector);
      const summary = collector.getSummary();
      
      expect(summary.discovery.total).toBe(0);
    });
  });

  describe('PerformanceCollector', () => {
    it('should correctly identify empty collector', () => {
      const collector = new PerformanceCollector();
      expect(collector.isEmpty()).toBe(true);
      
      collector.recordDiscovery(0, 100);
      expect(collector.isEmpty()).toBe(false);
    });

    it('should calculate percentiles correctly', () => {
      const collector = new PerformanceCollector();
      
      // Add 100 discovery requests with known distribution
      for (let i = 1; i <= 100; i++) {
        collector.recordDiscovery(0, i);
      }

      const summary = collector.getSummary();
      
      // P95 should be around 95ms
      expect(summary.discovery.p95).toBeGreaterThanOrEqual(94);
      expect(summary.discovery.p95).toBeLessThanOrEqual(96);
      
      // P50 should be around 50ms
      expect(summary.discovery.p50).toBeGreaterThanOrEqual(49);
      expect(summary.discovery.p50).toBeLessThanOrEqual(51);
    });

    it('should track cache hits and misses', () => {
      const collector = new PerformanceCollector();
      
      collector.recordDiscovery(0, 100, true);  // cache hit
      collector.recordDiscovery(0, 100, false); // cache miss
      collector.recordDiscovery(0, 100, true);  // cache hit

      const summary = collector.getSummary();
      
      // Summary exposes cache hit rate, not raw counts
      expect(summary.discovery.cacheHitRate).toBeCloseTo(0.667, 2);
      expect(summary.discovery.total).toBe(3);
    });

    it('should track tool executions for MCP', () => {
      const collector = new PerformanceCollector();
      
      collector.recordMCP(0, 100, true);  // tool executed
      collector.recordMCP(0, 100, false); // no tool
      collector.recordMCP(0, 100, true);  // tool executed

      const summary = collector.getSummary();
      
      expect(summary.mcp.toolExecutions).toBe(2);
      expect(summary.mcp.total).toBe(3);
    });

    it('should handle zero requests gracefully', () => {
      const collector = new PerformanceCollector();
      const summary = collector.getSummary();
      
      expect(summary.discovery.p95).toBe(0);
      expect(summary.discovery.avg).toBe(0);
      expect(summary.mcp.p95).toBe(0);
      expect(summary.mcp.avg).toBe(0);
    });
  });
});
