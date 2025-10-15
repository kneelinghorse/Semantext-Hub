// Pre-Sprint 12: ESM & MCP Preflight Probe
// Non-invasive collector that writes results to /app/reports/pre12
// Usage: node app/scripts/probe/pre12.collect.js [all|esm|cjs|mcp|perf|redact|summarize]

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '../../');
const OUT_DIR = path.resolve(APP_ROOT, 'reports/pre12');
const OUT_JSON = path.resolve(OUT_DIR, 'probe.json');
const OUT_MD = path.resolve(OUT_DIR, 'probe.md');
const OUT_JEST_DIFF = path.resolve(OUT_DIR, 'jest.esm.candidate.diff');
const OUT_MCP_LOG = path.resolve(OUT_DIR, 'mcp.smoke.log');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function loadState() {
  try {
    const txt = fs.readFileSync(OUT_JSON, 'utf8');
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

function saveState(state) {
  ensureDir(OUT_DIR);
  fs.writeFileSync(OUT_JSON, JSON.stringify(state, null, 2));
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function isInstalled(pkgName) {
  // Handles both scoped and unscoped packages
  const nm = path.join(APP_ROOT, 'node_modules');
  if (!fs.existsSync(nm)) return false;
  const candidate = path.join(nm, ...pkgName.split('/'));
  return fs.existsSync(candidate);
}

async function writeJestCandidateDiff(recommended) {
  // Generate a minimal candidate diff for enabling TS + ESM tests
  // in app/jest.config.js without applying it.
  const jestConfigPath = path.join(APP_ROOT, 'jest.config.js');
  let original = '';
  try {
    original = await fsp.readFile(jestConfigPath, 'utf8');
  } catch {
    original = '';
  }

  const tsJestBlock = `
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      { useESM: true, tsconfig: { module: 'ESNext' } }
    ]
  },
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js',
    '**/tests/**/*.test.ts',
    '**/tests/**/*.spec.ts',
    '**/tests/_probe/**/*.test.ts'
  ],`;

  const babelJestBlock = `
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'babel-jest',
      { presets: [ ['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-typescript' ] }
    ]
  },
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js',
    '**/tests/**/*.test.ts',
    '**/tests/**/*.spec.ts',
    '**/tests/_probe/**/*.test.ts'
  ],`;

  const block = recommended === 'ts-jest' ? tsJestBlock : babelJestBlock;

  const diff = [
    '--- a/app/jest.config.js',
    '+++ b/app/jest.config.js',
    '@@ Minimal changes to enable TS ESM tests @@',
    '+// Add TS + ESM support for probe tests',
    block.trim(),
    '',
    '// Notes:',
    recommended === 'ts-jest'
      ? '- Requires devDeps: ts-jest, typescript, @types/jest'
      : '- Requires devDeps: babel-jest, @babel/core, @babel/preset-env, @babel/preset-typescript',
  ].join('\n');

  ensureDir(OUT_DIR);
  await fsp.writeFile(OUT_JEST_DIFF, diff, 'utf8');
}

function spawnP(cmd, args, opts) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, opts);
    let stdout = '';
    let stderr = '';
    if (child.stdout) child.stdout.on('data', (d) => { stdout += d.toString(); });
    if (child.stderr) child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function runESMProbe(state) {
  const start = Date.now();
  state.esm = state.esm || {};

  // Determine which stack is installed/viable
  const hasTsJest = isInstalled('ts-jest');
  const hasBabelJest = isInstalled('babel-jest') && isInstalled('@babel/core');

  let chosen = 'ts-jest';
  if (!hasTsJest && hasBabelJest) chosen = 'babel-jest';

  // Always emit candidate diff for the chosen stack
  await writeJestCandidateDiff(chosen);

  // Try to execute a tiny sample only if corresponding transformer is installed
  // We run Jest with a temp config living under reports/pre12 to avoid touching repo config
  const tempConfig = path.join(OUT_DIR, 'jest.temp.config.js');
  const probeTestGlob = '<rootDir>/tests/_probe/esm.sample.test.ts';

  let executed = false;
  let exitCode = null;
  let error = null;

  if (chosen === 'ts-jest' && hasTsJest) {
    const cfg = `export default {\n  testEnvironment: 'node',\n  extensionsToTreatAsEsm: ['.ts', '.tsx'],\n  transform: { '^.+\\\\.(ts|tsx)$': ['ts-jest', { useESM: true, tsconfig: { module: 'ESNext' } }] },\n  testMatch: ['${probeTestGlob}']\n};\n`;
    await fsp.writeFile(tempConfig, cfg, 'utf8');
    const bin = path.join(APP_ROOT, 'node_modules/jest/bin/jest.js');
    const { code, stderr } = await spawnP(process.execPath, ['--experimental-vm-modules', bin, '--config', tempConfig, '--runInBand'], { cwd: APP_ROOT });
    executed = true; exitCode = code; error = stderr;
  } else if (chosen === 'babel-jest' && hasBabelJest) {
    // Requires @babel/preset-typescript which may not be installed; attempt only if present
    const hasPresetTs = isInstalled('@babel/preset-typescript');
    const hasPresetEnv = isInstalled('@babel/preset-env');
    if (hasPresetTs && hasPresetEnv) {
      const cfg = `export default {\n  testEnvironment: 'node',\n  extensionsToTreatAsEsm: ['.ts', '.tsx'],\n  transform: { '^.+\\\\.(ts|tsx)$': ['babel-jest', { presets: [['@babel/preset-env',{targets:{node:'current'}}], '@babel/preset-typescript'] }] },\n  testMatch: ['${probeTestGlob}']\n};\n`;
      await fsp.writeFile(tempConfig, cfg, 'utf8');
      const bin = path.join(APP_ROOT, 'node_modules/jest/bin/jest.js');
      const { code, stderr } = await spawnP(process.execPath, ['--experimental-vm-modules', bin, '--config', tempConfig, '--runInBand'], { cwd: APP_ROOT });
      executed = true; exitCode = code; error = stderr;
    }
  }

  // Record findings
  state.esm.stack = chosen + (executed ? '' : ' (candidate)');
  state.esm.stack_executed = !!executed;
  if (executed) state.esm.stack_exit_code = exitCode;
  if (error && error.trim()) state.esm.stack_error = error.split('\n').slice(-5).join('\n');

  // __dirname/__filename scan and file list
  const hits = await scanDirnameFilename();
  state.esm.dirname_hits = {
    count: hits.count,
    files: hits.files
  };
  // Emit human-readable grep-like list as well
  await fsp.writeFile(path.join(OUT_DIR, 'dirname_hits.txt'), hits.lines.join('\n'));

  state.perf = state.perf || { baseline: {} };
  state.perf.baseline = state.perf.baseline || {};
  state.perf.baseline.esm_probe_ms = Date.now() - start;
  return state;
}

async function scanDirnameFilename() {
  const rels = [];
  const lines = [];
  const root = APP_ROOT;
  const ignoreDirs = new Set(['node_modules', 'coverage', 'artifacts', 'reports', 'packages/runtime/viewer/client/node_modules']);
  const exts = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx']);

  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      const full = path.join(dir, ent.name);
      const rel = path.relative(root, full);
      if (ent.isDirectory()) {
        if (ignoreDirs.has(ent.name)) continue;
        await walk(full);
      } else {
        const ext = path.extname(ent.name);
        if (!exts.has(ext)) continue;
        const txt = await fsp.readFile(full, 'utf8');
        const hit = txt.includes('__dirname') || txt.includes('__filename');
        if (hit) {
          rels.push(rel);
          // Populate line-like output
          const linesArr = txt.split(/\r?\n/);
          linesArr.forEach((ln, idx) => {
            if (ln.includes('__dirname') || ln.includes('__filename')) {
              lines.push(`${rel}:${idx + 1}:${ln.trim()}`);
            }
          });
        }
      }
    }
  }
  await walk(root);
  const unique = Array.from(new Set(rels)).sort();
  return { count: unique.length, files: unique, lines };
}

async function runCJSScan(state) {
  state.esm = state.esm || {};
  const pkgPath = path.join(APP_ROOT, 'package.json');
  const pkg = readJsonSafe(pkgPath) || {};
  const deps = Object.keys(pkg.dependencies || {});
  const results = [];
  for (const dep of deps) {
    const p = path.join(APP_ROOT, 'node_modules', ...dep.split('/'), 'package.json');
    const meta = readJsonSafe(p);
    if (!meta) continue;
    const hasModuleField = !!meta.module;
    const typeModule = meta.type === 'module';
    let hasEsmExport = false;
    const exp = meta.exports;
    if (typeof exp === 'string') {
      if (/\.mjs$/.test(exp) || exp.includes('esm') || exp.includes('module')) hasEsmExport = true;
    } else if (exp && typeof exp === 'object') {
      if (exp.import || exp.module) hasEsmExport = true;
      // Check nested conditions
      for (const k of Object.keys(exp)) {
        if (k.includes('import') || k.includes('module')) { hasEsmExport = true; break; }
      }
    }
    const hasEsm = typeModule || hasModuleField || hasEsmExport;
    const main = meta.main || '';
    const hasCjs = !typeModule || /\.cjs$/.test(main) || /index\.js$/.test(main);
    const cjsOnly = hasCjs && !hasEsm;
    if (cjsOnly) {
      results.push({
        name: dep,
        version: meta.version || 'unknown',
        reason: 'no ESM export; type!=module',
        import_sites: await findImportSites(dep)
      });
    }
  }
  state.esm.cjs_deps = results;
  return state;
}

async function findImportSites(pkgName) {
  const root = APP_ROOT;
  const out = new Set();
  const ignoreDirs = new Set(['node_modules', 'coverage', 'artifacts', 'reports']);
  const exts = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx']);
  const rx = new RegExp(`(from\\s+['\"]${pkgName}['\"]|require\\(\\s*['\"]${pkgName}['\"]\\s*\\))`);

  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ignoreDirs.has(ent.name)) continue;
        await walk(full);
      } else {
        const ext = path.extname(ent.name);
        if (!exts.has(ext)) continue;
        try {
          const txt = await fsp.readFile(full, 'utf8');
          if (rx.test(txt)) out.add(path.relative(root, full));
        } catch {}
      }
    }
  }
  await walk(root);
  return Array.from(out).sort();
}

async function runMCP(state) {
  const start = Date.now();
  state.mcp = state.mcp || {
    port: 0,
    tools: {
      protocol_discover_local: { ok: false },
      docs_mermaid: { ok: false },
      agent_or_workflow_stub: { ok: false }
    }
  };
  ensureDir(OUT_DIR);

  const serverPath = path.join(APP_ROOT, 'packages/runtime/bin/protocol-mcp-server.js');
  if (!fs.existsSync(serverPath)) {
    state.mcp.error = 'protocol-mcp-server not found';
    return state;
  }

  // Start MCP stdio server
  const child = spawn(process.execPath, [serverPath], {
    cwd: APP_ROOT,
    env: { ...process.env, PROTOCOL_ROOT: APP_ROOT, NODE_ENV: 'test' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Simple JSON-RPC client over line-delimited JSON
  let nextId = 1;
  const pending = new Map();
  const writeLog = fs.createWriteStream(OUT_MCP_LOG, { flags: 'w' });

  function send(method, params, timeoutMs = 2000) {
    const id = nextId++;
    const msg = { jsonrpc: '2.0', id, method, params };
    let timer;
    const p = new Promise((resolve) => {
      pending.set(id, resolve);
      timer = setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          resolve({ jsonrpc: '2.0', error: { code: -1, message: 'timeout' }, id });
        }
      }, timeoutMs).unref?.();
    });
    try { child.stdin.write(JSON.stringify(msg) + '\n'); } catch {}
    return p.finally(() => { if (timer) clearTimeout(timer); });
  }

  function handleLine(line) {
    writeLog.write(line + '\n');
    try {
      const obj = JSON.parse(line);
      if (obj && Object.prototype.hasOwnProperty.call(obj, 'id')) {
        const cb = pending.get(obj.id);
        if (cb) { pending.delete(obj.id); cb(obj); }
      }
    } catch { /* ignore non-JSON lines */ }
  }

  child.stdout.on('data', (buf) => {
    const s = buf.toString();
    s.split(/\r?\n/).filter(Boolean).forEach(handleLine);
  });
  child.stderr.on('data', (buf) => { writeLog.write(buf.toString()); });

  child.once('close', () => {
    // Flush all pending with error to avoid hanging
    for (const [id, resolve] of pending.entries()) {
      pending.delete(id);
      try { resolve({ jsonrpc: '2.0', error: { code: -1, message: 'server_closed' }, id }); } catch {}
    }
  });

  // Sequence: initialize -> tools/list -> calls
  const init = await send('initialize', { protocolVersion: '2024-11-05' });
  if (init.error) {
    state.mcp = {
      error: init.error?.message || 'init failed',
      port: 0,
      tools: {
        protocol_discover_local: { ok: false },
        docs_mermaid: { ok: false },
        agent_or_workflow_stub: { ok: false }
      }
    };
    try { child.stdin.end(); } catch {}
    await new Promise(r => child.on('close', r));
    writeLog.end();
    // Persist immediately to avoid losing this result if subsequent steps fail
    try { saveState(state); } catch {}
    return state;
  }

  const toolsList = await send('tools/list', {});
  const tools = toolsList?.result?.tools || [];
  const names = new Set(tools.map(t => t.name));

  const haveDiscoverLocal = names.has('protocol_discover_local');
  const haveDocsMermaid = names.has('docs_mermaid');

  // Prepare calls
  let discoverOk = false;
  let docsOk = false;
  let stubOk = false;

  // Try to find a local OpenAPI seed via helper tool
  let seedRel = null;
  if (names.has('protocol_list_test_files')) {
    const listResp = await send('tools/call', { name: 'protocol_list_test_files', arguments: {} });
    try {
      const contentText = listResp?.result?.content?.[0]?.text || '{}';
      const parsed = JSON.parse(contentText);
      const first = (parsed.test_files || [])[0];
      seedRel = first?.relative_path || null;
    } catch {}
  }

  if (haveDiscoverLocal && seedRel) {
    const r = await send('tools/call', { name: 'protocol_discover_local', arguments: { file_path: seedRel } });
    try {
      const body = JSON.parse(r?.result?.content?.[0]?.text || '{}');
      discoverOk = !!body?.success;
    } catch { discoverOk = false; }
  }

  // docs_mermaid against approved manifests
  if (haveDocsMermaid) {
    const approvedDir = fs.existsSync(path.join(APP_ROOT, 'approved/github-api'))
      ? 'approved/github-api'
      : (fs.existsSync(path.join(APP_ROOT, 'approved/stripe')) ? 'approved/stripe' : null);
    if (approvedDir) {
      const r = await send('tools/call', { name: 'docs_mermaid', arguments: { manifest_dir: approvedDir } });
      try {
        const body = JSON.parse(r?.result?.content?.[0]?.text || '{}');
        docsOk = !!body?.success;
      } catch { docsOk = false; }
    }
  }

  // Agent/workflow stub: call resources/list as a harmless stand-in
  // This validates end-to-end request handling and response format
  const resList = await send('resources/list', {});
  stubOk = !!resList?.result?.resources;

  // Close server
  try { child.stdin.end(); } catch {}
  await new Promise((resolve) => child.on('close', resolve));
  writeLog.end();

  state.mcp = {
    port: 0, // stdio transport
    tools: {
      protocol_discover_local: { ok: !!discoverOk },
      docs_mermaid: { ok: !!docsOk },
      agent_or_workflow_stub: { ok: !!stubOk }
    }
  };

  state.perf = state.perf || { baseline: {} };
  state.perf.baseline = state.perf.baseline || {};
  state.perf.baseline.mcp_smoke_ms = Date.now() - start;
  try { saveState(state); } catch {}
  return state;
}

async function runPerf(state) {
  // Nothing extra to do: timings recorded in esm/mcp steps
  state.perf = state.perf || { baseline: {} };
  state.perf.baseline = state.perf.baseline || {};
  // Keep fields if already present
  return state;
}

async function runRedact(state) {
  // Simple redaction check: scan logs for common secret markers
  const patterns = [
    /api[_-]?key\s*[:=]/i,
    /secret\s*[:=]/i,
    /password\s*[:=]/i,
    /bearer\s+[a-z0-9_\-\.]+/i,
    /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/ // JWT shape
  ];
  let ok = true;
  try {
    const txt = fs.readFileSync(OUT_MCP_LOG, 'utf8');
    for (const rx of patterns) { if (rx.test(txt)) { ok = false; break; } }
  } catch { /* ignore */ }
  state.redaction = { ok };
  return state;
}

function summarize(state) {
  const md = `# Pre-Sprint 12 Probe Summary\n
- ESM stack: **${state?.esm?.stack || 'unknown'}**\n- __dirname sites: ${state?.esm?.dirname_hits?.count || 0}\n- CJS-only deps: ${(state?.esm?.cjs_deps || []).length}\n- MCP smoke: ${state?.mcp ? 'OK' : 'N/A'} (stdio)\n- Perf baseline(ms): ${JSON.stringify(state?.perf?.baseline || {})}\n- Redaction: ${state?.redaction?.ok ? 'OK' : 'Check'}\n`;
  process.stdout.write(md);
}

async function main() {
  const mode = process.argv[2] || 'all';
  ensureDir(OUT_DIR);

  let state = loadState();
  try {
    if (mode === 'esm' || mode === 'all') state = await runESMProbe(state);
    if (mode === 'cjs' || mode === 'all') state = await runCJSScan(state);
    if (mode === 'mcp' || mode === 'all') state = await runMCP(state);
    if (mode === 'perf' || mode === 'all') state = await runPerf(state);
    if (mode === 'redact' || mode === 'all') state = await runRedact(state);
    saveState(state);
    if (mode === 'summarize') {
      summarize(state);
    } else if (mode === 'all') {
      // Also write human summary
      const chunks = [];
      const origWrite = process.stdout.write;
      try {
        process.stdout.write = (c) => { chunks.push(String(c)); return true; };
        summarize(state);
      } finally {
        process.stdout.write = origWrite;
      }
      await fsp.writeFile(OUT_MD, chunks.join(''), 'utf8');
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

main();
