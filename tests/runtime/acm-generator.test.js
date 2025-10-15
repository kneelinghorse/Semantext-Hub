/**
 * ACM Generator Tests
 * 
 * Comprehensive test suite for the ACM generator including:
 * - ACM manifest generation
 * - Schema validation
 * - URN format validation
 * - Capability validation
 * - Error handling
 * - Logging verification
 */

import { jest } from '@jest/globals';
import { ACMGenerator, createACMGenerator, createACM, validateACM } from '../../packages/runtime/runtime/acm-generator.js';
import { 
  ACMError, 
  ACMValidationError, 
  ACMSchemaError 
} from '../../packages/runtime/runtime/acm-types.js';

describe('ACM Generator', () => {
  let generator;

  beforeEach(() => {
    generator = new ACMGenerator({
      enableLogging: false // Disable logging for tests
    });
  });

  describe('createACM', () => {
    test('should create valid ACM manifest', async () => {
      const agentConfig = {
        urn: 'urn:agent:ai:ml-agent@1.0.0',
        name: 'ml-agent',
        version: '1.0.0',
        description: 'Machine learning agent',
        capabilities: {
          'ml-inference': {
            type: 'service',
            description: 'Machine learning inference'
          },
          'data-processing': {
            type: 'service',
            description: 'Data processing'
          }
        },
        endpoints: {
          api: '/api/v1',
          health: '/health'
        }
      };

      const manifest = await generator.createACM(agentConfig);

      expect(manifest).toBeDefined();
      expect(manifest.apiVersion).toBe('acm.ossp-agi.io/v1');
      expect(manifest.kind).toBe('AgentCapabilityManifest');
      expect(manifest.metadata.urn).toBe(agentConfig.urn);
      expect(manifest.metadata.name).toBe(agentConfig.name);
      expect(manifest.metadata.version).toBe(agentConfig.version);
      expect(manifest.metadata.description).toBe(agentConfig.description);
      expect(manifest.spec.capabilities).toEqual(agentConfig.capabilities);
      expect(manifest.spec.endpoints).toEqual(agentConfig.endpoints);
    });

    test('should handle minimal agent config', async () => {
      const agentConfig = {
        urn: 'urn:agent:data:etl-agent@2.1.0',
        name: 'etl-agent',
        version: '2.1.0',
        description: 'ETL processing agent'
      };

      const manifest = await generator.createACM(agentConfig);

      expect(manifest).toBeDefined();
      expect(manifest.spec.capabilities).toEqual({});
      expect(manifest.spec.endpoints).toEqual({});
      expect(manifest.spec.auth).toBeNull();
    });

    test('should throw error for missing URN', async () => {
      const agentConfig = {
        name: 'test-agent',
        version: '1.0.0',
        description: 'Test agent'
      };

      await expect(generator.createACM(agentConfig)).rejects.toThrow(ACMError);
      await expect(generator.createACM(agentConfig)).rejects.toThrow('Agent URN is required');
    });

    test('should throw error for missing name', async () => {
      const agentConfig = {
        urn: 'urn:agent:test:agent@1.0.0',
        version: '1.0.0',
        description: 'Test agent'
      };

      await expect(generator.createACM(agentConfig)).rejects.toThrow(ACMError);
      await expect(generator.createACM(agentConfig)).rejects.toThrow('Agent name is required');
    });

    test('should throw error for missing version', async () => {
      const agentConfig = {
        urn: 'urn:agent:test:agent@1.0.0',
        name: 'test-agent',
        description: 'Test agent'
      };

      await expect(generator.createACM(agentConfig)).rejects.toThrow(ACMError);
      await expect(generator.createACM(agentConfig)).rejects.toThrow('Agent version is required');
    });

    test('should throw error for missing description', async () => {
      const agentConfig = {
        urn: 'urn:agent:test:agent@1.0.0',
        name: 'test-agent',
        version: '1.0.0'
      };

      await expect(generator.createACM(agentConfig)).rejects.toThrow(ACMError);
      await expect(generator.createACM(agentConfig)).rejects.toThrow('Agent description is required');
    });

    test('should throw error for null config', async () => {
      await expect(generator.createACM(null)).rejects.toThrow(ACMError);
      await expect(generator.createACM(null)).rejects.toThrow('Agent configuration is required');
    });
  });

  describe('validateACM', () => {
    test('should validate valid ACM manifest', async () => {
      const manifest = {
        apiVersion: 'acm.ossp-agi.io/v1',
        kind: 'AgentCapabilityManifest',
        metadata: {
          urn: 'urn:agent:test:agent@1.0.0',
          name: 'test-agent',
          version: '1.0.0',
          description: 'Test agent'
        },
        spec: {
          capabilities: {
            'test-capability': {
              type: 'service',
              description: 'Test capability'
            }
          }
        }
      };

      const isValid = await generator.validateACM(manifest);
      expect(isValid).toBe(true);
    });

    test('should throw error for missing apiVersion', async () => {
      const manifest = {
        kind: 'AgentCapabilityManifest',
        metadata: {
          urn: 'urn:agent:test:agent@1.0.0',
          name: 'test-agent',
          version: '1.0.0',
          description: 'Test agent'
        },
        spec: {
          capabilities: {}
        }
      };

      await expect(generator.validateACM(manifest)).rejects.toThrow(ACMValidationError);
      await expect(generator.validateACM(manifest)).rejects.toThrow("Required field 'apiVersion' is missing");
    });

    test('should throw error for missing kind', async () => {
      const manifest = {
        apiVersion: 'acm.ossp-agi.io/v1',
        metadata: {
          urn: 'urn:agent:test:agent@1.0.0',
          name: 'test-agent',
          version: '1.0.0',
          description: 'Test agent'
        },
        spec: {
          capabilities: {}
        }
      };

      await expect(generator.validateACM(manifest)).rejects.toThrow(ACMValidationError);
      await expect(generator.validateACM(manifest)).rejects.toThrow("Required field 'kind' is missing");
    });

    test('should throw error for invalid kind', async () => {
      const manifest = {
        apiVersion: 'acm.ossp-agi.io/v1',
        kind: 'InvalidKind',
        metadata: {
          urn: 'urn:agent:test:agent@1.0.0',
          name: 'test-agent',
          version: '1.0.0',
          description: 'Test agent'
        },
        spec: {
          capabilities: {}
        }
      };

      await expect(generator.validateACM(manifest)).rejects.toThrow(ACMSchemaError);
      await expect(generator.validateACM(manifest)).rejects.toThrow("Invalid kind: expected 'AgentCapabilityManifest'");
    });

    test('should throw error for invalid apiVersion', async () => {
      const manifest = {
        apiVersion: 'invalid.api.version/v1',
        kind: 'AgentCapabilityManifest',
        metadata: {
          urn: 'urn:agent:test:agent@1.0.0',
          name: 'test-agent',
          version: '1.0.0',
          description: 'Test agent'
        },
        spec: {
          capabilities: {}
        }
      };

      await expect(generator.validateACM(manifest)).rejects.toThrow(ACMSchemaError);
      await expect(generator.validateACM(manifest)).rejects.toThrow("Invalid apiVersion: expected 'acm.ossp-agi.io/v*'");
    });

    test('should throw error for invalid URN format', async () => {
      const manifest = {
        apiVersion: 'acm.ossp-agi.io/v1',
        kind: 'AgentCapabilityManifest',
        metadata: {
          urn: 'invalid-urn-format',
          name: 'test-agent',
          version: '1.0.0',
          description: 'Test agent'
        },
        spec: {
          capabilities: {}
        }
      };

      await expect(generator.validateACM(manifest)).rejects.toThrow(ACMValidationError);
      await expect(generator.validateACM(manifest)).rejects.toThrow('Invalid URN format');
    });

    test('should throw error for missing capabilities', async () => {
      const manifest = {
        apiVersion: 'acm.ossp-agi.io/v1',
        kind: 'AgentCapabilityManifest',
        metadata: {
          urn: 'urn:agent:test:agent@1.0.0',
          name: 'test-agent',
          version: '1.0.0',
          description: 'Test agent'
        },
        spec: {}
      };

      await expect(generator.validateACM(manifest)).rejects.toThrow(ACMValidationError);
      await expect(generator.validateACM(manifest)).rejects.toThrow('Required spec field "capabilities" is missing');
    });

    test('should throw error for invalid capabilities type', async () => {
      const manifest = {
        apiVersion: 'acm.ossp-agi.io/v1',
        kind: 'AgentCapabilityManifest',
        metadata: {
          urn: 'urn:agent:test:agent@1.0.0',
          name: 'test-agent',
          version: '1.0.0',
          description: 'Test agent'
        },
        spec: {
          capabilities: 'invalid-capabilities-type'
        }
      };

      await expect(generator.validateACM(manifest)).rejects.toThrow(ACMSchemaError);
      await expect(generator.validateACM(manifest)).rejects.toThrow('Capabilities must be an object');
    });

    test('should throw error for capability without type', async () => {
      const manifest = {
        apiVersion: 'acm.ossp-agi.io/v1',
        kind: 'AgentCapabilityManifest',
        metadata: {
          urn: 'urn:agent:test:agent@1.0.0',
          name: 'test-agent',
          version: '1.0.0',
          description: 'Test agent'
        },
        spec: {
          capabilities: {
            'test-capability': {
              description: 'Test capability without type'
            }
          }
        }
      };

      await expect(generator.validateACM(manifest)).rejects.toThrow(ACMValidationError);
      await expect(generator.validateACM(manifest)).rejects.toThrow("Capability 'test-capability' must have a type");
    });

    test('should throw error for capability without description', async () => {
      const manifest = {
        apiVersion: 'acm.ossp-agi.io/v1',
        kind: 'AgentCapabilityManifest',
        metadata: {
          urn: 'urn:agent:test:agent@1.0.0',
          name: 'test-agent',
          version: '1.0.0',
          description: 'Test agent'
        },
        spec: {
          capabilities: {
            'test-capability': {
              type: 'service'
            }
          }
        }
      };

      await expect(generator.validateACM(manifest)).rejects.toThrow(ACMValidationError);
      await expect(generator.validateACM(manifest)).rejects.toThrow("Capability 'test-capability' must have a description");
    });
  });

  describe('Schema Validation Control', () => {
    test('should skip validation when disabled', async () => {
      const generatorNoValidation = new ACMGenerator({
        validateSchema: false,
        enableLogging: false
      });

      const agentConfig = {
        urn: 'urn:agent:test:agent@1.0.0',
        name: 'test-agent',
        version: '1.0.0',
        description: 'Test agent'
      };

      const manifest = await generatorNoValidation.createACM(agentConfig);
      expect(manifest).toBeDefined();
    });

    test('should validate when enabled', async () => {
      const generatorWithValidation = new ACMGenerator({
        validateSchema: true,
        enableLogging: false
      });

      const agentConfig = {
        urn: 'urn:agent:test:agent@1.0.0',
        name: 'test-agent',
        version: '1.0.0',
        description: 'Test agent'
      };

      const manifest = await generatorWithValidation.createACM(agentConfig);
      expect(manifest).toBeDefined();
    });
  });

  describe('Convenience Functions', () => {
    test('createACMGenerator should create generator instance', () => {
      const generator = createACMGenerator();
      expect(generator).toBeInstanceOf(ACMGenerator);
    });

    test('createACM should generate manifest', async () => {
      const agentConfig = {
        urn: 'urn:agent:test:agent@1.0.0',
        name: 'test-agent',
        version: '1.0.0',
        description: 'Test agent'
      };

      const manifest = await createACM(agentConfig);
      expect(manifest).toBeDefined();
      expect(manifest.kind).toBe('AgentCapabilityManifest');
    });

    test('validateACM should validate manifest', async () => {
      const manifest = {
        apiVersion: 'acm.ossp-agi.io/v1',
        kind: 'AgentCapabilityManifest',
        metadata: {
          urn: 'urn:agent:test:agent@1.0.0',
          name: 'test-agent',
          version: '1.0.0',
          description: 'Test agent'
        },
        spec: {
          capabilities: {}
        }
      };

      const isValid = await validateACM(manifest);
      expect(isValid).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should wrap non-ACM errors', async () => {
      const agentConfig = {
        urn: 'urn:agent:test:agent@1.0.0',
        name: 'test-agent',
        version: '1.0.0',
        description: 'Test agent'
      };

      // Mock a non-ACM error
      const originalCreateACM = generator.createACM;
      generator.createACM = jest.fn().mockRejectedValue(new Error('Unexpected error'));

      await expect(generator.createACM(agentConfig)).rejects.toThrow(ACMError);
      await expect(generator.createACM(agentConfig)).rejects.toThrow('Failed to create ACM manifest');

      generator.createACM = originalCreateACM;
    });
  });
});
