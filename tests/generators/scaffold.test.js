/**
 * Tests for Template System & Scaffolding
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { TemplateEngine } from '../../packages/runtime/generators/scaffold/engine.js';
import { ProtocolScaffolder } from '../../packages/runtime/generators/scaffold/protocol-scaffolder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test template directory
const TEST_TEMPLATE_DIR = path.join(__dirname, '../fixtures/templates');
const TEST_OUTPUT_DIR = path.join(__dirname, '../fixtures/output');

describe('TemplateEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new TemplateEngine(path.join(__dirname, '../../templates'));
  });

  afterEach(() => {
    engine.clearCache();
  });

  describe('constructor', () => {
    it('should create instance with template directory', () => {
      expect(engine).toBeInstanceOf(TemplateEngine);
      expect(engine.templateDir).toBeDefined();
      expect(engine.cache).toBeInstanceOf(Map);
    });
  });

  describe('interpolate', () => {
    it('should replace simple variables', () => {
      const template = 'Hello {{name}}!';
      const result = engine.interpolate(template, { name: 'World' });
      expect(result).toBe('Hello World!');
    });

    it('should replace multiple variables', () => {
      const template = '{{greeting}} {{name}}, welcome to {{place}}!';
      const result = engine.interpolate(template, {
        greeting: 'Hello',
        name: 'Alice',
        place: 'Wonderland'
      });
      expect(result).toBe('Hello Alice, welcome to Wonderland!');
    });

    it('should handle missing variables by keeping placeholder', () => {
      const template = 'Hello {{name}}!';
      const result = engine.interpolate(template, {});
      expect(result).toBe('Hello {{name}}!');
    });

    it('should handle null and undefined values', () => {
      const template = 'Value: {{value}}';
      expect(engine.interpolate(template, { value: null })).toBe('Value: ');
      expect(engine.interpolate(template, { value: undefined })).toBe('Value: ');
    });

    it('should convert numbers to strings', () => {
      const template = 'Count: {{count}}';
      const result = engine.interpolate(template, { count: 42 });
      expect(result).toBe('Count: 42');
    });

    it('should stringify objects', () => {
      const template = 'Data: {{data}}';
      const result = engine.interpolate(template, { data: { foo: 'bar' } });
      expect(result).toContain('"foo"');
      expect(result).toContain('"bar"');
    });

    it('should handle variables with underscores', () => {
      const template = '{{my_var}}';
      const result = engine.interpolate(template, { my_var: 'test' });
      expect(result).toBe('test');
    });
  });

  describe('render', () => {
    it('should load and render template', async () => {
      const result = await engine.render('manifest-api.json', {
        type: 'api',
        name: 'TestAPI',
        version: '1.0.0',
        description: 'Test API',
        baseUrl: 'https://test.com',
        authentication: 'bearer',
        endpoint_path: '/test',
        endpoint_method: 'GET',
        endpoint_description: 'Test endpoint',
        timestamp: '2024-01-01T00:00:00.000Z',
        author: 'tester'
      });

      expect(result).toContain('TestAPI');
      expect(result).toContain('https://test.com');
      expect(result).toContain('/test');
    });

    it('should cache templates when useCache=true', async () => {
      await engine.render('manifest-api.json', { name: 'Test' }, true);
      expect(engine.cache.has('manifest-api.json')).toBe(true);
    });

    it('should not cache when useCache=false', async () => {
      await engine.render('manifest-api.json', { name: 'Test' }, false);
      expect(engine.cache.has('manifest-api.json')).toBe(false);
    });

    it('should throw error for non-existent template', async () => {
      await expect(
        engine.render('non-existent.json', {})
      ).rejects.toThrow(/Failed to load template/);
    });
  });

  describe('hasTemplate', () => {
    it('should return true for existing template', async () => {
      const exists = await engine.hasTemplate('manifest-api.json');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent template', async () => {
      const exists = await engine.hasTemplate('non-existent.json');
      expect(exists).toBe(false);
    });
  });

  describe('getTemplates', () => {
    it('should list available templates', async () => {
      const templates = await engine.getTemplates();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
      expect(templates).toContain('manifest-api.json');
    });

    it('should exclude hidden files and README', async () => {
      const templates = await engine.getTemplates();
      expect(templates.every(t => !t.startsWith('.'))).toBe(true);
      expect(templates).not.toContain('README.md');
    });
  });

  describe('renderBatch', () => {
    it('should render multiple templates', async () => {
      const results = await engine.renderBatch([
        { name: 'manifest-api.json', variables: { name: 'API1', type: 'api' } },
        { name: 'manifest-data.json', variables: { name: 'Data1', type: 'data' } }
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('manifest-api.json');
      expect(results[0].content).toContain('API1');
      expect(results[1].name).toBe('manifest-data.json');
      expect(results[1].content).toContain('Data1');
    });
  });

  describe('clearCache', () => {
    it('should clear template cache', async () => {
      await engine.render('manifest-api.json', { name: 'Test' });
      expect(engine.cache.size).toBeGreaterThan(0);

      engine.clearCache();
      expect(engine.cache.size).toBe(0);
    });
  });
});

describe('ProtocolScaffolder', () => {
  let scaffolder;
  let engine;

  beforeEach(() => {
    engine = new TemplateEngine(path.join(__dirname, '../../templates'));
    scaffolder = new ProtocolScaffolder(engine, { outputDir: TEST_OUTPUT_DIR });
  });

  afterEach(async () => {
    // Clean up test output
    try {
      await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    it('should create instance with engine', () => {
      expect(scaffolder).toBeInstanceOf(ProtocolScaffolder);
      expect(scaffolder.engine).toBe(engine);
      expect(scaffolder.outputDir).toBe(TEST_OUTPUT_DIR);
    });

    it('should use default output directory', () => {
      const s = new ProtocolScaffolder(engine);
      // Default outputDir is now an absolute path anchored to app root
      expect(s.outputDir).toContain('artifacts/scaffolds');
      expect(path.isAbsolute(s.outputDir)).toBe(true);
    });
  });

  describe('generateManifest', () => {
    it('should generate API manifest', async () => {
      const result = await scaffolder.generateManifest('api', {
        name: 'TestAPI',
        description: 'Test API'
      });

      expect(result.manifest).toBeDefined();
      expect(result.manifest.type).toBe('api');
      expect(result.manifest.name).toBe('TestAPI');
      expect(result.manifest.protocol.baseUrl).toBeDefined();
      expect(result.outputPath).toContain('TestAPI.json');
    });

    it('should generate data manifest', async () => {
      const result = await scaffolder.generateManifest('data', {
        name: 'LogFormat',
        format: 'csv'
      });

      expect(result.manifest.type).toBe('data');
      expect(result.manifest.name).toBe('LogFormat');
      expect(result.manifest.protocol.format).toBe('csv');
    });

    it('should generate event manifest', async () => {
      const result = await scaffolder.generateManifest('event', {
        name: 'Notifications',
        transport: 'kafka'
      });

      expect(result.manifest.type).toBe('event');
      expect(result.manifest.name).toBe('Notifications');
      expect(result.manifest.protocol.transport).toBe('kafka');
    });

    it('should generate semantic manifest', async () => {
      const result = await scaffolder.generateManifest('semantic', {
        name: 'ProductOntology'
      });

      expect(result.manifest.type).toBe('semantic');
      expect(result.manifest.name).toBe('ProductOntology');
    });

    it('should throw error for invalid type', async () => {
      await expect(
        scaffolder.generateManifest('invalid', {})
      ).rejects.toThrow(/Invalid protocol type/);
    });

    it('should use default values', async () => {
      const result = await scaffolder.generateManifest('api', {});
      expect(result.manifest.name).toMatch(/api-protocol/);
      expect(result.manifest.version).toBe('1.0.0');
    });

    it('should include timestamp and author', async () => {
      const result = await scaffolder.generateManifest('api', { name: 'Test' });
      expect(result.manifest.metadata.created).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(result.manifest.metadata.author).toBe('protocol-discover');
    });
  });

  describe('generateImporter', () => {
    it('should generate importer skeleton', async () => {
      const result = await scaffolder.generateImporter('CustomProtocol', {
        type: 'data'
      });

      expect(result.content).toContain('class CustomProtocolImporter');
      expect(result.content).toContain('extends BaseImporter');
      expect(result.content).toContain('async detect');
      expect(result.content).toContain('async import');
      expect(result.content).toContain('async validate');
      expect(result.outputPath).toContain('custom-protocol-importer.js');
      expect(result.className).toBe('CustomProtocol');
    });

    it('should handle names with hyphens', async () => {
      const result = await scaffolder.generateImporter('my-custom-format');
      expect(result.content).toContain('class MyCustomFormatImporter');
      expect(result.outputPath).toContain('my-custom-format-importer.js');
    });

    it('should handle names with underscores', async () => {
      const result = await scaffolder.generateImporter('my_custom_format');
      expect(result.content).toContain('class MyCustomFormatImporter');
    });
  });

  describe('generateTests', () => {
    it('should generate test scaffold', async () => {
      const result = await scaffolder.generateTests('MyComponent', {
        className: 'MyComponent',
        filename: 'my-component'
      });

      expect(result.content).toContain("describe('MyComponent'");
      expect(result.content).toContain('it(');
      expect(result.content).toContain('expect(');
      expect(result.outputPath).toContain('my-component.test.js');
    });
  });

  describe('generateProtocol', () => {
    it('should generate complete protocol package', async () => {
      const results = await scaffolder.generateProtocol('api', {
        name: 'CompleteAPI',
        includeImporter: true,
        includeTests: true
      });

      expect(results.manifest).toBeDefined();
      expect(results.importer).toBeDefined();
      expect(results.tests).toBeDefined();
    });

    it('should exclude importer when requested', async () => {
      const results = await scaffolder.generateProtocol('api', {
        name: 'NoImporter',
        includeImporter: false
      });

      expect(results.manifest).toBeDefined();
      expect(results.importer).toBeUndefined();
    });

    it('should exclude tests when requested', async () => {
      const results = await scaffolder.generateProtocol('api', {
        name: 'NoTests',
        includeTests: false
      });

      expect(results.manifest).toBeDefined();
      expect(results.tests).toBeUndefined();
    });
  });

  describe('writeFiles', () => {
    it('should write generated files to disk', async () => {
      const results = await scaffolder.generateProtocol('api', {
        name: 'WriteTest',
        includeImporter: false,
        includeTests: false
      });

      const written = await scaffolder.writeFiles(results);
      expect(written.length).toBe(1);

      // Verify file exists
      const fileExists = await fs.access(written[0]).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('should create output directories', async () => {
      const results = await scaffolder.generateProtocol('data', {
        name: 'DirTest'
      });

      await scaffolder.writeFiles(results);

      // Verify directories exist
      const manifestDir = path.join(TEST_OUTPUT_DIR, 'manifests');
      const importerDir = path.join(TEST_OUTPUT_DIR, 'importers');
      const testDir = path.join(TEST_OUTPUT_DIR, 'tests');

      const manifestExists = await fs.access(manifestDir).then(() => true).catch(() => false);
      const importerExists = await fs.access(importerDir).then(() => true).catch(() => false);
      const testExists = await fs.access(testDir).then(() => true).catch(() => false);

      expect(manifestExists).toBe(true);
      expect(importerExists).toBe(true);
      expect(testExists).toBe(true);
    });
  });

  describe('utility methods', () => {
    it('should convert to PascalCase', () => {
      expect(scaffolder.toPascalCase('my-component')).toBe('MyComponent');
      expect(scaffolder.toPascalCase('my_component')).toBe('MyComponent');
      expect(scaffolder.toPascalCase('my component')).toBe('MyComponent');
      expect(scaffolder.toPascalCase('myComponent')).toBe('MyComponent');
    });

    it('should convert to kebab-case', () => {
      expect(scaffolder.toKebabCase('MyComponent')).toBe('my-component');
      expect(scaffolder.toKebabCase('my_component')).toBe('my-component');
      expect(scaffolder.toKebabCase('my component')).toBe('my-component');
      expect(scaffolder.toKebabCase('myComponent')).toBe('my-component');
    });

    it('should list available types', () => {
      const types = scaffolder.getAvailableTypes();
      expect(types).toContain('api');
      expect(types).toContain('data');
      expect(types).toContain('event');
      expect(types).toContain('semantic');
    });
  });

  describe('validateConfig', () => {
    it('should validate correct config', () => {
      const result = scaffolder.validateConfig('api', {
        name: 'ValidName',
        version: '1.0.0'
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid type', () => {
      const result = scaffolder.validateConfig('invalid', {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid type: invalid');
    });

    it('should reject invalid name', () => {
      const result = scaffolder.validateConfig('api', {
        name: 'Invalid Name!'
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Name must contain'))).toBe(true);
    });

    it('should reject invalid version', () => {
      const result = scaffolder.validateConfig('api', {
        version: 'not-semver'
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Version must follow'))).toBe(true);
    });

    it('should allow valid names with hyphens and underscores', () => {
      const result1 = scaffolder.validateConfig('api', { name: 'my-api' });
      const result2 = scaffolder.validateConfig('api', { name: 'my_api' });

      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
    });
  });

  describe('getTypeSpecificDefaults', () => {
    it('should provide API defaults', () => {
      const defaults = scaffolder.getTypeSpecificDefaults('api', {});
      expect(defaults.baseUrl).toBeDefined();
      expect(defaults.authentication).toBeDefined();
      expect(defaults.endpoint_path).toBeDefined();
    });

    it('should provide data defaults', () => {
      const defaults = scaffolder.getTypeSpecificDefaults('data', {});
      expect(defaults.format).toBeDefined();
      expect(defaults.compression).toBeDefined();
    });

    it('should provide event defaults', () => {
      const defaults = scaffolder.getTypeSpecificDefaults('event', {});
      expect(defaults.transport).toBeDefined();
      expect(defaults.event_name).toBeDefined();
    });

    it('should provide semantic defaults', () => {
      const defaults = scaffolder.getTypeSpecificDefaults('semantic', {});
      expect(defaults.vocabulary).toBeDefined();
      expect(defaults.ontology).toBeDefined();
    });

    it('should merge user config with defaults', () => {
      const defaults = scaffolder.getTypeSpecificDefaults('api', {
        baseUrl: 'https://custom.com'
      });
      expect(defaults.baseUrl).toBe('https://custom.com');
    });
  });
});

describe('Integration Tests', () => {
  let engine;
  let scaffolder;

  beforeEach(() => {
    engine = new TemplateEngine(path.join(__dirname, '../../templates'));
    scaffolder = new ProtocolScaffolder(engine, { outputDir: TEST_OUTPUT_DIR });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
    } catch (err) {
      // Ignore
    }
  });

  it('should generate and write complete protocol', async () => {
    const results = await scaffolder.generateProtocol('api', {
      name: 'IntegrationTest',
      description: 'Integration test API',
      baseUrl: 'https://test.com/api'
    });

    const written = await scaffolder.writeFiles(results);
    expect(written.length).toBe(3); // manifest, importer, test

    // Verify all files exist
    for (const file of written) {
      const exists = await fs.access(file).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    }

    // Verify manifest content
    const manifestContent = await fs.readFile(results.manifest.outputPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);
    expect(manifest.name).toBe('IntegrationTest');
    expect(manifest.protocol.baseUrl).toBe('https://test.com/api');
  });

  it('should handle multiple scaffolds in same session', async () => {
    const api = await scaffolder.generateProtocol('api', { name: 'API1' });
    const data = await scaffolder.generateProtocol('data', { name: 'Data1' });

    await scaffolder.writeFiles(api);
    await scaffolder.writeFiles(data);

    const apiManifest = await fs.readFile(api.manifest.outputPath, 'utf-8');
    const dataManifest = await fs.readFile(data.manifest.outputPath, 'utf-8');

    expect(JSON.parse(apiManifest).name).toBe('API1');
    expect(JSON.parse(dataManifest).name).toBe('Data1');
  });
});
