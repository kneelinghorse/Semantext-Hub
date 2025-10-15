/**
 * Contract Testing Runner
 * Validates protocol manifests against their specifications
 * Mission B7.6.0 - Test Infrastructure & CI
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Contract Testing Runner
 * Validates protocol contracts against their specifications
 */
export class ContractTester {
  constructor(options = {}) {
    this.fixturesDir = options.fixturesDir || path.join(__dirname, '../tests/fixtures/generated');
    this.verbose = options.verbose || false;
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);
    
    // Load protocol schemas
    this.schemas = new Map();
    this.loadSchemas();
  }

  /**
   * Load protocol schemas
   */
  loadSchemas() {
    // OpenAPI schema
    this.schemas.set('openapi', {
      type: 'object',
      required: ['openapi', 'info', 'paths'],
      properties: {
        openapi: { type: 'string', pattern: '^3\\.0\\.' },
        info: {
          type: 'object',
          required: ['title', 'version'],
          properties: {
            title: { type: 'string' },
            version: { type: 'string' },
            description: { type: 'string' }
          }
        },
        paths: {
          type: 'object',
          patternProperties: {
            '^/': {
              type: 'object',
              patternProperties: {
                '^(get|post|put|delete|patch)$': {
                  type: 'object',
                  properties: {
                    summary: { type: 'string' },
                    responses: { type: 'object' }
                  }
                }
              }
            }
          }
        }
      }
    });

    // AsyncAPI schema
    this.schemas.set('asyncapi', {
      type: 'object',
      required: ['asyncapi', 'info', 'channels'],
      properties: {
        asyncapi: { type: 'string', pattern: '^2\\.' },
        info: {
          type: 'object',
          required: ['title', 'version'],
          properties: {
            title: { type: 'string' },
            version: { type: 'string' },
            description: { type: 'string' }
          }
        },
        channels: {
          type: 'object',
          patternProperties: {
            '^[a-zA-Z0-9._-]+$': {
              type: 'object',
              properties: {
                publish: { type: 'object' },
                subscribe: { type: 'object' }
              }
            }
          }
        }
      }
    });

    // Protocol manifest schema
    this.schemas.set('manifest', {
      type: 'object',
      required: ['apiVersion', 'kind', 'metadata', 'spec'],
      properties: {
        apiVersion: { type: 'string' },
        kind: { 
          type: 'string',
          enum: ['APIProtocol', 'DataProtocol', 'EventProtocol', 'SemanticProtocol']
        },
        metadata: {
          type: 'object',
          required: ['name', 'version'],
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
            description: { type: 'string' }
          }
        },
        spec: { type: 'object' }
      }
    });

    // Workflow schema
    this.schemas.set('workflow', {
      type: 'object',
      required: ['workflowId', 'name', 'version', 'steps'],
      properties: {
        workflowId: { type: 'string' },
        name: { type: 'string' },
        version: { type: 'string' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            required: ['stepId', 'type'],
            properties: {
              stepId: { type: 'string' },
              type: { 
                type: 'string',
                enum: ['task', 'validation', 'notification', 'condition']
              }
            }
          }
        }
      }
    });

    // Agent schema
    this.schemas.set('agent', {
      type: 'object',
      required: ['agent'],
      properties: {
        agent: {
          type: 'object',
          required: ['id', 'name', 'version'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            version: { type: 'string' },
            description: { type: 'string' }
          }
        },
        capabilities: {
          type: 'object',
          properties: {
            tools: {
              type: 'array',
              items: {
                type: 'object',
                required: ['name', 'description'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' }
                }
              }
            }
          }
        },
        relationships: {
          type: 'object',
          patternProperties: {
            '^[a-zA-Z]+$': {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    });

    // Data schema
    this.schemas.set('data', {
      type: 'object',
      properties: {
        type: { type: 'string' },
        properties: {
          type: 'object',
          patternProperties: {
            '^[a-zA-Z][a-zA-Z0-9_]*$': {
              type: 'object',
              properties: {
                type: { type: 'string' },
                format: { type: 'string' }
              }
            }
          }
        },
        required: {
          type: 'array',
          items: { type: 'string' }
        },
        id: { type: 'string' },
        name: { type: 'string' },
        value: { type: 'number' },
        metadata: {
          type: 'object',
          properties: {
            created: { type: 'string' },
            updated: { type: 'string' }
          }
        }
      }
    });

    // Event schema
    this.schemas.set('event', {
      type: 'object',
      required: ['eventType', 'payload'],
      properties: {
        eventType: { type: 'string' },
        payload: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            orderId: { type: 'string' },
            customerId: { type: 'string' },
            timestamp: { type: 'string' },
            message: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  productId: { type: 'string' },
                  quantity: { type: 'number' }
                }
              }
            },
            total: { type: 'number' }
          }
        },
        metadata: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            version: { type: 'string' },
            correlationId: { type: 'string' }
          }
        }
      }
    });

    // Semantic schema
    this.schemas.set('semantic', {
      type: 'object',
      properties: {
        '@context': {
          type: 'object',
          patternProperties: {
            '^@': { type: 'string' },
            '^[a-zA-Z][a-zA-Z0-9_]*$': { type: 'string' }
          }
        },
        '@type': { type: 'string' },
        '@vocab': { type: 'string' },
        terms: {
          type: 'object',
          patternProperties: {
            '^[a-zA-Z][a-zA-Z0-9_]*$': {
              type: 'object',
              properties: {
                definition: { type: 'string' },
                type: { type: 'string' }
              }
            }
          }
        },
        'ossp:protocol': {
          type: 'object',
          properties: {
            '@type': { type: 'string' },
            name: { type: 'string' },
            version: { type: 'string' }
          }
        }
      }
    });
  }

  /**
   * Run contract tests for all fixtures
   */
  async runContractTests() {
    const results = {
      total: 0,
      passed: 0,
      failed: 0,
      errors: []
    };

    try {
      const fixtures = await this.loadFixtures();
      
      for (const [category, categoryFixtures] of Object.entries(fixtures)) {
        const categoryResults = await this.testCategory(category, categoryFixtures);
        results.total += categoryResults.total;
        results.passed += categoryResults.passed;
        results.failed += categoryResults.failed;
        results.errors.push(...categoryResults.errors);
      }
    } catch (error) {
      results.errors.push({
        category: 'system',
        error: error.message,
        stack: error.stack
      });
    }

    return results;
  }

  /**
   * Test a specific category of fixtures
   */
  async testCategory(category, fixtures) {
    const results = {
      total: 0,
      passed: 0,
      failed: 0,
      errors: []
    };

    for (const [name, fixture] of Object.entries(fixtures)) {
      results.total++;
      
      try {
        const isValid = await this.validateFixture(category, name, fixture);
        if (isValid) {
          results.passed++;
          if (this.verbose) {
            console.log(`✅ ${category}/${name}: PASSED`);
          }
        } else {
          results.failed++;
          results.errors.push({
            category,
            fixture: name,
            error: 'Validation failed'
          });
          if (this.verbose) {
            console.log(`❌ ${category}/${name}: FAILED`);
          }
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          category,
          fixture: name,
          error: error.message,
          stack: error.stack
        });
        if (this.verbose) {
          console.log(`❌ ${category}/${name}: ERROR - ${error.message}`);
        }
      }
    }

    return results;
  }

  /**
   * Validate a single fixture
   */
  async validateFixture(category, name, fixture) {
    // Skip invalid fixtures (they should fail validation)
    if (name === 'invalid') {
      return false;
    }

    const schema = this.schemas.get(category);
    if (!schema) {
      throw new Error(`No schema found for category: ${category}`);
    }

    const validate = this.ajv.compile(schema);
    const isValid = validate(fixture);

    if (!isValid && this.verbose) {
      console.log(`Validation errors for ${category}/${name}:`, validate.errors);
    }

    return isValid;
  }

  /**
   * Load fixtures from disk
   */
  async loadFixtures() {
    const fixtures = {};

    try {
      const categories = await fs.readdir(this.fixturesDir);
      
      for (const category of categories) {
        const categoryPath = path.join(this.fixturesDir, category);
        const stat = await fs.stat(categoryPath);
        
        if (stat.isDirectory()) {
          fixtures[category] = {};
          const files = await fs.readdir(categoryPath);
          
          for (const file of files) {
            if (file.endsWith('.json')) {
              const filePath = path.join(categoryPath, file);
              const content = await fs.readFile(filePath, 'utf-8');
              const name = path.basename(file, '.json');
              fixtures[category][name] = JSON.parse(content);
            }
          }
        }
      }
    } catch (error) {
      if (this.verbose) {
        console.log(`Warning: Could not load fixtures from ${this.fixturesDir}: ${error.message}`);
      }
    }

    return fixtures;
  }

  /**
   * Test specific protocol manifest
   */
  async testProtocolManifest(manifestPath) {
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content);
      
      const schema = this.schemas.get('manifest');
      const validate = this.ajv.compile(schema);
      const isValid = validate(manifest);

      return {
        valid: isValid,
        errors: validate.errors || [],
        manifest
      };
    } catch (error) {
      return {
        valid: false,
        errors: [{ message: error.message }],
        manifest: null
      };
    }
  }

  /**
   * Test OpenAPI specification
   */
  async testOpenAPISpec(specPath) {
    try {
      const content = await fs.readFile(specPath, 'utf-8');
      const spec = JSON.parse(content);
      
      const schema = this.schemas.get('openapi');
      const validate = this.ajv.compile(schema);
      const isValid = validate(spec);

      return {
        valid: isValid,
        errors: validate.errors || [],
        spec
      };
    } catch (error) {
      return {
        valid: false,
        errors: [{ message: error.message }],
        spec: null
      };
    }
  }

  /**
   * Test AsyncAPI specification
   */
  async testAsyncAPISpec(specPath) {
    try {
      const content = await fs.readFile(specPath, 'utf-8');
      const spec = JSON.parse(content);
      
      const schema = this.schemas.get('asyncapi');
      const validate = this.ajv.compile(schema);
      const isValid = validate(spec);

      return {
        valid: isValid,
        errors: validate.errors || [],
        spec
      };
    } catch (error) {
      return {
        valid: false,
        errors: [{ message: error.message }],
        spec: null
      };
    }
  }
}

/**
 * Run contract tests
 */
export async function runContractTests(options = {}) {
  const tester = new ContractTester(options);
  return await tester.runContractTests();
}
