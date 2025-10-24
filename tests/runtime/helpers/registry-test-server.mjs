#!/usr/bin/env node
import process from 'node:process';
import { startServer } from '../../../packages/runtime/registry/server.mjs';

const [configPath, apiKey, portArg] = process.argv.slice(2);

if (!configPath) {
  console.error('[registry-test-server] Missing config path argument');
  process.exit(1);
}

if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
  console.error('[registry-test-server] Missing API key argument (secure defaults enforced)');
  process.exit(1);
}

const port = Number(portArg) || 0;
const options = {
  registryConfigPath: configPath,
  apiKey,
  port,
};

try {
  const server = await startServer(options);
  process.send?.({ type: 'ready', port: server.port });

  const shutdown = async () => {
    try {
      await server.close();
    } catch (error) {
      console.error('[registry-test-server] Error during shutdown:', error);
    } finally {
      process.exit(0);
    }
  };

  process.on('message', (msg) => {
    if (msg && msg.type === 'shutdown') {
      shutdown();
    }
  });

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} catch (error) {
  console.error('[registry-test-server] Failed to start server:', error);
  process.exit(1);
}
