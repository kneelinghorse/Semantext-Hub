import fs from 'node:fs/promises';
import path from 'node:path';

import {
  buildPayload,
  cosineSimilarity,
  ensureStringArray,
  toPlainArray
} from './utils.mjs';

const DEFAULT_COLLECTION = 'protocol_vectors';
const DEFAULT_QDRANT_URL = 'http://localhost:6333';
const DEFAULT_DISTANCE = 'Cosine';
const DEFAULT_VECTOR_SIZE = 768;
const DEFAULT_TIMEOUT_MS = 5000;

class QdrantHttpClient {
  constructor(options = {}) {
    this.url = (options.url ?? DEFAULT_QDRANT_URL).replace(/\/$/, '');
    this.apiKey = options.apiKey ?? null;
    this.timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(0, Number(options.timeoutMs))
      : DEFAULT_TIMEOUT_MS;
    this.fetch = options.fetchImpl ?? globalThis.fetch;

    if (typeof this.fetch !== 'function') {
      throw new Error('Fetch API is not available. Provide options.fetchImpl when constructing the adapter.');
    }
  }

  #buildHeaders(hasBody) {
    const headers = {};
    if (hasBody) {
      headers['content-type'] = 'application/json';
    }
    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
    }
    return headers;
  }

  async #request(pathname, { method = 'GET', body, allowNotFound = false } = {}) {
    const controller = this.timeoutMs > 0 ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), this.timeoutMs)
      : null;

    try {
      const response = await this.fetch(`${this.url}${pathname}`, {
        method,
        headers: this.#buildHeaders(body != null),
        body: body != null ? JSON.stringify(body) : undefined,
        signal: controller?.signal
      });

      const contentType = response.headers?.get?.('content-type') ?? '';
      const isJson = contentType.includes('application/json');
      const payload = isJson ? await response.json() : null;

      if (response.ok) {
        return { data: payload, status: response.status };
      }

      if (allowNotFound && response.status === 404) {
        return { data: payload, status: response.status, notFound: true };
      }

      const message = payload?.status ?? payload?.error ?? response.statusText ?? 'Request failed';
      throw new Error(`Qdrant request failed (${response.status}): ${message}`);
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error(`Qdrant request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  async ensureCollection(name, { vectorSize, distance }) {
    const encoded = encodeURIComponent(name);
    const existing = await this.#request(`/collections/${encoded}`, { allowNotFound: true });
    if (!existing.notFound) {
      return existing.data;
    }

    const body = {
      vectors: {
        size: vectorSize,
        distance
      }
    };

    const response = await this.#request(`/collections/${encoded}`, {
      method: 'PUT',
      body
    });
    return response.data;
  }

  async upsert(name, points) {
    const encoded = encodeURIComponent(name);
    await this.#request(`/collections/${encoded}/points?wait=true`, {
      method: 'PUT',
      body: { points }
    });
  }

  async search(name, query) {
    const encoded = encodeURIComponent(name);
    const response = await this.#request(`/collections/${encoded}/points/search`, {
      method: 'POST',
      body: {
        vector: query.vector,
        limit: query.limit,
        with_payload: true,
        with_vectors: Boolean(query.withVectors),
        filter: query.filter ?? undefined
      }
    });
    const data = response.data?.result;
    return Array.isArray(data) ? data : [];
  }

  async delete(name, ids) {
    const encoded = encodeURIComponent(name);
    await this.#request(`/collections/${encoded}/points/delete?wait=true`, {
      method: 'POST',
      body: { points: ids }
    });
  }
}

export class QdrantAdapter {
  constructor(options = {}) {
    this.logger = options.logger ?? console;
    this.collectionName = options.collectionName ?? DEFAULT_COLLECTION;
    this.url = options.url ?? options.baseUrl ?? DEFAULT_QDRANT_URL;
    this.apiKey = options.apiKey ?? options.token ?? null;
    this.vectorSize = Number.isFinite(options.vectorSize)
      ? Number(options.vectorSize)
      : DEFAULT_VECTOR_SIZE;
    this.distance = options.distance ?? DEFAULT_DISTANCE;
    this.timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(0, Number(options.timeoutMs))
      : DEFAULT_TIMEOUT_MS;
    this.enableFallback = options.enableFallback !== false;

    this.workspace = options.workspace ? path.resolve(options.workspace) : process.cwd();
    this.fallbackDir = options.fallbackDir
      ? path.resolve(this.workspace, options.fallbackDir)
      : path.resolve(this.workspace, 'data/qdrant');
    this.fallbackFileOverride = options.fallbackFile
      ? path.resolve(this.workspace, options.fallbackFile)
      : null;

    this.client = options.client ?? null;
    this.fetch = options.fetch ?? options.fetchImpl ?? null;

    this.mode = 'uninitialized';
    this.initialized = false;
    this._records = new Map();
    this._fallbackFile = null;
    this._hasPendingWrites = false;
  }

  async initialize(collectionName) {
    if (collectionName) {
      this.collectionName = collectionName;
    }

    if (!this.client) {
      this.client = new QdrantHttpClient({
        url: this.url,
        apiKey: this.apiKey,
        timeoutMs: this.timeoutMs,
        fetchImpl: this.fetch ?? globalThis.fetch
      });
    }

    if (this.enableFallback) {
      await fs.mkdir(this.fallbackDir, { recursive: true });
      this._fallbackFile = this.fallbackFileOverride
        ? this.fallbackFileOverride
        : path.join(this.fallbackDir, `${this.collectionName}.json`);
      await this.#loadFallback();
    }

    try {
      await this.client.ensureCollection(this.collectionName, {
        vectorSize: this.vectorSize,
        distance: this.distance
      });
      this.mode = 'qdrant';
    } catch (error) {
      if (!this.enableFallback) {
        throw error;
      }
      this.mode = 'fallback';
      this.logger.warn?.(
        `[qdrant] Falling back to JSON vector store (${error.message ?? error})`
      );
    }

    this.initialized = true;
  }

  async upsert(records) {
    if (!Array.isArray(records) || records.length === 0) {
      return;
    }

    if (this.mode === 'qdrant') {
      const points = records
        .map((record) => {
          const key = record?.payload?.tool_id ?? record?.payload?.urn;
          if (!key) {
            return null;
          }
          return {
            id: String(key),
            vector: toPlainArray(record.vector),
            payload: {
              ...record.payload,
              tool_id: String(key),
              tags: ensureStringArray(record.payload?.tags ?? []),
              capabilities: ensureStringArray(record.payload?.capabilities ?? [])
            }
          };
        })
        .filter(Boolean);

      if (points.length === 0) {
        return;
      }

      await this.client.upsert(this.collectionName, points);
      return;
    }

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
      this._hasPendingWrites = true;
    }

    if (this._fallbackFile) {
      await this.flush();
    }
  }

  async search(queryVector, options = {}) {
    const limitCandidate = Number(options.limit);
    const limit = Number.isFinite(limitCandidate) && limitCandidate > 0
      ? Math.min(Math.floor(limitCandidate), options.maxLimit || limitCandidate)
      : 10;
    const includeVectors = Boolean(options.includeVectors);
    const vector = toPlainArray(queryVector);
    if (vector.length === 0) {
      return [];
    }

    if (this.mode === 'qdrant') {
      const results = await this.client.search(this.collectionName, {
        vector,
        limit,
        withVectors: includeVectors,
        filter: options.filter
      });

      return results.map((entry) => ({
        payload: buildPayload(entry),
        vector: includeVectors ? toPlainArray(entry.vector) : undefined,
        score: typeof entry.score === 'number' ? entry.score : null
      }));
    }

    const records = this.#getFallbackRecords();
    if (records.length === 0) {
      return [];
    }

    const ranked = [];
    for (const entry of records) {
      const payload = buildPayload(entry);
      const candidateVector = toPlainArray(entry.vector ?? entry?.payload?.vector);
      if (!candidateVector.length) {
        continue;
      }
      const score = cosineSimilarity(vector, candidateVector);
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

  async delete(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      return;
    }

    const keys = ids
      .map((id) => (typeof id === 'string' ? id.trim() : String(id ?? '').trim()))
      .filter((id) => id.length > 0);

    if (keys.length === 0) {
      return;
    }

    if (this.mode === 'qdrant') {
      await this.client.delete(this.collectionName, keys);
      return;
    }

    let removed = false;
    for (const key of keys) {
      removed = this._records.delete(key) || removed;
    }

    if (removed && this._fallbackFile) {
      this._hasPendingWrites = true;
      await this.flush();
    }
  }

  async flush() {
    if (!this._fallbackFile || this._records.size === 0) {
      if (this._fallbackFile && this._hasPendingWrites) {
        await fs.writeFile(this._fallbackFile, JSON.stringify(this.#getFallbackRecords(), null, 2), 'utf8');
        this._hasPendingWrites = false;
      }
      return;
    }

    if (this._hasPendingWrites) {
      await fs.writeFile(this._fallbackFile, JSON.stringify(this.#getFallbackRecords(), null, 2), 'utf8');
      this._hasPendingWrites = false;
    }
  }

  async close() {
    if (this.mode === 'fallback') {
      await this.flush();
    }
  }

  async getAllVectors() {
    if (this.mode === 'fallback') {
      return this.#getFallbackRecords();
    }
    return [];
  }

  async #loadFallback() {
    if (!this._fallbackFile) {
      return;
    }
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
      // No existing fallback file; start fresh.
    }
  }

  #getFallbackRecords() {
    return Array.from(this._records.values());
  }
}

export default QdrantAdapter;
