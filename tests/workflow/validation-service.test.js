/**
 * Validation Service Tests
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { runFullValidation } from '../../packages/runtime/workflow/validation-service.js';
import { getApprovedPath } from '../../packages/runtime/workflow/paths.js';
import { parseURN, normalizeURN } from '../../packages/protocols/core/graph/urn-utils.js';

function createApiManifest({ urn, version, endpoints }) {
  const parsed = parseURN(urn);
  if (!parsed) {
    throw new Error('Invalid test URN provided');
  }

  const baseURN = normalizeURN(urn);

  return {
    metadata: {
      status: 'draft',
      urn,
      kind: 'api',
      version,
      source: { type: 'openapi', imported_at: '2025-01-01T00:00:00Z' }
    },
    catalog: {
      type: 'rest',
      urn: baseURN,
      endpoints: endpoints.map(endpoint => ({
        id: `urn:proto:api.endpoint:${parsed.authority}/${parsed.id}/${endpoint.name}@${version}`,
        pattern: endpoint.pattern,
        method: endpoint.method
      }))
    },
    provenance: {
      importer: 'test-suite',
      imported_at: '2025-01-01T00:00:00Z'
    }
  };
}

describe('validation-service', () => {
  test('detects breaking changes between draft and approved manifests', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'validation-service-'));
    const draftPath = path.join(tmpDir, 'service-manifest.draft.json');
    const approvedPath = getApprovedPath(draftPath);

    const approvedManifest = createApiManifest({
      urn: 'urn:proto:api:test.com/service@0.9.0',
      version: '0.9.0',
      endpoints: [
        { name: 'list-users', pattern: '/users', method: 'GET' },
        { name: 'create-user', pattern: '/users', method: 'POST' }
      ]
    });

    const draftManifest = createApiManifest({
      urn: 'urn:proto:api:test.com/service@1.0.0',
      version: '1.0.0',
      endpoints: [
        { name: 'list-users', pattern: '/users', method: 'GET' }
      ]
    });

    await fs.writeJson(approvedPath, approvedManifest, { spaces: 2 });
    await fs.writeJson(draftPath, draftManifest, { spaces: 2 });

    const result = await runFullValidation({
      manifestPath: draftPath,
      manifest: draftManifest,
      options: { includeDiff: true, includeMigration: true }
    });

    expect(result.combined.valid).toBe(true);
    expect(result.diff.summary.hasBreakingChanges).toBe(true);
    expect(result.breaking.hasBreakingChanges).toBe(true);
    expect(result.breaking.riskScore).toBeGreaterThan(0);
    expect(result.migration.suggestions.length).toBeGreaterThan(0);

    await fs.remove(tmpDir);
  });
});
