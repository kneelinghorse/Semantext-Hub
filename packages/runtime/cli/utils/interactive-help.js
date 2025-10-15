/**
 * Interactive Help System - B10.4
 * 
 * Provides interactive help, auto-completion, and contextual assistance.
 * Performance target: <50ms help response time.
 */

import chalk from 'chalk';
import { performance } from 'perf_hooks';
import readline from 'readline';

// Command registry for auto-completion
const COMMAND_REGISTRY = {
  discover: {
    description: 'Discover contracts (api, data, event)',
    usage: 'ossp discover <type> <source> [options]',
    arguments: [
      { name: 'type', required: true, description: 'Contract type (api, data, event)' },
      { name: 'source', required: true, description: 'Source path, URL, or connection string' }
    ],
    options: [
      { name: '--output', description: 'Output directory', default: 'artifacts' },
      { name: '--format', description: 'Output format (json, yaml)', default: 'json' }
    ],
    examples: [
      'ossp discover api https://api.example.com/openapi.json',
      'ossp discover data postgres://localhost:5432/mydb',
      'ossp discover event artifacts/asyncapi.yaml'
    ]
  },
  
  catalog: {
    description: 'Search and browse protocol catalog',
    usage: 'ossp catalog <subcommand> [term] [options]',
    subcommands: ['search', 'list', 'show', 'metrics'],
    arguments: [
      { name: 'subcommand', required: true, description: 'Subcommand (search, list, show, metrics)' },
      { name: 'term', required: false, description: 'Search term or URN' }
    ],
    options: [
      { name: '--type', description: 'Filter by protocol type' },
      { name: '--namespace', description: 'Filter by namespace' },
      { name: '--limit', description: 'Limit results', default: '10' },
      { name: '--format', description: 'Output format (table, json)', default: 'table' }
    ],
    examples: [
      'ossp catalog search api',
      'ossp catalog list --type event',
      'ossp catalog show urn:protocol:api:example:1.0.0'
    ]
  },
  
  validate: {
    description: 'Validate protocol ecosystem',
    usage: 'ossp validate [options]',
    options: [
      { name: '--ecosystem', description: 'Validate entire ecosystem' },
      { name: '--manifests', description: 'Directory containing manifests', default: 'protocols' },
      { name: '--output', description: 'Output validation report to file' },
      { name: '--format', description: 'Output format (json, summary)', default: 'summary' },
      { name: '--verbose', description: 'Show detailed output' }
    ],
    examples: [
      'ossp validate --ecosystem',
      'ossp validate --manifests protocols --output report.json'
    ]
  },
  
  scaffold: {
    description: 'Generate protocol manifests, importers, and tests from templates',
    usage: 'ossp scaffold [options]',
    options: [
      { name: '--type', description: 'Scaffold type (api, data, event, semantic, importer, test)', required: true },
      { name: '--name', description: 'Component name', required: true },
      { name: '--output', description: 'Output directory', default: './artifacts/scaffolds' },
      { name: '--version', description: 'Version', default: '1.0.0' },
      { name: '--description', description: 'Description' },
      { name: '--verbose', description: 'Show detailed output' },
      { name: '--dry-run', description: 'Preview without writing files' }
    ],
    examples: [
      'ossp scaffold --type api --name my-api',
      'ossp scaffold --type event --name my-events --output ./events'
    ]
  },
  
  quickstart: {
    description: 'Interactive onboarding wizard for new developers',
    usage: 'ossp quickstart [options]',
    options: [
      { name: '--template', description: 'Pre-select template (microservices, api-discovery, event-driven)' },
      { name: '--name', description: 'Pre-set project name' },
      { name: '--no-governance', description: 'Skip governance documentation generation' },
      { name: '--no-tests', description: 'Skip test scaffolds' }
    ],
    examples: [
      'ossp quickstart',
      'ossp quickstart --template microservices --name my-project'
    ]
  }
};

// Auto-completion suggestions
const COMPLETION_SUGGESTIONS = {
  commands: Object.keys(COMMAND_REGISTRY),
  types: ['api', 'data', 'event', 'semantic', 'importer', 'test'],
  formats: ['json', 'yaml', 'table', 'summary'],
  subcommands: {
    catalog: ['search', 'list', 'show', 'metrics'],
    workflow: ['validate', 'simulate', 'examples']
  }
};

/**
 * Interactive help system
 */
export class InteractiveHelp {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: this.completer.bind(this)
    });
    
    this.currentContext = '';
    this.commandHistory = [];
  }
  
  /**
   * Auto-completion function
   */
  completer(line) {
    const startTime = performance.now();
    
    try {
      const parts = line.trim().split(/\s+/);
      const lastPart = parts[parts.length - 1] || '';
      
      let suggestions = [];
      
      if (parts.length === 1) {
        // Command completion
        suggestions = COMPLETION_SUGGESTIONS.commands
          .filter(cmd => cmd.startsWith(lastPart))
          .map(cmd => cmd + ' ');
      } else if (parts.length === 2 && parts[0] === 'catalog') {
        // Catalog subcommand completion
        suggestions = COMPLETION_SUGGESTIONS.subcommands.catalog
          .filter(sub => sub.startsWith(lastPart))
          .map(sub => sub + ' ');
      } else if (parts.length === 2 && parts[0] === 'scaffold') {
        // Scaffold type completion
        suggestions = COMPLETION_SUGGESTIONS.types
          .filter(type => type.startsWith(lastPart))
          .map(type => type + ' ');
      } else if (line.includes('--format')) {
        // Format completion
        suggestions = COMPLETION_SUGGESTIONS.formats
          .filter(format => format.startsWith(lastPart))
          .map(format => format + ' ');
      }
      
      const completionTime = performance.now() - startTime;
      
      return [suggestions, lastPart];
      
    } catch (error) {
      return [[], ''];
    }
  }
  
  /**
   * Show interactive help
   */
  async showInteractiveHelp() {
    console.log(chalk.blue('\n🚀 OSSP Interactive Help System\n'));
    console.log(chalk.gray('Type a command to get help, or "exit" to quit.\n'));
    
    while (true) {
      try {
        const input = await this.prompt('ossp> ');
        
        if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
          break;
        }
        
        if (input.trim() === '') {
          continue;
        }
        
        await this.processHelpRequest(input);
        
      } catch (error) {
        if (error.message === 'SIGINT') {
          console.log(chalk.gray('\nGoodbye!'));
          break;
        }
        console.error(chalk.red(`Error: ${error.message}`));
      }
    }
    
    this.rl.close();
  }
  
  /**
   * Process help request
   */
  async processHelpRequest(input) {
    const startTime = performance.now();
    
    const parts = input.trim().split(/\s+/);
    const command = parts[0];
    
    if (command === 'help' || command === '?') {
      this.showGeneralHelp();
      return;
    }
    
    if (command === 'commands') {
      this.showCommandList();
      return;
    }
    
    if (command === 'examples') {
      this.showExamples();
      return;
    }
    
    if (command === 'performance') {
      this.showPerformanceTips();
      return;
    }
    
    if (COMMAND_REGISTRY[command]) {
      this.showCommandHelp(command, parts.slice(1));
    } else {
      this.showCommandNotFound(command);
    }
    
    const responseTime = performance.now() - startTime;
    console.log(chalk.gray(`\nHelp generated in ${responseTime.toFixed(2)}ms`));
  }
  
  /**
   * Show general help
   */
  showGeneralHelp() {
    console.log(chalk.blue('\n📖 OSSP Protocol Discovery CLI\n'));
    console.log(chalk.gray('Available commands:'));
    
    Object.entries(COMMAND_REGISTRY).forEach(([name, info]) => {
      console.log(chalk.white(`  ${name.padEnd(12)} - ${info.description}`));
    });
    
    console.log(chalk.gray('\nQuick start:'));
    console.log(chalk.gray('  • ossp quickstart          - Interactive setup'));
    console.log(chalk.gray('  • ossp catalog search api  - Find API protocols'));
    console.log(chalk.gray('  • ossp discover api <url>   - Discover from OpenAPI'));
    console.log(chalk.gray('  • ossp scaffold --help      - Generate protocols'));
    console.log(chalk.gray('  • ossp validate --ecosystem - Validate all protocols'));
    
    console.log(chalk.gray('\nHelp commands:'));
    console.log(chalk.gray('  • help <command>           - Get help for specific command'));
    console.log(chalk.gray('  • commands                 - List all commands'));
    console.log(chalk.gray('  • examples                 - Show usage examples'));
    console.log(chalk.gray('  • performance              - Show performance tips'));
  }
  
  /**
   * Show command list
   */
  showCommandList() {
    console.log(chalk.blue('\n📋 Available Commands\n'));
    
    Object.entries(COMMAND_REGISTRY).forEach(([name, info]) => {
      console.log(chalk.white(`\n${name}`));
      console.log(chalk.gray(`  ${info.description}`));
      console.log(chalk.gray(`  Usage: ${info.usage}`));
      
      if (info.examples && info.examples.length > 0) {
        console.log(chalk.gray('  Examples:'));
        info.examples.slice(0, 2).forEach(ex => {
          console.log(chalk.gray(`    $ ${ex}`));
        });
      }
    });
  }
  
  /**
   * Show examples
   */
  showExamples() {
    console.log(chalk.blue('\n💡 Usage Examples\n'));
    
    console.log(chalk.green('Discovery:'));
    console.log(chalk.gray('  $ ossp discover api https://api.example.com/openapi.json'));
    console.log(chalk.gray('  $ ossp discover data postgres://localhost:5432/mydb'));
    console.log(chalk.gray('  $ ossp discover event artifacts/asyncapi.yaml'));
    
    console.log(chalk.green('\nCatalog Search:'));
    console.log(chalk.gray('  $ ossp catalog search api'));
    console.log(chalk.gray('  $ ossp catalog list --type event'));
    console.log(chalk.gray('  $ ossp catalog show urn:protocol:api:example:1.0.0'));
    
    console.log(chalk.green('\nValidation:'));
    console.log(chalk.gray('  $ ossp validate --ecosystem'));
    console.log(chalk.gray('  $ ossp validate --manifests protocols --output report.json'));
    
    console.log(chalk.green('\nScaffolding:'));
    console.log(chalk.gray('  $ ossp scaffold --type api --name my-api'));
    console.log(chalk.gray('  $ ossp scaffold --type event --name my-events --output ./events'));
    
    console.log(chalk.green('\nQuick Start:'));
    console.log(chalk.gray('  $ ossp quickstart'));
    console.log(chalk.gray('  $ ossp quickstart --template microservices --name my-project'));
  }
  
  /**
   * Show performance tips
   */
  showPerformanceTips() {
    console.log(chalk.blue('\n⚡ Performance Tips\n'));
    
    console.log(chalk.green('Response Time Targets:'));
    console.log(chalk.gray('  • Common commands: <100ms'));
    console.log(chalk.gray('  • Catalog search: <200ms'));
    console.log(chalk.gray('  • Validation: <1s for 100 protocols'));
    
    console.log(chalk.green('\nOptimization Tips:'));
    console.log(chalk.gray('  • Use --verbose for detailed timing information'));
    console.log(chalk.gray('  • Use --performance flag to show metrics'));
    console.log(chalk.gray('  • Cache results for repeated operations'));
    console.log(chalk.gray('  • Use smaller datasets for testing'));
    
    console.log(chalk.green('\nCommon Performance Issues:'));
    console.log(chalk.gray('  • Large manifest files (>10MB)'));
    console.log(chalk.gray('  • Network timeouts for remote sources'));
    console.log(chalk.gray('  • Insufficient system resources'));
    console.log(chalk.gray('  • File system permissions'));
  }
  
  /**
   * Show command help
   */
  showCommandHelp(command, args = []) {
    const info = COMMAND_REGISTRY[command];
    
    console.log(chalk.blue(`\n📖 ${command} - ${info.description}\n`));
    
    console.log(chalk.green('Usage:'));
    console.log(chalk.gray(`  ${info.usage}`));
    
    if (info.arguments && info.arguments.length > 0) {
      console.log(chalk.green('\nArguments:'));
      info.arguments.forEach(arg => {
        const required = arg.required ? chalk.red('*') : chalk.gray(' ');
        console.log(chalk.gray(`  ${required} ${arg.name.padEnd(15)} - ${arg.description}`));
      });
    }
    
    if (info.options && info.options.length > 0) {
      console.log(chalk.green('\nOptions:'));
      info.options.forEach(opt => {
        const required = opt.required ? chalk.red('*') : chalk.gray(' ');
        const defaultVal = opt.default ? chalk.gray(` (default: ${opt.default})`) : '';
        console.log(chalk.gray(`  ${required} ${opt.name.padEnd(20)} - ${opt.description}${defaultVal}`));
      });
    }
    
    if (info.subcommands && info.subcommands.length > 0) {
      console.log(chalk.green('\nSubcommands:'));
      info.subcommands.forEach(sub => {
        console.log(chalk.gray(`  ${sub}`));
      });
    }
    
    if (info.examples && info.examples.length > 0) {
      console.log(chalk.green('\nExamples:'));
      info.examples.forEach(ex => {
        console.log(chalk.gray(`  $ ${ex}`));
      });
    }
  }
  
  /**
   * Show command not found
   */
  showCommandNotFound(command) {
    console.log(chalk.red(`\n❌ Unknown command: ${command}`));
    
    // Find similar commands
    const similarCommands = Object.keys(COMMAND_REGISTRY)
      .filter(cmd => cmd.includes(command.toLowerCase()) || command.toLowerCase().includes(cmd))
      .slice(0, 3);
    
    if (similarCommands.length > 0) {
      console.log(chalk.blue('\n💡 Did you mean one of these?'));
      similarCommands.forEach(cmd => {
        console.log(chalk.gray(`  • ${cmd} - ${COMMAND_REGISTRY[cmd].description}`));
      });
    }
    
    console.log(chalk.gray('\nUse "help" to see all available commands.'));
  }
  
  /**
   * Prompt for input
   */
  prompt(question) {
    return new Promise((resolve, reject) => {
      this.rl.question(question, (answer) => {
        resolve(answer);
      });
      
      this.rl.on('SIGINT', () => {
        reject(new Error('SIGINT'));
      });
    });
  }
}

/**
 * Show quick help for a command
 */
export function showQuickHelp(command, args = []) {
  const startTime = performance.now();
  
  if (!COMMAND_REGISTRY[command]) {
    console.log(chalk.red(`\n❌ Unknown command: ${command}`));
    console.log(chalk.gray('Use "ossp help" to see available commands.'));
    return;
  }
  
  const info = COMMAND_REGISTRY[command];
  
  console.log(chalk.blue(`\n📖 ${command} - ${info.description}\n`));
  console.log(chalk.gray(`Usage: ${info.usage}`));
  
  if (info.examples && info.examples.length > 0) {
    console.log(chalk.gray('\nExamples:'));
    info.examples.slice(0, 2).forEach(ex => {
      console.log(chalk.gray(`  $ ${ex}`));
    });
  }
  
  console.log(chalk.gray(`\nFor detailed help: ossp ${command} --help`));
  
  const responseTime = performance.now() - startTime;
  console.log(chalk.gray(`Help generated in ${responseTime.toFixed(2)}ms`));
}

/**
 * Get command suggestions for auto-completion
 */
export function getCommandSuggestions(partial) {
  return COMPLETION_SUGGESTIONS.commands
    .filter(cmd => cmd.startsWith(partial.toLowerCase()))
    .slice(0, 10);
}

/**
 * Get option suggestions for auto-completion
 */
export function getOptionSuggestions(command, partial) {
  const info = COMMAND_REGISTRY[command];
  if (!info || !info.options) {
    return [];
  }
  
  return info.options
    .map(opt => opt.name)
    .filter(opt => opt.startsWith(partial))
    .slice(0, 10);
}
