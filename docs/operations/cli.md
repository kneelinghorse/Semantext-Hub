# Semantext Hub CLI

The Semantext Hub CLI consolidates the previous legacy tooling surfaces into a single executable exposed as `sch`. The CLI focuses on four MVP workflows: protocol validation, registry inspection, context management, and retrieval QA.

## Command Tree (Sprint 01 MVP)

| Command | Purpose | Notes |
| --- | --- | --- |
| `sch protocol validate [options]` | Run ecosystem validation across manifests | Direct lift of the prior `validate` command — supports `--ecosystem`, `--manifests`, `--output`, `--format`, and `--verbose`. |
| `sch registry list [options]` | List registered protocols in tabular or JSON form | Reuses catalog tooling; accepts `--workspace` and `--format`. |
| `sch registry view <identifier> [options]` | Inspect manifest metadata by name/URN/path | Pretty or JSON output formats. |
| `sch registry diagram [identifier] [options]` | Generate Draw.io diagrams for the registry | Supports `--output`, `--format`, `--theme`, `--overwrite`, `--open`. |
| `sch search <query> [options]` | Search semantic tool registry via embeddings | `--limit`, `--json`, `--activate` supported (activates top result). |
| `sch perf status [options]` | Summarise recent performance telemetry | Mirrors the existing perf status command. |
| `sch perf report [options]` | Produce percentile reports for perf logs | Table/JSON output. |
| `sch perf gc [options]` | Garbage collect perf artifacts | Supports dry run and JSON output. |
| `sch context status` | Stub: reports backlog status for context tooling | Prints backlog reference `SCH-CLI-001`. |
| `sch context sync` | Stub: placeholder for upcoming sync workflow | Prints backlog reference `SCH-CLI-004`. |
| `sch context purge` | Stub: placeholder for cache purge workflow | Prints backlog reference `SCH-CLI-005`. |
| `sch retrieval qa [options]` | Stub: placeholder for retrieval QA harness | Prints backlog reference `SCH-CLI-010`. |

> All commands accept `--help` to display detailed options. Legacy aliases such as `perf:status` are still accepted but emit deprecation warnings — update automation to use the canonical form (`sch perf status`).

## Installation & Usage

```
npm install
npx sch --help
npx sch registry list --format json
npx sch protocol validate --ecosystem --manifests artifacts/approved
```

The package also ships `sch-cli` as a secondary binary for compatibility; both resolve to the same entry point.

## Legacy Entrypoints

| Legacy command | Status | Replacement |
| --- | --- | --- |
| `protocol-discover` | Deprecated wrapper emitting warning | Use `sch protocol …` (`validate` available now, scaffold/discover tracked in backlog). |
| `protocol-generate` | Deprecated wrapper emitting warning | Future `sch protocol scaffold` (see backlog item `SCH-CLI-003`). |
| `app/cli/*.mjs` (release, wsap, signing, etc.) | Stubs warning about removal | Context/retrieval stubs live in the new CLI; see backlog summary below. |

All legacy wrappers exit with code 1 after printing guidance to make failures obvious in CI.

## Backlog Summary

| Backlog ID | Theme | Planned command | Status |
| --- | --- | --- | --- |
| `SCH-CLI-001` | Context inventory | `sch context status` | Stub (prints backlog reference) |
| `SCH-CLI-003` | Scaffolding | `sch protocol scaffold` | Pending design |
| `SCH-CLI-004` | Context sync | `sch context sync` | Stub (prints backlog reference) |
| `SCH-CLI-005` | Context purge | `sch context purge` | Stub (prints backlog reference) |
| `SCH-CLI-006` | Signing workflows | `sch context sign` | Pending security alignment |
| `SCH-CLI-007` | Verification workflows | `sch protocol verify` | Pending validation API update |
| `SCH-CLI-008` | WSAP automation | `sch context sync --mode wsap` | Pending workspace agent design |
| `SCH-CLI-009` | Search & Retrieval QA | `sch search` | Shipped via mission B2.5 (`sch search` command) |
| `SCH-CLI-010` | Retrieval QA | `sch retrieval qa` | Stub (prints backlog reference) |

Detailed notes live in `docs/operations/cli-backlog.md`.
