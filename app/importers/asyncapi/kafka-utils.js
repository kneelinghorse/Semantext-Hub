/**
 * Kafka-specific binding extraction and analysis
 * Research: Kafka dominates usage (65% of production specs)
 */

/**
 * Extract Kafka binding configuration
 * @param {Object} kafkaBinding - Kafka binding object from AsyncAPI
 * @returns {Object} Kafka binding configuration
 */
function extractKafkaBindings(kafkaBinding, channel, meta = {}) {
  const bindingData = kafkaBinding && typeof kafkaBinding.json === 'function'
    ? kafkaBinding.json()
    : kafkaBinding;

  if (!bindingData) {
    return null;
  }

  const config = bindingData.configs || bindingData.topicConfiguration || {};

  return {
    transport: 'kafka',
    topic: bindingData.topic || bindingData.topicName,
    guarantees: inferKafkaGuarantees(config),
    retry_policy: inferRetryPolicy(config),
    dlq: config['dead.letter.queue.topic.name'] || config.dlq || null,
    metadata: {
      partitions: bindingData.partitions,
      replicas: bindingData.replicas,
      retention_ms: config['retention.ms'],
      cleanup_policy: config['cleanup.policy'],
      min_insync_replicas: config['min.insync.replicas'],
      compression_type: config['compression.type'],
      max_message_bytes: config['max.message.bytes'],
      pointer: meta.pointer,
      channel: channel?.id ? channel.id() : undefined
    }
  };
}

/**
 * Infer delivery guarantees from Kafka configuration
 * @param {Object} kafkaConfig - Kafka configuration object
 * @returns {string} Delivery guarantee level
 */
function inferKafkaGuarantees(kafkaConfig) {
  const minISR = parseInt(kafkaConfig['min.insync.replicas'] || '1');
  const acks = String(kafkaConfig['acks'] || '1');
  const idempotence = kafkaConfig['enable.idempotence'] === true || kafkaConfig['enable.idempotence'] === 'true';

  // Exactly-once: requires acks=all, min.insync.replicas >= 2, and idempotence
  if (acks === 'all' && minISR >= 2 && idempotence) {
    return 'exactly-once';
  }

  // At-least-once: acks=1 or acks=all
  if (acks === '1' || acks === 'all') {
    return 'at-least-once';
  }

  // Best-effort: acks=0
  if (acks === '0') {
    return 'best-effort';
  }

  // Default to at-least-once for production safety
  return 'at-least-once';
}

/**
 * Infer retry policy from Kafka configuration
 * @param {Object} kafkaConfig - Kafka configuration object
 * @returns {string} Retry policy type
 */
function inferRetryPolicy(kafkaConfig) {
  const retryBackoff = kafkaConfig['retry.backoff.ms'];
  const maxRetries = kafkaConfig['retries'] || kafkaConfig['max.retries'];

  if (retryBackoff && maxRetries) {
    return 'exponential';
  } else if (retryBackoff || maxRetries) {
    return 'fixed';
  }

  return 'none';
}

/**
 * Analyze Kafka topic configuration for patterns
 * @param {Object} kafkaBinding - Kafka binding object
 * @returns {Object} Pattern analysis
 */
function analyzeKafkaPatterns(kafkaBinding) {
  const bindingData = kafkaBinding.json ? kafkaBinding.json() : kafkaBinding;
  const config = bindingData.configs || bindingData.topicConfiguration || {};

  return {
    has_dlq: !!config['dead.letter.queue.topic.name'],
    has_retry: !!(config['retry.backoff.ms'] || config['retries']),
    ordering_guarantee: inferOrderingGuarantee(bindingData, config),
    compaction: config['cleanup.policy'] === 'compact',
    retention_ms: config['retention.ms'],
    partition_count: bindingData.partitions || 1
  };
}

/**
 * Infer ordering guarantee from Kafka configuration
 * @param {Object} bindingData - Kafka binding data
 * @param {Object} config - Kafka configuration
 * @returns {string} Ordering guarantee level
 */
function inferOrderingGuarantee(bindingData, config) {
  const partitions = bindingData.partitions || 1;
  const maxInFlightRequests = config['max.in.flight.requests.per.connection'] || 5;

  // Single partition with max.in.flight.requests = 1 guarantees total ordering
  if (partitions === 1 && maxInFlightRequests === 1) {
    return 'total';
  }

  // Multiple partitions or in-flight requests > 1 only guarantees partition-level ordering
  if (partitions > 1 || maxInFlightRequests > 1) {
    return 'partition';
  }

  return 'none';
}

/**
 * Extract consumer group configuration (if present)
 * @param {Object} kafkaBinding - Kafka binding object
 * @returns {Object|null} Consumer group config
 */
function extractConsumerGroupConfig(kafkaBinding) {
  const bindingData = kafkaBinding.json ? kafkaBinding.json() : kafkaBinding;
  const groupId = bindingData.groupId || bindingData['group.id'];

  if (!groupId) return null;

  return {
    group_id: groupId,
    auto_offset_reset: bindingData['auto.offset.reset'] || 'latest',
    enable_auto_commit: bindingData['enable.auto.commit'] !== false,
    session_timeout_ms: bindingData['session.timeout.ms']
  };
}

module.exports = {
  extractKafkaBindings,
  inferKafkaGuarantees,
  inferRetryPolicy,
  analyzeKafkaPatterns,
  inferOrderingGuarantee,
  extractConsumerGroupConfig
};
