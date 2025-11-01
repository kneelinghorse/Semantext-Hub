import Redis from 'ioredis';
import { buildStreamName, mergeStreamDefaults, isRedisUnavailableError } from './stream-utils.js';

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

export class RedisEventConsumer {
  constructor(options = {}) {
    this.logger = safeLogger(options.logger);
    this.redisUrl = options.redisUrl || process.env.SEMANTEXT_REDIS_URL || process.env.REDIS_URL || 'redis://127.0.0.1:6379/0';
    this.redisOptions = {
      lazyConnect: true,
      retryStrategy(times) {
        return Math.min(times * 50, 2000);
      },
      ...options.redisOptions
    };
    this.createRedisClient = options.createRedisClient || ((url, opts) => new Redis(url, opts));
    this.client = options.client || null;
    this.streamDefaults = options.streamDefaults || {};
    this.backoffMs = Number.isFinite(options.degradedBackoffMs) && options.degradedBackoffMs >= 0
      ? options.degradedBackoffMs
      : 15000;
    this.degradedUntil = 0;
    this.status = this.client ? 'connected' : 'idle';
    this.metrics = {
      reads: 0,
      emptyReads: 0,
      errors: 0,
      acknowledged: 0
    };
  }

  async ensureGroup(options = {}) {
    const streamName = this.#resolveStreamName(options);
    const groupName = options.group || options.groupName;

    if (!groupName) {
      throw new Error('groupName is required to ensure a consumer group');
    }

    const client = await this.#getClient();
    if (!client) {
      this.logger.warn('Unable to ensure consumer group - Redis unavailable', {
        stream: streamName,
        group: groupName
      });
      return false;
    }

    const startId = options.startId || '0';
    const mkStream = options.mkStream !== false;

    try {
      const args = ['CREATE', streamName, groupName, startId];
      if (mkStream) {
        args.push('MKSTREAM');
      }
      if (typeof client.xgroup === 'function') {
        await client.xgroup(...args);
      } else {
        await client.call('XGROUP', ...args);
      }
      this.logger.info('Created Redis consumer group', { stream: streamName, group: groupName });
      return true;
    } catch (error) {
      if (String(error?.message || '').includes('BUSYGROUP')) {
        return true;
      }
      this.logger.error('Failed to create Redis consumer group', {
        stream: streamName,
        group: groupName,
        error: error?.message || String(error)
      });
      return false;
    }
  }

  async read(options = {}) {
    const streamName = this.#resolveStreamName(options);
    const group = options.group || options.groupName;
    const consumer = options.consumer || options.consumerName;
    if (!group || !consumer) {
      throw new Error('group and consumer are required to read from Redis stream');
    }

    const client = await this.#getClient();
    if (!client) {
      this.metrics.errors += 1;
      this.logger.warn('Consumer degraded - cannot read events', {
        stream: streamName,
        group
      });
      return [];
    }

    const count = Number.isInteger(options.count) && options.count > 0 ? options.count : 10;
    const blockMs = Number.isInteger(options.blockMs) && options.blockMs >= 0 ? options.blockMs : 5000;
    const idle = Number.isInteger(options.idle) && options.idle >= 0 ? options.idle : null;
    const startId = options.startId || '>';

    const args = ['GROUP', group, consumer, 'COUNT', count];
    if (idle !== null) {
      args.push('IDLE', idle);
    }
    if (blockMs > 0) {
      args.push('BLOCK', blockMs);
    }
    args.push('STREAMS', streamName, startId);

    try {
      const response = await client.xreadgroup(...args);
      if (!response) {
        this.metrics.emptyReads += 1;
        return [];
      }
      const messages = this.#parseMessages(response);
      this.metrics.reads += messages.length;
      return messages;
    } catch (error) {
      this.metrics.errors += 1;
      this.#handleReadError(error, streamName, group);
      return [];
    }
  }

  async acknowledge(streamNameOrOptions, groupName, id) {
    let streamName = streamNameOrOptions;
    if (typeof streamNameOrOptions === 'object' && streamNameOrOptions !== null) {
      streamName = this.#resolveStreamName(streamNameOrOptions);
      groupName = streamNameOrOptions.group || streamNameOrOptions.groupName;
      id = streamNameOrOptions.id || streamNameOrOptions.messageId;
    }

    if (!streamName || !groupName || !id) {
      throw new Error('streamName, groupName, and id are required to acknowledge messages');
    }

    const client = await this.#getClient();
    if (!client) {
      this.logger.warn('Unable to acknowledge message - Redis unavailable', {
        stream: streamName,
        group: groupName,
        id
      });
      return false;
    }

    try {
      const result = await client.xack(streamName, groupName, id);
      if (result > 0) {
        this.metrics.acknowledged += 1;
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error('Failed to acknowledge Redis stream message', {
        stream: streamName,
        group: groupName,
        id,
        error: error?.message || String(error)
      });
      return false;
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
      this.logger.warn('Failed to close Redis consumer connection cleanly', {
        error: error?.message || String(error)
      });
    } finally {
      this.client = null;
      this.status = 'idle';
    }
  }

  #resolveStreamName(options = {}) {
    if (typeof options === 'string' && options.trim()) {
      return options.trim();
    }
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
    const level = isRedisUnavailableError(error) ? 'warn' : 'error';
    this.logger[level]('Redis consumer connection failed', {
      error: error?.message || String(error),
      backoffMs: this.backoffMs
    });
  }

  #handleReadError(error, streamName, group) {
    const level = isRedisUnavailableError(error) ? 'warn' : 'error';
    this.logger[level]('Redis consumer failed to read messages', {
      stream: streamName,
      group,
      error: error?.message || String(error)
    });
    if (isRedisUnavailableError(error)) {
      this.degradedUntil = Date.now() + this.backoffMs;
      if (this.client && typeof this.client.disconnect === 'function') {
        try {
          this.client.disconnect();
        } catch (disconnectError) {
          this.logger.warn('Redis consumer disconnect cleanup failed', {
            error: disconnectError?.message || String(disconnectError)
          });
        }
      }
      this.client = null;
      this.status = 'degraded';
    }
  }

  #parseMessages(raw) {
    if (!Array.isArray(raw)) {
      return [];
    }

    const messages = [];
    for (const streamEntry of raw) {
      if (!Array.isArray(streamEntry) || streamEntry.length !== 2) {
        continue;
      }
      const [streamName, entries] = streamEntry;
      if (!Array.isArray(entries)) {
        continue;
      }

      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 2) {
          continue;
        }
        const [id, fields] = entry;
        const record = {
          id,
          stream: streamName,
          metadata: {},
          payload: {},
          raw: {}
        };

        if (Array.isArray(fields)) {
          for (let i = 0; i < fields.length; i += 2) {
            const key = fields[i];
            const value = fields[i + 1];
            record.raw[key] = value;
            if (key === 'metadata' || key === 'payload' || key === 'headers') {
              try {
                record[key] = JSON.parse(value);
              } catch (error) {
                this.logger.warn('Failed to parse Redis event field as JSON', {
                  field: key,
                  value,
                  error: error?.message || String(error)
                });
                record[key] = value;
              }
            }
          }
        }

        messages.push(record);
      }
    }

    return messages;
  }
}

export default RedisEventConsumer;
