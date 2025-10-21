/**
 * Dynamic Command Registry - B10.4
 * 
 * Provides dynamic command registration, contextual error mapping, and performance optimization.
 * Performance target: <20ms command registration time.
 */

import { performance } from 'perf_hooks';
import chalk from 'chalk';

// Command metadata structure
class CommandMetadata {
  constructor(name, config) {
    this.name = name;
    this.module = config.module;
    this.description = config.description;
    this.usage = config.usage;
    this.arguments = config.arguments || [];
    this.options = config.options || [];
    this.examples = config.examples || [];
    this.subcommands = config.subcommands || [];
    this.dependencies = config.dependencies || [];
    this.performance = {
      loadTime: 0,
      executionTime: 0,
      cacheHits: 0,
      totalCalls: 0
    };
    this.errorMapping = config.errorMapping || {};
    this.contextualHelp = config.contextualHelp || {};
  }
  
  updatePerformance(loadTime, executionTime) {
    this.performance.loadTime = loadTime;
    this.performance.executionTime = executionTime;
    this.performance.totalCalls++;
  }
  
  recordCacheHit() {
    this.performance.cacheHits++;
  }
  
  getAverageExecutionTime() {
    return this.performance.totalCalls > 0 
      ? this.performance.executionTime / this.performance.totalCalls 
      : 0;
  }
  
  getCacheHitRate() {
    return this.performance.totalCalls > 0 
      ? this.performance.cacheHits / this.performance.totalCalls 
      : 0;
  }
}

// Dynamic command registry
export class DynamicCommandRegistry {
  constructor() {
    this.commands = new Map();
    this.commandCache = new Map();
    this.errorContexts = new Map();
    this.performanceMetrics = {
      totalRegistrations: 0,
      totalLoads: 0,
      totalCacheHits: 0,
      averageLoadTime: 0
    };
  }
  
  /**
   * Register a command with metadata
   */
  register(name, config) {
    const startTime = performance.now();
    
    try {
      const metadata = new CommandMetadata(name, config);
      this.commands.set(name, metadata);
      
      // Register error contexts
      if (config.errorMapping) {
        this.errorContexts.set(name, config.errorMapping);
      }
      
      this.performanceMetrics.totalRegistrations++;
      const registrationTime = performance.now() - startTime;
      
      console.log(chalk.gray(`✓ Registered command: ${name} (${registrationTime.toFixed(2)}ms)`));
      
      return metadata;
      
    } catch (error) {
      throw new Error(`Failed to register command ${name}: ${error.message}`);
    }
  }
  
  /**
   * Load command module with caching
   */
  async loadCommand(name) {
    const startTime = performance.now();
    
    // Check cache first
    if (this.commandCache.has(name)) {
      const metadata = this.commands.get(name);
      if (metadata) {
        metadata.recordCacheHit();
        this.performanceMetrics.totalCacheHits++;
      }
      return this.commandCache.get(name);
    }
    
    const metadata = this.commands.get(name);
    if (!metadata) {
      throw new Error(`Command not registered: ${name}`);
    }
    
    try {
      // Dynamic import
      const module = await import(metadata.module);
      
      // Find the command function
      const commandFunction = this.findCommandFunction(module, name);
      
      if (!commandFunction) {
        throw new Error(`Command function not found in ${metadata.module}`);
      }
      
      // Cache the loaded command
      this.commandCache.set(name, commandFunction);
      
      const loadTime = performance.now() - startTime;
      metadata.updatePerformance(loadTime, 0);
      this.performanceMetrics.totalLoads++;
      this.updateAverageLoadTime(loadTime);
      
      return commandFunction;
      
    } catch (error) {
      throw new Error(`Failed to load command ${name}: ${error.message}`);
    }
  }
  
  /**
   * Find command function in module
   */
  findCommandFunction(module, name) {
    // Convert colon-separated names to valid identifiers
    const normalizedName = name.replace(/:/g, '');
    
    // Try common naming patterns
    const patterns = [
      `${normalizedName}Command`,
      `execute${normalizedName.charAt(0).toUpperCase() + normalizedName.slice(1)}Command`,
      `${normalizedName.charAt(0).toUpperCase() + normalizedName.slice(1)}Command`,
      'default'
    ];
    
    for (const pattern of patterns) {
      if (typeof module[pattern] === 'function') {
        return module[pattern];
      }
    }
    
    return null;
  }
  
  /**
   * Execute command with performance tracking
   */
  async executeCommand(name, ...args) {
    const startTime = performance.now();
    
    try {
      const commandFunction = await this.loadCommand(name);
      const result = await commandFunction(...args);
      
      const executionTime = performance.now() - startTime;
      const metadata = this.commands.get(name);
      if (metadata) {
        metadata.updatePerformance(metadata.performance.loadTime, executionTime);
      }
      
      return result;
      
    } catch (error) {
      const executionTime = performance.now() - startTime;
      const metadata = this.commands.get(name);
      if (metadata) {
        metadata.updatePerformance(metadata.performance.loadTime, executionTime);
      }
      
      // Enhance error with contextual information
      const enhancedError = this.enhanceError(error, name);
      throw enhancedError;
    }
  }
  
  /**
   * Enhance error with contextual information
   */
  enhanceError(error, commandName) {
    const errorContext = this.errorContexts.get(commandName);
    if (!errorContext) {
      return error;
    }
    
    // Add contextual suggestions based on error type
    const suggestions = this.getContextualSuggestions(error, commandName);
    if (suggestions.length > 0) {
      error.suggestions = suggestions;
    }
    
    // Add command-specific help
    const commandHelp = this.getCommandSpecificHelp(error, commandName);
    if (commandHelp) {
      error.contextualHelp = commandHelp;
    }
    
    return error;
  }
  
  /**
   * Get contextual suggestions for error
   */
  getContextualSuggestions(error, commandName) {
    const suggestions = [];
    const errorContext = this.errorContexts.get(commandName);
    
    if (!errorContext) {
      return suggestions;
    }
    
    // Map error codes to suggestions
    const errorCode = error.code || 'INTERNAL_ERROR';
    const contextSuggestions = errorContext[errorCode];
    
    if (contextSuggestions) {
      suggestions.push(...contextSuggestions);
    }
    
    // Add command-specific suggestions
    const metadata = this.commands.get(commandName);
    if (metadata && metadata.examples.length > 0) {
      suggestions.push(`Try: ${metadata.examples[0]}`);
    }
    
    return suggestions;
  }
  
  /**
   * Get command-specific help for error
   */
  getCommandSpecificHelp(error, commandName) {
    const metadata = this.commands.get(commandName);
    if (!metadata) {
      return null;
    }
    
    const errorCode = error.code || 'INTERNAL_ERROR';
    
    // Command-specific error help
    const helpMap = {
      'discover': {
        'ENOENT': 'Check if the source file exists and is accessible',
        'ECONNREFUSED': 'Verify the API endpoint is running and accessible',
        'VALIDATION_FAILED': 'Check the OpenAPI/AsyncAPI specification format'
      },
      'catalog': {
        'PROTOCOL_NOT_FOUND': 'Use "ossp catalog list" to see available protocols',
        'ENOENT': 'Check if the artifacts directory exists and contains manifests'
      },
      'validate': {
        'ENOENT': 'Check if the manifests directory exists and contains valid files',
        'VALIDATION_FAILED': 'Review the validation report for specific issues'
      },
      'scaffold': {
        'EACCES': 'Check write permissions for the output directory',
        'INVALID_OPTION': 'Verify the scaffold type and name are valid'
      }
    };
    
    return helpMap[commandName]?.[errorCode] || null;
  }
  
  /**
   * Get command metadata
   */
  getCommandMetadata(name) {
    return this.commands.get(name);
  }
  
  /**
   * List all registered commands
   */
  listCommands() {
    return Array.from(this.commands.keys());
  }
  
  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    const commandMetrics = {};
    
    for (const [name, metadata] of this.commands) {
      commandMetrics[name] = {
        loadTime: metadata.performance.loadTime,
        averageExecutionTime: metadata.getAverageExecutionTime(),
        totalCalls: metadata.performance.totalCalls,
        cacheHitRate: metadata.getCacheHitRate()
      };
    }
    
    return {
      registry: this.performanceMetrics,
      commands: commandMetrics
    };
  }
  
  /**
   * Update average load time
   */
  updateAverageLoadTime(loadTime) {
    const totalLoads = this.performanceMetrics.totalLoads;
    const currentAverage = this.performanceMetrics.averageLoadTime;
    
    this.performanceMetrics.averageLoadTime = 
      (currentAverage * (totalLoads - 1) + loadTime) / totalLoads;
  }
  
  /**
   * Clear command cache
   */
  clearCache() {
    this.commandCache.clear();
    console.log(chalk.gray('Command cache cleared'));
  }
  
  /**
   * Warm up command cache
   */
  async warmupCache(commands = []) {
    const startTime = performance.now();
    
    const commandsToWarmup = commands.length > 0 ? commands : this.listCommands();
    
    console.log(chalk.blue(`\n🔥 Warming up command cache for ${commandsToWarmup.length} commands...`));
    
    for (const commandName of commandsToWarmup) {
      try {
        await this.loadCommand(commandName);
        console.log(chalk.gray(`✓ Warmed up: ${commandName}`));
      } catch (error) {
        console.warn(chalk.yellow(`⚠ Failed to warm up ${commandName}: ${error.message}`));
      }
    }
    
    const warmupTime = performance.now() - startTime;
    console.log(chalk.green(`\n✅ Cache warmup completed in ${warmupTime.toFixed(2)}ms`));
  }
  
  /**
   * Validate command dependencies
   */
  validateDependencies() {
    const issues = [];
    
    for (const [name, metadata] of this.commands) {
      for (const dependency of metadata.dependencies) {
        if (!this.commands.has(dependency)) {
          issues.push(`Command ${name} depends on missing command: ${dependency}`);
        }
      }
    }
    
    return issues;
  }
  
  /**
   * Get command suggestions for auto-completion
   */
  getCommandSuggestions(partial) {
    return this.listCommands()
      .filter(cmd => cmd.startsWith(partial.toLowerCase()))
      .slice(0, 10);
  }
  
  /**
   * Get option suggestions for command
   */
  getOptionSuggestions(commandName, partial) {
    const metadata = this.commands.get(commandName);
    if (!metadata || !metadata.options) {
      return [];
    }
    
    return metadata.options
      .map(opt => opt.name)
      .filter(opt => opt.startsWith(partial))
      .slice(0, 10);
  }
}

// Global registry instance
export const globalRegistry = new DynamicCommandRegistry();

// Default command configurations
const defaultCommands = {
  discover: {
    module: '../commands/discover.js',
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
      'ossp discover data postgres://localhost:5432/mydb'
    ],
    errorMapping: {
      'ENOENT': ['Check if the source file exists', 'Verify file permissions'],
      'ECONNREFUSED': ['Check if the API endpoint is running', 'Verify network connectivity'],
      'VALIDATION_FAILED': ['Check the specification format', 'Use --verbose for details']
    }
  },
  
  catalog: {
    module: '../commands/catalog.js',
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
    ],
    errorMapping: {
      'PROTOCOL_NOT_FOUND': ['Use "ossp catalog list" to see available protocols', 'Check if the URN is correct'],
      'ENOENT': ['Check if the artifacts directory exists', 'Verify manifest files are present']
    }
  },
  
  validate: {
    module: '../commands/validate.js',
    description: 'Validate protocol ecosystem',
    usage: 'ossp validate [options]',
    options: [
      { name: '--ecosystem', description: 'Validate entire ecosystem' },
      { name: '--manifests <path>', description: 'Directory containing manifests', default: 'protocols' },
      { name: '--output <file>', description: 'Output validation report to file' },
      { name: '--format <format>', description: 'Output format (json, summary)', default: 'summary' },
      { name: '--verbose', description: 'Show detailed output' }
    ],
    examples: [
      'ossp validate --ecosystem',
      'ossp validate --manifests protocols --output report.json'
    ],
    errorMapping: {
      'ENOENT': ['Check if the manifests directory exists', 'Verify manifest files are present'],
      'VALIDATION_FAILED': ['Review the validation report', 'Fix the identified issues']
    }
  },

  ui: {
    module: '../commands/ui.js',
    description: 'Start local authoring UI server',
    usage: 'ossp ui [options]',
    options: [
      { name: '--port <port>', description: 'Port to listen on', default: '3030' },
      { name: '--baseDir <path>', description: 'Base directory for local schema $ref resolution', default: process.cwd() }
    ],
    examples: [
      'ossp ui',
      'ossp ui --port 4000',
      'ossp ui --baseDir ./app'
    ],
    errorMapping: {
      'EADDRINUSE': ['Choose a different --port', 'Stop the process using the port and retry'],
      'ENOENT': ['Verify baseDir exists and is readable']
    }
  },
  
  scaffold: {
    module: '../commands/scaffold-wrapper.js',
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
    ],
    errorMapping: {
      'EACCES': ['Check write permissions for the output directory', 'Run with appropriate privileges'],
      'INVALID_OPTION': ['Verify the scaffold type and name are valid', 'Check the available options']
    }
  },
  
  quickstart: {
    module: '../commands/quickstart.js',
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
    ],
    errorMapping: {
      'ENOENT': ['Check if the project directory exists', 'Verify write permissions'],
      'ECONNREFUSED': ['Check network connectivity', 'Verify external dependencies are accessible']
    }
  },

  'catalog:export': {
    module: '../../../../cli/commands/catalog-export.js',
    description: 'Export current workspace catalog to JSON snapshot',
    usage: 'ossp catalog:export [options]',
    options: [
      { name: '--output <file>', description: 'Output file path', default: 'catalog-snapshot.json' },
      { name: '--workspace <path>', description: 'Workspace path', default: 'current directory' },
      { name: '--offline', description: 'Export in offline mode (no network access)' },
      { name: '--verbose', description: 'Show detailed output' },
      { name: '--no-manifests', description: 'Exclude full manifests (URNs only)' },
      { name: '--no-relationships', description: 'Exclude relationship data' }
    ],
    examples: [
      'ossp catalog:export --output my-snapshot.json',
      'ossp catalog:export --workspace ./my-workspace --offline',
      'ossp catalog:export --output snapshot.json --verbose'
    ],
    errorMapping: {
      'ENOENT': ['Check if the workspace directory exists', 'Verify file permissions'],
      'VALIDATION_FAILED': ['Check the snapshot schema', 'Verify manifest format']
    }
  },

  'catalog:import': {
    module: '../../../../cli/commands/catalog-import.js',
    description: 'Import protocol catalog from JSON snapshot into workspace',
    usage: 'ossp catalog:import [options]',
    options: [
      { name: '--input <file>', description: 'Input snapshot file path', required: true },
      { name: '--workspace <path>', description: 'Target workspace path', default: 'current directory' },
      { name: '--offline', description: 'Import in offline mode (no network access)' },
      { name: '--verbose', description: 'Show detailed output' },
      { name: '--overwrite', description: 'Overwrite existing files' },
      { name: '--dry-run', description: 'Preview import without writing files' }
    ],
    examples: [
      'ossp catalog:import --input snapshot.json',
      'ossp catalog:import --input snapshot.json --workspace ./my-workspace',
      'ossp catalog:import --input snapshot.json --dry-run --verbose',
      'ossp catalog:import --input snapshot.json --overwrite'
    ],
    errorMapping: {
      'ENOENT': ['Check if the snapshot file exists', 'Verify file permissions'],
      'VALIDATION_FAILED': ['Check the snapshot schema', 'Verify snapshot format'],
      'CONFLICT': ['Use --overwrite to replace existing files', 'Check for file conflicts']
    }
  },

  'protocol:diff': {
    module: '../../../../cli/commands/protocol-diff.js',
    description: 'Detect and gate breaking changes to protocol artifacts',
    usage: 'ossp protocol:diff [options]',
    options: [
      { name: '--old <file>', description: 'Old manifest file path', required: true },
      { name: '--new <file>', description: 'New manifest file path', required: true },
      { name: '--allow-breaking', description: 'Allow breaking changes without migration file' },
      { name: '--migration-file <file>', description: 'Path to migration file (optional)' },
      { name: '--output <file>', description: 'Output file path (optional)' },
      { name: '--format <format>', description: 'Output format: summary, detailed, json, github', default: 'summary' },
      { name: '--verbose', description: 'Show detailed output' }
    ],
    examples: [
      'ossp protocol:diff --old v1.json --new v2.json',
      'ossp protocol:diff --old v1.json --new v2.json --format github --output diff.md',
      'ossp protocol:diff --old v1.json --new v2.json --allow-breaking',
      'ossp protocol:diff --old v1.json --new v2.json --migration-file MIGRATION.md'
    ],
    errorMapping: {
      'ENOENT': ['Check if the manifest files exist', 'Verify file permissions'],
      'BREAKING_CHANGES': ['Create a migration file', 'Use --allow-breaking to override'],
      'VALIDATION_FAILED': ['Check the manifest format', 'Verify JSON/YAML syntax']
    }
  }
};

// Register default commands
export function registerDefaultCommands() {
  for (const [name, config] of Object.entries(defaultCommands)) {
    globalRegistry.register(name, config);
  }
  
  console.log(chalk.green(`✓ Registered ${Object.keys(defaultCommands).length} default commands`));
}

// Export utility functions
export function getRegistry() {
  return globalRegistry;
}

export function registerCommand(name, config) {
  return globalRegistry.register(name, config);
}

export function loadCommand(name) {
  return globalRegistry.loadCommand(name);
}

export function executeCommand(name, ...args) {
  return globalRegistry.executeCommand(name, ...args);
}
