/**
 * Output Formatting
 *
 * Handles formatting and display of CLI output with support for
 * different formats (json, yaml) and CI vs terminal environments.
 */

import chalk from 'chalk';
import { isCI } from './detect-ci.js';

let yaml = null;
try {
  // Optional dependency: only used when available
  // eslint-disable-next-line import/no-extraneous-dependencies
  const mod = await import('yaml');
  yaml = mod.default || mod;
} catch (error) {
  yaml = null;
}

/**
 * Formats manifest output for display
 *
 * @param {Object} manifest - The manifest to format
 * @param {string} format - Output format ('json' or 'yaml')
 * @param {boolean} [forcePlain=false] - Force plain output
 * @returns {string} Formatted output
 */
export function formatOutput(manifest, format = 'json', ci = isCI()) {
  if (ci || format === 'json') {
    return JSON.stringify(manifest, null, 2);
  }

  if (format === 'yaml') {
    if (yaml) {
      return yaml.stringify(manifest, { indent: 2 });
    }

    // Fallback to JSON when YAML library is unavailable
    return JSON.stringify(manifest, null, 2);
  }

  return JSON.stringify(manifest, null, 2);
}

/**
 * Pretty-prints a manifest summary for terminal output
 *
 * @param {Object} manifest - The manifest to summarize
 * @returns {string} Pretty-printed summary
 */
export function prettyPrintSummary(manifest) {
  if (isCI()) {
    return formatOutput(manifest, 'json');
  }

  const lines = [];
  lines.push(chalk.bold('\n📋 Manifest Summary\n'));

  // Metadata
  if (manifest.metadata) {
    lines.push(chalk.cyan('Metadata:'));
    lines.push(`  Name: ${manifest.metadata.name}`);
    lines.push(`  Version: ${manifest.metadata.version}`);
    lines.push(`  Status: ${chalk.yellow(manifest.metadata.status)}`);
    if (manifest.metadata.confidence_score !== undefined) {
      const score = manifest.metadata.confidence_score;
      const color = score >= 0.8 ? chalk.green : score >= 0.5 ? chalk.yellow : chalk.red;
      lines.push(`  Confidence: ${color(score.toFixed(2))}`);
    }
    lines.push('');
  }

  // Catalog type
  if (manifest.catalog) {
    lines.push(chalk.cyan('Catalog:'));
    lines.push(`  Type: ${manifest.catalog.type}`);

    // API endpoints
    if (manifest.catalog.endpoints) {
      lines.push(`  Endpoints: ${manifest.catalog.endpoints.length}`);
    }

    // Database schemas
    if (manifest.catalog.schemas) {
      const tableCount = manifest.catalog.schemas.reduce(
        (sum, schema) => sum + (schema.tables?.length || 0),
        0
      );
      lines.push(`  Schemas: ${manifest.catalog.schemas.length}`);
      lines.push(`  Tables: ${tableCount}`);
    }

    lines.push('');
  }

  // Provenance
  if (manifest.provenance) {
    lines.push(chalk.cyan('Provenance:'));
    lines.push(`  Source: ${manifest.provenance.source_location}`);
    lines.push(`  Generated: ${new Date(manifest.provenance.generated_at).toLocaleString()}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Prints success message
 *
 * @param {string} message - Message to display
 */
export function printSuccess(message) {
  if (isCI()) {
    console.log(`✓ ${message}`);
  } else {
    console.log(chalk.green(`✓ ${message}`));
  }
}

/**
 * Prints error message
 *
 * @param {string} message - Error message to display
 */
export function printError(message) {
  if (isCI()) {
    console.error(`✗ ${message}`);
  } else {
    console.error(chalk.red(`✗ ${message}`));
  }
}

/**
 * Prints warning message
 *
 * @param {string} message - Warning message to display
 */
export function printWarning(message) {
  if (isCI()) {
    console.warn(`⚠ ${message}`);
  } else {
    console.warn(chalk.yellow(`⚠ ${message}`));
  }
}

/**
 * Prints info message
 *
 * @param {string} message - Info message to display
 */
export function printInfo(message) {
  if (isCI()) {
    console.log(`ℹ ${message}`);
  } else {
    console.log(chalk.blue(`ℹ ${message}`));
  }
}
