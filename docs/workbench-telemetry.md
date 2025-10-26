# Workbench Telemetry Narrative

## Overview

OSSP-AGI's Protocol Discovery Workbench operates on a principle of **truthful telemetry**: every metric, every performance gate, and every dashboard reflects live operational data—never seeded mocks, never placeholder numbers.

This document explains how telemetry flows through the workbench and how guardrails ensure manifests remain trustworthy across the import → validate → visualize → document lifecycle.

---

## The Telemetry Story

### Data Flow Architecture

```
┌─────────────────┐
│  WSAP Pipeline  │  (Workbench Spec Analysis Pipeline)
│  Discovery Runs │  - OpenAPI imports
│  Registry Ops   │  - AsyncAPI processing
│  Validation     │  - Postgres schema reads
└────────┬────────┘
         │ writes performance metrics
         ▼
┌──────────────────────────────┐
│  artifacts/perf/latest.jsonl │  Live JSONL telemetry
│  artifacts/perf/ui-preview.jsonl │  (no seeding, no mocks)
└────────┬─────────────────────┘
         │
         ├──► CLI Reports (perf:report)
         │    • p50/p95/p99 latency
         │    • Budget compliance
         │    • Exit codes on violations
         │
         ├──► CI Gates (perf-budget.js)
         │    • Hard-fail on missing logs
         │    • File age/freshness checks
         │    • Live p95 in summaries
         │
         └──► Dashboards & Monitoring
              • Percentile trends over time
              • Discovery vs MCP latency
              • Registry operation timing
```

### Truth Guarantees

1. **No Mock Data**: Sprint 22.1 removed `seedMockPerfData()` entirely. Metrics come from real operations.

2. **Fail-Fast on Staleness**: `collectWorkspacePerfMetrics()` throws when logs are missing or outdated.

3. **Budget Enforcement**: CI gates validate file age (<24h), content freshness, and performance thresholds.

4. **Audit Trail**: Every WSAP run appends timestamped JSONL entries with operation context.

---

## Key Components

### 1. Metrics Collection (`collectWorkspacePerfMetrics`)

**Location**: `cli/commands/perf-report.js`, `scripts/ci/perf-budget.js`

**Behavior**:
- Reads `artifacts/perf/latest.jsonl` and `ui-preview.jsonl`
- Parses JSONL entries with `duration_ms`, `operation`, and `timestamp` fields
- Computes percentiles (p50/p95/p99) for discovery and MCP operations
- **Throws on missing files or empty logs** (no fallback to seeded data)

**Example Entry**:
```json
{
  "timestamp": "2025-10-24T21:00:00.000Z",
  "operation": "discover_openapi",
  "duration_ms": 847,
  "source": "https://api.stripe.com/v1/openapi.json",
  "manifest_urn": "urn:proto:api:stripe@2023-10-16"
}
```

### 2. CLI Reporting (`ossp perf:report`)

**Command**: `npm run cli -- perf:report [--format table|json]`

**Outputs**:
- **Table mode**: Human-readable percentile table with budget status
- **JSON mode**: Machine-readable metrics for automation
- **Exit codes**: `0` on pass, `1` on budget violations

**Example Output**:
```
Performance Report
==================
Discovery Operations (OpenAPI/AsyncAPI/Postgres):
  p50: 425ms
  p95: 891ms
  p99: 1247ms
  Budget (p95 < 1000ms): ✅ PASS

MCP Operations (Tool Execution):
  p50: 1854ms
  p95: 2731ms
  p99: 3198ms
  Budget (p95 < 3000ms): ✅ PASS

Registry Operations (URN Lookups):
  p50: 12ms
  p95: 47ms
  p99: 89ms
  Budget (p95 < 100ms): ✅ PASS
```

### 3. CI Performance Gates

**Script**: `scripts/ci/perf-budget.js`

**Workflow**: `.github/workflows/perf-gate.yml` (invoked by main CI)

**Gates**:
- Log file existence (`latest.jsonl` and `ui-preview.jsonl` must exist)
- File age check (logs must be <24 hours old)
- Content validation (files contain valid JSONL with required fields)
- Budget thresholds:
  - Discovery p95 < 1000ms
  - MCP p95 < 3000ms
  - Registry p95 < 100ms

**On Failure**:
- CI job fails with clear error message
- Shows which metric exceeded threshold
- Points to `artifacts/perf/` for investigation

### 4. WSAP Integration

**Component**: WSAP (Workbench Spec Analysis Pipeline)

**Telemetry Points**:
- Discovery operations (OpenAPI/AsyncAPI/Postgres imports)
- Validation runs (ecosystem-wide cross-protocol checks)
- Registry lookups (URN resolution, capability queries)
- A2A client requests (agent-to-agent communication)

**Instrumentation**:
```javascript
const startTime = Date.now();
// ... perform operation ...
const duration = Date.now() - startTime;

fs.appendFileSync('artifacts/perf/latest.jsonl', JSON.stringify({
  timestamp: new Date().toISOString(),
  operation: 'discover_openapi',
  duration_ms: duration,
  source: url,
  manifest_urn: result.urn
}) + '\n');
```

---

## Developer Workflow Integration

### Import Phase
```bash
npm run cli -- discover api https://api.github.com/openapi.json
```
- **Telemetry**: Appends `discover_openapi` entry with duration
- **Artifact**: Writes manifest to `approved/` or `drafts/`
- **Registry**: Updates URN index with new manifest

### Validate Phase
```bash
npm run cli -- validate --ecosystem
```
- **Telemetry**: Records validation duration and rule counts
- **Output**: Structured JSON report with errors/warnings
- **Audit**: Logs cross-protocol relationship checks

### Visualize Phase
```bash
npm run cli -- ui  # Launch viewer at localhost:3456
```
- **Telemetry**: Tracks page loads, graph rendering, validation panel usage
- **Viewer**: Real-time catalog browser with dependency graphs
- **API Metrics**: Records `/api/validate` and `/api/graph` response times

### Performance Review
```bash
npm run cli -- perf:report
```
- **Output**: Live percentile metrics from JSONL logs
- **Budget Check**: Exit code 1 if any threshold exceeded
- **Trend Analysis**: Compare current run to historical data

---

## Guardrails & Quality Gates

### 1. No Seeded Data (S22.1)
- **Before**: `seedMockPerfData()` generated placeholder metrics
- **After**: Removed entirely; metrics come only from real operations
- **Enforcement**: `collectWorkspacePerfMetrics()` throws on missing logs

### 2. Freshness Validation (S22.1)
- **Check**: Log files must be <24 hours old
- **Rationale**: Stale logs indicate CI running against outdated data
- **Implementation**: `perf-budget.js` validates file `mtime`

### 3. Budget Compliance (S22.2)
- **Thresholds**: Discovery p95 < 1s, MCP p95 < 3s, Registry p95 < 100ms
- **Reporting**: CLI tool shows pass/fail with exact percentile values
- **CI Integration**: Gates block merge if budgets violated

### 4. Structured Logging (S22.1)
- **Format**: JSONL (one JSON object per line)
- **Required Fields**: `timestamp`, `operation`, `duration_ms`
- **Optional Fields**: `source`, `manifest_urn`, `error`
- **Benefit**: Machine-parseable, append-only, streaming-friendly

---

## Use Cases

### Local Development

Developer runs discovery import and wants to check performance:

```bash
# Import a spec
npm run cli -- discover api https://petstore3.swagger.io/api/v3/openapi.json

# Check if it met budget
npm run cli -- perf:report

# Output shows:
# Discovery p95: 673ms ✅ PASS (budget: <1000ms)
```

### CI Pipeline

GitHub Actions workflow validates performance on every PR:

```yaml
- name: Run Performance Gates
  run: npm run perf:budget
  # Fails if budgets exceeded or logs missing
```

### Release Validation

Before tagging v0.25, team verifies telemetry health:

```bash
# Generate full report
npm run cli -- perf:report --format json > release-perf.json

# Check all budgets pass
echo $?  # Must be 0

# Archive telemetry snapshot
cp artifacts/perf/latest.jsonl releases/v0.25-telemetry-snapshot.jsonl
```

---

## Roadmap Integration

### Sprint 22 Achievements ✅
- **S22.1**: Truthful Performance Pipeline — removed seeding, enforced budget failures
- **S22.2**: Perf Snapshot CLI — shipped `perf:report` with table/JSON formats
- **S22.3**: Workbench Narrative Update — this document + roadmap/README updates

### Sprint 23 Goals
- **Curated Manifest Showcase**: Exercise full telemetry flow with real API/Event/Workflow imports
- **Governance Finalization**: Remove placeholder scaffolds, integrate with telemetry story
- **Demo Recording**: Capture CLI transcript showing telemetry gates in action

---

## References

- **CLI Usage**: [`docs/performance/cli-usage.md`](performance/cli-usage.md)
- **CI Gates**: `scripts/ci/perf-budget.js`, `.github/workflows/perf-gate.yml`
- **Performance Targets**: [`docs/runtime-performance-guide.md`](runtime-performance-guide.md)
- **Artifacts**: [`artifacts/perf/README.md`](../artifacts/perf/README.md) (telemetry log format spec)
- **Roadmap**: [`cmos/docs/roadmap-sprint-21-25.md`](../cmos/docs/roadmap-sprint-21-25.md)

---

## Summary

The Workbench Telemetry system delivers:

✅ **Truth**: Metrics from real operations, no seeded data  
✅ **Freshness**: CI gates enforce <24h log age  
✅ **Budgets**: Hard-fail on threshold violations  
✅ **Visibility**: CLI reports show p50/p95/p99 with exit codes  
✅ **Audit Trail**: JSONL logs provide timestamped operation history  

This foundation ensures OSSP-AGI demos and releases reflect genuine performance characteristics, giving developers trustworthy data to make informed decisions.
