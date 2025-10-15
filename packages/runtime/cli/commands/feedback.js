#!/usr/bin/env node

/**
 * CLI Feedback Commands
 * View feedback summaries, traces, and hints
 */

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { FeedbackAggregator, ErrorCategory } from '../../feedback/index.js';

const program = new Command();

// Global feedback aggregator instance (singleton for CLI)
const feedbackAggregator = new FeedbackAggregator({
  serviceName: 'ossp-cli',
  verbose: false
});

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

/**
 * Get color for error category
 */
function getCategoryColor(category) {
  switch (category) {
    case ErrorCategory.CLIENT_ERROR:
      return chalk.yellow;
    case ErrorCategory.SERVER_ERROR:
      return chalk.red;
    case ErrorCategory.BUSINESS_LOGIC:
      return chalk.blue;
    default:
      return chalk.white;
  }
}

/**
 * Get color for severity
 */
function getSeverityColor(severity) {
  switch (severity) {
    case 'ERROR':
      return chalk.red;
    case 'WARNING':
      return chalk.yellow;
    case 'INFO':
      return chalk.blue;
    default:
      return chalk.white;
  }
}

/**
 * Command: feedback summarize
 * Display summary of all feedback
 */
program
  .command('summarize')
  .description('Display feedback summary')
  .option('-j, --json', 'Output as JSON')
  .action((options) => {
    const summary = feedbackAggregator.getSummary();

    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    console.log(chalk.bold('\n📊 Feedback Summary\n'));

    // Errors summary
    console.log(chalk.bold('Errors:'));
    const errorTable = new Table({
      head: ['Category', 'Count'],
      style: { head: ['cyan'] }
    });

    errorTable.push(
      ['Total', summary.errors.total],
      [chalk.yellow('Client Errors'), summary.errors.byCategory.client],
      [chalk.red('Server Errors'), summary.errors.byCategory.server],
      [chalk.blue('Business Logic'), summary.errors.byCategory.business]
    );

    console.log(errorTable.toString());

    // Hints summary
    console.log(chalk.bold('\nHints:'));
    const hintTable = new Table({
      head: ['Severity', 'Count'],
      style: { head: ['cyan'] }
    });

    hintTable.push(
      ['Total', summary.hints.total],
      [chalk.blue('Info'), summary.hints.bySeverity.info],
      [chalk.yellow('Warning'), summary.hints.bySeverity.warning],
      [chalk.red('Error'), summary.hints.bySeverity.error]
    );

    console.log(hintTable.toString());

    // Progress summary
    console.log(chalk.bold('\nProgress:'));
    const progressTable = new Table({
      head: ['Status', 'Count'],
      style: { head: ['cyan'] }
    });

    progressTable.push(
      ['Total Tasks', summary.progress.total],
      ['Pending', summary.progress.pending],
      ['In Progress', summary.progress.inProgress],
      [chalk.green('Completed'), summary.progress.completed],
      [chalk.red('Failed'), summary.progress.failed]
    );

    console.log(progressTable.toString());
    console.log();
  });

/**
 * Command: feedback errors
 * List all errors
 */
program
  .command('errors')
  .description('List all errors')
  .option('-c, --category <category>', 'Filter by category (CLIENT_ERROR, SERVER_ERROR, BUSINESS_LOGIC)')
  .option('--code <code>', 'Filter by error code')
  .option('--since <timestamp>', 'Show errors since timestamp')
  .option('-j, --json', 'Output as JSON')
  .option('-v, --verbose', 'Show full details')
  .action((options) => {
    const filter = {
      category: options.category,
      code: options.code ? parseInt(options.code) : undefined,
      since: options.since
    };

    const errors = feedbackAggregator.getErrors(filter);

    if (options.json) {
      console.log(JSON.stringify(errors, null, 2));
      return;
    }

    if (errors.length === 0) {
      console.log(chalk.green('✓ No errors found'));
      return;
    }

    console.log(chalk.bold(`\n🚨 Errors (${errors.length})\n`));

    errors.forEach((error, index) => {
      const color = getCategoryColor(error.category);

      console.log(color(`[${index + 1}] ${error.message}`));
      console.log(`    Code: ${error.code}`);
      console.log(`    Category: ${error.category}`);
      console.log(`    Time: ${formatTimestamp(error.timestamp)}`);

      if (error.detail) {
        console.log(`    Detail: ${error.detail}`);
      }

      if (error.suggestedFix) {
        console.log(chalk.green(`    💡 Fix: ${error.suggestedFix}`));
      }

      if (options.verbose && error.details) {
        console.log(`    Details: ${JSON.stringify(error.details, null, 2)}`);
      }

      if (error.correlationId) {
        console.log(chalk.dim(`    Trace: ${error.correlationId}`));
      }

      console.log();
    });
  });

/**
 * Command: feedback hints
 * List all hints
 */
program
  .command('hints')
  .description('List all hints')
  .option('-s, --severity <severity>', 'Filter by severity (INFO, WARNING, ERROR)')
  .option('-c, --code <code>', 'Filter by hint code')
  .option('-j, --json', 'Output as JSON')
  .action((options) => {
    const filter = {
      severity: options.severity,
      code: options.code
    };

    const hints = feedbackAggregator.getHints(filter);

    if (options.json) {
      console.log(JSON.stringify(hints, null, 2));
      return;
    }

    if (hints.length === 0) {
      console.log(chalk.green('✓ No hints found'));
      return;
    }

    console.log(chalk.bold(`\n💡 Hints (${hints.length})\n`));

    hints.forEach((hint, index) => {
      const color = getSeverityColor(hint.severity);

      console.log(color(`[${index + 1}] ${hint.message}`));
      console.log(`    Code: ${hint.code}`);
      console.log(`    Severity: ${hint.severity}`);

      if (hint.documentationUrl) {
        console.log(chalk.blue(`    📚 Docs: ${hint.documentationUrl}`));
      }

      if (hint.context && Object.keys(hint.context).length > 0) {
        console.log(`    Context: ${JSON.stringify(hint.context)}`);
      }

      console.log();
    });
  });

/**
 * Command: feedback trace
 * Trace a request by correlation ID
 */
program
  .command('trace <correlation-id>')
  .description('Trace a request by correlation ID')
  .option('-j, --json', 'Output as JSON')
  .action((correlationId, options) => {
    const trace = feedbackAggregator.getTrace(correlationId);

    if (options.json) {
      console.log(JSON.stringify(trace, null, 2));
      return;
    }

    console.log(chalk.bold(`\n🔍 Trace: ${correlationId}\n`));

    // Progress
    if (trace.progress) {
      console.log(chalk.bold('Progress:'));
      console.log(`  Task ID: ${trace.progress.taskId}`);
      console.log(`  Status: ${trace.progress.status}`);
      console.log(`  Progress: ${trace.progress.progress.percent.toFixed(1)}%`);
      console.log(`  Description: ${trace.progress.progress.description}`);
      console.log(`  Elapsed: ${trace.progress.elapsedMs}ms`);
      console.log();
    }

    // Errors
    if (trace.errors.length > 0) {
      console.log(chalk.bold(`Errors (${trace.errors.length}):`));
      trace.errors.forEach((error, index) => {
        const color = getCategoryColor(error.category);
        console.log(color(`  [${index + 1}] ${error.message}`));
        console.log(`      ${error.detail || ''}`);
      });
      console.log();
    }

    // Hints
    if (trace.hints.length > 0) {
      console.log(chalk.bold(`Hints (${trace.hints.length}):`));
      trace.hints.forEach((hint, index) => {
        const color = getSeverityColor(hint.severity);
        console.log(color(`  [${index + 1}] ${hint.message}`));
      });
      console.log();
    }

    if (trace.errors.length === 0 && trace.hints.length === 0 && !trace.progress) {
      console.log(chalk.dim('No feedback found for this correlation ID'));
    }
  });

/**
 * Command: feedback clear
 * Clear all feedback
 */
program
  .command('clear')
  .description('Clear all feedback')
  .option('-f, --force', 'Skip confirmation')
  .action((options) => {
    if (!options.force) {
      console.log(chalk.yellow('⚠️  This will clear all stored feedback.'));
      console.log('Run with --force to confirm.');
      return;
    }

    feedbackAggregator.clear();
    console.log(chalk.green('✓ Feedback cleared'));
  });

// Export for use in other CLI commands
export { feedbackAggregator };

// Main program
program
  .name('feedback')
  .description('View and manage structured feedback (errors, hints, progress)')
  .version('1.0.0');

// Parse if running as main module
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse(process.argv);
}

export default program;
