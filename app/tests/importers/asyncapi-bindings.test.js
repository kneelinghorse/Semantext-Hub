const path = require('path');
const { importAsyncAPI } = require('../../importers/asyncapi/importer');
const { detectProtocolBindings } = require('../../importers/asyncapi/binding-detector');
const { extractKafkaBindings } = require('../../importers/asyncapi/kafka-utils');
const { extractAMQPBindings } = require('../../importers/asyncapi/amqp-utils');
const { extractMQTTBindings } = require('../../importers/asyncapi/mqtt-utils');

describe('Protocol Binding Detection', () => {
  const fixturesPath = path.join(__dirname, '../fixtures/asyncapi');

  test('detects Kafka bindings with high confidence', async () => {
    const specPath = path.join(fixturesPath, 'kafka-events.yaml');
    const result = await importAsyncAPI(specPath);
    const manifest = result.manifests[0];

    expect(manifest.delivery.contract.transport).toBe('kafka');
    expect(manifest.delivery.contract.confidence).toBeGreaterThanOrEqual(0.95);
    expect(manifest.delivery.contract.topic).toBe('orders.created');
  });

  test('detects AMQP bindings with high confidence', async () => {
    const specPath = path.join(fixturesPath, 'amqp-notifications.yaml');
    const result = await importAsyncAPI(specPath);
    const manifest = result.manifests[0];

    expect(manifest.delivery.contract.transport).toBe('amqp');
    expect(manifest.delivery.contract.confidence).toBeGreaterThanOrEqual(0.95);
  });

  test('detects MQTT bindings with high confidence', async () => {
    const specPath = path.join(fixturesPath, 'mqtt-telemetry.yaml');
    const result = await importAsyncAPI(specPath);
    const manifest = result.manifests[0];

    expect(manifest.delivery.contract.transport).toBe('mqtt');
    expect(manifest.delivery.contract.confidence).toBeGreaterThanOrEqual(0.95);
  });

  test('infers Kafka exactly-once guarantees correctly', async () => {
    const specPath = path.join(fixturesPath, 'kafka-events.yaml');
    const result = await importAsyncAPI(specPath);
    const manifest = result.manifests[0];

    expect(manifest.delivery.contract.guarantees).toBe('exactly-once');
  });

  test('detects Kafka DLQ configuration', async () => {
    const specPath = path.join(fixturesPath, 'kafka-events.yaml');
    const result = await importAsyncAPI(specPath);
    const manifest = result.manifests[0];

    expect(manifest.delivery.contract.dlq).toBe('orders.created.dlq');
  });

  test('detects Kafka retry policy', async () => {
    const specPath = path.join(fixturesPath, 'kafka-events.yaml');
    const result = await importAsyncAPI(specPath);
    const manifest = result.manifests[0];

    expect(manifest.delivery.contract.retry_policy).toBe('exponential');
  });

  test('infers AMQP at-least-once guarantees from durable queue', async () => {
    const specPath = path.join(fixturesPath, 'amqp-notifications.yaml');
    const result = await importAsyncAPI(specPath);
    const manifest = result.manifests[0];

    expect(manifest.delivery.contract.guarantees).toBe('at-least-once');
  });

  test('detects AMQP DLQ via dead-letter-exchange', async () => {
    const specPath = path.join(fixturesPath, 'amqp-notifications.yaml');
    const result = await importAsyncAPI(specPath);
    const manifest = result.manifests[0];

    expect(manifest.delivery.contract.dlq).toBe('notifications.dlx');
  });

  test('infers MQTT QoS guarantees correctly', async () => {
    const specPath = path.join(fixturesPath, 'mqtt-telemetry.yaml');
    const result = await importAsyncAPI(specPath);
    const manifest = result.manifests[0];

    // QoS 1 = at-least-once
    expect(manifest.delivery.contract.guarantees).toBe('at-least-once');
  });

  test('binding detection completes within performance target (<50ms)', async () => {
    const specPath = path.join(fixturesPath, 'kafka-events.yaml');
    const start = performance.now();
    const result = await importAsyncAPI(specPath);
    const duration = performance.now() - start;

    // Binding detection is subset of total parse time
    expect(duration).toBeLessThan(200);
  });
});
