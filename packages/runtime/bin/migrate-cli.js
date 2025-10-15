#!/usr/bin/env node

/**
 * Standalone Protocol Migration CLI
 * 
 * Command-line tool for migrating protocol manifests between versions.
 * Usage: node bin/migrate-cli.js migrate <source> --from v1.0 --to v2.0
 */

import { Command } from 'commander';
import { migrateCommand } from '../cli/commands/migrate.js';

const program = new Command();

program
  .name('protocol-migrate')
  .description('Protocol versioning and migration utilities')
  .version('1.0.0');

// Add migrate command directly
program
  .command('migrate <source>')
  .description('Migrate protocol manifest between versions')
  .requiredOption('--from <version>', 'Source version (e.g., v1.0)')
  .requiredOption('--to <version>', 'Target version (e.g., v2.0)')
  .option('--output <file>', 'Output file path for transformed manifest')
  .option('--diff <file>', 'Output file path for diff report')
  .option('--dry-run', 'Preview changes without writing files')
  .action(migrateCommand);

// Parse CLI arguments
program.showHelpAfterError(true);
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
