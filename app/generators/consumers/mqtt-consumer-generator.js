/**
 * MQTT Consumer Generator
 * Generates TypeScript consumer code for MQTT from Event Protocol manifests
 */

const { toClassName } = require('./kafka-consumer-generator');

/**
 * Generate MQTT consumer code from manifest
 * @param {object} manifest - Event Protocol manifest
 * @param {object} options - Generation options
 * @param {boolean} options.typescript - Generate TypeScript (default: true)
 * @returns {string} - Generated TypeScript consumer code
 */
function generateMQTTConsumer(manifest, options = {}) {
  const { typescript = true } = options;

  const eventName = manifest.event?.name || 'UnknownEvent';
  const className = toClassName(eventName);
  const delivery = manifest.delivery?.contract;
  const piiFields = manifest.schema?.fields?.filter(f => f.pii) || [];

  // Extract MQTT-specific metadata
  const mqttMeta = delivery?.metadata || {};
  const topic = delivery?.topic || eventName;
  const qos = mqttMeta.qos !== undefined ? mqttMeta.qos : 0;
  const retained = mqttMeta.retained || false;
  const cleanSession = mqttMeta.cleanSession !== false; // Default true

  // Analyze patterns
  const patterns = manifest.patterns?.detected || [];
  const orderingPattern = patterns.find(p =>
    p.pattern === 'user_keyed_ordering' || p.pattern === 'entity_keyed_ordering'
  );

  // Build imports
  const imports = [`import mqtt from 'mqtt';`];
  if (piiFields.length > 0) {
    imports.push(`import { maskPII } from './utils/pii-masking';`);
  }

  // Build type annotations
  const typeAnnotations = typescript ? {
    client: ': mqtt.MqttClient | null',
    brokerUrl: ': string',
    topic: ': string',
    message: ': Buffer',
    error: ': Error',
    method: 'async ',
    private: 'private ',
    returnVoid: ': Promise<void>',
    returnClient: ''
  } : {
    client: '',
    brokerUrl: '',
    topic: '',
    message: '',
    error: '',
    method: '',
    private: '',
    returnVoid: '',
    returnClient: ''
  };

  // Build governance comments
  const governanceComments = [];
  governanceComments.push(` * - Topic: ${topic}`);
  governanceComments.push(` * - QoS: ${qos} (${qos === 0 ? 'At most once' : qos === 1 ? 'At least once' : 'Exactly once'})`);
  governanceComments.push(` * - Retained: ${retained ? 'Yes' : 'No'}`);
  governanceComments.push(` * - Clean Session: ${cleanSession ? 'Yes' : 'No'}`);
  governanceComments.push(` * - PII fields: ${piiFields.length > 0 ? '[' + piiFields.map(f => f.name).join(', ') + ']' : 'None'}`);

  if (orderingPattern) {
    governanceComments.push(` * - ℹ️ Ordering: ${orderingPattern.message}`);
  }

  return `${imports.join('\n')}

/**
 * MQTT Consumer for ${eventName}
 * Purpose: ${manifest.semantics?.purpose || 'Process event'}
 *
 * Governance:
${governanceComments.join('\n')}
 */
export class ${className}Consumer {
  ${typeAnnotations.private}client${typeAnnotations.client} = null;

  constructor(${typeAnnotations.private}brokerUrl${typeAnnotations.brokerUrl}) {}

  ${typeAnnotations.method}start()${typeAnnotations.returnVoid} {
    return new Promise${typescript ? '<void>' : ''}((resolve, reject) => {
      this.client = mqtt.connect(this.brokerUrl, {
        clientId: '${eventName}-consumer-' + Math.random().toString(16).substr(2, 8),
        clean: ${cleanSession},
        qos: ${qos}${typescript ? ' as mqtt.QoS' : ''}
      });

      this.client.on('connect', () => {
        console.log('Connected to MQTT broker');
        this.client${typescript ? '!' : ''}.subscribe('${topic}', { qos: ${qos}${typescript ? ' as mqtt.QoS' : ''} }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      this.client.on('error', (err) => {
        console.error('MQTT connection error:', err);
        reject(err);
      });

      this.client.on('message', async (topic${typeAnnotations.topic}, message${typeAnnotations.message}) => {
        try {
          await this.handleMessage(topic, message);
        } catch (error) {
          await this.handleError(error${typescript ? ' as Error' : ''}, topic, message);
        }
      });
    });
  }

  ${typeAnnotations.private}${typeAnnotations.method}handleMessage(topic${typeAnnotations.topic}, message${typeAnnotations.message})${typeAnnotations.returnVoid} {
    const event = JSON.parse(message.toString());

${piiFields.length > 0 ? `    // Mask PII for logging
    const safeEvent = maskPII(event, [${piiFields.map(f => `'${f.name}'`).join(', ')}]);
    console.log('Processing event:', safeEvent);
` : `    console.log('Processing event:', event);
`}
    // TODO: Implement business logic
  }

  ${typeAnnotations.private}${typeAnnotations.method}handleError(error${typeAnnotations.error}, topic${typeAnnotations.topic}, message${typeAnnotations.message})${typeAnnotations.returnVoid} {
    console.error('Error processing message:', error);

    // ℹ️ MQTT typically doesn't support DLQ at the protocol level
    // Consider implementing application-level error handling:
    // - Publish to an error topic
    // - Store in a local database for retry
    // - Send to external monitoring service
    // TODO: Implement error handling strategy
  }

  ${typeAnnotations.method}stop()${typeAnnotations.returnVoid} {
    return new Promise${typescript ? '<void>' : ''}((resolve) => {
      if (!this.client) {
        resolve();
        return;
      }

      this.client.end(false, {}, () => {
        this.client = null;
        resolve();
      });
    });
  }
}
`;
}

module.exports = { generateMQTTConsumer };
