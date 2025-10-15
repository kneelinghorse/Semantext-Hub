# Sprint File Conventions

This document defines minimal, canonical schemas for sprint files so authors and agents stay aligned across sprints. These conventions are the source of truth for sprint file structure; sprint content remains in `missions/sprint-NN/` (zero‑padded: `01`, `02`, …).

Scope:
- Files: `missions/sprint-NN/build_sprint.NN.yaml`, `missions/sprint-NN/research_sprint.NN.yaml`
- Purpose: Keep backlog derivation and `missions/current.yaml` advancement predictable and stable

Numbering:
- Sprint directories and files use zero‑padded `NN` (e.g., `sprint-01`, `*.01.yaml`).

Advancement rule (build only):
- Next mission is the first with `status: "Queued"` whose `depends_on` are all completed. If none are queued, keep the previous `missions/current.yaml` unchanged.

## build_sprint.NN.yaml (build missions only)

Top‑level keys:
- `sprintId`: string (e.g., "Sprint 01")
- `title`: string (short)
- `focus`: string (short)
- `status`: string (e.g., "Planned|Active|Completed")
- `missions`: array of build mission entries (schema below)
- `notes`: freeform (optional)

Build mission entry (required keys unless marked optional):
- `id`: string — unique ID (e.g., "B1.1")
- `name`: string — concise mission name
- `objective`: string — what this mission accomplishes
- `status`: one of `Queued|Current|Completed|Blocked`
- `depends_on`: array of mission ids (optional; default `[]`)
- `successCriteria`: array of short bullet strings (required; ≥1)
- `deliverables`: array of file/path strings (required; ≥1)
- `notes`: string (optional)

Notes:
- Backlog derivation uses: `id`, `name`, `status`, `depends_on`.
- `objective`, `successCriteria`, and `deliverables` provide clarity for authors/agents and downstream docs.

Example (Sprint 01):

```yaml
sprintId: "Sprint 01"
title: "Foundation - Secure Discovery"
focus: "Build MCP server foundation with secure YAML loading and domain discovery."
status: "Active"

missions:
  - id: "B1.6"
    name: "Document Sprint File Conventions"
    objective: "Publish canonical schemas for sprint files."
    status: "Queued"
    depends_on: ["B1.5"]
    successCriteria:
      - "conventions.sprint-files.md created with both schemas"
      - "Getting_Started.md links to conventions"
    deliverables:
      - "docs/conventions.sprint-files.md"
      - "docs/Getting_Started.md"

  - id: "B1.7"
    name: "Failure and Rollback Protocol"
    objective: "Define failure detection and rollback steps."
    status: "Blocked"
    depends_on: ["B1.6"]
    successCriteria:
      - "Protocol documented with triggers and steps"
    deliverables:
      - "docs/failure_rollback.md"

notes:
  canonical: true
  description: "Authoritative list of Sprint 01 build missions."
```

## research_sprint.NN.yaml (research missions only)

Top‑level keys:
- `sprintId`: string (e.g., "Sprint 01")
- `status`: string (e.g., "As Needed|Planned|Active|Completed")
- `research`: array of research mission entries (schema below)
- `notes`: freeform (optional)

Research mission entry (required keys unless marked optional):
- `id`: string — unique ID (e.g., "R1.1")
- `topic`: string — short topic
- `objectives`: array (3–5 concise research questions)
- `tokenBudget`: map { `prompt`, `research`, `response`, `refine` } — integers (tokens)
- `outputs`: array — references to `/missions/research/*.md` where results live
- `status`: one of `Queued|Current|Completed|Blocked`
- `depends_on`: array of mission ids (optional; default `[]`)

Notes:
- Research sprint is a metadata index; long‑form outputs live under `/missions/research/*.md`.

Example (Sprint 01):

```yaml
sprintId: "Sprint 01"
status: "As Needed"

research:
  - id: "R1.3"
    topic: "Mission Selection Heuristics"
    objectives: [
      "How to pick first queued mission?",
      "How to validate dependency satisfaction?",
      "How to signal blocked state?"
    ]
    tokenBudget: { prompt: 2000, research: 3000, response: 15000, refine: 5000 }
    outputs:
      - "missions/research/r1.3_mission_selection_heuristics.md"
    status: "Queued"

  - id: "R1.4"
    topic: "Backlog Derivation Rules"
    objectives: [
      "Which fields must mirror canonical?",
      "What metadata belongs only in backlog?",
      "How to reconcile discrepancies?"
    ]
    tokenBudget: { prompt: 1500, research: 2000, response: 12000, refine: 4000 }
    outputs:
      - "missions/research/r1.4_backlog_derivation_rules.md"
    status: "Queued"

notes:
  canonical: true
  description: "Research entries for Sprint 01. Results live under /missions/research/*.md"
```

Authoring checklist:
- Use zero‑padded sprint numbering (`NN`).
- Ensure build `status` and `depends_on` are accurate — these drive backlog derivation and `missions/current.yaml` advancement.
- Keep `objective`, `successCriteria`, and `deliverables` concise.
- For research, put findings in `/missions/research/*.md` and reference them in `outputs`.

