/**
 * IO Utilities
 * 
 * Helper functions for reading and parsing YAML/JSON files
 */

import { readFile } from 'fs/promises';
import path from 'path';

/**
 * Parse YAML or JSON file based on extension
 * @param {string} filePath - Path to file
 * @returns {Promise<Object>} Parsed content
 */
export async function parseYamlOrJson(filePath) {
  const content = await readFile(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.json') {
    return JSON.parse(content);
  } else if (ext === '.yaml' || ext === '.yml') {
    // For now, treat YAML as JSON (simple implementation)
    // In production, you'd use a proper YAML parser like js-yaml
    try {
      // Try parsing as JSON first (some YAML files are valid JSON)
      return JSON.parse(content);
    } catch (error) {
      // Simple YAML to JSON conversion for basic cases
      // This is a very basic implementation and won't handle complex YAML
      const lines = content.split('\n');
      const result = {};
      let currentObj = result;
      let currentKey = null;
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex > 0) {
          const key = trimmed.substring(0, colonIndex).trim();
          const value = trimmed.substring(colonIndex + 1).trim();
          
          if (value) {
            // Simple key-value pair
            currentObj[key] = value.replace(/^["']|["']$/g, '');
          } else {
            // Object or array
            currentObj[key] = {};
            currentKey = key;
          }
        }
      }
      
      return result;
    }
  } else {
    throw new Error(`Unsupported file format: ${ext}`);
  }
}
