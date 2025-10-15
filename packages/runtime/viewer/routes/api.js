const fs = require('fs').promises;
const path = require('path');
const { validatePath } = require('../middleware/validate-path.js');

/**
 * Setup API routes for the protocol viewer
 * @param {object} app - Express app instance
 * @param {string} artifactsDir - Path to artifacts directory
 */
function setupApiRoutes(app, artifactsDir) {

  /**
   * GET /api/health
   * Health check endpoint with server metadata
   */
  app.get('/api/health', async (req, res) => {
    try {
      const files = await fs.readdir(artifactsDir);
      const manifestCount = files.filter(f => f.endsWith('.json')).length;

      res.json({
        status: 'ok',
        version: '0.1.0',
        artifacts_dir: artifactsDir,
        manifest_count: manifestCount
      });
    } catch (err) {
      console.error('Health check failed:', err);
      res.status(500).json({
        status: 'error',
        error: 'Failed to read artifacts directory'
      });
    }
  });

  /**
   * GET /api/manifests
   * List all manifest files with optional filtering by kind
   * Query params:
   *   - kind: Filter by manifest kind (api|data|event|semantic)
   */
  app.get('/api/manifests', async (req, res) => {
    try {
      const { kind } = req.query;
      const files = await fs.readdir(artifactsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      const manifests = await Promise.all(
        jsonFiles.map(async (filename) => {
          try {
            const filePath = path.join(artifactsDir, filename);
            const stats = await fs.stat(filePath);
            const content = await fs.readFile(filePath, 'utf-8');
            const manifest = JSON.parse(content);

            // Extract manifest kind and URN
            const manifestKind = manifest.event?.kind ||
                                manifest.protocol?.kind ||
                                'unknown';
            const urn = manifest.event?.urn ||
                       manifest.protocol?.urn ||
                       null;

            return {
              filename,
              kind: manifestKind,
              size: stats.size,
              modified: stats.mtime.toISOString(),
              urn
            };
          } catch (err) {
            console.error(`Failed to read manifest ${filename}:`, err);
            return null;
          }
        })
      );

      // Filter out failed reads and apply kind filter
      let validManifests = manifests.filter(m => m !== null);

      if (kind) {
        validManifests = validManifests.filter(m => m.kind === kind);
      }

      res.json({ manifests: validManifests });
    } catch (err) {
      console.error('Failed to list manifests:', err);
      res.status(500).json({ error: 'Failed to list manifests' });
    }
  });

  /**
   * GET /api/manifest/:filename
   * Retrieve a specific manifest by filename
   * Includes path validation middleware for security
   */
  app.get('/api/manifest/:filename', (req, res, next) => {
    // Early path validation before the middleware
    // Check originalUrl for any suspicious patterns
    if (req.originalUrl.includes('..') || req.originalUrl.includes('//')) {
      return res.status(403).json({ error: 'Invalid path' });
    }
    next();
  }, validatePath, async (req, res) => {
    try {
      const { filename } = req.params;
      const filePath = path.join(artifactsDir, filename);

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).json({ error: 'Manifest not found' });
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const manifest = JSON.parse(content);

      res.json(manifest);
    } catch (err) {
      console.error('Failed to read manifest:', err);

      // Don't leak filesystem paths in errors
      if (err instanceof SyntaxError) {
        return res.status(400).json({ error: 'Invalid JSON in manifest file' });
      }

      res.status(500).json({ error: 'Failed to read manifest' });
    }
  });
}

module.exports = { setupApiRoutes };
