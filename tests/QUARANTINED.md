# Quarantined Tests (temporary)

Purpose: track suites ignored while stabilizing CI. Each entry must include an exit criterion and an owner.

| Glob (relative)                                   | Rationale                           | Owner | Added       | Exit criterion                          |
|---------------------------------------------------|-------------------------------------|-------|-------------|------------------------------------------|
| tests/property/workflow/http-adapter.test.js      | Stabilized timeout/requestId flake  | Completed | 2025-10-18 | 30-pass deflake run complete (B18.11c)  |
| _(add as needed)_                                 | _(flaky / WIP / missing fixtures)_  | _TBD_ | _YYYY-MM-DD_| _(e.g., fix #123 and 30 deflake passes)_ |

Notes
- Quarantine is **temporary**. Every glob here should be removed once the exit criterion is met.
- Keep this table in sync with `tests/quarantine.globs.json`.
