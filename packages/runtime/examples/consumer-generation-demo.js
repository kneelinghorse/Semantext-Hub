/**
 * Consumer Generation Demo
 * Demonstrates the consumer code generation capabilities
 */

const { generateEventConsumer, generateEventConsumers } = require('../generators/consumers');

console.log('🎯 Event Consumer Generation Demo\n');
console.log('='.repeat(60));

// Demo 1: Kafka Consumer with PII and DLQ
console.log('\n📦 Demo 1: Kafka Consumer with PII and DLQ');
console.log('-'.repeat(60));

const kafkaManifest = {
  event: { name: 'user.registered' },
  delivery: {
    contract: {
      transport: 'kafka',
      topic: 'users.registered',
      dlq: 'users.registered.dlq'
    }
  },
  schema: {
    fields: [
      { name: 'userId', type: 'string', pii: false },
      { name: 'email', type: 'string', pii: true },
      { name: 'name', type: 'string', pii: true },
      { name: 'timestamp', type: 'number', pii: false }
    ]
  },
  semantics: {
    purpose: 'Process new user registrations and send welcome emails'
  },
  patterns: {
    detected: [
      {
        pattern: 'user_keyed_ordering',
        message: 'Messages partitioned by userId for ordering guarantees'
      }
    ]
  }
};

const kafkaResult = generateEventConsumer(kafkaManifest);

console.log('✅ Generated Kafka Consumer:');
console.log(`   - Transport: ${kafkaResult.transport}`);
console.log(`   - Generator: ${kafkaResult.generator}`);
console.log(`   - Consumer code: ${kafkaResult.consumer.split('\n').length} lines`);
console.log(`   - Test scaffold: ${kafkaResult.test.split('\n').length} lines`);
console.log(`   - PII utility: ${kafkaResult.piiUtil ? 'Yes' : 'No'}`);

// Demo 2: AMQP Consumer with Exchange Binding
console.log('\n📦 Demo 2: AMQP Consumer with Exchange Binding');
console.log('-'.repeat(60));

const amqpManifest = {
  event: { name: 'order.shipped' },
  delivery: {
    contract: {
      transport: 'amqp',
      metadata: {
        exchange: 'orders',
        queue: 'order.shipped',
        routingKey: 'order.shipped',
        durable: true,
        prefetch: 5
      }
    }
  },
  schema: {
    fields: [
      { name: 'orderId', type: 'string', pii: false },
      { name: 'trackingNumber', type: 'string', pii: false },
      { name: 'shippingAddress', type: 'object', pii: true }
    ]
  },
  semantics: {
    purpose: 'Track order shipments and notify customers'
  }
};

const amqpResult = generateEventConsumer(amqpManifest);

console.log('✅ Generated AMQP Consumer:');
console.log(`   - Transport: ${amqpResult.transport}`);
console.log(`   - Generator: ${amqpResult.generator}`);
console.log(`   - Consumer code: ${amqpResult.consumer.split('\n').length} lines`);
console.log(`   - Test scaffold: ${amqpResult.test.split('\n').length} lines`);
console.log(`   - PII utility: ${amqpResult.piiUtil ? 'Yes' : 'No'}`);

// Demo 3: MQTT Consumer with QoS
console.log('\n📦 Demo 3: MQTT Consumer with QoS 2');
console.log('-'.repeat(60));

const mqttManifest = {
  event: { name: 'sensor.critical-alert' },
  delivery: {
    contract: {
      transport: 'mqtt',
      topic: 'sensors/critical/+',
      metadata: {
        qos: 2,
        retained: true,
        cleanSession: false
      }
    }
  },
  schema: {
    fields: [
      { name: 'sensorId', type: 'string', pii: false },
      { name: 'alertLevel', type: 'string', pii: false },
      { name: 'location', type: 'object', pii: true }
    ]
  },
  semantics: {
    purpose: 'Process critical sensor alerts requiring exactly-once delivery'
  }
};

const mqttResult = generateEventConsumer(mqttManifest);

console.log('✅ Generated MQTT Consumer:');
console.log(`   - Transport: ${mqttResult.transport}`);
console.log(`   - Generator: ${mqttResult.generator}`);
console.log(`   - Consumer code: ${mqttResult.consumer.split('\n').length} lines`);
console.log(`   - Test scaffold: ${mqttResult.test.split('\n').length} lines`);
console.log(`   - PII utility: ${mqttResult.piiUtil ? 'Yes' : 'No'}`);

// Demo 4: Batch Generation
console.log('\n📦 Demo 4: Batch Consumer Generation');
console.log('-'.repeat(60));

const manifests = [
  {
    event: { name: 'payment.processed' },
    delivery: { contract: { transport: 'kafka', topic: 'payments' } },
    schema: { fields: [{ name: 'amount', pii: false }] }
  },
  {
    event: { name: 'invoice.created' },
    delivery: { contract: { transport: 'kafka', topic: 'invoices' } },
    schema: { fields: [{ name: 'total', pii: false }] }
  },
  {
    event: { name: 'refund.issued' },
    delivery: { contract: { transport: 'kafka', topic: 'refunds' } },
    schema: { fields: [{ name: 'refundAmount', pii: false }] }
  }
];

const startTime = Date.now();
const batchResult = generateEventConsumers(manifests);
const duration = Date.now() - startTime;

console.log('✅ Batch Generation Complete:');
console.log(`   - Total manifests: ${batchResult.summary.total}`);
console.log(`   - Successful: ${batchResult.summary.successful}`);
console.log(`   - Failed: ${batchResult.summary.failed}`);
console.log(`   - Duration: ${duration}ms`);
console.log(`   - Performance: ${(duration / batchResult.summary.total).toFixed(1)}ms per consumer`);

// Demo 5: Pattern-Aware Generation
console.log('\n📦 Demo 5: Pattern-Aware Generation (Missing DLQ Warning)');
console.log('-'.repeat(60));

const patternManifest = {
  event: { name: 'critical.transaction' },
  delivery: {
    contract: {
      transport: 'kafka',
      topic: 'transactions.critical'
      // No DLQ configured!
    }
  },
  schema: {
    fields: [
      { name: 'transactionId', pii: false },
      { name: 'creditCardNumber', pii: true }
    ]
  },
  patterns: {
    detected: [
      {
        pattern: 'missing_dlq',
        message: 'Critical event stream without DLQ - message loss risk',
        severity: 'high'
      }
    ]
  }
};

const patternResult = generateEventConsumer(patternManifest);

console.log('✅ Generated Consumer with Governance Warnings:');
console.log(`   - Consumer includes DLQ warning: ${patternResult.consumer.includes('⚠️ WARNING')}`);
console.log(`   - Consumer includes TODO comment: ${patternResult.consumer.includes('TODO: Implement error handling')}`);
console.log(`   - PII fields masked in logs: ${patternResult.consumer.includes('maskPII')}`);

// Display sample generated code
console.log('\n📝 Sample Generated Code Preview (first 25 lines):');
console.log('-'.repeat(60));

const preview = kafkaResult.consumer.split('\n').slice(0, 25).join('\n');
console.log(preview);
console.log('...');

console.log('\n' + '='.repeat(60));
console.log('✅ Demo Complete!\n');
console.log('Key Features Demonstrated:');
console.log('  ✓ Kafka, AMQP, and MQTT consumer generation');
console.log('  ✓ PII masking utilities for safe logging');
console.log('  ✓ DLQ routing when configured');
console.log('  ✓ Pattern-aware generation with governance warnings');
console.log('  ✓ Test scaffold generation');
console.log('  ✓ Batch generation for multiple consumers');
console.log('  ✓ TypeScript-first code generation');
console.log('  ✓ Performance: <100ms per consumer\n');
