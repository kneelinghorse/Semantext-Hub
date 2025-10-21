#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyJws } from '../libs/signing/jws.mjs';

function nowIso() {
  return new Date().toISOString();
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function decodeProtectedHeader(envelope) {
  try {
    const b = envelope?.protected;
    if (!b || typeof b !== 'string') return null;
    return JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

async function loadSignaturePolicy(policyPath) {
  try {
    const json = await readJson(policyPath);
    const mode = json?.requireSignature === false ? 'permissive' : 'enforced';
    const keys = Array.isArray(json?.keys) ? json.keys : [];
    const map = new Map();
    for (const k of keys) {
      if (!k?.keyId || !k?.publicKey) continue;
      map.set(k.keyId, { algorithm: k.algorithm || 'EdDSA', publicKey: k.publicKey });
    }
    return { mode, keys: map, path: policyPath };
  } catch (err) {
    return { mode: 'permissive', keys: new Map(), path: policyPath, error: String(err?.message || err) };
  }
}

async function* walk(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const res = path.resolve(dir, dirent.name);
    if (dirent.isDirectory()) {
      yield* walk(res);
    } else {
      yield res;
    }
  }
}

function usage() {
  console.log(`Usage: ossp security:verify --path <dir> [--policy <path>] [--out <path>]

Scans <dir> recursively for *.sig.json signature envelopes, verifies against the
signature policy keys (Ed25519/ES256), and writes an append-only report.

Options:
  --path <dir>          Directory to scan (required)
  --policy <path>       Signature policy JSON (default: app/config/security/signature-policy.json)
  --out <path>          Output report (default: artifacts/security/signature-report.json)

Notes:
  - Permissive mode never fails the process; invalid/unsigned entries are WARN.
  - Enforced mode will exit 1 if any verification fails.
`);
}

function parseArgs(argv = process.argv.slice(2)) {
  const opts = { path: null, policy: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--path') opts.path = argv[++i];
    else if (a === '--policy') opts.policy = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '-h' || a === '--help') return { help: true };
  }
  return opts;
}

async function main() {
  const root = path.resolve(process.cwd());
  const defaults = {
    policy: path.resolve(root, 'app/config/security/signature-policy.json'),
    out: path.resolve(root, 'artifacts/security/signature-report.json'),
  };

  const argv = parseArgs();
  if (argv.help || !argv.path) {
    usage();
    process.exit(argv.help ? 0 : 1);
  }

  const scanRoot = path.resolve(root, argv.path);
  const policyPath = path.resolve(root, argv.policy || defaults.policy);
  const outPath = path.resolve(root, argv.out || defaults.out);

  const policy = await loadSignaturePolicy(policyPath);

  const items = [];
  for await (const file of walk(scanRoot)) {
    if (!file.endsWith('.sig.json')) continue;
    let envelope = null;
    let errors = [];
    try {
      envelope = await readJson(file);
    } catch (err) {
      items.push({ file, status: 'error', errors: [String(err?.message || err)] });
      continue;
    }

    const header = decodeProtectedHeader(envelope);
    const kid = header?.kid || null;
    const key = kid ? policy.keys.get(kid) : null;

    let verification = null;
    if (key) {
      try {
        verification = verifyJws(envelope, { publicKey: key.publicKey, keyId: kid });
      } catch (err) {
        errors.push(String(err?.message || err));
      }
    } else {
      errors.push(`No key in policy for kid '${kid ?? '<missing>'}'`);
    }

    const valid = Boolean(verification?.valid);
    const record = {
      file,
      kid,
      alg: header?.alg || null,
      status: valid ? 'verified' : 'warn',
      signatureValid: verification?.signatureValid ?? false,
      digestValid: verification?.digestValid ?? false,
      errors: [...(verification?.errors || []), ...errors],
    };
    items.push(record);
  }

  const summary = {
    ts: nowIso(),
    policy: { path: policy.path, mode: policy.mode, keys: policy.keys.size },
    scannedRoot: scanRoot,
    counts: {
      total: items.length,
      verified: items.filter((i) => i.status === 'verified').length,
      warn: items.filter((i) => i.status === 'warn').length,
      error: items.filter((i) => i.status === 'error').length,
    },
    items,
  };

  await writeJson(outPath, summary);

  const mode = policy.mode;
  console.log(
    `[security:verify] ${items.length} signatures scanned — verified=${summary.counts.verified}, warn=${summary.counts.warn}, error=${summary.counts.error} (mode=${mode})\n→ ${path.relative(root, outPath)}`,
  );

  if (mode !== 'permissive' && (summary.counts.warn > 0 || summary.counts.error > 0)) {
    process.exit(1);
  }
}

if (import.meta.url === `file://${fileURLToPath(import.meta.url)}`) {
  main().catch((err) => {
    console.error('[security:verify] fatal', err);
    process.exit(1);
  });
}

