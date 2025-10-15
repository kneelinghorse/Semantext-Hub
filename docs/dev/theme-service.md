# Theme Service & External Style Configuration

> Mission B14.3 – External Style Config & Theme Service

This guide explains how visualization themes are defined, validated, and applied across Draw.io and Cytoscape exporters.

## Overview

- Theme schema: `config/theme-style-schema.json`
- Theme manifests: `config/themes/<id>.json`
- Runtime service: `src/visualization/theme/serializer.{js,ts}`
- CLI command: `app-cli theme switch <id>`

Themes externalise all style data (palette tokens, Draw.io mxGraph styles, Cytoscape selectors, and layout defaults) so both visualization exporters stay in sync.

## Theme Manifest Structure

Every theme JSON document follows the shared schema:

- `id`, `name`, `description` – Theme identity and UX label
- `palette` – Reusable colour tokens referenced via `{{palette.*}}` placeholders
- `drawio` – Defaults plus node/edge/domain style overrides
- `cytoscape` – Base style, layout defaults, and node/edge/domain overrides

Example snippet (`config/themes/light.json`):

```json
{
  "$schema": "../theme-style-schema.json",
  "id": "light",
  "palette": {
    "node": {
      "default": { "fill": "#E6F4F1", "stroke": "#0B7285" }
    }
  },
  "drawio": {
    "defaults": {
      "node": {
        "width": 180,
        "height": 80,
        "style": {
          "fillColor": "{{palette.node.default.fill}}",
          "strokeColor": "{{palette.node.default.stroke}}"
        }
      }
    }
  }
}
```

Tokens are resolved at runtime; unknown references fail fast with a descriptive error.

## Runtime API

`createThemeService({ root })` returns helpers scoped to a workspace root:

- `listThemes()` – Enumerate available themes
- `getTheme(themeId?)` – Load and validate a theme (defaults to active theme)
- `getDrawioTheme(themeId?)` – Resolve merged node/edge styles for mxGraph serialization
- `getCytoscapeTheme(themeId?)` – Produce Cytoscape selector/style definitions and layout defaults
- `setActiveThemeId(themeId)` – Persist `config/themes/active.json`

The default export is already wired for the repository root, so existing exporters simply call `getDrawioTheme()` / `getCytoscapeTheme()` without manual plumbing.

## CLI Usage

Switching themes updates the active manifest and regenerates canonical artifacts:

```bash
pnpm cli theme switch dark
```

- Writes `config/themes/active.json`
- Regenerates Draw.io under `artifacts/diagrams/`
- Regenerates Cytoscape JSON under `artifacts/visualizations/cytoscape/`

To preview without switching globally, commands accept an explicit `--theme <id>` flag:

```bash
pnpm cli catalog generate-diagram --theme light
```

## Adding a New Theme

1. Copy `config/themes/light.json` as a template.
2. Update palette tokens and style overrides (use token placeholders where possible).
3. Run `npm test -- theme-serializer` (or `pnpm test`) to validate the schema and serializer behaviours.
4. Apply via `app-cli theme switch <id>` to regenerate artifacts.

All deliverables keep styling logic out of exporters so adding or tweaking themes requires zero code changes.

