#!/usr/bin/env node

/**
 * Verify DSSE attestations and provenance for changed URNs
 * 
 * This command validates that all manifests changed since a given git reference
 * have valid DSSE envelopes with provenance. Used in CI to gate releases.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { openDb } from '../../registry/db.mjs';
import { getProvenance } from '../../registry/repository.mjs';
import { validateProvenance, summarizeProvenance } from '../../security/provenance.mjs';

/**
 * Get list of changed manifest files since a git reference
 */
function getChangedFiles(sinceRef = 'HEAD~1') {
  try {
    const output = execSync(`git diff --name-only ${sinceRef}`, { encoding: 'utf8' });
    const files = output.trim().split('\n').filter(Boolean);
    
    // Filter for manifest files (assume they're in approved/, drafts/, or have .json extension)
    return files.filter(f => 
      (f.endsWith('.json') && (f.includes('approved/') || f.includes('drafts/'))) ||
      f.includes('manifests/')
    );
  } catch (err) {
    console.error(`Error getting changed files: ${err.message}`);
    return [];
  }
}

/**
 * Extract URN from manifest file path
 */
function extractUrnFromPath(filePath) {
  // Patterns: approved/URN/manifest.json, drafts/URN/manifest.json, manifests/URN.json
  const match = filePath.match(/(?:approved|drafts|manifests)\/([^/]+)(?:\/manifest\.json|\.json)?$/);
  if (match) {
    return match[1].replace('.json', '');
  }
  
  // Fallback: use basename without extension
  return path.basename(filePath, '.json');
}

/**
 * Load signature keys for verification
 */
function loadVerificationKeys() {
  const policyPath = path.resolve(process.cwd(), 'app/config/security/signature-policy.json');
  const keys = [];

  if (fs.existsSync(policyPath)) {
    try {
      const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
      const entries = Array.isArray(policy.allowedIssuers)
        ? policy.allowedIssuers
        : Array.isArray(policy.keys)
          ? policy.keys
          : [];

      for (const entry of entries) {
        if (!entry?.publicKey) {
          continue;
        }
        const algorithm = entry.algorithm === 'EdDSA' ? 'Ed25519' : entry.algorithm || 'Ed25519';
        keys.push({
          pubkey: entry.publicKey,
          alg: algorithm,
          keyid: entry.keyId || entry.keyid || null,
        });
      }
    } catch (error) {
      console.warn(`Warning: failed to parse signature policy at ${policyPath}: ${error.message}`);
    }
  }

  if (keys.length === 0) {
    const fallbackPaths = [
      path.resolve(process.cwd(), 'fixtures/keys/pub.pem'),
      path.resolve(process.cwd(), 'app/config/keys/pub.pem'),
      path.resolve(process.cwd(), 'config/keys/pub.pem'),
    ];

    for (const keyPath of fallbackPaths) {
      if (fs.existsSync(keyPath)) {
        keys.push({
          pubkey: fs.readFileSync(keyPath, 'utf8'),
          alg: 'Ed25519',
          keyid: path.basename(keyPath),
        });
      }
    }
  }

  return keys;
}

function loadRegistryConfig() {
  const defaultPath = path.resolve(process.cwd(), 'app/config/registry.config.json');
  if (fs.existsSync(defaultPath)) {
    try {
      return JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
    } catch (error) {
      console.warn(`Warning: failed to parse registry config at ${defaultPath}: ${error.message}`);
    }
  }
  return {};
}

/**
 * Main verification logic
 */
export async function verifyAttestations(options = {}) {
  const {
    since = 'HEAD~1',
    outputPath = 'artifacts/security/provenance-report.json',
    dbPath = null,
  } = options;
  
  // Get changed files
  const changedFiles = getChangedFiles(since);
  if (changedFiles.length === 0) {
    console.log(`No manifest files changed since ${since}`);

    const emptyReport = {
      sinceRef: since,
      checkedAt: new Date().toISOString(),
      totalUrns: 0,
      validCount: 0,
      invalidCount: 0,
      allValid: true,
      results: [],
    };

    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(emptyReport, null, 2), 'utf8');

    return emptyReport;
  }
  
  const urns = Array.from(new Set(changedFiles.map(extractUrnFromPath)));
  console.log(`Found ${urns.length} changed URN(s): ${urns.join(', ')}`);
  
  // Load verification config
  const verifyConfigs = loadVerificationKeys();
  if (!verifyConfigs || verifyConfigs.length === 0) {
    throw new Error('No DSSE verification keys available. Configure signature-policy or fixtures/keys/pub.pem.');
  }
  
  // Open database
  const dbConfig = dbPath ? { dbPath } : loadRegistryConfig();
  const db = await openDb(dbConfig);
  
  const results = [];
  let allValid = true;
  
  for (const urn of urns) {
    console.log(`\nChecking provenance for: ${urn}`);
    
    try {
      // Get provenance records
      const provenanceRecords = await getProvenance(db, urn);
      
      if (provenanceRecords.length === 0) {
        console.error(`  ❌ No provenance found`);
        results.push({
          urn,
          ok: false,
          reason: 'missing-provenance',
          timestamp: new Date().toISOString(),
        });
        allValid = false;
        continue;
      }
      
      // Verify the latest provenance
      const latest = provenanceRecords[0];
      if (!latest.envelope) {
        console.error('  ❌ Latest provenance record has no envelope payload');
        results.push({
          urn,
          ok: false,
          reason: 'malformed-envelope',
          issuer: latest.issuer,
          committedAt: latest.committedAt,
          timestamp: new Date().toISOString(),
        });
        allValid = false;
        continue;
      }

      const validation = validateProvenance(latest.envelope, verifyConfigs);
      if (!validation.ok) {
        console.error(`  ❌ Validation failed: ${validation.reason}`);
        results.push({
          urn,
          ok: false,
          reason: validation.reason,
          issuer: latest.issuer,
          committedAt: latest.committedAt,
          timestamp: new Date().toISOString(),
        });
        allValid = false;
        continue;
      }

      const summary = latest.summary && !latest.summary.error
        ? latest.summary
        : summarizeProvenance(latest.envelope);
      console.log(
        `  ✓ Valid provenance from ${summary.builder || latest.issuer} @ ${summary.timestamp || latest.committedAt}`,
      );
      results.push({
        urn,
        ok: true,
        issuer: latest.issuer,
        committedAt: latest.committedAt,
        builder: summary.builder,
        commit: summary.commit,
        timestamp: summary.timestamp,
        buildTool: summary.buildTool,
        signature: validation.signature ?? null,
      });
    } catch (err) {
      console.error(`  ❌ Error checking provenance: ${err.message}`);
      results.push({
        urn,
        ok: false,
        reason: 'verification-error',
        error: err.message,
        timestamp: new Date().toISOString(),
      });
      allValid = false;
    }
  }
  
  // Write report
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });
  
  const report = {
    sinceRef: since,
    checkedAt: new Date().toISOString(),
    totalUrns: urns.length,
    validCount: results.filter(r => r.ok).length,
    invalidCount: results.filter(r => !r.ok).length,
    allValid,
    results,
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n📊 Report written to: ${outputPath}`);
  console.log(`✅ Valid: ${report.validCount} / ❌ Invalid: ${report.invalidCount}`);
  
  await db.close();
  
  return report;
}

/**
 * CLI entry point
 */
export async function run(argv) {
  const args = argv || process.argv.slice(2);
  
  const options = {
    since: 'HEAD~1',
    outputPath: 'artifacts/security/provenance-report.json',
    dbPath: null,
  };
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--since' && i + 1 < args.length) {
      options.since = args[i + 1];
      i++;
    } else if (args[i] === '--output' && i + 1 < args.length) {
      options.outputPath = args[i + 1];
      i++;
    } else if (args[i] === '--db' && i + 1 < args.length) {
      options.dbPath = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: ossp attest-verify [options]

Verify DSSE attestations and provenance for changed URNs

Options:
  --since <ref>     Git reference to compare against (default: HEAD~1)
  --output <path>   Output path for JSON report (default: artifacts/security/provenance-report.json)
  --db <path>       Database path (default: var/registry.sqlite)
  --help, -h        Show this help message

Examples:
  ossp attest-verify --since HEAD~5
  ossp attest-verify --since origin/main --output report.json
      `.trim());
      process.exit(0);
    }
  }
  
  try {
    const report = await verifyAttestations(options);
    process.exit(report.allValid ? 0 : 1);
  } catch (err) {
    console.error(`\n❌ Fatal error: ${err.message}`);
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(2);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}
