/**
 * Workflow System Tests
 *
 * Tests for validator, state machine, and override system
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { validateManifest, isValidURN, isValidVersion } from '../../packages/runtime/workflow/validator.js';
import {
  STATES,
  isValidTransition,
  transition,
  approve,
  revertToDraft,
  deprecate,
  getNextStates,
  isTerminalState,
  StateTransitionError
} from '../../packages/runtime/workflow/state-machine.js';
import {
  applyOverrides,
  applyOverride,
  createSetOverride,
  createDeleteOverride,
  createMergeOverride,
  hasOverrides,
  getOverridePath,
  getOverrideHistory,
  saveOverrides,
  loadOverrides
} from '../../packages/runtime/workflow/overrides.js';

describe('Workflow System', () => {
  describe('Validator', () => {
    describe('URN Validation', () => {
      test('validates correct URN formats', () => {
        expect(isValidURN('urn:proto:api:petstore.com/catalog')).toBe(true);
        expect(isValidURN('urn:proto:api.endpoint:petstore.com/catalog/addPet@1.0.0')).toBe(true);
        expect(isValidURN('urn:proto:data:warehouse/users')).toBe(true);
        expect(isValidURN('urn:proto:event:stripe.com/payment.succeeded@^2.0.0')).toBe(true);
        expect(isValidURN('urn:proto:semantic:internal/taxonomy@0.1.0')).toBe(true);
      });

      test('rejects invalid URN formats', () => {
        expect(isValidURN('invalid')).toBe(false);
        expect(isValidURN('api:petstore')).toBe(false); // Missing 'urn:' prefix
        expect(isValidURN('urn:proto:unknownkind:item')).toBe(false);
        expect(isValidURN('urn:proto:api:missing-slash')).toBe(true); // Now valid without authority
        expect(isValidURN('urn:proto:api:bad authority/id')).toBe(false);
        expect(isValidURN('')).toBe(false);
        expect(isValidURN(null)).toBe(false);
        expect(isValidURN(undefined)).toBe(false);
      });
    });

    describe('Version Validation', () => {
      test('validates semantic versions', () => {
        expect(isValidVersion('1.0.0')).toBe(true);
        expect(isValidVersion('0.1.0')).toBe(true);
        expect(isValidVersion('10.20.30')).toBe(true);
        expect(isValidVersion('1.0.0-alpha')).toBe(true);
        expect(isValidVersion('1.0.0-beta.1')).toBe(true);
        expect(isValidVersion('1.0.0+build.123')).toBe(true);
        expect(isValidVersion('1.0.0-rc.1+build.456')).toBe(true);
      });

      test('rejects invalid versions', () => {
        expect(isValidVersion('1.0')).toBe(false);
        expect(isValidVersion('v1.0.0')).toBe(false);
        expect(isValidVersion('1')).toBe(false);
        expect(isValidVersion('invalid')).toBe(false);
        expect(isValidVersion('')).toBe(false);
        expect(isValidVersion(null)).toBe(false);
      });
    });

    describe('Manifest Validation', () => {
      test('validates minimal valid API contract', () => {
        const manifest = {
          metadata: {
            status: 'draft',
            urn: 'urn:proto:api:example.com/service@1.0.0',
            source: { type: 'openapi', imported_at: '2025-01-01T00:00:00Z' }
          },
          catalog: {
            type: 'rest',
            urn: 'urn:proto:api:example.com/service',
            endpoints: [
              {
                id: 'urn:proto:api.endpoint:example.com/service/get@1.0.0',
                pattern: '/test',
                method: 'GET'
              }
            ]
          },
          provenance: {
            importer: 'test',
            imported_at: '2025-01-01T00:00:00Z'
          }
        };

        const result = validateManifest(manifest);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      test('validates minimal valid Data contract', () => {
        const manifest = {
          metadata: {
            status: 'draft',
            source: { type: 'postgres', imported_at: '2025-01-01T00:00:00Z' }
          },
          service: {
            name: 'test-db',
            urn: 'urn:proto:data:warehouse/users',
            entities: [
              {
                id: 'urn:proto:data:warehouse/users/user@1.0.0',
                name: 'users',
                attributes: []
              }
            ]
          },
          provenance: {
            importer: 'test',
            imported_at: '2025-01-01T00:00:00Z'
          }
        };

        const result = validateManifest(manifest);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      test('rejects manifest with no contract type', () => {
        const manifest = {
          metadata: { status: 'draft' }
        };

        const result = validateManifest(manifest);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.field === 'contract_type')).toBe(true);
      });

      test('rejects manifest with both catalog and service', () => {
        const manifest = {
          metadata: { status: 'draft' },
          catalog: { type: 'rest', urn: 'urn:proto:api:example.com/service', endpoints: [] },
          service: { name: 'test', urn: 'urn:proto:data:example.com/table', entities: [] }
        };

        const result = validateManifest(manifest);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.field === 'contract_type')).toBe(true);
      });

      test('rejects invalid status', () => {
        const manifest = {
          metadata: { status: 'invalid-status' },
          catalog: {
            type: 'rest',
            urn: 'urn:proto:api:example.com/service',
            endpoints: []
          }
        };

        const result = validateManifest(manifest);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.field === 'metadata.status')).toBe(true);
      });

      test('validates endpoint structure', () => {
        const manifest = {
          metadata: { status: 'draft' },
          catalog: {
            type: 'rest',
            urn: 'urn:proto:api:example.com/service',
            endpoints: [
              { id: 'urn:proto:api.endpoint:example.com/service/item@1.0.0' } // Missing pattern and method
            ]
          }
        };

        const result = validateManifest(manifest);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.field.includes('pattern'))).toBe(true);
        expect(result.errors.some(e => e.field.includes('method'))).toBe(true);
      });

      test('warns about approved manifest without timestamp', () => {
        const manifest = {
          metadata: {
            status: 'approved' // No approved_at
          },
          catalog: {
            type: 'rest',
            urn: 'urn:proto:api:example.com/service',
            endpoints: []
          }
        };

        const result = validateManifest(manifest);
        expect(result.warnings.some(w => w.field === 'metadata.approved_at')).toBe(true);
      });
    });
  });

  describe('State Machine', () => {
    describe('State Transitions', () => {
      test('allows draft → approved', () => {
        expect(isValidTransition(STATES.DRAFT, STATES.APPROVED)).toBe(true);
      });

      test('allows approved → deprecated', () => {
        expect(isValidTransition(STATES.APPROVED, STATES.DEPRECATED)).toBe(true);
      });

      test('allows approved → draft (revert)', () => {
        expect(isValidTransition(STATES.APPROVED, STATES.DRAFT)).toBe(true);
      });

      test('blocks draft → deprecated', () => {
        expect(isValidTransition(STATES.DRAFT, STATES.DEPRECATED)).toBe(false);
      });

      test('blocks deprecated → any (terminal state)', () => {
        expect(isValidTransition(STATES.DEPRECATED, STATES.DRAFT)).toBe(false);
        expect(isValidTransition(STATES.DEPRECATED, STATES.APPROVED)).toBe(false);
      });
    });

    describe('Approve Transition', () => {
      test('transitions draft to approved', () => {
        const manifest = {
          metadata: { status: 'draft' }
        };

        const result = approve(manifest, { approvedBy: 'test-user' });

        expect(result.metadata.status).toBe('approved');
        expect(result.metadata.approved_at).toBeDefined();
        expect(result.metadata.approved_by).toBe('test-user');
        expect(result.metadata.state_history).toHaveLength(1);
        expect(result.metadata.state_history[0].from).toBe('draft');
        expect(result.metadata.state_history[0].to).toBe('approved');
      });

      test('throws error when approving non-draft without force', () => {
        const manifest = {
          metadata: { status: 'deprecated' }
        };

        expect(() => approve(manifest)).toThrow(StateTransitionError);
      });

      test('allows force approval', () => {
        const manifest = {
          metadata: { status: 'deprecated' }
        };

        const result = approve(manifest, { force: true });

        expect(result.metadata.status).toBe('approved');
        expect(result.metadata.state_history[0].forced).toBe(true);
      });

      test('no-op when already approved', () => {
        const manifest = {
          metadata: { status: 'approved', approved_at: '2025-01-01T00:00:00Z' }
        };

        const result = approve(manifest);

        expect(result.metadata.status).toBe('approved');
        expect(result.metadata.approved_at).toBe('2025-01-01T00:00:00Z'); // Unchanged
      });
    });

    describe('Revert to Draft', () => {
      test('reverts approved to draft', () => {
        const manifest = {
          metadata: {
            status: 'approved',
            approved_at: '2025-01-01T00:00:00Z',
            approved_by: 'user'
          }
        };

        const result = revertToDraft(manifest);

        expect(result.metadata.status).toBe('draft');
        expect(result.metadata.approved_at).toBeUndefined();
        expect(result.metadata.approved_by).toBeUndefined();
      });
    });

    describe('Deprecate', () => {
      test('deprecates manifest with reason', () => {
        const manifest = {
          metadata: { status: 'approved' }
        };

        const result = deprecate(manifest, { reason: 'Superseded by v2' });

        expect(result.metadata.status).toBe('deprecated');
        expect(result.metadata.deprecated_at).toBeDefined();
        expect(result.metadata.deprecation_reason).toBe('Superseded by v2');
      });
    });

    describe('State Queries', () => {
      test('returns next states for draft', () => {
        const manifest = { metadata: { status: 'draft' } };
        const nextStates = getNextStates(manifest);

        expect(nextStates).toContain('approved');
        expect(nextStates).toHaveLength(1);
      });

      test('identifies terminal state', () => {
        const deprecated = { metadata: { status: 'deprecated' } };
        const draft = { metadata: { status: 'draft' } };

        expect(isTerminalState(deprecated)).toBe(true);
        expect(isTerminalState(draft)).toBe(false);
      });
    });
  });

  describe('Override System', () => {
    describe('Set Override', () => {
      test('sets field value', () => {
        const manifest = {
          metadata: { status: 'draft' },
          catalog: { type: 'rest' }
        };

        const override = createSetOverride('catalog.type', 'graphql', 'Correcting type');
        const result = applyOverride(manifest, override);

        expect(result.catalog.type).toBe('graphql');
        expect(result.metadata.overrides).toHaveLength(1);
        expect(result.metadata.overrides[0].operation).toBe('set');
        expect(result.metadata.overrides[0].previous_value).toBe('rest');
        expect(result.metadata.overrides[0].new_value).toBe('graphql');
      });

      test('creates nested fields', () => {
        const manifest = {
          metadata: { status: 'draft' }
        };

        const override = createSetOverride('catalog.type', 'rest', 'Adding catalog');
        const result = applyOverride(manifest, override);

        expect(result.catalog.type).toBe('rest');
      });
    });

    describe('Delete Override', () => {
      test('deletes field', () => {
        const manifest = {
          metadata: { status: 'draft', unwanted: 'field' }
        };

        const override = createDeleteOverride('metadata.unwanted', 'Removing field');
        const result = applyOverride(manifest, override);

        expect(result.metadata.unwanted).toBeUndefined();
        expect(result.metadata.overrides[0].operation).toBe('delete');
      });
    });

    describe('Merge Override', () => {
      test('merges objects', () => {
        const manifest = {
          metadata: {
            status: 'draft',
            source: { type: 'openapi' }
          }
        };

        const override = createMergeOverride(
          'metadata.source',
          { version: '3.0.0', reference: 'api.yaml' },
          'Adding source details'
        );
        const result = applyOverride(manifest, override);

        expect(result.metadata.source.type).toBe('openapi');
        expect(result.metadata.source.version).toBe('3.0.0');
        expect(result.metadata.source.reference).toBe('api.yaml');
      });
    });

    describe('Multiple Overrides', () => {
      test('applies overrides in order', () => {
        const manifest = {
          metadata: { status: 'draft' },
          catalog: { type: 'rest' }
        };

        const overrides = [
          createSetOverride('catalog.type', 'graphql', 'Change 1'),
          createSetOverride('catalog.version', '2.0', 'Change 2'),
          createSetOverride('catalog.type', 'grpc', 'Change 3')
        ];

        const result = applyOverrides(manifest, overrides);

        expect(result.catalog.type).toBe('grpc');
        expect(result.catalog.version).toBe('2.0');
        expect(result.metadata.overrides).toHaveLength(3);
      });
    });

    describe('Override Detection', () => {
      test('detects manifest with overrides', () => {
        const manifest = {
          metadata: {
            overrides: [
              { operation: 'set', path: 'test', timestamp: '2025-01-01T00:00:00Z' }
            ]
          }
        };

        expect(hasOverrides(manifest)).toBe(true);
      });

      test('detects manifest without overrides', () => {
        const manifest = {
          metadata: {}
        };

        expect(hasOverrides(manifest)).toBe(false);
      });
    });

    describe('Override Utilities', () => {
      test('computes override file path', () => {
        expect(getOverridePath('artifacts/api-manifest.draft.json'))
          .toBe('artifacts/api-manifest.draft.overrides.json');
        expect(getOverridePath('artifacts/api-manifest.json'))
          .toBe('artifacts/api-manifest.overrides.json');
      });

      test('provides override history helper', () => {
        const manifest = {
          metadata: { status: 'draft' },
          catalog: { type: 'rest' }
        };

        const updated = applyOverride(manifest, createSetOverride('catalog.type', 'graphql', 'Update type'));
        const history = getOverrideHistory(updated);

        expect(history).toHaveLength(1);
        expect(history[0].path).toBe('catalog.type');
        expect(history[0].operation).toBe('set');
      });

      test('saves and loads overrides from disk', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-'));
        try {
          const manifestPath = path.join(tmpDir, 'manifest.draft.json');
          await fs.writeJson(manifestPath, { metadata: { status: 'draft' } }, { spaces: 2 });

          const overrides = [
            createSetOverride('catalog.type', 'graphql', 'Adjust type'),
            createDeleteOverride('metadata.deprecated', 'Clean up flag')
          ];

          const overrideFile = await saveOverrides(manifestPath, overrides);
          expect(await fs.pathExists(overrideFile)).toBe(true);

          const loaded = await loadOverrides(manifestPath);
          expect(loaded).toEqual(overrides);
        } finally {
          await fs.remove(tmpDir);
        }
      });
    });
  });
});
