ESM Migration Notes (Sprint 12 / M12.1)

Overview
- Unified on Jest + Babel for ESM: `babel-jest` transforms TS/JS.
- `extensionsToTreatAsEsm`: treats `.ts/.tsx` as ESM; `.js` is kept CJS for broad test compatibility.
- `@jest/globals` supported via `tests/setup.js` and direct imports in tests.

Key Patterns
- ESM __dirname/__filename:
  - `import { fileURLToPath } from 'url';`
  - `const __filename = fileURLToPath(import.meta.url);`
  - `const __dirname = path.dirname(__filename);`

- Dynamic import for optional ESM interop:
  - `const mod = await import('./path/to/module.js');`

- CommonJS compatibility in tests:
  - Use `createRequire(import.meta.url)` in `tests/setup.js` to bridge `require()` when needed.
  - Prefer `import { describe, test, expect } from '@jest/globals';` in new tests.

Jest Config Summary
- Location: `app/jest.config.js`
- Transform: `'^.+\\.(t|j)sx?$': ['babel-jest', { rootMode: 'upward' }]`
- Mappers trimmed to essential alias only: `'^@/(.*)$'`

Follow-ups (next sprints)
- Continue migrating remaining require()-style tests to `import`.
- Reduce remaining `__dirname/__filename` occurrences to ESM-safe patterns across lower-priority paths.

