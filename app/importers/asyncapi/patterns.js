/**
 * Event-Specific Pattern Detection for AsyncAPI
 *
 * Detects DLQ/retry/ordering/fanout/schema evolution patterns from AsyncAPI specs.
 * Confidence scores based on signal strength from R4.1 research.
 */

/**
 * Detect all event-specific patterns for a channel
 *
 * @param {Object} manifest - Event protocol manifest from importer
 * @param {Object} channel - AsyncAPI channel object
 * @param {Object} document - Full AsyncAPI document
 * @returns {Array} Array of detected patterns
 */
function detectEventPatterns(manifest, channel, document) {
  const patterns = [];

  // Pattern 1: DLQ Configuration
  const dlqPattern = detectDLQPattern(manifest);
  if (dlqPattern) patterns.push(dlqPattern);

  // Pattern 2: Retry Policy
  const retryPattern = detectRetryPolicy(manifest);
  if (retryPattern) patterns.push(retryPattern);

  // Pattern 3: Message Ordering
  const orderingPattern = detectOrdering(manifest, channel);
  if (orderingPattern) patterns.push(orderingPattern);

  // Pattern 4: Event Fanout
  const fanoutPattern = detectFanout(channel, document);
  if (fanoutPattern) patterns.push(fanoutPattern);

  // Pattern 5: Schema Evolution
  const evolutionPattern = detectSchemaEvolution(manifest);
  if (evolutionPattern) patterns.push(evolutionPattern);

  return patterns;
}

/**
 * Detect DLQ patterns with PII correlation
 *
 * CRITICAL: PII events with retries MUST have DLQ (compliance risk)
 *
 * @param {Object} manifest - Event protocol manifest
 * @returns {Object|null} DLQ pattern or null
 */
function detectDLQPattern(manifest) {
  const delivery = manifest.delivery?.contract;
  if (!delivery) return null;

  const hasDLQ = !!delivery.dlq;
  const hasRetries = delivery.retry_policy !== 'none';
  const hasPII = manifest.schema?.fields?.some(f => f.pii && f.pii !== 'none');

  // CRITICAL: PII events with retries MUST have DLQ
  if (hasRetries && !hasDLQ && hasPII) {
    return {
      pattern: 'missing_dlq',
      confidence: 0.90,
      severity: 'error',
      message: 'PII events with retries must declare a DLQ',
      recommendation: 'Configure dead letter queue to prevent unprocessed PII accumulation',
      metadata: {
        has_pii: true,
        retry_policy: delivery.retry_policy
      }
    };
  }

  // DLQ without retries (unusual configuration)
  if (hasDLQ && !hasRetries) {
    return {
      pattern: 'dlq_without_retries',
      confidence: 0.75,
      severity: 'warn',
      message: 'DLQ configured but no retry policy',
      recommendation: 'Consider adding exponential backoff retry policy',
      metadata: {
        dlq_config: delivery.dlq
      }
    };
  }

  // Healthy configuration: DLQ + retries for PII
  if (hasDLQ && hasRetries && hasPII) {
    return {
      pattern: 'dlq_configured',
      confidence: 0.95,
      severity: 'info',
      message: 'DLQ properly configured for PII event with retries',
      recommendation: 'Monitor DLQ for unprocessed PII events',
      metadata: {
        has_pii: true,
        retry_policy: delivery.retry_policy,
        dlq_config: delivery.dlq
      }
    };
  }

  return null;
}

/**
 * Detect retry policy misconfigurations
 *
 * @param {Object} manifest - Event protocol manifest
 * @returns {Object|null} Retry pattern or null
 */
function detectRetryPolicy(manifest) {
  const delivery = manifest.delivery?.contract;
  if (!delivery || !delivery.retry_policy || delivery.retry_policy === 'none') {
    return null;
  }

  const metadata = delivery.metadata || {};

  // Kafka-specific: retry with exponential policy but no backoff config
  if (delivery.transport === 'kafka') {
    const retryBackoff = metadata['retry.backoff.ms'] || metadata['retry_backoff_ms'];

    if (delivery.retry_policy === 'exponential' && !retryBackoff) {
      return {
        pattern: 'exponential_without_backoff',
        confidence: 0.80,
        severity: 'warn',
        message: 'Exponential retry declared but no backoff configured',
        recommendation: 'Set retry.backoff.ms in Kafka binding',
        metadata: {
          transport: 'kafka',
          retry_policy: delivery.retry_policy
        }
      };
    }

    // Also check for retries with fixed policy but no backoff (common misconfiguration)
    if (delivery.retry_policy === 'fixed' && !retryBackoff) {
      return {
        pattern: 'exponential_without_backoff',
        confidence: 0.80,
        severity: 'warn',
        message: 'Retry policy configured but no backoff specified',
        recommendation: 'Set retry.backoff.ms in Kafka binding',
        metadata: {
          transport: 'kafka',
          retry_policy: delivery.retry_policy
        }
      };
    }

    // Validate backoff value is reasonable
    if (retryBackoff && (retryBackoff < 100 || retryBackoff > 60000)) {
      return {
        pattern: 'unreasonable_backoff',
        confidence: 0.75,
        severity: 'warn',
        message: `Retry backoff ${retryBackoff}ms is outside typical range (100-60000ms)`,
        recommendation: 'Use 1000-10000ms for most use cases',
        metadata: {
          transport: 'kafka',
          backoff_ms: retryBackoff
        }
      };
    }
  }

  // AMQP-specific: retry without max attempts
  if (delivery.transport === 'amqp') {
    const maxRetries = metadata['x-max-retries'];

    if (delivery.retry_policy !== 'none' && !maxRetries) {
      return {
        pattern: 'retry_without_max_attempts',
        confidence: 0.80,
        severity: 'warn',
        message: 'Retry policy without max attempts can cause infinite loops',
        recommendation: 'Set x-max-retries in AMQP binding',
        metadata: {
          transport: 'amqp',
          retry_policy: delivery.retry_policy
        }
      };
    }
  }

  return null;
}

/**
 * Detect message ordering guarantees from partitioning
 *
 * @param {Object} manifest - Event protocol manifest
 * @param {Object} channel - AsyncAPI channel object
 * @returns {Object|null} Ordering pattern or null
 */
function detectOrdering(manifest, channel) {
  const delivery = manifest.delivery?.contract;
  if (!delivery) return null;

  // Kafka-specific ordering analysis
  if (delivery.transport === 'kafka') {
    const metadata = delivery.metadata || {};
    // Partitions are exposed as `partitions` in our binding metadata
    const partitions = metadata.partitions;
    const keySchema = metadata['key.schema'] || metadata['key'];

    // User-keyed ordering pattern (common for PII events)
    if (keySchema) {
      const keyType = typeof keySchema === 'object' ? keySchema.type : 'string';
      const keyDesc = typeof keySchema === 'object' ? (keySchema.description || '') : '';

      if (keyDesc.toLowerCase().includes('user') ||
          keyDesc.toLowerCase().includes('customer') ||
          keyDesc.toLowerCase().includes('account')) {
        return {
          pattern: 'user_keyed_ordering',
          confidence: 0.80,
          severity: 'info',
          message: 'Events are ordered per user (partition key)',
          recommendation: 'Ensure downstream consumers handle per-user ordering',
          metadata: {
            transport: 'kafka',
            key_type: keyType,
            key_field: keyDesc
          }
        };
      }

      // Generic keyed ordering
      return {
        pattern: 'keyed_ordering',
        confidence: 0.75,
        severity: 'info',
        message: 'Events use partition key for ordering',
        recommendation: 'Order is guaranteed per key value',
        metadata: {
          transport: 'kafka',
          key_type: keyType
        }
      };
    }

    // Heuristic: If schema contains a `user_id` field, infer per-user ordering
    // even when explicit key schema is not declared in the binding metadata.
    const payload = manifest.schema && manifest.schema.payload;
    const maybeProps = payload && (payload.properties || {});
    if (partitions && partitions > 1 && maybeProps && Object.prototype.hasOwnProperty.call(maybeProps, 'user_id')) {
      return {
        pattern: 'user_keyed_ordering',
        confidence: 0.8,
        severity: 'info',
        message: 'Events are likely ordered per user (partition heuristic)',
        recommendation: 'Ensure downstream consumers handle per-user ordering',
        metadata: {
          transport: 'kafka',
          key_field: 'user_id'
        }
      };
    }

    // Multiple partitions without key = no ordering guarantee
    if (partitions && partitions > 1 && !keySchema) {
      return {
        pattern: 'multi_partition_no_key',
        confidence: 0.85,
        severity: 'warn',
        message: `${partitions} partitions but no partition key defined`,
        recommendation: 'Define message key for consistent ordering per entity',
        metadata: {
          transport: 'kafka',
          partition_count: partitions
        }
      };
    }
  }

  // AMQP routing key analysis
  if (delivery.transport === 'amqp') {
    const metadata = delivery.metadata || {};
    const routingKey = metadata['routing-key'] || metadata['routing_key'];

    if (routingKey) {
      return {
        pattern: 'routing_key_ordering',
        confidence: 0.70,
        severity: 'info',
        message: 'AMQP routing key may provide partial ordering',
        recommendation: 'Ordering depends on exchange type and queue configuration',
        metadata: {
          transport: 'amqp',
          routing_key: routingKey
        }
      };
    }
  }

  return null;
}

/**
 * Detect event fanout (multiple subscribers)
 *
 * High fanout amplifies PII exposure and retention risks
 *
 * @param {Object} channel - AsyncAPI channel object
 * @param {Object} document - Full AsyncAPI document
 * @returns {Object|null} Fanout pattern or null
 */
function detectFanout(channel, document) {
  // Count subscribers from channel operations (AsyncAPI 3.x Collections)
  let opsArray = [];
  if (typeof channel.operations === 'function') {
    const opsCollection = channel.operations();
    if (opsCollection && typeof opsCollection.all === 'function') {
      opsArray = opsCollection.all();
    }
  }

  // Fallback: if we somehow already have an array-like, normalize
  if (!Array.isArray(opsArray)) {
    opsArray = [];
  }

  const subscribeOps = opsArray.filter(op => {
    const action = op.action?.();
    return action === 'receive' || action === 'subscribe';
  });

  const subscriberCount = subscribeOps.length;

  // High fanout (>3 subscribers)
  if (subscriberCount > 3) {
    const subscriberIds = subscribeOps
      .map(op => op.id?.())
      .filter(Boolean);

    return {
      pattern: 'high_fanout',
      confidence: 0.75,
      severity: 'info',
      message: `${subscriberCount} subscribers detected`,
      recommendation: 'Monitor for amplified PII exposure and retention multiplication',
      metadata: {
        subscriber_count: subscriberCount,
        subscriber_ids: subscriberIds
      }
    };
  }

  // Moderate fanout (2-3 subscribers)
  if (subscriberCount >= 2) {
    const subscriberIds = subscribeOps
      .map(op => op.id?.())
      .filter(Boolean);

    return {
      pattern: 'moderate_fanout',
      confidence: 0.70,
      severity: 'info',
      message: `${subscriberCount} subscribers detected`,
      recommendation: 'Verify each subscriber has proper PII handling',
      metadata: {
        subscriber_count: subscriberCount,
        subscriber_ids: subscriberIds
      }
    };
  }

  return null;
}

/**
 * Assess schema evolution friendliness
 *
 * Based on optional vs required field ratios
 *
 * @param {Object} manifest - Event protocol manifest
 * @returns {Object|null} Evolution pattern or null
 */
function detectSchemaEvolution(manifest) {
  const schema = manifest.schema?.payload;
  if (!schema) return null;

  const { optional, required } = countFields(schema);
  const total = optional + required;

  if (total === 0) return null;

  const optionalRatio = optional / total;

  // Backward compatible schema (mostly optional fields)
  if (optionalRatio > 0.7) {
    return {
      pattern: 'backward_compatible_schema',
      confidence: 0.70,
      severity: 'info',
      message: `${Math.round(optionalRatio * 100)}% optional fields suggests backward compatibility`,
      recommendation: 'Schema evolution appears safe for consumers',
      metadata: {
        optional_fields: optional,
        required_fields: required,
        optional_ratio: optionalRatio
      }
    };
  }

  // Rigid schema (mostly required fields)
  if (optionalRatio < 0.2) {
    return {
      pattern: 'rigid_schema',
      confidence: 0.75,
      severity: 'warn',
      message: `${Math.round((1 - optionalRatio) * 100)}% required fields limits evolution`,
      recommendation: 'Consider making new fields optional to enable backward compatibility',
      metadata: {
        optional_fields: optional,
        required_fields: required,
        optional_ratio: optionalRatio
      }
    };
  }

  // Balanced schema
  return {
    pattern: 'balanced_schema',
    confidence: 0.65,
    severity: 'info',
    message: `${Math.round(optionalRatio * 100)}% optional fields provides moderate flexibility`,
    recommendation: 'Schema evolution possible with care',
    metadata: {
      optional_fields: optional,
      required_fields: required,
      optional_ratio: optionalRatio
    }
  };
}

/**
 * Count optional vs required fields in schema
 *
 * Recursively analyzes nested objects
 *
 * @param {Object} schema - JSON Schema object
 * @param {Object} counts - Accumulator for counts
 * @returns {Object} { optional, required }
 */
function countFields(schema, counts = { optional: 0, required: 0 }) {
  if (!schema) return counts;

  if (schema.type === 'object') {
    const properties = schema.properties || {};
    const required = new Set(schema.required || []);

    Object.keys(properties).forEach(key => {
      if (required.has(key)) {
        counts.required++;
      } else {
        counts.optional++;
      }
    });

    // Recurse into nested objects
    Object.values(properties).forEach(prop => {
      if (prop.type === 'object') {
        countFields(prop, counts);
      }
    });
  }

  return counts;
}

module.exports = {
  detectEventPatterns,
  detectDLQPattern,
  detectRetryPolicy,
  detectOrdering,
  detectFanout,
  detectSchemaEvolution,
  countFields
};
