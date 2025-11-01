import fs from 'node:fs/promises';
import path from 'node:path';

import { openDb, ensureSchema } from '../registry/db.mjs';
import { upsertManifest } from '../registry/repository.mjs';

import { EmbeddingService } from './embedding-service.mjs';
import { LanceDBAdapter } from './lancedb-adapter.mjs';

const DEFAULT_COLLECTION = 'protocol_registry_vectors';
const DEFAULT_BATCH_SIZE = 32;

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function* walkDirectory(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const resolved = path.join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walkDirectory(resolved);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
      yield resolved;
    }
  }
}

function extractCapabilities(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return [];
  }

  const values = new Set();

  const pushEntry = (entry) => {
    if (!entry) return;
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed) values.add(trimmed);
      return;
    }
    if (typeof entry !== 'object') return;
    if (typeof entry.capability === 'string' && entry.capability.trim()) {
      values.add(entry.capability.trim());
    }
    if (typeof entry.urn === 'string' && entry.urn.trim()) {
      values.add(entry.urn.trim());
    }
  };

  const rootCaps = manifest.capabilities;
  if (Array.isArray(rootCaps)) {
    for (const entry of rootCaps) {
      pushEntry(entry);
    }
  } else if (rootCaps && typeof rootCaps === 'object') {
    if (Array.isArray(rootCaps.tools)) {
      for (const entry of rootCaps.tools) {
        pushEntry(entry);
      }
    }
    if (Array.isArray(rootCaps.resources)) {
      for (const entry of rootCaps.resources) {
        pushEntry(entry);
      }
    }
  }

  return Array.from(values);
}

function extractMetadata(manifest, filePath) {
  const capabilities = extractCapabilities(manifest);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`Manifest at ${filePath} is not a JSON object.`);
  }

  const urn =
    manifest.urn ??
    manifest?.metadata?.urn ??
    manifest?.metadata?.id ??
    manifest?.id ??
    null;
  if (!urn || typeof urn !== 'string' || !urn.trim()) {
    throw new Error(`Manifest at ${filePath} is missing required urn field.`);
  }

  const name =
    manifest.name ??
    manifest.title ??
    manifest?.metadata?.name ??
    manifest?.metadata?.title ??
    path.basename(filePath, path.extname(filePath));

  const summary =
    manifest.summary ??
    manifest.description ??
    manifest?.metadata?.summary ??
    manifest?.metadata?.description ??
    '';

  const tags = Array.isArray(manifest.tags)
    ? manifest.tags.map(String)
    : Array.isArray(manifest.keywords)
      ? manifest.keywords.map(String)
      : [];

  const searchParts = [
    name,
    summary,
    Array.isArray(tags) && tags.length > 0 ? tags.join(' ') : '',
    capabilities.length > 0 ? capabilities.join(' ') : ''
  ]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean);

  const searchDocument = searchParts.length > 0
    ? searchParts.join(' ')
    : `${urn}`;

  return {
    urn,
    name,
    summary,
    tags,
    capabilities,
    manifest,
    filePath,
    searchDocument
  };
}

export class RegistryLoader {
  constructor(options = {}) {
    this.workspace = options.workspace
      ? path.resolve(options.workspace)
      : process.cwd();
    this.directory = options.directory
      ? path.resolve(this.workspace, options.directory)
      : path.resolve(this.workspace, 'artifacts/protocols');
    this.dbPath = options.dbPath
      ? path.resolve(this.workspace, options.dbPath)
      : path.resolve(this.workspace, 'var/registry.sqlite');
    this.lanceDbPath = options.lancedbPath
      ? path.resolve(this.workspace, options.lancedbPath)
      : path.resolve(this.workspace, 'data/lancedb');
    this.collectionName = options.collectionName || DEFAULT_COLLECTION;
    this.batchSize = Number.isInteger(options.batchSize)
      ? Math.max(1, options.batchSize)
      : DEFAULT_BATCH_SIZE;
    this.dryRun = Boolean(options.dryRun);
    this.logger = options.logger || console;

    this.embeddingService = options.embeddingService || null;
    this.embeddingOptions = options.embeddingOptions || {};

    this.vectorStore = options.vectorStore || null;
    this.vectorOptions = options.vectorOptions || {};
  }

  async #resolveEmbeddingService() {
    if (this.embeddingService) {
      if (typeof this.embeddingService.initialize === 'function') {
        await this.embeddingService.initialize();
      }
      return this.embeddingService;
    }
    const service = await EmbeddingService.getInstance({
      modelId: this.embeddingOptions.modelId,
      batchSize: this.batchSize,
      logger: this.logger
    });
    return service;
  }

  async #resolveVectorStore() {
    if (this.vectorStore) {
      if (typeof this.vectorStore.initialize === 'function') {
        await this.vectorStore.initialize(this.collectionName);
      }
      return this.vectorStore;
    }
    const adapter = new LanceDBAdapter({
      dbPath: this.lanceDbPath,
      collectionName: this.collectionName,
      logger: this.logger
    });
    await adapter.initialize(this.collectionName);
    return adapter;
  }

  async load(customDirectory) {
    const targetDirectory = customDirectory
      ? path.resolve(this.workspace, customDirectory)
      : this.directory;

    if (!(await pathExists(targetDirectory))) {
      throw new Error(`Registry directory not found: ${targetDirectory}`);
    }

    const manifests = [];
    for await (const file of walkDirectory(targetDirectory)) {
      try {
        const raw = await fs.readFile(file, 'utf8');
        let parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          parsed.manifest &&
          typeof parsed.manifest === 'object'
        ) {
          parsed = parsed.manifest;
        }
        manifests.push(extractMetadata(parsed, file));
      } catch (error) {
        this.logger.warn?.(
          `[registry-loader] Skipping ${file}: ${error.message ?? error}`
        );
      }
    }

    if (manifests.length === 0) {
      this.logger.info?.(
        `[registry-loader] No manifests discovered under ${targetDirectory}`
      );
      return {
        directory: targetDirectory,
        dbPath: this.dbPath,
        lancedbPath: this.lanceDbPath,
        manifestsProcessed: 0,
        embeddingsGenerated: 0,
        dryRun: this.dryRun
      };
    }

    const embeddingService = await this.#resolveEmbeddingService();
    const vectorStore = await this.#resolveVectorStore();

    let db = null;
    let schemaResult = null;

    if (!this.dryRun) {
      db = await openDb({ dbPath: this.dbPath });
      schemaResult = await ensureSchema(db, { allowMigration: true });
    }

    const summaries = [];

    try {
      if (!this.dryRun) {
        for (const entry of manifests) {
          await upsertManifest(db, entry.urn, entry.manifest);
          summaries.push({
            urn: entry.urn,
            source: entry.filePath
          });
        }
      }

      const documents = manifests.map((entry) => entry.searchDocument);
      const embeddings = await embeddingService.embedDocuments(documents);

      if (!this.dryRun) {
        const payloads = manifests.map((entry, index) => ({
          vector: embeddings[index] ?? [],
          payload: {
            tool_id: entry.urn,
            urn: entry.urn,
            name: entry.name,
            summary: entry.summary,
            tags: entry.tags,
            capabilities: entry.capabilities
          }
        }));
        await vectorStore.upsert(payloads);
      }

      return {
        directory: targetDirectory,
        dbPath: this.dbPath,
        lancedbPath: this.lanceDbPath,
        manifestsProcessed: manifests.length,
        embeddingsGenerated: manifests.length,
        dryRun: this.dryRun,
        schemaResult,
        vectorMode: vectorStore.mode,
        embeddingMode: embeddingService.mode,
        manifestSummaries: summaries
      };
    } finally {
      if (db?.close) {
        await db.close();
      }
      if (vectorStore?.close) {
        await vectorStore.close();
      }
    }
  }
}

export async function loadRegistry(options = {}) {
  const loader = new RegistryLoader(options);
  return loader.load();
}

export { EmbeddingService } from './embedding-service.mjs';
export { LanceDBAdapter } from './lancedb-adapter.mjs';
