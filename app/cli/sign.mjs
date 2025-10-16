#!/usr/bin/env node

import fs from 'fs-extra';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { signJws } from '../libs/signing/jws.mjs';

function parseArgs(argv) {
  const options = {
    algorithm: 'EdDSA',
    interpretAsJson: false,
    stdin: false,
  };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case '--alg':
      case '--algorithm':
        options.algorithm = argv[++index];
        break;
      case '--key':
        options.keyPath = argv[++index];
        break;
      case '--kid':
        options.keyId = argv[++index];
        break;
      case '--json':
        options.interpretAsJson = true;
        break;
      case '--header':
        options.headerJson = argv[++index];
        break;
      case '--expires':
        options.expiresAt = argv[++index];
        break;
      case '--out':
      case '--output':
        options.outputPath = argv[++index];
        break;
      case '--stdin':
        options.stdin = true;
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
  console.log(`Usage: ossp sign <payload.json|-> --key <private.pem> --kid <urn> [options]

Options:
  --alg, --algorithm <EdDSA|ES256>   Signing algorithm (default: EdDSA)
  --key <path>                       Private key (PEM) path
  --kid <id>                         Key identifier recorded in the signature
  --json                             Treat positional payload argument as raw JSON text
  --stdin                            Read payload JSON from STDIN
  --header <json>                    Additional protected header fields (JSON string)
  --expires <iso>                    Expiration timestamp (ISO-8601)
  --out, --output <path>             Write envelope to file instead of stdout
  --help                             Show this help message

Examples:
  ossp sign manifest.json --key ed25519.pem --kid urn:proto:agent:signer@1
  ossp sign '{\"foo\":\"bar\"}' --json --key ecdsa.pem --kid urn:proto:agent:signer@1 --alg ES256
`);
}

async function readPayload(options) {
  if (options.stdin) {
    const raw = await readStdin();
    return parseJson(raw, 'STDIN payload');
  }
  if (options.positionals.length === 0) {
    throw new Error('Payload source is required');
  }
  const source = options.positionals[0];
  if (options.interpretAsJson) {
    return parseJson(source, 'inline payload');
  }
  if (source === '-') {
    const raw = await readStdin();
    return parseJson(raw, 'STDIN payload');
  }
  const contents = await fs.readFile(source, 'utf8');
  return parseJson(contents, source);
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

async function readStdin() {
  if (!process.stdin.isTTY) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      process.stdin.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      process.stdin.on('error', reject);
      process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      process.stdin.resume();
    });
  }
  return '';
}

async function loadKey(path) {
  if (!path) throw new Error('Private key path is required (--key)');
  return fs.readFile(path);
}

function parseHeader(json) {
  if (!json) return undefined;
  return parseJson(json, 'header');
}

export async function signCommand(argv = process.argv.slice(2)) {
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
    console.error('Missing required option: --key <private.pem>');
    process.exitCode = 1;
    return;
  }
  if (!options.keyId) {
    console.error('Missing required option: --kid <identifier>');
    process.exitCode = 1;
    return;
  }

  try {
    const payload = await readPayload(options);
    const privateKey = await loadKey(options.keyPath);
    const header = parseHeader(options.headerJson);
    const envelope = signJws(payload, {
      privateKey,
      keyId: options.keyId,
      algorithm: options.algorithm,
      header,
      expiresAt: options.expiresAt,
    });

    const json = JSON.stringify(envelope, null, 2);
    if (options.outputPath) {
      await fs.outputFile(options.outputPath, `${json}\n`, 'utf8');
    } else {
      console.log(json);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  signCommand();
}
