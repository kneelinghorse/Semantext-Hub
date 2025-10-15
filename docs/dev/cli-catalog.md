# Catalog CLI Reference

The catalog command suite lives under `app-cli catalog` and provides discovery, inspection, and diagram generation workflows for OSSP-AGI protocol manifests. Commands default to the current working directory but accept `--workspace` to target another catalog.

## Available Commands

| Command | Description |
| --- | --- |
| `app-cli catalog list` | Print a table of catalog entries (name, version, description). |
| `app-cli catalog view <identifier>` | Show detailed metadata, source path, and relationships for a specific entry. |
| `app-cli catalog generate-diagram [identifier]` | Produce a Draw.io diagram for the full catalog or a focused protocol view. |

Identifiers can be a friendly name (`Sample Customer API`) or a full URN (`urn:proto:api:sample.set/customer-api@v1.0.0`).

## Flags and Options

- `--workspace <path>`: Override the workspace root. Defaults to the current directory. Catalog manifests are automatically discovered under `artifacts/` and `examples/catalogs`.
- `--format <table|json>`: Available on `catalog list` and `catalog view` to emit machine-readable JSON when scripting.
- `-o, --output <path>`: (generate-diagram) Destination file or directory. Directories receive a timestamped filename such as `catalog-20251014-162738.drawio`.
- `--overwrite`: (generate-diagram) Required to replace an existing file. The command fails safely otherwise.
- `--layer-by <property>`: (generate-diagram) Group nodes into Draw.io layers by the specified property (e.g., `domain`) to toggle complex areas.
- `--split-by <property>`: (generate-diagram) Generate a multi-page diagram by property, reducing the per-page footprint.
- `--open`: (generate-diagram) Open the generated diagram using the system viewer when running interactively. Ignored in non-TTY environments.
- `-f, --format <drawio>`: Future-proof format flag for `generate-diagram`. Currently only `drawio` is supported.

## Examples

List the catalog using the repository workspace:

```bash
node app/cli/index.js catalog list --workspace ./app
```

View a specific entry, returning structured JSON for further processing:

```bash
node app/cli/index.js catalog view "Sample Customer API" --workspace ./app --format json
```

Generate a diagram with a managed filename and open it automatically:

```bash
node app/cli/index.js catalog generate-diagram --workspace ./app --open
```

Focus the diagram on a single protocol and write to a custom location, overwriting if it exists:

```bash
node app/cli/index.js catalog generate-diagram urn:proto:api:sample.set/customer-api@v1.0.0 \
  --workspace ./app \
  --output ./app/artifacts/diagrams/customer-api.drawio \
  --overwrite
```

Split a catalog into per-domain pages with guardrail guidance:

```bash
node app/cli/index.js catalog generate-diagram \
  --workspace ./app \
  --split-by domain \
  --layer-by domain \
  --output ./app/artifacts/diagrams/catalog-domains.drawio \
  --overwrite
```

## Behaviour Notes

- Diagram generation uses the canonical graph builder and Draw.io exporter delivered in missions M13.2 and M13.1. The command reuses those modules and inherits their schema validation and overwrite protections.
- Guardrails warn when diagrams exceed ~250 nodes/5MB (warning) or ~400 nodes/10MB (critical). The CLI surfaces mitigation tips and the exporter records warnings in the result payload.
- Spinner output and coloured status messages appear only in interactive terminals. In CI or when piped, the commands degrade to plain text logs.
- When a protocol cannot be resolved, the CLI emits an actionable error with next steps (`app-cli catalog list`) to aid recovery.
