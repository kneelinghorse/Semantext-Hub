/**
 * Protocol Scaffolder
 * Generates protocol manifests, importers, and tests from templates
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { TemplateEngine } from './engine.js';
import { FeedbackAggregator, CommonHints, ErrorCodes, generateTraceId } from '../../feedback/index.js';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export class ProtocolScaffolder {
  /**
   * @param {TemplateEngine} templateEngine - Template engine instance
   * @param {Object} options - Scaffolder options
   */
  constructor(templateEngine, options = {}) {
    this.engine = templateEngine;
    // Default output anchored to app root regardless of cwd
    if (options.outputDir) {
      this.outputDir = options.outputDir;
    } else {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      this.outputDir = path.join(__dirname, '../../artifacts/scaffolds');
    }

    // Initialize feedback aggregator
    this.feedback = options.feedback || new FeedbackAggregator({
      serviceName: 'protocol-scaffolder',
      verbose: options.verbose || false
    });

    // Initialize JSON schema validator for manifest validation
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);
  }

  /**
   * Generate protocol manifest from template
   * @param {string} type - Protocol type (api, data, event, semantic)
   * @param {Object} config - Manifest configuration
   * @returns {Promise<Object>} Generated manifest and metadata
   */
  async generateManifest(type, config = {}) {
    const correlationId = config.correlationId || generateTraceId();
    const tracker = this.feedback.getProgressTracker(`scaffold-manifest-${correlationId}`, {
      totalSteps: 3,
      correlationId
    });

    const validTypes = ['api', 'data', 'event', 'semantic'];
    try {
      if (!validTypes.includes(type)) {
        // Emit error and fail tracker for invalid type
        this.feedback.reportError(ErrorCodes.VALIDATION_FAILED, {
          detail: `Invalid protocol type: ${type}`,
          suggestedFix: `Use one of: ${validTypes.join(', ')}`,
          correlationId
        });
        tracker.fail('Invalid protocol type');
        throw new Error(`Invalid protocol type: ${type}. Must be one of: ${validTypes.join(', ')}`);
      }

      // Optionally emit an informational hint for tracing
      if (config.emitHints) {
        this.feedback.reportHint('MANIFEST_GENERATION', 'Starting manifest generation', {
          severity: 'INFO',
          context: { correlationId, type }
        });
      }
      // Step 1: Prepare variables
      tracker.start('Preparing manifest variables');
      tracker.updateProgress({ currentStep: 1, totalSteps: 3, description: 'Preparing manifest variables' });
      const variables = {
        type,
        name: config.name || `${type}-protocol`,
        version: config.version || '1.0.0',
        description: config.description || `Generated ${type} protocol`,
        timestamp: new Date().toISOString(),
        author: config.author || 'protocol-discover',
        ...this.getTypeSpecificDefaults(type, config)
      };

      // Step 2: Render template
      tracker.updateProgress({ currentStep: 2, description: 'Rendering manifest template' });
      const templateName = `manifest-${type}.json`;
      const content = await this.engine.render(templateName, variables);

      // Parse manifest
      const manifest = JSON.parse(content);

      // Step 3: Validate manifest
      tracker.updateProgress({ currentStep: 3, description: 'Validating manifest structure' });
      const validation = this.validateManifest(manifest, type, {
        correlationId,
        emitErrors: config.emitErrors !== false,
        emitHints: config.emitHints !== false
      });

      const outputPath = path.join(this.outputDir, 'manifests', `${variables.name}.json`);

      tracker.complete();

      return {
        manifest,
        content,
        outputPath,
        variables,
        validation,
        correlationId
      };
    } catch (error) {
      tracker.fail(error.message);
      this.feedback.reportError(ErrorCodes.INTERNAL_ERROR, {
        detail: `Failed to generate manifest: ${error.message}`,
        correlationId
      });
      throw error;
    }
  }

  /**
   * Generate importer skeleton
   * @param {string} protocol - Protocol name
   * @param {Object} config - Importer configuration
   * @returns {Promise<Object>} Generated importer and metadata
   */
  async generateImporter(protocol, config = {}) {
    const className = this.toPascalCase(protocol);
    const filename = this.toKebabCase(protocol);

    const variables = {
      name: config.name || protocol,
      protocol,
      className: `${className}`,
      type: config.type || 'api',
      timestamp: new Date().toISOString()
    };

    const content = await this.engine.render('importer.js', variables);
    const outputPath = path.join(this.outputDir, 'importers', `${filename}-importer.js`);

    return {
      content,
      outputPath,
      variables,
      className: variables.className
    };
  }

  /**
   * Generate test scaffold
   * @param {string} protocol - Protocol or component name
   * @param {Object} config - Test configuration
   * @returns {Promise<Object>} Generated test and metadata
   */
  async generateTests(protocol, config = {}) {
    const className = config.className || this.toPascalCase(protocol);
    const filename = config.filename || this.toKebabCase(protocol);

    const variables = {
      name: config.name || protocol,
      className,
      filename,
      timestamp: new Date().toISOString()
    };

    const content = await this.engine.render('test.js', variables);
    const outputPath = path.join(this.outputDir, 'tests', `${filename}.test.js`);

    return {
      content,
      outputPath,
      variables
    };
  }

  /**
   * Generate complete protocol package
   * @param {string} type - Protocol type
   * @param {Object} config - Configuration
   * @returns {Promise<Object>} All generated files
   */
  async generateProtocol(type, config = {}) {
    const results = {};

    const correlationId = config.correlationId || generateTraceId();
    const totalSteps = 1 + (config.includeImporter !== false ? 1 : 0) + (config.includeTests !== false ? 1 : 0);
    const tracker = this.feedback.getProgressTracker(`scaffold-package-${correlationId}`, {
      totalSteps,
      correlationId
    });

    try {
      // Step 1: Manifest
      tracker.start('Generating manifest');
      tracker.updateProgress({ currentStep: 1, totalSteps, description: 'Generating manifest' });
      const manifestConfig = { ...config, correlationId };
      results.manifest = await this.generateManifest(type, manifestConfig);

      let step = 1;

      // Step 2: Importer
      if (config.includeImporter !== false) {
        step += 1;
        tracker.updateProgress({ currentStep: step, description: 'Generating importer' });
        const protocol = config.name || `${type}-protocol`;
        results.importer = await this.generateImporter(protocol, { type, ...config });
      }

      // Step 3: Tests
      if (config.includeTests !== false) {
        step += 1;
        tracker.updateProgress({ currentStep: step, description: 'Generating tests' });
        const protocol = config.name || `${type}-protocol`;
        results.tests = await this.generateTests(protocol, {
          className: results.importer?.className || this.toPascalCase(protocol),
          filename: this.toKebabCase(protocol) + '-importer'
        });
      }

      tracker.complete();
      return results;
    } catch (err) {
      tracker.fail(err?.message || 'Generation failed');
      throw err;
    }
  }

  /**
   * Write generated content to files
   * @param {Object} results - Results from generate methods
   * @returns {Promise<string[]>} Written file paths
   */
  async writeFiles(results) {
    const written = [];

    for (const [key, result] of Object.entries(results)) {
      if (result.outputPath && result.content) {
        // Ensure directory exists
        await fs.mkdir(path.dirname(result.outputPath), { recursive: true });

        // Write file
        await fs.writeFile(result.outputPath, result.content, 'utf-8');
        written.push(result.outputPath);
      } else if (result.manifest) {
        // Handle manifest object
        await fs.mkdir(path.dirname(result.outputPath), { recursive: true });
        await fs.writeFile(
          result.outputPath,
          JSON.stringify(result.manifest, null, 2),
          'utf-8'
        );
        written.push(result.outputPath);
      }
    }

    return written;
  }

  /**
   * Get type-specific default values
   * @param {string} type - Protocol type
   * @param {Object} config - User config
   * @returns {Object} Default values
   */
  getTypeSpecificDefaults(type, config) {
    const defaults = {
      api: {
        baseUrl: config.baseUrl || 'https://api.example.com',
        authentication: config.authentication || 'bearer',
        endpoint_path: config.endpoint_path || '/v1/resource',
        endpoint_method: config.endpoint_method || 'GET',
        endpoint_description: config.endpoint_description || 'Main API endpoint'
      },
      data: {
        format: config.format || 'json',
        compression: config.compression || 'none'
      },
      event: {
        transport: config.transport || 'websocket',
        event_name: config.event_name || 'data.updated',
        event_description: config.event_description || 'Data update event'
      },
      semantic: {
        vocabulary: config.vocabulary || 'http://schema.org/',
        ontology: config.ontology || 'custom'
      }
    };

    return defaults[type] || {};
  }

  /**
   * Convert string to PascalCase
   * @param {string} str - Input string
   * @returns {string} PascalCase string
   */
  toPascalCase(str) {
    return str
      .replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '')
      .replace(/^(.)/, (_, c) => c.toUpperCase());
  }

  /**
   * Convert string to kebab-case
   * @param {string} str - Input string
   * @returns {string} kebab-case string
   */
  toKebabCase(str) {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }

  /**
   * List available protocol types
   * @returns {string[]} Available types
   */
  getAvailableTypes() {
    return ['api', 'data', 'event', 'semantic'];
  }

  /**
   * Validate generated manifest against protocol schema
   * @param {Object} manifest - Generated manifest
   * @param {string} type - Protocol type
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  validateManifest(manifest, type, options = {}) {
    const errors = [];
    const warnings = [];
    const correlationId = options.correlationId || generateTraceId();

    // Basic structure validation
    if (!manifest.name) {
      errors.push('Manifest missing required field: name');
    }

    if (!manifest.version) {
      errors.push('Manifest missing required field: version');
    }

    if (!manifest.protocol) {
      errors.push('Manifest missing required field: protocol');
    }

    // Type-specific validation (only if protocol object exists)
    if (manifest.protocol) {
      switch (type) {
        case 'api':
          if (!manifest.protocol.baseUrl) {
            warnings.push('API protocol should specify baseUrl');
          }
          if (!manifest.protocol.endpoints || manifest.protocol.endpoints.length === 0) {
            warnings.push('API protocol should define at least one endpoint');
          }
          break;

        case 'data':
          if (!manifest.protocol.format) {
            warnings.push('Data protocol should specify format');
          }
          break;

        case 'event':
          if (!manifest.protocol.transport) {
            warnings.push('Event protocol should specify transport');
          }
        if (!manifest.protocol.events || manifest.protocol.events.length === 0) {
          warnings.push('Event protocol should define at least one event in events');
        }
          break;

        case 'semantic':
          if (!manifest.protocol.vocabulary) {
            warnings.push('Semantic protocol should specify vocabulary');
          }
          break;
      }
    }

    // Emit feedback
    if (errors.length > 0 && options.emitErrors !== false) {
      errors.forEach(error => {
        this.feedback.reportError(ErrorCodes.VALIDATION_FAILED, {
          detail: error,
          suggestedFix: 'Check manifest template or provide missing configuration',
          correlationId
        });
      });
    }

    if (warnings.length > 0 && options.emitHints !== false) {
      warnings.forEach(warning => {
        this.feedback.reportHint('MANIFEST_WARNING', warning, {
          severity: 'WARNING',
          context: { correlationId, type }
        });
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      correlationId
    };
  }

  /**
   * Validate configuration with feedback and hints
   * @param {string} type - Protocol type
   * @param {Object} config - Configuration
   * @param {Object} options - Validation options (correlationId, emitHints)
   * @returns {Object} Validation result with suggestions
   */
  validateConfig(type, config, options = {}) {
    const errors = [];
    const hints = [];
    const suggestions = [];
    const correlationId = options.correlationId || generateTraceId();

    // Always emit validation hint
    if (options.emitHints !== false) {
      this.feedback.reportHint(
        CommonHints.SCAFFOLD_VALIDATION.code,
        CommonHints.SCAFFOLD_VALIDATION.message,
        {
          severity: CommonHints.SCAFFOLD_VALIDATION.severity,
          context: { correlationId, type, configKeys: Object.keys(config) }
        }
      );
    }

    // Validate protocol type
    if (!this.getAvailableTypes().includes(type)) {
      errors.push(`Invalid type: ${type}`);
      suggestions.push(`Valid types: ${this.getAvailableTypes().join(', ')}`);

      if (options.emitErrors !== false) {
        this.feedback.reportError(ErrorCodes.VALIDATION_FAILED, {
          detail: `Invalid protocol type: ${type}`,
          suggestedFix: `Use one of: ${this.getAvailableTypes().join(', ')}`,
          correlationId
        });
      }
    }

    // Validate name format
    if (config.name && !/^[a-zA-Z0-9-_]+$/.test(config.name)) {
      errors.push('Name must contain only alphanumeric characters, hyphens, and underscores');
      hints.push(CommonHints.SCAFFOLD_NAME_FORMAT);
      suggestions.push('Example valid names: my-protocol, api_service, DataFormat123');

      if (options.emitHints !== false) {
        this.feedback.reportHint(
          CommonHints.SCAFFOLD_NAME_FORMAT.code,
          CommonHints.SCAFFOLD_NAME_FORMAT.message,
          {
            severity: 'ERROR',
            context: { correlationId, invalidName: config.name }
          }
        );
      }
    }

    // Validate version format
    if (config.version && !/^\d+\.\d+\.\d+$/.test(config.version)) {
      errors.push('Version must follow semver format (e.g., 1.0.0)');
      hints.push(CommonHints.SCAFFOLD_VERSION_FORMAT);
      suggestions.push('Example valid versions: 1.0.0, 2.1.3, 0.1.0');

      if (options.emitHints !== false) {
        this.feedback.reportHint(
          CommonHints.SCAFFOLD_VERSION_FORMAT.code,
          CommonHints.SCAFFOLD_VERSION_FORMAT.message,
          {
            severity: 'ERROR',
            context: { correlationId, invalidVersion: config.version }
          }
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      hints,
      suggestions,
      correlationId
    };
  }
}

export default ProtocolScaffolder;
