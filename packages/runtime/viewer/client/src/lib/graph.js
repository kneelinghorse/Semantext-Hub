/**
 * Graph loading utilities with partition-aware lazy fetching, worker offloading,
 * and idle scheduling safeguards for large catalogs.
 */

const WORKER_SCRIPT_URL = '/graph/worker.js';
const DEFAULT_MAX_CONCURRENT = 4;
const WORKER_TIMEOUT_MS = 15000;
const isDevEnv = typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production';

function supportsWorker() {
  return typeof Worker !== 'undefined';
}

function loadPartitionWorker(partUrl) {
  return new Promise((resolve, reject) => {
    if (!supportsWorker()) {
      reject(new Error('Web Workers not supported'));
      return;
    }

    let timeoutId;
    let terminated = false;
    const worker = new Worker(WORKER_SCRIPT_URL);

    const cleanup = () => {
      if (terminated) return;
      terminated = true;
      if (typeof timeoutId === 'number') {
        clearTimeout(timeoutId);
      }
      worker.terminate();
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Worker timed out fetching ${partUrl}`));
    }, WORKER_TIMEOUT_MS);

    worker.onmessage = (ev) => {
      cleanup();
      if (ev.data?.ok) {
        if (isDevEnv && ev.data.metrics) {
          console.log('[graph] worker metrics', {
            partUrl,
            fetchMs: ev.data.metrics.fetchMs
          });
        }
        resolve(ev.data.data);
      } else {
        reject(new Error(ev.data?.error || 'Worker failed to parse partition'));
      }
    };

    worker.onerror = (err) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    worker.postMessage({ partUrl });
  });
}

function loadPartitionIdle(partUrl, { signal, highPriority = false } = {}) {
  return new Promise((resolve, reject) => {
    const executeFetch = () => {
      fetch(partUrl, { signal })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Failed to fetch partition ${partUrl} (${response.status})`);
          }
          return response.json();
        })
        .then(resolve)
        .catch(reject);
    };

    if (typeof window === 'undefined') {
      executeFetch();
      return;
    }

    const idleCallbackAvailable = typeof window.requestIdleCallback === 'function';
    let idleHandle = null;
    let abortHandler = null;

    const schedule = () => {
      if (!idleCallbackAvailable || highPriority) {
        const timeout = highPriority ? 0 : 16;
        const timeoutId = setTimeout(() => {
          executeFetch();
        }, timeout);

        if (signal) {
          abortHandler = () => {
            clearTimeout(timeoutId);
            reject(new DOMException('Aborted', 'AbortError'));
          };
          signal.addEventListener('abort', abortHandler, { once: true });
        }
        return;
      }

      idleHandle = window.requestIdleCallback(
        () => {
          executeFetch();
        },
        { timeout: 200 }
      );

      if (signal) {
        abortHandler = () => {
          if (idleHandle !== null && typeof window.cancelIdleCallback === 'function') {
            window.cancelIdleCallback(idleHandle);
          }
          reject(new DOMException('Aborted', 'AbortError'));
        };
        signal.addEventListener('abort', abortHandler, { once: true });
      }
    };

    schedule();
  });
}

async function loadPartition(partDescriptor, options = {}) {
  const { useWorker = true, signal, highPriority = false } = options;
  if (!partDescriptor?.url) {
    throw new Error('Partition descriptor missing url');
  }

  if (useWorker && supportsWorker()) {
    try {
      return await loadPartitionWorker(partDescriptor.url);
    } catch (err) {
      // Fallback to idle fetch on worker failure.
      if (isDevEnv) {
        console.warn('Worker load failed, falling back to idle loader:', err);
      }
    }
  }

  return loadPartitionIdle(partDescriptor.url, { signal, highPriority });
}

export async function loadGraphLazy(graphIndex, options = {}) {
  const {
    useWorker = true,
    maxConcurrent = DEFAULT_MAX_CONCURRENT,
    signal,
    onPartLoaded
  } = options;

  const parts = Array.isArray(graphIndex?.parts) ? graphIndex.parts : [];
  if (!parts.length) {
    return {
      chunks: [],
      nodes: [],
      edges: [],
      index: graphIndex?.index ?? null
    };
  }

  const concurrency = Math.max(1, Number(maxConcurrent) || DEFAULT_MAX_CONCURRENT);
  const chunkById = new Map();
  const orderedIds = [];

  const firstPart = parts[0];
  const primaryChunk = await loadPartition(firstPart, {
    useWorker,
    signal,
    highPriority: true
  });

  chunkById.set(firstPart.id, primaryChunk);
  orderedIds.push(firstPart.id);
  onPartLoaded?.({ part: firstPart, chunk: primaryChunk, index: 0 });

  const remaining = parts.slice(1);

  for (let i = 0; i < remaining.length; i += concurrency) {
    const batch = remaining.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (part) => {
        const chunk = await loadPartition(part, { useWorker, signal });
        return { part, chunk };
      })
    );

    results.forEach(({ part, chunk }) => {
      chunkById.set(part.id, chunk);
      orderedIds.push(part.id);
      const idx = parts.findIndex((p) => p.id === part.id);
      onPartLoaded?.({ part, chunk, index: idx });
    });

    if (signal?.aborted) {
      break;
    }
  }

  const orderedChunks = parts
    .map((part) => ({
      part,
      chunk: chunkById.get(part.id)
    }))
    .filter((entry) => Boolean(entry.chunk));

  const nodes = [];
  const edges = [];

  for (const { chunk } of orderedChunks) {
    if (Array.isArray(chunk.nodes)) {
      nodes.push(...chunk.nodes);
    }
    if (Array.isArray(chunk.edges)) {
      edges.push(...chunk.edges);
    }
  }

  return {
    chunks: orderedChunks,
    nodes,
    edges,
    index: graphIndex?.index ?? null
  };
}

async function fetchGraphIndex({ manifests, seed, signal }) {
  if (seed) {
    const encodedSeed = encodeURIComponent(seed);
    const staticUrl = `/graph/seeds/${encodedSeed}/index.json`;

    if (typeof window !== 'undefined') {
      console.log('[graph] fetchGraphIndex requesting seed', seed, { staticUrl });
    }

    try {
      const staticRes = await fetch(staticUrl, { signal, cache: 'force-cache' });
      if (staticRes.ok) {
        if (typeof window !== 'undefined') {
          console.log('[graph] fetchGraphIndex seed served from static assets');
        }
        return staticRes.json();
      }
      if (typeof window !== 'undefined') {
        console.warn('[graph] static seed fetch failed', staticRes.status);
      }
    } catch (err) {
      if (typeof window !== 'undefined') {
        console.warn('[graph] static seed fetch error', err);
      }
    }

    const apiUrl = `/api/graph/seed/${encodedSeed}`;
    const res = await fetch(apiUrl, { signal });
    if (typeof window !== 'undefined') {
      console.log('[graph] fetchGraphIndex seed status', res.status);
    }
    if (!res.ok) {
      throw new Error(`Seed graph request failed (${res.status})`);
    }
    return res.json();
  }

  if (typeof window !== 'undefined') {
    console.log('[graph] fetchGraphIndex requesting manifests', manifests.length);
  }
  const res = await fetch('/api/graph', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ manifests }),
    signal
  });
  if (typeof window !== 'undefined') {
    console.log('[graph] fetchGraphIndex manifest status', res.status);
  }

  if (!res.ok) {
    throw new Error(`Graph index request failed (${res.status})`);
  }

  return res.json();
}

function buildMetadata(graphIndex, aggregate) {
  const index = graphIndex?.index ?? {};
  const partitionStats = index.partition ?? null;
  return {
    nodeCount: index.node_count ?? aggregate.nodes.length,
    edgeCount: index.edge_count ?? aggregate.edges.length,
    depth: index.depth ?? 0,
    partition: partitionStats
  };
}

export async function getGraph(manifests = [], options = {}) {
  const {
    seed,
    useWorker = true,
    maxConcurrent = DEFAULT_MAX_CONCURRENT,
    signal,
    onIndex,
    onPartLoaded
  } = options;

  if (typeof window !== 'undefined') {
    console.log('[graph] loader.getGraph init', {
      seed,
      manifestCount: manifests.length,
      useWorker,
      maxConcurrent
    });
  }

  const graphIndex = await fetchGraphIndex({ manifests, seed, signal });
  if (typeof window !== 'undefined') {
    console.log('[graph] loader.getGraph index', {
      parts: graphIndex?.parts?.length ?? 0,
      nodeCount: graphIndex?.index?.node_count ?? null
    });
  }
  onIndex?.(graphIndex);

  const aggregate = await loadGraphLazy(graphIndex, {
    useWorker,
    maxConcurrent,
    signal,
    onPartLoaded
  });

  const metadata = buildMetadata(graphIndex, aggregate);
  if (typeof window !== 'undefined') {
    console.log('[graph] loader.getGraph complete', {
      nodes: aggregate.nodes.length,
      edges: aggregate.edges.length,
      parts: aggregate.chunks.length
    });
  }

  return {
    source: seed ? 'seed' : 'live',
    index: graphIndex.index ?? null,
    parts: graphIndex.parts ?? [],
    chunks: aggregate.chunks,
    nodes: aggregate.nodes,
    edges: aggregate.edges,
    metadata
  };
}
