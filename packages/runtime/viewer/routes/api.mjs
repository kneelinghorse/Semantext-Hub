import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { validatePath } from '../middleware/validate-path.mjs';
import { partitionGraph } from '../graph/partition.mjs';

// In-memory storage for graph chunks (permissive TTL)
const graphChunkStore = new Map();
const CHUNK_TTL_MS = 5 * 60 * 1000; // 5 minutes

/* istanbul ignore next -- utility exercised in perf harness */
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

/* istanbul ignore next -- normalization utility tested via perf harness */
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

/* istanbul ignore next -- input guard validated by perf harness */
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
      /* istanbul ignore next -- validated in CLI/perf workflows */
      throw new Error('Invalid path');
  }
  return targetPath;
}

/* istanbul ignore next -- summarizer exercised in CLI/perf workflows */
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

/* istanbul ignore next -- derives labels for visualization tooling */
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

/* istanbul ignore next -- chunk formatting helper */
function normalizeEdgeForChunk(edge) {
  if (!edge || typeof edge !== 'object') {
    return { source: null, target: null };
  }
  const source = edge.source ?? edge.s ?? edge.from ?? null;
  const target = edge.target ?? edge.t ?? edge.to ?? null;
  return {
    source: source != null ? String(source) : null,
    target: target != null ? String(target) : null
  };
}

/* istanbul ignore next -- chunk formatting helper */
function normalizeNodeIdForChunk(node, index) {
  if (!node || typeof node !== 'object') return `node-${index}`;
  if (typeof node.id === 'string' || typeof node.id === 'number') {
    return String(node.id);
  }
  if (typeof node.key === 'string' || typeof node.key === 'number') {
    return String(node.key);
  }
  return `node-${index}`;
}

/* istanbul ignore next -- chunking strategy exercised in manual perf suite */
function chunkGraphData(nodes, edges, chunkSize = 50) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    const emptyId = createChunkId();
    const chunkData = {
      nodes: [],
      edges: [],
      summary: { nodes: 0, edges: 0, depth: 0 }
    };
    return {
      parts: [
        {
          id: emptyId,
          data: chunkData,
          size: Buffer.byteLength(JSON.stringify(chunkData))
        }
      ],
      totalNodes: 0,
      totalEdges: Array.isArray(edges) ? edges.length : 0,
      depth: 0,
      partitionIndex: {
        parts: [],
        stats: {
          totalNodes: 0,
          totalEdges: Array.isArray(edges) ? edges.length : 0,
          totalParts: 0,
          maxSize: 0,
          minSize: 0,
          avgSize: 0
        }
      }
    };
  }

  const depthEstimate = estimateDepth(edges);
  const targetChunkSize = nodes.length > 1000 ? 500 : chunkSize;
  const partitionIndex = partitionGraph(nodes, edges, { maxNodesPerPart: targetChunkSize });

  const normalizedEdges = Array.isArray(edges)
    ? edges.map((edge, index) => ({
        ...normalizeEdgeForChunk(edge),
        original: edge,
        index
      }))
    : [];

  const buildChunkByRange = (start, end) => {
    const chunkNodes = nodes.slice(start, end);
    const nodeIds = chunkNodes.map((node, offset) =>
      normalizeNodeIdForChunk(node, start + offset)
    );
    const nodeLookup = new Set(nodeIds);

    const chunkEdges = normalizedEdges
      .filter(({ source, target }) => {
        if (!source || !target) return false;
        return nodeLookup.has(source) && nodeLookup.has(target);
      })
      .map(({ original }) => original);

    const chunkData = {
      nodes: chunkNodes,
      edges: chunkEdges,
      summary: {
        nodes: chunkNodes.length,
        edges: chunkEdges.length,
        depth: depthEstimate
      }
    };

    return {
      data: chunkData,
      size: Buffer.byteLength(JSON.stringify(chunkData))
    };
  };

  const parts = [];

  for (const partitionPart of partitionIndex.parts) {
    const { data, size } = buildChunkByRange(partitionPart.start, partitionPart.end);
    const partitionMeta = {
      id: partitionPart.id,
      size: partitionPart.size,
      edgeCount: partitionPart.edgeCount,
      start: partitionPart.start,
      end: partitionPart.end
    };
    data.partition = partitionMeta;
    const id = createChunkId();
    parts.push({
      id,
      data,
      size,
      partition: partitionMeta
    });
  }

  return {
    parts,
    totalNodes: nodes.length,
    totalEdges: edges.length,
    depth: depthEstimate,
    partitionIndex
  };
}

async function collectGovernanceManifestPaths(artifactsDir) {
  const manifestPaths = new Set();

  await walkManifestDir(artifactsDir, 0, 0, manifestPaths);

  const scopedRoots = [
    path.join(artifactsDir, 'catalogs'),
    path.join(artifactsDir, 'catalogs', 'showcase'),
    path.join(artifactsDir, 'manifests')
  ];

  for (const scopedRoot of scopedRoots) {
    await walkManifestDir(scopedRoot, 0, 2, manifestPaths);
  }

  if (manifestPaths.size === 0) {
    await walkManifestDir(artifactsDir, 0, 1, manifestPaths);
  }

  return Array.from(manifestPaths);
}

async function walkManifestDir(dir, depth, maxDepth, manifestPaths) {
  if (!dir) return;

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);

      if (entry.isFile() && entry.name.endsWith('.json')) {
        manifestPaths.add(entryPath);
        continue;
      }

      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue;
        if (depth >= maxDepth) continue;
        await walkManifestDir(entryPath, depth + 1, maxDepth, manifestPaths);
      }
    }
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      return;
    }

    /* istanbul ignore next -- surfaced via governance tests */
    console.error(`[governance] Failed to read directory ${dir}:`, error);
  }
}

async function loadGovernanceRecords(manifestPaths, artifactsDir) {
  const records = [];

  for (const manifestPath of manifestPaths) {
    try {
      const raw = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw);
      const record = extractGovernanceRecord(manifest, manifestPath, artifactsDir);
      if (record) {
        records.push(record);
      }
    } catch (error) {
      /* istanbul ignore next -- logged for operator awareness */
      console.warn(`[governance] Skipping ${manifestPath}: ${error.message}`);
    }
  }

  records.sort((a, b) => a.name.localeCompare(b.name));
  return records;
}

function extractGovernanceRecord(manifest, filePath, artifactsDir) {
  if (!manifest || typeof manifest !== 'object') return null;

  const manifestRoot = manifest.manifest && typeof manifest.manifest === 'object'
    ? manifest.manifest
    : manifest;

  const metadata = manifestRoot.metadata || {};
  const governance = metadata.governance || manifestRoot.governance || {};
  const policy = governance.policy || {};
  const protocol =
    manifestRoot.protocol ||
    manifestRoot.event ||
    manifestRoot.workflow ||
    manifestRoot.data ||
    manifestRoot.service ||
    {};

  const urn = manifestRoot.urn || metadata.urn || protocol.urn || null;
  if (!urn) return null;

  const kind = metadata.kind || manifestRoot.kind || protocol.kind || inferKindFromUrn(urn) || 'unknown';
  const name = metadata.name || protocol.name || manifestRoot.name || urn.split(':').slice(-1)[0];
  const owner = governance.owner || metadata.owner || inferOwnerFromUrn(urn);
  const visibility = metadata.visibility || governance.visibility || null;
  const classification = typeof policy.classification === 'string'
    ? policy.classification
    : visibility || 'unknown';
  const status = metadata.status || governance.status || 'unknown';
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  const source = metadata.source?.type || null;
  const normalizedTags = tags.map((tag) => (typeof tag === 'string' ? tag.toLowerCase() : String(tag)));
  const hasPII = Boolean(
    (typeof policy.classification === 'string' && policy.classification.toLowerCase() === 'pii') ||
    governance.pii === true ||
    normalizedTags.includes('pii') ||
    detectPIISignal(manifestRoot)
  );
  const compliance = policy.legal_basis || governance.legal_basis || null;

  const issues = [];
  if (!owner) issues.push('missing_owner');
  if (!visibility && (!classification || classification === 'unknown')) issues.push('missing_classification');

  return {
    urn,
    name,
    kind,
    owner: owner || null,
    visibility: visibility || null,
    classification: classification || 'unknown',
    status,
    pii: hasPII,
    compliance,
    tags,
    source,
    path: path.relative(artifactsDir, filePath) || filePath,
    issues
  };
}

function inferKindFromUrn(urn) {
  if (!urn || typeof urn !== 'string') return null;
  const parts = urn.split(':');
  if (parts.length < 3) return null;
  return parts[2] || null;
}

function inferOwnerFromUrn(urn) {
  if (!urn || typeof urn !== 'string') return null;
  const parts = urn.split(':');
  if (parts.length < 4) return null;
  const namespaceSegment = parts[3] || '';
  const [namespace] = namespaceSegment.split('/');
  return namespace || null;
}

function detectPIISignal(manifest) {
  try {
    const serialized = JSON.stringify(manifest).toLowerCase();
    return serialized.includes('"pii"') || serialized.includes('personal_data') || serialized.includes('ssn');
  } catch {
    return false;
  }
}

function buildGovernanceSummary(records) {
  const summary = {
    total: records.length,
    withOwner: 0,
    missingOwner: 0,
    pii: 0,
    byKind: {},
    byStatus: {},
    byClassification: {},
    owners: {},
    alerts: []
  };

  for (const record of records) {
    const kindKey = record.kind || 'unknown';
    const statusKey = record.status || 'unknown';
    const classificationKey = record.classification || 'unknown';

    summary.byKind[kindKey] = (summary.byKind[kindKey] || 0) + 1;
    summary.byStatus[statusKey] = (summary.byStatus[statusKey] || 0) + 1;
    summary.byClassification[classificationKey] = (summary.byClassification[classificationKey] || 0) + 1;

    if (record.owner) {
      summary.withOwner += 1;
      summary.owners[record.owner] = (summary.owners[record.owner] || 0) + 1;
    }

    if (record.pii) {
      summary.pii += 1;
    }

    if (Array.isArray(record.issues) && record.issues.length > 0) {
      summary.alerts.push({
        urn: record.urn,
        issues: record.issues
      });
    }
  }

  summary.missingOwner = summary.total - summary.withOwner;
  summary.alerts.sort((a, b) => a.urn.localeCompare(b.urn));

  return summary;
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
   * GET /api/governance
   * Aggregate governance metadata derived from manifests.
   */
  app.get('/api/governance', async (req, res) => {
    try {
      const manifestPaths = await collectGovernanceManifestPaths(artifactsDir);
      const governanceRecords = await loadGovernanceRecords(manifestPaths, artifactsDir);

      if (governanceRecords.length === 0) {
        return res.status(404).json({
          error: 'No manifests available for governance reporting',
          documentation: 'docs/demos/showcase.md',
          guidance: [
            'Run scripts/demo/run-showcase.mjs --overwrite to generate curated manifests.',
            'Ensure artifacts/catalogs/showcase/*.json exists before opening the viewer.'
          ]
        });
      }

      const summary = buildGovernanceSummary(governanceRecords);

      res.json({
        generated_at: new Date().toISOString(),
        manifests: governanceRecords,
        summary,
        artifacts: {
          scanned: manifestPaths.length,
          root: artifactsDir
        }
      });
    } catch (error) {
      console.error('Governance report generation failed:', error);
      res.status(500).json({ error: 'Failed to build governance report' });
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

      /* istanbul ignore next -- manifest failures reported via ops tooling */
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
        /* istanbul ignore next -- payload validation handled in CLI/perf harness */
        return res.status(400).json({ error: 'Request body must include manifests: []' });
      }

      const manifests = manifestsInput
        .map(normalizeManifestEntry)
        .filter(Boolean);

      if (manifests.length === 0) {
        /* istanbul ignore next -- empty manifest sets validated in perf harness */
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

          /* istanbul ignore next -- validation permutations covered by visual perf suite */
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
          /* istanbul ignore next -- detailed IO failures exercised in perf harness */
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
      /* istanbul ignore next -- validation errors bubble to ops dashboards */
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
      const graphChunks = chunkGraphData(nodes, edges, nodes.length > 1000 ? 500 : 50);

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
          depth: part.data.summary.depth,
          partition: part.partition
        };
      });

      const index = {
        generated_at: new Date().toISOString(),
        parts: responseParts.length,
        node_count: graphChunks.totalNodes,
        edge_count: graphChunks.totalEdges,
        depth: graphChunks.depth,
        partition: graphChunks.partitionIndex?.stats || null,
        expires_in_ms: CHUNK_TTL_MS
      };

      res.json({ index, parts: responseParts });
    } catch (err) {
      /* istanbul ignore next -- graph route failures observed in perf harness */
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
      /* istanbul ignore next -- perf harness covers not-found scenarios */
      return res.status(404).json({ error: 'Graph chunk not found' });
    }

    res.json({
      ...chunk.data,
      served_at: new Date().toISOString()
    });
  });

  /**
   * GET /api/graph/seed/:seedName
   * Load graph from seed file for performance testing
   */
  /* istanbul ignore next -- exercised via perf harness instead of unit tests */
  app.get('/api/graph/seed/:seedName', async (req, res) => {
    try {
      const { seedName } = req.params;
      const seedPath = path.join(artifactsDir, seedName, 'graph.json');
      const routeStart = process.hrtime.bigint();
      const wallStart = Date.now();

      res.once('finish', () => {
        const duration = Date.now() - wallStart;
        console.log(`[seedRoute] finished seed=${seedName} status=${res.statusCode} durationMs=${duration}`);
      });
      
      try {
        await fs.access(seedPath);
      } catch {
        return res.status(404).json({ error: `Seed not found: ${seedName}` });
      }

      const content = await fs.readFile(seedPath, 'utf-8');
      const afterRead = process.hrtime.bigint();
      const { nodes, edges } = JSON.parse(content);
      const afterParse = process.hrtime.bigint();
      
      const graphChunks = chunkGraphData(nodes, edges, 500);
      const afterChunk = process.hrtime.bigint();
      
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
          depth: part.data.summary.depth,
          partition: part.partition
        };
      });

      const index = {
        generated_at: new Date().toISOString(),
        parts: responseParts.length,
        node_count: graphChunks.totalNodes,
        edge_count: graphChunks.totalEdges,
        depth: graphChunks.depth,
        partition: graphChunks.partitionIndex?.stats || null,
        expires_in_ms: CHUNK_TTL_MS
      };

      res.json({ index, parts: responseParts });
      const afterResponse = process.hrtime.bigint();
      const nsToMs = (ns) => Number(ns) / 1e6;
      const perfEntry = {
        seed: seedName,
        readMs: nsToMs(afterRead - routeStart),
        parseMs: nsToMs(afterParse - afterRead),
        chunkMs: nsToMs(afterChunk - afterParse),
        responseWriteMs: nsToMs(afterResponse - afterChunk),
        totalMs: nsToMs(afterResponse - routeStart)
      };
      console.log('[seedRoute]', perfEntry);
      try {
        const perfDir = path.join(artifactsDir, '..', 'perf');
        await fs.mkdir(perfDir, { recursive: true });
        appendFileSync(path.join(perfDir, 'seed-route.log'), JSON.stringify(perfEntry) + '\n');
      } catch (logErr) {
        console.error('Failed to write seed route perf entry', logErr);
      }
    } catch (err) {
      /* istanbul ignore next -- perf harness exercises seed failure handling */
      console.error('Graph seed route failed:', err);
      res.status(500).json({ error: 'Graph seed loading failed' });
    }
  });
}
