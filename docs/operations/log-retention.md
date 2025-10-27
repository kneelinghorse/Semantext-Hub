# Log Retention & Garbage Collection

Mission: S24.2-20251029

This document describes how performance artifacts and logs are kept within disk budgets using the new retention tooling delivered in Sprint 24.

## Policy Configuration

Retention policies live in `app/config/retention.json`. Each target entry declares:

- `path`: Directory (relative to the workspace) that should be managed.
- `keepLatest`: Minimum number of most-recent entries that are always preserved.
- `maxAgeDays`: Deletes entries older than the threshold when they are not protected.
- `maxTotalSizeMB`: Ensures the target stays under the specified total size by trimming the oldest data.
- `protect`: Optional list of entry names (relative to the target path) that are never removed.

Defaults apply to every target unless overridden. Example:

```json
{
  "defaults": {
    "keepLatest": 5,
    "maxAgeDays": 14,
    "maxTotalSizeMB": 1024
  },
  "targets": [
    {
      "id": "wsap-perf-artifacts",
      "path": "artifacts/perf",
      "keepLatest": 8,
      "maxAgeDays": 30
    }
  ]
}
```

## Running Garbage Collection

### Direct Script Invocation

Use the workspace-local script to preview or execute cleanup:

```bash
node scripts/cleanup/gc-artifacts.mjs --dry-run
node scripts/cleanup/gc-artifacts.mjs --workspace /path/to/workspace
```

- Add `--dry-run` to see what would be removed.
- Add `--json` for machine-readable output (suppresses console summaries).

### CLI Command

The CLI exposes a convenience command:

```bash
node cli/index.js perf:gc --dry-run
node cli/index.js perf:gc --json
```

Both entry points honor the same retention configuration and print reclaimed capacity per target.

## CI Coverage

`tests/scripts/gc-artifacts.spec.mjs` exercises the retention logic, validating dry-run previews, deletion behavior, and protection rules to ensure regressions are caught in CI.
