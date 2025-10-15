/**
 * CJS Test Shim for discover command
 * Provides minimal functionality for tests without importing ESM modules.
 */

const fs = require('fs-extra');
const path = require('path');
const { OpenAPIImporter } = require('../../../packages/runtime/importers/openapi/importer');
const { PostgresImporter } = require('../../../packages/runtime/importers/postgres/importer');

const SUPPORTED_TYPES = new Set(['api', 'data', 'event', 'auto']);
const MANIFEST_TYPE_BY_SOURCE = {
  postgres: 'data',
  mysql: 'data',
  openapi: 'api',
  'openapi-url': 'api',
  asyncapi: 'event',
  'asyncapi-url': 'event'
};

function detectSourceType(source) {
  if (!source) throw new Error('Source is required for discovery');
  if (source.startsWith('postgresql://') || source.startsWith('postgres://')) return 'postgres';
  if (source.startsWith('mysql://')) return 'mysql';
  if (source.startsWith('http://') || source.startsWith('https://')) {
    if (source.includes('asyncapi')) return 'asyncapi-url';
    return 'openapi-url';
  }
  if (source.match(/\.(json|yaml|yml)$/i)) {
    try {
      const content = fs.readFileSync(source, 'utf-8');
      if (content.includes('asyncapi:') || content.includes('"asyncapi"')) return 'asyncapi';
    } catch (_) {}
    return 'openapi';
  }
  throw new Error('Could not detect source type');
}

function determineManifestType(type, sourceType) {
  const normalizedType = (type || '').toLowerCase();
  const inferredType = MANIFEST_TYPE_BY_SOURCE[sourceType] || 'contract';
  if (!normalizedType || normalizedType === 'auto') return inferredType;
  if (!SUPPORTED_TYPES.has(normalizedType)) throw new Error('Unsupported contract type');
  if (normalizedType === 'event' && !['asyncapi', 'asyncapi-url'].includes(sourceType)) {
    throw new Error('Event discovery requires AsyncAPI specification');
  }
  if (inferredType !== 'contract' && inferredType !== normalizedType) {
    throw new Error('Unsupported contract type');
  }
  return normalizedType;
}

function generateOutputFilename(manifestType, format) {
  return `${manifestType}-manifest.draft.${format}`;
}

function formatOutput(manifest, format, /*isCI*/ _ci) {
  // Minimal implementation; tests assert JSON output and YAML fallback
  return JSON.stringify(manifest, null, 2);
}

async function saveManifest(manifest, outputPath, format) {
  await fs.ensureDir(path.dirname(outputPath));
  const content = formatOutput(manifest, format, false);
  await fs.writeFile(outputPath, `${content}\n`, 'utf-8');
}

function augmentProvenance(manifest, source) {
  manifest.metadata = { ...(manifest.metadata || {}), status: manifest.metadata?.status || 'draft' };
  manifest.provenance = {
    ...(manifest.provenance || {}),
    source_location: source,
    generated_at: new Date().toISOString(),
    tool: 'protocol-discover',
    tool_version: '0.1.0'
  };
}

async function runImporter(sourceType, source) {
  switch (sourceType) {
    case 'postgres': {
      const pgImporter = new PostgresImporter();
      return pgImporter.import(source);
    }
    case 'openapi':
    case 'openapi-url': {
      const apiImporter = new OpenAPIImporter();
      return apiImporter.import(source);
    }
    default:
      throw new Error(`Unsupported source type: ${sourceType}`);
  }
}

async function discoverCommand(type, source, options = {}) {
  const format = (options.format || 'json').toLowerCase();
  const outputDir = options.output || 'artifacts';
  try {
    const sourceType = detectSourceType(source);
    const manifestType = determineManifestType(type, sourceType);
    const manifest = await runImporter(sourceType, source);
    augmentProvenance(manifest, source);
    const filename = generateOutputFilename(manifestType, format);
    const outputPath = path.resolve(outputDir, filename);
    await saveManifest(manifest, outputPath, format);
    console.log(`Manifest saved to: ${outputPath}`);
    if (manifest.metadata?.status === 'error') {
      console.error('Import completed with errors. Review manifest for details.');
      process.exitCode = 1;
    }
    return manifest;
  } catch (error) {
    console.error(`Discovery failed: ${error.message}`);
    process.exitCode = 1;
    return null;
  }
}

module.exports = {
  discoverCommand,
  detectSourceType,
  determineManifestType,
  generateOutputFilename,
  saveManifest,
  augmentProvenance,
  runImporter
};

