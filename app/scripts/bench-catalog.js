/**
 * Quick micro-benchmarks for URNCatalogIndex operations.
 * Measures: URN lookup, tag query, dependency traversal.
 */
import { URNCatalogIndex } from '../src/catalog/index.js';

function hrtimeMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

function createArtifacts(count = 10000, depFactor = 0.1) {
  const artifacts = [];
  for (let i = 0; i < count; i++) {
    const urn = `urn:protocol:event:item.${i}:1.0.${i % 10}`;
    const deps = [];
    // add a few dependencies to earlier nodes to form a DAG
    if (i > 0) {
      const depCount = Math.min(3, Math.floor(depFactor * (i % 10)));
      for (let d = 1; d <= depCount; d++) {
        const target = Math.max(0, i - d * 3);
        deps.push(`urn:protocol:event:item.${target}:1.0.${target % 10}`);
      }
    }
    artifacts.push({
      urn,
      name: `item.${i}`,
      version: `1.0.${i % 10}`,
      namespace: 'events',
      type: 'event-protocol',
      manifest: `/tmp/${urn}.json`,
      dependencies: deps,
      metadata: {
        tags: [i % 2 === 0 ? 'even' : 'odd', i % 3 === 0 ? 'tri' : 'std'],
        governance: { classification: 'internal', owner: `team-${i % 25}`, pii: i % 7 === 0 }
      }
    });
  }
  return artifacts;
}

function percentile(arr, p) {
  const idx = Math.floor((p / 100) * arr.length);
  return arr[Math.min(arr.length - 1, Math.max(0, idx))];
}

async function main() {
  const catalog = new URNCatalogIndex();
  const artifacts = createArtifacts(10000);

  // Build index
  const t0 = hrtimeMs();
  for (const a of artifacts) catalog.add(a);
  const buildMs = hrtimeMs() - t0;

  // URN lookup benchmark (1k lookups)
  const lookups = [];
  for (let i = 0; i < 1000; i++) {
    const urn = artifacts[(i * 7) % artifacts.length].urn;
    const s = hrtimeMs();
    catalog.get(urn);
    lookups.push(hrtimeMs() - s);
  }

  // Tag query benchmark (even)
  const tqStart = hrtimeMs();
  const tagResults = catalog.findByTag('even');
  const tagMs = hrtimeMs() - tqStart;

  // Dependency traversal benchmark (DFS from a mid node)
  const midUrn = artifacts[7500].urn;
  const dtStart = hrtimeMs();
  const depTree = catalog.getDependencyTree(midUrn);
  const depMs = hrtimeMs() - dtStart;

  const lookupAvg = lookups.reduce((a, b) => a + b, 0) / lookups.length;
  const lookupP95 = percentile([...lookups].sort((a, b) => a - b), 95);

  const out = {
    build_index_ms: buildMs,
    urn_lookup_ms_avg: Number(lookupAvg.toFixed(3)),
    urn_lookup_ms_p95: lookupP95,
    tag_query_ms: tagMs,
    tag_results: tagResults.length,
    dependency_traversal_ms: depMs,
    dependency_tree_size: depTree.size
  };
  console.log(JSON.stringify(out));
}

main();

