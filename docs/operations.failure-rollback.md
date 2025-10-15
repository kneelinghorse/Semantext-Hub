# Operations: Failure & Rollback (Single Checkpoint Safe-Path)

Purpose
- Define a deterministic recovery path when a mission fails or a handoff is incomplete, while preserving the single checkpoint invariant (`missions/current.yaml`).
- Make backlog status and session logging behaviors explicit and auditable.

Invariants
- Single checkpoint: `missions/current.yaml` is the only live mission checkpoint. Never advance it on failure.
- Canonical source for next-mission selection: the active sprint file (e.g., `missions/sprint-01/build_sprint.01.yaml`).

Backlog Status Semantics
- `Current`: The mission expected to be executing now.
- `Blocked`: The mission could not complete due to a failure or unmet dependency; requires attention before retry.
- `Queued`: Awaiting execution with dependencies satisfied.
- `Completed`: Finished and verified.

When a mission fails or handoff is incomplete
1) Do NOT replace `missions/current.yaml` (leave last known good mission loaded).
2) In `missions/backlog.yaml`: set the mission's status to `Blocked` (or remain `Current` if mid-execution and you prefer not to alter board flow).
3) Append to `SESSIONS.jsonl` a single line JSON object:
   { "ts": "<ISO8601>", "mission": "<id>", "status": "failed", "reason": "<short>", "files_changed": <int?> }
4) Inspect partial changes; revert or fix as needed. Keep `current.yaml` unchanged during triage.
5) Retry deterministically: re-run the same mission. On success, apply the normal completionProtocol:
   - backlog: mark previous as `Completed`, set next as `Current`
   - `missions/current.yaml`: load the next mission
   - `PROJECT_CONTEXT.json`: increment session_count, update statuses
6) Verification: ensure `Current` in backlog matches the mission in `missions/current.yaml`.

Deterministic Retry Checklist (suggested)
- Review `git status` and `git diff` to enumerate partial edits.
- Revert unintended edits or complete them to a coherent state.
- Confirm dependencies for the mission are satisfied.
- Re-run the mission exactly once; if it fails again, keep `current.yaml` as-is and repeat steps 2–4.

Logging Format (SESSIONS.jsonl)
- One JSON object per line. Example:
  { "ts": "2025-10-08T18:05:00Z", "mission": "B1.7-20251008-001", "status": "failed", "reason": "timeout: completionProtocol not finished", "files_changed": 3 }
- Follow-up success entry is separate and should include `status: "completed"` and any useful counters.

Operator Notes
- Prefer `Blocked` over custom failure states to keep backlog filtering simple.
- Never advance `current.yaml` on failure. It is the single checkpoint and must remain stable until a verified success.
- If the canonical sprint file has no `Queued` mission, do not attempt to advance; complete any remaining verification or close the sprint.

Verification (quick greps)
- Confirm this doc is referenced: `rg -n "operations.failure-rollback.md" docs`
- Confirm backlog contains a `Blocked` status when applicable: `rg -n "status:\s*Blocked" missions/backlog.yaml`
- Confirm failed sessions are logged: `tail -n 3 SESSIONS.jsonl`

