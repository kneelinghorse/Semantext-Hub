/**
 * Tests for Postgres Schema Introspector
 * Focus on branch coverage for conditional logic and error handling
 */

import { SchemaIntrospector } from '../../../packages/runtime/importers/postgres/schema-introspect.js';

describe('Postgres Schema Introspector', () => {
  let introspector;
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn()
    };
    introspector = new SchemaIntrospector(mockClient);
  });

  describe('getTables', () => {
    it('should get all tables successfully', async () => {
      const mockRows = [
        {
          table_schema: 'public',
          table_name: 'users',
          size_bytes: 1024000,
          estimated_rows: 1000,
          table_comment: 'User table'
        }
      ];

      mockClient.query.mockResolvedValue({ rows: mockRows });

      const result = await introspector.getTables();

      expect(result).toEqual(mockRows);
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('SELECT'));
    });

    it('should handle query errors', async () => {
      mockClient.query.mockRejectedValue(new Error('Database error'));

      await expect(introspector.getTables()).rejects.toThrow('Database error');
    });
  });

  describe('getColumns', () => {
    it('should get columns for a table successfully', async () => {
      const mockRows = [
        {
          column_name: 'id',
          ordinal_position: 1,
          is_nullable: 'NO',
          data_type: 'integer',
          udt_name: 'int4',
          character_maximum_length: null,
          numeric_precision: 32,
          numeric_scale: 0,
          column_default: "nextval('users_id_seq'::regclass)",
          column_comment: 'Primary key'
        }
      ];

      mockClient.query.mockResolvedValue({ rows: mockRows });

      const result = await introspector.getColumns('public', 'users');

      expect(result).toEqual(mockRows);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['public', 'users']
      );
    });

    it('should handle query errors', async () => {
      mockClient.query.mockRejectedValue(new Error('Column query failed'));

      await expect(introspector.getColumns('public', 'users')).rejects.toThrow('Column query failed');
    });
  });

  describe('getPrimaryKey', () => {
    it('should get primary key columns successfully', async () => {
      const mockRows = [
        { column_name: 'id' }
      ];

      mockClient.query.mockResolvedValue({ rows: mockRows });

      const result = await introspector.getPrimaryKey('public', 'users');

      expect(result).toEqual(['id']);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT a.attname'),
        ['public', 'users']
      );
    });

    it('should handle query errors', async () => {
      mockClient.query.mockRejectedValue(new Error('Primary key query failed'));

      await expect(introspector.getPrimaryKey('public', 'users')).rejects.toThrow('Primary key query failed');
    });
  });

  describe('getForeignKeys', () => {
    it('should get foreign key constraints successfully', async () => {
      const mockRows = [
        {
          column_name: 'user_id',
          foreign_table_schema: 'public',
          foreign_table_name: 'users',
          foreign_column_name: 'id',
          constraint_name: 'fk_posts_user_id'
        }
      ];

      mockClient.query.mockResolvedValue({ rows: mockRows });

      const result = await introspector.getForeignKeys('public', 'posts');

      expect(result).toEqual(mockRows);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('FOREIGN KEY'),
        ['public', 'posts']
      );
    });

    it('should handle query errors', async () => {
      mockClient.query.mockRejectedValue(new Error('Foreign key query failed'));

      await expect(introspector.getForeignKeys('public', 'posts')).rejects.toThrow('Foreign key query failed');
    });
  });

  describe('getUniqueConstraints', () => {
    it('should get unique constraints successfully', async () => {
      const mockRows = [
        {
          constraint_name: 'uk_users_email',
          columns: ['email']
        }
      ];

      mockClient.query.mockResolvedValue({ rows: mockRows });

      const result = await introspector.getUniqueConstraints('public', 'users');

      expect(result).toEqual(mockRows);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UNIQUE'),
        ['public', 'users']
      );
    });

    it('should handle query errors', async () => {
      mockClient.query.mockRejectedValue(new Error('Unique constraint query failed'));

      await expect(introspector.getUniqueConstraints('public', 'users')).rejects.toThrow('Unique constraint query failed');
    });
  });

  describe('getIndexes', () => {
    it('should get indexes successfully', async () => {
      const mockRows = [
        {
          index_name: 'idx_users_email',
          columns: ['email'],
          is_unique: true,
          is_primary: false,
          index_type: 'btree'
        }
      ];

      mockClient.query.mockResolvedValue({ rows: mockRows });

      const result = await introspector.getIndexes('public', 'users');

      expect(result).toEqual(mockRows);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('pg_class'),
        ['public', 'users']
      );
    });

    it('should handle query errors', async () => {
      mockClient.query.mockRejectedValue(new Error('Index query failed'));

      await expect(introspector.getIndexes('public', 'users')).rejects.toThrow('Index query failed');
    });
  });

  describe('sampleData', () => {
    it('should sample data for small tables (< 1000 rows)', async () => {
      const mockRows = [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' }
      ];

      mockClient.query.mockResolvedValue({ rows: mockRows });

      const result = await introspector.sampleData('public', 'users', 500, ['id', 'name']);

      expect(result).toEqual(mockRows);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 100')
      );
    });

    it('should sample data for medium tables (1000-100000 rows)', async () => {
      const mockRows = [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' }
      ];

      mockClient.query.mockResolvedValue({ rows: mockRows });

      const result = await introspector.sampleData('public', 'users', 50000, ['id', 'name']);

      expect(result).toEqual(mockRows);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('TABLESAMPLE SYSTEM')
      );
    });

    it('should sample data for large tables (> 100000 rows)', async () => {
      const mockRows = [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' }
      ];

      mockClient.query.mockResolvedValue({ rows: mockRows });

      const result = await introspector.sampleData('public', 'users', 200000, ['id', 'name']);

      expect(result).toEqual(mockRows);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('TABLESAMPLE SYSTEM')
      );
    });

    it('should handle query errors', async () => {
      mockClient.query.mockRejectedValue(new Error('Sample data query failed'));

      await expect(introspector.sampleData('public', 'users', 1000, ['id'])).rejects.toThrow('Sample data query failed');
    });

    it('should handle empty column list', async () => {
      const mockRows = [];
      mockClient.query.mockResolvedValue({ rows: mockRows });

      const result = await introspector.sampleData('public', 'users', 1000, []);

      expect(result).toEqual([]);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT')
      );
    });
  });

  describe('getSchemas', () => {
    it('should get all schemas successfully', async () => {
      const mockRows = [
        { schema_name: 'public' },
        { schema_name: 'app' }
      ];

      mockClient.query.mockResolvedValue({ rows: mockRows });

      const result = await introspector.getSchemas();

      expect(result).toEqual(['public', 'app']);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('information_schema.schemata')
      );
    });

    it('should handle query errors', async () => {
      mockClient.query.mockRejectedValue(new Error('Schema query failed'));

      await expect(introspector.getSchemas()).rejects.toThrow('Schema query failed');
    });
  });

  describe('testConnection', () => {
    it('should return true for successful connection', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });

      const result = await introspector.testConnection();

      expect(result).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return false for failed connection', async () => {
      mockClient.query.mockRejectedValue(new Error('Connection failed'));

      const result = await introspector.testConnection();

      expect(result).toBe(false);
    });

    it('should return false for any error', async () => {
      mockClient.query.mockRejectedValue(new Error('Any database error'));

      const result = await introspector.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('constructor', () => {
    it('should create instance with client', () => {
      const client = { query: jest.fn() };
      const instance = new SchemaIntrospector(client);

      expect(instance.client).toBe(client);
    });
  });
});
