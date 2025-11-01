import { randomUUID } from 'node:crypto';
import { normaliseTags } from './stream-utils.js';

const DEFAULT_EVENT_VERSION = '1.0.0';

function isPlainObject(value) {
  return value != null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function clonePlainObject(value) {
  if (!isPlainObject(value)) {
    return {};
  }
  return JSON.parse(JSON.stringify(value));
}

export function createEventEnvelope(options = {}) {
  const { eventType, source } = options;

  if (!eventType || typeof eventType !== 'string') {
    throw new Error('eventType is required to build an event envelope');
  }
  if (!source || typeof source !== 'string') {
    throw new Error('source is required to build an event envelope');
  }

  const timestamp = options.timestamp && typeof options.timestamp === 'string'
    ? options.timestamp
    : new Date().toISOString();

  const metadata = {
    eventId: options.eventId && typeof options.eventId === 'string' ? options.eventId : randomUUID(),
    eventType: eventType.trim(),
    source: source.trim(),
    timestamp,
    version: options.version && typeof options.version === 'string'
      ? options.version.trim()
      : DEFAULT_EVENT_VERSION
  };

  if (options.correlationId) {
    metadata.correlationId = String(options.correlationId).trim();
  }

  const context = clonePlainObject(options.context);
  if (Object.keys(context).length > 0) {
    metadata.context = context;
  }

  const tags = normaliseTags(options.tags);
  if (tags.length > 0) {
    metadata.tags = tags;
  }

  const payload = options.payload && typeof options.payload === 'object'
    ? JSON.parse(JSON.stringify(options.payload))
    : {};

  return { metadata, payload };
}

export function validateEventEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    return { isValid: false, errors: ['Event envelope must be an object'] };
  }

  if (!envelope.metadata || typeof envelope.metadata !== 'object') {
    return { isValid: false, errors: ['Event metadata is required'] };
  }

  const { metadata } = envelope;
  const errors = [];

  if (!metadata.eventId) {
    errors.push('metadata.eventId is required');
  }
  if (!metadata.eventType) {
    errors.push('metadata.eventType is required');
  }
  if (!metadata.source) {
    errors.push('metadata.source is required');
  }
  if (!metadata.timestamp) {
    errors.push('metadata.timestamp is required');
  }

  return { isValid: errors.length === 0, errors };
}

export { DEFAULT_EVENT_VERSION };
