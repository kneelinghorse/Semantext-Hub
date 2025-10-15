/**
 * Agent Capability Manifest (ACM) Generator
 * 
 * Generates and validates ACM manifests for agent discovery with:
 * - Standardized capability schema
 * - URN-based agent identification
 * - Capability validation and schema checks
 * - Structured error handling
 * - Comprehensive logging
 */

import { 
  ACMError, 
  ACMValidationError, 
  ACMSchemaError,
  generateRequestId,
  createLogEntry,
  DEFAULT_CONFIG
} from './acm-types.js';

/**
 * ACM Manifest Schema
 * @typedef {Object} ACMManifest
 * @property {string} apiVersion - ACM API version
 * @property {string} kind - Manifest kind
 * @property {Object} metadata - Agent metadata
 * @property {Object} spec - Agent capabilities specification
 */

/**
 * Agent Configuration
 * @typedef {Object} AgentConfig
 * @property {string} urn - Agent URN
 * @property {string} name - Agent name
 * @property {string} version - Agent version
 * @property {string} description - Agent description
 * @property {Object} capabilities - Agent capabilities
 * @property {Object} endpoints - Agent endpoints
 * @property {Object} [auth] - Authentication configuration
 */

/**
 * ACM Generator
 */
export class ACMGenerator {
  constructor(options = {}) {
    this.enableLogging = options.enableLogging !== false;
    this.schemaVersion = options.schemaVersion || 'v1';
    this.validateSchema = options.validateSchema !== false;
  }

  /**
   * Create ACM manifest from agent configuration
   * @param {AgentConfig} agentConfig - Agent configuration
   * @returns {Promise<ACMManifest>} ACM manifest
   */
  async createACM(agentConfig) {
    const reqId = generateRequestId();
    
    try {
      if (this.enableLogging) {
        const logEntry = createLogEntry(reqId, 'acm_generation_start', {
          agentUrn: agentConfig.urn
        });
        console.debug('[ACM Generator]', logEntry);
      }

      // Validate input configuration
      this._validateAgentConfig(agentConfig);

      // Generate ACM manifest
      const manifest = this._generateManifest(agentConfig);

      // Validate generated manifest if enabled
      if (this.validateSchema) {
        await this.validateACM(manifest);
      }

      if (this.enableLogging) {
        const logEntry = createLogEntry(reqId, 'acm_generation_success', {
          agentUrn: agentConfig.urn,
          capabilitiesCount: Object.keys(agentConfig.capabilities || {}).length
        });
        console.debug('[ACM Generator]', logEntry);
      }

      return manifest;
    } catch (error) {
      if (this.enableLogging) {
        const logEntry = createLogEntry(reqId, 'acm_generation_failed', {
          agentUrn: agentConfig.urn,
          error: error.message
        });
        console.error('[ACM Generator]', logEntry);
      }

      if (error instanceof ACMError) {
        throw error;
      }

      throw new ACMError(
        `Failed to create ACM manifest: ${error.message}`,
        error
      );
    }
  }

  /**
   * Validate ACM manifest against schema
   * @param {ACMManifest} manifest - ACM manifest to validate
   * @returns {Promise<boolean>} True if valid
   */
  async validateACM(manifest) {
    const reqId = generateRequestId();
    
    try {
      if (this.enableLogging) {
        const logEntry = createLogEntry(reqId, 'acm_validation_start', {
          manifestKind: manifest.kind
        });
        console.debug('[ACM Generator]', logEntry);
      }

      // Validate required fields
      this._validateRequiredFields(manifest);

      // Validate schema structure
      this._validateSchemaStructure(manifest);

      // Validate URN format
      this._validateUrnFormat(manifest.metadata.urn);

      // Validate capabilities
      this._validateCapabilities(manifest.spec.capabilities);

      if (this.enableLogging) {
        const logEntry = createLogEntry(reqId, 'acm_validation_success', {
          manifestKind: manifest.kind
        });
        console.debug('[ACM Generator]', logEntry);
      }

      return true;
    } catch (error) {
      if (this.enableLogging) {
        const logEntry = createLogEntry(reqId, 'acm_validation_failed', {
          manifestKind: manifest.kind,
          error: error.message
        });
        console.error('[ACM Generator]', logEntry);
      }

      if (error instanceof ACMValidationError) {
        throw error;
      }

      throw new ACMValidationError(
        `ACM manifest validation failed: ${error.message}`,
        error
      );
    }
  }

  /**
   * Generate ACM manifest from agent config
   * @private
   * @param {AgentConfig} config - Agent configuration
   * @returns {ACMManifest} Generated manifest
   */
  _generateManifest(config) {
    return {
      apiVersion: `acm.ossp-agi.io/${this.schemaVersion}`,
      kind: 'AgentCapabilityManifest',
      metadata: {
        urn: config.urn,
        name: config.name,
        version: config.version,
        description: config.description,
        createdAt: new Date().toISOString(),
        generator: 'OSSP-AGI-ACM-Generator',
        generatorVersion: '1.0.0'
      },
      spec: {
        capabilities: config.capabilities || {},
        endpoints: config.endpoints || {},
        auth: config.auth || null,
        health: {
          status: 'healthy',
          lastChecked: new Date().toISOString()
        }
      }
    };
  }

  /**
   * Validate agent configuration
   * @private
   * @param {AgentConfig} config - Agent configuration
   */
  _validateAgentConfig(config) {
    if (!config) {
      throw new ACMError('Agent configuration is required');
    }

    if (!config.urn) {
      throw new ACMError('Agent URN is required');
    }

    if (!config.name) {
      throw new ACMError('Agent name is required');
    }

    if (!config.version) {
      throw new ACMError('Agent version is required');
    }

    if (!config.description) {
      throw new ACMError('Agent description is required');
    }
  }

  /**
   * Validate required fields in manifest
   * @private
   * @param {ACMManifest} manifest - ACM manifest
   */
  _validateRequiredFields(manifest) {
    const requiredFields = ['apiVersion', 'kind', 'metadata', 'spec'];
    
    for (const field of requiredFields) {
      if (!manifest[field]) {
        throw new ACMValidationError(`Required field '${field}' is missing`);
      }
    }

    const requiredMetadataFields = ['urn', 'name', 'version', 'description'];
    for (const field of requiredMetadataFields) {
      if (!manifest.metadata[field]) {
        throw new ACMValidationError(`Required metadata field '${field}' is missing`);
      }
    }

    if (!manifest.spec.capabilities) {
      throw new ACMValidationError('Required spec field "capabilities" is missing');
    }
  }

  /**
   * Validate schema structure
   * @private
   * @param {ACMManifest} manifest - ACM manifest
   */
  _validateSchemaStructure(manifest) {
    if (manifest.kind !== 'AgentCapabilityManifest') {
      throw new ACMSchemaError(`Invalid kind: expected 'AgentCapabilityManifest', got '${manifest.kind}'`);
    }

    if (!manifest.apiVersion.startsWith('acm.ossp-agi.io/')) {
      throw new ACMSchemaError(`Invalid apiVersion: expected 'acm.ossp-agi.io/v*', got '${manifest.apiVersion}'`);
    }

    if (typeof manifest.spec.capabilities !== 'object') {
      throw new ACMSchemaError('Capabilities must be an object');
    }

    if (manifest.spec.endpoints && typeof manifest.spec.endpoints !== 'object') {
      throw new ACMSchemaError('Endpoints must be an object');
    }
  }

  /**
   * Validate URN format
   * @private
   * @param {string} urn - Agent URN
   */
  _validateUrnFormat(urn) {
    // Expected format: urn:agent:domain:name[@version]
    const urnPattern = /^urn:agent:([^:]+):([^@]+)(?:@(.+))?$/;
    if (!urnPattern.test(urn)) {
      throw new ACMValidationError(`Invalid URN format: ${urn}. Expected format: urn:agent:domain:name[@version]`);
    }
  }

  /**
   * Validate capabilities structure
   * @private
   * @param {Object} capabilities - Agent capabilities
   */
  _validateCapabilities(capabilities) {
    if (!capabilities || typeof capabilities !== 'object') {
      throw new ACMValidationError('Capabilities must be an object');
    }

    // Validate each capability
    for (const [capabilityName, capability] of Object.entries(capabilities)) {
      if (typeof capability !== 'object' || capability === null) {
        throw new ACMValidationError(`Capability '${capabilityName}' must be an object`);
      }

      if (!capability.type) {
        throw new ACMValidationError(`Capability '${capabilityName}' must have a type`);
      }

      if (!capability.description) {
        throw new ACMValidationError(`Capability '${capabilityName}' must have a description`);
      }
    }
  }
}

/**
 * Create ACM generator with default configuration
 * @param {Object} options - Generator options
 * @returns {ACMGenerator} Generator instance
 */
export function createACMGenerator(options = {}) {
  return new ACMGenerator(options);
}

/**
 * Convenience function for creating ACM manifest
 * @param {AgentConfig} agentConfig - Agent configuration
 * @param {Object} [options] - Generator options
 * @returns {Promise<ACMManifest>} ACM manifest
 */
export async function createACM(agentConfig, options = {}) {
  const generator = createACMGenerator(options);
  return generator.createACM(agentConfig);
}

/**
 * Convenience function for validating ACM manifest
 * @param {ACMManifest} manifest - ACM manifest to validate
 * @param {Object} [options] - Generator options
 * @returns {Promise<boolean>} True if valid
 */
export async function validateACM(manifest, options = {}) {
  const generator = createACMGenerator(options);
  return generator.validateACM(manifest);
}
