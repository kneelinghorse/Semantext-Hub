/**
 * Signature enforcement module - wraps JWS verification with policy checks
 * Returns structured {ok, errorReason} for registry and resolver use
 */

import { promises as fsp } from 'fs';
import path from 'path';
import { verifyJws } from '../../../app/libs/signing/jws.mjs';
import fs from 'fs';

const POLICY_PATH = process.env.SIGNATURE_POLICY_PATH
  ? path.resolve(process.cwd(), process.env.SIGNATURE_POLICY_PATH)
  : path.resolve(process.cwd(), 'app/config/security/signature-policy.json');

const AUDIT_LOG_PATH = process.env.SIGNATURE_AUDIT_LOG
  ? path.resolve(process.cwd(), process.env.SIGNATURE_AUDIT_LOG)
  : path.resolve(process.cwd(), 'artifacts/security/denials.jsonl');

let cachedPolicy = null;
let cachedMtimeMs = 0;

/**
 * Load signature policy from disk with caching
 * @returns {Promise<Object>}
 */
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
    return {
      version: 1,
      mode: 'permissive',
      requireSignature: false,
      exemptions: [],
      allowedIssuers: [],
      algorithms: ['EdDSA', 'ES256']
    };
  }
}

/**
 * Check if a resource path matches any exemption pattern
 * @param {string[]} exemptions
 * @param {string} resourcePath
 * @returns {boolean}
 */
function isExempt(exemptions = [], resourcePath = '') {
  return exemptions.some(pattern => {
    // Convert glob pattern to regex: ** -> .*, * -> [^/]*
    const regexPattern = String(pattern)
      .replace(/\*\*/g, '__DOUBLESTAR__')  // Temporarily replace **
      .replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&')  // Escape special chars
      .replace(/__DOUBLESTAR__/g, '.*')  // Replace ** with .*
      .replace(/\\\*/g, '[^/]*');  // Replace single * with [^/]*
    const re = new RegExp('^' + regexPattern + '$');
    return re.test(resourcePath);
  });
}

/**
 * Ensure audit log directory exists
 */
async function ensureAuditDir() {
  const dir = path.dirname(AUDIT_LOG_PATH);
  await fsp.mkdir(dir, { recursive: true });
}

/**
 * Write audit entry to JSONL log
 * @param {Object} entry
 */
async function writeAudit(entry) {
  try {
    await ensureAuditDir();
    fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(entry) + '\n');
  } catch (err) {
    // Best-effort logging; do not throw
    console.warn('[AUDIT] Failed to write audit log:', err.message);
  }
}

/**
 * Verify signature envelope with policy enforcement
 * @param {Object} envelope - Signature envelope from jws.signJws
 * @param {Object} options
 * @param {string} options.resourcePath - Path being accessed (for exemption checks)
 * @param {string} [options.operation='write'] - Operation type (read/write/delete)
 * @param {any} [options.expectedPayload] - Expected payload to verify against
 * @returns {Promise<{ok: boolean, errorReason?: string, details?: any}>}
 */
export async function verifySignature(envelope, options = {}) {
  const ts = new Date().toISOString();
  const { resourcePath = '', operation = 'write', expectedPayload, policy: policyOverride } = options;
  
  const policy = policyOverride || await loadPolicy();
  const mode = policy.mode === 'enforce' ? 'enforce' : 'permissive';

  // Check exemptions first
  if (isExempt(policy.exemptions || [], resourcePath)) {
    await writeAudit({
      ts,
      operation,
      resource: resourcePath,
      result: 'allowed',
      reason: 'exempted',
      mode
    });
    return { ok: true };
  }

  // If policy doesn't require signatures and we're in permissive mode, allow
  if (!policy.requireSignature && mode === 'permissive') {
    await writeAudit({
      ts,
      operation,
      resource: resourcePath,
      result: 'allowed',
      reason: 'permissive_mode',
      mode
    });
    return { ok: true };
  }

  // Check if signature envelope is present
  if (!envelope) {
    const reason = 'unsigned';
    await writeAudit({
      ts,
      operation,
      resource: resourcePath,
      result: 'denied',
      reason,
      mode
    });
    
    if (mode === 'enforce') {
      return { ok: false, errorReason: reason };
    }
    console.warn(`[SIGNATURE WARN] Unsigned ${operation} on ${resourcePath} (permissive)`);
    return { ok: true };
  }

  // Extract keyId from envelope header
  const keyId = envelope.header?.kid;
  if (!keyId) {
    const reason = 'missing_key_id';
    await writeAudit({
      ts,
      operation,
      resource: resourcePath,
      result: 'denied',
      reason,
      keyId: null,
      mode
    });
    
    if (mode === 'enforce') {
      return { ok: false, errorReason: reason };
    }
    return { ok: true };
  }

  // Find matching issuer in policy
  const issuer = (policy.allowedIssuers || []).find(i => i.keyId === keyId);
  if (!issuer) {
    const reason = 'unknown_issuer';
    await writeAudit({
      ts,
      operation,
      resource: resourcePath,
      result: 'denied',
      reason,
      keyId,
      mode
    });
    
    if (mode === 'enforce') {
      return { ok: false, errorReason: reason };
    }
    return { ok: true };
  }

  // Verify algorithm is allowed
  const algorithm = envelope.header?.alg;
  if (!policy.algorithms.includes(algorithm)) {
    const reason = 'unsupported_algorithm';
    await writeAudit({
      ts,
      operation,
      resource: resourcePath,
      result: 'denied',
      reason,
      keyId,
      algorithm,
      mode
    });
    
    if (mode === 'enforce') {
      return { ok: false, errorReason: reason };
    }
    return { ok: true };
  }

  // Perform cryptographic verification
  const verifyOptions = {
    publicKey: issuer.publicKey,
    keyId,
    expectedPayload
  };

  const result = verifyJws(envelope, verifyOptions);
  
  if (!result.valid) {
    const reason = result.errors[0] || 'invalid_signature';
    await writeAudit({
      ts,
      operation,
      resource: resourcePath,
      result: 'denied',
      reason,
      keyId,
      errors: result.errors,
      mode
    });
    
    if (mode === 'enforce') {
      return {
        ok: false,
        errorReason: reason,
        details: { errors: result.errors }
      };
    }
    return { ok: true };
  }

  // Check expiration policy
  if (policy.validation?.checkExpiration && result.header?.iat) {
    const issuedAt = new Date(result.header.iat);
    const maxAgeDays = policy.validation.maxAgeDays || 90;
    const ageMs = Date.now() - issuedAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    
    if (ageDays > maxAgeDays) {
      const reason = 'signature_too_old';
      await writeAudit({
        ts,
        operation,
        resource: resourcePath,
        result: 'denied',
        reason,
        keyId,
        ageDays: Math.floor(ageDays),
        maxAgeDays,
        mode
      });
      
      if (mode === 'enforce') {
        return { ok: false, errorReason: reason };
      }
    }
  }

  // Success
  await writeAudit({
    ts,
    operation,
    resource: resourcePath,
    result: 'allowed',
    reason: 'valid_signature',
    keyId,
    algorithm,
    mode
  });

  return { ok: true, details: { keyId, algorithm } };
}

/**
 * Check if signatures are required for a given resource path
 * @param {string} resourcePath
 * @returns {Promise<{required: boolean, reason: string}>}
 */
export async function isSignatureRequired(resourcePath = '') {
  const policy = await loadPolicy();
  
  if (isExempt(policy.exemptions || [], resourcePath)) {
    return { required: false, reason: 'exempted' };
  }
  
  if (!policy.requireSignature) {
    return { required: false, reason: 'policy_disabled' };
  }
  
  if (policy.mode !== 'enforce') {
    return { required: false, reason: 'permissive_mode' };
  }
  
  return { required: true, reason: 'enforced' };
}

/**
 * Get list of allowed issuer key IDs
 * @returns {Promise<string[]>}
 */
export async function getAllowedKeyIds() {
  const policy = await loadPolicy();
  return (policy.allowedIssuers || []).map(i => i.keyId);
}
