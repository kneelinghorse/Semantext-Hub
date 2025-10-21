/**
 * Performance Collector Tests
 * 
 * Tests the complete performance monitoring pipeline.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');

describe('Performance Collector', () => {
  it('should have the collector script', async () => {
    const collectorPath = resolve(PROJECT_ROOT, 'scripts/perf/collect.mjs');
    await expect(access(collectorPath)).resolves.not.toThrow();
  });

  it('should collect performance logs', async () => {
    const { stdout } = await execAsync('node scripts/perf/collect.mjs', {
      cwd: PROJECT_ROOT,
      maxBuffer: 10 * 1024 * 1024,
    });

    expect(stdout).toContain('Performance Collection Summary');
    expect(stdout).toContain('Total entries:');
    expect(stdout).toContain('By tool:');
  });

  it('should generate latest.jsonl artifact', async () => {
    const artifactPath = resolve(PROJECT_ROOT, 'artifacts/perf/latest.jsonl');
    
    await execAsync('node scripts/perf/collect.mjs', {
      cwd: PROJECT_ROOT,
      maxBuffer: 10 * 1024 * 1024,
    });

    await expect(access(artifactPath)).resolves.not.toThrow();

    const content = await readFile(artifactPath, 'utf8');
    const lines = content.trim().split('\n');
    
    expect(lines.length).toBeGreaterThan(0);
    
    // Verify JSONL format
    const firstEntry = JSON.parse(lines[0]);
    expect(firstEntry).toHaveProperty('ts');
    expect(firstEntry).toHaveProperty('sessionId');
    expect(firstEntry).toHaveProperty('tool');
    expect(firstEntry).toHaveProperty('step');
    expect(firstEntry).toHaveProperty('ms');
    expect(firstEntry).toHaveProperty('ok');
  });

  it('should support filtering by tool', async () => {
    const { stdout } = await execAsync(
      'node scripts/perf/collect.mjs --tools wsap --output artifacts/perf/test-wsap-only.jsonl',
      {
        cwd: PROJECT_ROOT,
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    expect(stdout).toContain('wsap:');
    
    const artifactPath = resolve(PROJECT_ROOT, 'artifacts/perf/test-wsap-only.jsonl');
    const content = await readFile(artifactPath, 'utf8');
    const lines = content.trim().split('\n');
    
    // Verify all entries are from WSAP
    for (const line of lines) {
      const entry = JSON.parse(line);
      expect(entry.tool).toBe('wsap');
    }
  });
});

describe('Performance Budgets', () => {
  it('should have budget configuration', async () => {
    const budgetPath = resolve(PROJECT_ROOT, 'app/config/perf-budgets.json');
    await expect(access(budgetPath)).resolves.not.toThrow();

    const content = await readFile(budgetPath, 'utf8');
    const budgets = JSON.parse(content);

    expect(budgets).toHaveProperty('version');
    expect(budgets).toHaveProperty('budgets');
    expect(budgets.budgets).toHaveProperty('wsap');
    expect(budgets.budgets).toHaveProperty('registry');
  });

  it('should enforce budgets via perf-gate.sh', async () => {
    // First collect logs
    await execAsync('node scripts/perf/collect.mjs', {
      cwd: PROJECT_ROOT,
      maxBuffer: 10 * 1024 * 1024,
    });

    // Try to evaluate budgets (may fail if budgets exceeded, which is OK)
    try {
      const { stdout } = await execAsync(
        './app/ci/perf-gate.sh --log artifacts/perf/latest.jsonl --tool wsap --step import --budgets app/config/perf-budgets.json',
        {
          cwd: PROJECT_ROOT,
          maxBuffer: 10 * 1024 * 1024,
        }
      );

      expect(stdout).toContain('CI Perf Gate: wsap/import');
      expect(stdout).toContain('samples=');
      expect(stdout).toContain('avg=');
      expect(stdout).toContain('p95=');
    } catch (error) {
      // Budget failure is expected and OK
      expect(error.stdout).toContain('CI Perf Gate: wsap/import');
      expect(error.stdout).toContain('FAIL');
    }
  });
});

describe('CI Workflow', () => {
  it('should have ci-perf.yml workflow', async () => {
    const workflowPath = resolve(PROJECT_ROOT, '.github/workflows/ci-perf.yml');
    await expect(access(workflowPath)).resolves.not.toThrow();

    const content = await readFile(workflowPath, 'utf8');
    
    expect(content).toContain('name: CI Performance Gate');
    expect(content).toContain('Collect performance logs');
    expect(content).toContain('Evaluate WSAP budgets');
    expect(content).toContain('Evaluate Registry budgets');
  });
});

describe('Performance Validation', () => {
  it('should validate the complete pipeline', async () => {
    const { stdout } = await execAsync('node scripts/perf/validate.mjs --quick', {
      cwd: PROJECT_ROOT,
      maxBuffer: 10 * 1024 * 1024,
    });

    expect(stdout).toContain('Performance System Validation');
    expect(stdout).toContain('Collected');
    expect(stdout).toContain('performance entries');
    expect(stdout).toContain('Validation Summary');
  }, 60000); // 60 second timeout
});

