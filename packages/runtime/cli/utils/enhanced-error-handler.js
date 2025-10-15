/**
 * Enhanced Error Handler - B10.4
 * 
 * Provides rich error descriptions with suggested fixes and contextual help.
 * Performance target: <20ms error processing time.
 */

import chalk from 'chalk';
import { performance } from 'perf_hooks';

// Error code mappings with suggestions
const ERROR_SUGGESTIONS = {
  // File system errors
  'ENOENT': {
    title: 'File or directory not found',
    suggestions: [
      'Check if the file path is correct',
      'Verify the file exists and you have read permissions',
      'Use absolute paths for better reliability',
      'Try running from the correct working directory'
    ]
  },
  'EACCES': {
    title: 'Permission denied',
    suggestions: [
      'Check file permissions (use chmod if needed)',
      'Run with appropriate user privileges',
      'Verify write permissions for output directories',
      'Check if the file is locked by another process'
    ]
  },
  'EMFILE': {
    title: 'Too many open files',
    suggestions: [
      'Close unnecessary file handles',
      'Increase system file descriptor limit',
      'Use streaming for large files instead of loading all at once'
    ]
  },
  
  // Network errors
  'ECONNREFUSED': {
    title: 'Connection refused',
    suggestions: [
      'Check if the service is running',
      'Verify the host and port are correct',
      'Check firewall settings',
      'Ensure the service is listening on the expected port'
    ]
  },
  'ETIMEDOUT': {
    title: 'Connection timeout',
    suggestions: [
      'Check network connectivity',
      'Increase timeout settings if appropriate',
      'Verify the service is responding',
      'Check for network latency issues'
    ]
  },
  
  // Validation errors
  'VALIDATION_FAILED': {
    title: 'Validation failed',
    suggestions: [
      'Review the validation errors and fix the issues',
      'Check the manifest schema and required fields',
      'Use --verbose flag for detailed error information',
      'Try running validation on a smaller subset first'
    ]
  },
  'SCHEMA_ERROR': {
    title: 'Schema validation error',
    suggestions: [
      'Check the manifest against the expected schema',
      'Verify all required fields are present',
      'Check for typos in field names',
      'Use a schema validator to identify specific issues'
    ]
  },
  
  // CLI specific errors
  'UNKNOWN_COMMAND': {
    title: 'Unknown command',
    suggestions: [
      'Check the command spelling',
      'Use --help to see available commands',
      'Try similar command names',
      'Use catalog search to find related functionality'
    ]
  },
  'MISSING_ARGUMENT': {
    title: 'Missing required argument',
    suggestions: [
      'Check the command syntax',
      'Use --help to see required arguments',
      'Verify all required options are provided',
      'Check for typos in argument names'
    ]
  },
  'INVALID_OPTION': {
    title: 'Invalid option value',
    suggestions: [
      'Check the option value format',
      'Use --help to see valid option values',
      'Verify the option is supported for this command',
      'Check for typos in option names'
    ]
  },
  
  // Protocol specific errors
  'PROTOCOL_NOT_FOUND': {
    title: 'Protocol not found',
    suggestions: [
      'Check if the protocol URN is correct',
      'Use catalog search to find available protocols',
      'Verify the protocol is registered',
      'Check if you have access to the protocol'
    ]
  },
  'URN_CONFLICT': {
    title: 'URN conflict detected',
    suggestions: [
      'Choose a different URN for your protocol',
      'Check if the URN is already in use',
      'Use version numbers to avoid conflicts',
      'Consider using a different namespace'
    ]
  },
  
  // Performance errors
  'PERFORMANCE_WARNING': {
    title: 'Performance warning',
    suggestions: [
      'Consider using --verbose for detailed timing',
      'Check if the operation can be optimized',
      'Use smaller datasets for testing',
      'Monitor system resources during execution'
    ]
  },
  
  // Generic errors
  'INTERNAL_ERROR': {
    title: 'Internal error occurred',
    suggestions: [
      'Check the logs for more details',
      'Try running with --verbose for debugging',
      'Report the issue if it persists',
      'Check system resources and permissions'
    ]
  }
};

// Contextual help based on command and error
const CONTEXTUAL_HELP = {
  'discover': {
    'ENOENT': 'Try using absolute paths or check if the source file exists',
    'ECONNREFUSED': 'Verify the API endpoint is accessible and the service is running',
    'VALIDATION_FAILED': 'Check the OpenAPI/AsyncAPI specification format'
  },
  'validate': {
    'ENOENT': 'Check if the manifests directory exists and contains valid files',
    'VALIDATION_FAILED': 'Review the validation report for specific issues'
  },
  'scaffold': {
    'EACCES': 'Check write permissions for the output directory',
    'INVALID_OPTION': 'Verify the scaffold type and name are valid'
  },
  'catalog': {
    'PROTOCOL_NOT_FOUND': 'Use "ossp catalog list" to see available protocols',
    'ENOENT': 'Check if the artifacts directory exists and contains manifests'
  }
};

/**
 * Enhanced error class with suggestions and context
 */
export class EnhancedError extends Error {
  constructor(message, code = 'INTERNAL_ERROR', context = {}, suggestions = []) {
    super(message);
    this.name = 'EnhancedError';
    this.code = code;
    this.context = context;
    this.suggestions = suggestions;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Process and format error with suggestions
 */
export function processError(error, commandContext = {}) {
  const startTime = performance.now();
  
  const errorInfo = {
    message: error.message,
    code: error.code || 'INTERNAL_ERROR',
    suggestions: [],
    contextualHelp: '',
    performance: 0
  };
  
  // Get base suggestions from error code
  if (ERROR_SUGGESTIONS[error.code]) {
    errorInfo.suggestions.push(...ERROR_SUGGESTIONS[error.code].suggestions);
  }
  
  // Add custom suggestions if provided
  if (error.suggestions && Array.isArray(error.suggestions)) {
    errorInfo.suggestions.push(...error.suggestions);
  }
  
  // Add contextual help based on command
  if (commandContext.command && CONTEXTUAL_HELP[commandContext.command]) {
    const commandHelp = CONTEXTUAL_HELP[commandContext.command][error.code];
    if (commandHelp) {
      errorInfo.contextualHelp = commandHelp;
    }
  }
  
  errorInfo.performance = performance.now() - startTime;
  
  return errorInfo;
}

/**
 * Format error output with rich descriptions and suggestions
 */
export function formatError(errorInfo, options = {}) {
  const { verbose = false, showPerformance = false } = options;
  
  let output = '';
  
  // Error header
  output += chalk.red(`\n❌ Error: ${errorInfo.message}\n`);
  
  // Error code and title
  if (errorInfo.code !== 'INTERNAL_ERROR') {
    const errorDef = ERROR_SUGGESTIONS[errorInfo.code];
    if (errorDef) {
      output += chalk.gray(`Code: ${errorInfo.code} - ${errorDef.title}\n`);
    } else {
      output += chalk.gray(`Code: ${errorInfo.code}\n`);
    }
  }
  
  // Contextual help
  if (errorInfo.contextualHelp) {
    output += chalk.blue(`\n💡 Context: ${errorInfo.contextualHelp}\n`);
  }
  
  // Suggestions
  if (errorInfo.suggestions.length > 0) {
    output += chalk.blue('\n🔧 Suggestions:\n');
    errorInfo.suggestions.forEach((suggestion, index) => {
      output += chalk.gray(`  ${index + 1}. ${suggestion}\n`);
    });
  }
  
  // Performance info
  if (showPerformance && errorInfo.performance > 0) {
    output += chalk.gray(`\n⏱️  Error processing time: ${errorInfo.performance.toFixed(2)}ms\n`);
  }
  
  // Additional help
  output += chalk.gray('\nFor more help, try:\n');
  output += chalk.gray('  • Use --help for command-specific information\n');
  output += chalk.gray('  • Use --verbose for detailed output\n');
  output += chalk.gray('  • Check the documentation for examples\n');
  
  if (errorInfo.code === 'UNKNOWN_COMMAND') {
    output += chalk.gray('  • Use "ossp catalog search <term>" to find protocols\n');
  }
  
  return output;
}

/**
 * Handle error with rich output and suggestions
 */
export function handleError(error, commandContext = {}, options = {}) {
  const errorInfo = processError(error, commandContext);
  const formattedError = formatError(errorInfo, options);
  
  console.error(formattedError);
  
  // Log error details in verbose mode
  if (options.verbose) {
    console.error(chalk.gray('\n--- Error Details ---'));
    console.error(chalk.gray(`Timestamp: ${errorInfo.timestamp}`));
    console.error(chalk.gray(`Command: ${commandContext.command || 'unknown'}`));
    console.error(chalk.gray(`Working Directory: ${process.cwd()}`));
    
    if (error.stack) {
      console.error(chalk.gray('\nStack Trace:'));
      console.error(chalk.gray(error.stack));
    }
  }
  
  // Exit with appropriate code
  const exitCode = getExitCode(errorInfo.code);
  process.exit(exitCode);
}

/**
 * Get appropriate exit code for error
 */
function getExitCode(errorCode) {
  const exitCodes = {
    'ENOENT': 2,           // File not found
    'EACCES': 13,          // Permission denied
    'ECONNREFUSED': 111,   // Connection refused
    'ETIMEDOUT': 110,      // Connection timeout
    'VALIDATION_FAILED': 1, // Validation failed
    'SCHEMA_ERROR': 1,     // Schema error
    'UNKNOWN_COMMAND': 2,   // Unknown command
    'MISSING_ARGUMENT': 2,  // Missing argument
    'INVALID_OPTION': 2,    // Invalid option
    'PROTOCOL_NOT_FOUND': 2, // Protocol not found
    'URN_CONFLICT': 1,     // URN conflict
    'PERFORMANCE_WARNING': 0, // Performance warning (non-fatal)
    'INTERNAL_ERROR': 1     // Internal error
  };
  
  return exitCodes[errorCode] || 1;
}

/**
 * Create error with suggestions
 */
export function createError(message, code = 'INTERNAL_ERROR', suggestions = []) {
  return new EnhancedError(message, code, {}, suggestions);
}

/**
 * Validate command arguments and provide helpful errors
 */
export function validateArguments(args, requiredArgs = [], commandName = '') {
  const missingArgs = requiredArgs.filter(arg => !args[arg]);
  
  if (missingArgs.length > 0) {
    const suggestions = [
      `Provide the missing argument${missingArgs.length > 1 ? 's' : ''}: ${missingArgs.join(', ')}`,
      `Use --help to see required arguments for ${commandName}`,
      'Check the command syntax and try again'
    ];
    
    throw createError(
      `Missing required argument${missingArgs.length > 1 ? 's' : ''}: ${missingArgs.join(', ')}`,
      'MISSING_ARGUMENT',
      suggestions
    );
  }
}

/**
 * Validate file paths and provide helpful errors
 */
export function validateFilePath(filePath, options = {}) {
  const { mustExist = true, mustBeReadable = true, mustBeWritable = false } = options;
  
  try {
    const fs = require('fs');
    const path = require('path');
    
    const resolvedPath = path.resolve(filePath);
    
    if (mustExist && !fs.existsSync(resolvedPath)) {
      throw createError(
        `File not found: ${resolvedPath}`,
        'ENOENT',
        [
          'Check if the file path is correct',
          'Verify the file exists',
          'Use absolute paths for better reliability'
        ]
      );
    }
    
    if (mustBeReadable && fs.existsSync(resolvedPath)) {
      try {
        fs.accessSync(resolvedPath, fs.constants.R_OK);
      } catch (error) {
        throw createError(
          `Cannot read file: ${resolvedPath}`,
          'EACCES',
          [
            'Check file permissions',
            'Verify you have read access',
            'Run with appropriate user privileges'
          ]
        );
      }
    }
    
    if (mustBeWritable) {
      const dir = path.dirname(resolvedPath);
      try {
        fs.accessSync(dir, fs.constants.W_OK);
      } catch (error) {
        throw createError(
          `Cannot write to directory: ${dir}`,
          'EACCES',
          [
            'Check directory permissions',
            'Verify you have write access',
            'Run with appropriate user privileges'
          ]
        );
      }
    }
    
    return resolvedPath;
    
  } catch (error) {
    if (error instanceof EnhancedError) {
      throw error;
    }
    
    throw createError(
      `File validation failed: ${error.message}`,
      'INTERNAL_ERROR',
      ['Check file system permissions and try again']
    );
  }
}
