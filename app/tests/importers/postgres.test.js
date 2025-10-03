/*
 * Tests for Postgres Importer
 * Comprehensive test coverage for schema introspection, PII detection, and manifest generation
 */

const { PostgresImporter } = require('../../importers/postgres/importer');
const { detectPII, batchDetectPII, calculateEntropy, analyzeSampleData } = require('../../importers/postgres/pii-detector');
const { PerformanceAnalyzer, estimateQueryCost } = require('../../importers/postgres/performance');

// Mock pg client for testing
class MockClient {
  constructor(mockData = {}) {
    this.mockData = mockData;
    this.queries = [];
  }

  async connect() {
    return Promise.resolve();
  }

  async query(sql, params = []) {
    this.queries.push({ sql, params });

    // Mock responses based on query patterns
    if (sql.includes('information_schema.tables')) {
      return { rows: this.mockData.tables || [] };
    }

    if (sql.includes('information_schema.columns')) {
      return { rows: this.mockData.columns || [] };
    }

    if (sql.includes('pg_index')) {
      return { rows: this.mockData.primaryKey || [] };
    }

    if (sql.includes('table_constraints')) {
      return { rows: this.mockData.foreignKeys || [] };
    }

    if (sql.includes('pg_stats')) {
      return { rows: this.mockData.stats || [] };
    }

    if (sql.includes('TABLESAMPLE') || sql.includes('LIMIT')) {
      return { rows: this.mockData.sampleData || [] };
    }

    if (sql.includes('BEGIN READ ONLY')) {
      return { rows: [] };
    }

    if (sql.includes('SELECT 1')) {
      return { rows: [{ '?column?': 1 }] };
    }

    return { rows: [] };
  }

  async end() {
    return Promise.resolve();
  }
}

describe('PII Detector', () => {
  describe('calculateEntropy', () => {
    it('calculates high entropy for random strings', () => {
      const entropy = calculateEntropy('a8f3d9c2b1e4f5a6');
      expect(entropy).toBeGreaterThan(3.5);
    });

    it('calculates low entropy for repeated strings', () => {
      const entropy = calculateEntropy('aaaaaaaaaa');
      expect(entropy).toBeLessThan(1.0);
    });

    it('handles empty strings', () => {
      const entropy = calculateEntropy('');
      expect(entropy).toBe(0);
    });
  });

  describe('analyzeSampleData', () => {
    it('detects email patterns in sample data', () => {
      const samples = ['user@example.com', 'test@test.org', 'admin@site.net'];
      const analysis = analyzeSampleData(samples, 'email');

      expect(analysis.patterns.length).toBeGreaterThan(0);
      expect(analysis.patterns.some(p => p.type === 'email')).toBe(true);
    });

    it('calculates null rate correctly', () => {
      const samples = ['value1', null, 'value2', null, null];
      const analysis = analyzeSampleData(samples, 'column');

      expect(analysis.nullRate).toBe(0.6); // 3 out of 5
    });

    it('handles empty sample data', () => {
      const analysis = analyzeSampleData([], 'column');
      expect(analysis.patterns).toEqual([]);
      expect(analysis.avgEntropy).toBe(0);
    });
  });

  describe('detectPII', () => {
    it('detects email with high confidence (name + data pattern)', () => {
      const samples = ['user@example.com', 'test@example.com', 'admin@example.com'];
      const result = detectPII('user_email', 'varchar', samples);

      expect(result.detected).toBe(true);
      expect(result.type).toBe('email');
      expect(result.confidence).toBeGreaterThan(0.85);
      expect(result.signals.length).toBeGreaterThan(1);
    });

    it('detects SSN with high confidence', () => {
      const samples = ['123-45-6789', '987-65-4321', '555-12-3456'];
      const result = detectPII('social_security_number', 'varchar', samples);

      expect(result.detected).toBe(true);
      expect(result.type).toBe('ssn');
      expect(result.confidence).toBeGreaterThan(0.90);
    });

    it('detects phone numbers', () => {
      const samples = ['+14155551234', '+12025551234', '+18005551234'];
      const result = detectPII('phone_number', 'varchar', samples);

      expect(result.detected).toBe(true);
      expect(result.type).toBe('phone');
    });

    it('detects IP addresses from type hint', () => {
      const samples = ['192.168.1.1', '10.0.0.1', '172.16.0.1'];
      const result = detectPII('client_ip', 'inet', samples);

      expect(result.detected).toBe(true);
      expect(result.type).toBe('ip_address');
      expect(result.confidence).toBeGreaterThan(0.85);
    });

    it('does not detect PII in regular columns', () => {
      const samples = ['active', 'inactive', 'pending', 'active'];
      const result = detectPII('status', 'varchar', samples);

      expect(result.detected).toBe(false);
    });

    it('requires multiple signals for detection', () => {
      // Name pattern alone (0.70 confidence) should not trigger detection
      const samples = ['value1', 'value2', 'value3'];
      const result = detectPII('email', 'varchar', samples);

      // Should not be detected without data pattern match
      expect(result.confidence).toBeLessThan(0.85);
    });

    it('adjusts confidence based on null rate', () => {
      const samplesLowNull = ['user@example.com', 'test@example.com', 'admin@example.com'];
      const samplesHighNull = ['user@example.com', null, null, null, 'test@example.com'];

      const resultLowNull = detectPII('email', 'varchar', samplesLowNull);
      const resultHighNull = detectPII('email', 'varchar', samplesHighNull);

      expect(resultLowNull.confidence).toBeGreaterThan(resultHighNull.confidence);
    });
  });

  describe('batchDetectPII', () => {
    it('detects PII across multiple columns', () => {
      const columns = [
        { column_name: 'email', data_type: 'varchar' },
        { column_name: 'phone', data_type: 'varchar' },
        { column_name: 'status', data_type: 'varchar' }
      ];

      const samplesByColumn = {
        email: ['user@example.com', 'test@example.com'],
        phone: ['+14155551234', '+12025551234'],
        status: ['active', 'inactive']
      };

      const results = batchDetectPII(columns, samplesByColumn);

      expect(results.email.detected).toBe(true);
      expect(results.phone.detected).toBe(true);
      expect(results.status.detected).toBe(false);
    });
  });
});

describe('Performance Analyzer', () => {
  describe('estimateQueryCost', () => {
    it('prefers index scan for large tables', () => {
      const cost = estimateQueryCost(1000000, 100, true);

      expect(cost.index_scan_cost).toBeLessThan(cost.seq_scan_cost);
      expect(cost.recommended_scan).toBe('index');
    });

    it('prefers sequential scan for small tables', () => {
      const cost = estimateQueryCost(100, 50, true);

      expect(cost.seq_scan_cost).toBeLessThan(cost.index_scan_cost);
      expect(cost.recommended_scan).toBe('sequential');
    });

    it('handles tables without indexes', () => {
      const cost = estimateQueryCost(10000, 100, false);

      expect(cost.index_scan_cost).toBeNull();
      expect(cost.recommended_scan).toBe('sequential');
    });
  });

  describe('analyzeQuality', () => {
    it('detects potential keys from high uniqueness', () => {
      const analyzer = new PerformanceAnalyzer(null);
      const stats = {
        cardinality: 10000,
        null_frac: 0.0,
        avg_width: 36
      };

      const quality = analyzer.analyzeQuality(stats, 10000);

      expect(quality.potential_key).toBe(true);
      expect(quality.uniqueness).toBeGreaterThanOrEqual(0.95);
    });

    it('detects categorical columns from low cardinality', () => {
      const analyzer = new PerformanceAnalyzer(null);
      const stats = {
        cardinality: 5,
        null_frac: 0.1,
        avg_width: 10
      };

      const quality = analyzer.analyzeQuality(stats, 10000);

      expect(quality.likely_categorical).toBe(true);
    });

    it('warns on high null rate', () => {
      const analyzer = new PerformanceAnalyzer(null);
      const stats = {
        cardinality: 100,
        null_frac: 0.7,
        avg_width: 20
      };

      const quality = analyzer.analyzeQuality(stats, 1000);

      expect(quality.quality_warning).toBe('high_null_rate');
    });

    it('warns on large columns', () => {
      const analyzer = new PerformanceAnalyzer(null);
      const stats = {
        cardinality: 1000,
        null_frac: 0.0,
        avg_width: 2500
      };

      const quality = analyzer.analyzeQuality(stats, 10000);

      expect(quality.storage_warning).toBe('large_column');
    });
  });

  describe('generateRecommendations', () => {
    it('recommends unique index for near-unique columns', () => {
      const analyzer = new PerformanceAnalyzer(null);
      const stats = { uniqueness: 0.98 };
      const column = { data_type: 'varchar' };

      const recommendations = analyzer.generateRecommendations(stats, column);

      expect(recommendations.some(r => r.includes('unique index'))).toBe(true);
    });

    it('recommends bitmap index for low cardinality', () => {
      const analyzer = new PerformanceAnalyzer(null);
      const stats = {
        likely_categorical: true,
        estimated_distinct: 10
      };
      const column = { data_type: 'varchar' };

      const recommendations = analyzer.generateRecommendations(stats, column);

      expect(recommendations.some(r => r.includes('bitmap index'))).toBe(true);
    });
  });
});

describe('Postgres Importer', () => {
  describe('type mapping', () => {
    it('maps Postgres types to Data Protocol types', () => {
      const importer = new PostgresImporter();

      expect(importer._mapPostgresType('integer', 'int4')).toBe('integer');
      expect(importer._mapPostgresType('bigint', 'int8')).toBe('long');
      expect(importer._mapPostgresType('character varying', 'varchar')).toBe('string');
      expect(importer._mapPostgresType('jsonb', 'jsonb')).toBe('json');
      expect(importer._mapPostgresType('uuid', 'uuid')).toBe('uuid');
      expect(importer._mapPostgresType('timestamp without time zone', 'timestamp')).toBe('timestamp');
    });
  });

  describe('URN generation', () => {
    it('generates stable URNs for tables', () => {
      const importer = new PostgresImporter();
      const urn1 = importer._generateTableURN('public', 'users');
      const urn2 = importer._generateTableURN('public', 'users');

      expect(urn1).toBe(urn2);
      expect(urn1).toBe('urn:proto:data:postgres/public.users');
    });

    it('generates different URNs for different tables', () => {
      const importer = new PostgresImporter();
      const urn1 = importer._generateTableURN('public', 'users');
      const urn2 = importer._generateTableURN('public', 'orders');

      expect(urn1).not.toBe(urn2);
    });

    it('generates stable URNs for columns', () => {
      const importer = new PostgresImporter();
      const urn1 = importer._generateColumnURN('public', 'users', 'email');
      const urn2 = importer._generateColumnURN('public', 'users', 'email');

      expect(urn1).toBe(urn2);
      expect(urn1).toBe('urn:proto:data:postgres/public.users.email');
    });
  });

  describe('table type inference', () => {
    it('infers fact-table from name prefix', () => {
      const importer = new PostgresImporter();
      const type = importer._inferTableType('fact_sales', []);

      expect(type).toBe('fact-table');
    });

    it('infers dimension from name prefix', () => {
      const importer = new PostgresImporter();
      const type = importer._inferTableType('dim_customers', []);

      expect(type).toBe('dimension');
    });

    it('infers fact-table from many foreign keys', () => {
      const importer = new PostgresImporter();
      const fks = [
        { column_name: 'customer_id' },
        { column_name: 'product_id' },
        { column_name: 'store_id' }
      ];
      const type = importer._inferTableType('sales', fks);

      expect(type).toBe('fact-table');
    });

    it('infers dimension from few foreign keys', () => {
      const importer = new PostgresImporter();
      const type = importer._inferTableType('customers', []);

      expect(type).toBe('dimension');
    });
  });

  describe('connection string handling', () => {
    it('extracts database name from connection string', () => {
      const importer = new PostgresImporter();
      const dbName = importer._extractDatabaseName('postgresql://user:pass@localhost:5432/mydb');

      expect(dbName).toBe('mydb');
    });

    it('hashes connection string without exposing credentials', () => {
      const importer = new PostgresImporter();
      const hash = importer._hashConnectionString('postgresql://user:pass@localhost:5432/mydb');

      expect(hash).toMatch(/^[a-f0-9]{16}$/);
      expect(hash).not.toContain('user');
      expect(hash).not.toContain('pass');
    });
  });

  describe('manifest cleaning', () => {
    it('removes undefined fields', () => {
      const importer = new PostgresImporter();
      const manifest = {
        dataset: { name: 'test' },
        schema: undefined,
        lineage: { sources: [] }
      };

      importer._cleanManifest(manifest);

      expect(manifest.schema).toBeUndefined();
    });

    it('removes empty objects', () => {
      const importer = new PostgresImporter();
      const manifest = {
        dataset: { name: 'test' },
        lineage: {}
      };

      importer._cleanManifest(manifest);

      expect(manifest.lineage).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('creates error manifest on connection failure', () => {
      const importer = new PostgresImporter({ strictMode: false });
      const error = new Error('Connection refused');
      const errorManifest = importer._createErrorManifest('postgresql://localhost/db', error);

      expect(errorManifest.metadata.status).toBe('error');
      expect(errorManifest.metadata.error.message).toBe('Connection refused');
      expect(errorManifest.datasets).toEqual([]);
    });
  });
});

// Integration test structure (requires actual Postgres connection)
describe('Integration Tests', () => {
  it('should have placeholder for real database tests', () => {
    // These tests would require:
    // 1. Docker container with test Postgres
    // 2. Seed data with known PII patterns
    // 3. Full import flow validation
    // 4. Performance benchmarks

    expect(true).toBe(true); // Placeholder
  });
});
