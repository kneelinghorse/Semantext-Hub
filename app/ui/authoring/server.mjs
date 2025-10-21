import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const DEFAULT_PORT = 3030;

export function createAjv() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
  });
  addFormats(ajv);
  return ajv;
}

async function resolveLocalSchema(uri, baseDir) {
  if (!uri) throw new Error('Empty $ref uri');
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    throw Object.assign(new Error(`Network schema refs are not allowed: ${uri}`), { code: 'NETWORK_REF_DISALLOWED' });
  }

  // Support in-file references (file.json#/defs/A)
  const [filePart, jsonPointer] = uri.split('#');
  const p = path.isAbsolute(filePart) ? filePart : path.resolve(baseDir, filePart || '');
  const raw = await fs.readFile(p, 'utf8');
  const schema = JSON.parse(raw);

  if (!jsonPointer) return schema;
  // Minimal JSON pointer resolver
  const pointer = jsonPointer.replace(/^\//, '').split('/').map(decodeURIComponent);
  let cur = schema;
  for (const seg of pointer) {
    if (seg === '') continue;
    cur = cur?.[seg];
    if (cur === undefined) break;
  }
  return cur;
}

export function createApp({ baseDir = process.cwd() } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  const limiter = rateLimit({ windowMs: 1000, max: 200 });
  app.use(limiter);

  const webDir = path.resolve(process.cwd(), 'app/ui/authoring/web');
  app.use('/', express.static(webDir));
  // Serve project docs for help links in UI
  const docsDir = path.resolve(process.cwd(), 'app/docs');
  app.use('/docs', express.static(docsDir));

  // Viewer-compatible validation endpoint
  app.post('/api/validate', async (req, res) => {
    const started = Date.now();
    try {
      const { schema, manifest, manifests, baseDir: bodyBaseDir } = req.body || {};
      const effectiveBaseDir = bodyBaseDir ? path.resolve(bodyBaseDir) : baseDir;

      if (!schema) {
        return res.status(400).json({ ok: false, error: 'schema_required', message: 'Provide a JSON Schema in body.schema' });
      }

      const ajv = createAjv();
      ajv.opts.loadSchema = async (uri) => resolveLocalSchema(uri, effectiveBaseDir);

      const validate = await ajv.compileAsync(schema);
      const docs = manifests || (manifest ? [manifest] : []);
      const results = [];
      for (const doc of docs) {
        const valid = validate(doc);
        const errors = (validate.errors || []).map(e => ({ 
          path: e.instancePath || e.dataPath || '', 
          msg: e.message,
          pointer: e.instancePath || e.dataPath || ''
        }));
        results.push({ valid, errors });
      }

      const took = Date.now() - started;
      return res.json({ ok: true, draft: '2020-12', results, took_ms: took });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.code || 'validate_failed', message: err.message });
    }
  });

  // Viewer-compatible graph endpoint
  app.post('/api/graph', async (req, res) => {
    const started = Date.now();
    try {
      const { manifest, manifests } = req.body || {};
      const docs = manifests || (manifest ? [manifest] : []);
      const nodes = [];
      const edges = [];
      const idFor = (m, idx) => m.id || m.name || m.urn || `manifest_${idx + 1}`;
      const byId = new Map();

      docs.forEach((m, i) => {
        const id = idFor(m, i);
        byId.set(id, m);
        nodes.push({ id, type: m.type || 'manifest' });
      });
      docs.forEach((m, i) => {
        const from = idFor(m, i);
        const deps = m.dependencies || m.relations || [];
        for (const dep of deps) {
          const to = typeof dep === 'string' ? dep : dep.id || dep.name || dep.urn || dep;
          edges.push({ source: from, target: to, type: 'depends-on' });
        }
      });

      const took = Date.now() - started;
      await recordPreviewLatency('graph', took);
      return res.json({ ok: true, nodes, edges, took_ms: took, summary: { nodeCount: nodes.length, edgeCount: edges.length } });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'preview_failed', message: err.message });
    }
  });

  app.post('/api/docs', async (req, res) => {
    const started = Date.now();
    try {
      const { manifest, manifests } = req.body || {};
      const docs = manifests || (manifest ? [manifest] : []);
      const sections = docs.map((m, i) => ({
        title: m.name || m.id || `Manifest ${i + 1}`,
        items: [
          { label: 'Type', value: m.type || 'n/a' },
          { label: 'Version', value: m.version || 'n/a' },
          { label: 'Description', value: m.description || '' },
          { label: 'Dependencies', value: (m.dependencies || []).length }
        ]
      }));

      const took = Date.now() - started;
      await recordPreviewLatency('docs', took);
      return res.json({ ok: true, sections, took_ms: took });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'preview_failed', message: err.message });
    }
  });

  return app;
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true }).catch(() => {});
}

async function recordPreviewLatency(kind, tookMs) {
  try {
    const dir = path.resolve(process.cwd(), 'artifacts/perf');
    await ensureDir(dir);
    const file = path.join(dir, 'ui-preview.jsonl');
    const line = JSON.stringify({ ts: new Date().toISOString(), kind, took_ms: tookMs });
    await fs.appendFile(file, line + '\n');
  } catch {
    // ignore
  }
}

export async function startAuthoringServer({ port = DEFAULT_PORT, baseDir = process.cwd() } = {}) {
  const app = createApp({ baseDir });
  const server = app.listen(port);
  return { app, server };
}

// Allow running directly
if (process.argv[1] && path.basename(process.argv[1]).includes('server.mjs')) {
  const portArg = process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT;
  startAuthoringServer({ port: portArg }).then(({ server }) => {
    // eslint-disable-next-line no-console
    console.log(`Authoring UI listening on http://localhost:${portArg}`);
  });
}
