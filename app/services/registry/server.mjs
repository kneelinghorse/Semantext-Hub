/**
 * Legacy Registry Server Compatibility Layer
 *
 * This module now simply re-exports the canonical runtime server.
 * Update imports to use `packages/runtime/registry/server.mjs` directly.
 */

const message =
  '[DEPRECATED] app/services/registry/server.mjs is now a thin proxy. Use packages/runtime/registry/server.mjs.';

// Emit the warning once when the module is loaded.
if (!process.env.OSSP_AGI_SILENCE_REGISTRY_DEPRECATION) {
  console.warn(message);
}

export {
  readOpenApiSpec,
  loadOpenApiSpec,
  createServer,
  startServer,
} from '../../../packages/runtime/registry/server.mjs';
export { openDb } from '../../../packages/runtime/registry/db.mjs';
