# Adapter Error & Warning Matrix

**Mission:** B18.14-20251020  
**Generated:** 2025-10-20  
**Scope:** OpenAPI, AsyncAPI, and Postgres adapters (Pack v1)

## Executive Summary

This document provides a comprehensive mapping of error conditions, warnings, and unsupported features across the three core adapters in the Semantext Hub system. It is derived from executable boundary tests with ≥25 assertions per adapter.

**Test Coverage:**
- **OpenAPI Adapter:** 32 assertions (all pass; warnings documented in tests 14 & 32)
- **AsyncAPI Adapter:** 32 assertions (all pass; warnings documented in tests 14 & 32)
- **Postgres Adapter:** 32 assertions (all pass; warnings documented in tests 14 & 32)

## Adapter Comparison Table

| Feature/Behavior | OpenAPI | AsyncAPI | Postgres |
|-----------------|---------|----------|----------|
| **Type** | API | Event | Data |
| **Primary Spec Format** | OpenAPI 3.0+ | AsyncAPI 2.x | Custom JSON/YAML |
| **JSON Support** | ✅ Yes | ✅ Yes | ✅ Yes |
| **YAML Support** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Remote Spec Fetch** | ✅ Yes (via fetch) | ✅ Yes (via fetch) | ✅ Yes (via fetch) |
| **Graceful Fallback** | ✅ JSON→YAML | ✅ JSON→YAML | ✅ JSON→YAML |
| **Empty File Handling** | ⚠️ Warning (proceeds) | ⚠️ Warning (proceeds) | ⚠️ Warning (proceeds) |
| **Custom Capabilities** | ✅ Supported | ✅ Supported | ✅ Supported |

## Error Categories

### 1. Critical Errors (Build Fails)

These conditions cause the adapter to throw an error and halt execution.

#### 1.1 Missing Required Parameters

| Error Condition | OpenAPI | AsyncAPI | Postgres | Error Message |
|-----------------|---------|----------|----------|---------------|
| `specPath` missing | ❌ ERROR | ❌ ERROR | ❌ ERROR | `specPath is required.` |
| `outDir` missing | ❌ ERROR | ❌ ERROR | ❌ ERROR | `outDir is required.` |
| `specPath` is `null` | ❌ ERROR | ❌ ERROR | ❌ ERROR | `specPath is required.` |
| `outDir` is `null` | ❌ ERROR | ❌ ERROR | ❌ ERROR | `outDir is required.` |
| `outDir` is empty string | ❌ ERROR | ❌ ERROR | ❌ ERROR | `outDir is required.` |

**Severity:** 🔴 CRITICAL  
**Resolution:** Ensure both `specPath` and `outDir` are provided as non-empty strings.

#### 1.2 File System Errors

| Error Condition | OpenAPI | AsyncAPI | Postgres | Error Message |
|-----------------|---------|----------|----------|---------------|
| Spec file not found | ❌ ERROR | ❌ ERROR | ❌ ERROR | `Spec file not found: <path>` |
| Path is directory | ❌ ERROR | ❌ ERROR | ❌ ERROR | (EISDIR or parse error) |
| Invalid path chars | ❌ ERROR | ❌ ERROR | ❌ ERROR | (System error varies) |

**Severity:** 🔴 CRITICAL  
**Resolution:** Verify the spec file exists and is a readable file, not a directory.

#### 1.3 Remote Fetch Errors

| Error Condition | OpenAPI | AsyncAPI | Postgres | Error Message |
|-----------------|---------|----------|----------|---------------|
| Network unavailable | ❌ ERROR | ❌ ERROR | ❌ ERROR | `Failed to fetch spec from <url>: <reason>` |
| HTTP 4xx/5xx response | ❌ ERROR | ❌ ERROR | ❌ ERROR | `Failed to fetch spec from <url>: <status>` |
| No fetch API (old Node) | ❌ ERROR | ❌ ERROR | ❌ ERROR | `Global fetch API unavailable; upgrade Node.js or provide a local spec path.` |

**Severity:** 🔴 CRITICAL  
**Resolution:** Ensure Node.js ≥18 for fetch support, verify network connectivity, and check remote URL accessibility. Tests 30–31 (OpenAPI) and 31 (AsyncAPI/Postgres) cover these boundaries.

#### 1.4 Parse Errors (Strict)

| Error Condition | OpenAPI | AsyncAPI | Postgres | Error Message |
|-----------------|---------|----------|----------|---------------|
| Invalid YAML syntax | ❌ ERROR | ❌ ERROR | ❌ ERROR | `Unable to parse spec (<filename>): <error>` |
| Completely invalid content | ❌ ERROR | ❌ ERROR | ❌ ERROR | `Unable to parse spec (<filename>): <error>` |

**Severity:** 🔴 CRITICAL  
**Resolution:** Validate spec file syntax using a JSON or YAML linter. Tests 13 in each boundary suite cover this failure mode.

### 2. Warnings (Build Succeeds with Degraded Output)

These conditions are handled gracefully, but result in empty or partial output.

#### 2.1 Graceful Fallback (JSON → YAML)

| Condition | OpenAPI | AsyncAPI | Postgres | Behavior |
|-----------|---------|----------|----------|----------|
| Invalid JSON (fallback to YAML) | ⚠️ WARNING | ⚠️ WARNING | ⚠️ WARNING | Attempts YAML parse; may succeed if valid YAML |
| Empty file | ⚠️ WARNING | ⚠️ WARNING | ⚠️ WARNING | Parses as empty YAML object; 0 items |

**Severity:** 🟡 WARNING  
**Observed Behavior:**
- **Tests 14 (all adapters):** Empty files are treated as empty YAML documents and produce valid catalogs with 0 items.
- **Tests 32 (all adapters):** Files with `.json` extensions that contain valid YAML content parse successfully via fallback, retaining correct counts.

**Resolution:** While the adapters gracefully handle these cases, it's recommended to provide valid JSON or YAML. Empty files produce empty catalogs with `itemsCount: 0`.

#### 2.2 Missing Optional Fields

| Condition | OpenAPI | AsyncAPI | Postgres | Behavior |
|-----------|---------|----------|----------|----------|
| Missing `info` section | ⚠️ WARNING | ⚠️ WARNING | ⚠️ WARNING | Uses default title/version |
| Missing `paths`/`channels`/`tables` | ⚠️ WARNING | ⚠️ WARNING | ⚠️ WARNING | `itemsCount: 0`, empty array |
| Null primary collection | ⚠️ WARNING | ⚠️ WARNING | ⚠️ WARNING | `itemsCount: 0`, empty array |
| Malformed items in collection | ⚠️ WARNING | ⚠️ WARNING | ⚠️ WARNING | Skips invalid items, processes valid ones |
| Missing `operationId`/`summary` | ⚠️ WARNING | N/A | N/A | `null` value in output |
| Missing `description` | N/A | ⚠️ WARNING | ⚠️ WARNING | `null` value in output |
| Missing `columns` array | N/A | N/A | ⚠️ WARNING | `columns: null` |

**Severity:** 🟡 WARNING  
**Resolution:** These are graceful degradations. The adapter produces a valid catalog but with reduced information. Add missing fields for complete output.

### 3. Unsupported Features

These features are not processed by the adapters but do not cause errors.

#### 3.1 OpenAPI Adapter

| Feature | Status | Behavior |
|---------|--------|----------|
| OpenAPI 2.0 (Swagger) | 🚫 UNSUPPORTED | Parses but doesn't recognize `swagger` field; uses default extraction logic |
| GraphQL introspection schemas | 🚫 UNSUPPORTED | Parses but finds no `paths`; produces `itemsCount: 0` |
| Remote fetch (without Node ≥18) | 🚫 UNSUPPORTED | Throws error: `Global fetch API unavailable` |

**Impact:** Specs using these features will produce incomplete or empty catalogs.

**Recommendation:** Use OpenAPI 3.0+ specifications. For GraphQL, use a different adapter type.

#### 3.2 AsyncAPI Adapter

| Feature | Status | Behavior |
|---------|--------|----------|
| AsyncAPI 1.x specs | 🚫 UNSUPPORTED | Uses `topics` instead of `channels`; produces `itemsCount: 0` |
| Server bindings (MQTT, Kafka, etc.) | 🚫 UNSUPPORTED | Ignored; not extracted to catalog |
| Message traits | 🚫 UNSUPPORTED | Ignored; not resolved or extracted |
| Operation traits | 🚫 UNSUPPORTED | Ignored; not resolved or extracted |
| `$ref` resolution | 🚫 UNSUPPORTED | References are not dereferenced |

**Impact:** Specs using these features will have channels counted but advanced features omitted.

**Recommendation:** Use AsyncAPI 2.x with simple channel definitions. Complex trait resolution requires preprocessing.

#### 3.3 Postgres Adapter

| Feature | Status | Behavior |
|---------|--------|----------|
| DDL constraints (FK, UNIQUE, etc.) | 🚫 UNSUPPORTED | Ignored; not extracted to catalog |
| Indexes | 🚫 UNSUPPORTED | Ignored; not extracted to catalog |
| Triggers | 🚫 UNSUPPORTED | Ignored; not extracted to catalog |
| Stored procedures | 🚫 UNSUPPORTED | Ignored; not extracted to catalog |
| Views | 🚫 UNSUPPORTED | Ignored; only tables/schema entries processed |
| Partitioning | 🚫 UNSUPPORTED | Ignored; not extracted to catalog |

**Impact:** Schemas with these features will have tables counted but advanced DDL features omitted.

**Recommendation:** Use simplified JSON/YAML schema definitions with table and column information only.

## Detailed Test Results

### OpenAPI Adapter (32 tests)

**Result:** 32/32 assertions pass.

- **Happy path coverage:** Tests 1–5 build the catalog, enforce capability overrides, and verify checksums and artifact emission.
- **Parameter validation:** Tests 6–9 assert that missing or null `specPath`/`outDir` values raise explicit errors.
- **File-system guarding:** Tests 10–12 cover missing files, directories passed as files, and absolute path handling.
- **Parse boundaries:** Test 13 confirms irrecoverably malformed input surfaces `Unable to parse spec`, while test 14 documents empty files producing empty catalogs (YAML fallback).
- **Schema edge cases:** Tests 15–27 exercise absent metadata, malformed operations, normalization, and very large specs (200 operations).
- **Unsupported feature probes:** Tests 28–29 show Swagger 2.0 and GraphQL introspection inputs degrade gracefully with zero operations.
- **Remote fetch boundaries:** Test 30 fails fast when `globalThis.fetch` is unavailable; test 31 surfaces HTTP 404 responses verbatim.

**Warning coverage:** Tests 14, 21–24, and 32 confirm that missing collections or metadata yield `itemsCount: 0` or `null` fields without throwing, matching the warning rows in the matrix.

**Unsupported feature coverage:** Tests 28–31 back the unsupported feature table for OpenAPI.

### AsyncAPI Adapter (32 tests)

**Result:** 32/32 assertions pass.

- **Happy path coverage:** Tests 1–5 validate catalog generation, adapter typing, channel counts, publish/subscribe flags, and capability overrides.
- **Parameter validation:** Tests 6–9 confirm required argument enforcement for `specPath` and `outDir`.
- **File-system guarding:** Tests 10–12 protect against missing files, invalid paths, and ensure relative paths resolve correctly.
- **Parse boundaries:** Test 13 defends against syntactically invalid input; test 14 documents empty files yielding empty channel catalogs.
- **Channel edge cases:** Tests 15–27 span missing collections, null entries, description fallbacks, bidirectional channels, bulk channel counts, and identifier normalization.
- **Unsupported feature probes:** Tests 28–30 capture AsyncAPI 1.x, server bindings, and trait usage being ignored gracefully.
- **Remote fetch boundary:** Test 31 verifies that environments without `globalThis.fetch` raise the documented error.

**Warning coverage:** Tests 14, 21–23, and 32 demonstrate graceful handling of empty collections and missing metadata, producing zero-count catalogs without throwing.

**Unsupported feature coverage:** Tests 28–31 underpin the AsyncAPI unsupported feature rows.

### Postgres Adapter (32 tests)

**Result:** 32/32 assertions pass.

- **Happy path coverage:** Tests 1–5 validate catalog generation, adapter typing, entity counts, metadata extraction, and capability overrides.
- **Parameter validation:** Tests 6–9 enforce required `specPath`/`outDir` inputs.
- **File-system guarding:** Tests 10–12 cover missing files, directory inputs, and relative path resolution.
- **Parse boundaries:** Test 13 asserts malformed content raises `Unable to parse spec`; test 14 captures empty files resolving to empty schemas.
- **Schema edge cases:** Tests 15–27 span absent tables, unnamed schemas, null collections, malformed entries, alternative schema maps, YAML parsing, empty datasets, column defaults, and large (100-table) catalogs.
- **Unsupported feature probes:** Tests 28–30 demonstrate that constraints, indexes, triggers, and procedures are ignored while tables continue to process.
- **Remote fetch boundary:** Test 31 validates that the adapter rejects remote specs when `globalThis.fetch` is unavailable.

**Warning coverage:** Tests 14–25 and 32 showcase graceful degradation scenarios, resulting in zero-count entities or null metadata without raising errors.

**Unsupported feature coverage:** Tests 28–31 substantiate the unsupported feature table for Postgres.

## Error Resolution Guide

### Quick Diagnosis

Use this flowchart to diagnose adapter errors:

```
Start: Adapter fails or produces unexpected output
  ↓
Q1: Does error mention "required"?
  → YES: Check specPath and outDir are provided
  → NO: Continue
  ↓
Q2: Does error mention "not found"?
  → YES: Verify file path exists and is readable
  → NO: Continue
  ↓
Q3: Does error mention "parse" or "Unable to parse"?
  → YES: Validate JSON/YAML syntax
  → NO: Continue
  ↓
Q4: Does error mention "fetch"?
  → YES: Check Node.js version ≥18, network, and URL
  → NO: Continue
  ↓
Q5: itemsCount is 0 but spec has content?
  → YES: Check for unsupported spec version or wrong adapter type
  → NO: Check test results for specific feature support
```

### Common Issues

#### Issue: "specPath is required"
**Cause:** Missing or null `specPath` parameter  
**Fix:** Provide a valid file path or URL as `specPath`

#### Issue: "Spec file not found: /path/to/spec"
**Cause:** File doesn't exist or path is incorrect  
**Fix:** Verify the file exists at the specified path

#### Issue: "Unable to parse spec"
**Cause:** Invalid JSON or YAML syntax  
**Fix:** Validate the spec file with a linter  
**Note:** Simple invalid JSON may fall back to YAML parsing

#### Issue: Empty catalog (itemsCount: 0)
**Cause:** Missing primary collection (paths/channels/tables) or unsupported spec version  
**Fix:** 
- Ensure the spec has `paths` (OpenAPI), `channels` (AsyncAPI), or `tables`/`schema` (Postgres)
- Verify spec version compatibility (OpenAPI 3.0+, AsyncAPI 2.x)

#### Issue: "Global fetch API unavailable"
**Cause:** Node.js version < 18 and trying to fetch remote spec  
**Fix:** Upgrade to Node.js 18+ or provide a local spec file

#### Issue: Missing metadata in output
**Cause:** Optional fields missing from spec  
**Fix:** This is a warning, not an error. Add missing fields (operationId, description, etc.) for complete output.

## Testing Strategy

### Running Boundary Tests

```bash
# Test all adapters
npm test -- tests/adapters/*.boundaries.spec.mjs

# Test specific adapter
npm test -- tests/adapters/openapi.boundaries.spec.mjs
npm test -- tests/adapters/asyncapi.boundaries.spec.mjs
npm test -- tests/adapters/postgres.boundaries.spec.mjs
```

### Adding New Boundary Tests

When adding new features or fixing bugs, follow this pattern:

1. **Happy Path Tests**: Verify feature works with valid input
2. **Missing Parameter Tests**: Verify errors for missing required inputs
3. **Invalid Input Tests**: Verify errors for malformed data
4. **Edge Case Tests**: Verify graceful handling of unusual but valid inputs
5. **Unsupported Feature Tests**: Document behavior for out-of-scope features

Each test should:
- Have a clear descriptive name
- Assert expected behavior (error, warning, or success)
- Include inline documentation explaining the boundary

### Test Maintenance

- Re-run boundary tests after adapter changes
- Update this matrix when test results change
- Add new sections for new adapter types
- Keep test count at ≥25 assertions per adapter

## Version Compatibility

| Adapter | Spec Format | Supported Versions | Notes |
|---------|-------------|-------------------|-------|
| OpenAPI | OpenAPI | 3.0.x, 3.1.x | Swagger 2.0 not fully supported |
| AsyncAPI | AsyncAPI | 2.0+, 2.6.0 tested | AsyncAPI 1.x not supported |
| Postgres | Custom | N/A (custom format) | Tables array or schema object |

## References

- **Test Files:**
  - `/tests/adapters/openapi.boundaries.spec.mjs`
  - `/tests/adapters/asyncapi.boundaries.spec.mjs`
  - `/tests/adapters/postgres.boundaries.spec.mjs`

- **Adapter Implementations:**
  - `/app/adapters/openapi/src/index.mjs`
  - `/app/adapters/asyncapi/src/index.mjs`
  - `/app/adapters/postgres/src/index.mjs`

- **Related Documentation:**
  - `/app/docs/adapters/` (adapter-specific docs)
  - `/docs/test-infrastructure.md` (testing guidelines)

## Changelog

### 2025-10-20 (Mission B18.14)
- Initial error matrix creation
- Documented all three adapters (OpenAPI, AsyncAPI, Postgres)
- 96 total boundary tests (32 per adapter)
- Pass rate: 100% (graceful behaviors validated via warnings)

---

**Document Status:** ✅ Complete  
**Next Review:** After adapter pack v2 release or major version changes  
**Maintained By:** Semantext Hub Core Team
