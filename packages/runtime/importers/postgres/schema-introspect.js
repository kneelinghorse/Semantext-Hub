/*
 * Postgres Schema Introspection
 * Queries database metadata to extract tables, columns, constraints, and relationships
 *
 * Features:
 * - Read-only connection with timeout
 * - Full schema extraction (tables, columns, types, constraints)
 * - Foreign key and index discovery
 * - Sample data extraction for pattern detection
 * - Adaptive sampling based on table size
 */

/**
 * Schema introspection for Postgres databases
 */
class SchemaIntrospector {
  constructor(client) {
    this.client = client;
  }

  /**
   * Get all tables in database
   * @returns {Promise<Array>} List of tables with metadata
   */
  async getTables() {
    const query = `
      SELECT
        t.table_schema,
        t.table_name,
        pg_total_relation_size('"' || t.table_schema || '"."' || t.table_name || '"') as size_bytes,
        c.reltuples::bigint as estimated_rows,
        obj_description(c.oid) as table_comment
      FROM information_schema.tables t
      LEFT JOIN pg_class c ON c.relname = t.table_name
      LEFT JOIN pg_namespace n ON n.nspname = t.table_schema AND n.oid = c.relnamespace
      WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_schema, t.table_name;
    `;

    const result = await this.client.query(query);
    return result.rows;
  }

  /**
   * Get columns for a table
   * @param {string} schema - Schema name
   * @param {string} table - Table name
   * @returns {Promise<Array>} List of columns with metadata
   */
  async getColumns(schema, table) {
    const query = `
      SELECT
        c.column_name,
        c.ordinal_position,
        c.is_nullable,
        c.data_type,
        c.udt_name,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.column_default,
        col_description(('"' || c.table_schema || '"."' || c.table_name || '"')::regclass::oid, c.ordinal_position) as column_comment
      FROM information_schema.columns c
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position;
    `;

    const result = await this.client.query(query, [schema, table]);
    return result.rows;
  }

  /**
   * Get primary key for a table
   * @param {string} schema - Schema name
   * @param {string} table - Table name
   * @returns {Promise<Array<string>>} Primary key column names
   */
  async getPrimaryKey(schema, table) {
    const query = `
      SELECT a.attname as column_name
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = ('"' || $1 || '"."' || $2 || '"')::regclass
        AND i.indisprimary
      ORDER BY array_position(i.indkey, a.attnum);
    `;

    const result = await this.client.query(query, [schema, table]);
    return result.rows.map(r => r.column_name);
  }

  /**
   * Get foreign keys for a table
   * @param {string} schema - Schema name
   * @param {string} table - Table name
   * @returns {Promise<Array>} Foreign key constraints
   */
  async getForeignKeys(schema, table) {
    const query = `
      SELECT
        kcu.column_name,
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.constraint_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2;
    `;

    const result = await this.client.query(query, [schema, table]);
    return result.rows;
  }

  /**
   * Get unique constraints for a table
   * @param {string} schema - Schema name
   * @param {string} table - Table name
   * @returns {Promise<Array>} Unique constraints
   */
  async getUniqueConstraints(schema, table) {
    const query = `
      SELECT
        tc.constraint_name,
        array_agg(kcu.column_name ORDER BY kcu.ordinal_position) as columns
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'UNIQUE'
        AND tc.table_schema = $1
        AND tc.table_name = $2
      GROUP BY tc.constraint_name;
    `;

    const result = await this.client.query(query, [schema, table]);
    return result.rows;
  }

  /**
   * Get indexes for a table
   * @param {string} schema - Schema name
   * @param {string} table - Table name
   * @returns {Promise<Array>} Index definitions
   */
  async getIndexes(schema, table) {
    const query = `
      SELECT
        i.relname as index_name,
        array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) as columns,
        ix.indisunique as is_unique,
        ix.indisprimary as is_primary,
        am.amname as index_type
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      JOIN pg_am am ON am.oid = i.relam
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = $1
        AND t.relname = $2
        AND NOT ix.indisprimary
      GROUP BY i.relname, ix.indisunique, ix.indisprimary, am.amname
      ORDER BY i.relname;
    `;

    const result = await this.client.query(query, [schema, table]);
    return result.rows;
  }

  /**
   * Sample data from a table for pattern detection
   * Adaptive sampling based on table size
   * @param {string} schema - Schema name
   * @param {string} table - Table name
   * @param {number} estimatedRows - Estimated row count
   * @param {Array<string>} columns - Columns to sample
   * @returns {Promise<Array>} Sample rows
   */
  async sampleData(schema, table, estimatedRows, columns) {
    // Adaptive sample size
    let sampleSize = 100;
    if (estimatedRows < 1000) {
      sampleSize = 100;
    } else if (estimatedRows < 100000) {
      sampleSize = 500;
    } else {
      sampleSize = 1000;
    }

    // Build column list (escape column names)
    const columnList = columns
      .map(c => `"${c}"`)
      .join(', ');

    // Use TABLESAMPLE for large tables (>1000 rows)
    let query;
    if (estimatedRows > 1000) {
      query = `
        SELECT ${columnList}
        FROM "${schema}"."${table}"
        TABLESAMPLE SYSTEM ((${sampleSize} * 100) / NULLIF(${estimatedRows}, 0))
        LIMIT ${sampleSize};
      `;
    } else {
      query = `
        SELECT ${columnList}
        FROM "${schema}"."${table}"
        LIMIT ${sampleSize};
      `;
    }

    const result = await this.client.query(query);
    return result.rows;
  }

  /**
   * Get all schemas (excluding system schemas)
   * @returns {Promise<Array<string>>} Schema names
   */
  async getSchemas() {
    const query = `
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name;
    `;

    const result = await this.client.query(query);
    return result.rows.map(r => r.schema_name);
  }

  /**
   * Test connection
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    try {
      await this.client.query('SELECT 1');
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = { SchemaIntrospector };
