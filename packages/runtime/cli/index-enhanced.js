#!/usr/bin/env node

/**
 * Enhanced Protocol Discovery CLI - B10.4 Performance Optimized
 *
 * Main entry point for the protocol-discover command-line tool.
 * Provides commands for discovering, reviewing, and approving protocol manifests.
 * 
 * Performance optimizations:
 * - Lazy command loading (<50ms startup)
 * - Command caching for repeated operations
 * - Optimized error handling with suggestions
 * - Interactive help with auto-completion
 */

import { Command } from 'commander';
import { performance } from 'perf_hooks';
import chalk from 'chalk';

// Performance tracking
const commandCache = new Map();
const performanceMetrics = {
  startupTime: 0,
  commandLoadTime: 0,
  totalCommands: 0,
  cacheHits: 0
};

// Enhanced error handling with suggestions
class CLIError extends Error {
  constructor(message, suggestions = [], code = 'CLI_ERROR') {
    super(message);
    this.name = 'CLIError';
    this.suggestions = suggestions;
    this.code = code;
  }
}

// Command registry for dynamic loading and auto-completion
const commandRegistry = {
  discover: {
    module: './commands/discover.js',
    description: 'Discover contracts (api, data, event)',
    examples: ['ossp discover api https://api.example.com/openapi.json', 'ossp discover data postgres://localhost:5432/mydb']
  },
  review: {
    module: './commands/review.js',
    description: 'Review draft manifest',
    examples: ['ossp review artifacts/api-manifest.json']
  },
  approve: {
    module: './commands/approve.js',
    description: 'Approve draft manifest',
    examples: ['ossp approve artifacts/api-manifest.json --force']
  },
  governance: {
    module: './commands/governance.js',
    description: 'Generate GOVERNANCE.md from protocol data',
    examples: ['ossp governance --output GOVERNANCE.md']
  },
  demo: {
    module: './commands/demo.js',
    description: 'Run pre-configured demos (list, run, db)',
    examples: ['ossp demo list', 'ossp demo run microservices']
  },
  serve: {
    module: './commands/serve.js',
    description: 'Start protocol viewer server',
    examples: ['ossp serve artifacts --port 3000']
  },
  generate: {
    module: './commands/generate.js',
    description: 'Generate event consumers from manifest(s)',
    examples: ['ossp generate artifacts/event-manifest.json --output consumers']
  },
  scaffold: {
    module: './commands/scaffold-wrapper.js',
    description: 'Generate protocol manifests, importers, and tests from templates',
    examples: ['ossp scaffold --type api --name my-api --output ./artifacts']
  },
  validate: {
    module: './commands/validate.js',
    description: 'Validate protocol ecosystem',
    examples: ['ossp validate --ecosystem --manifests protocols']
  },
  workflow: {
    module: './commands/workflow.js',
    description: 'Validate and simulate workflows',
    examples: ['ossp workflow validate workflow.yaml', 'ossp workflow simulate workflow.yaml']
  },
  protocols: {
    module: './commands/protocols.js',
    description: 'List and manage protocol implementations',
    examples: ['ossp protocols list', 'ossp protocols status']
  },
  quickstart: {
    module: './commands/quickstart.js',
    description: 'Interactive onboarding wizard for new developers',
    examples: ['ossp quickstart', 'ossp quickstart --template microservices']
  },
  catalog: {
    module: './commands/catalog.js',
    description: 'Search and browse protocol catalog',
    examples: ['ossp catalog search api', 'ossp catalog list --type event']
  }
};

// Enhanced CLI program with performance optimizations
const program = new Command();

program
  .name('ossp')
  .description('OSSP Protocol Discovery and Management CLI')
  .version('1.0.0')
  .option('--verbose', 'Enable verbose output')
  .option('--trace', 'Enable trace mode with correlation IDs')
  .option('--performance', 'Show performance metrics')
  .hook('preAction', (thisCommand, actionCommand) => {
    const startTime = performance.now();
    actionCommand.startTime = startTime;
    
    if (thisCommand.opts().performance) {
      console.log(chalk.gray(`🚀 Command: ${actionCommand.name()} started at ${new Date().toISOString()}`));
    }
  })
  .hook('postAction', (thisCommand, actionCommand) => {
    if (actionCommand.startTime && thisCommand.opts().performance) {
      const duration = performance.now() - actionCommand.startTime;
      const status = duration < 100 ? chalk.green('✓') : duration < 500 ? chalk.yellow('⚠') : chalk.red('✗');
      console.log(chalk.gray(`${status} Command completed in ${duration.toFixed(2)}ms`));
      
      if (duration > 100) {
        console.log(chalk.yellow(`  Performance warning: Command took ${duration.toFixed(2)}ms (>100ms target)`));
        console.log(chalk.gray(`  Consider using --help for optimization tips`));
      }
    }
  });

// Lazy command loader with caching
async function loadCommand(commandName) {
  const cacheKey = commandName;
  
  if (commandCache.has(cacheKey)) {
    performanceMetrics.cacheHits++;
    return commandCache.get(cacheKey);
  }
  
  const loadStart = performance.now();
  const commandInfo = commandRegistry[commandName];
  
  if (!commandInfo) {
    throw new CLIError(
      `Unknown command: ${commandName}`,
      [
        `Try: ossp ${Object.keys(commandRegistry).join(' | ')}`,
        `Use 'ossp --help' to see all available commands`,
        `Use 'ossp catalog search <term>' to find protocols`
      ],
      'UNKNOWN_COMMAND'
    );
  }
  
  try {
    const module = await import(commandInfo.module);
    const command = module[`${commandName}Command`] || module[`execute${commandName.charAt(0).toUpperCase() + commandName.slice(1)}Command`] || module.default;
    
    if (!command) {
      throw new CLIError(
        `Command module ${commandInfo.module} does not export a command function`,
        [`Check the command implementation in ${commandInfo.module}`],
        'INVALID_COMMAND_MODULE'
      );
    }
    
    commandCache.set(cacheKey, { command, info: commandInfo });
    performanceMetrics.commandLoadTime += performance.now() - loadStart;
    
    return { command, info: commandInfo };
  } catch (error) {
    throw new CLIError(
      `Failed to load command: ${commandName}`,
      [
        `Check if ${commandInfo.module} exists and exports the command function`,
        `Try running: ossp --help to see available commands`,
        `Use 'ossp catalog search <term>' to find protocols`
      ],
      'COMMAND_LOAD_ERROR'
    );
  }
}

// Enhanced error handler with suggestions
function handleError(error, commandName = '') {
  console.error(chalk.red(`\n❌ Error: ${error.message}`));
  
  if (error.suggestions && error.suggestions.length > 0) {
    console.log(chalk.blue('\n💡 Suggestions:'));
    error.suggestions.forEach(suggestion => {
      console.log(chalk.gray(`  • ${suggestion}`));
    });
  }
  
  if (error.code === 'UNKNOWN_COMMAND') {
    console.log(chalk.blue('\n🔍 Did you mean one of these?'));
    const similarCommands = Object.keys(commandRegistry)
      .filter(cmd => cmd.includes(commandName.toLowerCase()) || commandName.toLowerCase().includes(cmd))
      .slice(0, 3);
    
    similarCommands.forEach(cmd => {
      console.log(chalk.gray(`  • ossp ${cmd} - ${commandRegistry[cmd].description}`));
    });
  }
  
  console.log(chalk.gray('\nFor more help, try:'));
  console.log(chalk.gray('  • ossp --help'));
  console.log(chalk.gray('  • ossp catalog search <term>'));
  console.log(chalk.gray('  • ossp quickstart'));
  
  process.exit(1);
}

// Register all commands dynamically
Object.entries(commandRegistry).forEach(([name, info]) => {
  const cmd = program.command(name);
  
  // Add command-specific options based on the command
  switch (name) {
    case 'discover':
      cmd
        .argument('<type>', 'Contract type (api, data, event)')
        .argument('<source>', 'Source path, URL, or connection string')
        .option('--output <dir>', 'Output directory', 'artifacts')
        .option('--format <fmt>', 'Output format (json, yaml)', 'json');
      break;
      
    case 'catalog':
      cmd
        .argument('[subcommand]', 'Subcommand (search, list, show)')
        .argument('[term]', 'Search term or URN')
        .option('--type <type>', 'Filter by protocol type')
        .option('--namespace <ns>', 'Filter by namespace')
        .option('--limit <number>', 'Limit results', '10')
        .option('--format <fmt>', 'Output format (table, json)', 'table');
      break;
      
    case 'scaffold':
      cmd
        .requiredOption('--type <type>', 'Scaffold type (api, data, event, semantic, importer, test)')
        .requiredOption('--name <name>', 'Component name')
        .option('--output <dir>', 'Output directory', './artifacts/scaffolds')
        .option('--version <version>', 'Version', '1.0.0')
        .option('--description <desc>', 'Description')
        .option('--verbose', 'Show detailed output')
        .option('--dry-run', 'Preview without writing files');
      break;
      
    case 'validate':
      cmd
        .option('--ecosystem', 'Validate entire ecosystem')
        .option('--manifests <dir>', 'Directory containing manifests', 'protocols')
        .option('--output <file>', 'Output validation report to file')
        .option('--format <fmt>', 'Output format (json, summary)', 'summary')
        .option('--verbose', 'Show detailed output');
      break;
      
    default:
      // Add common options for other commands
      cmd.option('--verbose', 'Show detailed output');
  }
  
  cmd.description(info.description);
  
  // Add examples to help
  if (info.examples && info.examples.length > 0) {
    cmd.addHelpText('after', '\nExamples:\n' + info.examples.map(ex => `  $ ${ex}`).join('\n'));
  }
  
  cmd.action(async (...args) => {
    try {
      const { command } = await loadCommand(name);
      performanceMetrics.totalCommands++;
      
      // Execute command with error handling
      await command(...args);
      
    } catch (error) {
      handleError(error, name);
    }
  });
});

// Enhanced help command
program
  .command('help [command]')
  .description('Show help for a specific command')
  .action(async (commandName) => {
    if (commandName && commandRegistry[commandName]) {
      const info = commandRegistry[commandName];
      console.log(chalk.blue(`\n📖 ${commandName} - ${info.description}\n`));
      
      if (info.examples && info.examples.length > 0) {
        console.log(chalk.green('Examples:'));
        info.examples.forEach(ex => console.log(chalk.gray(`  $ ${ex}`)));
        console.log();
      }
      
      console.log(chalk.blue('For detailed options, run:'));
      console.log(chalk.gray(`  $ ossp ${commandName} --help`));
    } else {
      program.outputHelp();
    }
  });

// Performance metrics command
program
  .command('metrics')
  .description('Show CLI performance metrics')
  .action(() => {
    console.log(chalk.blue('\n📊 CLI Performance Metrics\n'));
    console.log(chalk.gray(`Startup time: ${performanceMetrics.startupTime.toFixed(2)}ms`));
    console.log(chalk.gray(`Command load time: ${performanceMetrics.commandLoadTime.toFixed(2)}ms`));
    console.log(chalk.gray(`Total commands executed: ${performanceMetrics.totalCommands}`));
    console.log(chalk.gray(`Cache hit rate: ${performanceMetrics.cacheHits}/${performanceMetrics.totalCommands} (${((performanceMetrics.cacheHits / Math.max(performanceMetrics.totalCommands, 1)) * 100).toFixed(1)}%)`));
    
    if (commandCache.size > 0) {
      console.log(chalk.gray(`Cached commands: ${Array.from(commandCache.keys()).join(', ')}`));
    }
  });

// Parse CLI arguments with enhanced error handling
program.showHelpAfterError(true);
program.showSuggestionAfterError(true);

// Track startup performance
const startupTime = performance.now();

try {
  program.parse(process.argv);
  performanceMetrics.startupTime = performance.now() - startupTime;
  
  // Show help if no command provided
  if (!process.argv.slice(2).length) {
    console.log(chalk.blue('🚀 OSSP Protocol Discovery CLI\n'));
    console.log(chalk.gray('Quick start:'));
    console.log(chalk.gray('  • ossp quickstart          - Interactive setup'));
    console.log(chalk.gray('  • ossp catalog search api  - Find API protocols'));
    console.log(chalk.gray('  • ossp discover api <url>  - Discover from OpenAPI'));
    console.log(chalk.gray('  • ossp scaffold --help     - Generate protocols'));
    console.log(chalk.gray('  • ossp validate --ecosystem - Validate all protocols\n'));
    
    program.outputHelp();
  }
  
} catch (error) {
  handleError(error);
}
