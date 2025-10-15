#!/usr/bin/env node

/**
 * Protocol Discovery CLI
 *
 * Main entry point for the protocol-discover command-line tool.
 * Provides commands for discovering, reviewing, and approving protocol manifests.
 */

const { Command } = require('commander');
const { discoverCommand } = require('./commands/discover');
const { reviewCommand } = require('./commands/review');
const { approveCommand } = require('./commands/approve');
const { governanceCommand } = require('./commands/governance');
const { demoCommand } = require('./commands/demo');
const { executeGenerateCommand } = require('./commands/generate');
const { serveCommand } = require('./commands/serve');
const { executeScaffoldCommand, listScaffoldTypes, showScaffoldExamples } = require('./commands/scaffold-wrapper');
// Note: migrate command uses ES modules, will be added separately

const program = new Command();

program
  .name('protocol-discover')
  .description('Discover and convert contracts to protocol manifests')
  .version('0.1.0');

// Discover command
program
  .command('discover <type> <source>')
  .description('Discover contracts (api, data, event)')
  .option('--output <dir>', 'Output directory', 'artifacts')
  .option('--format <fmt>', 'Output format (json, yaml)', 'json')
  .action(discoverCommand);

// Review command (stub for B1.4)
program
  .command('review <manifest>')
  .description('Review draft manifest')
  .option('--auto-approve', 'Auto-approve low-risk changes')
  .action(reviewCommand);

// Approve command (stub for B1.4)
program
  .command('approve <manifest>')
  .description('Approve draft manifest')
  .option('--force', 'Force approve with warnings')
  .action(approveCommand);

// Governance generation command
program
  .command('governance')
  .description('Generate GOVERNANCE.md from protocol data')
  .option('--output <file>', 'Output file path', 'GOVERNANCE.md')
  .option('--manifests <dir>', 'Directory containing manifests', 'protocols')
  .option('--sections <list>', 'Comma-separated list of sections to include')
  .option('--update', 'Update existing file preserving custom sections')
  .option('--no-diagrams', 'Disable dependency diagrams')
  .option('--no-pii', 'Disable PII flow analysis')
  .option('--no-metrics', 'Disable metrics section')
  .action(governanceCommand);

// Demo command
program
  .command('demo <subcommand> [seed-id]')
  .description('Run pre-configured demos (list, run, db)')
  .option('--workspace <dir>', 'Workspace directory for demo output')
  .option('--with-governance', 'Generate governance report after import')
  .option('--start', 'Start database seed (db subcommand)')
  .option('--stop', 'Stop database seed (db subcommand)')
  .option('--status', 'Check database seed status (db subcommand)')
  .action(demoCommand);

// Serve command (viewer server)
program
  .command('serve <artifacts-dir>')
  .description('Start protocol viewer server')
  .option('-p, --port <number>', 'Port to listen on', '3000')
  .action(serveCommand);

// Generate command (consumer codegen)
program
  .command('generate <input>')
  .description('Generate event consumers from manifest(s)')
  .option('--output <dir>', 'Output directory', 'generated-consumers')
  .option('--js', 'Generate JavaScript instead of TypeScript')
  .option('--no-tests', 'Skip test scaffolds')
  .option('--no-pii-util', 'Skip PII masking utility')
  .option('--batch', 'Treat input as directory and generate for all manifests')
  .action((input, options) => {
    return executeGenerateCommand({
      input,
      output: options.output,
      typescript: !options.js,
      tests: options.tests !== false,
      piiUtil: options.piiUtil !== false,
      batch: !!options.batch
    });
  });

// Scaffold command (template generator)
program
  .command('scaffold')
  .description('Generate protocol manifests, importers, and tests from templates')
  .requiredOption('--type <type>', 'Scaffold type (api, data, event, semantic, importer, test)')
  .requiredOption('--name <name>', 'Component name')
  .option('--output <dir>', 'Output directory', './artifacts/scaffolds')
  .option('--version <version>', 'Version', '1.0.0')
  .option('--description <desc>', 'Description')
  .option('--no-write', 'Dry run - do not write files')
  .option('--no-importer', 'Skip importer generation')
  .option('--no-tests', 'Skip test generation')
  .option('--baseUrl <url>', 'API base URL (for api type)')
  .option('--format <format>', 'Data format (for data type)')
  .option('--transport <transport>', 'Event transport (for event type)')
  .action((options) => {
    return executeScaffoldCommand({
      type: options.type,
      name: options.name,
      output: options.output,
      version: options.version,
      description: options.description,
      write: options.write !== false,
      includeImporter: options.importer !== false,
      includeTests: options.tests !== false,
      baseUrl: options.baseUrl,
      format: options.format,
      transport: options.transport
    });
  });

// Migrate command will be added via separate ES module integration

// Parse CLI arguments
program.showHelpAfterError(true);
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
