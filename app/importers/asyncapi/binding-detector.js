/**
 * Multi-tier protocol binding detection (95-99% reliability)
 * Priority-based detection strategy from research
 */

const { extractKafkaBindings } = require('./kafka-utils');
const { extractAMQPBindings } = require('./amqp-utils');
const { extractMQTTBindings } = require('./mqtt-utils');

function toPlainBinding(binding) {
  if (!binding) {
    return null;
  }

  if (typeof binding.json === 'function') {
    return binding.json();
  }

  return binding;
}

function extractBindingMeta(binding) {
  if (binding && binding._meta) {
    return {
      pointer: binding._meta.pointer,
      protocol: binding._meta.protocol
    };
  }

  return {};
}

function getChannelBinding(channel, protocol) {
  try {
    if (!channel.bindings || typeof channel.bindings !== 'function') {
      return null;
    }

    const bindings = channel.bindings();

    if (bindings && typeof bindings.get === 'function') {
      return bindings.get(protocol) || null;
    }

    return bindings ? bindings[protocol] || null : null;
  } catch (error) {
    return null;
  }
}

/**
 * Detect protocol bindings using multi-tier strategy
 * @param {Object} channel - AsyncAPI channel object
 * @param {Object} document - AsyncAPI document
 * @returns {Object} Detected binding configuration
 */
function detectProtocolBindings(channel, document) {
  // Priority 1: Explicit binding objects (99% confidence)
  const kafkaBinding = getChannelBinding(channel, 'kafka');
  if (kafkaBinding) {
    const extractedKafka = extractKafkaBindings(toPlainBinding(kafkaBinding), channel, extractBindingMeta(kafkaBinding));
    if (extractedKafka) {
      return { ...extractedKafka, confidence: 0.99, source: 'explicit_binding' };
    }
  }

  const amqpBinding = getChannelBinding(channel, 'amqp') || getChannelBinding(channel, 'amqp1');
  if (amqpBinding) {
    const extractedAmqp = extractAMQPBindings(toPlainBinding(amqpBinding), channel, extractBindingMeta(amqpBinding));
    if (extractedAmqp) {
      return { ...extractedAmqp, confidence: 0.99, source: 'explicit_binding' };
    }
  }

  const mqttBinding = getChannelBinding(channel, 'mqtt');
  if (mqttBinding) {
    const extractedMqtt = extractMQTTBindings(toPlainBinding(mqttBinding), channel, extractBindingMeta(mqttBinding));
    if (extractedMqtt) {
      return { ...extractedMqtt, confidence: 0.99, source: 'explicit_binding' };
    }
  }

  const httpBinding = getChannelBinding(channel, 'http') || getChannelBinding(channel, 'ws');
  if (httpBinding) {
    return extractHTTPWebhookBinding(toPlainBinding(httpBinding), channel, extractBindingMeta(httpBinding));
  }

  // Priority 2: Server protocol field (95% confidence)
  const servers = document.servers && document.servers();
  const serversArray = servers && typeof servers.all === 'function'
    ? Array.from(servers.all())
    : [];

  if (serversArray.length > 0) {
    const server = serversArray[0];
    const protocol = server.protocol();

    if (protocol) {
      const detected = detectFromServerProtocol(protocol, server, channel);
      if (detected) {
        return detected;
      }
    }
  }

  // Priority 3: Binding-specific field validation (90% confidence)
  const fieldDetection = detectFromBindingFields(channel);
  if (fieldDetection) {
    return fieldDetection;
  }

  // Priority 4: URL schemes for AsyncAPI 2.x (85% confidence)
  if (serversArray.length > 0) {
    const urlDetection = detectFromURLScheme(serversArray[0].url());
    if (urlDetection) {
      return urlDetection;
    }
  }

  // Priority 5: Channel patterns (65% confidence, confirmation only)
  const patternDetection = detectFromChannelPattern(channel.id());
  if (patternDetection && patternDetection.confidence >= 0.65) {
    return patternDetection;
  }

  // Default: unknown protocol
  return {
    transport: 'unknown',
    confidence: 0,
    source: 'no_detection',
    reason: 'No protocol bindings detected'
  };
}

/**
 * Detect protocol from server protocol field
 * @param {string} protocol - Server protocol string
 * @param {Object} server - Server object
 * @param {Object} channel - Channel object
 * @returns {Object|null} Detected binding or null
 */
function detectFromServerProtocol(protocol, server, channel) {
  const normalized = protocol.toLowerCase();

  if (normalized.includes('kafka')) {
    return {
      transport: 'kafka',
      topic: channel.id(),
      guarantees: 'at-least-once',
      retry_policy: 'exponential',
      dlq: null,
      confidence: 0.95,
      source: 'server_protocol',
      metadata: {
        server_url: server.url(),
        protocol_version: server.protocolVersion()
      }
    };
  }

  if (normalized.includes('amqp')) {
    return {
      transport: 'amqp',
      topic: channel.id(),
      guarantees: 'at-least-once',
      retry_policy: 'exponential',
      dlq: null,
      confidence: 0.95,
      source: 'server_protocol',
      metadata: {
        server_url: server.url(),
        protocol_version: server.protocolVersion()
      }
    };
  }

  if (normalized.includes('mqtt')) {
    return {
      transport: 'mqtt',
      topic: channel.id(),
      guarantees: 'at-least-once',
      retry_policy: 'exponential',
      dlq: null,
      confidence: 0.95,
      source: 'server_protocol',
      metadata: {
        server_url: server.url(),
        protocol_version: server.protocolVersion()
      }
    };
  }

  if (normalized.includes('http') || normalized.includes('ws')) {
    return {
      transport: 'webhook',
      topic: channel.id(),
      guarantees: 'best-effort',
      retry_policy: 'exponential',
      dlq: null,
      confidence: 0.95,
      source: 'server_protocol',
      metadata: {
        server_url: server.url(),
        protocol_version: server.protocolVersion()
      }
    };
  }

  return null;
}

/**
 * Detect protocol from binding-specific fields
 * @param {Object} channel - AsyncAPI channel object
 * @returns {Object|null} Detected binding or null
 */
function detectFromBindingFields(channel) {
  const channelData = channel.json();

  // Kafka-specific fields
  if (channelData.partitions || channelData.replicas) {
    return {
      transport: 'kafka',
      topic: channel.id(),
      guarantees: 'at-least-once',
      retry_policy: 'exponential',
      dlq: null,
      confidence: 0.90,
      source: 'binding_fields',
      metadata: {
        partitions: channelData.partitions,
        replicas: channelData.replicas
      }
    };
  }

  // AMQP-specific fields
  if (channelData.exchange || channelData.routingKey || channelData.queue) {
    return {
      transport: 'amqp',
      topic: channel.id(),
      guarantees: 'at-least-once',
      retry_policy: 'exponential',
      dlq: null,
      confidence: 0.90,
      source: 'binding_fields',
      metadata: {
        exchange: channelData.exchange,
        routing_key: channelData.routingKey,
        queue: channelData.queue
      }
    };
  }

  return null;
}

/**
 * Detect protocol from URL scheme
 * @param {string} url - Server URL
 * @returns {Object|null} Detected binding or null
 */
function detectFromURLScheme(url) {
  if (!url) return null;

  const scheme = url.split(':')[0].toLowerCase();

  const schemeMap = {
    'kafka': { transport: 'kafka', confidence: 0.85 },
    'amqp': { transport: 'amqp', confidence: 0.85 },
    'amqps': { transport: 'amqp', confidence: 0.85 },
    'mqtt': { transport: 'mqtt', confidence: 0.85 },
    'mqtts': { transport: 'mqtt', confidence: 0.85 },
    'ws': { transport: 'webhook', confidence: 0.85 },
    'wss': { transport: 'webhook', confidence: 0.85 },
    'http': { transport: 'webhook', confidence: 0.85 },
    'https': { transport: 'webhook', confidence: 0.85 }
  };

  if (schemeMap[scheme]) {
    return {
      transport: schemeMap[scheme].transport,
      topic: 'unknown',
      guarantees: 'at-least-once',
      retry_policy: 'exponential',
      dlq: null,
      confidence: schemeMap[scheme].confidence,
      source: 'url_scheme',
      metadata: {
        detected_from_url: url
      }
    };
  }

  return null;
}

/**
 * Detect protocol from channel naming patterns (lowest confidence)
 * @param {string} channelId - Channel identifier
 * @returns {Object|null} Detected binding or null
 */
function detectFromChannelPattern(channelId) {
  const normalized = channelId.toLowerCase();

  // Kafka-like patterns: dot-separated or hyphen-separated
  if (/^[a-z0-9-_.]+$/.test(normalized) && !normalized.includes('/')) {
    return {
      transport: 'kafka',
      topic: channelId,
      guarantees: 'at-least-once',
      retry_policy: 'exponential',
      dlq: null,
      confidence: 0.65,
      source: 'channel_pattern',
      reason: 'Kafka-like naming pattern detected'
    };
  }

  // MQTT-like patterns: slash-separated hierarchical
  if (normalized.includes('/') && !normalized.includes('.')) {
    return {
      transport: 'mqtt',
      topic: channelId,
      guarantees: 'at-least-once',
      retry_policy: 'exponential',
      dlq: null,
      confidence: 0.65,
      source: 'channel_pattern',
      reason: 'MQTT-like hierarchical pattern detected'
    };
  }

  return null;
}

/**
 * Extract HTTP webhook binding
 * @param {Object} httpBinding - HTTP binding object
 * @returns {Object} Webhook binding configuration
 */
function extractHTTPWebhookBinding(httpBinding, channel, meta = {}) {
  const bindingData = toPlainBinding(httpBinding) || {};
  const method = bindingData.method || 'POST';

  return {
    transport: 'webhook',
    topic: channel?.id() || method,
    guarantees: 'best-effort',
    retry_policy: 'exponential',
    dlq: null,
    confidence: 0.99,
    source: 'explicit_binding',
    metadata: {
      method,
      headers: bindingData.headers,
      pointer: meta.pointer
    }
  };
}

module.exports = {
  detectProtocolBindings,
  detectFromServerProtocol,
  detectFromBindingFields,
  detectFromURLScheme,
  detectFromChannelPattern
};
