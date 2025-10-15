/**
 * Registration Pipeline Tests
 *
 * Tests for the complete registration lifecycle state machine
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import RegistrationPipeline from '../../packages/protocols/core/registration/registration-pipeline.js';
import {
  STATES,
  EVENTS
} from '../../packages/protocols/core/registration/state-machine-definition.js';
import { OptimisticLockException } from '../../packages/protocols/core/registration/optimistic-lock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test base directory
const TEST_BASE_DIR = path.join(__dirname, '..', '..', 'fixtures', 'registration', 'test-state');

describe('RegistrationPipeline', () => {
  let pipeline;

  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
    } catch (error) {
      // Ignore if doesn't exist
    }

    pipeline = new RegistrationPipeline({ baseDir: TEST_BASE_DIR });
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
    } catch (error) {
      // Ignore
    }
  });

  describe('initialize', () => {
    test('should create a new manifest in DRAFT state', async () => {
      const manifestId = 'test-manifest-001';
      const manifest = {
        urn: 'urn:proto:api:test/service@1.0.0',
        kind: 'API',
        title: 'Test Service'
      };

      const state = await pipeline.initialize(manifestId, manifest);

      expect(state).toBeDefined();
      expect(state.version).toBe(1);
      expect(state.state.currentState).toBe(STATES.DRAFT);
      expect(state.state.manifestId).toBe(manifestId);
      expect(state.state.manifest).toEqual(manifest);
      expect(state.state.createdAt).toBeDefined();
    });

    test('should throw error if manifestId is missing', async () => {
      await expect(pipeline.initialize(null, {})).rejects.toThrow('manifestId is required');
    });

    test('should throw error if manifest is missing', async () => {
      await expect(pipeline.initialize('test-001', null)).rejects.toThrow('manifest is required');
    });

    test('should throw error if manifest already exists', async () => {
      const manifestId = 'test-manifest-002';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);

      await expect(pipeline.initialize(manifestId, manifest))
        .rejects.toThrow(`Manifest ${manifestId} already exists`);
    });

    test('should emit initialized event', async () => {
      const manifestId = 'test-manifest-003';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      const eventPromise = new Promise((resolve) => {
        pipeline.on('initialized', (data) => resolve(data));
      });

      await pipeline.initialize(manifestId, manifest);

      const eventData = await eventPromise;
      expect(eventData.manifestId).toBe(manifestId);
      expect(eventData.state.version).toBe(1);
    });
  });

  describe('submitForReview', () => {
    test('should transition from DRAFT to REVIEWED', async () => {
      const manifestId = 'test-manifest-010';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);
      const state = await pipeline.submitForReview(manifestId);

      expect(state.state.currentState).toBe(STATES.REVIEWED);
      expect(state.version).toBe(2);
      expect(state.state.lastTransition.from).toBe(STATES.DRAFT);
      expect(state.state.lastTransition.to).toBe(STATES.REVIEWED);
    });

    test('should emit stateChange event', async () => {
      const manifestId = 'test-manifest-011';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);

      const eventPromise = new Promise((resolve) => {
        pipeline.on('stateChange', (data) => resolve(data));
      });

      await pipeline.submitForReview(manifestId);

      const eventData = await eventPromise;
      expect(eventData.fromState).toBe(STATES.DRAFT);
      expect(eventData.toState).toBe(STATES.REVIEWED);
      expect(eventData.manifestId).toBe(manifestId);
    });

    test('should fail if manifest URN is missing', async () => {
      const manifestId = 'test-manifest-012';
      const manifest = { title: 'Missing URN' };

      await pipeline.initialize(manifestId, manifest);

      await expect(pipeline.submitForReview(manifestId))
        .rejects.toThrow('Manifest must have a valid URN');
    });
  });

  describe('approve', () => {
    test('should transition from REVIEWED to APPROVED', async () => {
      const manifestId = 'test-manifest-020';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);
      await pipeline.submitForReview(manifestId);

      const state = await pipeline.approve(manifestId, 'alice@example.com', 'Looks good!');

      expect(state.state.currentState).toBe(STATES.APPROVED);
      expect(state.state.reviewer).toBe('alice@example.com');
      expect(state.state.reviewNotes).toBe('Looks good!');
      expect(state.version).toBe(3);
    });

    test('should fail if reviewer is missing', async () => {
      const manifestId = 'test-manifest-021';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);
      await pipeline.submitForReview(manifestId);

      await expect(pipeline.transitionState(manifestId, EVENTS.APPROVE, {}))
        .rejects.toThrow('Reviewer identity is required');
    });

    test('should fail if review notes are missing', async () => {
      const manifestId = 'test-manifest-022';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);
      await pipeline.submitForReview(manifestId);

      await expect(pipeline.transitionState(manifestId, EVENTS.APPROVE, { reviewer: 'alice@example.com' }))
        .rejects.toThrow('Review notes are required for approval');
    });
  });

  describe('reject', () => {
    test('should transition from REVIEWED to REJECTED', async () => {
      const manifestId = 'test-manifest-030';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);
      await pipeline.submitForReview(manifestId);

      const state = await pipeline.reject(manifestId, 'Missing required fields');

      expect(state.state.currentState).toBe(STATES.REJECTED);
      expect(state.state.rejectionReason).toBe('Missing required fields');
    });

    test('should fail if rejection reason is missing', async () => {
      const manifestId = 'test-manifest-031';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);
      await pipeline.submitForReview(manifestId);

      await expect(pipeline.transitionState(manifestId, EVENTS.REJECT, {}))
        .rejects.toThrow('Rejection reason is required');
    });
  });

  describe('register', () => {
    test('should transition from APPROVED to REGISTERED', async () => {
      const manifestId = 'test-manifest-040';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);
      await pipeline.submitForReview(manifestId);
      await pipeline.approve(manifestId, 'alice@example.com', 'Approved');

      const state = await pipeline.register(manifestId);

      expect(state.state.currentState).toBe(STATES.REGISTERED);
    });

    test('should fail if URN conflict detected', async () => {
      const manifestId = 'test-manifest-041';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);
      await pipeline.submitForReview(manifestId);
      await pipeline.approve(manifestId, 'alice@example.com', 'Approved');

      await expect(pipeline.register(manifestId, { conflictingUrn: 'urn:proto:api:test/service@1.0.0' }))
        .rejects.toThrow('URN conflict detected');
    });
  });

  describe('revertToDraft', () => {
    test('should transition from REVIEWED to DRAFT', async () => {
      const manifestId = 'test-manifest-050';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);
      await pipeline.submitForReview(manifestId);

      const state = await pipeline.revertToDraft(manifestId);

      expect(state.state.currentState).toBe(STATES.DRAFT);
    });

    test('should transition from REJECTED to DRAFT', async () => {
      const manifestId = 'test-manifest-051';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);
      await pipeline.submitForReview(manifestId);
      await pipeline.reject(manifestId, 'Needs work');

      const state = await pipeline.revertToDraft(manifestId);

      expect(state.state.currentState).toBe(STATES.DRAFT);
    });
  });

  describe('loadState', () => {
    test('should load existing state', async () => {
      const manifestId = 'test-manifest-060';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);

      const state = await pipeline.loadState(manifestId);

      expect(state).toBeDefined();
      expect(state.state.manifestId).toBe(manifestId);
      expect(state.state.currentState).toBe(STATES.DRAFT);
    });

    test('should return null for non-existent manifest', async () => {
      const state = await pipeline.loadState('non-existent');
      expect(state).toBeNull();
    });
  });

  describe('getCurrentState', () => {
    test('should return current state value', async () => {
      const manifestId = 'test-manifest-070';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);
      await pipeline.submitForReview(manifestId);

      const currentState = await pipeline.getCurrentState(manifestId);

      expect(currentState).toBe(STATES.REVIEWED);
    });

    test('should return null for non-existent manifest', async () => {
      const currentState = await pipeline.getCurrentState('non-existent');
      expect(currentState).toBeNull();
    });
  });

  describe('isInTerminalState', () => {
    test('should return true for REGISTERED state', async () => {
      const manifestId = 'test-manifest-080';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);
      await pipeline.submitForReview(manifestId);
      await pipeline.approve(manifestId, 'alice@example.com', 'Approved');
      await pipeline.register(manifestId);

      const isTerminal = await pipeline.isInTerminalState(manifestId);

      expect(isTerminal).toBe(true);
    });

    test('should return false for non-terminal states', async () => {
      const manifestId = 'test-manifest-081';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);

      const isTerminal = await pipeline.isInTerminalState(manifestId);

      expect(isTerminal).toBe(false);
    });
  });

  describe('invalid transitions', () => {
    test('should reject invalid transition from DRAFT to APPROVED', async () => {
      const manifestId = 'test-manifest-090';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);

      await expect(pipeline.transitionState(manifestId, EVENTS.APPROVE, {
        reviewer: 'alice@example.com',
        reviewNotes: 'Skipping review'
      })).rejects.toThrow("Event 'approve' not allowed in state 'DRAFT'");
    });

    test('should reject transition from REGISTERED (terminal state)', async () => {
      const manifestId = 'test-manifest-091';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);
      await pipeline.submitForReview(manifestId);
      await pipeline.approve(manifestId, 'alice@example.com', 'Approved');
      await pipeline.register(manifestId);

      await expect(pipeline.submitForReview(manifestId))
        .rejects.toThrow("No transitions defined for state");
    });
  });

  describe('complete lifecycle', () => {
    test('should complete full DRAFT → REVIEWED → APPROVED → REGISTERED flow', async () => {
      const manifestId = 'test-manifest-100';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      // Initialize
      const s1 = await pipeline.initialize(manifestId, manifest);
      expect(s1.state.currentState).toBe(STATES.DRAFT);
      expect(s1.version).toBe(1);

      // Submit for review
      const s2 = await pipeline.submitForReview(manifestId);
      expect(s2.state.currentState).toBe(STATES.REVIEWED);
      expect(s2.version).toBe(2);

      // Approve
      const s3 = await pipeline.approve(manifestId, 'alice@example.com', 'All checks passed');
      expect(s3.state.currentState).toBe(STATES.APPROVED);
      expect(s3.version).toBe(3);

      // Register
      const s4 = await pipeline.register(manifestId);
      expect(s4.state.currentState).toBe(STATES.REGISTERED);
      expect(s4.version).toBe(4);
    });

    test('should handle rejection and retry flow', async () => {
      const manifestId = 'test-manifest-101';
      const manifest = { urn: 'urn:proto:api:test/service@1.0.0' };

      await pipeline.initialize(manifestId, manifest);
      await pipeline.submitForReview(manifestId);

      // Reject
      const s1 = await pipeline.reject(manifestId, 'Missing documentation');
      expect(s1.state.currentState).toBe(STATES.REJECTED);

      // Revert to draft
      const s2 = await pipeline.revertToDraft(manifestId);
      expect(s2.state.currentState).toBe(STATES.DRAFT);

      // Resubmit
      const s3 = await pipeline.submitForReview(manifestId);
      expect(s3.state.currentState).toBe(STATES.REVIEWED);

      // Approve
      const s4 = await pipeline.approve(manifestId, 'bob@example.com', 'Fixed!');
      expect(s4.state.currentState).toBe(STATES.APPROVED);
    });
  });
});
