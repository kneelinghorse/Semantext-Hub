import { promises as fsp } from 'fs';
import fs from 'fs';
import path from 'path';

function resolvePolicyPath() {
  const policyEnv =
    process.env.OSSP_IAM_POLICY ??
    process.env.DELEGATION_POLICY_PATH ??
    '';
  const trimmed =
    typeof policyEnv === 'string' && policyEnv.trim().length > 0
      ? policyEnv.trim()
      : null;
  return trimmed
    ? path.resolve(process.cwd(), trimmed)
    : path.resolve(process.cwd(), 'app/config/security/delegation-policy.json');
}

function resolveAuditLogPath() {
  const auditEnv =
    process.env.OSSP_IAM_AUDIT_LOG ??
    process.env.DELEGATION_AUDIT_LOG ??
    '';
  const trimmed =
    typeof auditEnv === 'string' && auditEnv.trim().length > 0
      ? auditEnv.trim()
      : null;
  return trimmed
    ? path.resolve(process.cwd(), trimmed)
    : path.resolve(process.cwd(), 'artifacts/security/denials.jsonl');
}

let cachedPolicy = null;
let cachedMtimeMs = 0;
let cachedPolicyPath = null;

async function loadPolicy() {
  const policyPath = resolvePolicyPath();
  try {
    const stat = await fsp.stat(policyPath);
    if (
      !cachedPolicy ||
      stat.mtimeMs !== cachedMtimeMs ||
      cachedPolicyPath !== policyPath
    ) {
      const raw = await fsp.readFile(policyPath, 'utf-8');
      cachedPolicy = JSON.parse(raw);
      cachedMtimeMs = stat.mtimeMs;
      cachedPolicyPath = policyPath;
    }
    return cachedPolicy;
  } catch (err) {
    // Fail closed: deny all if policy is missing or unreadable
    throw new Error(
      `IAM policy file not found or unreadable at ${policyPath}. Secure defaults require an explicit policy. Error: ${err.message}`,
    );
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
  const dir = path.dirname(resolveAuditLogPath());
  await fsp.mkdir(dir, { recursive: true });
}

async function writeAudit(entry) {
  try {
    await ensureAuditDir();
    fs.appendFileSync(resolveAuditLogPath(), JSON.stringify(entry) + '\n');
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

  // Fail closed: deny unless explicitly allowed (no permissive fall-through)
  const decision = { 
    allowed, 
    mode,
    reason,
    status: allowed ? 200 : 403
  };

  const auditEntry = {
    ts,
    agent: agentId,
    capability,
    resource,
    allowed,
    effective: allowed,
    mode,
    policy: 'delegation',
    result: allowed ? 'allowed' : 'denied',
    reason
  };

  await writeAudit(auditEntry);

  if (!allowed) {
    console.error(`[IAM DENY] ${agentId} denied '${capability}' for '${resource}' - ${reason} (mode: ${mode})`);
  }

  return decision;
}
