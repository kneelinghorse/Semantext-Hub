#!/usr/bin/env node

/**
 * Backwards-compatible re-export of catalog helpers now hosted under src/catalog/shared.js.
 * Retained for existing CLI entrypoints while enabling other surfaces to import from src/.
 */

export * from '../../src/catalog/shared.js';
export { default } from '../../src/catalog/shared.js';
