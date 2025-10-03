/*
 * OpenAPI Importer Tests
 * Comprehensive test suite for OpenAPI to API Protocol conversion
 */

const { OpenAPIImporter } = require('../../importers/openapi/importer');
const { detectPagination, detectLongRunning } = require('../../importers/openapi/patterns');
const { preserveValuedExtensions, extractRateLimitConfig } = require('../../importers/openapi/extensions');

// Mock swagger-parser to avoid external dependencies in tests
jest.mock('@apidevtools/swagger-parser', () => ({
  dereference: jest.fn(),
  parse: jest.fn()
}), { virtual: true });

const SwaggerParser = require('@apidevtools/swagger-parser');

describe('OpenAPIImporter', () => {
  let importer;

  beforeEach(() => {
    importer = new OpenAPIImporter();
    jest.clearAllMocks();
  });

  describe('Basic Import', () => {
    test('imports minimal OpenAPI 3.0 spec', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              summary: 'List users',
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      SwaggerParser.dereference.mockResolvedValue(spec);

      const manifest = await importer.import(spec);

      expect(manifest.service.name).toBe('Test API');
      expect(manifest.service.version).toBe('1.0.0');
      expect(manifest.interface.endpoints).toHaveLength(1);
      expect(manifest.interface.endpoints[0].method).toBe('GET');
      expect(manifest.interface.endpoints[0].path).toBe('/users');
      expect(manifest.metadata.status).toBe('draft');
    });

    test('generates URN for service', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Billing API', version: '2.1.0' },
        paths: {
          '/invoices': {
            get: { responses: { '200': { description: 'OK' } } }
          }
        }
      };

      SwaggerParser.dereference.mockResolvedValue(spec);

      const manifest = await importer.import(spec);

      expect(manifest.service.urn).toBeDefined();
      expect(manifest.service.urn).toBe('urn:proto:api:billing-api/service@2.1.0');
    });

    test('handles malformed spec gracefully', async () => {
      SwaggerParser.dereference.mockRejectedValue(new Error('Invalid spec'));
      SwaggerParser.parse.mockRejectedValue(new Error('Parse failed'));

      const manifest = await importer.import('invalid-spec');

      expect(manifest.service.name).toBe('import-failed');
      expect(manifest.metadata.status).toBe('error');
      expect(manifest.metadata.error.message).toContain('Failed to parse OpenAPI spec');
    });
  });

  describe('Authentication Extraction', () => {
    test('extracts API key authentication', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'API', version: '1.0.0' },
        security: [{ apiKey: [] }],
        components: {
          securitySchemes: {
            apiKey: {
              type: 'apiKey',
              in: 'header',
              name: 'X-API-Key'
            }
          }
        },
        paths: {
          '/test': { get: { responses: { '200': { description: 'OK' } } } }
        }
      };

      SwaggerParser.dereference.mockResolvedValue(spec);

      const manifest = await importer.import(spec);

      expect(manifest.interface.authentication.type).toBe('apiKey');
      expect(manifest.interface.authentication.in).toBe('header');
      expect(manifest.interface.authentication.name).toBe('X-API-Key');
    });

    test('extracts OAuth2 authentication with scopes', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'API', version: '1.0.0' },
        security: [{ oauth2: ['read:users', 'write:users'] }],
        components: {
          securitySchemes: {
            oauth2: {
              type: 'oauth2',
              flows: {
                authorizationCode: {
                  authorizationUrl: 'https://example.com/oauth/authorize',
                  tokenUrl: 'https://example.com/oauth/token',
                  scopes: {
                    'read:users': 'Read user data',
                    'write:users': 'Write user data'
                  }
                }
              }
            }
          }
        },
        paths: {
          '/test': { get: { responses: { '200': { description: 'OK' } } } }
        }
      };

      SwaggerParser.dereference.mockResolvedValue(spec);

      const manifest = await importer.import(spec);

      expect(manifest.interface.authentication.type).toBe('oauth2');
      expect(manifest.interface.authentication.scopes).toEqual(['read:users', 'write:users']);
    });
  });

  describe('Endpoint Extraction', () => {
    test('extracts parameters with types', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'API', version: '1.0.0' },
        paths: {
          '/users/{id}': {
            get: {
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'include', in: 'query', required: false, schema: { type: 'string' } }
              ],
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      };

      SwaggerParser.dereference.mockResolvedValue(spec);

      const manifest = await importer.import(spec);

      expect(manifest.interface.endpoints[0].params).toHaveLength(2);
      expect(manifest.interface.endpoints[0].params[0].name).toBe('id');
      expect(manifest.interface.endpoints[0].params[0].in).toBe('path');
      expect(manifest.interface.endpoints[0].params[0].required).toBe(true);
    });

    test('extracts request body', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: { name: { type: 'string' } }
                    }
                  }
                }
              },
              responses: { '201': { description: 'Created' } }
            }
          }
        }
      };

      SwaggerParser.dereference.mockResolvedValue(spec);

      const manifest = await importer.import(spec);

      expect(manifest.interface.endpoints[0].request.contentType).toBe('application/json');
      expect(manifest.interface.endpoints[0].request.required).toBe(true);
      expect(manifest.interface.endpoints[0].request.schema.type).toBe('object');
    });

    test('extracts multiple responses', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': {
                  description: 'Success',
                  content: { 'application/json': { schema: { type: 'array' } } }
                },
                '304': { description: 'Not Modified' }
              }
            }
          }
        }
      };

      SwaggerParser.dereference.mockResolvedValue(spec);

      const manifest = await importer.import(spec);

      expect(manifest.interface.endpoints[0].responses).toHaveLength(2);
      expect(manifest.interface.endpoints[0].responses[0].status).toBe(200);
      expect(manifest.interface.endpoints[0].responses[1].status).toBe(304);
    });

    test('extracts typed errors from 4xx/5xx responses', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              responses: {
                '200': { description: 'Success' },
                '401': { description: 'Unauthorized' },
                '429': { description: 'Too Many Requests' },
                '500': { description: 'Internal Server Error' }
              }
            }
          }
        }
      };

      SwaggerParser.dereference.mockResolvedValue(spec);

      const manifest = await importer.import(spec);

      expect(manifest.interface.endpoints[0].errors).toHaveLength(3);
      expect(manifest.interface.endpoints[0].errors[0].code).toBe('AUTHENTICATION');
      expect(manifest.interface.endpoints[0].errors[0].http).toBe(401);
      expect(manifest.interface.endpoints[0].errors[0].retriable).toBe(false);
      expect(manifest.interface.endpoints[0].errors[1].code).toBe('RATE_LIMIT');
      expect(manifest.interface.endpoints[0].errors[1].retriable).toBe(true);
    });
  });

  describe('Pattern Detection - Pagination', () => {
    test('detects cursor-based pagination', () => {
      const operation = {
        parameters: [
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } }
        ]
      };
      const params = operation.parameters;

      const result = detectPagination(operation, params);

      expect(result.detected).toBe(true);
      expect(result.style).toBe('cursor');
      expect(result.params.cursor).toBe('cursor');
      expect(result.params.limit).toBe('limit');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('detects page-based pagination', () => {
      const operation = {
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'per_page', in: 'query', schema: { type: 'integer' } }
        ]
      };
      const params = operation.parameters;

      const result = detectPagination(operation, params);

      expect(result.detected).toBe(true);
      expect(result.style).toBe('page');
      expect(result.params.page).toBe('page');
      expect(result.params.limit).toBe('per_page');
    });

    test('does not detect pagination on non-GET methods', () => {
      const operation = {
        method: 'put',
        parameters: [
          { name: 'cursor', in: 'query', schema: { type: 'string' } }
        ]
      };

      const result = detectPagination(operation, operation.parameters);

      expect(result.detected).toBe(false);
    });
  });

  describe('Pattern Detection - Long-Running Operations', () => {
    test('detects polling pattern with 202 and Location header', () => {
      const operation = {
        responses: {
          '202': {
            description: 'Accepted',
            headers: {
              'Location': {
                schema: { type: 'string' },
                description: 'URL to poll: /status/{id}'
              }
            }
          }
        }
      };
      const responses = [{ status: 202 }];

      const result = detectLongRunning(operation, responses);

      expect(result.detected).toBe(true);
      expect(result.pattern).toBe('polling');
      expect(result.confidence).toBeGreaterThan(0.85);
    });

    test('detects webhook pattern', () => {
      const operation = {
        operationId: 'createWebhook',
        summary: 'Create a webhook for async notifications',
        responses: {
          '201': { description: 'Webhook created' }
        }
      };
      const responses = [{ status: 201 }];

      const result = detectLongRunning(operation, responses);

      expect(result.detected).toBe(true);
      expect(result.pattern).toBe('webhook');
    });

    test('respects x-long-running extension', () => {
      const operation = {
        'x-long-running': { pattern: 'polling', timeout: 3600 },
        responses: { '200': { description: 'OK' } }
      };

      const result = detectLongRunning(operation, []);

      expect(result.detected).toBe(true);
      expect(result.pattern).toBe('polling');
      expect(result.confidence).toBe(1.0);
    });
  });

  describe('Extension Preservation', () => {
    test('preserves valuable x-* extensions', () => {
      const operation = {
        'x-pii': true,
        'x-rate-limit': { limit: 100, window: '1m' },
        'x-internal': true,
        'x-custom-random': 'should-be-filtered',
        summary: 'Test operation'
      };

      const extensions = preserveValuedExtensions(operation);

      expect(extensions['x-pii']).toBe(true);
      expect(extensions['x-rate-limit']).toEqual({ limit: 100, window: '1m' });
      expect(extensions['x-internal']).toBe(true);
      expect(extensions['x-custom-random']).toBeUndefined();
    });

    test('extracts rate limit config from extension', () => {
      const extensions = {
        'x-rate-limit': { scope: 'user', limit: 1000, window: '1h', burst: 50 }
      };

      const config = extractRateLimitConfig(extensions);

      expect(config.scope).toBe('user');
      expect(config.limit).toBe(1000);
      expect(config.window).toBe('1h');
      expect(config.burst).toBe(50);
    });

    test('integrates extensions into manifest', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'API', version: '1.0.0' },
        'x-lifecycle': { status: 'beta', sunset_at: '2025-12-31' },
        paths: {
          '/users': {
            get: {
              'x-pii': true,
              'x-rate-limit': { limit: 100, window: '1m' },
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      };

      SwaggerParser.dereference.mockResolvedValue(spec);

      const manifest = await importer.import(spec);

      expect(manifest.metadata.lifecycle.status).toBe('beta');
      expect(manifest.interface.endpoints[0].extensions['x-pii']).toBe(true);
      expect(manifest.interface.endpoints[0].extensions['x-rate-limit']).toEqual({ limit: 100, window: '1m' });
    });

    test('preserves custom x-* extensions by default', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'API', version: '1.0.0' },
        paths: {
          '/custom': {
            get: {
              'x-custom-random': 'keep-me',
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      };

      SwaggerParser.dereference.mockResolvedValue(spec);

      const manifest = await importer.import(spec);

      expect(manifest.interface.endpoints[0].extensions['x-custom-random']).toBe('keep-me');
    });
  });

  describe('Schema and Validation', () => {
    test('extracts component schemas', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'API', version: '1.0.0' },
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' }
              }
            }
          }
        },
        paths: {
          '/users': { get: { responses: { '200': { description: 'OK' } } } }
        }
      };

      SwaggerParser.dereference.mockResolvedValue(spec);

      const manifest = await importer.import(spec);

      expect(manifest.validation.schemas.User).toBeDefined();
      expect(manifest.validation.schemas.User.type).toBe('object');
    });
  });

  describe('Context and Metadata', () => {
    test('extracts servers as context', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'API', version: '1.0.0' },
        servers: [
          { url: 'https://api.example.com/v1', description: 'Production' },
          { url: 'https://api-staging.example.com/v1', description: 'Staging' }
        ],
        paths: {
          '/test': { get: { responses: { '200': { description: 'OK' } } } }
        }
      };

      SwaggerParser.dereference.mockResolvedValue(spec);

      const manifest = await importer.import(spec);

      expect(manifest.context.servers).toHaveLength(2);
      expect(manifest.context.servers[0].url).toBe('https://api.example.com/v1');
    });

    test('extracts contact and documentation', async () => {
      const spec = {
        openapi: '3.0.0',
        info: {
          title: 'API',
          version: '1.0.0',
          contact: { name: 'API Team', email: 'api@example.com' }
        },
        externalDocs: { url: 'https://docs.example.com', description: 'API Docs' },
        paths: {
          '/test': { get: { responses: { '200': { description: 'OK' } } } }
        }
      };

      SwaggerParser.dereference.mockResolvedValue(spec);

      const manifest = await importer.import(spec);

      expect(manifest.context.contact.name).toBe('API Team');
      expect(manifest.context.documentation).toBe('https://docs.example.com');
    });
  });

  describe('Capabilities from Tags', () => {
    test('extracts capabilities from tags', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'API', version: '1.0.0' },
        tags: [
          { name: 'users', description: 'User management operations' },
          { name: 'billing', description: 'Billing and invoicing' }
        ],
        paths: {
          '/users': {
            get: {
              tags: ['users'],
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      };

      SwaggerParser.dereference.mockResolvedValue(spec);

      const manifest = await importer.import(spec);

      expect(manifest.capabilities.users).toBeDefined();
      expect(manifest.capabilities.users.description).toBe('User management operations');
      expect(manifest.capabilities.billing).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('strict mode throws on malformed spec', async () => {
      const strictImporter = new OpenAPIImporter({ strictMode: true });

      SwaggerParser.dereference.mockRejectedValue(new Error('Invalid'));
      SwaggerParser.parse.mockRejectedValue(new Error('Invalid'));

      await expect(strictImporter.import('bad-spec')).rejects.toThrow('Failed to parse OpenAPI spec');
    });

    test('non-strict mode returns error manifest', async () => {
      SwaggerParser.dereference.mockRejectedValue(new Error('Invalid'));
      SwaggerParser.parse.mockRejectedValue(new Error('Invalid'));

      const manifest = await importer.import('bad-spec');

      expect(manifest.metadata.status).toBe('error');
      expect(manifest.service.name).toBe('import-failed');
    });
  });

  describe('Integration', () => {
    test('imports complete real-world-like spec', async () => {
      const spec = {
        openapi: '3.0.0',
        info: {
          title: 'Payment API',
          version: '2.1.0',
          description: 'Payment processing API'
        },
        servers: [{ url: 'https://api.payments.example.com' }],
        security: [{ bearerAuth: [] }],
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer' }
          },
          schemas: {
            Payment: {
              type: 'object',
              properties: { id: { type: 'string' }, amount: { type: 'number' } }
            }
          }
        },
        paths: {
          '/payments': {
            get: {
              summary: 'List payments',
              parameters: [
                { name: 'cursor', in: 'query', schema: { type: 'string' } },
                { name: 'limit', in: 'query', schema: { type: 'integer' } }
              ],
              responses: {
                '200': {
                  description: 'Success',
                  content: { 'application/json': { schema: { type: 'array' } } }
                },
                '401': { description: 'Unauthorized' },
                '429': { description: 'Rate limited' }
              },
              'x-pii': true
            },
            post: {
              summary: 'Create payment',
              requestBody: {
                required: true,
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Payment' } } }
              },
              responses: {
                '202': {
                  description: 'Accepted',
                  headers: { 'Location': { schema: { type: 'string' } } }
                }
              }
            }
          }
        }
      };

      SwaggerParser.dereference.mockResolvedValue(spec);

      const manifest = await importer.import(spec);

      // Verify service
      expect(manifest.service.name).toBe('Payment API');
      expect(manifest.service.version).toBe('2.1.0');
      expect(manifest.service.urn).toBe('urn:proto:api:payment-api/service@2.1.0');

      // Verify auth
      expect(manifest.interface.authentication.type).toBe('apiKey');

      // Verify endpoints
      expect(manifest.interface.endpoints).toHaveLength(2);

      // Verify GET endpoint with pagination
      const getEndpoint = manifest.interface.endpoints.find(e => e.method === 'GET');
      expect(getEndpoint.pagination).toBeDefined();
      expect(getEndpoint.pagination.style).toBe('cursor');
      expect(getEndpoint.errors).toHaveLength(2);
      expect(getEndpoint.extensions['x-pii']).toBe(true);
      expect(getEndpoint.urn).toBe('urn:proto:api.endpoint:payment-api/route/payments-get@2.1.0');

      // Verify POST endpoint with LRO
      const postEndpoint = manifest.interface.endpoints.find(e => e.method === 'POST');
      expect(postEndpoint.long_running).toBeDefined();
      expect(postEndpoint.long_running.pattern).toBe('polling');
      expect(postEndpoint.urn).toBe('urn:proto:api.endpoint:payment-api/route/payments-post@2.1.0');

      // Verify schemas
      expect(manifest.validation.schemas.Payment).toBeDefined();

      // Verify metadata
      expect(manifest.metadata.status).toBe('draft');
      expect(manifest.metadata.source.type).toBe('openapi');
      expect(manifest.metadata.source.version).toBe('3.0.0');
      expect(manifest.provenance.importer).toBe('OpenAPIImporter');
      expect(manifest.provenance.spec_hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
