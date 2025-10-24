/**
 * Registry Security Tests
 * 
 * Validates that registry enforces secure defaults:
 * - Requires explicit API key (no fallbacks)
 * - IAM authorization fails closed (403 denials)
 * - Proper audit logging
 */

import { beforeAll, describe, test, expect } from '@jest/globals';
import { createServer } from '../../packages/runtime/registry/server.mjs';
import { authorize } from '../../packages/runtime/security/iam.mjs';
import { promises as fsp } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

const ORIGINAL_ENV = {
  OSSP_IAM_POLICY: process.env.OSSP_IAM_POLICY,
  DELEGATION_POLICY_PATH: process.env.DELEGATION_POLICY_PATH,
  OSSP_IAM_AUDIT_LOG: process.env.OSSP_IAM_AUDIT_LOG,
  DELEGATION_AUDIT_LOG: process.env.DELEGATION_AUDIT_LOG,
  REGISTRY_API_KEY: process.env.REGISTRY_API_KEY,
};

const SCHEMA_PATH = join(process.cwd(), 'scripts/db/schema.sql');
let REGISTRY_SCHEMA_SQL = '';

beforeAll(async () => {
  REGISTRY_SCHEMA_SQL = await fsp.readFile(SCHEMA_PATH, 'utf8');
});

async function applyRegistrySchema(app) {
  const db = app.get('db');
  await db.exec(REGISTRY_SCHEMA_SQL);
}

describe('Registry Security - Secure Defaults', () => {
  describe('API Key Requirements', () => {
    test('refuses to start without API key', async () => {
      await expect(async () => {
        await createServer({
          registryConfigPath: null,
          dbPath: ':memory:',
          requireProvenance: false,
        });
      }).rejects.toThrow(/Registry API key must be provided/i);
    });

    test('refuses to start with empty API key', async () => {
      await expect(async () => {
        await createServer({
          apiKey: '',
          registryConfigPath: null,
          dbPath: ':memory:',
          requireProvenance: false,
        });
      }).rejects.toThrow(/Registry API key must be provided/i);
    });

    test('refuses to start with whitespace-only API key', async () => {
      await expect(async () => {
        await createServer({
          apiKey: '   ',
          registryConfigPath: null,
          dbPath: ':memory:',
          requireProvenance: false,
        });
      }).rejects.toThrow(/Registry API key must be provided/i);
    });

    test('starts successfully with valid API key', async () => {
      const app = await createServer({
        apiKey: 'test-valid-key-12345',
        registryConfigPath: null,
        dbPath: ':memory:',
        requireProvenance: false,
      });
      expect(app).toBeDefined();
      expect(typeof app.listen).toBe('function');
    });

    test('uses REGISTRY_API_KEY environment variable when apiKey option is omitted', async () => {
      const previousValue = process.env.REGISTRY_API_KEY;
      process.env.REGISTRY_API_KEY = 'env-sourced-api-key';

      try {
        const app = await createServer({
          registryConfigPath: null,
          dbPath: ':memory:',
          requireProvenance: false,
        });
        expect(app).toBeDefined();
        expect(app.get('registryApiKey')).toBe('env-sourced-api-key');
      } finally {
        if (previousValue === undefined) {
          delete process.env.REGISTRY_API_KEY;
        } else {
          process.env.REGISTRY_API_KEY = previousValue;
        }
      }
    });

    test('rejects requests with missing API key', async () => {
      const app = await createServer({
        apiKey: 'test-secure-key',
        registryConfigPath: null,
        dbPath: ':memory:',
        requireProvenance: false,
      });
      await applyRegistrySchema(app);

      const response = await request(app)
        .get('/v1/registry/urn%3Aagent%3Atest')
        .expect(401);

      expect(response.body.error).toBe('unauthorized');
      expect(response.body.message).toMatch(/X-API-Key/i);
    });

    test('rejects requests with incorrect API key', async () => {
      const app = await createServer({
        apiKey: 'correct-key',
        registryConfigPath: null,
        dbPath: ':memory:',
        requireProvenance: false,
      });
      await applyRegistrySchema(app);

      const response = await request(app)
        .get('/v1/registry/urn%3Aagent%3Atest')
        .set('X-API-Key', 'wrong-key')
        .expect(401);

      expect(response.body.error).toBe('unauthorized');
    });

    test('accepts requests with correct API key', async () => {
      const app = await createServer({
        apiKey: 'correct-key',
        registryConfigPath: null,
        dbPath: ':memory:',
        requireProvenance: false,
      });
      await applyRegistrySchema(app);

      // Note: This will 404 since the URN doesn't exist, but auth passes
      const response = await request(app)
        .get('/v1/registry/urn%3Aagent%3Atest')
        .set('X-API-Key', 'correct-key')
        .expect(404);

      expect(response.body.error).toBe('not_found');
    });
  });

  describe('IAM Authorization - Fail Closed', () => {
    const tmpDir = join(tmpdir(), 'iam-test-' + Date.now());
    const policyPath = join(tmpDir, 'delegation-policy.json');
    const auditPath = join(tmpDir, 'denials.jsonl');

    beforeAll(async () => {
      await fsp.mkdir(tmpDir, { recursive: true });
    });

    afterAll(async () => {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    });

    beforeEach(async () => {
      process.env.OSSP_IAM_POLICY = policyPath;
      delete process.env.DELEGATION_POLICY_PATH;
      process.env.OSSP_IAM_AUDIT_LOG = auditPath;
      delete process.env.DELEGATION_AUDIT_LOG;
    });

    afterEach(() => {
      for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });

    test('denies access when policy file is missing', async () => {
      // Ensure policy file doesn't exist
      await fsp.rm(policyPath, { force: true });

      await expect(async () => {
        await authorize('test-agent', 'read', 'resource-1');
      }).rejects.toThrow(/IAM policy file not found/i);
    });

    test('denies capability not in policy (enforce mode)', async () => {
      const policy = {
        mode: 'enforce',
        agents: {
          'test-agent': {
            allow: ['read'],
            resources: ['*']
          }
        }
      };
      await fsp.writeFile(policyPath, JSON.stringify(policy));

      const decision = await authorize('test-agent', 'write', 'resource-1');
      
      expect(decision.allowed).toBe(false);
      expect(decision.status).toBe(403);
      expect(decision.reason).toBe('capability_not_allowed');

      // Verify audit log
      const auditContent = await fsp.readFile(auditPath, 'utf-8');
      const auditEntries = auditContent.trim().split('\n').map(line => JSON.parse(line));
      const denialEntry = auditEntries.find(e => e.capability === 'write');
      expect(denialEntry).toBeDefined();
      expect(denialEntry.allowed).toBe(false);
      expect(denialEntry.result).toBe('denied');
    });

    test('denies capability not in policy (permissive mode also denies)', async () => {
      const policy = {
        mode: 'permissive',
        agents: {
          'test-agent': {
            allow: ['read'],
            resources: ['*']
          }
        }
      };
      await fsp.writeFile(policyPath, JSON.stringify(policy));

      const decision = await authorize('test-agent', 'write', 'resource-1');
      
      // Even in permissive mode, we now fail closed
      expect(decision.allowed).toBe(false);
      expect(decision.status).toBe(403);
      expect(decision.reason).toBe('capability_not_allowed');
    });

    test('denies resource not matching pattern', async () => {
      const policy = {
        mode: 'enforce',
        agents: {
          'test-agent': {
            allow: ['read'],
            resources: ['approved/*']
          }
        }
      };
      await fsp.writeFile(policyPath, JSON.stringify(policy));

      const decision = await authorize('test-agent', 'read', 'drafts/doc.json');
      
      expect(decision.allowed).toBe(false);
      expect(decision.status).toBe(403);
      expect(decision.reason).toBe('resource_not_matched');
    });

    test('allows capability and resource when both match policy', async () => {
      const policy = {
        mode: 'enforce',
        agents: {
          'test-agent': {
            allow: ['read', 'write'],
            resources: ['approved/*', 'drafts/*']
          }
        }
      };
      await fsp.writeFile(policyPath, JSON.stringify(policy));

      const decision = await authorize('test-agent', 'write', 'drafts/new-doc.json');
      
      expect(decision.allowed).toBe(true);
      expect(decision.status).toBe(200);
      expect(decision.reason).toBe('allowed_by_policy');
    });

    test('allows exempted resources even without capability', async () => {
      const policy = {
        mode: 'enforce',
        exemptions: ['public/*'],
        agents: {
          'test-agent': {
            allow: ['read'],
            resources: []
          }
        }
      };
      await fsp.writeFile(policyPath, JSON.stringify(policy));

      const decision = await authorize('test-agent', 'read', 'public/readme.md');
      
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe('exempted');
    });
  });
});
