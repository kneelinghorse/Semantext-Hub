# Mission S20.3-20251021: Workbench Scaling Proof

## Mission Summary
Successfully implemented partitioned graph rendering with worker parsing and idle scheduling for the workbench viewer to handle 10k-node catalogs.

## Deliverables Completed

### 1. Partitioning Logic
- **File**: `packages/runtime/viewer/graph/partition.mjs`
- **Functionality**: Partitions graphs into chunks of max 500 nodes, handles both {s,t} and {source,target} edge formats

### 2. Web Worker Parser
- **File**: `packages/runtime/viewer/graph/worker.js`
- **File**: `packages/runtime/viewer/public/graph/worker.js` (served statically)
- **Functionality**: Offloads JSON parsing to background thread

### 3. Client-Side Graph Loading
- **File**: `packages/runtime/viewer/client/src/lib/graph.js`
- **Functionality**: Lazy loading with worker offloading and idle scheduling support

### 4. Seed Generator
- **File**: `scripts/seed/generate-large-graph.mjs`
- **Output**: `artifacts/graph10k/graph.json` (10,000 nodes, 25,000 edges)

### 5. Partition Tests
- **File**: `tests/viewer/partition.spec.mjs`
- **Status**: All tests passing ✓

### 6. Performance Measurement Scripts
- **File**: `scripts/perf/measure-viewer.mjs` - Playwright+CDP TTI + memory measurement
- **File**: `scripts/perf/preview-benchmark.mjs` - Authoring preview p95 measurement

### 7. API Updates
- **File**: `packages/runtime/viewer/routes/api.mjs`
  - Added partitioning support for graphs >1000 nodes
  - Added `/api/graph/seed/:seedName` endpoint
  - Updated chunking to use 500-node chunks for large graphs
  - Handles both edge formats

### 8. Client Updates
- **File**: `packages/runtime/viewer/client/src/App.jsx`
  - Added seed query parameter support
  - Added graphReady timing measurement
  - Sets `window.__GRAPH_READY__` flag for performance testing

## Success Criteria Status

### ✅ Partitioning Tests
- ≥20 parts with ≤500 nodes each: **PASSED** (tests passing)

### ⏳ Viewer Performance
- Needs runtime server + Playwright measurement
- Target: TTI ≤ 1.2s, memory < 200MB

### ⏳ Authoring Preview Budget
- Needs runtime server + benchmark script
- Target: p95 ≤ 500ms over 50 requests

## Technical Implementation

### Partitioning Strategy
1. **Large graphs (>1000 nodes)**: Use partitioning algorithm with 500-node chunks
2. **Small graphs (≤1000 nodes)**: Use simple array slicing with 50-node chunks
3. **Edge filtering**: Supports both `{s, t}` and `{source, target}` formats

### Worker Architecture
- Main thread: UI rendering and user interaction
- Worker thread: JSON parsing and network requests
- Idle scheduling: Falls back to `requestIdleCallback` for older browsers

### API Endpoints
- `POST /api/graph` - Generate graph from manifests
- `GET /api/graph/seed/:seedName` - Load graph from seed file
- `GET /api/graph/part/:id` - Retrieve graph partition

## Next Steps

To complete the mission and verify all success criteria:

1. **Start the viewer server**:
   ```bash
   cd packages/runtime/viewer
   npm start
   ```

2. **Build the client** (if needed):
   ```bash
   cd packages/runtime/viewer/client
   npm run build
   ```

3. **Run performance measurements**:
   ```bash
   npx playwright install chromium
   node scripts/perf/measure-viewer.mjs
   node scripts/perf/preview-benchmark.mjs
   ```

4. **Verify results**:
   - Check `artifacts/perf/viewer-tti.jsonl` for TTI ≤ 1200ms
   - Check `artifacts/perf/viewer-mem.jsonl` for memory < 200MB
   - Check `artifacts/perf/ui-preview.jsonl` for p95 ≤ 500ms

## Files Modified/Created

### Created
- `packages/runtime/viewer/graph/partition.mjs`
- `packages/runtime/viewer/graph/worker.js`
- `packages/runtime/viewer/public/graph/worker.js`
- `packages/runtime/viewer/client/src/lib/graph.js`
- `scripts/seed/generate-large-graph.mjs`
- `scripts/perf/measure-viewer.mjs`
- `scripts/perf/preview-benchmark.mjs`
- `tests/viewer/partition.spec.mjs`
- `artifacts/graph10k/graph.json`

### Modified
- `packages/runtime/viewer/routes/api.mjs` - Added partitioning logic and seed endpoint
- `packages/runtime/viewer/client/src/App.jsx` - Added seed support and timing

## Notes

- Partitioning uses naive bucketing strategy (good enough for performance testing)
- Edge format compatibility handled throughout the pipeline
- Worker path configured for static serving from public directory
- Performance measurement uses Playwright with CDP for accurate metrics

