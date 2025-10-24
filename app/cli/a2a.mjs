#!/usr/bin/env node

import process from 'node:process';

import { callAgent } from '../libs/a2a/client.mjs';

const EXIT_OK = 0;
const EXIT_ERROR = 1;

function parseNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a finite number`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    json: false,
    retries: undefined,
    timeout: undefined,
    backoff: {},
    circuitBreaker: {},
    headers: {},
    positionals: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case '--to':
        options.to = argv[++index];
        break;
      case '--message':
        options.message = argv[++index];
        break;
      case '--timeout':
        options.timeout = parseNumber(argv[++index], '--timeout');
        break;
      case '--retries':
        options.retries = Math.max(0, Math.floor(parseNumber(argv[++index], '--retries')));
        break;
      case '--backoff':
        options.backoff.base = parseNumber(argv[++index], '--backoff');
        break;
      case '--backoff-factor':
        options.backoff.factor = parseNumber(argv[++index], '--backoff-factor');
        break;
      case '--backoff-max':
        options.backoff.max = parseNumber(argv[++index], '--backoff-max');
        break;
      case '--backoff-jitter':
        options.backoff.jitter = parseNumber(argv[++index], '--backoff-jitter');
        break;
      case '--circuit-threshold':
        options.circuitBreaker.failureThreshold = parseNumber(
          argv[++index],
          '--circuit-threshold',
        );
        break;
      case '--circuit-cooldown':
        options.circuitBreaker.cooldownMs = parseNumber(argv[++index], '--circuit-cooldown');
        break;
      case '--registry-url':
        options.registryUrl = argv[++index];
        break;
      case '--api-key':
        options.apiKey = argv[++index];
        break;
      case '--session':
        options.sessionId = argv[++index];
        break;
      case '--log-root':
        options.logRoot = argv[++index];
        break;
      case '--header':
        {
          const headerSpec = argv[++index];
          const separatorIndex = headerSpec.indexOf(':');
          if (separatorIndex === -1) {
            throw new Error('--header expects "Name: Value"');
          }
          const name = headerSpec.slice(0, separatorIndex).trim();
          const value = headerSpec.slice(separatorIndex + 1).trim();
          if (!name) {
            throw new Error('Header name must be non-empty');
          }
          options.headers[name] = value;
        }
        break;
      case '--json':
        options.json = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (token.startsWith('--')) {
          throw new Error(`Unknown option: ${token}`);
        }
        options.positionals.push(token);
        break;
    }
  }

  options.command = options.positionals.shift() ?? null;
  return options;
}

function printHelp() {
  console.log(`Usage: ossp a2a <command> --to <urn|capability> [options]

Commands:
  echo                 Send an echo request via A2A client

Options:
  --to <urn|cap>       Target agent URN or capability (required)
  --message <text>     Message payload for echo (default: "ping")
  --timeout <ms>       Request timeout in milliseconds (default: 5000)
  --retries <count>    Number of retry attempts (default: 2)
  --backoff <ms>       Base backoff delay in milliseconds (default: 200)
  --backoff-factor <n> Exponential backoff factor (default: 2)
  --backoff-max <ms>   Maximum backoff delay (default: 2000)
  --backoff-jitter <n> Random jitter (0-1 range, default: 0.25)
  --circuit-threshold <n> Failures before circuit opens (default: 3)
  --circuit-cooldown <ms> Cooldown before half-open (default: 15000)
  --registry-url <url> Registry base URL (default: http://localhost:3000)
  --api-key <key>      Registry API key (required if OSSP_REGISTRY_API_KEY not set)
  --session <id>       Metrics session identifier
  --log-root <path>    Metrics log root directory
  --header "Name: Value"  Extra header for agent request (repeatable)
  --json               Emit JSON result payload
  --help               Show this message
`);
}

function buildCallOptions(options) {
  const callOptions = {
    registryUrl: options.registryUrl,
    apiKey: options.apiKey,
    sessionId: options.sessionId,
    logRoot: options.logRoot,
    headers: Object.keys(options.headers).length > 0 ? options.headers : undefined,
  };
  if (options.timeout !== undefined) {
    callOptions.timeout = options.timeout;
  }
  if (options.retries !== undefined) {
    callOptions.retries = options.retries;
  }

  if (
    options.backoff.base !== undefined ||
    options.backoff.factor !== undefined ||
    options.backoff.max !== undefined ||
    options.backoff.jitter !== undefined
  ) {
    callOptions.backoff = {
      ...options.backoff,
    };
  }

  if (
    options.circuitBreaker.failureThreshold !== undefined ||
    options.circuitBreaker.cooldownMs !== undefined
  ) {
    callOptions.circuitBreaker = {
      ...options.circuitBreaker,
    };
  }

  return callOptions;
}

function formatSuccess(result) {
  const target = result.trace?.resolution?.urn ?? result.trace?.target ?? 'target';
  const summaryLines = [
    `✅ A2A echo succeeded for ${target}`,
    `Correlation ID: ${result.trace?.correlationId}`,
  ];
  if (result.trace?.durationMs !== undefined) {
    summaryLines.push(`Duration: ${result.trace.durationMs}ms`);
  }
  if (result.data !== null && result.data !== undefined) {
    summaryLines.push(`Response: ${JSON.stringify(result.data)}`);
  }
  return summaryLines.join('\n');
}

function formatFailure(result) {
  const lines = [
    `❌ A2A echo failed: ${result.error?.message ?? 'Unknown error'}`,
    `Correlation ID: ${result.trace?.correlationId ?? 'n/a'}`,
  ];
  if (result.trace?.circuitBreaker?.state === 'open') {
    lines.push('Circuit breaker is open; wait for cooldown before retrying.');
  }
  const attempts = result.trace?.attempts ?? [];
  if (attempts.length > 0) {
    const lastAttempt = attempts[attempts.length - 1];
    if (lastAttempt?.error?.code) {
      lines.push(`Last error code: ${lastAttempt.error.code}`);
    }
    if (lastAttempt?.error?.status) {
      lines.push(`Last status: ${lastAttempt.error.status}`);
    }
  }
  return lines.join('\n');
}

export async function run(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    return EXIT_ERROR;
  }

  if (options.help || !options.command) {
    printHelp();
    return EXIT_OK;
  }

  if (!options.to) {
    console.error('Missing required option: --to <urn|capability>');
    return EXIT_ERROR;
  }

  const supportedCommands = new Set(['echo']);
  if (!supportedCommands.has(options.command)) {
    console.error(`Unknown command: ${options.command}`);
    return EXIT_ERROR;
  }

  const cliApiKey = options.apiKey ?? process.env.OSSP_REGISTRY_API_KEY;
  if (!cliApiKey || typeof cliApiKey !== 'string' || cliApiKey.trim().length === 0) {
    console.error(
      'Registry API key is required. Provide --api-key or set OSSP_REGISTRY_API_KEY before running this command.',
    );
    return EXIT_ERROR;
  }
  options.apiKey = cliApiKey.trim();

  const callOptions = buildCallOptions(options);
  const payload = {
    message: options.message ?? 'ping',
  };

  let result;
  try {
    result = await callAgent(options.to, options.command, payload, callOptions);
  } catch (error) {
    console.error(`A2A call failed: ${error.message}`);
    return EXIT_ERROR;
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? EXIT_OK : EXIT_ERROR;
  }

  if (result.ok) {
    console.log(formatSuccess(result));
    return EXIT_OK;
  }

  console.error(formatFailure(result));
  return EXIT_ERROR;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2))
    .then((code) => {
      if (typeof code === 'number') {
        process.exitCode = code;
      }
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = EXIT_ERROR;
    });
}
