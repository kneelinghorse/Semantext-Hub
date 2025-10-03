/**
 * CLI Generate Command
 * Generate event consumers from Event Protocol manifests
 */

const fs = require('fs').promises;
const path = require('path');
const { generateEventConsumer, generateEventConsumers } = require('../../generators/consumers');

/**
 * Execute generate command
 * @param {object} args - Command arguments
 * @param {string} args.input - Input manifest file or directory
 * @param {string} args.output - Output directory for generated code
 * @param {boolean} args.typescript - Generate TypeScript (default: true)
 * @param {boolean} args.tests - Generate test scaffolds (default: true)
 * @param {boolean} args.piiUtil - Generate PII masking utility (default: true)
 * @param {boolean} args.batch - Batch mode for multiple manifests
 */
async function executeGenerateCommand(args) {
  const {
    input,
    output = './generated-consumers',
    typescript = true,
    tests = true,
    piiUtil = true,
    batch = false
  } = args;

  if (!input) {
    throw new Error('--input is required');
  }

  console.log('🚀 Event Consumer Generator');
  console.log('─'.repeat(50));
  console.log(`Input: ${input}`);
  console.log(`Output: ${output}`);
  console.log(`TypeScript: ${typescript}`);
  console.log(`Tests: ${tests}`);
  console.log(`PII Util: ${piiUtil}`);
  console.log('─'.repeat(50));

  // Read manifest(s)
  const manifests = await loadManifests(input, batch);

  if (manifests.length === 0) {
    console.log('❌ No manifests found');
    return;
  }

  console.log(`\n📄 Found ${manifests.length} manifest(s)`);

  // Generate consumers
  const startTime = Date.now();
  const results = batch
    ? generateEventConsumers(manifests, { typescript, includeTests: tests, includePIIUtil: piiUtil })
    : { results: [generateEventConsumer(manifests[0], { typescript, includeTests: tests, includePIIUtil: piiUtil })], errors: [], summary: { total: 1, successful: 1, failed: 0 } };

  const duration = Date.now() - startTime;

  // Write generated files
  await writeGeneratedFiles(results.results, output, typescript);

  // Print summary
  console.log('\n✅ Generation Complete');
  console.log('─'.repeat(50));
  console.log(`Total: ${results.summary.total}`);
  console.log(`Successful: ${results.summary.successful}`);
  console.log(`Failed: ${results.summary.failed}`);
  console.log(`Duration: ${duration}ms`);
  console.log('─'.repeat(50));

  if (results.errors.length > 0) {
    console.log('\n⚠️ Errors:');
    for (const error of results.errors) {
      console.log(`  - ${error.eventName}: ${error.error}`);
    }
  }

  console.log(`\n📁 Output: ${output}`);
}

/**
 * Load manifests from file or directory
 * @param {string} inputPath - Input file or directory path
 * @param {boolean} batch - Batch mode flag
 * @returns {Promise<object[]>} - Array of manifests
 */
async function loadManifests(inputPath, batch) {
  const stat = await fs.stat(inputPath);

  if (stat.isDirectory()) {
    // Load all JSON files in directory
    const files = await fs.readdir(inputPath);
    const manifests = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(inputPath, file), 'utf-8');
        manifests.push(JSON.parse(content));
      }
    }

    return manifests;
  } else {
    // Load single file
    const content = await fs.readFile(inputPath, 'utf-8');
    return [JSON.parse(content)];
  }
}

/**
 * Write generated files to output directory
 * @param {object[]} results - Generation results
 * @param {string} outputDir - Output directory
 * @param {boolean} typescript - TypeScript flag
 */
async function writeGeneratedFiles(results, outputDir, typescript) {
  const ext = typescript ? '.ts' : '.js';

  // Create output directory
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(path.join(outputDir, 'utils'), { recursive: true });
  await fs.mkdir(path.join(outputDir, 'tests'), { recursive: true });

  // Track if we've written the PII util (only write once)
  let piiUtilWritten = false;

  for (const result of results) {
    const eventName = result.eventName;
    const consumerFile = path.join(outputDir, `${eventName}-consumer${ext}`);

    // Write consumer code
    await fs.writeFile(consumerFile, result.consumer, 'utf-8');
    console.log(`  ✓ ${eventName}-consumer${ext}`);

    // Write test scaffold
    if (result.test) {
      const testFile = path.join(outputDir, 'tests', `${eventName}-consumer.test${ext}`);
      await fs.writeFile(testFile, result.test, 'utf-8');
      console.log(`  ✓ tests/${eventName}-consumer.test${ext}`);
    }

    // Write PII util (only once)
    if (result.piiUtil && !piiUtilWritten) {
      const piiUtilFile = path.join(outputDir, 'utils', `pii-masking${ext}`);
      await fs.writeFile(piiUtilFile, result.piiUtil, 'utf-8');
      console.log(`  ✓ utils/pii-masking${ext}`);
      piiUtilWritten = true;
    }
  }
}

module.exports = { executeGenerateCommand };
