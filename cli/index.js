#!/usr/bin/env node

import { Command } from 'commander';
import process from 'node:process';

import { createConsole } from '../src/cli/ux/console.js';
import { CatalogCliError } from './commands/catalog-shared.js';

const program = new Command();

program
  .name('sch')
  .description('Semantic Context Hub CLI')
  .version('0.1.0', '-v, --version', 'Show CLI version')
  .configureHelp({ sortSubcommands: true })
  .showSuggestionAfterError(true)
  .enablePositionalOptions();

registerProtocolCommands(program);
registerRegistryCommands(program);
registerPerfCommands(program);
registerContextCommands(program);
registerRetrievalCommands(program);

program
  .command('help')
  .description('Display help information')
  .action(() => {
    program.outputHelp();
  });

program.parseAsync(process.argv).catch(handleCliError);

function registerPerfCommands(root) {
  const perf = root
    .command('perf')
    .description('Performance telemetry utilities for SCH workspaces');

  const statusAction = async (options) => {
    const { perfStatusCommand } = await import('./commands/perf-status.js');
    await perfStatusCommand({
      workspace: options.workspace,
      verbose: Boolean(options.verbose),
      format: options.format
    });
  };

  configurePerfStatusOptions(
    perf
      .command('status')
      .alias('summary')
      .description('Display performance status summary for the current workspace')
  ).action(statusAction);

  registerLegacyAlias(root, 'perf:status', 'sch perf status', configurePerfStatusOptions, statusAction);

  const reportAction = async (options) => {
    const { perfReportCommand } = await import('./commands/perf-report.js');
    await perfReportCommand({
      workspace: options.workspace,
      verbose: Boolean(options.verbose),
      format: options.format
    });
  };

  configurePerfReportOptions(
    perf
      .command('report')
      .description('Generate detailed performance report with percentile metrics (p50/p95/p99)')
  ).action(reportAction);

  registerLegacyAlias(root, 'perf:report', 'sch perf report', configurePerfReportOptions, reportAction);

  const gcAction = async (options) => {
    const { perfGcCommand } = await import('./commands/perf-gc.js');
    await perfGcCommand({
      workspace: options.workspace,
      dryRun: Boolean(options.dryRun),
      json: Boolean(options.json)
    });
  };

  configurePerfGcOptions(
    perf
      .command('gc')
      .description('Run garbage-collection on performance artifacts according to retention policy')
  ).action(gcAction);

  registerLegacyAlias(root, 'perf:gc', 'sch perf gc', configurePerfGcOptions, gcAction);
}

function configurePerfStatusOptions(command) {
  return command
    .option('--workspace <path>', 'Workspace root', process.cwd())
    .option('--verbose', 'Enable verbose logging', false)
    .option('--format <format>', 'Output format: text|json', 'text');
}

function configurePerfReportOptions(command) {
  return command
    .option('--workspace <path>', 'Workspace root', process.cwd())
    .option('--verbose', 'Enable verbose logging with source log paths', false)
    .option('--format <format>', 'Output format: table|json', 'table');
}

function configurePerfGcOptions(command) {
  return command
    .option('--workspace <path>', 'Workspace root', process.cwd())
    .option('--dry-run', 'Preview deletions without removing files', false)
    .option('--json', 'Emit JSON summary instead of text output', false);
}

function registerRegistryCommands(root) {
  const registry = root
    .command('registry')
    .description('Inspect registry manifests and related visualization artifacts');

  configureRegistryListOptions(
    registry
      .command('list')
      .description('List registered protocols in the workspace catalog')
  ).action(async (options) => {
    const { catalogListCommand } = await import('./commands/catalog-list.js');
    await catalogListCommand({
      workspace: options.workspace,
      format: options.format
    });
  });

  configureRegistryViewOptions(
    registry
      .command('view <identifier>')
      .description('View detailed information for a registry entry (ID, URN, or name)')
  ).action(async (identifier, options) => {
    const { catalogViewCommand } = await import('./commands/catalog-view.js');
    await catalogViewCommand(identifier, {
      workspace: options.workspace,
      format: options.format
    });
  });

  configureRegistryDiagramOptions(
    registry
      .command('diagram [identifier]')
      .description('Generate Draw.io diagrams for the registry or a specific protocol')
  ).action(async (identifier, options) => {
    const { catalogGenerateDiagramCommand } = await import('./commands/catalog-generate-diagram.js');
    await catalogGenerateDiagramCommand(identifier, {
      workspace: options.workspace,
      output: options.output,
      format: options.format,
      themeId: options.theme,
      overwrite: Boolean(options.overwrite),
      open: Boolean(options.open)
    });
  });
}

function configureRegistryListOptions(command) {
  return command
    .option('--workspace <path>', 'Workspace root', process.cwd())
    .option('--format <format>', 'Output format: table|json', 'table');
}

function configureRegistryViewOptions(command) {
  return command
    .option('--workspace <path>', 'Workspace root', process.cwd())
    .option('--format <format>', 'Output format: pretty|json', 'pretty');
}

function configureRegistryDiagramOptions(command) {
  return command
    .option('--workspace <path>', 'Workspace root', process.cwd())
    .option('-o, --output <path>', 'Output file or directory')
    .option('-f, --format <format>', 'Diagram format', 'drawio')
    .option('--theme <name>', 'Theme identifier to apply')
    .option('--overwrite', 'Allow overwriting the output file', false)
    .option('--open', 'Open the generated diagram when interactive', false);
}

function registerProtocolCommands(root) {
  const protocol = root
    .command('protocol')
    .description('Protocol validation and approval utilities');

  const validateAction = async (options) => {
    const { validateCommand } = await import('../packages/runtime/cli/commands/validate.js');
    await validateCommand({
      ecosystem: Boolean(options.ecosystem),
      manifests: options.manifests,
      output: options.output,
      format: options.format,
      verbose: Boolean(options.verbose)
    });
  };

  configureProtocolValidateOptions(
    protocol
      .command('validate')
      .description('Validate protocol ecosystem health')
  ).action(validateAction);
}

function configureProtocolValidateOptions(command) {
  return command
    .option('--ecosystem', 'Validate the entire workspace ecosystem', false)
    .option('--manifests <path>', 'Directory containing manifests', 'protocols')
    .option('--output <file>', 'Write validation report to file')
    .option('--format <format>', 'Output format (summary|json)', 'summary')
    .option('--verbose', 'Show detailed validation output', false);
}

function registerContextCommands(root) {
  const context = root
    .command('context')
    .description('Workspace context management utilities');

  context
    .command('status')
    .description('Inspect context state for the active workspace (stub)')
    .option('--workspace <path>', 'Workspace root', process.cwd())
    .action((options) => {
      printStubbedCommandNotice('context status', 'Track context inventory and state transitions (CLI backlog item SCH-CLI-001).', options.workspace);
    });

  context
    .command('sync')
    .description('Synchronise local context cache with registry sources (stub)')
    .option('--workspace <path>', 'Workspace root', process.cwd())
    .action((options) => {
      printStubbedCommandNotice('context sync', 'Implement context cache sync workflow (CLI backlog item SCH-CLI-004).', options.workspace);
    });

  context
    .command('purge')
    .description('Clear cached context artifacts for a clean workspace state (stub)')
    .option('--workspace <path>', 'Workspace root', process.cwd())
    .action((options) => {
      printStubbedCommandNotice('context purge', 'Add targeted purge once context storage contract lands (CLI backlog item SCH-CLI-005).', options.workspace);
    });
}

function registerRetrievalCommands(root) {
  const retrieval = root
    .command('retrieval')
    .description('Retrieval QA and evaluation workflows');

  retrieval
    .command('qa')
    .description('Run retrieval QA harness against curated datasets (stub)')
    .option('--workspace <path>', 'Workspace root', process.cwd())
    .option('--dataset <name>', 'Dataset identifier for QA baseline', 'default')
    .option('--output <file>', 'Optional output file for QA findings')
    .action((options) => {
      printStubbedCommandNotice(
        'retrieval qa',
        `Wire retrieval QA harness for dataset "${options.dataset}" (CLI backlog item SCH-CLI-010).`,
        options.workspace,
        options.output
      );
    });
}

function registerLegacyAlias(root, legacyName, preferredCommand, configure, action) {
  const legacy = configure(
    root
      .command(legacyName)
      .description(`[deprecated] Use \`${preferredCommand}\``)
  );

  legacy.action(async (...args) => {
    console.warn(`[deprecated] Command "${legacyName}" is redirected to "${preferredCommand}". Update scripts to use the canonical invocation.`);
    await action(...args);
  });
}

function printStubbedCommandNotice(command, followUp, workspace, output) {
  const contextLines = [];
  if (workspace) {
    contextLines.push(`Workspace: ${workspace}`);
  }
  if (output) {
    contextLines.push(`Output: ${output}`);
  }

  console.log(`[stub] The "${command}" command is not yet implemented for the SCH MVP.`);
  console.log(`       ${followUp}`);
  if (contextLines.length > 0) {
    console.log(`       Context → ${contextLines.join(' | ')}`);
  }
  console.log('       Track progress in docs/operations/cli-backlog.md.');
}

function handleCliError(error) {
  if (!error) {
    process.exit(1);
  }

  const consoleUi = createConsole();

  if (error instanceof CatalogCliError) {
    consoleUi.error(error.message, error.details);
  } else if (error.code === 'commander.helpDisplayed') {
    process.exit(0);
  } else {
    const message = error?.message ?? String(error);
    consoleUi.error('Unexpected CLI failure.', [message]);
  }

  process.exit(1);
}
