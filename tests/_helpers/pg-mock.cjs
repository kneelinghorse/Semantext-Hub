'use strict';

const Module = require('module');

const originalLoad = Module._load;

function getQueryText(query) {
  if (!query) {
    return '';
  }
  if (typeof query === 'string') {
    return query;
  }
  if (typeof query.text === 'string') {
    return query.text;
  }
  return '';
}

function createResult(rows) {
  return {
    rows,
    rowCount: Array.isArray(rows) ? rows.length : 0
  };
}

class MockClient {
  constructor(config = {}) {
    this.config = config;
    this.connectionString = config.connectionString || '';
    this.closed = false;
  }

  async connect() {
    if (this.connectionString.includes('fail-connect')) {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:5432');
      error.code = 'ECONNREFUSED';
      throw error;
    }
  }

  async query(query, params = []) {
    if (this.connectionString.includes('fail-query')) {
      throw new Error('schema introspection error');
    }

    const sql = getQueryText(query);
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    const lower = sql.toLowerCase();

    if (normalized === 'begin read only') {
      return createResult([]);
    }

    if (lower.includes('from information_schema.tables')) {
      return createResult([
        {
          table_schema: 'public',
          table_name: 'users',
          estimated_rows: 2,
          size_bytes: 1024,
          table_comment: 'Mock users table'
        }
      ]);
    }

    if (lower.includes('from information_schema.columns')) {
      return createResult([
        {
          table_schema: 'public',
          table_name: 'users',
          column_name: 'id',
          ordinal_position: 1,
          is_nullable: 'NO',
          data_type: 'integer',
          udt_name: 'int4',
          character_maximum_length: null,
          numeric_precision: 32,
          numeric_scale: 0,
          column_default: null,
          column_comment: 'Primary key'
        },
        {
          table_schema: 'public',
          table_name: 'users',
          column_name: 'email',
          ordinal_position: 2,
          is_nullable: 'NO',
          data_type: 'text',
          udt_name: 'text',
          character_maximum_length: null,
          numeric_precision: null,
          numeric_scale: null,
          column_default: null,
          column_comment: 'User email address'
        }
      ]);
    }

    if (lower.includes('from pg_index') && lower.includes('indisprimary')) {
      return createResult([
        { column_name: 'id' }
      ]);
    }

    if (lower.includes('constraint_type = \'foreign key\'')) {
      return createResult([]);
    }

    if (lower.includes('constraint_type = \'unique\'')) {
      return createResult([
        {
          constraint_name: 'users_email_key',
          columns: ['email']
        }
      ]);
    }

    if (lower.includes('from pg_class t') && lower.includes('join pg_index ix')) {
      return createResult([]);
    }

    if (lower.includes('from "public"."users"') && lower.includes('limit')) {
      return createResult([
        { id: 1, email: 'user1@example.com' },
        { id: 2, email: 'user2@example.com' }
      ]);
    }

    if (lower.includes('from pg_stats')) {
      return createResult([
        {
          column_name: 'id',
          n_distinct: 2,
          null_frac: 0,
          avg_width: 4,
          most_common_vals: [],
          most_common_freqs: [],
          correlation: 0.5
        },
        {
          column_name: 'email',
          n_distinct: 2,
          null_frac: 0,
          avg_width: 32,
          most_common_vals: [],
          most_common_freqs: [],
          correlation: 0.1
        }
      ]);
    }

    if (normalized === 'select 1') {
      return createResult([{ '?column?': 1 }]);
    }

    // Default empty result for unhandled queries
    return createResult([]);
  }

  async end() {
    this.closed = true;
  }
}

Module._load = function patchedLoad(...args) {
  const [request] = args;
  if (request === 'pg') {
    return { Client: MockClient };
  }
  return originalLoad.apply(this, args);
};
