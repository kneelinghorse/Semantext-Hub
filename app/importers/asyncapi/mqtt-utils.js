/**
 * MQTT-specific binding extraction and analysis
 */

/**
 * Extract MQTT binding configuration
 * @param {Object} mqttBinding - MQTT binding object from AsyncAPI
 * @returns {Object} MQTT binding configuration
 */
function extractMQTTBindings(mqttBinding, channel, meta = {}) {
  const bindingData = mqttBinding && typeof mqttBinding.json === 'function'
    ? mqttBinding.json()
    : mqttBinding;

  if (!bindingData) {
    return null;
  }

  const qos = bindingData.qos !== undefined ? bindingData.qos : 0;

  return {
    transport: 'mqtt',
    topic: bindingData.topic || 'unknown',
    guarantees: inferMQTTGuarantees(qos),
    retry_policy: inferMQTTRetryPolicy(qos),
    dlq: null, // MQTT doesn't have native DLQ support
    metadata: {
      qos: qos,
      retain: bindingData.retain || false,
      client_id: bindingData.clientId,
      clean_session: bindingData.cleanSession !== false,
      keep_alive: bindingData.keepAlive || 60,
      will: bindingData.will || null,
      pointer: meta.pointer,
      channel: channel?.id ? channel.id() : undefined
    }
  };
}

/**
 * Infer delivery guarantees from MQTT QoS level
 * @param {number} qos - MQTT QoS level (0, 1, or 2)
 * @returns {string} Delivery guarantee level
 */
function inferMQTTGuarantees(qos) {
  const guaranteesMap = {
    0: 'best-effort',      // At most once
    1: 'at-least-once',    // At least once
    2: 'exactly-once'      // Exactly once
  };

  return guaranteesMap[qos] || 'best-effort';
}

/**
 * Infer retry policy from MQTT QoS level
 * @param {number} qos - MQTT QoS level
 * @returns {string} Retry policy type
 */
function inferMQTTRetryPolicy(qos) {
  // QoS 1 and 2 have built-in retry mechanisms
  if (qos > 0) {
    return 'exponential';
  }

  // QoS 0 has no retry
  return 'none';
}

/**
 * Analyze MQTT patterns
 * @param {Object} mqttBinding - MQTT binding object
 * @returns {Object} Pattern analysis
 */
function analyzeMQTTPatterns(mqttBinding) {
  const bindingData = mqttBinding.json ? mqttBinding.json() : mqttBinding;
  const qos = bindingData.qos !== undefined ? bindingData.qos : 0;
  const topic = bindingData.topic || '';

  return {
    has_dlq: false, // MQTT doesn't have native DLQ
    has_retry: qos > 0,
    ordering_guarantee: inferMQTTOrderingGuarantee(qos),
    retain: bindingData.retain || false,
    qos_level: qos,
    is_wildcard: isWildcardTopic(topic),
    topic_depth: getTopicDepth(topic)
  };
}

/**
 * Infer ordering guarantee from MQTT configuration
 * @param {number} qos - MQTT QoS level
 * @returns {string} Ordering guarantee level
 */
function inferMQTTOrderingGuarantee(qos) {
  // MQTT maintains message order for QoS 1 and 2 within a session
  if (qos > 0) {
    return 'session';
  }

  // QoS 0 doesn't guarantee order
  return 'none';
}

/**
 * Check if topic uses wildcards
 * @param {string} topic - MQTT topic
 * @returns {boolean} True if topic contains wildcards
 */
function isWildcardTopic(topic) {
  return topic.includes('+') || topic.includes('#');
}

/**
 * Get topic hierarchy depth
 * @param {string} topic - MQTT topic
 * @returns {number} Number of levels in topic hierarchy
 */
function getTopicDepth(topic) {
  if (!topic) return 0;
  return topic.split('/').length;
}

/**
 * Parse MQTT topic pattern
 * @param {string} topic - MQTT topic with potential wildcards
 * @returns {Object} Parsed topic information
 */
function parseMQTTTopic(topic) {
  const parts = topic.split('/');
  const wildcards = {
    single_level: topic.match(/\+/g)?.length || 0,
    multi_level: topic.includes('#')
  };

  return {
    original: topic,
    depth: parts.length,
    wildcards: wildcards,
    is_wildcard: wildcards.single_level > 0 || wildcards.multi_level,
    parts: parts
  };
}

/**
 * Extract MQTT session configuration
 * @param {Object} mqttBinding - MQTT binding object
 * @returns {Object} Session configuration
 */
function extractSessionConfig(mqttBinding) {
  const bindingData = mqttBinding.json ? mqttBinding.json() : mqttBinding;

  return {
    clean_session: bindingData.cleanSession !== false,
    client_id: bindingData.clientId || null,
    keep_alive: bindingData.keepAlive || 60,
    will_topic: bindingData.will?.topic || null,
    will_qos: bindingData.will?.qos || 0,
    will_retain: bindingData.will?.retain || false
  };
}

module.exports = {
  extractMQTTBindings,
  inferMQTTGuarantees,
  inferMQTTRetryPolicy,
  analyzeMQTTPatterns,
  inferMQTTOrderingGuarantee,
  isWildcardTopic,
  getTopicDepth,
  parseMQTTTopic,
  extractSessionConfig
};
