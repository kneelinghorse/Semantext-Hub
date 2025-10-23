/**
 * Web Worker for parsing graph partitions
 * Offloads JSON parsing to a background thread
 */

self.onmessage = async (event) => {
  const { partUrl } = event?.data || {};
  if (!partUrl) {
    self.postMessage({ ok: false, error: 'Missing partition URL' });
    return;
  }

  const now = typeof self.performance !== 'undefined' && typeof self.performance.now === 'function'
    ? () => self.performance.now()
    : () => Date.now();

  const startedAt = now();

  try {
    const response = await fetch(partUrl, {
      credentials: 'same-origin',
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Partition fetch failed (${response.status})`);
    }

    // Parse manually to capture timing metrics.
    const text = await response.text();
    const data = JSON.parse(text);

    self.postMessage({
      ok: true,
      data,
      metrics: {
        fetchMs: +(now() - startedAt).toFixed(2)
      }
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
