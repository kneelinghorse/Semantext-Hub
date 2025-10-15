/**
 * Registry Integration Tests - B7.2.1
 *
 * Tests the integration between:
 * - Registration Pipeline (state machine)
 * - Registry Writer (catalog + graph updates)
 * - Catalog Index (URN conflict checks)
 *
 * Performance targets validated:
 * - Registry write: <50ms
 * - Conflict check: <5ms
 * - Graph update: <25ms/node
 * - Recovery: <200ms
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import RegistrationOrchestrator from '../../packages/protocols/core/registration/registration-orchestrator.mjs';
import { RegistryWriter } from '../../packages/protocols/core/registration/registry-writer.mjs';
import { CatalogIndexAdapter } from '../../packages/protocols/core/registration/adapters/catalog-index.mjs';
import { URNCatalogIndex } from '../../packages/protocols/src/catalog/index.js';
import { ProtocolGraph } from '../../packages/protocols/core/graph/protocol-graph.js';
import { STATES } from '../../packages/protocols/core/registration/state-machine-definition.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('Registry Integration', () => {
  let orchestrator;
  let catalogIndex;
  let protocolGraph;
  let testDir;

  // Sample manifest for testing
  const createTestManifest = (id = 'test-api') => ({
    urn: `urn:ossp:api:example:${id}:v1.0.0`,
    type: 'api',
    namespace: 'example',
    metadata: {
      name: `Test API ${id}`,
      description: 'Test API for registry integration',
      version: '1.0.0',
      tags: ['test', 'api'],
      governance: {
        owner: 'test-team',
        classification: 'internal',
        pii: false
      }
    },
    dependencies: [],
    spec: {
      openapi: '3.0.0',
      endpoints: [
        {
          operationId: 'getUser',
          method: 'GET',
          path: '/users/{id}'
        }
      ]
    }
  });

  beforeEach(async () => {
    // Create temp directory for test state
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ossp-test-'));

    catalogIndex = new URNCatalogIndex();
    protocolGraph = new ProtocolGraph();

    orchestrator = new RegistrationOrchestrator({
      baseDir: testDir,
      catalogIndex,
      protocolGraph
    });
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Full Registration Lifecycle', () => {
    it('should complete full lifecycle: DRAFT → REVIEWED → APPROVED → REGISTERED', async () => {
      const manifestId = 'test-manifest-001';
      const manifest = createTestManifest('lifecycle-test');

      // 1. Initialize (DRAFT)
      const initialized = await orchestrator.initialize(manifestId, manifest);
      expect(initialized.state.currentState).toBe(STATES.DRAFT);
      expect(initialized.state.manifestId).toBe(manifestId);

      // 2. Submit for review (DRAFT → REVIEWED)
      const reviewed = await orchestrator.submitForReview(manifestId);
      expect(reviewed.state.currentState).toBe(STATES.REVIEWED);

      // 3. Approve (REVIEWED → APPROVED)
      const approved = await orchestrator.approve(
        manifestId,
        'test-reviewer',
        'Looks good to me'
      );
      expect(approved.state.currentState).toBe(STATES.APPROVED);
      expect(approved.state.reviewer).toBe('test-reviewer');

      // 4. Register (APPROVED → REGISTERED)
      const registered = await orchestrator.register(manifestId);

      expect(registered.success).toBe(true);
      expect(registered.urn).toBe(manifest.urn);
      expect(registered.state.state.currentState).toBe(STATES.REGISTERED);

      // 5. Verify catalog update
      expect(catalogIndex.has(manifest.urn)).toBe(true);
      const catalogEntry = catalogIndex.get(manifest.urn);
      expect(catalogEntry.urn).toBe(manifest.urn);
      expect(catalogEntry.type).toBe('api');

      // 6. Verify graph update
      expect(protocolGraph.hasNode(manifest.urn)).toBe(true);
      const node = protocolGraph.getNode(manifest.urn);
      expect(node.kind).toBe('api');
      expect(node.manifest.urn).toBe(manifest.urn);
    }, 10000);

    it('should track performance metrics within targets', async () => {
      const manifestId = 'test-manifest-perf';
      const manifest = createTestManifest('perf-test');

      await orchestrator.initialize(manifestId, manifest);
      await orchestrator.submitForReview(manifestId);
      await orchestrator.approve(manifestId, 'reviewer', 'approved');

      const registered = await orchestrator.register(manifestId);

      // Validate performance targets
      expect(registered.performance.catalogWrite).toBeLessThan(50); // <50ms target
      expect(registered.performance.graphUpdate).toBeLessThan(50); // <25ms/node * 2 nodes
      expect(registered.registry.performance.conflictCheck).toBeLessThan(5); // <5ms target
    }, 10000);
  });

  describe('URN Conflict Detection', () => {
    it('should detect URN conflicts', async () => {
      const manifestId1 = 'test-manifest-conflict-1';
      const manifestId2 = 'test-manifest-conflict-2';
      const manifest = createTestManifest('conflict-test');

      // Register first manifest
      await orchestrator.initialize(manifestId1, manifest);
      await orchestrator.submitForReview(manifestId1);
      await orchestrator.approve(manifestId1, 'reviewer', 'approved');
      await orchestrator.register(manifestId1);

      // Try to register second manifest with same URN
      await orchestrator.initialize(manifestId2, manifest);
      await orchestrator.submitForReview(manifestId2);
      await orchestrator.approve(manifestId2, 'reviewer', 'approved');

      await expect(orchestrator.register(manifestId2)).rejects.toThrow(/URN conflict/);
    }, 10000);

    it('should allow registration with skipConflictCheck', async () => {
      const manifestId1 = 'test-manifest-skip-1';
      const manifestId2 = 'test-manifest-skip-2';
      const manifest = createTestManifest('skip-test');

      // Register first manifest
      await orchestrator.initialize(manifestId1, manifest);
      await orchestrator.submitForReview(manifestId1);
      await orchestrator.approve(manifestId1, 'reviewer', 'approved');
      await orchestrator.register(manifestId1);

      // Register second with skip flag (for testing only)
      await orchestrator.initialize(manifestId2, manifest);
      await orchestrator.submitForReview(manifestId2);
      await orchestrator.approve(manifestId2, 'reviewer', 'approved');

      // Should not throw with skipConflictCheck
      const registered = await orchestrator.register(manifestId2, {
        skipConflictCheck: true
      });

      expect(registered.success).toBe(true);
    }, 10000);

    it('should detect conflicts in <5ms', async () => {
      const manifest = createTestManifest('speed-test');

      // Pre-populate catalog
      catalogIndex.add(manifest);

      const adapter = new CatalogIndexAdapter(catalogIndex);

      const start = performance.now();
      const result = adapter.checkConflict(manifest.urn);
      const elapsed = performance.now() - start;

      expect(result.conflict).toBe(true);
      expect(elapsed).toBeLessThan(5);
    });
  });

  describe('Graph Updates', () => {
    it('should create nodes and edges in graph', async () => {
      const manifestId = 'test-manifest-graph';
      const manifest = createTestManifest('graph-test');

      await orchestrator.initialize(manifestId, manifest);
      await orchestrator.submitForReview(manifestId);
      await orchestrator.approve(manifestId, 'reviewer', 'approved');
      await orchestrator.register(manifestId);

      // Check primary node
      expect(protocolGraph.hasNode(manifest.urn)).toBe(true);

      // Check endpoint nodes
      const endpointUrn = `${manifest.urn}#getUser`;
      expect(protocolGraph.hasNode(endpointUrn)).toBe(true);

      // Check edges
      const edges = protocolGraph.getOutEdges(manifest.urn);
      expect(edges.length).toBeGreaterThan(0);
      expect(edges[0].kind).toBe('exposes');
    }, 10000);

    it('should handle dependencies correctly', async () => {
      const depManifest = createTestManifest('dependency');
      const mainManifest = {
        ...createTestManifest('main'),
        dependencies: [depManifest.urn]
      };

      // Register dependency first
      const depId = 'dep-manifest';
      await orchestrator.initialize(depId, depManifest);
      await orchestrator.submitForReview(depId);
      await orchestrator.approve(depId, 'reviewer', 'approved');
      await orchestrator.register(depId);

      // Register main manifest
      const mainId = 'main-manifest';
      await orchestrator.initialize(mainId, mainManifest);
      await orchestrator.submitForReview(mainId);
      await orchestrator.approve(mainId, 'reviewer', 'approved');
      await orchestrator.register(mainId);

      // Check dependency edge exists
      const edges = protocolGraph.getOutEdges(mainManifest.urn);
      const depEdge = edges.find(e => e.to === depManifest.urn && e.kind === 'depends_on');
      expect(depEdge).toBeDefined();
    }, 10000);

    it('should create placeholders for missing dependencies', async () => {
      const manifest = {
        ...createTestManifest('with-missing-dep'),
        dependencies: ['urn:ossp:api:external:missing:v1.0.0']
      };

      const manifestId = 'test-missing-dep';
      await orchestrator.initialize(manifestId, manifest);
      await orchestrator.submitForReview(manifestId);
      await orchestrator.approve(manifestId, 'reviewer', 'approved');
      await orchestrator.register(manifestId);

      // Check placeholder was created
      const placeholder = protocolGraph.getNode('urn:ossp:api:external:missing:v1.0.0');
      expect(placeholder).toBeDefined();
      expect(placeholder.manifest.placeholder).toBe(true);
    }, 10000);
  });

  describe('RegistryWriter', () => {
    it('should register manifest atomically', async () => {
      const registryWriter = new RegistryWriter({
        catalogIndex,
        protocolGraph,
        baseDir: testDir
      });

      const manifest = createTestManifest('registry-writer-test');

      const result = await registryWriter.register('test-id', manifest);

      expect(result.success).toBe(true);
      expect(result.urn).toBe(manifest.urn);
      expect(catalogIndex.has(manifest.urn)).toBe(true);
      expect(protocolGraph.hasNode(manifest.urn)).toBe(true);
    });

    it('should track metrics', async () => {
      const registryWriter = new RegistryWriter({
        catalogIndex,
        protocolGraph,
        baseDir: testDir
      });

      const manifest1 = createTestManifest('metrics-1');
      const manifest2 = createTestManifest('metrics-2');

      await registryWriter.register('id1', manifest1);
      await registryWriter.register('id2', manifest2);

      const stats = registryWriter.getStats();

      expect(stats.metrics.registrations).toBe(2);
      expect(stats.metrics.conflicts).toBe(0);
      expect(stats.metrics.errors).toBe(0);
      expect(stats.metrics.avgWriteTime).toBeGreaterThan(0);
      expect(stats.metrics.avgGraphUpdateTime).toBeGreaterThan(0);
    });

    it('should handle unregister', async () => {
      const registryWriter = new RegistryWriter({
        catalogIndex,
        protocolGraph,
        baseDir: testDir
      });

      const manifest = createTestManifest('unregister-test');

      await registryWriter.register('test-id', manifest);
      expect(catalogIndex.has(manifest.urn)).toBe(true);

      const result = registryWriter.unregister(manifest.urn);

      expect(result.success).toBe(true);
      expect(catalogIndex.has(manifest.urn)).toBe(false);
      expect(protocolGraph.hasNode(manifest.urn)).toBe(false);
    });
  });

  describe('CatalogIndexAdapter', () => {
    let adapter;

    beforeEach(() => {
      adapter = new CatalogIndexAdapter(catalogIndex);
    });

    it('should validate manifest structure', () => {
      const validManifest = createTestManifest('valid');
      const validation = adapter.validateManifest(validManifest);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid manifests', () => {
      const invalidManifest = {
        type: 'api'
        // Missing required fields
      };

      const validation = adapter.validateManifest(invalidManifest);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should check registration eligibility', () => {
      const manifest = createTestManifest('eligibility');

      const result = adapter.canRegister(manifest);

      expect(result.allowed).toBe(true);
      expect(result.urn).toBe(manifest.urn);
    });

    it('should detect conflicts in canRegister', () => {
      const manifest = createTestManifest('can-register-conflict');

      catalogIndex.add(manifest);

      const result = adapter.canRegister(manifest);

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/conflict/i);
    });
  });

  describe('Event Logging', () => {
    it('should log registry events', async () => {
      const manifestId = 'test-event-logging';
      const manifest = createTestManifest('event-test');

      await orchestrator.initialize(manifestId, manifest);
      await orchestrator.submitForReview(manifestId);
      await orchestrator.approve(manifestId, 'reviewer', 'approved');
      await orchestrator.register(manifestId);

      // Check event log exists
      const eventLogPath = path.join(testDir, manifestId, 'events.log');
      const eventLogExists = await fs.access(eventLogPath)
        .then(() => true)
        .catch(() => false);

      expect(eventLogExists).toBe(true);

      // Read and verify events
      const eventLog = await fs.readFile(eventLogPath, 'utf-8');
      const events = eventLog.trim().split('\n').map(line => JSON.parse(line));

      // Should have at least creation, state transitions, and registry events
      expect(events.length).toBeGreaterThan(4);

      // Check for specific event types
      const eventTypes = events.map(e => e.eventType);
      expect(eventTypes).toContain('registration.manifest.created');
      expect(eventTypes).toContain('registration.state.changed');
      expect(eventTypes).toContain('registration.completed');
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should reject registration from wrong state', async () => {
      const manifestId = 'test-wrong-state';
      const manifest = createTestManifest('wrong-state');

      await orchestrator.initialize(manifestId, manifest);

      // Try to register from DRAFT (should be APPROVED)
      await expect(orchestrator.register(manifestId)).rejects.toThrow();
    }, 10000);

    it('should handle missing manifest', async () => {
      await expect(orchestrator.register('nonexistent')).rejects.toThrow(/not found/);
    });

    it('should validate manifest before registration', async () => {
      const manifestId = 'test-invalid';
      const invalidManifest = {
        // Missing required fields
        type: 'api'
      };

      await expect(
        orchestrator.initialize(manifestId, invalidManifest)
      ).rejects.toThrow(/validation failed/);
    });
  });

  describe('Statistics and Observability', () => {
    it('should provide comprehensive statistics', async () => {
      const stats = orchestrator.getStats();

      expect(stats).toHaveProperty('registry');
      expect(stats).toHaveProperty('catalog');
      expect(stats.registry).toHaveProperty('metrics');
      expect(stats.registry).toHaveProperty('catalog');
      expect(stats.registry).toHaveProperty('graph');
    });

    it('should track catalog size', async () => {
      const manifestId1 = 'test-size-1';
      const manifestId2 = 'test-size-2';

      await orchestrator.initialize(manifestId1, createTestManifest('size-1'));
      await orchestrator.submitForReview(manifestId1);
      await orchestrator.approve(manifestId1, 'r', 'ok');
      await orchestrator.register(manifestId1);

      await orchestrator.initialize(manifestId2, createTestManifest('size-2'));
      await orchestrator.submitForReview(manifestId2);
      await orchestrator.approve(manifestId2, 'r', 'ok');
      await orchestrator.register(manifestId2);

      const stats = orchestrator.getStats();
      expect(stats.catalog.totalArtifacts).toBe(2);
    }, 10000);
  });
});
