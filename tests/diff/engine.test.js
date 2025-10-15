/**
 * Tests for DiffEngine
 */

import { DiffEngine, ChangeType, ImpactLevel } from '../../packages/protocols/diff/engine.js';

describe('DiffEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new DiffEngine();
  });

  describe('API Protocol Diffs', () => {
    test('should detect removed endpoints', () => {
      const oldManifest = {
        metadata: { kind: 'api', version: '1.0.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/users' },
            { method: 'POST', path: '/users' }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'api', version: '2.0.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/users' }
          ]
        }
      };

      const diff = engine.diff(oldManifest, newManifest);

      expect(diff.summary.hasBreakingChanges).toBe(true);
      expect(diff.changes.breaking.length).toBeGreaterThan(0);

      const removedEndpoint = diff.changes.breaking.find(c =>
        c.type === ChangeType.REMOVED && c.description.includes('POST /users')
      );
      expect(removedEndpoint).toBeDefined();
    });

    test('should detect added endpoints as compatible', () => {
      const oldManifest = {
        metadata: { kind: 'api', version: '1.0.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/users' }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'api', version: '1.1.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/users' },
            { method: 'DELETE', path: '/users/:id' }
          ]
        }
      };

      const diff = engine.diff(oldManifest, newManifest);

      expect(diff.summary.hasBreakingChanges).toBe(false);
      expect(diff.changes.compatible.length).toBeGreaterThan(0);

      const addedEndpoint = diff.changes.compatible.find(c =>
        c.type === ChangeType.ADDED && c.description.includes('DELETE')
      );
      expect(addedEndpoint).toBeDefined();
    });

    test('should detect endpoint schema changes', () => {
      const oldManifest = {
        metadata: { kind: 'api', version: '1.0.0' },
        catalog: {
          endpoints: [
            {
              method: 'POST',
              path: '/users',
              request: {
                properties: {
                  name: { type: 'string' }
                },
                required: ['name']
              }
            }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'api', version: '2.0.0' },
        catalog: {
          endpoints: [
            {
              method: 'POST',
              path: '/users',
              request: {
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string' }
                },
                required: ['name', 'email']
              }
            }
          ]
        }
      };

      const diff = engine.diff(oldManifest, newManifest);

      expect(diff.summary.hasBreakingChanges).toBe(true);

      const requiredFieldAdded = diff.changes.breaking.find(c =>
        c.description.includes('required field') && c.description.includes('email')
      );
      expect(requiredFieldAdded).toBeDefined();
    });

    test('should detect authentication changes', () => {
      const oldManifest = {
        metadata: { kind: 'api', version: '1.0.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/data', auth: 'none' }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'api', version: '2.0.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/data', auth: 'bearer' }
          ]
        }
      };

      const diff = engine.diff(oldManifest, newManifest);

      expect(diff.summary.hasBreakingChanges).toBe(true);

      const authChange = diff.changes.breaking.find(c =>
        c.path.includes('auth')
      );
      expect(authChange).toBeDefined();
    });
  });

  describe('Data Protocol Diffs', () => {
    test('should detect removed tables', () => {
      const oldManifest = {
        metadata: { kind: 'data', version: '1.0.0' },
        service: {
          tables: [
            { name: 'users', columns: [] },
            { name: 'orders', columns: [] }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'data', version: '2.0.0' },
        service: {
          tables: [
            { name: 'users', columns: [] }
          ]
        }
      };

      const diff = engine.diff(oldManifest, newManifest);

      expect(diff.summary.hasBreakingChanges).toBe(true);

      const removedTable = diff.changes.breaking.find(c =>
        c.description.includes('Table removed') && c.description.includes('orders')
      );
      expect(removedTable).toBeDefined();
    });

    test('should detect column type changes', () => {
      const oldManifest = {
        metadata: { kind: 'data', version: '1.0.0' },
        service: {
          tables: [
            {
              name: 'users',
              columns: [
                { name: 'age', type: 'integer', nullable: false }
              ]
            }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'data', version: '2.0.0' },
        service: {
          tables: [
            {
              name: 'users',
              columns: [
                { name: 'age', type: 'varchar', nullable: false }
              ]
            }
          ]
        }
      };

      const diff = engine.diff(oldManifest, newManifest);

      expect(diff.summary.hasBreakingChanges).toBe(true);

      const typeChange = diff.changes.breaking.find(c =>
        c.description.includes('type changed')
      );
      expect(typeChange).toBeDefined();
    });

    test('should detect nullable to non-nullable changes', () => {
      const oldManifest = {
        metadata: { kind: 'data', version: '1.0.0' },
        service: {
          tables: [
            {
              name: 'users',
              columns: [
                { name: 'email', type: 'varchar', nullable: true }
              ]
            }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'data', version: '2.0.0' },
        service: {
          tables: [
            {
              name: 'users',
              columns: [
                { name: 'email', type: 'varchar', nullable: false }
              ]
            }
          ]
        }
      };

      const diff = engine.diff(oldManifest, newManifest);

      expect(diff.summary.hasBreakingChanges).toBe(true);

      const nullableChange = diff.changes.breaking.find(c =>
        c.description.includes('non-nullable')
      );
      expect(nullableChange).toBeDefined();
    });

    test('should categorize nullable column additions as compatible', () => {
      const oldManifest = {
        metadata: { kind: 'data', version: '1.0.0' },
        service: {
          tables: [
            {
              name: 'users',
              columns: [
                { name: 'id', type: 'integer' }
              ]
            }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'data', version: '1.1.0' },
        service: {
          tables: [
            {
              name: 'users',
              columns: [
                { name: 'id', type: 'integer' },
                { name: 'email', type: 'varchar', nullable: true }
              ]
            }
          ]
        }
      };

      const diff = engine.diff(oldManifest, newManifest);

      expect(diff.summary.hasBreakingChanges).toBe(false);

      const addedColumn = diff.changes.compatible.find(c =>
        c.description.includes('Column added')
      );
      expect(addedColumn).toBeDefined();
    });

    test('should categorize non-nullable column additions as breaking', () => {
      const oldManifest = {
        metadata: { kind: 'data', version: '1.0.0' },
        service: {
          tables: [
            {
              name: 'users',
              columns: [
                { name: 'id', type: 'integer' }
              ]
            }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'data', version: '2.0.0' },
        service: {
          tables: [
            {
              name: 'users',
              columns: [
                { name: 'id', type: 'integer' },
                { name: 'email', type: 'varchar', nullable: false }
              ]
            }
          ]
        }
      };

      const diff = engine.diff(oldManifest, newManifest);

      expect(diff.summary.hasBreakingChanges).toBe(true);

      const addedColumn = diff.changes.breaking.find(c =>
        c.description.includes('Column added')
      );
      expect(addedColumn).toBeDefined();
    });
  });

  describe('Event Protocol Diffs', () => {
    test('should detect removed events', () => {
      const oldManifest = {
        metadata: { kind: 'event', version: '1.0.0' },
        events: [
          { name: 'user.created' },
          { name: 'user.deleted' }
        ]
      };

      const newManifest = {
        metadata: { kind: 'event', version: '2.0.0' },
        events: [
          { name: 'user.created' }
        ]
      };

      const diff = engine.diff(oldManifest, newManifest);

      expect(diff.summary.hasBreakingChanges).toBe(true);

      const removedEvent = diff.changes.breaking.find(c =>
        c.description.includes('Event removed') && c.description.includes('user.deleted')
      );
      expect(removedEvent).toBeDefined();
    });

    test('should detect added events as compatible', () => {
      const oldManifest = {
        metadata: { kind: 'event', version: '1.0.0' },
        events: [
          { name: 'user.created' }
        ]
      };

      const newManifest = {
        metadata: { kind: 'event', version: '1.1.0' },
        events: [
          { name: 'user.created' },
          { name: 'user.updated' }
        ]
      };

      const diff = engine.diff(oldManifest, newManifest);

      expect(diff.summary.hasBreakingChanges).toBe(false);

      const addedEvent = diff.changes.compatible.find(c =>
        c.description.includes('Event added')
      );
      expect(addedEvent).toBeDefined();
    });
  });

  describe('Summary Statistics', () => {
    test('should calculate correct summary statistics', () => {
      const oldManifest = {
        metadata: { kind: 'api', version: '1.0.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/users' },
            { method: 'POST', path: '/users' }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'api', version: '2.0.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/users' },
            { method: 'DELETE', path: '/users/:id' }
          ]
        }
      };

      const diff = engine.diff(oldManifest, newManifest);

      expect(diff.summary.totalChanges).toBeGreaterThan(0);
      expect(diff.summary.breaking).toBe(diff.changes.breaking.length);
      expect(diff.summary.compatible).toBe(diff.changes.compatible.length);
      expect(diff.summary.hasBreakingChanges).toBe(diff.changes.breaking.length > 0);
    });

    test('should group changes by type', () => {
      const oldManifest = {
        metadata: { kind: 'api', version: '1.0.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/users' }
          ]
        }
      };

      const newManifest = {
        metadata: { kind: 'api', version: '2.0.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/users' },
            { method: 'POST', path: '/users' }
          ]
        }
      };

      const diff = engine.diff(oldManifest, newManifest);

      expect(diff.summary.changesByType).toBeDefined();
      expect(diff.summary.changesByType[ChangeType.ADDED]).toBeGreaterThan(0);
    });
  });

  describe('Engine Options', () => {
    test('should respect includeMetadata option', () => {
      const engineNoMetadata = new DiffEngine({ includeMetadata: false });

      const oldManifest = {
        metadata: { kind: 'api', version: '1.0.0', author: 'old' },
        catalog: { endpoints: [] }
      };

      const newManifest = {
        metadata: { kind: 'api', version: '2.0.0', author: 'new' },
        catalog: { endpoints: [] }
      };

      const diff = engineNoMetadata.diff(oldManifest, newManifest);

      // Should not include metadata changes
      const metadataChanges = [...diff.changes.breaking, ...diff.changes.internal]
        .filter(c => c.path.startsWith('metadata'));

      expect(metadataChanges.length).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty manifests', () => {
      const diff = engine.diff({}, {});

      expect(diff.summary.totalChanges).toBe(0);
      expect(diff.summary.hasBreakingChanges).toBe(false);
    });

    test('should handle manifests with only metadata', () => {
      const oldManifest = {
        metadata: { kind: 'api', version: '1.0.0' }
      };

      const newManifest = {
        metadata: { kind: 'api', version: '2.0.0' }
      };

      const diff = engine.diff(oldManifest, newManifest);

      expect(diff.oldVersion).toBe('1.0.0');
      expect(diff.newVersion).toBe('2.0.0');
    });

    test('should handle identical manifests', () => {
      const manifest = {
        metadata: { kind: 'api', version: '1.0.0' },
        catalog: {
          endpoints: [
            { method: 'GET', path: '/users' }
          ]
        }
      };

      const diff = engine.diff(manifest, manifest);

      expect(diff.summary.totalChanges).toBe(0);
      expect(diff.summary.hasBreakingChanges).toBe(false);
    });
  });
});
