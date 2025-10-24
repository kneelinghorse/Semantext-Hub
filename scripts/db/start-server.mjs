#!/usr/bin/env node
import { startServer } from '../../packages/runtime/registry/server.mjs';

(async () => {
  const apiKey = typeof process.env.REGISTRY_API_KEY === 'string'
    ? process.env.REGISTRY_API_KEY.trim()
    : '';

  if (!apiKey) {
    console.error('[server] REGISTRY_API_KEY is required to start the registry (secure defaults enforced).');
    process.exit(1);
  }

  try {
    const { port } = await startServer({ port: 3000, apiKey });
    console.log(`[server] Registry running on http://localhost:${port}`);
  } catch (error) {
    console.error('[server] Failed to start:', error);
    process.exit(1);
  }
})();

