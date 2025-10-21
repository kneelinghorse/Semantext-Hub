# Authoring Guide v2

This guide explains how to author protocol manifests, validate them (JSON Schema draft 2020-12), and tie them into WSAP.

## Manifests

- Keep manifests small and composable.
- Use stable URNs and declare dependencies explicitly.
- Place shared defs in separate files and reference with $ref.

## Validation

- Draft: 2020-12
- Local $ref only (no network fetch in UI).
- Try the Authoring UI endpoint: `POST /validate` with `schema` + `manifest(s)`.

## WSAP Tie-in

See WSAP overview: `app/docs/wsap/v2-readme.md`. Ensure generated artifacts and IDs align with WSAP seeds.

## Links

- Cookbook: `app/docs/adapters/cookbook.md`
