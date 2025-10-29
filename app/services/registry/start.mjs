#!/usr/bin/env node

/**
 * Registry Server Startup Script
 * 
 * Starts the Registry HTTP service with proper configuration.
 */

import fs from 'node:fs';
import path from 'node:path';

import { startServer } from './server.mjs';

const DEFAULT_PORT = process.env.PORT || process.env.REGISTRY_PORT || 3000;
const apiKey =
  typeof process.env.REGISTRY_API_KEY === 'string'
    ? process.env.REGISTRY_API_KEY.trim()
    : '';

function resolveIamPolicyPath() {
  const envPolicy =
    process.env.OSSP_IAM_POLICY ??
    process.env.DELEGATION_POLICY_PATH ??
    null;
  if (typeof envPolicy === 'string' && envPolicy.trim().length > 0) {
    return path.resolve(process.cwd(), envPolicy.trim());
  }
  return path.resolve(process.cwd(), 'app/config/security/delegation-policy.json');
}

function resolveIamAuditPath() {
  const envAudit =
    process.env.OSSP_IAM_AUDIT_LOG ??
    process.env.DELEGATION_AUDIT_LOG ??
    null;
  if (typeof envAudit === 'string' && envAudit.trim().length > 0) {
    return path.resolve(process.cwd(), envAudit.trim());
  }
  return path.resolve(process.cwd(), 'artifacts/security/denials.jsonl');
}

function emitStartupChecklist(effectiveApiKey) {
  const checks = [];

  if (effectiveApiKey && effectiveApiKey.length > 0) {
    checks.push({
      ok: true,
      message: `REGISTRY_API_KEY configured (${effectiveApiKey.length} chars)`,
    });
  } else {
    checks.push({
      ok: false,
      message: 'REGISTRY_API_KEY is missing (startup will fail closed)',
      remediation: 'Set REGISTRY_API_KEY to a securely generated value.',
    });
  }

  const policyPath = resolveIamPolicyPath();
  if (!fs.existsSync(policyPath)) {
    checks.push({
      ok: false,
      message: `IAM policy file not found at ${policyPath}`,
      remediation:
        'Create the delegation policy JSON or set OSSP_IAM_POLICY to an alternate path before running demos.',
    });
  } else {
    checks.push({
      ok: true,
      message: `IAM policy located at ${policyPath}`,
    });
  }

  const auditPath = resolveIamAuditPath();
  const auditDir = path.dirname(auditPath);
  if (!fs.existsSync(auditDir)) {
    checks.push({
      ok: false,
      message: `IAM audit log directory missing: ${auditDir}`,
      remediation:
        'Create the directory or set OSSP_IAM_AUDIT_LOG/DELEGATION_AUDIT_LOG to a writable location.',
    });
  } else {
    try {
      fs.accessSync(auditDir, fs.constants.W_OK);
      checks.push({
        ok: true,
        message: `IAM audit log directory writable (${auditDir})`,
      });
    } catch (error) {
      checks.push({
        ok: false,
        message: `IAM audit log directory is not writable: ${auditDir}`,
        remediation: `Ensure write permissions for ${auditDir} before running demos.`,
      });
    }
  }

  console.log('\nSecurity startup checklist:');
  for (const check of checks) {
    if (check.ok) {
      console.log(`  ✓ ${check.message}`);
    } else {
      console.log(`  ⚠️  ${check.message}`);
      if (check.remediation) {
        console.log(`     → ${check.remediation}`);
      }
    }
  }

  const warnings = checks.filter((entry) => !entry.ok).length;
  if (warnings > 0) {
    console.log(
      '\n⚠️  Resolve the warnings above before starting customer demos to maintain secure defaults.',
    );
  } else {
    console.log('\nAll security prerequisites satisfied.');
  }
}

async function main() {
  const port = Number.parseInt(DEFAULT_PORT, 10);

  // Security Check: Fail if no API key is provided
  if (!apiKey || apiKey.length === 0) {
    console.error('\n⚠️  SECURITY ERROR: Registry startup blocked - missing API key\n');
    console.error('The registry requires an explicit API key for secure operation.');
    console.error('Insecure defaults (e.g., "local-dev-key") have been removed.\n');
    console.error('To fix this, set the REGISTRY_API_KEY environment variable:\n');
    console.error('  export REGISTRY_API_KEY="your-secure-api-key-here"\n');
    console.error('For local development, you can generate a secure key with:');
    console.error('  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n');
    process.exit(1);
  }

  console.log(`Starting Registry Server on port ${port}`);
  console.log(`API Key: ${apiKey.substring(0, 8)}... (${apiKey.length} chars)`);
  emitStartupChecklist(apiKey);

  try {
    const { close, port: boundPort, host: boundHost } = await startServer({
      port,
      apiKey
    });

    const resolvedHost = boundHost || 'localhost';
    console.log(`Registry Server started successfully on http://${resolvedHost}:${boundPort}`);
    console.log('Available endpoints:');
    console.log('  GET  /health');
    console.log('  GET  /openapi.json');
    console.log('  GET  /registry?cap=<capability>');
    console.log('  POST /registry');
    console.log('  GET  /resolve/<urn>');
    console.log('  GET  /v1/registry/:urn');
    console.log('  PUT  /v1/registry/:urn');
    console.log('  GET  /v1/resolve?urn=<urn>');

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\nShutting down Registry Server...');
      await close();
      console.log('Registry Server stopped');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    console.error('Failed to start Registry Server:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Startup failed:', error);
    process.exit(1);
  });
}

export {
  DEFAULT_PORT,
  resolveIamPolicyPath,
  resolveIamAuditPath,
  emitStartupChecklist,
  main
};
