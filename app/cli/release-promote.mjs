#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { verifyJws } from '../libs/signing/jws.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');
const DEFAULT_MANIFEST_PATH = resolve(APP_ROOT, 'protocols', 'release', 'manifest.json');
const DEFAULT_POLICY = Object.freeze({
  allowedAlgs: ['EdDSA', 'ES256'],
  requiredFields: ['artifact', 'sha256', 'sessionId', 'signedAt'],
});

const EXIT_OK = 0;
const EXIT_FAIL = 1;

function parseArgs(argv) {
  const options = {
    artifactRoot: null,
    json: false,
    allowedAlgs: null,
    requiredFields: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case '--manifest':
        options.manifest = argv[++index];
        break;
      case '--artifact-root':
        options.artifactRoot = argv[++index];
        break;
      case '--report':
        options.report = argv[++index];
        break;
      case '--report-sig':
        options.reportSig = argv[++index];
        break;
      case '--diagram':
        options.diagram = argv[++index];
        break;
      case '--diagram-sig':
        options.diagramSig = argv[++index];
        break;
      case '--public-key':
        options.publicKey = argv[++index];
        break;
      case '--policy':
        options.policy = argv[++index];
        break;
      case '--allowed-algs':
        options.allowedAlgs = argv[++index];
        break;
      case '--required-fields':
        options.requiredFields = argv[++index];
        break;
      case '--key-id':
        options.keyId = argv[++index];
        break;
      case '--json':
        options.json = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: ossp release promote [options]

Options:
  --manifest <path>         Release manifest to update (default: ${DEFAULT_MANIFEST_PATH})
  --artifact-root <dir>     Directory containing report.json and diagram.drawio
  --report <path>           Override report.json path
  --report-sig <path>       Override report signature path
  --diagram <path>          Override diagram.drawio path
  --diagram-sig <path>      Override diagram signature path
  --public-key <path>       PEM encoded public key for verification (required)
  --policy <path>           Optional policy JSON with {allowedAlgs,requiredFields}
  --allowed-algs <list>     Override allowed algorithms (comma separated)
  --required-fields <list>  Override required payload fields (comma separated)
  --key-id <kid>            Require matching key identifier
  --json                    Emit JSON summary
  -h, --help                Show this help text
`);
}

function resolveUserPath(pathValue) {
  if (!pathValue) return null;
  if (isAbsolute(pathValue)) {
    return pathValue;
  }
  return resolve(process.cwd(), pathValue);
}

async function loadPolicy(options) {
  if (!options.policy) {
    return { ...DEFAULT_POLICY };
  }
  const policyPath = resolveUserPath(options.policy);
  const payload = await readFile(policyPath, 'utf8');
  const parsed = JSON.parse(payload);
  return {
    allowedAlgs: Array.isArray(parsed.allowedAlgs) ? parsed.allowedAlgs : DEFAULT_POLICY.allowedAlgs,
    requiredFields: Array.isArray(parsed.requiredFields)
      ? parsed.requiredFields
      : DEFAULT_POLICY.requiredFields,
  };
}

function overridePolicy(policy, options) {
  const next = { ...policy };
  if (typeof options.allowedAlgs === 'string') {
    next.allowedAlgs = options.allowedAlgs
      .split(',')
      .map((alg) => alg.trim())
      .filter(Boolean);
  }
  if (typeof options.requiredFields === 'string') {
    next.requiredFields = options.requiredFields
      .split(',')
      .map((field) => field.trim())
      .filter(Boolean);
  }
  return next;
}

async function loadManifest(manifestPath) {
  const payload = await readFile(manifestPath, 'utf8');
  return JSON.parse(payload);
}

function selectArtifactPath(basePath, fileName) {
  if (!basePath) return null;
  return join(basePath, fileName);
}

async function readJsonFile(pathValue) {
  const payload = await readFile(pathValue, 'utf8');
  return JSON.parse(payload);
}

function ensureField(payload, field) {
  if (!field) return true;
  const segments = field.split('.');
  let current = payload;
  for (const part of segments) {
    if (current == null || !(part in current)) {
      return false;
    }
    current = current[part];
  }
  return current !== undefined && current !== null && current !== '';
}

function computeDigest(buffer) {
  return createHash('sha256').update(buffer).digest('base64url');
}

function formatSummary(results) {
  const pairs = results.map((item) => `${item.label}=${item.ok ? 'ok' : 'fail'}`);
  return `Promotion verification: ${pairs.join(', ')}`;
}

async function verifyArtifact({ label, artifactPath, signaturePath }, context) {
  const errors = [];
  let artifactBuffer;
  try {
    artifactBuffer = await readFile(artifactPath);
  } catch (error) {
    return {
      label,
      artifactPath,
      signaturePath,
      ok: false,
      errors: [`Failed to read ${label} (${artifactPath}): ${error.message}`],
    };
  }

  let envelope;
  try {
    envelope = await readJsonFile(signaturePath);
  } catch (error) {
    return {
      label,
      artifactPath,
      signaturePath,
      ok: false,
      errors: [`Failed to read signature for ${label}: ${error.message}`],
    };
  }

  const verification = verifyJws(envelope, {
    publicKey: context.publicKey,
    keyId: context.keyId,
  });

  const algorithm = verification.header?.alg ?? envelope?.header?.alg ?? null;
  const keyId = verification.header?.kid ?? envelope?.header?.kid ?? null;
  if (context.policy.allowedAlgs?.length && algorithm && !context.policy.allowedAlgs.includes(algorithm)) {
    errors.push(`Algorithm ${algorithm} is not allowed`);
  }

  if (!verification.valid) {
    errors.push(...verification.errors);
  }

  const payload = verification.payload ?? {};
  const digest = computeDigest(artifactBuffer);
  if (payload.sha256 !== digest) {
    errors.push('Digest mismatch between artifact and signature payload');
  }

  if (payload.artifact !== label) {
    errors.push(`Signed artifact label (${payload.artifact}) does not match expected ${label}`);
  }

  if (context.policy.requiredFields?.length) {
    for (const field of context.policy.requiredFields) {
      if (!ensureField(payload, field)) {
        errors.push(`Signature payload missing required field: ${field}`);
      }
    }
  }

  return {
    label,
    artifactPath,
    signaturePath,
    ok: errors.length === 0,
    errors,
    algorithm,
    keyId,
    payload,
    envelope,
    digest,
  };
}

async function writeManifest(manifestPath, manifest) {
  await mkdir(dirname(manifestPath), { recursive: true });
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(manifestPath, serialized, 'utf8');
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

export async function run(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    return EXIT_FAIL;
  }

  if (args.help) {
    printHelp();
    return EXIT_OK;
  }

  if (!args.publicKey) {
    console.error('Missing --public-key option');
    return EXIT_FAIL;
  }

  const manifestPath = resolveUserPath(args.manifest ?? DEFAULT_MANIFEST_PATH);
  const artifactRoot = resolveUserPath(args.artifactRoot);
  const publicKeyPath = resolveUserPath(args.publicKey);
  let publicKey;
  try {
    publicKey = await readFile(publicKeyPath, 'utf8');
  } catch (error) {
    console.error(`Failed to read public key at ${publicKeyPath}: ${error.message}`);
    return EXIT_FAIL;
  }

  let manifest;
  try {
    manifest = await loadManifest(manifestPath);
  } catch (error) {
    console.error(`Failed to load manifest at ${manifestPath}: ${error.message}`);
    return EXIT_FAIL;
  }

  let policy;
  try {
    policy = await loadPolicy(args);
    policy = overridePolicy(policy, args);
  } catch (error) {
    console.error(`Failed to load policy: ${error.message}`);
    return EXIT_FAIL;
  }

  const artifacts = [
    {
      label: 'report.json',
      artifactPath: resolveUserPath(args.report) ?? selectArtifactPath(artifactRoot, 'report.json'),
      signaturePath:
        resolveUserPath(args.reportSig) ??
        (selectArtifactPath(artifactRoot, 'report.json') &&
          `${selectArtifactPath(artifactRoot, 'report.json')}.sig.json`),
    },
    {
      label: 'diagram.drawio',
      artifactPath: resolveUserPath(args.diagram) ?? selectArtifactPath(artifactRoot, 'diagram.drawio'),
      signaturePath:
        resolveUserPath(args.diagramSig) ??
        (selectArtifactPath(artifactRoot, 'diagram.drawio') &&
          `${selectArtifactPath(artifactRoot, 'diagram.drawio')}.sig.json`),
    },
  ];

  for (const item of artifacts) {
    if (!item.artifactPath || !item.signaturePath) {
      console.error(`Missing paths for ${item.label}; provide --artifact-root or explicit overrides.`);
      return EXIT_FAIL;
    }
  }

  const verificationResults = [];
  for (const item of artifacts) {
    // eslint-disable-next-line no-await-in-loop
    const result = await verifyArtifact(item, {
      publicKey,
      keyId: args.keyId,
      policy,
    });
    verificationResults.push(result);
  }

  const failures = verificationResults.filter((item) => !item.ok);
  if (failures.length > 0) {
    if (args.json) {
      console.error(
        JSON.stringify(
          {
            status: 'failed',
            manifestPath,
            failures: failures.map((item) => ({
              label: item.label,
              errors: item.errors,
            })),
          },
          null,
          2,
        ),
      );
    } else {
      for (const failure of failures) {
        console.error(`${failure.label} verification failed: ${failure.errors.join('; ')}`);
      }
    }
    return EXIT_FAIL;
  }

  const now = new Date().toISOString();
  const signers = uniqueSorted(verificationResults.map((item) => item.keyId));
  const sessionIds = uniqueSorted(verificationResults.map((item) => item.payload?.sessionId));
  const promotion = {
    status: 'verified',
    verifiedAt: now,
    summary: formatSummary(verificationResults),
    signers,
    sessionIds,
    artifacts: verificationResults.map((item) => ({
      name: item.label,
      sha256: item.digest,
      keyId: item.keyId,
      algorithm: item.algorithm,
    })),
    attestations: verificationResults.map((item) => item.envelope),
  };

  manifest.promotion = promotion;

  try {
    await writeManifest(manifestPath, manifest);
  } catch (error) {
    console.error(`Failed to write manifest at ${manifestPath}: ${error.message}`);
    return EXIT_FAIL;
  }

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          status: 'verified',
          manifestPath,
          promotion,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(promotion.summary);
  }

  return EXIT_OK;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then((code) => {
    process.exitCode = code;
  });
}
