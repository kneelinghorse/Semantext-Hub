/**
 * AMQP-specific binding extraction and analysis
 */

/**
 * Extract AMQP binding configuration
 * @param {Object} amqpBinding - AMQP binding object from AsyncAPI
 * @returns {Object} AMQP binding configuration
 */
function extractAMQPBindings(amqpBinding, channel, meta = {}) {
  const bindingData = amqpBinding && typeof amqpBinding.json === 'function'
    ? amqpBinding.json()
    : amqpBinding;

  if (!bindingData) {
    return null;
  }

  const queue = bindingData.queue || {};
  const exchange = bindingData.exchange || bindingData.is || {};
  const topMeta = bindingData.metadata || {};

  return {
    transport: 'amqp',
    topic: formatAMQPTopic(exchange, queue),
    guarantees: inferAMQPGuarantees(queue),
    retry_policy: inferAMQPRetryPolicy(queue),
    dlq: extractDLQ(queue),
    metadata: {
      durable: queue.durable !== false, // Default to true
      exclusive: queue.exclusive || false,
      auto_delete: queue.autoDelete || queue.auto_delete || false,
      exchange_name: exchange.name,
      exchange_type: exchange.type || 'topic',
      routing_key: exchange.routingKey || bindingData.routingKey || topMeta['routing-key'],
      // Surface both snake and dash variants for detection convenience
      'routing-key': topMeta['routing-key'] || undefined,
      vhost: bindingData.vhost || '/',
      // Accept non-standard fixture fields via `metadata` as arguments fallback
      arguments: queue.arguments || queue.metadata || {},
      // Promote common queue arguments for easier detection access
      'x-max-retries': (queue.arguments && queue.arguments['x-max-retries']) || (queue.metadata && queue.metadata['x-max-retries']) || topMeta['x-max-retries'],
      'x-message-ttl': (queue.arguments && queue.arguments['x-message-ttl']) || (queue.metadata && queue.metadata['x-message-ttl']) || topMeta['x-message-ttl'],
      pointer: meta.pointer,
      channel: channel?.id ? channel.id() : undefined
    }
  };
}

/**
 * Format AMQP topic as exchange:queue
 * @param {Object} exchange - Exchange configuration
 * @param {Object} queue - Queue configuration
 * @returns {string} Formatted topic identifier
 */
function formatAMQPTopic(exchange, queue) {
  const exchangeName = exchange.name || 'default';
  const queueName = queue.name || 'unnamed';

  return `${exchangeName}:${queueName}`;
}

/**
 * Infer delivery guarantees from AMQP queue configuration
 * @param {Object} queue - Queue configuration
 * @returns {string} Delivery guarantee level
 */
function inferAMQPGuarantees(queue) {
  // Durable queues with confirm mode provide at-least-once
  if (queue.durable !== false) {
    return 'at-least-once';
  }

  // Non-durable queues are best-effort
  return 'best-effort';
}

/**
 * Infer retry policy from AMQP queue configuration
 * @param {Object} queue - Queue configuration
 * @returns {string} Retry policy type
 */
function inferAMQPRetryPolicy(queue) {
  const args = queue.arguments || {};

  // Check for TTL-based retry (x-message-ttl + DLX)
  if (args['x-message-ttl'] && args['x-dead-letter-exchange']) {
    return 'exponential';
  }

  // Check for DLX without TTL (fixed retry)
  if (args['x-dead-letter-exchange']) {
    return 'fixed';
  }

  return 'none';
}

/**
 * Extract dead letter queue configuration
 * @param {Object} queue - Queue configuration
 * @returns {string|null} DLQ identifier
 */
function extractDLQ(queue) {
  const args = queue.arguments || {};
  const dlx = args['x-dead-letter-exchange'];
  const dlrk = args['x-dead-letter-routing-key'];

  if (dlx) {
    return dlrk ? `${dlx}:${dlrk}` : dlx;
  }

  return null;
}

/**
 * Analyze AMQP patterns
 * @param {Object} amqpBinding - AMQP binding object
 * @returns {Object} Pattern analysis
 */
function analyzeAMQPPatterns(amqpBinding) {
  const bindingData = amqpBinding.json ? amqpBinding.json() : amqpBinding;
  const queue = bindingData.queue || {};
  const exchange = bindingData.exchange || bindingData.is || {};
  const args = queue.arguments || {};

  return {
    has_dlq: !!args['x-dead-letter-exchange'],
    has_retry: !!(args['x-message-ttl'] && args['x-dead-letter-exchange']),
    ordering_guarantee: inferAMQPOrderingGuarantee(exchange),
    durable: queue.durable !== false,
    exchange_type: exchange.type || 'topic',
    ttl_ms: args['x-message-ttl'],
    max_length: args['x-max-length'],
    max_priority: args['x-max-priority']
  };
}

/**
 * Infer ordering guarantee from AMQP exchange type
 * @param {Object} exchange - Exchange configuration
 * @returns {string} Ordering guarantee level
 */
function inferAMQPOrderingGuarantee(exchange) {
  const type = exchange.type || 'topic';

  // Direct and fanout exchanges maintain order within a single consumer
  if (type === 'direct' || type === 'fanout') {
    return 'queue';
  }

  // Topic and headers exchanges don't guarantee order
  return 'none';
}

/**
 * Extract consumer configuration (if present)
 * @param {Object} amqpBinding - AMQP binding object
 * @returns {Object|null} Consumer config
 */
function extractConsumerConfig(amqpBinding) {
  const bindingData = amqpBinding.json ? amqpBinding.json() : amqpBinding;
  const queue = bindingData.queue || {};

  return {
    prefetch_count: queue.prefetchCount || 1,
    no_ack: queue.noAck || false,
    exclusive: queue.exclusive || false
  };
}

module.exports = {
  extractAMQPBindings,
  formatAMQPTopic,
  inferAMQPGuarantees,
  inferAMQPRetryPolicy,
  extractDLQ,
  analyzeAMQPPatterns,
  inferAMQPOrderingGuarantee,
  extractConsumerConfig
};
