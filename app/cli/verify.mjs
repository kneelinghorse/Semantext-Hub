#!/usr/bin/env node

import fs from 'fs-extra';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { verifyJws } from '../libs/signing/jws.mjs';

function parseArgs(argv) {
  const options = {
    signatureJson: false,
  };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case '--key':
        options.keyPath = argv[++index];
        break;
      case '--kid':
        options.keyId = argv[++index];
        break;
      case '--json':
        options.signatureJson = true;
        break;
      case '--payload':
        options.payloadPath = argv[++index];
        break;
      case '--payload-json':
        options.payloadJson = argv[++index];
        break;
      case '--now':
        options.now = argv[++index];
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (token.startsWith('--')) {
          throw new Error(`Unknown option: ${token}`);
        }
        positionals.push(token);
        break;
    }
  }
  options.positionals = positionals;
  return options;
}

function printHelp() {
  console.log(`Usage: ossp verify <signature.json|-> --key <public.pem> [options]

Options:
  --key <path>            Public key (PEM) path
  --kid <id>              Require key identifier to match
  --json                  Treat signature argument as inline JSON
  --payload <path>        Expected payload (JSON file)
  --payload-json <json>   Expected payload (inline JSON)
  --now <iso>             Override current time (ISO-8601) for expiry checks
  --help                  Show this help message

Examples:
  ossp verify sig.json --key ed25519.pub.pem
  ossp verify '{\"spec\":\"identity-access.signing.v1\", ...}' --json --key p256.pub.pem --kid urn:proto:agent:signer@1
`);
}

async function loadSignature(options) {
  if (options.positionals.length === 0) {
    throw new Error('Signature source is required');
  }
  const source = options.positionals[0];
  if (options.signatureJson) {
    return parseJson(source, 'inline signature');
  }
  if (source === '-') {
    const raw = await readStdin();
    return parseJson(raw, 'STDIN signature');
  }
  const contents = await fs.readFile(source, 'utf8');
  return parseJson(contents, source);
}

async function loadExpectedPayload(options) {
  if (options.payloadJson) {
    return parseJson(options.payloadJson, 'inline payload');
  }
  if (options.payloadPath) {
    const contents = await fs.readFile(options.payloadPath, 'utf8');
    return parseJson(contents, options.payloadPath);
  }
  return undefined;
}

async function readPublicKey(path) {
  if (!path) throw new Error('Public key path is required (--key)');
  return fs.readFile(path);
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

async function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on('error', reject);
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.resume();
  });
}

export async function verifyCommand(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    printHelp();
    return;
  }

  if (!options.keyPath) {
    console.error('Missing required option: --key <public.pem>');
    process.exitCode = 1;
    return;
  }

  try {
    const envelope = await loadSignature(options);
    const publicKey = await readPublicKey(options.keyPath);
    const expectedPayload = await loadExpectedPayload(options);
    const now = options.now ? new Date(options.now) : undefined;
    if (options.now && Number.isNaN(now?.getTime?.())) {
      throw new Error(`Invalid ISO timestamp for --now: ${options.now}`);
    }
    const result = verifyJws(envelope, {
      publicKey,
      expectedPayload,
      keyId: options.keyId,
      now,
    });

    const output = {
      ok: result.valid,
      errors: result.errors,
      header: result.header,
      digestValid: result.digestValid,
      signatureValid: result.signatureValid,
    };
    if (result.payload !== null) {
      output.payload = result.payload;
    }

    const json = JSON.stringify(output, null, 2);
    if (result.valid) {
      console.log(json);
    } else {
      console.error(json);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyCommand();
}
