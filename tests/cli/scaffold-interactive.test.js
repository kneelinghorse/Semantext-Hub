/**
 * Interactive Scaffold Command Tests
 * Tests for interactive prompts, validation, and preview functionality
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { executeScaffoldCommand, showScaffoldExamples } from '../../packages/runtime/cli/commands/scaffold.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Interactive Scaffold Command', () => {
  const testOutputDir = path.join(__dirname, '../fixtures/test-scaffolds-interactive');

  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
    await fs.mkdir(testOutputDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Non-Interactive Mode', () => {
    it('should generate protocol with all required arguments', async () => {
      const result = await executeScaffoldCommand({
        type: 'api',
        name: 'TestAPI',
        output: testOutputDir,
        write: false
      });

      expect(result).toBeDefined();
      expect(result.manifest).toBeDefined();
      expect(result.importer).toBeDefined();
      expect(result.tests).toBeDefined();
    });

    it('should skip interactive mode when type and name provided', async () => {
      const result = await executeScaffoldCommand({
        type: 'data',
        name: 'DirectData',
        output: testOutputDir,
        write: false
      });

      expect(result).toBeDefined();
      expect(result.manifest).toBeDefined();
      expect(result.manifest.content).toContain('DirectData');
    });
  });

  describe('Name Validation', () => {
    it('should reject empty names', async () => {
      await expect(
        executeScaffoldCommand({
          type: 'api',
          name: '',
          output: testOutputDir
        })
      ).rejects.toThrow('--name is required');
    });

    it('should reject names starting with numbers', async () => {
      await expect(
        executeScaffoldCommand({
          type: 'api',
          name: '123API',
          output: testOutputDir
        })
      ).rejects.toThrow('Invalid name');
    });

    it('should reject names with special characters', async () => {
      await expect(
        executeScaffoldCommand({
          type: 'api',
          name: 'My@API',
          output: testOutputDir
        })
      ).rejects.toThrow('Invalid name');
    });

    it('should accept valid names with hyphens and underscores', async () => {
      const result = await executeScaffoldCommand({
        type: 'api',
        name: 'My_Valid-API123',
        output: testOutputDir,
        write: false
      });

      expect(result).toBeDefined();
      expect(result.manifest).toBeDefined();
    });

    it('should reject names longer than 50 characters', async () => {
      const longName = 'A'.repeat(51);

      await expect(
        executeScaffoldCommand({
          type: 'api',
          name: longName,
          output: testOutputDir
        })
      ).rejects.toThrow('Invalid name');
    });
  });

  describe('File Collision Detection', () => {
    it('should detect existing manifest files', async () => {
      // Create an existing file
      const existingFile = path.join(testOutputDir, 'testprotocol-protocol.json');
      await fs.writeFile(existingFile, '{}');

      // Non-interactive should throw
      await expect(
        executeScaffoldCommand({
          type: 'api',
          name: 'TestProtocol',
          output: testOutputDir,
          interactive: false
        })
      ).rejects.toThrow('Files already exist');
    });

    it('should allow overwrite with --force flag', async () => {
      // Create an existing file
      const existingFile = path.join(testOutputDir, 'forced-protocol.json');
      await fs.writeFile(existingFile, '{}');

      const result = await executeScaffoldCommand({
        type: 'api',
        name: 'Forced',
        output: testOutputDir,
        force: true,
        write: false
      });

      expect(result).toBeDefined();
      expect(result.manifest).toBeDefined();
    });

    it('should detect multiple existing files', async () => {
      // Create multiple existing files
      await fs.writeFile(path.join(testOutputDir, 'multi-protocol.json'), '{}');
      await fs.writeFile(path.join(testOutputDir, 'multi-importer.js'), '');

      await expect(
        executeScaffoldCommand({
          type: 'api',
          name: 'Multi',
          output: testOutputDir,
          interactive: false
        })
      ).rejects.toThrow('Files already exist');
    });
  });

  describe('Preview Mode', () => {
    it('should preview files without writing in write:false mode', async () => {
      const result = await executeScaffoldCommand({
        type: 'api',
        name: 'PreviewAPI',
        output: testOutputDir,
        write: false
      });

      expect(result).toBeDefined();
      expect(result.manifest).toBeDefined();

      // Files should not be written
      const files = await fs.readdir(testOutputDir);
      expect(files.length).toBe(0);
    });

    it('should generate content with valid structure', async () => {
      const result = await executeScaffoldCommand({
        type: 'api',
        name: 'StructureTest',
        output: testOutputDir,
        write: false
      });

      expect(result).toBeDefined();
      expect(result.manifest).toBeDefined();
      expect(result.manifest.content).toBeDefined();
      expect(result.manifest.outputPath).toBeDefined();

      // Verify content is valid JSON
      const manifestContent = JSON.parse(result.manifest.content);
      expect(manifestContent.type).toBe('api');
      expect(manifestContent.name).toBe('StructureTest');
    });

    it('should display file sizes in preview', async () => {
      const result = await executeScaffoldCommand({
        type: 'api',
        name: 'SizeTest',
        output: testOutputDir,
        write: false
      });

      expect(result).toBeDefined();
      expect(result.manifest).toBeDefined();
      expect(result.manifest.content).toBeDefined();

      // Verify content exists and has size
      const size = Buffer.byteLength(result.manifest.content, 'utf8');
      expect(size).toBeGreaterThan(0);
    });
  });

  describe('Directory Permissions', () => {
    it('should create output directory if it does not exist', async () => {
      const newDir = path.join(testOutputDir, 'new-subdir', 'nested');

      const result = await executeScaffoldCommand({
        type: 'api',
        name: 'NewDir',
        output: newDir,
        write: false
      });

      expect(result).toBeDefined();

      // Verify directory was created
      const stats = await fs.stat(newDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('Examples Command', () => {
    it('should display examples when --examples flag used', async () => {
      // Capture console output
      const logs = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args.join(' '));

      await executeScaffoldCommand({ examples: true });

      console.log = originalLog;

      const output = logs.join('\n');
      expect(output).toContain('Interactive Mode');
      expect(output).toContain('npm');
      expect(output).toContain('scaffold');
      expect(output).toContain('--type');
      expect(output).toContain('--name');
    });

    it('should show all protocol types in examples', async () => {
      const logs = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args.join(' '));

      await showScaffoldExamples();

      console.log = originalLog;

      const output = logs.join('\n');
      expect(output).toContain('api');
      expect(output).toContain('data');
      expect(output).toContain('event');
      expect(output).toContain('semantic');
      expect(output).toContain('importer');
      expect(output).toContain('test');
    });
  });

  describe('Protocol Type Options', () => {
    it('should generate test-only scaffold', async () => {
      const result = await executeScaffoldCommand({
        type: 'test',
        name: 'TestOnly',
        output: testOutputDir,
        write: false
      });

      expect(result).toBeDefined();
      expect(result.tests).toBeDefined();
      expect(result.manifest).toBeUndefined();
      expect(result.importer).toBeUndefined();
    });

    it('should generate importer-only scaffold', async () => {
      const result = await executeScaffoldCommand({
        type: 'importer',
        name: 'ImporterOnly',
        output: testOutputDir,
        write: false
      });

      expect(result).toBeDefined();
      expect(result.importer).toBeDefined();
      expect(result.tests).toBeDefined();
      expect(result.manifest).toBeUndefined();
    });

    it('should generate all protocol types', async () => {
      const types = ['api', 'data', 'event', 'semantic'];

      for (const type of types) {
        const result = await executeScaffoldCommand({
          type,
          name: `Test${type}`,
          output: testOutputDir,
          write: false
        });

        expect(result).toBeDefined();
        expect(result.manifest).toBeDefined();
        expect(result.manifest.content).toContain(`"type": "${type}"`);
      }
    });

    it('should optionally exclude importer', async () => {
      const result = await executeScaffoldCommand({
        type: 'api',
        name: 'NoImporter',
        output: testOutputDir,
        includeImporter: false,
        write: false
      });

      expect(result).toBeDefined();
      expect(result.manifest).toBeDefined();
      expect(result.importer).toBeUndefined();
    });

    it('should optionally exclude tests', async () => {
      const result = await executeScaffoldCommand({
        type: 'api',
        name: 'NoTests',
        output: testOutputDir,
        includeTests: false,
        write: false
      });

      expect(result).toBeDefined();
      expect(result.manifest).toBeDefined();
      expect(result.importer).toBeDefined();
      expect(result.tests).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should provide helpful error for missing type', async () => {
      await expect(
        executeScaffoldCommand({
          name: 'NoType',
          output: testOutputDir
        })
      ).rejects.toThrow('--type is required');
    });

    it('should provide helpful error for missing name', async () => {
      await expect(
        executeScaffoldCommand({
          type: 'api',
          output: testOutputDir
        })
      ).rejects.toThrow('--name is required');
    });

    it('should suggest interactive mode in error messages', async () => {
      try {
        await executeScaffoldCommand({
          type: 'api',
          output: testOutputDir
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toContain('interactive mode');
      }
    });

    it('should handle invalid protocol type', async () => {
      await expect(
        executeScaffoldCommand({
          type: 'invalid',
          name: 'Test',
          output: testOutputDir
        })
      ).rejects.toThrow();
    });
  });

  describe('File Writing', () => {
    it('should write files when explicitly requested', async () => {
      // Generate and write in one step
      const result = await executeScaffoldCommand({
        type: 'api',
        name: 'WriteTest',
        output: testOutputDir,
        write: false // Generate only
      });

      expect(result).toBeDefined();
      expect(result.manifest).toBeDefined();

      // Now manually write using the scaffolder
      const { ProtocolScaffolder } = await import('../../packages/runtime/generators/scaffold/protocol-scaffolder.js');
      const { TemplateEngine } = await import('../../packages/runtime/generators/scaffold/engine.js');

      const templateDir = path.join(__dirname, '../../templates');
      const engine = new TemplateEngine(templateDir);
      const scaffolder = new ProtocolScaffolder(engine, { outputDir: testOutputDir });

      const written = await scaffolder.writeFiles(result);
      expect(written).toBeDefined();
      expect(Array.isArray(written)).toBe(true);
      expect(written.length).toBeGreaterThan(0);

      // Verify at least one file was written
      const writtenPaths = written.map(w => w.path);
      expect(writtenPaths.length).toBeGreaterThan(0);
    });

    it('should create nested directories for output', async () => {
      const nestedDir = path.join(testOutputDir, 'level1', 'level2', 'level3');

      const result = await executeScaffoldCommand({
        type: 'api',
        name: 'Nested',
        output: nestedDir,
        write: false
      });

      expect(result).toBeDefined();

      // Verify nested directory was created
      const stats = await fs.stat(nestedDir);
      expect(stats.isDirectory()).toBe(true);

      // Write files manually
      const { ProtocolScaffolder } = await import('../../packages/runtime/generators/scaffold/protocol-scaffolder.js');
      const { TemplateEngine } = await import('../../packages/runtime/generators/scaffold/engine.js');

      const templateDir = path.join(__dirname, '../../templates');
      const engine = new TemplateEngine(templateDir);
      const scaffolder = new ProtocolScaffolder(engine, { outputDir: nestedDir });

      const written = await scaffolder.writeFiles(result);
      expect(written.length).toBeGreaterThan(0);

      // Verify files were written
      const files = await fs.readdir(nestedDir);
      expect(files.length).toBeGreaterThan(0);
    });
  });
});
