/**
 * Test Fixtures Generator
 * Generates synthetic test data for protocol testing
 * Mission B7.6.0 - Test Infrastructure & CI
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test Fixtures Generator
 * Creates synthetic test data for all protocol types
 */
export class TestFixturesGenerator {
  constructor(options = {}) {
    this.outputDir = options.outputDir || path.join(__dirname, '../tests/fixtures/generated');
    this.verbose = options.verbose || false;
  }

  /**
   * Generate fixtures for all protocol types
   */
  async generateAllFixtures() {
    const fixtures = {
      openapi: await this.generateOpenAPIFixtures(),
      asyncapi: await this.generateAsyncAPIFixtures(),
      manifest: await this.generateManifestFixtures(),
      workflow: await this.generateWorkflowFixtures(),
      agent: await this.generateAgentFixtures(),
      data: await this.generateDataFixtures(),
      event: await this.generateEventFixtures(),
      semantic: await this.generateSemanticFixtures()
    };

    // Write fixtures to disk
    await this.writeFixtures(fixtures);
    
    return fixtures;
  }

  /**
   * Generate OpenAPI test fixtures
   */
  async generateOpenAPIFixtures() {
    return {
      minimal: {
        openapi: '3.0.0',
        info: {
          title: 'Test API',
          version: '1.0.0',
          description: 'Minimal test API'
        },
        paths: {
          '/test': {
            get: {
              summary: 'Test endpoint',
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          message: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      complex: {
        openapi: '3.0.0',
        info: {
          title: 'Complex Test API',
          version: '2.1.0',
          description: 'Complex API with multiple resources'
        },
        servers: [
          { url: 'https://api.test.com/v1' },
          { url: 'https://staging-api.test.com/v1' }
        ],
        paths: {
          '/users': {
            get: {
              summary: 'List users',
              parameters: [
                { name: 'limit', in: 'query', schema: { type: 'integer' } }
              ],
              responses: {
                '200': {
                  description: 'User list',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/User' }
                      }
                    }
                  }
                }
              }
            },
            post: {
              summary: 'Create user',
              requestBody: {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/User' }
                  }
                }
              },
              responses: {
                '201': {
                  description: 'User created',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/User' }
                    }
                  }
                }
              }
            }
          }
        },
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                name: { type: 'string' },
                email: { type: 'string', format: 'email' }
              },
              required: ['id', 'name', 'email']
            }
          }
        }
      },
      invalid: {
        openapi: '3.0.0',
        info: {
          title: 'Invalid API',
          version: 'invalid-version'
        },
        paths: {
          '/test': {
            get: {
              responses: {
                '200': {
                  description: 'Success'
                }
              }
            }
          }
        }
      }
    };
  }

  /**
   * Generate AsyncAPI test fixtures
   */
  async generateAsyncAPIFixtures() {
    return {
      minimal: {
        asyncapi: '2.6.0',
        info: {
          title: 'Test Event API',
          version: '1.0.0',
          description: 'Minimal test event API'
        },
        channels: {
          'user.created': {
            publish: {
              message: {
                payload: {
                  type: 'object',
                  properties: {
                    userId: { type: 'string' },
                    timestamp: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          }
        }
      },
      kafka: {
        asyncapi: '2.6.0',
        info: {
          title: 'Kafka Event API',
          version: '1.0.0'
        },
        servers: {
          production: {
            url: 'kafka://kafka.prod:9092',
            protocol: 'kafka'
          }
        },
        channels: {
          'user.events': {
            subscribe: {
              message: {
                payload: {
                  type: 'object',
                  properties: {
                    eventType: { type: 'string', enum: ['created', 'updated', 'deleted'] },
                    userId: { type: 'string' },
                    data: { type: 'object' }
                  }
                }
              }
            }
          }
        }
      }
    };
  }

  /**
   * Generate protocol manifest fixtures
   */
  async generateManifestFixtures() {
    return {
      api: {
        apiVersion: 'protocol.ossp-agi.dev/v1',
        kind: 'APIProtocol',
        metadata: {
          name: 'test-api',
          version: '1.0.0',
          description: 'Test API protocol'
        },
        spec: {
          openapi: '3.0.0',
          info: {
            title: 'Test API',
            version: '1.0.0'
          },
          paths: {
            '/test': {
              get: {
                responses: { '200': { description: 'OK' } }
              }
            }
          }
        }
      },
      data: {
        apiVersion: 'protocol.ossp-agi.dev/v1',
        kind: 'DataProtocol',
        metadata: {
          name: 'test-data',
          version: '1.0.0'
        },
        spec: {
          schema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              value: { type: 'number' }
            }
          }
        }
      },
      event: {
        apiVersion: 'protocol.ossp-agi.dev/v1',
        kind: 'EventProtocol',
        metadata: {
          name: 'test-event',
          version: '1.0.0'
        },
        spec: {
          asyncapi: '2.6.0',
          info: {
            title: 'Test Event',
            version: '1.0.0'
          },
          channels: {
            'test.event': {
              publish: {
                message: {
                  payload: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
  }

  /**
   * Generate workflow fixtures
   */
  async generateWorkflowFixtures() {
    return {
      simple: {
        workflowId: 'test-workflow',
        name: 'Test Workflow',
        version: '1.0.0',
        steps: [
          {
            stepId: 'step-1',
            type: 'task',
            task: {
              action: 'test-action',
              inputs: { message: 'Hello World' }
            }
          }
        ]
      },
      complex: {
        workflowId: 'complex-workflow',
        name: 'Complex Test Workflow',
        version: '2.0.0',
        steps: [
          {
            stepId: 'validate',
            type: 'validation',
            validation: {
              schema: { type: 'object' },
              data: { test: true }
            }
          },
          {
            stepId: 'process',
            type: 'task',
            task: {
              action: 'process-data',
              inputs: { source: 'validation' }
            }
          },
          {
            stepId: 'notify',
            type: 'notification',
            notification: {
              channel: 'slack',
              message: 'Processing complete'
            }
          }
        ]
      }
    };
  }

  /**
   * Generate agent fixtures
   */
  async generateAgentFixtures() {
    return {
      basic: {
        agent: {
          id: 'test-agent',
          name: 'Test Agent',
          version: '1.0.0',
          description: 'Basic test agent'
        },
        capabilities: {
          tools: [
            { name: 'test-tool', description: 'Test tool' }
          ]
        }
      },
      advanced: {
        agent: {
          id: 'advanced-agent',
          name: 'Advanced Agent',
          version: '2.0.0',
          description: 'Advanced test agent with multiple capabilities'
        },
        capabilities: {
          tools: [
            { name: 'analyze', description: 'Analyze data' },
            { name: 'generate', description: 'Generate content' }
          ],
          models: [
            { name: 'gpt-4', description: 'GPT-4 model' }
          ]
        },
        relationships: {
          api: ['urn:proto:api:test-api@1.0.0'],
          data: ['urn:proto:data:test-data@1.0.0']
        }
      }
    };
  }

  /**
   * Generate data protocol fixtures
   */
  async generateDataFixtures() {
    return {
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          value: { type: 'number' },
          metadata: {
            type: 'object',
            properties: {
              created: { type: 'string', format: 'date-time' },
              updated: { type: 'string', format: 'date-time' }
            }
          }
        },
        required: ['id', 'name']
      },
      sample: {
        id: 'test-001',
        name: 'Test Item',
        value: 42,
        metadata: {
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T12:00:00Z'
        }
      }
    };
  }

  /**
   * Generate event protocol fixtures
   */
  async generateEventFixtures() {
    return {
      simple: {
        eventType: 'user.created',
        payload: {
          userId: 'user-123',
          timestamp: '2024-01-01T00:00:00Z'
        }
      },
      complex: {
        eventType: 'order.processed',
        payload: {
          orderId: 'order-456',
          customerId: 'customer-789',
          items: [
            { productId: 'prod-1', quantity: 2 },
            { productId: 'prod-2', quantity: 1 }
          ],
          total: 99.99,
          timestamp: '2024-01-01T00:00:00Z'
        },
        metadata: {
          source: 'order-service',
          version: '1.0.0',
          correlationId: 'corr-123'
        }
      }
    };
  }

  /**
   * Generate semantic protocol fixtures
   */
  async generateSemanticFixtures() {
    return {
      ontology: {
        '@context': {
          '@vocab': 'https://schema.org/',
          'ossp': 'https://ossp-agi.dev/schema/'
        },
        '@type': 'Thing',
        'ossp:protocol': {
          '@type': 'Protocol',
          name: 'Test Protocol',
          version: '1.0.0'
        }
      },
      vocabulary: {
        terms: {
          'protocol': {
            definition: 'A protocol definition',
            type: 'Class'
          },
          'agent': {
            definition: 'An autonomous agent',
            type: 'Class'
          }
        }
      }
    };
  }

  /**
   * Write fixtures to disk
   */
  async writeFixtures(fixtures) {
    await fs.mkdir(this.outputDir, { recursive: true });

    for (const [category, categoryFixtures] of Object.entries(fixtures)) {
      const categoryDir = path.join(this.outputDir, category);
      await fs.mkdir(categoryDir, { recursive: true });

      for (const [name, fixture] of Object.entries(categoryFixtures)) {
        const filename = `${name}.json`;
        const filepath = path.join(categoryDir, filename);
        await fs.writeFile(filepath, JSON.stringify(fixture, null, 2));
        
        if (this.verbose) {
          console.log(`Generated fixture: ${filepath}`);
        }
      }
    }
  }
}

/**
 * Generate all test fixtures
 */
export async function generateTestFixtures(options = {}) {
  const generator = new TestFixturesGenerator(options);
  return await generator.generateAllFixtures();
}
