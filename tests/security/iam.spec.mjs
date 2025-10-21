import { describe, it, expect, beforeAll } from '@jest/globals';
import path from 'path';
import fs from 'fs';

let authorize;

const POLICY_PATH = path.resolve(process.cwd(), 'app/config/security/delegation-policy.json');
const AUDIT_PATH = path.resolve(process.cwd(), 'app/artifacts/security/delegation-decisions.test.jsonl');

describe('IAM authorize()', () => {
  beforeAll(() => {
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
  });

  it('permits (warn) when capability not allowed in permissive mode', async () => {
    const decision = await authorize('cli:local', 'registry:write', 'urn:protocol:api:update-user');
    expect(decision.mode).toBe('permissive');
    expect(decision.allowed).toBe(true); // effective decision in permissive mode
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
  });
});
