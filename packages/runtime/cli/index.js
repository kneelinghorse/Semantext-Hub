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
import { globalRegistry, registerDefaultCommands } from './utils/dynamic-registry.js';
import { handleError } from './utils/enhanced-error-handler.js';
import { InteractiveHelp } from './utils/interactive-help.js';

// Performance tracking
const performanceMetrics = {
  startupTime: 0,
  commandLoadTime: 0,
  totalCommands: 0,
  cacheHits: 0
};

// Register default commands
registerDefaultCommands();

const program = new Command();

program
  .name('ossp')
  .description('OSSP Protocol Discovery and Management CLI')
  .version('1.0.0')
  .option('--verbose', 'Enable verbose output')
  .option('--trace', 'Enable trace mode with correlation IDs')
  .option('--performance', 'Show performance metrics')
  .option('--offline', 'Run in offline mode (no network/project-root access)')
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

// Register commands dynamically from registry
const registeredCommands = globalRegistry.listCommands();

for (const commandName of registeredCommands) {
  const metadata = globalRegistry.getCommandMetadata(commandName);
  
  const cmd = program.command(commandName);
  cmd.description(metadata.description);
  
  // Add command-specific options based on metadata
  if (metadata.options) {
    metadata.options.forEach(opt => {
      if (opt.required) {
        cmd.requiredOption(opt.name, opt.description, opt.default);
      } else {
        cmd.option(opt.name, opt.description, opt.default);
      }
    });
  }
  
  // Add arguments if specified
  if (metadata.arguments) {
    metadata.arguments.forEach(arg => {
      if (arg.required) {
        cmd.argument(`<${arg.name}>`, arg.description);
      } else {
        cmd.argument(`[${arg.name}]`, arg.description);
      }
    });
  }
  
  // Add examples to help
  if (metadata.examples && metadata.examples.length > 0) {
    cmd.addHelpText('after', '\nExamples:\n' + metadata.examples.map(ex => `  $ ${ex}`).join('\n'));
  }
  
  cmd.action(async (...args) => {
    try {
      performanceMetrics.totalCommands++;
      await globalRegistry.executeCommand(commandName, ...args);
    } catch (error) {
      handleError(error, { command: commandName }, { verbose: program.opts().verbose });
    }
  });
}

// Enhanced help command with interactive mode
program
  .command('help [command]')
  .description('Show help for a specific command or start interactive help')
  .option('--interactive', 'Start interactive help mode')
  .action(async (commandName, options) => {
    if (options.interactive) {
      const interactiveHelp = new InteractiveHelp();
      await interactiveHelp.showInteractiveHelp();
      return;
    }
    
    if (commandName && globalRegistry.getCommandMetadata(commandName)) {
      const metadata = globalRegistry.getCommandMetadata(commandName);
      console.log(chalk.blue(`\n📖 ${commandName} - ${metadata.description}\n`));
      
      if (metadata.examples && metadata.examples.length > 0) {
        console.log(chalk.green('Examples:'));
        metadata.examples.forEach(ex => console.log(chalk.gray(`  $ ${ex}`)));
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
    
    const registryMetrics = globalRegistry.getPerformanceMetrics();
    console.log(chalk.gray(`Registry metrics:`));
    console.log(chalk.gray(`  Total registrations: ${registryMetrics.registry.totalRegistrations}`));
    console.log(chalk.gray(`  Total loads: ${registryMetrics.registry.totalLoads}`));
    console.log(chalk.gray(`  Average load time: ${registryMetrics.registry.averageLoadTime.toFixed(2)}ms`));
    
    if (Object.keys(registryMetrics.commands).length > 0) {
      console.log(chalk.gray(`\nCommand performance:`));
      for (const [name, metrics] of Object.entries(registryMetrics.commands)) {
        console.log(chalk.gray(`  ${name}: ${metrics.averageExecutionTime.toFixed(2)}ms avg, ${metrics.totalCalls} calls, ${(metrics.cacheHitRate * 100).toFixed(1)}% cache hit rate`));
      }
    }
  });

// Cache management command
program
  .command('cache')
  .description('Manage command cache')
  .option('--clear', 'Clear command cache')
  .option('--warmup', 'Warm up command cache')
  .option('--status', 'Show cache status')
  .action(async (options) => {
    if (options.clear) {
      globalRegistry.clearCache();
    } else if (options.warmup) {
      await globalRegistry.warmupCache();
    } else if (options.status) {
      const metrics = globalRegistry.getPerformanceMetrics();
      console.log(chalk.blue('\n📊 Cache Status\n'));
      console.log(chalk.gray(`Total registrations: ${metrics.registry.totalRegistrations}`));
      console.log(chalk.gray(`Total loads: ${metrics.registry.totalLoads}`));
      console.log(chalk.gray(`Cache hits: ${metrics.registry.totalCacheHits}`));
      console.log(chalk.gray(`Cache hit rate: ${(metrics.registry.totalCacheHits / Math.max(metrics.registry.totalLoads, 1) * 100).toFixed(1)}%`));
    } else {
      console.log(chalk.red('Please specify an action: --clear, --warmup, or --status'));
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
  handleError(error, { command: 'unknown' }, { verbose: program.opts().verbose });
}
