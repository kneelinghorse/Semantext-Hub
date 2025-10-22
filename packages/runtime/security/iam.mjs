import { promises as fsp } from 'fs';
import fs from 'fs';
import path from 'path';

const POLICY_PATH = process.env.DELEGATION_POLICY_PATH
  ? path.resolve(process.cwd(), process.env.DELEGATION_POLICY_PATH)
  : path.resolve(process.cwd(), 'app/config/security/delegation-policy.json');

const AUDIT_LOG_PATH = process.env.DELEGATION_AUDIT_LOG
  ? path.resolve(process.cwd(), process.env.DELEGATION_AUDIT_LOG)
  : path.resolve(process.cwd(), 'artifacts/security/denials.jsonl');

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

function patternToRegex(pattern) {
  return String(pattern)
    .replace(/\*\*/g, '__DOUBLESTAR__')
    .replace(/\*/g, '__STAR__')
    .replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&')
    .replace(/__DOUBLESTAR__/g, '.*')
    .replace(/__STAR__/g, '.*');
}

function matchResource(patterns = [], resource = '') {
  if (!patterns.length) return true; // if no patterns, allow any resource filter
  return patterns.some(p => {
    const regexPattern = patternToRegex(p);
    const re = new RegExp('^' + regexPattern + '$');
    return re.test(resource);
  });
}

function isExempt(exemptions = [], resource = '') {
  if (!exemptions.length) return false;
  return exemptions.some(pattern => {
    const regexPattern = patternToRegex(pattern);
    const re = new RegExp('^' + regexPattern + '$');
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

  if (resource && isExempt(policy.exemptions || [], resource)) {
    const decision = { allowed: true, reason: 'exempted', mode };
    await writeAudit({
      ts,
      agent: agentId,
      capability,
      resource,
      mode,
      policy: 'delegation',
      allowed: true,
      effective: true,
      result: 'allowed',
      reason: decision.reason
    });
    return decision;
  }

  const agent = policy.agents?.[agentId] || { allow: [] };
  const allowCaps = Array.isArray(agent.allow) ? agent.allow : [];
  const capAllowed = allowCaps.includes(capability);
  
  // Check agent-specific resources first, fall back to policy-level resources
  const resourcePatterns = agent.resources || policy.resources || [];
  const resourceOk = matchResource(resourcePatterns, resource || '');

  const allowed = capAllowed && resourceOk;
  const reason = allowed
    ? 'allowed_by_policy'
    : capAllowed
      ? 'resource_not_matched'
      : 'capability_not_allowed';

  const effectiveAllowed = allowed || mode !== 'enforce';
  const decision = { allowed: effectiveAllowed, mode, reason };
  const auditEntry = {
    ts,
    agent: agentId,
    capability,
    resource,
    allowed,
    effective: effectiveAllowed,
    mode,
    policy: 'delegation',
    result: allowed ? 'allowed' : 'denied',
    reason
  };

  await writeAudit(auditEntry);

  if (!allowed && mode === 'permissive') {
    console.warn(`[IAM WARN] ${agentId} lacks '${capability}' for ${resource} (permissive)`);
  }

  return decision;
}
