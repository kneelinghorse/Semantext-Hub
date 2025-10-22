#!/usr/bin/env node
import { startServer } from '../../packages/runtime/registry/server.mjs';

(async () => {
  try {
    const { port } = await startServer({ port: 3000 });
    console.log(`[server] Registry running on http://localhost:${port}`);
  } catch (error) {
    console.error('[server] Failed to start:', error);
    process.exit(1);
  }
})();


