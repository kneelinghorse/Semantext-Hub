#!/usr/bin/env node

/**
 * Versioned Manifest Loader
 * 
 * Utility for loading and validating versioned protocol manifests
 * across different protocol types with proper version handling.
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Versioned Manifest Loader Class
 */
class VersionedManifestLoader {
  constructor() {
    this.supportedVersions = ['v1.0', 'v1.1', 'v2.0'];
    this.protocolTypes = ['api', 'data', 'event', 'agent', 'workflow', 'ui'];
  }

  /**
   * Load and validate a versioned manifest
   */
  async loadManifest(filePath, options = {}) {
    const {
      validateVersion = true,
      strictMode = false,
      defaultVersion = 'v1.0'
    } = options;

    try {
      // Read file content
      const content = await fs.readFile(filePath, 'utf8');
      let manifest;

      // Parse JSON or YAML
      if (filePath.endsWith('.json')) {
        manifest = JSON.parse(content);
      } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        // For now, assume JSON - YAML parsing would require yaml library
        manifest = JSON.parse(content);
      } else {
        throw new Error(`Unsupported file format: ${path.extname(filePath)}`);
      }

      // Ensure version field exists
      if (!manifest.version) {
        manifest.version = defaultVersion;
      }

      // Validate version format
      if (validateVersion) {
        const validation = this.validateVersion(manifest.version);
        if (!validation.valid) {
          throw new Error(`Invalid version format: ${validation.error}`);
        }
      }

      // Detect protocol type
      const protocolType = this.detectProtocolType(manifest);
      manifest._protocolType = protocolType;

      // Validate manifest structure based on protocol type
      const structureValidation = this.validateManifestStructure(manifest, protocolType);
      if (strictMode && structureValidation.errors.length > 0) {
        throw new Error(`Manifest structure validation failed: ${structureValidation.errors.join(', ')}`);
      }

      return {
        manifest,
        metadata: {
          filePath,
          protocolType,
          version: manifest.version,
          validation: structureValidation,
          loadedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      throw new Error(`Failed to load manifest ${filePath}: ${error.message}`);
    }
  }

  /**
   * Validate version format
   */
  validateVersion(version) {
    if (!version || typeof version !== 'string') {
      return { valid: false, error: 'Version must be a string' };
    }

    // Check format: vX.Y or vX.Y.Z
    const versionPattern = /^v(\d+)\.(\d+)(\.(\d+))?$/;
    if (!versionPattern.test(version)) {
      return { valid: false, error: 'Version must follow vX.Y or vX.Y.Z format' };
    }

    // Check if version is supported
    if (!this.supportedVersions.includes(version)) {
      return { valid: false, error: `Version ${version} not supported. Supported: ${this.supportedVersions.join(', ')}` };
    }

    return { valid: true };
  }

  /**
   * Detect protocol type from manifest structure
   */
  detectProtocolType(manifest) {
    if (manifest.service) return 'api';
    if (manifest.dataset) return 'data';
    if (manifest.event) return 'event';
    if (manifest.agent) return 'agent';
    if (manifest.workflow) return 'workflow';
    if (manifest.ui) return 'ui';
    
    // Fallback to checking for protocol-specific fields
    if (manifest.interface && manifest.interface.endpoints) return 'api';
    if (manifest.schema && manifest.schema.fields) return 'data';
    if (manifest.semantics && manifest.delivery) return 'event';
    
    return 'unknown';
  }

  /**
   * Validate manifest structure based on protocol type
   */
  validateManifestStructure(manifest, protocolType) {
    const errors = [];
    const warnings = [];

    // Common validation
    if (!manifest.version) {
      warnings.push('Version field missing - using default');
    }

    // Protocol-specific validation
    switch (protocolType) {
      case 'api':
        if (!manifest.service) {
          errors.push('API manifest must have service section');
        }
        if (!manifest.interface) {
          errors.push('API manifest must have interface section');
        }
        if (manifest.interface && !manifest.interface.endpoints) {
          warnings.push('API manifest should have interface.endpoints');
        }
        break;

      case 'data':
        if (!manifest.dataset) {
          errors.push('Data manifest must have dataset section');
        }
        if (!manifest.schema) {
          warnings.push('Data manifest should have schema section');
        }
        break;

      case 'event':
        if (!manifest.event) {
          errors.push('Event manifest must have event section');
        }
        if (!manifest.schema) {
          warnings.push('Event manifest should have schema section');
        }
        break;

      case 'agent':
        if (!manifest.agent) {
          errors.push('Agent manifest must have agent section');
        }
        if (!manifest.capabilities) {
          warnings.push('Agent manifest should have capabilities section');
        }
        break;

      case 'workflow':
        if (!manifest.workflow) {
          errors.push('Workflow manifest must have workflow section');
        }
        break;

      case 'ui':
        if (!manifest.ui) {
          errors.push('UI manifest must have ui section');
        }
        break;

      default:
        warnings.push(`Unknown protocol type: ${protocolType}`);
    }

    return { errors, warnings };
  }

  /**
   * Load multiple manifests and validate cross-references
   */
  async loadManifestSet(manifestPaths, options = {}) {
    const results = [];
    const crossReferences = new Map();

    // Load all manifests
    for (const manifestPath of manifestPaths) {
      try {
        const result = await this.loadManifest(manifestPath, options);
        results.push(result);
        
        // Extract URN references for cross-validation
        const urnRefs = this.extractURNReferences(result.manifest);
        crossReferences.set(manifestPath, urnRefs);
      } catch (error) {
        results.push({
          error: error.message,
          filePath: manifestPath
        });
      }
    }

    // Validate cross-references
    const crossValidation = this.validateCrossReferences(crossReferences);

    return {
      manifests: results,
      crossValidation,
      summary: {
        total: manifestPaths.length,
        loaded: results.filter(r => !r.error).length,
        errors: results.filter(r => r.error).length,
        crossReferenceIssues: crossValidation.issues.length
      }
    };
  }

  /**
   * Extract URN references from manifest
   */
  extractURNReferences(manifest) {
    const references = [];
    const urnPattern = /urn:proto:[^@\s]+@[^@\s]+/g;

    const searchForURNs = (obj, path = '') => {
      if (typeof obj === 'string') {
        const matches = obj.match(urnPattern);
        if (matches) {
          references.push(...matches.map(urn => ({ urn, path })));
        }
      } else if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          searchForURNs(item, `${path}[${index}]`);
        });
      } else if (obj && typeof obj === 'object') {
        Object.entries(obj).forEach(([key, value]) => {
          searchForURNs(value, path ? `${path}.${key}` : key);
        });
      }
    };

    searchForURNs(manifest);
    return references;
  }

  /**
   * Validate cross-references between manifests
   */
  validateCrossReferences(crossReferences) {
    const issues = [];
    const allURNs = new Set();
    const referencedURNs = new Set();

    // Collect all URNs and referenced URNs
    for (const [filePath, refs] of crossReferences) {
      refs.forEach(ref => {
        referencedURNs.add(ref.urn);
      });
    }

    // Check for unresolved references
    for (const [filePath, refs] of crossReferences) {
      refs.forEach(ref => {
        if (!allURNs.has(ref.urn)) {
          issues.push({
            type: 'unresolved_reference',
            file: filePath,
            urn: ref.urn,
            path: ref.path,
            severity: 'warning'
          });
        }
      });
    }

    return { issues };
  }

  /**
   * Get version compatibility information
   */
  getVersionCompatibility(fromVersion, toVersion) {
    const versionMap = {
      'v1.0': 1,
      'v1.1': 2,
      'v2.0': 3
    };

    const fromLevel = versionMap[fromVersion] || 0;
    const toLevel = versionMap[toVersion] || 0;

    if (fromLevel === 0 || toLevel === 0) {
      return {
        compatible: false,
        reason: 'Unknown version',
        migrationRequired: true
      };
    }

    if (fromLevel === toLevel) {
      return {
        compatible: true,
        reason: 'Same version',
        migrationRequired: false
      };
    }

    if (toLevel > fromLevel) {
      return {
        compatible: true,
        reason: 'Forward compatible',
        migrationRequired: true,
        breakingChanges: toLevel - fromLevel > 1
      };
    }

    return {
      compatible: false,
      reason: 'Backward incompatible',
      migrationRequired: true,
      breakingChanges: true
    };
  }
}

export {
  VersionedManifestLoader
};
