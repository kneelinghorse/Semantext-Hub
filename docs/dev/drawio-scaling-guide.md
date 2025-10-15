# Draw.io Scaling Guardrails

The Draw.io exporter estimates catalog size before writing artifacts and applies guardrails to keep diagrams responsive.

## Thresholds

- **Warning** triggers at ≥250 nodes or ≥5 MB estimated output.
- **Critical** triggers at ≥400 nodes or ≥10 MB estimated output.
- Guardrail warnings include mitigation tips and propagate through `writeDrawio` results and CLI output.

## Mitigation Strategies

- `--layer-by <property>` groups nodes into Draw.io layers so you can toggle heavy domains or ownership boundaries on demand.
- `--split-by <property>` generates a multi-page `.drawio` file, reducing the per-page footprint and omitting cross-group edges from individual pages.
- Filter the catalog before export (pass an identifier or pre-filter artifacts) to keep node counts manageable.

Missing properties land in an **Unassigned** layer or page. The exporter reports how many nodes were reassigned so downstream workflows can fill gaps.

## CLI Behaviour

- Guardrail warnings surface after `catalog generate-diagram` completes, along with mitigation tips.
- Success logs include the number of pages written; scripts can read `diagramCount` from the JSON result when invoking the command programmatically.
