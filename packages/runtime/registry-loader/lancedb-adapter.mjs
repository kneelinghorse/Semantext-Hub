import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_COLLECTION = 'protocol_vectors';

export class LanceDBAdapter {
  constructor(options = {}) {
    this.dbPath =
      options.dbPath ??
      options.directory ??
      path.resolve(process.cwd(), 'data/lancedb');
    this.collectionName = options.collectionName || DEFAULT_COLLECTION;
    this.logger = options.logger || console;

    this.mode = 'uninitialized';
    this._connection = null;
    this._table = null;
    this._records = new Map();
    this._fallbackFile = null;
  }

  async initialize(collectionName) {
    if (collectionName) {
      this.collectionName = collectionName;
    }

    const resolvedPath = path.resolve(this.dbPath);
    await fs.mkdir(resolvedPath, { recursive: true });
    this.dbPath = resolvedPath;

    try {
      const module = await import('@lancedb/lancedb');
      const connect = module?.connect ?? module?.default?.connect;
      if (!connect) {
        throw new Error('Unable to resolve LanceDB connect API.');
      }
      this._connection = await connect(resolvedPath);

      const existingTables = typeof this._connection.tableNames === 'function'
        ? await this._connection.tableNames()
        : [];

      if (existingTables.includes(this.collectionName)) {
        this._table = await this._connection.openTable(this.collectionName);
      } else if (typeof this._connection.createTable === 'function') {
        this._table = await this._connection.createTable(this.collectionName, [], {
          mode: 'overwrite'
        });
      } else {
        throw new Error('LanceDB client missing createTable implementation.');
      }

      this.mode = 'lancedb';
      return;
    } catch (error) {
      this.mode = 'fallback';
      this.logger.warn?.(
        `[lancedb] Falling back to JSON vector store (${error.message ?? error})`
      );
      this._fallbackFile = path.join(resolvedPath, `${this.collectionName}.json`);
      try {
        const raw = await fs.readFile(this._fallbackFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            const key = entry?.payload?.tool_id ?? entry?.payload?.urn;
            if (key) {
              this._records.set(String(key), entry);
            }
          }
        }
      } catch {
        // No existing fallback data
      }
    }
  }

  async upsert(records) {
    if (!Array.isArray(records) || records.length === 0) {
      return;
    }

    if (this.mode === 'lancedb' && this._table) {
      if (typeof this._table.mergeInsert === 'function') {
        const builder = this._table.mergeInsert('tool_id')
          .whenMatchedUpdateAll()
          .whenNotMatchedInsertAll();
        await builder.execute(records.map((record) => ({
          tool_id: record.payload?.tool_id ?? record.payload?.urn,
          urn: record.payload?.urn ?? record.payload?.tool_id,
          name: record.payload?.name ?? null,
          summary: record.payload?.summary ?? null,
          tags: record.payload?.tags ?? [],
          vector: record.vector
        })));
        return;
      }

      if (typeof this._table.add === 'function') {
        await this._table.add(records.map((record) => ({
          tool_id: record.payload?.tool_id ?? record.payload?.urn,
          urn: record.payload?.urn ?? record.payload?.tool_id,
          name: record.payload?.name ?? null,
          summary: record.payload?.summary ?? null,
          tags: record.payload?.tags ?? [],
          vector: record.vector
        })));
        return;
      }
    }

    // Fallback mode: store in memory and persist to JSON file
    for (const record of records) {
      const key = record?.payload?.tool_id ?? record?.payload?.urn;
      if (!key) continue;
      this._records.set(String(key), {
        vector: record.vector,
        payload: {
          ...record.payload,
          tool_id: String(key)
        }
      });
    }

    if (this._fallbackFile) {
      const serialisable = Array.from(this._records.values());
      await fs.writeFile(this._fallbackFile, JSON.stringify(serialisable, null, 2), 'utf8');
    }
  }

  async flush() {
    if (this.mode === 'fallback' && this._fallbackFile) {
      const serialisable = Array.from(this._records.values());
      await fs.writeFile(this._fallbackFile, JSON.stringify(serialisable, null, 2), 'utf8');
    }
  }

  async close() {
    if (this.mode === 'lancedb' && this._connection?.close) {
      await this._connection.close();
    } else if (this.mode === 'fallback') {
      await this.flush();
    }
  }

  /**
   * Utility for tests to introspect stored vectors.
   */
  async getAllVectors() {
    if (this.mode === 'fallback') {
      return Array.from(this._records.values());
    }
    if (this._table?.toArray) {
      return await this._table.toArray();
    }
    return [];
  }
}

export default LanceDBAdapter;
