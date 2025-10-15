#!/usr/bin/env node
/**
 * Minimal ESM runner for the scaffold command
 * Avoids CommonJS/ESM conflicts by invoking the ESM scaffolder directly.
 */
import { fileURLToPath } from 'url';
import path from 'path';
import { executeScaffoldCommand, showScaffoldExamples } from './commands/scaffold.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  // Strip node and script path
  const args = argv.slice(2);

  // Optional leading subcommand (e.g., `scaffold`)
  if (args[0] && args[0].toLowerCase() === 'scaffold') {
    args.shift();
  }

  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') continue;
    if (a.startsWith('--')) {
      const [key, valFromEq] = a.slice(2).split('=');
      let val = valFromEq;
      if (val === undefined) {
        const next = args[i + 1];
        if (next && !next.startsWith('-')) {
          val = next;
          i++;
        } else {
          val = true;
        }
      }
      out[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = val;
    } else if (a.startsWith('-')) {
      // Simple short flags aggregator like -abc
      const flags = a.slice(1).split('');
      flags.forEach(f => (out[f] = true));
    } else {
      out._.push(a);
    }
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv);

  // Examples help
  if (opts.examples) {
    await showScaffoldExamples();
    return;
  }

  // Interactive mode: no type/name provided
  const interactive = !opts.type && !opts.name;

  await executeScaffoldCommand({
    interactive,
    type: opts.type ? String(opts.type) : undefined,
    name: opts.name ? String(opts.name) : undefined,
    output: opts.output || path.join(__dirname, '../artifacts/scaffolds'),
    version: opts.version || '1.0.0',
    description: opts.description,
    write: opts.write !== false && opts.noWrite !== true,
    dryRun: opts.dryRun === true,
    includeImporter: opts.importer !== false && opts.noImporter !== true,
    includeTests: opts.tests !== false && opts.noTests !== true,
    baseUrl: opts.baseUrl,
    format: opts.format,
    transport: opts.transport,
    trace: !!opts.trace,
    verbose: !!opts.verbose,
    redact: opts.redact !== false,
  });
}

main().catch(err => {
  console.error('❌ Scaffold failed:', err?.message || err);
  process.exit(1);
});
