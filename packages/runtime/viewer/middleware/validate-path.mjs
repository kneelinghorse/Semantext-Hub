import path from 'node:path';

/**
 * Middleware to validate manifest file paths and prevent directory traversal attacks
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
export function validatePath(req, res, next) {
  // Check both params.filename and the original URL
  const filename = req.params.filename;
  const originalUrl = req.originalUrl;
  const rawPath = req.path;

  if (!filename) {
    return res.status(400).json({ error: 'Filename is required' });
  }

  // Prevent directory traversal - check original URL, path, and filename
  if (filename.includes('..') || path.isAbsolute(filename) ||
      originalUrl.includes('..') || originalUrl.includes('//') ||
      rawPath.includes('..') || rawPath.includes('//')) {
    return res.status(403).json({ error: 'Invalid path' });
  }

  // Only allow JSON files
  if (!filename.endsWith('.json')) {
    return res.status(400).json({ error: 'Only JSON files allowed' });
  }

  next();
}
