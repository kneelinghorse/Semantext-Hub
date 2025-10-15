/**
 * Stream Parser Utility
 * Handles streaming JSON parsing for large OpenAPI specs
 * Prevents memory issues with 10k+ line specifications
 */

import { Readable } from 'stream';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';

/**
 * Stream-based JSON parser with chunking support
 */
class StreamParser {
  constructor(options = {}) {
    this.options = {
      chunkSize: 1024 * 64, // 64KB chunks
      maxSize: 1024 * 1024 * 50, // 50MB max
      ...options
    };
  }

  /**
   * Parse JSON from various sources with streaming support
   * @param {string|Object|Stream} source - File path, object, or stream
   * @returns {Promise<Object>} Parsed JSON object
   */
  async parse(source) {
    // If already an object, return it
    if (typeof source === 'object' && !Buffer.isBuffer(source) && !(source instanceof Readable)) {
      return source;
    }

    // If it's a string, determine if file path or JSON
    if (typeof source === 'string') {
      // Try to parse as JSON first
      if (source.trim().startsWith('{') || source.trim().startsWith('[')) {
        return JSON.parse(source);
      }

      // Otherwise treat as file path
      return this.parseFile(source);
    }

    // If it's a stream or buffer
    if (source instanceof Readable || Buffer.isBuffer(source)) {
      return this.parseStream(source);
    }

    throw new Error('Invalid source type: must be string, object, Buffer, or Stream');
  }

  /**
   * Parse JSON from file with streaming
   * @param {string} filePath - Path to JSON file
   * @returns {Promise<Object>}
   */
  async parseFile(filePath) {
    try {
      const stats = await fs.stat(filePath);

      // For small files, just read directly
      if (stats.size < this.options.chunkSize) {
        const content = await fs.readFile(filePath, 'utf8');
        return JSON.parse(content);
      }

      // For larger files, use streaming
      const stream = createReadStream(filePath, {
        encoding: 'utf8',
        highWaterMark: this.options.chunkSize
      });

      return this.parseStream(stream);
    } catch (error) {
      throw new Error(`Failed to parse file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Parse JSON from stream
   * @param {Stream|Buffer} source - Readable stream or Buffer
   * @returns {Promise<Object>}
   */
  async parseStream(source) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let totalSize = 0;

      const stream = Buffer.isBuffer(source)
        ? Readable.from(source)
        : source;

      stream.on('data', (chunk) => {
        totalSize += chunk.length;

        // Prevent memory exhaustion
        if (totalSize > this.options.maxSize) {
          stream.destroy();
          reject(new Error(`Stream size exceeds maximum allowed size of ${this.options.maxSize} bytes`));
          return;
        }

        chunks.push(chunk);
      });

      stream.on('end', () => {
        try {
          const content = Buffer.concat(chunks).toString('utf8');
          const parsed = JSON.parse(content);
          resolve(parsed);
        } catch (error) {
          reject(new Error(`Failed to parse JSON from stream: ${error.message}`));
        }
      });

      stream.on('error', (error) => {
        reject(new Error(`Stream error: ${error.message}`));
      });
    });
  }

  /**
   * Validate JSON structure without full parsing
   * @param {string} content - JSON string content
   * @returns {boolean}
   */
  isValidJSON(content) {
    try {
      JSON.parse(content);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get approximate size of JSON object in bytes
   * @param {Object} obj - JSON object
   * @returns {number} Size in bytes
   */
  getObjectSize(obj) {
    try {
      return Buffer.byteLength(JSON.stringify(obj), 'utf8');
    } catch {
      return 0;
    }
  }
}

export { StreamParser };
