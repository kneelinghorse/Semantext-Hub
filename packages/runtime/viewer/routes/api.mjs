import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { validatePath } from '../middleware/validate-path.mjs';

// In-memory storage for graph chunks (permissive TTL)
const graphChunkStore = new Map();
const CHUNK_TTL_MS = 5 * 60 * 1000; // 5 minutes

function pruneExpiredChunks() {
  const now = Date.now();
  for (const [key, entry] of graphChunkStore.entries()) {
    if (entry.expiresAt <= now) {
      graphChunkStore.delete(key);
    }
  }
}

function createChunkId() {
  return `chunk-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

function normalizeManifestEntry(entry) {
  if (typeof entry === 'string') {
    return entry.trim();
  }

  if (entry && typeof entry === 'object') {
    if (typeof entry.filename === 'string') {
      return entry.filename.trim();
    }

    if (typeof entry.id === 'string') {
      return `${entry.id.trim()}.json`;
    }
  }

  return null;
}

function isSafeManifestName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.includes('..')) return false;
  if (path.isAbsolute(name)) return false;
  if (name.includes('/') || name.includes('\\')) return false;
  return true;
}

function safeJoin(baseDir, target) {
  const targetPath = path.resolve(baseDir, target);
  if (!targetPath.startsWith(path.resolve(baseDir))) {
    throw new Error('Invalid path');
  }
  return targetPath;
}

function summarizeValidation(manifestResults) {
  const summary = {
    total: manifestResults.length,
    passed: 0,
    warnings: 0,
    failed: 0
  };

  for (const result of manifestResults) {
    if (result.validationStatus === 'fail') {
      summary.failed += 1;
    } else if (result.validationStatus === 'warning') {
      summary.warnings += 1;
    } else {
      summary.passed += 1;
    }
  }

  return summary;
}

function deriveManifestId(manifest, fallback) {
  if (manifest?.protocol?.name) return manifest.protocol.name;
  if (manifest?.protocol?.urn) return manifest.protocol.urn;
  if (manifest?.event?.urn) return manifest.event.urn;
  return fallback.replace(/\.json$/i, '');
}

function buildGraph(manifestPayloads) {
  const nodes = [];
  const edges = [];

  for (const payload of manifestPayloads) {
    if (!payload || !payload.manifest) continue;

    const { manifest, filename } = payload;
    const protocol = manifest.protocol || {};
    const event = manifest.event || {};
    const id = deriveManifestId(manifest, filename);

    nodes.push({
      id,
      urn: protocol.urn || event.urn || `urn:proto:manifest:${id}`,
      type: protocol.kind || event.kind || 'unknown',
      format: protocol.kind || 'unknown',
      version: protocol.version || null,
      source: manifest.metadata?.source || 'unknown'
    });

    const dependencies = Array.isArray(protocol.dependencies)
      ? protocol.dependencies
      : [];

    for (const dep of dependencies) {
      if (!dep?.target) continue;
      edges.push({
        source: id,
        target: dep.target,
        type: dep.type || 'depends-on',
        urn: `urn:proto:graph:edge:${id}:${dep.target}`
      });
    }
  }

  return { nodes, edges };
}

function estimateDepth(edges) {
  if (!edges.length) return 1;
  const adjacency = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source).push(edge.target);
  }

  let maxDepth = 1;

  const visit = (node, depth, seen = new Set()) => {
    if (seen.has(node)) return;
    seen.add(node);
    maxDepth = Math.max(maxDepth, depth);
    const targets = adjacency.get(node) || [];
    for (const target of targets) {
      visit(target, depth + 1, new Set(seen));
    }
  };

  for (const edge of edges) {
    visit(edge.source, 2);
  }

  return Math.min(maxDepth, 6);
}

function chunkGraphData(nodes, edges, chunkSize = 50) {
  if (nodes.length === 0) {
    const emptyId = createChunkId();
    const chunkData = { nodes: [], edges: [], summary: { nodes: 0, edges: 0, depth: 0 } };
    return {
      parts: [
        {
          id: emptyId,
          data: chunkData,
          size: Buffer.byteLength(JSON.stringify(chunkData))
        }
      ],
      totalNodes: 0,
      totalEdges: 0,
      depth: 0
    };
  }

  const depthEstimate = estimateDepth(edges);
  const parts = [];
  for (let i = 0; i < nodes.length; i += chunkSize) {
    const chunkNodes = nodes.slice(i, i + chunkSize);
    const nodeIds = new Set(chunkNodes.map((n) => n.id));
    const chunkEdges = edges.filter((edge) => nodeIds.has(edge.source) || nodeIds.has(edge.target));

    const chunkData = {
      nodes: chunkNodes,
      edges: chunkEdges,
      summary: {
        nodes: chunkNodes.length,
        edges: chunkEdges.length,
        depth: depthEstimate
      }
    };

    const id = createChunkId();
    parts.push({
      id,
      data: chunkData,
      size: Buffer.byteLength(JSON.stringify(chunkData))
    });
  }

  return {
    parts,
    totalNodes: nodes.length,
    totalEdges: edges.length,
    depth: depthEstimate
  };
}

async function readManifestFile(artifactsDir, manifestName) {
  const filePath = safeJoin(artifactsDir, manifestName);
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Setup API routes for the protocol viewer
 * @param {object} app - Express app instance
 * @param {string} artifactsDir - Path to artifacts directory
 */
export function setupApiRoutes(app, artifactsDir) {

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

  /**
   * POST /api/validate
   * Validate manifests and return aggregated results
   */
  app.post('/api/validate', async (req, res) => {
    try {
      const manifestsInput = req.body?.manifests;
      if (!Array.isArray(manifestsInput) || manifestsInput.length === 0) {
        return res.status(400).json({ error: 'Request body must include manifests: []' });
      }

      const manifests = manifestsInput
        .map(normalizeManifestEntry)
        .filter(Boolean);

      if (manifests.length === 0) {
        return res.status(400).json({ error: 'No valid manifests provided' });
      }

      const manifestResults = [];
      const aggregatedErrors = [];

      for (const manifestName of manifests) {
        if (!isSafeManifestName(manifestName)) {
          aggregatedErrors.push({
            manifest: manifestName,
            path: manifestName,
            message: 'Invalid manifest name',
            level: 'error'
          });
          manifestResults.push({
            id: manifestName,
            urn: null,
            validationStatus: 'fail',
            errors: [{
              path: manifestName,
              message: 'Invalid manifest name',
              level: 'error'
            }],
            warnings: []
          });
          continue;
        }

        try {
          const manifest = await readManifestFile(artifactsDir, manifestName);

          const issues = [];
          const warnings = [];

          if (!manifest.protocol) {
            issues.push({ path: `${manifestName}.protocol`, message: 'Missing protocol section', level: 'error' });
          } else {
            if (!manifest.protocol.urn) {
              issues.push({ path: `${manifestName}.protocol.urn`, message: 'Missing protocol URN', level: 'error' });
            }
            if (!manifest.protocol.kind) {
              warnings.push({ path: `${manifestName}.protocol.kind`, message: 'Missing protocol kind', level: 'warning' });
            }
            if (!manifest.protocol.version) {
              warnings.push({ path: `${manifestName}.protocol.version`, message: 'Missing protocol version', level: 'warning' });
            }
          }

          if (!manifest.event?.urn) {
            warnings.push({ path: `${manifestName}.event.urn`, message: 'Missing event URN', level: 'warning' });
          }

          const status = issues.length > 0
            ? 'fail'
            : (warnings.length > 0 ? 'warning' : 'pass');

          const manifestId = deriveManifestId(manifest, manifestName);
          const urn = manifest.protocol?.urn || manifest.event?.urn || null;

          manifestResults.push({
            id: manifestId,
            urn,
            validationStatus: status,
            errors: issues,
            warnings
          });

          aggregatedErrors.push(
            ...issues.map(issue => ({ ...issue, manifest: manifestId })),
            ...warnings.map(warn => ({ ...warn, manifest: manifestId }))
          );

        } catch (err) {
          const message = err.code === 'ENOENT'
            ? 'Manifest not found'
            : 'Failed to read manifest';

          const level = err.code === 'ENOENT' ? 'error' : 'error';

          aggregatedErrors.push({
            manifest: manifestName,
            path: manifestName,
            message,
            level
          });

          manifestResults.push({
            id: manifestName.replace(/\.json$/i, ''),
            urn: null,
            validationStatus: 'fail',
            errors: [{ path: manifestName, message, level }],
            warnings: []
          });
        }
      }

      const summary = summarizeValidation(manifestResults);
      const valid = summary.failed === 0;

      res.json({
        valid,
        checked_at: new Date().toISOString(),
        summary,
        manifests: manifestResults,
        errors: aggregatedErrors
      });
    } catch (err) {
      console.error('Validation route failed:', err);
      res.status(500).json({ error: 'Validation failed' });
    }
  });

  /**
   * POST /api/graph
   * Generates graph index + chunk descriptors
   */
  app.post('/api/graph', async (req, res) => {
    try {
      pruneExpiredChunks();

      const manifestsInput = req.body?.manifests;
      if (!Array.isArray(manifestsInput) || manifestsInput.length === 0) {
        return res.status(400).json({ error: 'Request body must include manifests: []' });
      }

      const manifests = manifestsInput
        .map(normalizeManifestEntry)
        .filter(Boolean)
        .filter(isSafeManifestName);

      if (manifests.length === 0) {
        return res.status(400).json({ error: 'No valid manifests provided' });
      }

      const manifestPayloads = [];

      for (const manifestName of manifests) {
        try {
          const manifest = await readManifestFile(artifactsDir, manifestName);
          manifestPayloads.push({ manifest, filename: manifestName });
        } catch (err) {
          if (err.code === 'ENOENT') {
            return res.status(404).json({ error: `Manifest not found: ${manifestName}` });
          }
          throw err;
        }
      }

      const { nodes, edges } = buildGraph(manifestPayloads);
      const graphChunks = chunkGraphData(nodes, edges, 50);

      const responseParts = graphChunks.parts.map((part) => {
        graphChunkStore.set(part.id, {
          data: part.data,
          expiresAt: Date.now() + CHUNK_TTL_MS
        });
        return {
          id: part.id,
          url: `/api/graph/part/${part.id}`,
          size: part.size,
          nodes: part.data.summary.nodes,
          edges: part.data.summary.edges,
          depth: part.data.summary.depth
        };
      });

      const index = {
        generated_at: new Date().toISOString(),
        parts: responseParts.length,
        node_count: graphChunks.totalNodes,
        edge_count: graphChunks.totalEdges,
        depth: graphChunks.depth,
        expires_in_ms: CHUNK_TTL_MS
      };

      res.json({ index, parts: responseParts });
    } catch (err) {
      console.error('Graph route failed:', err);
      res.status(500).json({ error: 'Graph generation failed' });
    }
  });

  /**
   * GET /api/graph/part/:id
   * Returns chunked graph data by id
   */
  app.get('/api/graph/part/:id', (req, res) => {
    pruneExpiredChunks();

    const { id } = req.params;
    const chunk = graphChunkStore.get(id);

    if (!chunk) {
      return res.status(404).json({ error: 'Graph chunk not found' });
    }

    res.json({
      ...chunk.data,
      served_at: new Date().toISOString()
    });
  });
}
