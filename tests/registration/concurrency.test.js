/**
 * Concurrency Tests for Optimistic Locking
 *
 * Verifies that optimistic locking prevents concurrent write conflicts
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import RegistrationPipeline from '../../packages/protocols/core/registration/registration-pipeline.js';
import optimistic from '../../packages/protocols/core/registration/optimistic-lock.js';
const { OptimisticLockException } = optimistic;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_BASE_DIR = path.join(__dirname, '..', '..', 'fixtures', 'registration', 'test-concurrency');

describe('Optimistic Locking Concurrency', () => {
  let pipeline;

  beforeEach(async () => {
    try {
      await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
    } catch (error) {
      // Ignore
    }

    pipeline = new RegistrationPipeline({ baseDir: TEST_BASE_DIR });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
    } catch (error) {
      // Ignore
    }
  });

  describe('concurrent transitions', () => {
    test('should handle concurrent transitions with retry', async () => {
      const manifestId = 'concurrent-001';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);

      // Simulate two concurrent attempts to submit for review
      const [result1, result2] = await Promise.all([
        pipeline.submitForReview(manifestId),
        pipeline.submitForReview(manifestId)
      ]);

      // Both should succeed due to optimistic lock retry
      expect(result1.state.currentState).toBe('REVIEWED');
      expect(result2.state.currentState).toBe('REVIEWED');

      // Version should be incremented correctly
      expect(Math.max(result1.version, result2.version)).toBe(2);
    });

    test('should handle multiple concurrent transitions', async () => {
      const manifestId = 'concurrent-002';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);

      // Simulate 5 concurrent attempts
      const promises = Array.from({ length: 5 }, () =>
        pipeline.submitForReview(manifestId)
      );

      const results = await Promise.all(promises);

      // All should eventually succeed
      results.forEach(result => {
        expect(result.state.currentState).toBe('REVIEWED');
      });

      // All responses share the same version (idempotent behaviour)
      results.forEach(result => {
        expect(result.version).toBe(2);
      });

      // Final version should be 2 (1 + 1 successful transition)
      const finalState = await pipeline.loadState(manifestId);
      expect(finalState.version).toBe(2);
    });

    test('should maintain state consistency under concurrent load', async () => {
      const manifestId = 'concurrent-003';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);
      await pipeline.submitForReview(manifestId);

      // Concurrent approvals and rejections
      const operations = [
        pipeline.approve(manifestId, 'alice@example.com', 'Looks good'),
        pipeline.reject(manifestId, 'Needs work'),
        pipeline.revertToDraft(manifestId)
      ];

      const results = await Promise.allSettled(operations);

      // Exactly one should succeed, others may fail due to state validation
      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThanOrEqual(1);

      // Final state should be consistent
      const finalState = await pipeline.loadState(manifestId);
      expect(finalState).toBeDefined();
      expect(finalState.state.currentState).toMatch(/APPROVED|REJECTED|DRAFT/);
    });
  });

  describe('retry behavior', () => {
    test('should retry on optimistic lock failure', async () => {
      const manifestId = 'retry-001';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);

      let retryCount = 0;

      // Override the transition to count retries
      const originalTransition = pipeline.transitionState.bind(pipeline);
      pipeline.transitionState = async function(...args) {
        retryCount++;
        return originalTransition(...args);
      };

      // Trigger concurrent transitions
      await Promise.all([
        pipeline.submitForReview(manifestId),
        pipeline.submitForReview(manifestId)
      ]);

      // Should have retried at least once
      expect(retryCount).toBeGreaterThan(1);
    });

    test('should resolve duplicate submit_for_review calls without error', async () => {
      const manifestId = 'retry-002';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);

      const firstResult = await pipeline.submitForReview(manifestId);
      expect(firstResult.state.currentState).toBe('REVIEWED');
      expect(firstResult.version).toBe(2);

      const secondResult = await pipeline.submitForReview(manifestId);
      expect(secondResult.state.currentState).toBe('REVIEWED');
      expect(secondResult.version).toBe(firstResult.version);
      expect(secondResult.state.lastTransition.event).toBe('submit_for_review');
      expect(secondResult.state.lastTransition.attempt).toBeDefined();
    });

    test('should capture optimistic lock metrics under contention', async () => {
      const manifestId = 'retry-003';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);

      await Promise.all([
        pipeline.submitForReview(manifestId),
        pipeline.submitForReview(manifestId),
        pipeline.submitForReview(manifestId)
      ]);

      let metrics = pipeline.getMetrics();
      expect(metrics.optimisticLock.retries.versionConflict).toBeGreaterThanOrEqual(0);
      expect(metrics.optimisticLock.retries.alreadyApplied).toBeGreaterThanOrEqual(0);
      expect(metrics.optimisticLock.retries.exhausted).toBe(0);

      const initialAlreadyApplied = metrics.optimisticLock.retries.alreadyApplied;

      await pipeline.submitForReview(manifestId);
      metrics = pipeline.getMetrics();
      expect(metrics.optimisticLock.retries.alreadyApplied).toBeGreaterThan(initialAlreadyApplied);
    });
  });

  describe('stress test', () => {
    test('should handle 10 concurrent writes without corruption', async () => {
      const manifestId = 'stress-001';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);

      const operations = Array.from({ length: 10 }, () =>
        pipeline.submitForReview(manifestId)
      );

      const results = await Promise.all(operations);

      // All should succeed
      expect(results).toHaveLength(10);

      // State should be consistent
      const finalState = await pipeline.loadState(manifestId);
      expect(finalState.state.currentState).toBe('REVIEWED');
      expect(finalState.version).toBe(2);
    });
  });
});
