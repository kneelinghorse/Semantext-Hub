/**
 * Discover Command
 *
 * Discovers contracts and converts them to protocol manifests.
 * Supports OpenAPI specs (URLs and files) and database connections.
 */

const fs = require('fs-extra');
const path = require('path');
const { OpenAPIImporter } = require('../../importers/openapi/importer');
const { PostgresImporter } = require('../../importers/postgres/importer');
const { importAsyncAPI } = require('../../importers/asyncapi/importer');
const { createSpinner } = require('../utils/progress');
const { formatOutput, prettyPrintSummary, printSuccess, printError } = require('../utils/output');
const { isCI } = require('../utils/detect-ci');

const SUPPORTED_TYPES = new Set(['api', 'data', 'event', 'auto']);
const MANIFEST_TYPE_BY_SOURCE = {
  postgres: 'data',
  mysql: 'data',
  openapi: 'api',
  'openapi-url': 'api',
  asyncapi: 'event',
  'asyncapi-url': 'event'
};

/**
 * Detect source type from source string
 *
 * @param {string} source - Source path, URL, or connection string
 * @returns {string} Detected type: 'postgres', 'mysql', 'openapi', 'openapi-url'
 * @throws {Error} If type cannot be detected
 */
function detectSourceType(source) {
  if (!source) {
    throw new Error('Source is required for discovery');
  }

  if (source.startsWith('postgresql://') || source.startsWith('postgres://')) {
    return 'postgres';
  }
  if (source.startsWith('mysql://')) {
    return 'mysql';
  }
  if (source.startsWith('http://') || source.startsWith('https://')) {
    // Check if it's likely an AsyncAPI spec by looking for 'asyncapi' in URL
    if (source.includes('asyncapi')) {
      return 'asyncapi-url';
    }
    return 'openapi-url';
  }
  if (source.match(/\.(json|yaml|yml)$/i)) {
    // Try to detect AsyncAPI by reading file for 'asyncapi' keyword
    try {
      const fs = require('fs');
      const content = fs.readFileSync(source, 'utf-8');
      if (content.includes('asyncapi:') || content.includes('"asyncapi"')) {
        return 'asyncapi';
      }
    } catch (error) {
      // If file read fails, fall through to default detection
    }
    return 'openapi';
  }

  throw new Error(
    `Could not detect source type. Supported formats:\n` +
    '  - PostgreSQL: postgresql://...\n' +
    '  - MySQL: mysql://...\n' +
    '  - OpenAPI file: ./spec.json, ./spec.yaml\n' +
    '  - OpenAPI URL: https://...\n' +
    '  - AsyncAPI file: ./asyncapi.yaml\n' +
    '  - AsyncAPI URL: https://...asyncapi...'
  );
}

/**
 * Determine manifest type from provided contract type and detected source
 *
 * @param {string} type - Contract type (api, data, event, auto)
 * @param {string} sourceType - Detected source type
 * @returns {string} Manifest type for filename
 */
function determineManifestType(type, sourceType) {
  const normalizedType = (type || '').toLowerCase();
  const inferredType = MANIFEST_TYPE_BY_SOURCE[sourceType] || 'contract';

  if (!normalizedType || normalizedType === 'auto') {
    return inferredType;
  }

  if (!SUPPORTED_TYPES.has(normalizedType)) {
    throw new Error(`Unsupported contract type: ${type}`);
  }

  // Event discovery now supported via AsyncAPI
  if (normalizedType === 'event' && !['asyncapi', 'asyncapi-url'].includes(sourceType)) {
    throw new Error('Event discovery requires AsyncAPI specification');
  }

  if (inferredType !== 'contract' && inferredType !== normalizedType) {
    throw new Error(`Type mismatch: source detected as ${inferredType} but '${type}' was provided`);
  }

  return normalizedType;
}

/**
 * Generate output filename
 *
 * @param {string} manifestType - Type of manifest (api, data, event)
 * @param {string} format - Output format (json, yaml)
 * @returns {string} Output filename
 */
function generateOutputFilename(manifestType, format) {
  return `${manifestType}-manifest.draft.${format}`;
}

/**
 * Normalise output format and validate support
 *
 * @param {string} format - Requested format
 * @returns {string} Normalised format
 */
function normalizeFormat(format) {
  const normalized = (format || 'json').toLowerCase();
  if (!['json', 'yaml'].includes(normalized)) {
    throw new Error(`Unsupported output format: ${format}`);
  }
  return normalized;
}

/**
 * Persist manifest to the requested location
 *
 * @param {Object} manifest - Manifest object to save
 * @param {string} outputPath - Full path to output file
 * @param {string} format - Output format (json, yaml)
 */
async function saveManifest(manifest, outputPath, format) {
  await fs.ensureDir(path.dirname(outputPath));
  const content = formatOutput(manifest, format, isCI());
  await fs.writeFile(outputPath, `${content}\n`, 'utf-8');
}

/**
 * Update provenance information with CLI metadata
 *
 * @param {Object} manifest - Manifest to augment
 * @param {string} source - Original source reference
 */
function augmentProvenance(manifest, source) {
  manifest.metadata = {
    ...(manifest.metadata || {}),
    status: manifest.metadata?.status || 'draft'
  };

  const provenance = {
    ...(manifest.provenance || {}),
    source_location: source,
    generated_at: new Date().toISOString(),
    tool: 'protocol-discover',
    tool_version: '0.1.0'
  };

  manifest.provenance = provenance;
}

/**
 * Execute importer based on detected source type
 *
 * @param {string} sourceType - Detected source type
 * @param {string} source - Source path, URL, or connection string
 * @param {Object} spinner - Spinner instance for progress updates
 * @returns {Promise<Object>} Imported manifest
 */
async function runImporter(sourceType, source, spinner) {
  switch (sourceType) {
    case 'postgres': {
      if (spinner) spinner.text = 'Introspecting PostgreSQL schema...';
      const pgImporter = new PostgresImporter();
      return pgImporter.import(source);
    }
    case 'mysql':
      throw new Error('MySQL support is not yet implemented');
    case 'openapi':
    case 'openapi-url': {
      if (spinner) spinner.text = 'Parsing OpenAPI specification...';
      const apiImporter = new OpenAPIImporter();
      return apiImporter.import(source);
    }
    case 'asyncapi':
    case 'asyncapi-url': {
      if (spinner) spinner.text = 'Importing AsyncAPI specification...';
      const result = await importAsyncAPI(source, { timeout: 30000 });

      // Return first manifest (or combined if multiple channels)
      // For now, return first manifest to match OpenAPI/Postgres behavior
      if (result.manifests.length === 0) {
        throw new Error('No event channels found in AsyncAPI specification');
      }

      // If multiple manifests, merge metadata
      const primaryManifest = result.manifests[0];
      primaryManifest.metadata = {
        ...primaryManifest.metadata,
        channel_count: result.metadata.channel_count,
        message_count: result.metadata.message_count,
        parse_time_ms: result.metadata.parse_time_ms
      };

      return primaryManifest;
    }
    default:
      throw new Error(`Unsupported source type: ${sourceType}`);
  }
}

/**
 * Discover command handler
 *
 * @param {string} type - Contract type (api, data, event)
 * @param {string} source - Source path, URL, or connection string
 * @param {Object} options - Command options
 */
async function discoverCommand(type, source, options = {}) {
  const format = normalizeFormat(options.format);
  const outputDir = options.output || 'artifacts';
  let spinner;

  try {
    const sourceType = detectSourceType(source);
    const manifestType = determineManifestType(type, sourceType);

    spinner = createSpinner('Discovering contracts...');
    if (spinner && typeof spinner.start === 'function') {
      spinner.start();
    }

    const manifest = await runImporter(sourceType, source, spinner);

    augmentProvenance(manifest, source);

    const filename = generateOutputFilename(manifestType, format);
    const outputPath = path.resolve(outputDir, filename);

    await saveManifest(manifest, outputPath, format);

    if (spinner && typeof spinner.succeed === 'function') {
      spinner.succeed('Contract discovered successfully');
    }

    console.log(prettyPrintSummary(manifest));
    printSuccess(`Manifest saved to: ${outputPath}`);

    if (manifest.metadata?.status === 'error') {
      printError('Import completed with errors. Review manifest for details.');
      process.exitCode = 1;
    }

    return manifest;
  } catch (error) {
    if (spinner && typeof spinner.fail === 'function') {
      spinner.fail(`Discovery failed: ${error.message}`);
    }

    printError(`Discovery failed: ${error.message}`);

    if (process.env.DEBUG) {
      console.error(error.stack);
    }

    process.exitCode = 1;
    return null;
  }
}

module.exports = {
  discoverCommand,
  detectSourceType,
  determineManifestType,
  generateOutputFilename,
  normalizeFormat,
  runImporter,
  saveManifest,
  augmentProvenance
};
