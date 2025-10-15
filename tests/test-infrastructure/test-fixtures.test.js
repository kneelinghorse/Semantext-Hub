/**
 * Test Fixtures Generator Tests
 * Mission B7.6.0 - Test Infrastructure & CI
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { TestFixturesGenerator, generateTestFixtures } from '../../packages/runtime/test-infrastructure/test-fixtures.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('TestFixturesGenerator', () => {
  const testOutputDir = path.join(__dirname, '../fixtures/test-fixtures-output');
  let generator;

  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
    await fs.mkdir(testOutputDir, { recursive: true });

    generator = new TestFixturesGenerator({
      outputDir: testOutputDir,
      verbose: false
    });
  });

  afterEach(async () => {
    // Clean up
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const gen = new TestFixturesGenerator();
      expect(gen.outputDir).toBeDefined();
      expect(gen.verbose).toBe(false);
    });

    it('should create instance with custom options', () => {
      const gen = new TestFixturesGenerator({
        outputDir: '/custom/path',
        verbose: true
      });
      expect(gen.outputDir).toBe('/custom/path');
      expect(gen.verbose).toBe(true);
    });
  });

  describe('generateAllFixtures', () => {
    it('should generate all fixture categories', async () => {
      const fixtures = await generator.generateAllFixtures();

      expect(fixtures).toBeDefined();
      expect(typeof fixtures).toBe('object');
      expect(fixtures.openapi).toBeDefined();
      expect(fixtures.asyncapi).toBeDefined();
      expect(fixtures.manifest).toBeDefined();
      expect(fixtures.workflow).toBeDefined();
      expect(fixtures.agent).toBeDefined();
      expect(fixtures.data).toBeDefined();
      expect(fixtures.event).toBeDefined();
      expect(fixtures.semantic).toBeDefined();
    });

    it('should write fixtures to disk', async () => {
      await generator.generateAllFixtures();

      // Check that files were created
      const openapiDir = path.join(testOutputDir, 'openapi');
      const files = await fs.readdir(openapiDir);
      expect(files).toContain('minimal.json');
      expect(files).toContain('complex.json');
      expect(files).toContain('invalid.json');
    });
  });

  describe('generateOpenAPIFixtures', () => {
    it('should generate valid OpenAPI fixtures', async () => {
      const fixtures = await generator.generateOpenAPIFixtures();

      expect(fixtures.minimal).toBeDefined();
      expect(fixtures.minimal.openapi).toBe('3.0.0');
      expect(fixtures.minimal.info).toBeDefined();
      expect(fixtures.minimal.info.title).toBe('Test API');
      expect(fixtures.minimal.paths).toBeDefined();

      expect(fixtures.complex).toBeDefined();
      expect(fixtures.complex.openapi).toBe('3.0.0');
      expect(fixtures.complex.servers).toBeDefined();
      expect(fixtures.complex.components).toBeDefined();

      expect(fixtures.invalid).toBeDefined();
      expect(fixtures.invalid.info.version).toBe('invalid-version');
    });
  });

  describe('generateAsyncAPIFixtures', () => {
    it('should generate valid AsyncAPI fixtures', async () => {
      const fixtures = await generator.generateAsyncAPIFixtures();

      expect(fixtures.minimal).toBeDefined();
      expect(fixtures.minimal.asyncapi).toBe('2.6.0');
      expect(fixtures.minimal.info).toBeDefined();
      expect(fixtures.minimal.channels).toBeDefined();

      expect(fixtures.kafka).toBeDefined();
      expect(fixtures.kafka.servers).toBeDefined();
      expect(fixtures.kafka.servers.production).toBeDefined();
      expect(fixtures.kafka.servers.production.protocol).toBe('kafka');
    });
  });

  describe('generateManifestFixtures', () => {
    it('should generate valid manifest fixtures', async () => {
      const fixtures = await generator.generateManifestFixtures();

      expect(fixtures.api).toBeDefined();
      expect(fixtures.api.apiVersion).toBe('protocol.ossp-agi.dev/v1');
      expect(fixtures.api.kind).toBe('APIProtocol');
      expect(fixtures.api.metadata).toBeDefined();
      expect(fixtures.api.spec).toBeDefined();

      expect(fixtures.data).toBeDefined();
      expect(fixtures.data.kind).toBe('DataProtocol');

      expect(fixtures.event).toBeDefined();
      expect(fixtures.event.kind).toBe('EventProtocol');
    });
  });

  describe('generateWorkflowFixtures', () => {
    it('should generate valid workflow fixtures', async () => {
      const fixtures = await generator.generateWorkflowFixtures();

      expect(fixtures.simple).toBeDefined();
      expect(fixtures.simple.workflowId).toBe('test-workflow');
      expect(fixtures.simple.steps).toBeDefined();
      expect(Array.isArray(fixtures.simple.steps)).toBe(true);

      expect(fixtures.complex).toBeDefined();
      expect(fixtures.complex.steps.length).toBeGreaterThan(1);
    });
  });

  describe('generateAgentFixtures', () => {
    it('should generate valid agent fixtures', async () => {
      const fixtures = await generator.generateAgentFixtures();

      expect(fixtures.basic).toBeDefined();
      expect(fixtures.basic.agent).toBeDefined();
      expect(fixtures.basic.agent.id).toBe('test-agent');
      expect(fixtures.basic.capabilities).toBeDefined();

      expect(fixtures.advanced).toBeDefined();
      expect(fixtures.advanced.capabilities.tools.length).toBeGreaterThan(1);
      expect(fixtures.advanced.relationships).toBeDefined();
    });
  });
});

describe('generateTestFixtures function', () => {
  it('should generate fixtures using standalone function', async () => {
    const fixtures = await generateTestFixtures({
      outputDir: path.join(__dirname, '../fixtures/test-fixtures-function'),
      verbose: false
    });

    expect(fixtures).toBeDefined();
    expect(fixtures.openapi).toBeDefined();
    expect(fixtures.asyncapi).toBeDefined();
    expect(fixtures.manifest).toBeDefined();
  });
});
