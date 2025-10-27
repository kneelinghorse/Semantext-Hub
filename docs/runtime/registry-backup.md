# Registry Backup, Restore, and Health Diagnostics

This guide explains how to create point-in-time backups of the SQLite registry, restore them safely, and interpret the registry health diagnostics that now run on startup and via the `/health` endpoint.

## Backup Workflow

Use the Node script at `scripts/registry/backup.mjs` to capture the database and provenance log into a timestamped archive.

```bash
node scripts/registry/backup.mjs \
  --db var/registry.sqlite \
  --out artifacts/registry/backups
```

Key behaviour:
- Copies the SQLite database along with any WAL/SHM files.
- Exports the `provenance` table as `provenance.jsonl` for quick auditing.
- Writes `metadata.json` summarising the snapshot (source path, record counts, etc.).
- Produces `registry-backup-<ISO>.tar.gz` in the chosen output directory.

Available options:
- `--db <path>` – explicit database path (defaults to `app/config/registry.config.json` → `dbPath`, then `var/registry.sqlite`).
- `--config <path>` – alternate registry config when discovering the database location.
- `--out <dir>`/`--output <dir>` – archive destination directory (defaults to `artifacts/registry/backups`).
- `--tag <label>` – optional suffix appended to the archive filename for easier identification.

## Restore Workflow

Restoring requires unpacking the archive and copying the files into place. Use `scripts/registry/restore.mjs`:

```bash
node scripts/registry/restore.mjs \
  --archive artifacts/registry/backups/registry-backup-2025-10-27T16-43-49Z.tar.gz \
  --db var/registry.sqlite \
  --log var/registry-provenance.jsonl \
  --force
```

Notes:
- The script reads `metadata.json` to locate the original SQLite/WAL/SHM filenames.
- The provenance export is written to `var/registry-provenance.jsonl` by default (override with `--log`).
- Use `--force` to overwrite existing database files; otherwise the restore will abort if the destination exists.
- When `--db` is omitted the script consults the same registry config file used by the backup command.

## Health Diagnostics

During startup the registry now runs a health check and refuses to boot if critical failures are detected. The check validates:

- **SQLite journal mode** – WAL must be enabled.
- **Schema version** – the on-disk `PRAGMA user_version` must match the expected registry schema.
- **Disk headroom** – by default at least 256 MB of free space is required for crash recovery and WAL checkpoints. Configure via `registry.config.json`:

```json
{
  "dbPath": "var/registry.sqlite",
  "health": {
    "minFreeBytes": 536870912
  }
}
```

The `/health` endpoint mirrors these checks and reports status:

- `status`: `ok`, `warn`, or `error`.
- `warnings` / `errors`: arrays describing any issues.
- `registry`: driver, journal mode, schema details, record count, and disk stats (free MB + threshold).

Example response:

```json
{
  "status": "ok",
  "registry": {
    "driver": "sqlite",
    "wal": true,
    "journal_mode": "wal",
    "schema_version": 1,
    "expected_schema_version": 1,
    "records": 42,
    "disk": {
      "freeMegabytes": 1024,
      "thresholdBytes": 268435456,
      "healthy": true
    }
  },
  "warnings": [],
  "errors": []
}
```

Use this output in CI or operational drills to confirm that backups, restores, and registry readiness checks remain healthy.
