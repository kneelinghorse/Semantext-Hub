#!/usr/bin/env node
/**
 * Test script for scaffold functionality
 */

import { TemplateEngine } from '../generators/scaffold/engine.js';
import { ProtocolScaffolder } from '../generators/scaffold/protocol-scaffolder.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('🏗️  Testing Scaffold System\n');

  // Initialize
  const templateDir = path.join(__dirname, '../templates');
  const outputDir = path.join(__dirname, '../artifacts/scaffolds');
  const engine = new TemplateEngine(templateDir);
  const scaffolder = new ProtocolScaffolder(engine, { outputDir });

  // Test 1: Generate API protocol
  console.log('Test 1: Generating API protocol...');
  const apiResults = await scaffolder.generateProtocol('api', {
    name: 'TestAPI',
    description: 'Test API for scaffold demo',
    baseUrl: 'https://api.test.com',
    includeImporter: true,
    includeTests: true
  });
  console.log('✓ API protocol generated');
  console.log(`  - Manifest: ${path.relative(process.cwd(), apiResults.manifest.outputPath)}`);
  console.log(`  - Importer: ${path.relative(process.cwd(), apiResults.importer.outputPath)}`);
  console.log(`  - Tests: ${path.relative(process.cwd(), apiResults.tests.outputPath)}`);

  // Test 2: Generate Data protocol
  console.log('\nTest 2: Generating Data protocol...');
  const dataResults = await scaffolder.generateProtocol('data', {
    name: 'LogFormat',
    description: 'Log file format',
    format: 'json',
    includeImporter: true,
    includeTests: false
  });
  console.log('✓ Data protocol generated');
  console.log(`  - Manifest: ${path.relative(process.cwd(), dataResults.manifest.outputPath)}`);
  console.log(`  - Importer: ${path.relative(process.cwd(), dataResults.importer.outputPath)}`);

  // Test 3: Write files
  console.log('\nTest 3: Writing files to disk...');
  const writtenApi = await scaffolder.writeFiles(apiResults);
  const writtenData = await scaffolder.writeFiles(dataResults);
  console.log(`✓ Wrote ${writtenApi.length + writtenData.length} files`);

  console.log('\n✅ All tests passed!');
  console.log(`\n📁 Generated files in: ${outputDir}/`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
