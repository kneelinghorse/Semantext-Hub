/**
 * Tests for MQTT Consumer Generator
 */

const { generateMQTTConsumer } = require('../../generators/consumers/mqtt-consumer-generator');

describe('MQTT Consumer Generator', () => {
  describe('generateMQTTConsumer', () => {
    it('should generate basic MQTT consumer', () => {
      const manifest = {
        event: { name: 'sensor.reading' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'sensors/temperature'
          }
        },
        schema: { fields: [] },
        semantics: { purpose: 'Process sensor temperature readings' }
      };

      const code = generateMQTTConsumer(manifest);

      expect(code).toContain('export class SensorReadingConsumer');
      expect(code).toContain("import mqtt from 'mqtt'");
      expect(code).toContain("this.client!.subscribe('sensors/temperature'");
      expect(code).toContain('Process sensor temperature readings');
    });

    it('should include PII masking when PII fields exist', () => {
      const manifest = {
        event: { name: 'device.registered' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'devices/registered'
          }
        },
        schema: {
          fields: [
            { name: 'deviceId', pii: true },
            { name: 'location', pii: true }
          ]
        }
      };

      const code = generateMQTTConsumer(manifest);

      expect(code).toContain("import { maskPII } from './utils/pii-masking'");
      expect(code).toContain("maskPII(event, ['deviceId', 'location'])");
    });

    it('should handle different QoS levels', () => {
      const manifestQoS0 = {
        event: { name: 'telemetry.data' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'telemetry/data',
            metadata: { qos: 0 }
          }
        },
        schema: { fields: [] }
      };

      const codeQoS0 = generateMQTTConsumer(manifestQoS0);
      expect(codeQoS0).toContain('QoS: 0 (At most once)');
      expect(codeQoS0).toContain('qos: 0');

      const manifestQoS1 = {
        event: { name: 'telemetry.data' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'telemetry/data',
            metadata: { qos: 1 }
          }
        },
        schema: { fields: [] }
      };

      const codeQoS1 = generateMQTTConsumer(manifestQoS1);
      expect(codeQoS1).toContain('QoS: 1 (At least once)');
      expect(codeQoS1).toContain('qos: 1');

      const manifestQoS2 = {
        event: { name: 'telemetry.data' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'telemetry/data',
            metadata: { qos: 2 }
          }
        },
        schema: { fields: [] }
      };

      const codeQoS2 = generateMQTTConsumer(manifestQoS2);
      expect(codeQoS2).toContain('QoS: 2 (Exactly once)');
      expect(codeQoS2).toContain('qos: 2');
    });

    it('should use default QoS 0 when not specified', () => {
      const manifest = {
        event: { name: 'default.event' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'default/topic'
          }
        },
        schema: { fields: [] }
      };

      const code = generateMQTTConsumer(manifest);

      expect(code).toContain('QoS: 0');
      expect(code).toContain('qos: 0');
    });

    it('should include retained message information', () => {
      const manifest = {
        event: { name: 'config.update' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'config/updates',
            metadata: {
              retained: true
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateMQTTConsumer(manifest);

      expect(code).toContain('Retained: Yes');
    });

    it('should include clean session information', () => {
      const manifest = {
        event: { name: 'persistent.event' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'persistent/topic',
            metadata: {
              cleanSession: false
            }
          }
        },
        schema: { fields: [] }
      };

      const code = generateMQTTConsumer(manifest);

      expect(code).toContain('Clean Session: No');
      expect(code).toContain('clean: false');
    });

    it('should include ordering pattern comments when present', () => {
      const manifest = {
        event: { name: 'vehicle.position' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'vehicles/+/position'
          }
        },
        schema: { fields: [] },
        patterns: {
          detected: [
            {
              pattern: 'entity_keyed_ordering',
              message: 'Messages ordered by vehicle ID'
            }
          ]
        }
      };

      const code = generateMQTTConsumer(manifest);

      expect(code).toContain('ℹ️ Ordering: Messages ordered by vehicle ID');
    });

    it('should generate JavaScript when typescript option is false', () => {
      const manifest = {
        event: { name: 'test.event' },
        delivery: {
          contract: {
            transport: 'mqtt',
            topic: 'test/topic'
          }
        },
        schema: { fields: [] }
      };

      const code = generateMQTTConsumer(manifest, { typescript: false });

      expect(code).not.toContain(': mqtt.MqttClient');
      expect(code).not.toContain(': string');
      expect(code).not.toContain('private ');
      expect(code).not.toContain('as mqtt.QoS');
    });
  });
});
