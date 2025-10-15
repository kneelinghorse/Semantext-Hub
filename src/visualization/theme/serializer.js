import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const DEFAULT_THEME_ID = 'light';

function createValidator(schemaPath) {
  const schemaContents = fs.readFileSync(schemaPath, 'utf8');
  const schema = JSON.parse(schemaContents);
  const ajv = new Ajv({
    allErrors: true,
    strict: false
  });
  addFormats(ajv);
  return ajv.compile(schema);
}

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function getPathSegments(reference) {
  return reference
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function resolveReference(reference, context) {
  const segments = getPathSegments(reference);
  let current = context;
  for (const segment of segments) {
    if (current && Object.prototype.hasOwnProperty.call(current, segment)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function resolvePlaceholders(value, context) {
  if (Array.isArray(value)) {
    return value.map((entry) => resolvePlaceholders(entry, context));
  }
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = resolvePlaceholders(entry, context);
    }
    return result;
  }

  if (typeof value === 'string') {
    const match = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
    if (match) {
      const resolved = resolveReference(match[1], context);
      if (resolved === undefined) {
        throw new Error(`Unknown theme token reference "${match[1]}"`);
      }
      return resolved;
    }
    return value;
  }

  return value;
}

function styleObjectToString(style) {
  return Object.entries(style)
    .map(([key, val]) => `${key}=${val}`)
    .join(';');
}

export function createThemeService(options = {}) {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const root = options.root ?? path.resolve(moduleDir, '../../..');
  const configDir = path.join(root, 'config');
  const themesDir = path.join(configDir, 'themes');
  const schemaPath = path.join(configDir, 'theme-style-schema.json');
  const activePath = path.join(themesDir, 'active.json');

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Theme schema not found at ${schemaPath}`);
  }

  const validateTheme = createValidator(schemaPath);
  const themeCache = new Map();

  function readJson(filePath) {
    const contents = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(contents);
  }

  function ensureThemeExists(themeId) {
    const themePath = path.join(themesDir, `${themeId}.json`);
    if (!fs.existsSync(themePath)) {
      throw new Error(`Theme "${themeId}" not found under ${themesDir}`);
    }
    return themePath;
  }

  function loadTheme(themeId) {
    if (themeCache.has(themeId)) {
      return themeCache.get(themeId);
    }

    const themePath = ensureThemeExists(themeId);
    const raw = readJson(themePath);

    const valid = validateTheme(raw);
    if (!valid) {
      const details = (validateTheme.errors || []).map((entry) => `${entry.instancePath || '/'} ${entry.message ?? ''}`.trim());
      throw new Error(`Theme "${themeId}" failed schema validation: ${details.join('; ')}`);
    }

    const resolved = resolvePlaceholders(raw, raw);
    const theme = {
      id: raw.id,
      name: raw.name,
      description: raw.description ?? '',
      metadata: raw.metadata ?? {},
      palette: resolved.palette ?? {},
      drawio: resolved.drawio,
      cytoscape: resolved.cytoscape,
      sourcePath: themePath
    };

    themeCache.set(themeId, theme);
    return theme;
  }

  function listThemes() {
    if (!fs.existsSync(themesDir)) {
      return [];
    }
    const files = fs.readdirSync(themesDir);
    return files
      .filter((file) => file.endsWith('.json'))
      .map((file) => {
        const themeId = path.basename(file, '.json');
        try {
          const theme = loadTheme(themeId);
          return {
            id: theme.id,
            name: theme.name,
            description: theme.description
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  function getActiveThemeId() {
    try {
      const payload = readJson(activePath);
      if (payload && typeof payload.id === 'string') {
        ensureThemeExists(payload.id);
        return payload.id;
      }
    } catch {
      // Fall back to default.
    }
    return DEFAULT_THEME_ID;
  }

  function setActiveThemeId(themeId) {
    ensureThemeExists(themeId);
    const payload = {
      id: themeId,
      updatedAt: new Date().toISOString()
    };
    fs.mkdirSync(themesDir, { recursive: true });
    fs.writeFileSync(activePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return payload;
  }

  function createDrawioResolvers(theme) {
    const drawio = theme.drawio ?? {};
    const defaults = drawio.defaults ?? { node: { width: 180, height: 80, style: {} }, edge: { style: {} } };
    const nodeTypes = drawio.nodeTypes ?? {};
    const domains = drawio.domains ?? {};
    const edgeTypes = drawio.edgeTypes ?? {};

    function resolveNodeStyle(node) {
      const base = defaults.node ?? { width: 180, height: 80, style: {} };
      const typeStyle = node.type && nodeTypes[node.type]?.style ? nodeTypes[node.type].style : {};
      const domainStyle = node.domain && domains[node.domain]?.style ? domains[node.domain].style : {};
      const mergedStyle = {
        ...(base.style ?? {}),
        ...typeStyle,
        ...domainStyle,
        ...(node.style ?? {})
      };
      return {
        width: node.size?.width ?? base.width ?? 180,
        height: node.size?.height ?? base.height ?? 80,
        style: mergedStyle
      };
    }

    function resolveEdgeStyle(edge) {
      const base = defaults.edge?.style ?? {};
      const typeStyle = edge.type && edgeTypes[edge.type]?.style ? edgeTypes[edge.type].style : {};
      return {
        style: {
          ...base,
          ...typeStyle,
          ...(edge.style ?? {})
        }
      };
    }

    return {
      resolveNodeStyle,
      resolveEdgeStyle,
      hasNodeType: (nodeType) => Boolean(nodeTypes[nodeType]),
      hasDomain: (domainKey) => Boolean(domains[domainKey]),
      hasEdgeType: (edgeType) => Boolean(edgeTypes[edgeType])
    };
  }

  function createCytoscapeTheme(theme) {
    const cytoscape = theme.cytoscape ?? {};
    const defaults = cytoscape.defaults ?? { node: { style: {} }, edge: { style: {} }, layout: {} };
    const nodeTypes = cytoscape.nodeTypes ?? {};
    const domains = cytoscape.domains ?? {};
    const edgeTypes = cytoscape.edgeTypes ?? {};

    const baseLayout = {
      ...(defaults.layout ?? {})
    };

    const style = [];
    if (defaults.node?.style) {
      style.push({
        selector: 'node',
        style: clone(defaults.node.style)
      });
    }

    for (const [type, entry] of Object.entries(nodeTypes)) {
      style.push({
        selector: `node[type = "${type}"]`,
        style: clone(entry.style ?? {})
      });
    }

    for (const [domain, entry] of Object.entries(domains)) {
      style.push({
        selector: `node[domain = "${domain}"]`,
        style: clone(entry.style ?? {})
      });
    }

    if (defaults.edge?.style) {
      style.push({
        selector: 'edge',
        style: clone(defaults.edge.style)
      });
    }

    for (const [edgeType, entry] of Object.entries(edgeTypes)) {
      style.push({
        selector: `edge[type = "${edgeType}"]`,
        style: clone(entry.style ?? {})
      });
    }

    return {
      style,
      layout: baseLayout,
      hasNodeType: (nodeType) => Boolean(nodeTypes[nodeType]),
      hasDomain: (domainKey) => Boolean(domains[domainKey]),
      hasEdgeType: (edgeType) => Boolean(edgeTypes[edgeType])
    };
  }

  function getTheme(themeId = getActiveThemeId()) {
    return loadTheme(themeId);
  }

  function getDrawioTheme(themeId) {
    const theme = getTheme(themeId);
    return createDrawioResolvers(theme);
  }

  function getCytoscapeTheme(themeId) {
    const theme = getTheme(themeId);
    return createCytoscapeTheme(theme);
  }

  return {
    listThemes,
    getTheme,
    getActiveThemeId,
    setActiveThemeId,
    getDrawioTheme,
    getCytoscapeTheme,
    styleObjectToString,
    root,
    themesDir,
    activePath
  };
}

const defaultService = createThemeService();

export const {
  listThemes,
  getTheme,
  getActiveThemeId,
  setActiveThemeId,
  getDrawioTheme,
  getCytoscapeTheme
} = defaultService;

export { styleObjectToString };

export default {
  listThemes,
  getTheme,
  getActiveThemeId,
  setActiveThemeId,
  getDrawioTheme,
  getCytoscapeTheme,
  styleObjectToString,
  createThemeService
};
