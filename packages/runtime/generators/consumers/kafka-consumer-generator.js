/**
 * Kafka Consumer Generator
 * Generates TypeScript consumer code from Event Protocol manifests
 */

/**
 * Convert event name to ClassName format
 * @param {string} eventName - Event name (e.g., "user.created")
 * @returns {string} - Class name (e.g., "UserCreated")
 */
function toClassName(eventName) {
  return eventName
    .split(/[.-]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Generate Kafka consumer code from manifest
 * @param {object} manifest - Event Protocol manifest
 * @param {object} options - Generation options
 * @param {boolean} options.includeTests - Include test imports
 * @param {boolean} options.typescript - Generate TypeScript (default: true)
 * @returns {string} - Generated TypeScript consumer code
 */
function generateKafkaConsumer(manifest, options = {}) {
  const { typescript = true } = options;

  const eventName = manifest.event?.name || 'UnknownEvent';
  const className = toClassName(eventName);
  const delivery = manifest.delivery?.contract;
  const piiFields = manifest.schema?.fields?.filter(f => f.pii) || [];
  const hasDLQ = !!delivery?.dlq;

  // Analyze patterns for generation hints
  const patterns = manifest.patterns?.detected || [];
  const missingDLQ = patterns.find(p => p.pattern === 'missing_dlq');
  const orderingPattern = patterns.find(p =>
    p.pattern === 'user_keyed_ordering' || p.pattern === 'entity_keyed_ordering'
  );
  const retryPattern = patterns.find(p => p.pattern === 'exponential_backoff');

  // Build governance comments
  const governanceComments = [];
  governanceComments.push(` * - PII fields: ${piiFields.length > 0 ? '[' + piiFields.map(f => f.name).join(', ') + ']' : 'None'}`);
  governanceComments.push(` * - DLQ configured: ${hasDLQ ? '✅ Yes' : '⚠️ No'}`);

  if (missingDLQ) {
    governanceComments.push(` * - ⚠️ WARNING: ${missingDLQ.message}`);
  }
  if (orderingPattern) {
    governanceComments.push(` * - ℹ️ Ordering: ${orderingPattern.message}`);
  }
  if (retryPattern) {
    governanceComments.push(` * - ℹ️ Retry: ${retryPattern.message}`);
  }

  // Determine topic
  const topic = delivery?.topic || eventName;

  // Build imports
  const imports = [`import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';`];
  if (piiFields.length > 0) {
    imports.push(`import { maskPII } from './utils/pii-masking';`);
  }

  // Build type annotations
  const typeAnnotations = typescript ? {
    kafka: ': Kafka',
    consumer: ': Consumer',
    config: ': { brokers: string[]; groupId: string }',
    payload: ': EachMessagePayload',
    error: ': Error',
    method: 'async ',
    private: 'private ',
    return: ': Promise<void>'
  } : {
    kafka: '',
    consumer: '',
    config: '',
    payload: '',
    error: '',
    method: '',
    private: '',
    return: ''
  };

  return `${imports.join('\n')}

/**
 * Consumer for ${eventName}
 * Purpose: ${manifest.semantics?.purpose || 'Process event'}
 *
 * Governance:
${governanceComments.join('\n')}
 */
export class ${className}Consumer {
  ${typeAnnotations.private}kafka${typeAnnotations.kafka};
  ${typeAnnotations.private}consumer${typeAnnotations.consumer};

  constructor(config${typeAnnotations.config}) {
    this.kafka = new Kafka({
      clientId: '${eventName}-consumer',
      brokers: config.brokers
    });

    this.consumer = this.kafka.consumer({
      groupId: config.groupId
    });
  }

  ${typeAnnotations.method}start()${typeAnnotations.return} {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: '${topic}',
      fromBeginning: false
    });

    await this.consumer.run({
      eachMessage: async (payload${typeAnnotations.payload}) => {
        try {
          await this.handleMessage(payload);
        } catch (error) {
          await this.handleError(error${typescript ? ' as Error' : ''}, payload);
        }
      }
    });
  }

  ${typeAnnotations.private}${typeAnnotations.method}handleMessage(payload${typeAnnotations.payload})${typeAnnotations.return} {
    const { message } = payload;
    const event = JSON.parse(message.value?.toString() || '{}');

${piiFields.length > 0 ? `    // Mask PII for logging
    const safeEvent = maskPII(event, [${piiFields.map(f => `'${f.name}'`).join(', ')}]);
    console.log('Processing event:', safeEvent);
` : `    console.log('Processing event:', event);
`}
    // TODO: Implement business logic

    // Commit offset after successful processing
    // (Kafka auto-commits by default, explicit commit for at-least-once)
  }

  ${typeAnnotations.private}${typeAnnotations.method}handleError(error${typeAnnotations.error}, payload${typeAnnotations.payload})${typeAnnotations.return} {
    console.error('Error processing message:', error);

${hasDLQ ? `    // Route to DLQ: ${delivery.dlq}
    await this.sendToDLQ(payload, error);
` : `    // ⚠️ No DLQ configured - message will be retried or lost
    // TODO: Implement error handling strategy
`}  }

${hasDLQ ? `  ${typeAnnotations.private}${typeAnnotations.method}sendToDLQ(payload${typeAnnotations.payload}, error${typeAnnotations.error})${typeAnnotations.return} {
    const producer = this.kafka.producer();
    await producer.connect();

    await producer.send({
      topic: '${delivery.dlq}',
      messages: [{
        key: payload.message.key,
        value: payload.message.value,
        headers: {
          ...payload.message.headers,
          'x-error': error.message,
          'x-original-topic': '${topic}'
        }
      }]
    });

    await producer.disconnect();
  }

` : ''}  ${typeAnnotations.method}stop()${typeAnnotations.return} {
    await this.consumer.disconnect();
  }
}
`;
}

module.exports = { generateKafkaConsumer, toClassName };
