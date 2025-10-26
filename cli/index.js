#!/usr/bin/env node

/**
 * Protocol Discovery CLI
 *
 * Minimal entry point currently exposing performance status reporting for CI guardrails.
 * Additional commands can be registered here as new automation workflows land.
 */

import { Command } from 'commander';

import { createConsole } from '../src/cli/ux/console.js';
import { CatalogCliError } from './commands/catalog-shared.js';

const program = new Command();

program
  .name('app-cli')
  .description('OSSP-AGI tooling CLI')
  .version('0.1.0', '-v, --version', 'Show CLI version');

program
  .command('perf:status')
  .alias('perf-status')
  .description('Display performance status summary')
  .option('--workspace <path>', 'Workspace root', process.cwd())
  .option('--verbose', 'Enable verbose logging', false)
  .option('--format <format>', 'Output format: text|json', 'text')
  .action(async (options) => {
    const { perfStatusCommand } = await import('./commands/perf-status.js');

    await perfStatusCommand({
      workspace: options.workspace,
      verbose: Boolean(options.verbose),
      format: options.format
    });
  });

program
  .command('perf:report')
  .alias('perf-report')
  .description('Generate detailed performance report with percentile metrics (p50/p95/p99)')
  .option('--workspace <path>', 'Workspace root', process.cwd())
  .option('--verbose', 'Enable verbose logging with source log paths', false)
  .option('--format <format>', 'Output format: table|json', 'table')
  .action(async (options) => {
    const { perfReportCommand } = await import('./commands/perf-report.js');

    await perfReportCommand({
      workspace: options.workspace,
      verbose: Boolean(options.verbose),
      format: options.format
    });
  });

const catalog = program
  .command('catalog')
  .description('Catalog browsing and visualization commands');

catalog
  .command('list')
  .description('List catalog entries')
  .option('--workspace <path>', 'Workspace root', process.cwd())
  .option('--format <format>', 'Output format: table|json', 'table')
  .action(async (options) => {
    try {
      const { catalogListCommand } = await import('./commands/catalog-list.js');
      await catalogListCommand({
        workspace: options.workspace,
        format: options.format
      });
    } catch (error) {
      handleCatalogCommandError(error);
    }
  });

catalog
  .command('view <identifier>')
  .description('View detailed information for a catalog entry')
  .option('--workspace <path>', 'Workspace root', process.cwd())
  .option('--format <format>', 'Output format: pretty|json', 'pretty')
  .action(async (identifier, options) => {
    try {
      const { catalogViewCommand } = await import('./commands/catalog-view.js');
      await catalogViewCommand(identifier, {
        workspace: options.workspace,
        format: options.format
      });
    } catch (error) {
      handleCatalogCommandError(error);
    }
  });

catalog
  .command('generate-diagram [identifier]')
  .description('Generate a Draw.io diagram for the catalog or a specific protocol')
  .option('--workspace <path>', 'Workspace root', process.cwd())
  .option('-o, --output <path>', 'Output file or directory')
  .option('-f, --format <format>', 'Diagram format', 'drawio')
  .option('--theme <name>', 'Theme identifier to apply')
  .option('--overwrite', 'Allow overwriting the output file', false)
  .option('--open', 'Open the generated diagram when interactive', false)
  .action(async (identifier, options) => {
    try {
      const { catalogGenerateDiagramCommand } = await import('./commands/catalog-generate-diagram.js');
      await catalogGenerateDiagramCommand(identifier, {
        workspace: options.workspace,
        output: options.output,
        format: options.format,
        themeId: options.theme,
        overwrite: Boolean(options.overwrite),
        open: Boolean(options.open)
      });
    } catch (error) {
      handleCatalogCommandError(error);
    }
  });

const workbench = program
  .command('workbench')
  .description('Integration workbench orchestration commands');

const theme = program.command('theme').description('Visualization theming utilities');

theme
  .command('switch <name>')
  .description('Activate a theme and regenerate visualization artifacts')
  .option('--workspace <path>', 'Workspace root', process.cwd())
  .option('--no-include-metadata', 'Omit catalog metadata from Cytoscape exports')
  .action(async (name, options) => {
    try {
      const { themeSwitchCommand } = await import('./commands/theme-switch.js');
      await themeSwitchCommand(name, {
        workspace: options.workspace,
        includeMetadata: options.includeMetadata
      });
    } catch (error) {
      handleCatalogCommandError(error);
    }
  });

workbench
  .command('run')
  .description('Execute an integration workflow definition')
  .requiredOption('--workflow <file>', 'Workflow definition file (YAML or JSON)')
  .option('--format <format>', 'Output format: text|json', 'text')
  .option('--output <path>', 'Optional file or directory for JSON summary output')
  .option('--fail-fast', 'Stop immediately on first failed step', false)
  .action(async (options) => {
    try {
      const { workbenchRunCommand } = await import('./commands/workbench-run.js');
      await workbenchRunCommand({
        workflow: options.workflow,
        format: options.format,
        output: options.output,
        failFast: Boolean(options.failFast)
      });
    } catch (error) {
      handleCatalogCommandError(error);
    }
  });

workbench
  .command('bench')
  .description('Run canned integration benchmark and export latency metrics')
  .option('--workspace <path>', 'Workspace root', process.cwd())
  .option('--iterations <count>', 'Number of benchmark iterations', '5')
  .option('--output <path>', 'Output directory or file for perf-results.json')
  .option('--format <format>', 'Output format: text|json', 'text')
  .action(async (options) => {
    try {
      const { workbenchBenchCommand } = await import('./commands/workbench-bench.js');
      await workbenchBenchCommand({
        workspace: options.workspace,
        iterations: options.iterations,
        output: options.output,
        format: options.format
      });
    } catch (error) {
      handleCatalogCommandError(error);
    }
  });

program
  .configureHelp({
    sortSubcommands: true
  })
  .showSuggestionAfterError(true)
  .enablePositionalOptions();

program.parseAsync(process.argv).catch((error) => {
  handleCatalogCommandError(error);
  process.exit(1);
});

function handleCatalogCommandError(error) {
  const consoleUi = createConsole();
  if (error instanceof CatalogCliError) {
    consoleUi.error(error.message, error.details);
  } else {
    const message = error?.message ?? String(error);
    consoleUi.error('Unexpected CLI failure.', [message]);
  }
  process.exitCode = 1;
}
