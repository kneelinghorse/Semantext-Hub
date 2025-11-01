import fs from 'node:fs/promises';
import path from 'node:path';
import { mergeStreamDefaults } from '../../events/stream-utils.js';

function safeLogger(logger) {
  if (logger && typeof logger === 'object') {
    const methods = ['debug', 'info', 'warn', 'error'];
    const proxy = {};
    for (const method of methods) {
      proxy[method] = typeof logger[method] === 'function' ? logger[method].bind(logger) : console[method].bind(console);
    }
    proxy.child = typeof logger.child === 'function' ? logger.child.bind(logger) : () => proxy;
    return proxy;
  }
  const fallback = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  };
  fallback.child = () => fallback;
  return fallback;
}

function clone(value) {
  if (value == null) {
    return value;
  }
  if (typeof value !== 'object') {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function ensurePlainObject(value, fallback = {}) {
  if (value == null) {
    return fallback;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }
  return { ...value };
}

export class ContextStore {
  constructor(options = {}) {
    this.workspace = options.workspace ? path.resolve(options.workspace) : process.cwd();
    this.logger = safeLogger(options.logger);
    this.eventPublisher = options.eventPublisher ?? null;
    this.filePath = options.filePath
      ? path.resolve(options.filePath)
      : path.join(this.workspace, 'var', 'context', 'events.jsonl');
    this.streamDefaults = ensurePlainObject(options.streamDefaults, {
      object: 'context',
      event: 'updated',
      objectId: 'global'
    });
  }

  async writeContext(key, data = {}, metadata = {}) {
    const entry = {
      key,
      data: clone(data) ?? {},
      metadata: ensurePlainObject(metadata),
      timestamp: new Date().toISOString()
    };

    await this.#append(entry);
    await this.#publish(key, entry);
    return entry;
  }

  async recordToolActivation(payload = {}, metadata = {}) {
    const contextPayload = {
      urn: payload.urn,
      toolId: payload.toolId,
      actor: payload.actor ? clone(payload.actor) : null,
      capabilities: Array.isArray(payload.capabilities) ? [...payload.capabilities] : [],
      metadata: payload.metadata ? clone(payload.metadata) : {},
      resolvedAt: payload.resolvedAt,
      iam: payload.iam ? clone(payload.iam) : null
    };

    const entryMetadata = {
      ...ensurePlainObject(metadata),
      streamSegments: {
        ...(metadata.streamSegments || {}),
        object: 'tool',
        event: 'activated',
        objectId: payload.toolId || payload.urn || 'unknown'
      }
    };

    return await this.writeContext('tool.activation', contextPayload, entryMetadata);
  }

  async #append(entry) {
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.appendFile(this.filePath, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch (error) {
      this.logger.warn('Failed to append context entry to disk', {
        filePath: this.filePath,
        error: error?.message || String(error)
      });
    }
  }

  async #publish(key, entry) {
    if (!this.eventPublisher || typeof this.eventPublisher.publish !== 'function') {
      return;
    }

    const metadata = ensurePlainObject(entry.metadata);
    const streamDefaults = ensurePlainObject(this.streamDefaults);
    const segments = mergeStreamDefaults(metadata.streamSegments || {}, streamDefaults);
    segments.event = segments.event || key.replace(/\./g, '-');

    try {
      await this.eventPublisher.publish({
        eventType: metadata.eventType || 'ContextUpdated',
        source: metadata.source || 'context.store',
        streamSegments: segments,
        payload: {
          key,
          data: entry.data,
          metadata,
          timestamp: entry.timestamp
        },
        context: metadata.context || {},
        correlationId: metadata.correlationId,
        tags: ['context', key]
      });
    } catch (error) {
      this.logger.warn('Failed to publish context event', {
        key,
        error: error?.message || String(error)
      });
    }
  }
}

export default ContextStore;
