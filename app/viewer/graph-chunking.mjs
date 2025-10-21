/**
 * Minimal viewer-side graph chunking helpers.
 * Designed for browser environments; pass a fetch implementation if needed.
 */

export async function loadGraphIndex(baseUrl, fetchFn = (typeof fetch !== 'undefined' ? fetch : null)) {
  if (!fetchFn) throw new Error('fetch implementation required');
  const url = joinUrl(baseUrl, 'graph.index.json');
  const res = await fetchFn(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Failed to load index: ${res.status}`);
  return res.json();
}

export async function loadGraphPart(baseUrl, partFile, fetchFn = (typeof fetch !== 'undefined' ? fetch : null)) {
  if (!fetchFn) throw new Error('fetch implementation required');
  const url = joinUrl(baseUrl, partFile);
  const res = await fetchFn(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Failed to load part ${partFile}: ${res.status}`);
  const data = await res.json();
  return { nodes: data.nodes || [], edges: data.edges || [], summary: data.summary || null };
}

export class LazyGraphLoader {
  constructor(baseUrl, index) {
    this.baseUrl = baseUrl;
    this.index = index;
    this.cache = new Map();
  }

  async prefetch(n = 1, fetchFn) {
    const start = 1;
    const end = Math.min(this.index.parts.length, start + n - 1);
    for (let i = start; i <= end; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await this.loadPart(i, fetchFn);
    }
  }

  async loadPart(partNumber, fetchFn = (typeof fetch !== 'undefined' ? fetch : null)) {
    if (!fetchFn) throw new Error('fetch implementation required');
    if (this.cache.has(partNumber)) return this.cache.get(partNumber);
    const descriptor = this.index.parts[partNumber - 1];
    if (!descriptor) throw new Error(`Part not found: ${partNumber}`);
    const result = await loadGraphPart(this.baseUrl, descriptor.file, fetchFn);
    this.cache.set(partNumber, result);
    return result;
  }
}

function joinUrl(base, file) {
  if (!base.endsWith('/')) return `${base}/${file}`;
  return `${base}${file}`;
}

export default {
  loadGraphIndex,
  loadGraphPart,
  LazyGraphLoader,
};

