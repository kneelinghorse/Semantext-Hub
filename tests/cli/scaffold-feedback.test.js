/**
 * Scaffold Feedback Integration Tests
 * Tests for FeedbackAggregator integration, validation, hints, and progress tracking
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { TemplateEngine } from '../../packages/runtime/generators/scaffold/engine.js';
import { ProtocolScaffolder } from '../../packages/runtime/generators/scaffold/protocol-scaffolder.js';
import { FeedbackAggregator, CommonHints } from '../../packages/runtime/feedback/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Scaffold Feedback Integration', () => {
  const testOutputDir = path.join(__dirname, '../fixtures/test-scaffolds-feedback');
  let templateDir;
  let engine;
  let feedback;
  let scaffolder;

  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
    await fs.mkdir(testOutputDir, { recursive: true });

    // Initialize components
    templateDir = path.join(__dirname, '../../templates');
    engine = new TemplateEngine(templateDir);
    feedback = new FeedbackAggregator({
      serviceName: 'scaffold-test',
      verbose: false
    });
    scaffolder = new ProtocolScaffolder(engine, {
      outputDir: testOutputDir,
      feedback,
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

  describe('Configuration Validation with Feedback', () => {
    it('should emit validation hint when validating config', () => {
      const validation = scaffolder.validateConfig('api', {
        name: 'TestAPI',
        version: '1.0.0'
      }, {
        emitHints: true
      });

      expect(validation.valid).toBe(true);
      expect(validation.correlationId).toBeDefined();

      const hints = feedback.getHints();
      const validationHint = hints.find(h => h.code === 'SCAFFOLD_VALIDATION');
      expect(validationHint).toBeDefined();
    });

    it('should emit error and hint for invalid name format', () => {
      const validation = scaffolder.validateConfig('api', {
        name: 'Invalid Name!',
        version: '1.0.0'
      }, {
        emitHints: true,
        emitErrors: false // We'll check returned errors instead
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Name must contain only alphanumeric characters, hyphens, and underscores');
      expect(validation.hints.some(h => h.code === 'SCAFFOLD_NAME_FORMAT')).toBe(true);
      expect(validation.suggestions.length).toBeGreaterThan(0);
    });

    it('should emit error and hint for invalid version format', () => {
      const validation = scaffolder.validateConfig('api', {
        name: 'TestAPI',
        version: 'invalid-version'
      }, {
        emitHints: true,
        emitErrors: false
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Version must follow semver format (e.g., 1.0.0)');
      expect(validation.hints.some(h => h.code === 'SCAFFOLD_VERSION_FORMAT')).toBe(true);
      expect(validation.suggestions.length).toBeGreaterThan(0);
    });

    it('should emit error for invalid protocol type', () => {
      const validation = scaffolder.validateConfig('invalid-type', {
        name: 'TestAPI',
        version: '1.0.0'
      }, {
        emitErrors: true
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.suggestions.length).toBeGreaterThan(0);

      const errors = feedback.getErrors();
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should provide suggestions for all validation errors', () => {
      const validation = scaffolder.validateConfig('invalid-type', {
        name: 'Invalid Name!',
        version: 'bad-version'
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.suggestions.length).toBeGreaterThan(0);
      expect(validation.suggestions.some(s => s.includes('Valid types'))).toBe(true);
    });
  });

  describe('Manifest Validation with Feedback', () => {
    it('should validate API manifest structure', () => {
      const manifest = {
        name: 'test-api',
        version: '1.0.0',
        protocol: {
          type: 'api',
          baseUrl: 'https://api.example.com',
          endpoints: [{ path: '/test', method: 'GET' }]
        }
      };

      const validation = scaffolder.validateManifest(manifest, 'api', {
        emitErrors: false,
        emitHints: false
      });

      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    it('should detect missing required manifest fields', () => {
      const manifest = {
        version: '1.0.0'
        // Missing name and protocol
      };

      const validation = scaffolder.validateManifest(manifest, 'api', {
        emitErrors: true
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Manifest missing required field: name');
      expect(validation.errors).toContain('Manifest missing required field: protocol');
    });

    it('should emit warnings for incomplete API protocol', () => {
      const manifest = {
        name: 'test-api',
        version: '1.0.0',
        protocol: {
          type: 'api'
          // Missing baseUrl and endpoints
        }
      };

      const validation = scaffolder.validateManifest(manifest, 'api', {
        emitHints: true
      });

      expect(validation.valid).toBe(true); // Warnings don't make it invalid
      expect(validation.warnings.length).toBeGreaterThan(0);
      expect(validation.warnings.some(w => w.includes('baseUrl'))).toBe(true);
    });

    it('should validate data protocol specifics', () => {
      const manifest = {
        name: 'test-data',
        version: '1.0.0',
        protocol: {
          type: 'data'
          // Missing format
        }
      };

      const validation = scaffolder.validateManifest(manifest, 'data', {
        emitHints: false
      });

      expect(validation.valid).toBe(true);
      expect(validation.warnings.some(w => w.includes('format'))).toBe(true);
    });

    it('should validate event protocol specifics', () => {
      const manifest = {
        name: 'test-event',
        version: '1.0.0',
        protocol: {
          type: 'event'
          // Missing transport and events
        }
      };

      const validation = scaffolder.validateManifest(manifest, 'event');

      expect(validation.valid).toBe(true);
      expect(validation.warnings.some(w => w.includes('transport'))).toBe(true);
      expect(validation.warnings.some(w => w.includes('events'))).toBe(true);
    });
  });

  describe('Progress Tracking', () => {
    it('should track progress during manifest generation', async () => {
      const result = await scaffolder.generateManifest('api', {
        name: 'test-api',
        version: '1.0.0'
      });

      expect(result.correlationId).toBeDefined();
      expect(result.validation).toBeDefined();

      // Check that progress tracker was used
      const summary = feedback.getSummary();
      expect(summary.progress.completed).toBeGreaterThan(0);
    });

    it('should emit progress events for multi-step generation', async () => {
      feedback.verbose = true; // Enable verbose for detailed tracking

      const result = await scaffolder.generateManifest('api', {
        name: 'test-api',
        version: '1.0.0',
        emitHints: true
      });

      expect(result.correlationId).toBeDefined();

      const trace = feedback.getTrace(result.correlationId);
      expect(trace).toBeDefined();
      expect(trace.progress).toBeDefined();
    });

    it('should complete tracker on successful generation', async () => {
      const result = await scaffolder.generateManifest('api', {
        name: 'test-api',
        version: '1.0.0'
      });

      const trace = feedback.getTrace(result.correlationId);
      expect(trace.progress).toBeDefined();
      expect(trace.progress.status).toBe('COMPLETED');
    });

    it('should fail tracker on generation error', async () => {
      // Force an error by using invalid template
      try {
        await scaffolder.generateManifest('invalid-type', {
          name: 'test'
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
        const errors = feedback.getErrors();
        expect(errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Correlation IDs and Tracing', () => {
    it('should generate unique correlation IDs', async () => {
      const result1 = await scaffolder.generateManifest('api', {
        name: 'test-api-1'
      });

      const result2 = await scaffolder.generateManifest('api', {
        name: 'test-api-2'
      });

      expect(result1.correlationId).toBeDefined();
      expect(result2.correlationId).toBeDefined();
      expect(result1.correlationId).not.toBe(result2.correlationId);
    });

    it('should use provided correlation ID', async () => {
      const customCorrelationId = 'test-correlation-123';

      const result = await scaffolder.generateManifest('api', {
        name: 'test-api',
        correlationId: customCorrelationId
      });

      expect(result.correlationId).toBe(customCorrelationId);
    });

    it('should trace all feedback for correlation ID', async () => {
      const result = await scaffolder.generateManifest('api', {
        name: 'test-api',
        emitHints: true
      });

      const trace = feedback.getTrace(result.correlationId);
      expect(trace.correlationId).toBe(result.correlationId);
      expect(trace.hints.length).toBeGreaterThan(0);
      expect(trace.progress).toBeDefined();
    });

    it('should track progress across multi-file generation (manifest/importer/tests)', async () => {
      const results = await scaffolder.generateProtocol('api', {
        name: 'multi-file',
        includeImporter: true,
        includeTests: true
      });

      // Use manifest correlationId for trace association
      const correlationId = results.manifest.correlationId;
      const trace = feedback.getTrace(correlationId);
      expect(trace).toBeDefined();
      // There should be at least one tracker for the package-level generation
      expect(trace.progress).toBeDefined();
      expect(['COMPLETED','COMPLETED'.toString()].includes(trace.progress.status)).toBe(true);
    });
  });

  describe('Feedback Summary', () => {
    it('should aggregate feedback across multiple operations', async () => {
      // Perform multiple operations
      await scaffolder.generateManifest('api', {
        name: 'test-api-1',
        emitHints: true
      });

      await scaffolder.generateManifest('data', {
        name: 'test-data-1',
        emitHints: true
      });

      const summary = feedback.getSummary();
      expect(summary.hints.total).toBeGreaterThan(0);
      expect(summary.progress.completed).toBeGreaterThan(0);
    });

    it('should categorize feedback by severity', async () => {
      // Trigger validation errors
      scaffolder.validateConfig('invalid-type', {
        name: 'Invalid Name!',
        version: 'bad-version'
      }, {
        emitHints: true,
        emitErrors: true
      });

      const summary = feedback.getSummary();
      expect(summary.errors.total).toBeGreaterThan(0);
      expect(summary.hints.total).toBeGreaterThan(0);
    });
  });

  describe('CommonHints Integration', () => {
    it('should use SCAFFOLD_VALIDATION hint', () => {
      scaffolder.validateConfig('api', {
        name: 'test-api',
        version: '1.0.0'
      }, {
        emitHints: true
      });

      const hints = feedback.getHints({ code: 'SCAFFOLD_VALIDATION' });
      expect(hints.length).toBeGreaterThan(0);
      expect(hints[0].code).toBe('SCAFFOLD_VALIDATION');
    });

    it('should use SCAFFOLD_NAME_FORMAT hint for invalid names', () => {
      scaffolder.validateConfig('api', {
        name: 'Invalid Name!',
        version: '1.0.0'
      }, {
        emitHints: true
      });

      const hints = feedback.getHints({ code: 'SCAFFOLD_NAME_FORMAT' });
      expect(hints.length).toBeGreaterThan(0);
    });

    it('should use SCAFFOLD_VERSION_FORMAT hint for invalid versions', () => {
      scaffolder.validateConfig('api', {
        name: 'test-api',
        version: 'bad-version'
      }, {
        emitHints: true
      });

      const hints = feedback.getHints({ code: 'SCAFFOLD_VERSION_FORMAT' });
      expect(hints.length).toBeGreaterThan(0);
    });

    it('should have proper hint structure from CommonHints', () => {
      expect(CommonHints.SCAFFOLD_VALIDATION).toBeDefined();
      expect(CommonHints.SCAFFOLD_VALIDATION.code).toBe('SCAFFOLD_VALIDATION');
      expect(CommonHints.SCAFFOLD_VALIDATION.message).toBeDefined();
      expect(CommonHints.SCAFFOLD_VALIDATION.severity).toBeDefined();

      expect(CommonHints.SCAFFOLD_NAME_FORMAT).toBeDefined();
      expect(CommonHints.SCAFFOLD_VERSION_FORMAT).toBeDefined();
      expect(CommonHints.SCAFFOLD_FILE_EXISTS).toBeDefined();
      expect(CommonHints.SCAFFOLD_PREVIEW).toBeDefined();
    });
  });

  describe('Performance Targets', () => {
    it('should complete validation within performance budget', () => {
      const start = Date.now();

      scaffolder.validateConfig('api', {
        name: 'test-api',
        version: '1.0.0'
      });

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100); // <100ms target
    });

    it('should complete manifest generation within performance budget', async () => {
      const start = Date.now();

      await scaffolder.generateManifest('api', {
        name: 'test-api',
        version: '1.0.0'
      });

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(500); // Reasonable target for generation + validation
    });
  });
});
