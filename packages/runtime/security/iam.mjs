import { promises as fsp } from 'fs';
import fs from 'fs';
import path from 'path';

const POLICY_PATH = process.env.DELEGATION_POLICY_PATH
  ? path.resolve(process.cwd(), process.env.DELEGATION_POLICY_PATH)
  : path.resolve(process.cwd(), 'app/config/security/delegation-policy.json');

const AUDIT_LOG_PATH = process.env.DELEGATION_AUDIT_LOG
  ? path.resolve(process.cwd(), process.env.DELEGATION_AUDIT_LOG)
  : path.resolve(process.cwd(), 'app/artifacts/security/delegation-decisions.jsonl');

let cachedPolicy = null;
let cachedMtimeMs = 0;

async function loadPolicy() {
  try {
    const stat = await fsp.stat(POLICY_PATH);
    if (!cachedPolicy || stat.mtimeMs !== cachedMtimeMs) {
      const raw = await fsp.readFile(POLICY_PATH, 'utf-8');
      cachedPolicy = JSON.parse(raw);
      cachedMtimeMs = stat.mtimeMs;
    }
    return cachedPolicy;
  } catch (err) {
    // Default permissive policy if missing
    return { mode: 'permissive', agents: {}, resources: [] };
  }
}

function matchResource(patterns = [], resource = '') {
  if (!patterns.length) return true; // if no patterns, allow any resource filter
  return patterns.some(p => {
    const re = new RegExp('^' + String(p).replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\\\*/g, '.*') + '$');
    return re.test(resource);
  });
}

async function ensureAuditDir() {
  const dir = path.dirname(AUDIT_LOG_PATH);
  await fsp.mkdir(dir, { recursive: true });
}

async function writeAudit(entry) {
  try {
    await ensureAuditDir();
    fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(entry) + '\n');
  } catch (err) {
    // Best-effort; do not throw
  }
}

export async function authorize(agentId, capability, resource) {
  const ts = new Date().toISOString();
  const policy = await loadPolicy();
  const mode = policy.mode === 'enforce' ? 'enforce' : 'permissive';

  const agent = policy.agents?.[agentId] || { allow: [] };
  const allowCaps = Array.isArray(agent.allow) ? agent.allow : [];
  const capAllowed = allowCaps.includes(capability);
  const resourceOk = matchResource(policy.resources || [], resource || '');

  const allowed = capAllowed && resourceOk;
  const reason = allowed
    ? 'allowed_by_policy'
    : capAllowed
      ? 'resource_not_matched'
      : 'capability_not_allowed';

  const decision = { allowed: mode === 'enforce' ? allowed : true, mode, reason };

  await writeAudit({
    ts,
    agent: agentId,
    capability,
    resource,
    allowed,
    effective: decision.allowed,
    mode,
    reason
  });

  if (!allowed && mode === 'permissive') {
    // WARN but do not block
    console.warn(`[IAM WARN] ${agentId} lacks '${capability}' for ${resource} (permissive)`);
  }

  if (!allowed && mode === 'enforce') {
    throw new Error(`[IAM DENY] ${agentId} not allowed: ${capability} -> ${resource} (${reason})`);
  }

  return decision;
}

