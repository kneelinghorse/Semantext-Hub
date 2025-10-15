import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ProtocolViewerServer } = require('../../viewer/server.js');

/**
 * CLI command to start the protocol viewer server
 * @param {string} artifactsPath - Path to artifacts directory (required)
 * @param {object} options - Command options
 * @param {number} options.port - Port to listen on (default: 3000)
 */
export async function serveCommand(artifactsPath, options) {
  // Validate artifacts directory exists
  const resolvedPath = path.resolve(artifactsPath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: Artifacts directory not found: ${resolvedPath}`);
    process.exit(1);
  }

  if (!fs.statSync(resolvedPath).isDirectory()) {
    console.error(`Error: Not a directory: ${resolvedPath}`);
    process.exit(1);
  }

  // Create and start server
  const parsedPort = options.port !== undefined ? Number(options.port) : undefined;

  if (parsedPort !== undefined && (Number.isNaN(parsedPort) || parsedPort <= 0)) {
    console.error(`Error: Invalid port value: ${options.port}`);
    process.exit(1);
  }

  const server = new ProtocolViewerServer(resolvedPath, {
    port: parsedPort
  });

  try {
    await server.start();

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log('\nShutting down server...');
      await server.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}
