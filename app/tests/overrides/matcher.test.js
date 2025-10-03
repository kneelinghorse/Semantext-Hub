/*
 * Pattern Matcher Tests
 */

const { RuleLoader } = require('../../core/overrides/loader');
const { PatternMatcher } = require('../../core/overrides/matcher');

describe('PatternMatcher', () => {
  let loader;
  let matcher;

  beforeEach(() => {
    loader = new RuleLoader();
    matcher = new PatternMatcher(loader);
  });

  describe('matchPIIPattern', () => {
    test('matches field name pattern', () => {
      const rule = {
        id: 'test-email',
        type: 'pii_pattern',
        pattern: {
          field: 'email'
        },
        classification: 'pii',
        confidence: 0.9,
        metadata: {
          source: 'community',
          created: new Date().toISOString()
        }
      };

      loader.addRule(rule);

      const match = matcher.matchPIIPattern('email', {});
      expect(match).toBeDefined();
      expect(match.rule.id).toBe('test-email');
      expect(match.confidence).toBeGreaterThan(0);
    });

    test('matches regex field pattern', () => {
      const rule = {
        id: 'test-email-regex',
        type: 'pii_pattern',
        pattern: {
          field: { regex: 'email|e_mail', flags: 'i' }
        },
        classification: 'pii',
        confidence: 0.9,
        metadata: {
          source: 'community',
          created: new Date().toISOString()
        }
      };

      loader.addRule(rule);

      const match = matcher.matchPIIPattern('customer_email', {});
      expect(match).toBeDefined();
      expect(match.rule.id).toBe('test-email-regex');
    });

    test('matches with context', () => {
      const rule = {
        id: 'test-context',
        type: 'pii_pattern',
        pattern: {
          field: 'email',
          context: 'customers'
        },
        classification: 'pii',
        confidence: 0.95,
        metadata: {
          source: 'community',
          created: new Date().toISOString()
        }
      };

      loader.addRule(rule);

      const match = matcher.matchPIIPattern('email', { context: 'customers' });
      expect(match).toBeDefined();
      expect(match.confidence).toBeGreaterThan(0.7);
    });

    test('matches data pattern from sample data', () => {
      const rule = {
        id: 'test-data-pattern',
        type: 'pii_pattern',
        pattern: {
          field: 'email',
          data_pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'
        },
        classification: 'pii',
        confidence: 0.92,
        metadata: {
          source: 'community',
          created: new Date().toISOString()
        }
      };

      loader.addRule(rule);

      const sampleData = [
        'user@example.com',
        'test@test.org',
        'admin@company.co'
      ];

      const match = matcher.matchPIIPattern('email', { sampleData });
      expect(match).toBeDefined();
      expect(match.confidence).toBeGreaterThan(0.8);
    });

    test('matches protocol hints', () => {
      const rule = {
        id: 'test-protocol',
        type: 'pii_pattern',
        pattern: {
          field: 'email',
          context: 'customers'
        },
        classification: 'pii',
        confidence: 0.9,
        metadata: {
          source: 'community',
          created: new Date().toISOString(),
          protocol_hints: ['stripe', 'payment']
        }
      };

      loader.addRule(rule);

      const match = matcher.matchPIIPattern('email', {
        context: 'customers',
        protocol: 'stripe-api'
      });

      expect(match).toBeDefined();
      expect(match.confidence).toBeGreaterThan(0.8);
    });

    test('selects best match when multiple rules match', () => {
      const lowConfRule = {
        id: 'low-conf',
        type: 'pii_pattern',
        pattern: { field: 'email' },
        classification: 'pii',
        confidence: 0.7,
        metadata: {
          source: 'community',
          created: new Date().toISOString()
        }
      };

      const highConfRule = {
        id: 'high-conf',
        type: 'pii_pattern',
        pattern: { field: 'email', context: 'users' },
        classification: 'pii',
        confidence: 0.95,
        metadata: {
          source: 'community',
          created: new Date().toISOString()
        }
      };

      loader.addRule(lowConfRule);
      loader.addRule(highConfRule);

      const match = matcher.matchPIIPattern('email', { context: 'users' });
      expect(match.rule.id).toBe('high-conf');
    });

    test('returns null when no rules match', () => {
      const match = matcher.matchPIIPattern('unknown_field', {});
      expect(match).toBeNull();
    });

    test('caches match results', () => {
      const rule = {
        id: 'cache-test',
        type: 'pii_pattern',
        pattern: { field: 'email' },
        classification: 'pii',
        confidence: 0.9,
        metadata: {
          source: 'community',
          created: new Date().toISOString()
        }
      };

      loader.addRule(rule);

      // First match
      const match1 = matcher.matchPIIPattern('email', {});

      // Second match should use cache
      const match2 = matcher.matchPIIPattern('email', {});

      expect(match1).toBe(match2); // Same object reference
      expect(matcher.getCacheStats().size).toBeGreaterThan(0);
    });
  });

  describe('matchAPIPattern', () => {
    test('matches endpoint and method', () => {
      const rule = {
        id: 'test-api',
        type: 'api_pattern',
        pattern: {
          endpoint: '/users',
          method: 'GET'
        },
        classification: 'pagination',
        confidence: 0.9,
        metadata: {
          source: 'community',
          created: new Date().toISOString()
        }
      };

      loader.addRule(rule);

      const match = matcher.matchAPIPattern('/users', 'GET', {});
      expect(match).toBeDefined();
      expect(match.rule.id).toBe('test-api');
    });

    test('matches endpoint regex', () => {
      const rule = {
        id: 'test-api-regex',
        type: 'api_pattern',
        pattern: {
          endpoint: { regex: '^/v1/.*', flags: 'i' },
          method: 'GET'
        },
        classification: 'rate_limiting',
        confidence: 0.85,
        metadata: {
          source: 'community',
          created: new Date().toISOString()
        }
      };

      loader.addRule(rule);

      const match = matcher.matchAPIPattern('/v1/customers', 'GET', {});
      expect(match).toBeDefined();
      expect(match.rule.classification).toBe('rate_limiting');
    });

    test('matches parameters', () => {
      const rule = {
        id: 'test-params',
        type: 'api_pattern',
        pattern: {
          endpoint: '/users',
          method: 'GET',
          parameters: ['page', 'limit']
        },
        classification: 'pagination',
        confidence: 0.92,
        metadata: {
          source: 'community',
          created: new Date().toISOString()
        }
      };

      loader.addRule(rule);

      const operation = {
        parameters: [
          { name: 'page', in: 'query' },
          { name: 'limit', in: 'query' },
          { name: 'sort', in: 'query' }
        ]
      };

      const match = matcher.matchAPIPattern('/users', 'GET', operation);
      expect(match).toBeDefined();
      expect(match.confidence).toBeGreaterThan(0.7);
    });

    test('matches response patterns', () => {
      const rule = {
        id: 'test-response',
        type: 'api_pattern',
        pattern: {
          endpoint: '/users',
          response: {
            status: 200,
            properties: ['data', 'has_more']
          }
        },
        classification: 'pagination',
        confidence: 0.88,
        metadata: {
          source: 'community',
          created: new Date().toISOString()
        }
      };

      loader.addRule(rule);

      const operation = {
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  properties: {
                    data: { type: 'array' },
                    has_more: { type: 'boolean' },
                    total: { type: 'number' }
                  }
                }
              }
            }
          }
        }
      };

      const match = matcher.matchAPIPattern('/users', 'GET', operation);
      expect(match).toBeDefined();
    });

    test('caches API pattern matches', () => {
      const rule = {
        id: 'cache-api-test',
        type: 'api_pattern',
        pattern: {
          endpoint: '/users',
          method: 'GET'
        },
        classification: 'pagination',
        confidence: 0.9,
        metadata: {
          source: 'community',
          created: new Date().toISOString()
        }
      };

      loader.addRule(rule);

      const match1 = matcher.matchAPIPattern('/users', 'GET', {});
      const match2 = matcher.matchAPIPattern('/users', 'GET', {});

      expect(match1).toBe(match2);
    });
  });

  describe('cache management', () => {
    test('clearCache removes all cached matches', () => {
      const rule = {
        id: 'clear-test',
        type: 'pii_pattern',
        pattern: { field: 'email' },
        classification: 'pii',
        confidence: 0.9,
        metadata: {
          source: 'community',
          created: new Date().toISOString()
        }
      };

      loader.addRule(rule);

      matcher.matchPIIPattern('email', {});
      expect(matcher.getCacheStats().size).toBeGreaterThan(0);

      matcher.clearCache();
      expect(matcher.getCacheStats().size).toBe(0);
    });
  });
});
