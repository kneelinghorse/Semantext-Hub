import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_COLLECTION = 'protocol_vectors';
const COSINE_EPSILON = 1e-9;

const ensureStringArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (entry == null) {
        return null;
      }
      if (typeof entry === 'string') {
        return entry.trim();
      }
      return String(entry).trim();
    })
    .filter((entry) => entry && entry.length > 0);
};

const toPlainArray = (vector) => {
  if (!vector) {
    return [];
  }
  if (Array.isArray(vector)) {
    return vector.slice();
  }
  if (ArrayBuffer.isView(vector)) {
    return Array.from(vector);
  }
  if (typeof vector.toArray === 'function') {
    try {
      const result = vector.toArray();
      return Array.isArray(result) ? result.slice() : Array.from(result ?? []);
    } catch {
      return [];
    }
  }
  if (typeof vector === 'object' && typeof vector.length === 'number') {
    try {
      return Array.from(vector);
    } catch {
      return [];
    }
  }
  return [];
};

const cosineSimilarity = (a, b) => {
  const lhs = toPlainArray(a);
  const rhs = toPlainArray(b);
  const length = Math.min(lhs.length, rhs.length);
  if (length === 0) {
    return 0;
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < length; i += 1) {
    const ax = lhs[i];
    const bx = rhs[i];
    if (!Number.isFinite(ax) || !Number.isFinite(bx)) {
      continue;
    }
    dot += ax * bx;
    magA += ax * ax;
    magB += bx * bx;
  }
  if (magA <= COSINE_EPSILON || magB <= COSINE_EPSILON) {
    return 0;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
};

const buildPayload = (entry) => {
  const payloadSource =
    entry && typeof entry === 'object' && entry.payload && typeof entry.payload === 'object'
      ? entry.payload
      : {};

  const toolIdCandidate =
    payloadSource.tool_id ??
    entry?.tool_id ??
    payloadSource.urn ??
    entry?.urn ??
    null;

  const urnCandidate =
    payloadSource.urn ??
    entry?.urn ??
    (toolIdCandidate ? String(toolIdCandidate) : null);

  return {
    tool_id: toolIdCandidate ? String(toolIdCandidate) : null,
    urn: urnCandidate ? String(urnCandidate) : null,
    name: payloadSource.name ?? entry?.name ?? null,
    summary: payloadSource.summary ?? entry?.summary ?? null,
    tags: ensureStringArray(payloadSource.tags ?? entry?.tags ?? []),
    capabilities: ensureStringArray(payloadSource.capabilities ?? entry?.capabilities ?? [])
  };
};

export class LanceDBAdapter {
  constructor(options = {}) {
    this.dbPath =
      options.dbPath ??
      options.directory ??
      path.resolve(process.cwd(), 'data/lancedb');
    this.collectionName = options.collectionName || DEFAULT_COLLECTION;
    this.logger = options.logger || console;
    this.initialized = false;
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
      this.initialized = true;
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

    this.initialized = true;
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
          tags: ensureStringArray(record.payload?.tags ?? []),
          capabilities: ensureStringArray(record.payload?.capabilities ?? []),
          vector: toPlainArray(record.vector)
        })));
        return;
      }

      if (typeof this._table.add === 'function') {
        await this._table.add(records.map((record) => ({
          tool_id: record.payload?.tool_id ?? record.payload?.urn,
          urn: record.payload?.urn ?? record.payload?.tool_id,
          name: record.payload?.name ?? null,
          summary: record.payload?.summary ?? null,
          tags: ensureStringArray(record.payload?.tags ?? []),
          capabilities: ensureStringArray(record.payload?.capabilities ?? []),
          vector: toPlainArray(record.vector)
        })));
        return;
      }
    }

    // Fallback mode: store in memory and persist to JSON file
    for (const record of records) {
      const key = record?.payload?.tool_id ?? record?.payload?.urn;
      if (!key) continue;
      this._records.set(String(key), {
        vector: toPlainArray(record.vector),
        payload: {
          ...record.payload,
          tool_id: String(key),
          tags: ensureStringArray(record.payload?.tags ?? []),
          capabilities: ensureStringArray(record.payload?.capabilities ?? [])
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

  async search(queryVector, options = {}) {
    const limitCandidate = Number(options.limit);
    const limit = Number.isFinite(limitCandidate) && limitCandidate > 0
      ? Math.min(Math.floor(limitCandidate), options.maxLimit || limitCandidate)
      : 10;
    const includeVectors = Boolean(options.includeVectors);
    const query = toPlainArray(queryVector);
    if (query.length === 0) {
      return [];
    }

    if (this.mode === 'lancedb' && this._table) {
      const nativeSearch = this._table?.search;
      if (typeof nativeSearch === 'function') {
        try {
          let builder = nativeSearch.call(this._table, query);
          if (typeof builder.limit === 'function') {
            builder = builder.limit(limit);
          }
          if (options.where && typeof builder.where === 'function') {
            builder = builder.where(options.where);
          }
          const rows = typeof builder.execute === 'function'
            ? await builder.execute()
            : typeof builder.toArray === 'function'
              ? await builder.toArray()
              : [];

          if (Array.isArray(rows) && rows.length > 0) {
            return rows.slice(0, limit).map((row) => {
              const payload = buildPayload(row);
              const distance = typeof row._distance === 'number' ? row._distance : null;
              const rowScore =
                typeof row.score === 'number'
                  ? row.score
                  : distance != null
                    ? 1 / (1 + distance)
                    : null;
              return {
                payload,
                vector: includeVectors ? toPlainArray(row.vector) : undefined,
                score: rowScore
              };
            });
          }
        } catch (error) {
          this.logger?.warn?.(
            `[lancedb] Native vector search failed, falling back to manual ranking (${error.message ?? error})`
          );
        }
      }
    }

    const records = await this.getAllVectors();
    if (!Array.isArray(records) || records.length === 0) {
      return [];
    }

    const ranked = [];
    for (const entry of records) {
      const payload = buildPayload(entry);
      const candidateVector = toPlainArray(entry.vector ?? entry?.payload?.vector);
      if (!candidateVector.length) {
        continue;
      }
      const score = cosineSimilarity(query, candidateVector);
      if (!Number.isFinite(score)) {
        continue;
      }
      ranked.push({
        payload,
        vector: includeVectors ? candidateVector : undefined,
        score
      });
    }

    ranked.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return ranked.slice(0, limit);
  }
}

export default LanceDBAdapter;
