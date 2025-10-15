# Cytoscape Catalog Viewer

This guide covers the Cytoscape export pipeline for large catalogs and how to work with the WebGL viewer shipped in `app/viewers/cytoscape/`.

## When to use the Cytoscape export

- Catalog graphs that exceed ~250 nodes.
- Analysts need high-FPS panning and zooming for discovery work.
- You want to share a self-contained, theme-aware snapshot with developers.

## Generating the export

```bash
node app/cli/commands/catalog-export.js --format cytoscape --open --overwrite
```

Key flags:

- `--format cytoscape` &mdash; switch from the default snapshot output to the Cytoscape schema.
- `--open` &mdash; launches the viewer in your default browser (interactive terminals only).
- `--overwrite` &mdash; replace any existing artifact at the target path.
- `--output <file|dir>` &mdash; optional path; defaults to `artifacts/visualizations/cytoscape/<timestamp>.json`.
- `--no-metadata` &mdash; trim workspace metadata (useful for redacted hand-offs).

The command uses the canonical graph builder under the hood, so make sure `app/cli/commands/catalog-build-graph.js` can find manifests in your workspace before exporting.

## Viewer workflow

1. Run the export with `--open` (recommended) or open `app/viewers/cytoscape/index.html` manually.
2. Drag-and-drop the generated `cytoscape-v1` JSON file into the drop zone.
3. Use the search box to highlight nodes by label, URN, type, or domain.
4. Click a node to log quick metadata (type, domain, URN) in the sidebar.

### Performance notes

- The viewer loads Cytoscape.js with the cola layout plugin and defaults to the WebGL renderer.
- Layout parameters favour stability over animation; update `viewer.js` if you need different spacing or cooling constants.
- For very large graphs (>1k nodes) expect an initial settle period while the cola layout relaxes.

### Embedding hints

- The CLI encodes the export path as a `hint` query parameter when `--open` is passed so the viewer sidebar displays the expected file location.
- URL payload embedding is supported via `?payload=<base64>` if you need to ship a self-contained link, but prefer drag & drop to avoid browser URL limits.

## Validation

- Unit tests live in `app/tests/visualization/cytoscape/exporter.test.ts`.
- `writeCytoscape` returns the node/edge counts; integrate into smoke tests when adding new catalog features.

## Next steps

- Mission B14.3 will externalise the style map so Cytoscape and Draw.io share theme tokens.
- Add focused subgraph exports per protocol once `catalog-generate-diagram` exposes format negotiation.
