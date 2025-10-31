# Demo Showcase Narration Script

> Intended for a 5–7 minute walkthrough paired with the commands in `docs/demos/showcase.md`.

## Opening (0:00 – 0:45)
- Introduce Semantext Hub as a local-first protocol discovery workbench.
- Frame the goal: demonstrate the curated order-fulfillment journey built in Sprint 23.
- Highlight trust guarantees (no seeded data, catalog + validation only).

## Step 1 — Curated Inputs (0:45 – 1:45)
- Show the three manifests under `approved/` and read their URNs aloud.
- Explain that provenance metadata inside each manifest ties back to real seeds and previous missions.

## Step 2 — Run the Automation (1:45 – 3:30)
- Switch to terminal and run `node scripts/demo/run-showcase.mjs --overwrite`.
- Call out the success block:
  - Manifests copied count
  - Graph node/edge totals
  - Diagram + graph output locations
- Mention the guardrail warnings so the audience knows styling work is pending, not forgotten.

## Step 3 — Inspect the Catalog (3:30 – 5:00)
- Use `node cli/index.js catalog list --workspace . --format table` to show the three curated URNs.
- Open `artifacts/diagrams/showcase.drawio` in diagrams.net and describe the API → Event → Workflow chain.
- Connect the diagram back to the guardrail warnings (styling fallback) to maintain transparency.

## Call to Action (5:00 – 5:45)
- Invite viewers to explore `docs/demos/showcase.md` for exact commands.
- Mention next steps: styling the diagram via mission B24.x and wiring the backup/health checks.
- Close by reiterating that the entire flow runs locally without seeded shortcuts.
