/**
 * AMQP Consumer Generator
 * Generates TypeScript consumer code for RabbitMQ/AMQP from Event Protocol manifests
 */

const { toClassName } = require('./kafka-consumer-generator');

/**
 * Generate AMQP consumer code from manifest
 * @param {object} manifest - Event Protocol manifest
 * @param {object} options - Generation options
 * @param {boolean} options.typescript - Generate TypeScript (default: true)
 * @returns {string} - Generated TypeScript consumer code
 */
function generateAMQPConsumer(manifest, options = {}) {
  const { typescript = true } = options;

  const eventName = manifest.event?.name || 'UnknownEvent';
  const className = toClassName(eventName);
  const delivery = manifest.delivery?.contract;
  const piiFields = manifest.schema?.fields?.filter(f => f.pii) || [];

  // Extract AMQP-specific metadata
  const amqpMeta = delivery?.metadata || {};
  const exchange = amqpMeta.exchange || 'default';
  const queue = amqpMeta.queue || eventName;
  const routingKey = amqpMeta.routingKey || eventName;
  const durable = amqpMeta.durable !== false; // Default true
  const prefetch = amqpMeta.prefetch || 1;
  const hasDLQ = !!delivery?.dlq;

  // Analyze patterns
  const patterns = manifest.patterns?.detected || [];
  const missingDLQ = patterns.find(p => p.pattern === 'missing_dlq');

  // Build imports
  const imports = [`import * as amqp from 'amqplib';`];
  if (piiFields.length > 0) {
    imports.push(`import { maskPII } from './utils/pii-masking';`);
  }

  // Build type annotations
  const typeAnnotations = typescript ? {
    connection: ': amqp.Connection | null',
    channel: ': amqp.Channel | null',
    connectionUrl: ': string',
    msg: ': amqp.Message',
    error: ': Error',
    method: 'async ',
    private: 'private ',
    return: ': Promise<void>'
  } : {
    connection: '',
    channel: '',
    connectionUrl: '',
    msg: '',
    error: '',
    method: '',
    private: '',
    return: ''
  };

  // Build governance comments
  const governanceComments = [];
  governanceComments.push(` * - Exchange: ${exchange}`);
  governanceComments.push(` * - Queue: ${queue}`);
  governanceComments.push(` * - Routing Key: ${routingKey}`);
  governanceComments.push(` * - Durable: ${durable ? 'Yes' : 'No'}`);
  governanceComments.push(` * - Prefetch: ${prefetch}`);
  governanceComments.push(` * - PII fields: ${piiFields.length > 0 ? '[' + piiFields.map(f => f.name).join(', ') + ']' : 'None'}`);
  governanceComments.push(` * - DLQ configured: ${hasDLQ ? '✅ Yes' : '⚠️ No'}`);

  if (missingDLQ) {
    governanceComments.push(` * - ⚠️ WARNING: ${missingDLQ.message}`);
  }

  return `${imports.join('\n')}

/**
 * AMQP Consumer for ${eventName}
 * Purpose: ${manifest.semantics?.purpose || 'Process event'}
 *
 * Governance:
${governanceComments.join('\n')}
 */
export class ${className}Consumer {
  ${typeAnnotations.private}connection${typeAnnotations.connection} = null;
  ${typeAnnotations.private}channel${typeAnnotations.channel} = null;

  constructor(${typeAnnotations.private}connectionUrl${typeAnnotations.connectionUrl}) {}

  ${typeAnnotations.method}start()${typeAnnotations.return} {
    this.connection = await amqp.connect(this.connectionUrl);
    this.channel = await this.connection.createChannel();

    const queue = '${queue}';
    await this.channel.assertQueue(queue, {
      durable: ${durable}
    });

    // Bind queue to exchange if specified
${exchange !== 'default' ? `    const exchange = '${exchange}';
    await this.channel.assertExchange(exchange, 'topic', { durable: ${durable} });
    await this.channel.bindQueue(queue, exchange, '${routingKey}');
` : ''}
    // Set prefetch for flow control
    await this.channel.prefetch(${prefetch});

    await this.channel.consume(queue, async (msg${typeAnnotations.msg}) => {
      if (!msg) return;

      try {
        await this.handleMessage(msg);
        this.channel?.ack(msg);
      } catch (error) {
        await this.handleError(error${typescript ? ' as Error' : ''}, msg);
      }
    });
  }

  ${typeAnnotations.private}${typeAnnotations.method}handleMessage(msg${typeAnnotations.msg})${typeAnnotations.return} {
    const event = JSON.parse(msg.content.toString());

${piiFields.length > 0 ? `    // Mask PII for logging
    const safeEvent = maskPII(event, [${piiFields.map(f => `'${f.name}'`).join(', ')}]);
    console.log('Processing event:', safeEvent);
` : `    console.log('Processing event:', event);
`}
    // TODO: Implement business logic
  }

  ${typeAnnotations.private}${typeAnnotations.method}handleError(error${typeAnnotations.error}, msg${typeAnnotations.msg})${typeAnnotations.return} {
    console.error('Error processing message:', error);

${hasDLQ ? `    // Route to DLQ: ${delivery.dlq}
    await this.sendToDLQ(msg, error);
    this.channel?.ack(msg); // Acknowledge original message after DLQ routing
` : `    // ⚠️ No DLQ configured - rejecting and not requeuing
    // Message will be lost unless a DLQ is configured at the queue level
    this.channel?.nack(msg, false, false);
`}  }

${hasDLQ ? `  ${typeAnnotations.private}${typeAnnotations.method}sendToDLQ(msg${typeAnnotations.msg}, error${typeAnnotations.error})${typeAnnotations.return} {
    if (!this.channel) return;

    const dlqQueue = '${delivery.dlq}';
    await this.channel.assertQueue(dlqQueue, { durable: ${durable} });

    await this.channel.sendToQueue(dlqQueue, msg.content, {
      headers: {
        ...msg.properties.headers,
        'x-error': error.message,
        'x-original-queue': '${queue}',
        'x-failed-at': new Date().toISOString()
      }
    });
  }

` : ''}  ${typeAnnotations.method}stop()${typeAnnotations.return} {
    await this.channel?.close();
    await this.connection?.close();
  }
}
`;
}

module.exports = { generateAMQPConsumer };
