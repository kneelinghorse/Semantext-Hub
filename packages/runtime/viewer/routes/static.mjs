import express from 'express';
import path from 'node:path';

/**
 * Setup static file serving and SPA fallback
 * @param {object} app - Express app instance
 * @param {string} publicDir - Path to public directory
 */
export function setupStaticRoutes(app, publicDir) {

  // Serve static files (React build output)
  app.use(express.static(publicDir));

  // SPA fallback - all unmatched routes return index.html
  // This allows React Router to handle client-side routing
  // Use middleware instead of route to avoid Express 5 path-to-regexp issues
  app.use((req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}
