/**
 * Atomic File Writer
 *
 * Implements the "temporary-file-and-rename" pattern for atomic file writes.
 * Ensures that file writes are atomic (all-or-nothing) to prevent corruption
 * from crashes or interruptions during write operations.
 *
 * Pattern:
 * 1. Write to temporary file (filename.tmp-{random})
 * 2. fsync to flush OS buffers to disk
 * 3. Atomic rename to target filename
 *
 * If the process crashes before rename, the original file is untouched.
 *
 * @module core/registration/atomic-writer
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Atomically write data to a file using temp-file-and-rename pattern
 *
 * @param {string} filePath - Target file path
 * @param {string|Buffer} data - Data to write
 * @param {Object} options - Write options
 * @param {boolean} options.fsync - Whether to fsync before rename (default: true)
 * @param {string} options.encoding - File encoding (default: 'utf8')
 * @returns {Promise<void>}
 * @throws {Error} If write or rename fails
 */
async function writeAtomic(filePath, data, options = {}) {
  const {
    fsync: shouldFsync = true,
    encoding = 'utf8'
  } = options;

  // Generate unique temporary filename
  const random = crypto.randomBytes(6).toString('hex');
  const tmpPath = `${filePath}.tmp-${random}`;

  try {
    // Step 1: Write to temporary file
    await fs.writeFile(tmpPath, data, { encoding });

    // Step 2: fsync to ensure data is flushed to disk
    if (shouldFsync) {
      const fd = fsSync.openSync(tmpPath, 'r+');
      try {
        fsSync.fsyncSync(fd);
      } finally {
        fsSync.closeSync(fd);
      }
    }

    // Step 3: Atomic rename
    // On POSIX systems, rename() is atomic
    await fs.rename(tmpPath, filePath);

  } catch (error) {
    // Cleanup: remove temporary file if it exists
    try {
      await fs.unlink(tmpPath);
    } catch (unlinkError) {
      // Ignore unlink errors (file may not exist)
    }

    throw new Error(`Atomic write failed for ${filePath}: ${error.message}`);
  }
}

/**
 * Atomically write JSON data to a file
 *
 * @param {string} filePath - Target file path
 * @param {Object} data - JavaScript object to serialize
 * @param {Object} options - Write options
 * @returns {Promise<void>}
 * @throws {Error} If serialization or write fails
 */
async function writeJsonAtomic(filePath, data, options = {}) {
  try {
    const json = JSON.stringify(data, null, 2);
    await writeAtomic(filePath, json, options);
  } catch (error) {
    if (error.message.includes('Atomic write failed')) {
      throw error;
    }
    throw new Error(`JSON serialization failed for ${filePath}: ${error.message}`);
  }
}

/**
 * Atomically append data to a file
 * Note: This is NOT truly atomic for appends - use event log for true atomicity
 *
 * @param {string} filePath - Target file path
 * @param {string} data - Data to append
 * @returns {Promise<void>}
 * @throws {Error} If append fails
 */
async function appendAtomic(filePath, data) {
  try {
    // For append-only logs, we use appendFile with fsync
    // This is atomic enough for our use case (single-node, low-contention)
    await fs.appendFile(filePath, data, { encoding: 'utf8' });

    // fsync the file to ensure it's written to disk
    const fd = fsSync.openSync(filePath, 'r+');
    try {
      fsSync.fsyncSync(fd);
    } finally {
      fsSync.closeSync(fd);
    }
  } catch (error) {
    throw new Error(`Atomic append failed for ${filePath}: ${error.message}`);
  }
}

/**
 * Read a file safely (with error handling)
 *
 * @param {string} filePath - File to read
 * @param {Object} options - Read options
 * @param {string} options.encoding - File encoding (default: 'utf8')
 * @returns {Promise<string|Buffer>}
 * @throws {Error} If read fails
 */
async function readSafe(filePath, options = {}) {
  const { encoding = 'utf8' } = options;

  try {
    return await fs.readFile(filePath, { encoding });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    }
    throw new Error(`Read failed for ${filePath}: ${error.message}`);
  }
}

/**
 * Read JSON file safely
 *
 * @param {string} filePath - JSON file to read
 * @returns {Promise<Object>}
 * @throws {Error} If read or parse fails
 */
async function readJsonSafe(filePath) {
  try {
    const data = await readSafe(filePath);
    return JSON.parse(data);
  } catch (error) {
    if (error.message.includes('File not found')) {
      throw error;
    }
    throw new Error(`JSON parse failed for ${filePath}: ${error.message}`);
  }
}

/**
 * Check if a file exists
 *
 * @param {string} filePath - File to check
 * @returns {Promise<boolean>}
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists (create if not)
 *
 * @param {string} dirPath - Directory path
 * @returns {Promise<void>}
 */
async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
    }
  }
}

module.exports = {
  writeAtomic,
  writeJsonAtomic,
  appendAtomic,
  readSafe,
  readJsonSafe,
  fileExists,
  ensureDir
};
