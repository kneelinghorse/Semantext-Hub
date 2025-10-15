/**
 * Manifest Override System
 *
 * Supports manual corrections and overrides to manifests.
 * Tracks what was changed, when, and why for audit trails.
 */

import fs from 'fs-extra';
import path from 'path';

/**
 * Apply overrides to a manifest
 *
 * @param {Object} manifest - The base manifest
 * @param {Array<Object>} overrides - List of override operations
 * @returns {Object} Manifest with overrides applied
 */
function applyOverrides(manifest, overrides) {
  if (!overrides || overrides.length === 0) {
    return manifest;
  }

  // Deep clone to avoid mutations
  let result = JSON.parse(JSON.stringify(manifest));

  // Track override history
  if (!result.metadata.overrides) {
    result.metadata.overrides = [];
  }

  // Apply each override in order
  for (const override of overrides) {
    result = applyOverride(result, override);
  }

  return result;
}

/**
 * Apply a single override operation
 *
 * @param {Object} manifest - The manifest
 * @param {Object} override - Override operation
 * @param {string} override.operation - Type of operation: 'set', 'delete', 'merge'
 * @param {string} override.path - JSON path to target field (e.g., 'catalog.type')
 * @param {*} override.value - New value (for set/merge operations)
 * @param {string} override.reason - Reason for override
 * @returns {Object} Updated manifest
 */
function applyOverride(manifest, override) {
  const { operation, path: fieldPath, value, reason } = override;

  if (!operation || !fieldPath) {
    throw new Error('Override must specify operation and path');
  }

  // Record the override before applying
  const timestamp = new Date().toISOString();
  const overrideRecord = {
    operation,
    path: fieldPath,
    timestamp,
    reason: reason || 'No reason provided'
  };

  // Ensure metadata.overrides exists
  if (!manifest.metadata) {
    manifest.metadata = {};
  }
  if (!manifest.metadata.overrides) {
    manifest.metadata.overrides = [];
  }

  // Get current value before override
  const currentValue = getFieldByPath(manifest, fieldPath);
  if (currentValue !== undefined) {
    overrideRecord.previous_value = currentValue;
  }

  // Apply the operation
  switch (operation) {
    case 'set':
      setFieldByPath(manifest, fieldPath, value);
      overrideRecord.new_value = value;
      break;

    case 'delete':
      deleteFieldByPath(manifest, fieldPath);
      break;

    case 'merge':
      if (typeof value !== 'object' || typeof currentValue !== 'object') {
        throw new Error('Merge operation requires object values');
      }
      const merged = { ...currentValue, ...value };
      setFieldByPath(manifest, fieldPath, merged);
      overrideRecord.merged_fields = Object.keys(value);
      break;

    default:
      throw new Error(`Unknown override operation: ${operation}`);
  }

  // Add to override history
  manifest.metadata.overrides.push(overrideRecord);

  return manifest;
}

/**
 * Create an override file for a manifest
 *
 * @param {string} manifestPath - Path to the manifest file
 * @param {Array<Object>} overrides - Override operations to save
 * @returns {Promise<string>} Path to override file
 */
async function saveOverrides(manifestPath, overrides) {
  const overridePath = getOverridePath(manifestPath);

  const overrideData = {
    manifest: manifestPath,
    created_at: new Date().toISOString(),
    overrides
  };

  await fs.writeJson(overridePath, overrideData, { spaces: 2 });
  return overridePath;
}

/**
 * Load overrides for a manifest
 *
 * @param {string} manifestPath - Path to the manifest file
 * @returns {Promise<Array<Object>|null>} Override operations or null if no override file
 */
async function loadOverrides(manifestPath) {
  const overridePath = getOverridePath(manifestPath);

  if (!await fs.pathExists(overridePath)) {
    return null;
  }

  const overrideData = await fs.readJson(overridePath);
  return overrideData.overrides || [];
}

/**
 * Get path for override file
 * Converts: artifacts/manifest.json → artifacts/manifest.overrides.json
 */
function getOverridePath(manifestPath) {
  const parsed = path.parse(manifestPath);
  return path.join(parsed.dir, `${parsed.name}.overrides${parsed.ext}`);
}

/**
 * Get field value by dot-notation path
 * Example: 'catalog.type' → manifest.catalog.type
 */
function getFieldByPath(obj, fieldPath) {
  const parts = fieldPath.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Set field value by dot-notation path
 * Example: 'catalog.type', 'openapi' → manifest.catalog.type = 'openapi'
 */
function setFieldByPath(obj, fieldPath, value) {
  const parts = fieldPath.split('.');
  const lastPart = parts.pop();
  let current = obj;

  // Navigate to parent object
  for (const part of parts) {
    if (current[part] === undefined || current[part] === null) {
      current[part] = {};
    }
    current = current[part];
  }

  // Set the value
  current[lastPart] = value;
}

/**
 * Delete field by dot-notation path
 */
function deleteFieldByPath(obj, fieldPath) {
  const parts = fieldPath.split('.');
  const lastPart = parts.pop();
  let current = obj;

  // Navigate to parent object
  for (const part of parts) {
    if (current === undefined || current === null) {
      return; // Field doesn't exist, nothing to delete
    }
    current = current[part];
  }

  // Delete the field
  delete current[lastPart];
}

/**
 * Create a set override operation
 */
function createSetOverride(path, value, reason) {
  return {
    operation: 'set',
    path,
    value,
    reason
  };
}

/**
 * Create a delete override operation
 */
function createDeleteOverride(path, reason) {
  return {
    operation: 'delete',
    path,
    reason
  };
}

/**
 * Create a merge override operation
 */
function createMergeOverride(path, value, reason) {
  return {
    operation: 'merge',
    path,
    value,
    reason
  };
}

/**
 * Get override history for a manifest
 */
function getOverrideHistory(manifest) {
  return manifest.metadata?.overrides || [];
}

/**
 * Check if manifest has overrides
 */
function hasOverrides(manifest) {
  const overrides = manifest?.metadata?.overrides;
  return Boolean(overrides && overrides.length > 0);
}

export {
  applyOverrides,
  applyOverride,
  saveOverrides,
  loadOverrides,
  getOverridePath,
  createSetOverride,
  createDeleteOverride,
  createMergeOverride,
  getOverrideHistory,
  hasOverrides
};
