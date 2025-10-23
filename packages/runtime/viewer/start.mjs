#!/usr/bin/env node
/**
 * Start the Protocol Viewer Server
 */

import { ProtocolViewerServer } from './server.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use artifacts directory from project root (3 levels up from packages/runtime/viewer)
const artifactsDir = path.resolve(__dirname, '../../../artifacts');

console.log('Starting Protocol Viewer...');
console.log('Artifacts directory:', artifactsDir);

// Check if directory exists
if (!fs.existsSync(artifactsDir)) {
  console.error(`Error: Artifacts directory does not exist: ${artifactsDir}`);
  process.exit(1);
}

const server = new ProtocolViewerServer(artifactsDir, {
  port: 3000,
  enableCors: true
});

server.start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});




