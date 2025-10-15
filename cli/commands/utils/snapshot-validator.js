/**
 * Snapshot Validator Utility - B11.4
 * 
 * Validates catalog snapshots against the schema.
 * Supports offline validation mode.
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

/**
 * Validate snapshot against schema
 */
export async function validateSnapshotSchema(snapshot) {
  const errors = [];
  const warnings = [];

  try {
    // Load schema
    const schemaPath = path.resolve(process.cwd(), 'schemas', 'catalog-snapshot.schema.json');
    const schemaContent = await fs.readFile(schemaPath, 'utf8');
    const schema = JSON.parse(schemaContent);

    // Validate required fields
    const requiredFields = ['version', 'format', 'created', 'workspace', 'artifacts', 'relationships'];
    for (const field of requiredFields) {
      if (!snapshot[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate version
    if (snapshot.version && snapshot.version !== '1.0.0') {
      errors.push(`Unsupported version: ${snapshot.version}`);
    }

    // Validate format
    if (snapshot.format && snapshot.format !== 'catalog-snapshot-v1') {
      errors.push(`Unsupported format: ${snapshot.format}`);
    }

    // Validate created timestamp
    if (snapshot.created) {
      const createdDate = new Date(snapshot.created);
      if (isNaN(createdDate.getTime())) {
        errors.push('Invalid created timestamp format');
      }
    }

    // Validate workspace
    if (snapshot.workspace) {
      if (!snapshot.workspace.name) {
        errors.push('Workspace name is required');
      }
      if (!snapshot.workspace.path) {
        errors.push('Workspace path is required');
      }
    }

    // Validate artifacts
    if (snapshot.artifacts) {
      const artifactCount = Object.keys(snapshot.artifacts).length;
      if (artifactCount === 0) {
        warnings.push('No artifacts found in snapshot');
      }

      // Validate each artifact
      for (const [urn, artifact] of Object.entries(snapshot.artifacts)) {
        const artifactErrors = validateArtifact(urn, artifact);
        errors.push(...artifactErrors);
      }
    }

    // Validate relationships
    if (snapshot.relationships) {
      const relationshipErrors = validateRelationships(snapshot.relationships, snapshot.artifacts);
      errors.push(...relationshipErrors);
    }

    // Validate statistics
    if (snapshot.statistics) {
      const statsErrors = validateStatistics(snapshot.statistics, snapshot.artifacts);
      errors.push(...statsErrors);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };

  } catch (error) {
    return {
      valid: false,
      errors: [`Schema validation failed: ${error.message}`],
      warnings: []
    };
  }
}

/**
 * Validate individual artifact
 */
function validateArtifact(urn, artifact) {
  const errors = [];

  // Validate URN format
  if (!urn.startsWith('urn:')) {
    errors.push(`Invalid URN format: ${urn}`);
  }

  // Validate required artifact fields
  const requiredFields = ['urn', 'name', 'version', 'type', 'manifest'];
  for (const field of requiredFields) {
    if (!artifact[field]) {
      errors.push(`Artifact ${urn} missing required field: ${field}`);
    }
  }

  // Validate URN matches artifact URN
  if (artifact.urn && artifact.urn !== urn) {
    errors.push(`Artifact URN mismatch: ${urn} vs ${artifact.urn}`);
  }

  // Validate protocol type
  const validTypes = [
    'api-protocol',
    'data-protocol',
    'event-protocol',
    'workflow-protocol',
    'ui-protocol',
    'semantic-protocol'
  ];
  if (artifact.type && !validTypes.includes(artifact.type)) {
    errors.push(`Invalid protocol type: ${artifact.type}`);
  }

  // Validate version format (allow v prefix)
  if (artifact.version && !/^v?\d+\.\d+\.\d+/.test(artifact.version)) {
    errors.push(`Invalid version format: ${artifact.version}`);
  }

  // Validate dependencies
  if (artifact.dependencies) {
    if (!Array.isArray(artifact.dependencies)) {
      errors.push(`Dependencies must be an array for ${urn}`);
    } else {
      for (const dep of artifact.dependencies) {
        if (typeof dep !== 'string' || !dep.startsWith('urn:')) {
          errors.push(`Invalid dependency URN: ${dep} for ${urn}`);
        }
      }
    }
  }

  // Validate metadata
  if (artifact.metadata) {
    const metadataErrors = validateMetadata(artifact.metadata, urn);
    errors.push(...metadataErrors);
  }

  return errors;
}

/**
 * Validate artifact metadata
 */
function validateMetadata(metadata, urn) {
  const errors = [];

  // Validate governance classification
  if (metadata.governance) {
    const validClassifications = ['public', 'internal', 'confidential', 'restricted'];
    if (metadata.governance.classification && !validClassifications.includes(metadata.governance.classification)) {
      errors.push(`Invalid classification: ${metadata.governance.classification} for ${urn}`);
    }

    // Validate PII flag
    if (metadata.governance.pii !== undefined && typeof metadata.governance.pii !== 'boolean') {
      errors.push(`PII flag must be boolean for ${urn}`);
    }
  }

  // Validate tags
  if (metadata.tags) {
    if (!Array.isArray(metadata.tags)) {
      errors.push(`Tags must be an array for ${urn}`);
    } else {
      for (const tag of metadata.tags) {
        if (typeof tag !== 'string') {
          errors.push(`Tag must be a string for ${urn}`);
        }
      }
    }
  }

  return errors;
}

/**
 * Validate relationships
 */
function validateRelationships(relationships, artifacts) {
  const errors = [];

  if (!relationships.dependencies && !relationships.consumers && !relationships.providers) {
    errors.push('Relationships object is empty');
    return errors;
  }

  // Validate dependencies
  if (relationships.dependencies) {
    for (const [urn, deps] of Object.entries(relationships.dependencies)) {
      if (!artifacts[urn]) {
        errors.push(`Dependency relationship references non-existent artifact: ${urn}`);
      }
      if (!Array.isArray(deps)) {
        errors.push(`Dependencies must be an array for ${urn}`);
      } else {
        for (const dep of deps) {
          if (!artifacts[dep]) {
            errors.push(`Dependency references non-existent artifact: ${dep}`);
          }
        }
      }
    }
  }

  // Validate consumers
  if (relationships.consumers) {
    for (const [urn, consumers] of Object.entries(relationships.consumers)) {
      if (!artifacts[urn]) {
        errors.push(`Consumer relationship references non-existent artifact: ${urn}`);
      }
      if (!Array.isArray(consumers)) {
        errors.push(`Consumers must be an array for ${urn}`);
      } else {
        for (const consumer of consumers) {
          if (!artifacts[consumer]) {
            errors.push(`Consumer references non-existent artifact: ${consumer}`);
          }
        }
      }
    }
  }

  // Validate providers
  if (relationships.providers) {
    for (const [urn, providers] of Object.entries(relationships.providers)) {
      if (!artifacts[urn]) {
        errors.push(`Provider relationship references non-existent artifact: ${urn}`);
      }
      if (!Array.isArray(providers)) {
        errors.push(`Providers must be an array for ${urn}`);
      } else {
        for (const provider of providers) {
          if (!artifacts[provider]) {
            errors.push(`Provider references non-existent artifact: ${provider}`);
          }
        }
      }
    }
  }

  return errors;
}

/**
 * Validate statistics
 */
function validateStatistics(statistics, artifacts) {
  const errors = [];

  // Validate total artifacts count
  const actualCount = Object.keys(artifacts).length;
  if (statistics.totalArtifacts !== actualCount) {
    errors.push(`Total artifacts count mismatch: ${statistics.totalArtifacts} vs ${actualCount}`);
  }

  // Validate byType counts
  if (statistics.byType) {
    const typeCounts = {};
    for (const artifact of Object.values(artifacts)) {
      typeCounts[artifact.type] = (typeCounts[artifact.type] || 0) + 1;
    }

    for (const [type, count] of Object.entries(statistics.byType)) {
      if (typeCounts[type] !== count) {
        errors.push(`Type count mismatch for ${type}: ${count} vs ${typeCounts[type]}`);
      }
    }
  }

  // Validate byClassification counts
  if (statistics.byClassification) {
    const classificationCounts = {};
    for (const artifact of Object.values(artifacts)) {
      const classification = artifact.metadata?.governance?.classification || 'public';
      classificationCounts[classification] = (classificationCounts[classification] || 0) + 1;
    }

    for (const [classification, count] of Object.entries(statistics.byClassification)) {
      if (classificationCounts[classification] !== count) {
        errors.push(`Classification count mismatch for ${classification}: ${count} vs ${classificationCounts[classification]}`);
      }
    }
  }

  return errors;
}

/**
 * Validate snapshot file
 */
export async function validateSnapshotFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const snapshot = JSON.parse(content);
    
    return await validateSnapshotSchema(snapshot);
  } catch (error) {
    return {
      valid: false,
      errors: [`Failed to read snapshot file: ${error.message}`],
      warnings: []
    };
  }
}

/**
 * Format validation results for display
 */
export function formatValidationResults(result) {
  let output = '';

  if (result.valid) {
    output += chalk.green('✅ Snapshot validation passed\n');
  } else {
    output += chalk.red('❌ Snapshot validation failed\n');
  }

  if (result.errors.length > 0) {
    output += chalk.red('\nErrors:\n');
    result.errors.forEach(error => {
      output += chalk.gray(`  • ${error}\n`);
    });
  }

  if (result.warnings.length > 0) {
    output += chalk.yellow('\nWarnings:\n');
    result.warnings.forEach(warning => {
      output += chalk.gray(`  • ${warning}\n`);
    });
  }

  return output;
}
