import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { EmbeddingService } from '../../registry-loader/embedding-service.mjs';
import {
  VECTOR_STORE_DRIVERS,
  createVectorStoreAdapter
} from '../../vector-store/index.mjs';
import { openDb } from '../../registry/db.mjs';
import { IAMFilter } from './iam-filter.js';

const DEFAULT_COLLECTION = 'protocol_registry_vectors';
const DEFAULT_LIMIT = 10;
const DEFAULT_MAX_LIMIT = 25;

const coerceStringArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set();
  const normalised = [];
  for (const entry of value) {
    if (entry == null) {
      continue;
    }
    const text = typeof entry === 'string' ? entry.trim() : String(entry).trim();
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    normalised.push(text);
  }
  return normalised;
};

export class ToolHubSearchService {
  constructor(options = {}) {
    this.logger = options.logger ?? console;

    this.embeddingService = options.embeddingService ?? null;
    this.embeddingOptions = options.embeddingOptions ?? {};

    this.vectorStore = options.vectorStore ?? null;
    this.vectorOptions = options.vectorOptions ?? {};

    this.workspace = options.workspace ? path.resolve(options.workspace) : process.cwd();

    const envVectorDriver = process.env.SEMANTEXT_VECTOR_DRIVER;
    const rawVectorDriver = options.vectorDriver ?? envVectorDriver ?? VECTOR_STORE_DRIVERS.LANCEDB;
    this.vectorDriver = String(rawVectorDriver).trim().toLowerCase() || VECTOR_STORE_DRIVERS.LANCEDB;

    if (this.vectorDriver === VECTOR_STORE_DRIVERS.QDRANT) {
      const qdrantUrl = options.qdrantUrl ?? process.env.SEMANTEXT_QDRANT_URL;
      const qdrantApiKey = options.qdrantApiKey ?? process.env.SEMANTEXT_QDRANT_API_KEY;
      const qdrantVectorSize = options.qdrantVectorSize ?? process.env.SEMANTEXT_VECTOR_DIMENSION;
      const qdrantDistance = options.qdrantDistance ?? process.env.SEMANTEXT_QDRANT_DISTANCE;

      this.vectorOptions = {
        workspace: this.workspace,
        ...this.vectorOptions,
        ...(qdrantUrl ? { url: qdrantUrl } : {}),
        ...(qdrantApiKey ? { apiKey: qdrantApiKey } : {}),
        ...(qdrantVectorSize ? { vectorSize: Number(qdrantVectorSize) } : {}),
        ...(qdrantDistance ? { distance: qdrantDistance } : {})
      };
    } else {
      this.vectorOptions = {
        workspace: this.workspace,
        ...this.vectorOptions
      };
    }

    this.iamFilter =
      options.iamFilter ??
      new IAMFilter({
        authorize: options.authorize,
        logger: this.logger
      });

    this.metadataResolver = options.metadataResolver ?? null;

    this.dbPath = options.dbPath
      ? path.resolve(options.dbPath)
      : path.resolve(process.cwd(), 'var/registry.sqlite');
    this.lanceDbPath = options.lanceDbPath
      ? path.resolve(options.lanceDbPath)
      : path.resolve(process.cwd(), 'data/lancedb');
    this.collectionName = options.collectionName || DEFAULT_COLLECTION;

    this.defaultLimit = Math.max(1, Math.min(options.defaultLimit ?? DEFAULT_LIMIT, options.maxLimit ?? DEFAULT_MAX_LIMIT));
    this.maxLimit = Math.max(this.defaultLimit, options.maxLimit ?? DEFAULT_MAX_LIMIT);

    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    if (this.embeddingService) {
      if (typeof this.embeddingService.initialize === 'function') {
        await this.embeddingService.initialize();
      }
    } else {
      this.embeddingService = await EmbeddingService.getInstance({
        ...this.embeddingOptions,
        logger: this.logger
      });
    }

    if (this.vectorStore) {
      if (typeof this.vectorStore.initialize === 'function') {
        await this.vectorStore.initialize(this.collectionName);
      }
    } else {
      this.vectorStore = createVectorStoreAdapter({
        driver: this.vectorDriver,
        lancedbPath: this.lanceDbPath,
        collectionName: this.collectionName,
        logger: this.logger,
        workspace: this.workspace,
        vectorOptions: this.vectorOptions
      });
      await this.vectorStore.initialize(this.collectionName);
    }

    this.initialized = true;
  }

  async shutdown() {
    if (this.vectorStore?.close) {
      await this.vectorStore.close();
    }
  }

  async search(params = {}) {
    const { query, limit, actor, includeVectors = false } = params;
    const trimmedQuery = typeof query === 'string' ? query.trim() : '';

    if (!trimmedQuery) {
      throw new Error('Search query is required.');
    }

    await this.initialize();

    const limitValue = this.#normaliseLimit(limit);
    const timings = {};

    const totalStart = performance.now();

    const embeddingStart = performance.now();
    const queryVector = await this.embeddingService.embedQuery(trimmedQuery);
    timings.embeddingMs = performance.now() - embeddingStart;

    const vectorStart = performance.now();
    const rawResults = await this.vectorStore.search(queryVector, {
      limit: limitValue,
      maxLimit: this.maxLimit,
      includeVectors
    });
    timings.vectorSearchMs = performance.now() - vectorStart;

    const enrichStart = performance.now();
    const enriched = await this.#enrichResults(rawResults, { includeVectors });
    timings.enrichmentMs = performance.now() - enrichStart;

    const filterStart = performance.now();
    const filtered = await this.iamFilter.filter(enriched, actor);
    timings.iamFilterMs = performance.now() - filterStart;

    timings.totalMs = performance.now() - totalStart;

    return {
      ok: true,
      query: trimmedQuery,
      limit: limitValue,
      returned: filtered.length,
      totalCandidates: Array.isArray(rawResults) ? rawResults.length : 0,
      results: filtered,
      timings
    };
  }

  #normaliseLimit(limit) {
    const candidate = Number(limit);
    if (Number.isFinite(candidate) && candidate > 0) {
      return Math.max(1, Math.min(Math.floor(candidate), this.maxLimit));
    }
    return this.defaultLimit;
  }

  async #enrichResults(rawResults, { includeVectors }) {
    if (!Array.isArray(rawResults) || rawResults.length === 0) {
      return [];
    }

    const urns = rawResults
      .map((entry) => entry?.payload?.urn ?? entry?.payload?.tool_id ?? null)
      .filter((urn, index, all) => typeof urn === 'string' && urn.trim() && all.indexOf(urn) === index);

    const metadata = await this.#resolveMetadata(urns);

    return rawResults.map((entry, index) => {
      const payload = entry?.payload ?? {};
      const urn = payload.urn ?? payload.tool_id ?? null;
      const meta = urn ? metadata[urn] ?? {} : {};

      const capabilities = coerceStringArray(
        payload.capabilities && payload.capabilities.length
          ? payload.capabilities
          : meta.capabilities ?? []
      );

      return {
        rank: index + 1,
        tool_id: payload.tool_id ?? urn,
        urn,
        name: payload.name ?? null,
        summary: payload.summary ?? null,
        tags: coerceStringArray(payload.tags ?? []),
        capabilities,
        schema_uri: meta.schemaUri ?? null,
        score: typeof entry?.score === 'number' ? entry.score : null,
        ...(includeVectors && entry?.vector ? { vector: entry.vector } : {})
      };
    });
  }

  async #resolveMetadata(urns) {
    if (!urns || urns.length === 0) {
      return {};
    }

    if (typeof this.metadataResolver === 'function') {
      try {
        const resolved = await this.metadataResolver(urns);
        return resolved && typeof resolved === 'object' ? resolved : {};
      } catch (error) {
        this.logger?.warn?.('[tool-hub-search] Custom metadata resolver failed', {
          error: error?.message ?? error
        });
      }
    }

    let db;
    const result = {};
    try {
      db = await openDb({ dbPath: this.dbPath });
      const placeholders = urns.map(() => '?').join(',');
      const params = [...urns];

      if (placeholders) {
        const manifestRows = await db.all(
          `SELECT urn, body FROM manifests WHERE urn IN (${placeholders})`,
          params
        );

        for (const row of manifestRows) {
          try {
            const manifest = JSON.parse(row.body);
            const schemaUri =
              manifest?.metadata?.schema ??
              manifest?.metadata?.schema_uri ??
              manifest?.schema ??
              null;
            result[row.urn] = {
              ...(result[row.urn] || {}),
              schemaUri
            };
          } catch {
            result[row.urn] = {
              ...(result[row.urn] || {}),
              schemaUri: null
            };
          }
        }

        const capabilityRows = await db.all(
          `SELECT urn, cap FROM capabilities WHERE urn IN (${placeholders})`,
          params
        );

        for (const row of capabilityRows) {
          const existing = result[row.urn]?.capabilities ?? [];
          result[row.urn] = {
            ...(result[row.urn] || {}),
            capabilities: [...existing, row.cap]
          };
        }
      }
    } catch (error) {
      this.logger?.warn?.('[tool-hub-search] Failed to resolve metadata from registry', {
        error: error?.message ?? error
      });
    } finally {
      if (db?.close) {
        await db.close();
      }
    }

    return result;
  }
}

export default ToolHubSearchService;
