# Semantext Hub — Local Context Mission Orchestrator

Semantext Hub is a local-first context and mission orchestration system designed for developers who want to run the entire workflow on their own workstation. The project combines an MCP-compatible hub, a curated mission backlog, and focused tooling so you can iterate quickly without external dependencies or vendor lock-in.

## What You Get
- Local-first runtime: Node.js services with SQLite for the registry, LanceDB for vector search, and Redis for live context.
- Unified CLI (`sch`): Inspect the registry, trigger validation pipelines, run performance probes, and manage context workflows from one command surface.
- Structured planning: Mission definitions under `cmos/missions/` and supporting docs in `cmos/docs/` keep sprint work auditable and repeatable.
- Documentation bundle: Roadmap, technical vision, and architecture briefs summarise sprint goals and the evolution of the stack.

## Quick Start
```bash
# Clone the repository
git clone https://github.com/kneelinghorse/Semantext-Hub.git
cd Semantext-Hub

# Install dependencies
npm install

# Explore the CLI
npx sch --help
npx sch perf status --help
```

## Repository Map
- `cli/` — source for the `sch` CLI entry point and command implementations.
- `cmos/` — backlog, mission specs, and context packs that drive the build.
- `docs/` — operational guides, CLI backlog, and cleanup plans.
- `tests/` — smoke tests and utilities that protect the mission workflow.

## Documentation & Planning
- Roadmap: `cmos/docs/roadmap.md`
- Technical Vision: `cmos/docs/Semantext Hub-Technical Vision.md`
- Architecture Notes: `cmos/docs/technical_architecture.md`
- CLI Backlog: `docs/operations/cli-backlog.md`

Need deeper historical context or OSSP-AGI compatibility notes? Check the mission archives under `cmos/missions/sprint-00/` and the research briefs in `cmos/missions/research/`.

## Contributing
Contributions are welcome. Open an issue describing the mission or improvement you want to tackle, align it with the backlog, and submit a PR with clear context and testing notes.

## License
This repository is provided under the project's existing license; see `LICENSE` for details.
