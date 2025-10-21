#!/usr/bin/env node

/**
 * Registry Server Startup Script
 * 
 * Starts the Registry HTTP service with proper configuration.
 */

import { startRegistryServer } from './server.mjs';

const DEFAULT_PORT = process.env.PORT || process.env.REGISTRY_PORT || 3000;
const DEFAULT_API_KEY = process.env.REGISTRY_API_KEY || 'local-dev-key';

async function main() {
  const port = Number.parseInt(DEFAULT_PORT, 10);
  const apiKey = DEFAULT_API_KEY;

  console.log(`Starting Registry Server on port ${port}`);
  console.log(`API Key: ${apiKey.substring(0, 8)}...`);

  try {
    const server = await startRegistryServer({
      port,
      apiKey
    });

    console.log(`Registry Server started successfully on http://localhost:${port}`);
    console.log('Available endpoints:');
    console.log('  GET  /health');
    console.log('  GET  /openapi.json');
    console.log('  GET  /registry?cap=<capability>');
    console.log('  POST /registry');
    console.log('  GET  /resolve/<urn>');
    console.log('  GET  /v1/registry/:urn');
    console.log('  PUT  /v1/registry/:urn');
    console.log('  GET  /v1/resolve?urn=<urn>');

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\nShutting down Registry Server...');
      await server.close();
      console.log('Registry Server stopped');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    console.error('Failed to start Registry Server:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Startup failed:', error);
    process.exit(1);
  });
}

