import Redis from 'ioredis';
import { buildStreamName, mergeStreamDefaults, isRedisUnavailableError } from './stream-utils.js';
import { createEventEnvelope, validateEventEnvelope } from './schemas.js';

const DEFAULT_BACKOFF_MS = 15000;

function toLogger(logger) {
  if (logger && typeof logger === 'object') {
    const methods = ['debug', 'info', 'warn', 'error'];
    const safeLogger = {};
    for (const method of methods) {
      safeLogger[method] = typeof logger[method] === 'function' ? logger[method].bind(logger) : console[method].bind(console);
    }
    if (typeof logger.child === 'function') {
      safeLogger.child = logger.child.bind(logger);
    } else {
      safeLogger.child = () => safeLogger;
    }
    return safeLogger;
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

export class RedisEventPublisher {
  constructor(options = {}) {
    this.logger = toLogger(options.logger); // provide safe logger

    this.redisUrl = options.redisUrl || process.env.SEMANTEXT_REDIS_URL || process.env.REDIS_URL || 'redis://127.0.0.1:6379/0';
    this.redisOptions = {
      lazyConnect: true,
      retryStrategy(times) {
        return Math.min(times * 50, 2000);
      },
      enableAutoPipelining: true,
      ...options.redisOptions
    };

    this.createRedisClient = options.createRedisClient || ((url, opts) => new Redis(url, opts));
    this.client = options.client || null;
    this.streamDefaults = options.streamDefaults || {};
    this.maxLen = Number.isInteger(options.maxLen) && options.maxLen > 0 ? options.maxLen : null;
    this.backoffMs = Number.isFinite(options.degradedBackoffMs) && options.degradedBackoffMs >= 0
      ? options.degradedBackoffMs
      : DEFAULT_BACKOFF_MS;
    this.degradedUntil = 0;
    this.status = this.client ? 'connected' : 'idle';
    this.metrics = {
      published: 0,
      dropped: 0
    };

    if (this.client) {
      this.status = 'connected';
    }
  }

  async publish(options = {}) {
    let envelope;
    try {
      envelope = createEventEnvelope(options);
    } catch (error) {
      this.logger.error('Failed to build event envelope', {
        error: error?.message || String(error),
        eventType: options?.eventType,
        source: options?.source
      });
      throw error;
    }

    const validation = validateEventEnvelope(envelope);
    if (!validation.isValid) {
      const message = `Invalid event envelope: ${validation.errors.join(', ')}`;
      this.logger.error(message, { eventType: options?.eventType, source: options?.source });
      throw new Error(message);
    }

    const streamName = this.#resolveStreamName(options);
    const client = await this.#getClient();

    if (!client) {
      this.metrics.dropped += 1;
      this.logger.warn('Event publisher degraded - dropping event', {
        stream: streamName,
        eventType: envelope.metadata.eventType
      });
      return null;
    }

    const fields = ['metadata', JSON.stringify(envelope.metadata), 'payload', JSON.stringify(envelope.payload)];
    if (options.headers && typeof options.headers === 'object') {
      fields.push('headers', JSON.stringify(options.headers));
    }

    try {
      const args = [];
      if (this.maxLen) {
        args.push('MAXLEN', '~', this.maxLen);
      }
      args.push('*', ...fields);
      const messageId = await client.xadd(streamName, ...args);
      this.metrics.published += 1;
      return messageId;
    } catch (error) {
      this.metrics.dropped += 1;
      this.#handlePublishError(error, streamName, envelope.metadata.eventType);
      return null;
    }
  }

  async close() {
    if (!this.client) {
      return;
    }

    try {
      if (typeof this.client.quit === 'function') {
        await this.client.quit();
      } else if (typeof this.client.disconnect === 'function') {
        this.client.disconnect();
      }
    } catch (error) {
      this.logger.warn('Failed to close Redis publisher connection cleanly', {
        error: error?.message || String(error)
      });
    } finally {
      this.client = null;
      this.status = 'idle';
    }
  }

  #resolveStreamName(options = {}) {
    if (typeof options.stream === 'string' && options.stream.trim()) {
      return options.stream.trim();
    }
    if (typeof options.streamName === 'string' && options.streamName.trim()) {
      return options.streamName.trim();
    }

    const segments = options.streamSegments || options.streamContext || {};
    const merged = mergeStreamDefaults(segments, this.streamDefaults);
    return buildStreamName(merged);
  }

  async #getClient() {
    if (this.client) {
      return this.client;
    }

    if (Date.now() < this.degradedUntil) {
      return null;
    }

    try {
      const client = this.createRedisClient(this.redisUrl, this.redisOptions);
      if (typeof client.connect === 'function') {
        await client.connect();
      }
      this.client = client;
      this.status = 'connected';
      return this.client;
    } catch (error) {
      this.#handleConnectionError(error);
      return null;
    }
  }

  #handleConnectionError(error) {
    this.client = null;
    this.status = 'degraded';
    this.degradedUntil = Date.now() + this.backoffMs;
    const message = error?.message || String(error);
    const severity = isRedisUnavailableError(error) ? 'warn' : 'error';
    this.logger[severity]('Redis publisher connection failed', { error: message, backoffMs: this.backoffMs });
  }

  #handlePublishError(error, streamName, eventType) {
    const severity = isRedisUnavailableError(error) ? 'warn' : 'error';
    this.logger[severity]('Redis publisher failed to write event', {
      stream: streamName,
      eventType,
      error: error?.message || String(error)
    });

    if (isRedisUnavailableError(error)) {
      this.degradedUntil = Date.now() + this.backoffMs;
      if (this.client) {
        try {
          if (typeof this.client.disconnect === 'function') {
            this.client.disconnect();
          }
        } catch (disconnectError) {
          this.logger.warn('Redis publisher disconnect cleanup failed', {
            error: disconnectError?.message || String(disconnectError)
          });
        }
        this.client = null;
        this.status = 'degraded';
      }
    }
  }
}

export default RedisEventPublisher;
