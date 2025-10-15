Scaffold CLI Guide

- Command: `npm --prefix app run cli scaffold`
- Types: `api`, `data`, `event`, `semantic`, `importer`, `test`
- Flags: `--type`, `--name`, `--output`, `--dry-run`, `--trace`, `--verbose`

Redaction

- Preview redacts common secrets/tokens in text using patterns
- Keys masked: passwords, tokens, apiKey, accessToken, refreshToken
- Headers masked: `authorization`, `cookie`, `x-api-key`
- Placeholder: `[REDACTED]`
- Disable (not recommended): pass `--redact false`

Examples

- Dry-run with redaction: `npm --prefix app run cli scaffold -- --type api --name MyAPI --description "token ghp_..." --dry-run`
- Write files: `npm --prefix app run cli scaffold -- --type event --name Alerts --write`

Output Structure

- `manifests/<Name>.json`
- `importers/<kebab-name>-importer.js`
- `tests/<kebab-name>-importer.test.js` (imports from `../importers/...`)

