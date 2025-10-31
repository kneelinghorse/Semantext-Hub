import crypto from 'node:crypto';

const DEFAULT_MODEL_ID = 'nomic-embed-text-v1.5';
const DEFAULT_DIMENSIONS = 768;
const DEFAULT_BATCH_SIZE = 32;

/**
 * Compute a deterministic pseudo-random vector using hashing as a fallback
 * when the Hugging Face transformers pipeline is unavailable.
 */
function computeFallbackEmbedding(text, dimensions = DEFAULT_DIMENSIONS) {
  const values = new Array(dimensions);
  let buffer = Buffer.alloc(0);
  let counter = 0;

  while (buffer.length < dimensions * 4) {
    const hash = crypto
      .createHash('sha256')
      .update(text)
      .update(String(counter++))
      .digest();
    buffer = Buffer.concat([buffer, hash]);
  }

  for (let i = 0; i < dimensions; i += 1) {
    const offset = i * 4;
    const intValue = buffer.readInt32BE(offset);
    values[i] = intValue / 0x7fffffff;
  }

  return values;
}

export class EmbeddingService {
  static #instance = null;
  static #initializing = null;

  static async getInstance(options = {}) {
    if (this.#instance) {
      return this.#instance;
    }
    if (!this.#initializing) {
      this.#initializing = (async () => {
        const service = new EmbeddingService(options);
        await service.initialize();
        this.#instance = service;
        return service;
      })();
    }
    return this.#initializing;
  }

  constructor(options = {}) {
    this.modelId = options.modelId || options.model || DEFAULT_MODEL_ID;
    this.batchSize = Number.isInteger(options.batchSize)
      ? Math.max(1, options.batchSize)
      : DEFAULT_BATCH_SIZE;
    this.dimensions = Number.isInteger(options.dimensions)
      ? Math.max(16, options.dimensions)
      : DEFAULT_DIMENSIONS;
    this.logger = options.logger || console;
    this.pipelineFactory = options.pipelineFactory || null;

    this.initialized = false;
    this.mode = 'uninitialized';
    this._pipeline = null;
    this._fallbackReason = null;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      const pipeline =
        this.pipelineFactory ??
        (await this.#loadTransformersPipeline());
      if (pipeline) {
        const featureExtraction = await pipeline('feature-extraction', this.modelId, {
          quantized: true
        });
        this._pipeline = featureExtraction;
        this.mode = 'transformers';
        this.initialized = true;
        return;
      }
      this.mode = 'fallback';
    } catch (error) {
      this.mode = 'fallback';
      this._fallbackReason = error;
      this.logger.warn?.(
        `[embedding] Falling back to hash-based embeddings (${error.message ?? error})`
      );
    }

    this.initialized = true;
  }

  async #loadTransformersPipeline() {
    try {
      const module = await import('@huggingface/transformers');
      if (module?.pipeline) {
        return module.pipeline.bind(module);
      }
      if (module?.default?.pipeline) {
        return module.default.pipeline.bind(module.default);
      }
    } catch (error) {
      this._fallbackReason = error;
    }
    return null;
  }

  /**
   * Generate embeddings for a list of documents. Documents are automatically
   * prefixed with "search_document:" per R1.1 research guidance.
   */
  async embedDocuments(documents) {
    if (!Array.isArray(documents) || documents.length === 0) {
      return [];
    }

    await this.initialize();

    const normalized = documents.map((text) => {
      const trimmed = typeof text === 'string' ? text.trim() : '';
      if (!trimmed) {
        return 'search_document:';
      }
      return trimmed.startsWith('search_document:')
        ? trimmed
        : `search_document: ${trimmed}`;
    });

    if (this.mode === 'transformers' && this._pipeline) {
      const results = [];
      for (let start = 0; start < normalized.length; start += this.batchSize) {
        const batch = normalized.slice(start, start + this.batchSize);
        const output = await this._pipeline(batch, {
          pooling: 'mean',
          normalize: true
        });
        if (Array.isArray(output)) {
          for (const row of output) {
            results.push(Array.isArray(row) ? row : Array.from(row));
          }
        } else {
          results.push(Array.isArray(output) ? output : Array.from(output));
        }
      }
      return results;
    }

    return normalized.map((text) => computeFallbackEmbedding(text, this.dimensions));
  }

  getDiagnostics() {
    return {
      modelId: this.modelId,
      mode: this.mode,
      fallbackReason: this._fallbackReason ? String(this._fallbackReason) : null,
      batchSize: this.batchSize,
      dimensions: this.dimensions
    };
  }
}

export default EmbeddingService;
