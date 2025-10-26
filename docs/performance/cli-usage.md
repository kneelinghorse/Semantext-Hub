# Performance CLI Usage Guide

This guide explains how to use the performance monitoring CLI commands to inspect telemetry data from workbench operations.

## Commands

### `perf:report` — Detailed Performance Report

Generate a comprehensive performance report with percentile metrics (p50/p95/p99) from live telemetry logs.

**Usage:**
```bash
node cli/index.js perf:report [options]
```

**Options:**
- `--workspace <path>` — Workspace root (default: current directory)
- `--verbose` — Show detailed output including source log paths
- `--format <format>` — Output format: `table` (default) or `json`

Telemetry freshness: The report fails if the newest parsed telemetry file is older than 60 minutes. Logs older than this window are ignored entirely; use `--verbose` to inspect timestamps and file paths when debugging stale data.

**Examples:**

```bash
# Generate table report (default)
node cli/index.js perf:report

# Generate JSON output for automation/CI
node cli/index.js perf:report --format json

# Show verbose output with source logs
node cli/index.js perf:report --verbose

# Specify custom workspace
node cli/index.js perf:report --workspace /path/to/workspace
```

**Sample Table Output:**

```
📊 Performance Report
═══════════════════════════════════════════════════════════════

🔍 Discovery Service
───────────────────────────────────────────────────────────────
  Metric         Value           Budget      Status
  ─────────────  ──────────────  ──────────  ──────
  Requests       42              —           
  P50 Latency    45.3ms          —           
  P95 Latency    127.8ms         ≤ 1s        ✓
  P99 Latency    189.2ms         —           
  Average        52.4ms          —           
  Cache Hit Rate 78.6%           —           
  Errors         0               0           ✓

🔧 MCP Service
───────────────────────────────────────────────────────────────
  Metric         Value           Budget      Status
  ─────────────  ──────────────  ──────────  ──────
  Requests       18              —           
  P50 Latency    255.7ms         —           
  P95 Latency    892.4ms         ≤ 3s        ✓
  P99 Latency    1.12s           —           
  Average        312.8ms         —           
  Tool Executions 18             —           
  Errors         0               0           ✓

💻 System
───────────────────────────────────────────────────────────────
  Memory Used    45.23 MB
  Uptime         2.3 min

🗂 Logs
───────────────────────────────────────────────────────────────
  Latest        artifacts/perf/2025-10-24/wsap-1729785600.jsonl
  Last Updated  2025-10-24T20:45:00.000Z
  Age           12 min (max 60 min)

═══════════════════════════════════════════════════════════════

✅ All performance budgets met
✅ Telemetry fresh: last update 12 min ago
```

**Sample JSON Output:**

```json
{
  "discovery": {
    "p50": 45.3,
    "p95": 127.8,
    "p99": 189.2,
    "avg": 52.4,
    "total": 42,
    "cacheHitRate": 0.786,
    "errors": 0
  },
  "mcp": {
    "p50": 255.7,
    "p95": 892.4,
    "p99": 1120.5,
    "avg": 312.8,
    "total": 18,
    "toolExecutions": 18,
    "errors": 0
  },
  "system": {
    "memoryUsage": { "heapUsed": 47456256, ... },
    "uptime": 138.5
  },
  "sourceLogs": [
    {
      "absolute": "/Users/d/workspace/artifacts/perf/2025-10-24/wsap-1729785600.jsonl",
      "relative": "artifacts/perf/2025-10-24/wsap-1729785600.jsonl",
      "exists": true,
      "mtime": "2025-10-24T20:45:00.000Z",
      "ageMinutes": 12
    }
  ],
  "logs": {
    "stale": false,
    "thresholdMinutes": 60,
    "latest": {
      "absolute": "/Users/d/workspace/artifacts/perf/2025-10-24/wsap-1729785600.jsonl",
      "relative": "artifacts/perf/2025-10-24/wsap-1729785600.jsonl",
      "mtime": "2025-10-24T20:45:00.000Z",
      "ageMinutes": 12
    },
    "oldest": {
      "absolute": "/Users/d/workspace/artifacts/perf/2025-10-24/wsap-1729785600.jsonl",
      "relative": "artifacts/perf/2025-10-24/wsap-1729785600.jsonl",
      "mtime": "2025-10-24T20:45:00.000Z",
      "ageMinutes": 12
    },
    "totalParsed": 1,
    "available": 1
  },
  "latestLog": "/Users/d/workspace/artifacts/perf/2025-10-24/wsap-1729785600.jsonl",
  "correlationId": "a3f5e8d2-4b9c-4e1a-8f7d-2c3b5a9e1d6f",
  "timestamp": "2025-10-24T20:45:32.123Z"
}
```

**Exit Codes:**

- `0` — Success, all budgets met
- `1` — Failure (missing logs, stale logs, or budget violations)

**Budget Thresholds:**

- **Discovery P95**: ≤ 1000ms (1 second)
- **MCP P95**: ≤ 3000ms (3 seconds)

---

### `perf:status` — Simple Status Check

Display a basic performance status summary (legacy command, still supported).

**Usage:**
```bash
node cli/index.js perf:status [options]
```

**Options:**
- `--workspace <path>` — Workspace root (default: current directory)
- `--verbose` — Enable verbose logging
- `--format <format>` — Output format: `text` (default) or `json`

**Note:** For most use cases, prefer `perf:report` which includes p99 metrics and better formatting.

---

## How Performance Logs are Generated

Performance telemetry is collected automatically during workbench operations and test runs. See [`artifacts/perf/README.md`](../../artifacts/perf/README.md) for details on log format and generation.

### Log Format (JSONL)

Each performance event is logged as a JSON object per line:

```jsonl
{"tool":"discovery","step":"resolve","ms":42.5,"ok":true,"message":"URN resolution completed"}
{"tool":"mcp","step":"tool_exec","ms":125.3,"ok":true,"message":"Tool execution successful"}
```

**Required Fields:**
- `tool` — Service name (e.g., `discovery`, `mcp`, `registry`)
- `step` — Operation identifier (e.g., `resolve`, `tool_exec`, `get`)
- `ms` — Duration in milliseconds

**Optional Fields:**
- `ok` — Success flag (default: `true`)
- `message` — Human-readable description
- `context` — Additional metadata

---

## CI Integration

The performance report command is designed to integrate with CI pipelines:

1. **Run tests** to generate telemetry logs
2. **Execute `perf:report`** in JSON mode
3. **Parse output** for budget compliance
4. **Fail build** if exit code is non-zero

**Example CI Workflow:**

```yaml
- name: Run Performance Tests
  run: npm run test:performance

- name: Generate Performance Report
  run: node cli/index.js perf:report --format json > .artifacts/perf-report.json

- name: Check Performance Budgets
  run: |
    if [ $? -ne 0 ]; then
      echo "::error::Performance budgets exceeded"
      exit 1
    fi
```

---

## Troubleshooting

### "No performance logs found"

**Cause:** The artifacts directory is empty or doesn't contain valid logs.

**Solution:**
1. Run tests to generate telemetry: `npm run test:fast`
2. Check that logs exist in `artifacts/perf/`
3. Verify log files match the expected format (see above)

### "Performance logs found but contain no parseable metrics"

**Cause:** Log files exist but don't contain valid performance entries.

**Solution:**
1. Check log file format matches the JSONL schema
2. Ensure entries have required fields: `tool`, `step`, `ms`
3. See [artifacts/perf/README.md](../../artifacts/perf/README.md) for examples

### Budget Violations

**Cause:** Performance metrics exceed configured thresholds.

**Solution:**
1. Review the report to identify slow operations
2. Optimize the identified bottlenecks
3. Run `perf:report --verbose` to see which logs contributed to high latencies
4. Consider adjusting budgets if performance is acceptable (rare)

---

## Related Documentation

- [Performance Telemetry README](../../artifacts/perf/README.md) — Log format and generation
- [Getting Started Guide](../Getting_Started.md) — Initial setup
- [Performance Guide](../runtime-performance-guide.md) — Optimization strategies
