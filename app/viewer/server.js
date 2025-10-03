const express = require('express');
const cors = require('cors');
const path = require('path');
const { setupApiRoutes } = require('./routes/api.js');
const { setupStaticRoutes } = require('./routes/static.js');
const { createRateLimiter } = require('./middleware/rate-limit.js');

/**
 * Protocol Viewer Server
 * Serves protocol manifests via JSON API and hosts React viewer
 */
class ProtocolViewerServer {
  /**
   * Create a new viewer server
   * @param {string} artifactsDir - Path to artifacts directory containing manifests
   * @param {object} options - Server configuration options
   * @param {number} options.port - Port to listen on (default: 3000)
   * @param {boolean} options.enableCors - Enable CORS (default: true in dev, false in production)
   */
  constructor(artifactsDir, options = {}) {
    this.artifactsDir = path.resolve(artifactsDir);
    this.port = options.port || 3000;
    this.enableCors = options.enableCors !== undefined
      ? options.enableCors
      : process.env.NODE_ENV !== 'production';

    this.app = express();
    this.server = null;

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   * Configures JSON parsing, CORS, and rate limiting
   */
  setupMiddleware() {
    // Security: Block suspicious URL patterns early
    this.app.use((req, res, next) => {
      // Check both encoded and decoded URLs for suspicious patterns
      const originalUrl = req.originalUrl;
      const decodedUrl = decodeURIComponent(originalUrl);

      // Check for directory traversal and other suspicious patterns
      if (originalUrl.includes('..') || decodedUrl.includes('..') ||
          (originalUrl.includes('//') && !originalUrl.startsWith('http'))) {
        return res.status(403).json({ error: 'Invalid path' });
      }
      next();
    });

    // JSON parsing
    this.app.use(express.json());

    // CORS (development only by default)
    if (this.enableCors) {
      this.app.use(cors({
        origin: ['http://localhost:5173', 'http://localhost:3000'],
        credentials: true
      }));
    }

    // Rate limiting protects the API from abuse (100 req/min per IP)
    this.app.use(createRateLimiter());
  }

  /**
   * Setup routes
   * IMPORTANT: API routes must come before static file serving
   * to prevent the SPA fallback from shadowing API endpoints
   */
  setupRoutes() {
    // API routes first
    setupApiRoutes(this.app, this.artifactsDir);

    // Static file serving and SPA fallback last
    const publicDir = path.join(__dirname, 'public');
    setupStaticRoutes(this.app, publicDir);
  }

  /**
   * Start the server
   * @returns {Promise<void>} Resolves when server is listening
   */
  async start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`Protocol Viewer running on http://localhost:${this.port}`);
        console.log(`Serving manifests from: ${this.artifactsDir}`);
        resolve();
      });
    });
  }

  /**
   * Stop the server gracefully
   * @returns {Promise<void>} Resolves when server is closed
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = { ProtocolViewerServer };
