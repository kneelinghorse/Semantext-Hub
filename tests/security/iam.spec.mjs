import { describe, it, expect, beforeAll } from '@jest/globals';
import path from 'path';
import fs from 'fs';

let authorize;

const TMP_DIR = path.resolve(process.cwd(), 'tests/security/_tmp');
const POLICY_PATH = path.join(TMP_DIR, 'delegation-policy.permissive.json');
const AUDIT_PATH = path.join(TMP_DIR, 'delegation-audit.permissive.jsonl');

describe('IAM authorize()', () => {
  beforeAll(() => {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const policy = {
      version: 2,
      mode: 'permissive',
      agents: {
        'mcp:codex': {
          allow: ['registry:read', 'resolve:read'],
          resources: ['urn:protocol:api:*']
        },
        'cli:local': {
          allow: ['registry:read'],
          resources: ['urn:protocol:api:*']
        }
      },
      resources: ['urn:protocol:api:*']
    };
    fs.writeFileSync(POLICY_PATH, JSON.stringify(policy, null, 2));
    process.env.DELEGATION_POLICY_PATH = POLICY_PATH;
    process.env.DELEGATION_AUDIT_LOG = AUDIT_PATH;
    try { fs.rmSync(AUDIT_PATH, { force: true }); } catch {}
  });

  beforeAll(async () => {
    // Dynamic import after env is set
    ({ authorize } = await import('../../packages/runtime/security/iam.mjs'));
  });

  it('allows permitted capability for matching resource', async () => {
    const decision = await authorize('mcp:codex', 'registry:read', 'urn:protocol:api:get-users');
    expect(decision).toBeDefined();
    expect(decision.mode).toBe('permissive');
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('allowed_by_policy');
  });

  it('denies when capability not allowed even in permissive mode', async () => {
    const decision = await authorize('cli:local', 'registry:write', 'urn:protocol:api:update-user');
    expect(decision.mode).toBe('permissive');
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe(403);
    expect(decision.reason).toBe('capability_not_allowed');
  });

  it('writes audit entries for decisions', async () => {
    await authorize('mcp:codex', 'resolve:read', 'urn:protocol:api:list');
    await authorize('cli:local', 'execute', 'urn:protocol:api:exec');
    const content = fs.readFileSync(AUDIT_PATH, 'utf-8').trim().split('\n');
    expect(content.length).toBeGreaterThanOrEqual(2);
    const last = JSON.parse(content[content.length - 1]);
    expect(last).toHaveProperty('agent');
    expect(last).toHaveProperty('capability');
    expect(last).toHaveProperty('resource');
    expect(last).toHaveProperty('mode', 'permissive');
    expect(last).toHaveProperty('result', 'denied');
  });
});
