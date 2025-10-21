#!/usr/bin/env node
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true }).catch(() => {});
}

async function readJsonSafe(p) {
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mdEscape(text) {
  return String(text ?? '').replace(/\|/g, '\\|');
}

function slugify(h) {
  return String(h)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function collectAdapters(root = process.cwd()) {
  const adaptersDir = path.resolve(root, 'app/adapters');
  const entries = await fs.readdir(adaptersDir, { withFileTypes: true });
  const adapters = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(adaptersDir, ent.name);
    const pkg = await readJsonSafe(path.join(dir, 'package.json'));
    const readmePath = path.join(dir, 'README.md');
    const mapPath = path.join(dir, 'src', 'schema.map.json');
    const mapJson = await readJsonSafe(mapPath);
    const hasReadme = fssync.existsSync(readmePath);
    if (!pkg || !hasReadme) continue;
    const readme = await fs.readFile(readmePath, 'utf8');
    adapters.push({
      id: ent.name,
      name: pkg.name || ent.name,
      version: pkg.version || '0.0.0',
      dir,
      readmePath,
      readme,
      mapPath,
      mapJson,
    });
  }
  return adapters;
}

function renderCookbook({ adapters }) {
  const lines = [];
  lines.push('# Adapter Cookbook');
  lines.push('');
  lines.push('Practical mappings and tips for common sources (OpenAPI, AsyncAPI, Postgres).');
  lines.push('');
  lines.push('## Adapter Versions');
  lines.push('');
  lines.push('| Adapter | Version |');
  lines.push('|---|---|');
  for (const a of adapters) {
    lines.push(`| ${mdEscape(a.name)} | ${mdEscape(a.version)} |`);
  }
  lines.push('');
  lines.push('## Generated Mapping Tables');
  lines.push('');
  for (const a of adapters) {
    lines.push(`### ${a.id}`);
    if (a.mapJson && Array.isArray(a.mapJson.mappings) && a.mapJson.mappings.length) {
      lines.push('');
      lines.push('| From JSONPath | To JSONPath | Description |');
      lines.push('|---|---|---|');
      for (const m of a.mapJson.mappings) {
        lines.push(`| ${mdEscape(m.from)} | ${mdEscape(m.to)} | ${mdEscape(m.description)} |`);
      }
      lines.push('');
    } else {
      lines.push('No mapping table found. See adapter README for guidance.');
      lines.push('');
    }
  }
  lines.push('## Troubleshooting');
  lines.push('');
  lines.push('- Ensure your `schema.map.json` aligns with catalog primitives.');
  lines.push('- Validate manifests with the Authoring UI before committing.');
  lines.push('- Keep adapter versions in sync with this cookbook.');
  lines.push('');
  return lines.join('\n');
}

function renderGuideV2() {
  const lines = [];
  lines.push('# Authoring Guide v2');
  lines.push('');
  lines.push('This guide explains how to author protocol manifests, validate them (JSON Schema draft 2020-12), and tie them into WSAP.');
  lines.push('');
  lines.push('## Manifests');
  lines.push('');
  lines.push('- Keep manifests small and composable.');
  lines.push('- Use stable URNs and declare dependencies explicitly.');
  lines.push('- Place shared defs in separate files and reference with $ref.');
  lines.push('');
  lines.push('## Validation');
  lines.push('');
  lines.push('- Draft: 2020-12');
  lines.push('- Local $ref only (no network fetch in UI).');
  lines.push('- Try the Authoring UI endpoint: `POST /validate` with `schema` + `manifest(s)`.');
  lines.push('');
  lines.push('## WSAP Tie-in');
  lines.push('');
  lines.push('See WSAP overview: `app/docs/wsap/v2-readme.md`. Ensure generated artifacts and IDs align with WSAP seeds.');
  lines.push('');
  lines.push('## Links');
  lines.push('');
  lines.push('- Cookbook: `app/docs/adapters/cookbook.md`');
  lines.push('');
  return lines.join('\n');
}

function extractLinks(markdown) {
  const re = /\[[^\]]+\]\(([^)]+)\)/g;
  const links = [];
  let m;
  while ((m = re.exec(markdown))) {
    links.push(m[1]);
  }
  return links;
}

function extractHeadings(markdown) {
  const lines = markdown.split(/\r?\n/);
  const headings = new Set();
  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      headings.add(slugify(m[2]));
    }
  }
  return headings;
}

function checkInternalLinks({ filePath, content, root }) {
  const broken = [];
  const links = extractLinks(content).filter((l) => !/^https?:\/\//i.test(l));
  const headings = extractHeadings(content);
  for (const link of links) {
    const [p, hash] = link.split('#');
    const target = p.startsWith('app/') || p.startsWith('/app/')
      ? path.resolve(root, p.replace(/^\//, ''))
      : path.resolve(path.dirname(filePath), p);
    if (!fssync.existsSync(target)) {
      broken.push({ link, reason: 'missing_file' });
      continue;
    }
    if (hash) {
      // If link points within same file, check current headings
      if (path.resolve(target) === path.resolve(filePath)) {
        if (!headings.has(slugify(hash))) {
          broken.push({ link, reason: 'missing_anchor' });
        }
      } else {
        const md = fssync.readFileSync(target, 'utf8');
        const h = extractHeadings(md);
        if (!h.has(slugify(hash))) {
          broken.push({ link, reason: 'missing_anchor' });
        }
      }
    }
  }
  return { broken, total: links.length };
}

async function main() {
  const root = process.cwd();
  const outGuide = path.resolve(root, 'app/docs/authoring/guide-v2.md');
  const outCook = path.resolve(root, 'app/docs/adapters/cookbook.md');
  const reportDir = path.resolve(root, 'artifacts/docs');

  await ensureDir(path.dirname(outGuide));
  await ensureDir(path.dirname(outCook));
  await ensureDir(reportDir);

  const adapters = await collectAdapters(root);

  const guide = renderGuideV2();
  const cookbook = renderCookbook({ adapters });

  await fs.writeFile(outGuide, guide, 'utf8');
  await fs.writeFile(outCook, cookbook, 'utf8');

  const linkChecks = [];
  linkChecks.push({ file: outGuide, ...checkInternalLinks({ filePath: outGuide, content: guide, root }) });
  linkChecks.push({ file: outCook, ...checkInternalLinks({ filePath: outCook, content: cookbook, root }) });

  const broken = linkChecks.flatMap((r) => r.broken.map((b) => ({ file: r.file, ...b })));

  const report = {
    ts: new Date().toISOString(),
    ok: broken.length === 0,
    generated_files: [
      path.relative(root, outGuide),
      path.relative(root, outCook),
    ],
    adapters: adapters.map((a) => ({ id: a.id, name: a.name, version: a.version })),
    link_check: {
      broken,
      total: linkChecks.reduce((sum, r) => sum + r.total, 0),
    },
  };

  await fs.writeFile(path.join(reportDir, 'build-report.json'), JSON.stringify(report, null, 2));

  if (!report.ok) {
    console.error('Docs build reported issues:', report.link_check.broken);
    process.exitCode = 1;
  } else {
    // eslint-disable-next-line no-console
    console.log('Docs built successfully:', report.generated_files.join(', '));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

