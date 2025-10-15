# Protocol Scaffolding Tool - Enhanced UX Guide

## Overview

The Protocol Scaffolding Tool generates protocol manifests, importers, and tests from templates with integrated validation, hints, and progress tracking powered by the Structured Feedback System.

## Key Features (B7.5.0)

### ✨ New in B7.5.0

- **Contextual Hints**: Real-time guidance during scaffold generation
- **Validation with Suggested Fixes**: Pre-write validation with actionable recovery steps
- **Progress Tracking**: Visual progress indicators for long-running operations
- **Correlation IDs**: Full traceability with `--trace` flag
- **Security Redaction**: Automatic redaction of sensitive data in previews
- **Enhanced Preview**: Validation results, warnings, and suggestions before writing

## Quick Start

### Interactive Mode (Recommended)

```bash
npm --prefix app run cli scaffold
```

The interactive mode will guide you through:
1. Selecting protocol type
2. Entering name and configuration
3. Previewing generated files with validation
4. Confirming file creation

### Non-Interactive Mode

```bash
npm --prefix app run cli scaffold -- --type api --name MyService
```

## Command Line Options

### Basic Options

| Option | Description | Default |
|--------|-------------|---------|
| `--type` | Protocol type (api, data, event, semantic, importer, test) | Required |
| `--name` | Component name | Required |
| `--description` | Protocol description | Auto-generated |
| `--version` | Semantic version | 1.0.0 |
| `--output` | Output directory | ./artifacts/scaffolds |

### Advanced Options

| Option | Description | Default |
|--------|-------------|---------|
| `--trace` | Enable trace mode with correlation IDs and feedback summary | false |
| `--verbose` | Show detailed output including hints and suggestions | false |
| `--dry-run` | Preview without writing files | false |
| `--force` | Overwrite existing files without prompting | false |
| `--examples` | Show usage examples | - |

## Usage Examples

### Generate API Protocol with Validation

```bash
npm --prefix app run cli scaffold -- \
  --type api \
  --name MyAPI \
  --baseUrl https://api.example.com \
  --trace \
  --verbose
```

**Output:**
```
🏗️  Protocol Scaffolder
──────────────────────────────────────────────────
Type: api
Name: MyAPI
Output: ./artifacts/scaffolds
Trace ID: abc123def456
──────────────────────────────────────────────────

📄 Files to be generated:
──────────────────────────────────────────────────
  ✓ artifacts/scaffolds/manifests/MyAPI.json (1234 bytes)
    ⚠️  1 warning(s)
       - API protocol should define at least one endpoint
    💡 Suggestions:
       - Add endpoint configuration with path and method
    🔍 Trace ID: abc123def456

  ✓ artifacts/scaffolds/importers/my-api-importer.js (2345 bytes)
    🔍 Trace ID: abc123def456

  ✓ artifacts/scaffolds/tests/my-api-importer.test.js (3456 bytes)
    🔍 Trace ID: abc123def456
──────────────────────────────────────────────────

💡 Minor warnings detected. Files are valid but could be improved.

📊 Feedback Summary:
──────────────────────────────────────────────────
Errors: 0
Hints: 3
Progress: 3 completed, 0 active
──────────────────────────────────────────────────

🔍 Trace abc123def456:
  Hints: 3
    - [SCAFFOLD_VALIDATION] Validate configuration before generating files
    - [SCAFFOLD_PREVIEW] Review generated files before writing to disk
    - [MANIFEST_WARNING] API protocol should define at least one endpoint
```

### Preview Data Protocol (Dry Run)

```bash
npm --prefix app run cli scaffold -- \
  --type data \
  --name LogFormat \
  --format json \
  --dry-run \
  --verbose
```

### Generate Event Protocol with Full Details

```bash
npm --prefix app run cli scaffold -- \
  --type event \
  --name Notifications \
  --transport websocket \
  --trace \
  --verbose
```

### Generate Standalone Importer

```bash
npm --prefix app run cli scaffold -- \
  --type importer \
  --name CustomFormat \
  --protocolType data
```

## Validation and Hints

### Configuration Validation

The scaffolder validates configuration before generation and provides:

1. **Error Detection**: Invalid names, versions, or protocol types
2. **Suggested Fixes**: Actionable recovery steps for each error
3. **Examples**: Valid values and formats

**Example:**

```bash
npm --prefix app run cli scaffold -- --type api --name "Invalid Name!" --version "bad-version"
```

**Output:**
```
❌ Configuration errors:
  - Name must contain only alphanumeric characters, hyphens, and underscores
  - Version must follow semver format (e.g., 1.0.0)

💡 Suggestions:
  - Example valid names: my-protocol, api_service, DataFormat123
  - Example valid versions: 1.0.0, 2.1.3, 0.1.0
```

### Manifest Validation

Generated manifests are validated against protocol schemas:

- **API Protocols**: Checks for baseUrl, endpoints
- **Data Protocols**: Checks for format specification
- **Event Protocols**: Checks for transport, events
- **Semantic Protocols**: Checks for vocabulary

**Validation Levels:**

- **Errors**: Missing required fields (blocks write)
- **Warnings**: Missing recommended fields (allows write)
- **Suggestions**: Improvements and best practices

## Common Hints Reference

### SCAFFOLD_VALIDATION
- **Severity**: INFO
- **Message**: "Validate configuration before generating files"
- **Triggered**: On every config validation
- **Action**: Review configuration for completeness

### SCAFFOLD_NAME_FORMAT
- **Severity**: WARNING/ERROR
- **Message**: "Protocol name should use alphanumeric characters, hyphens, and underscores only"
- **Triggered**: Invalid name format
- **Action**: Rename using valid characters

### SCAFFOLD_VERSION_FORMAT
- **Severity**: WARNING/ERROR
- **Message**: "Version must follow semver format (e.g., 1.0.0)"
- **Triggered**: Invalid version format
- **Action**: Use semantic versioning (MAJOR.MINOR.PATCH)

### SCAFFOLD_FILE_EXISTS
- **Severity**: WARNING
- **Message**: "Output file already exists. Use --force to overwrite"
- **Triggered**: File collision detected
- **Action**: Use `--force` or choose different name/output directory

### SCAFFOLD_PREVIEW
- **Severity**: INFO
- **Message**: "Review generated files before writing to disk"
- **Triggered**: Before file write
- **Action**: Review preview and validation results

## Progress Tracking

Progress tracking provides visibility into multi-step operations:

```
[1/3] Preparing manifest variables...
[2/3] Rendering manifest template...
[3/3] Validating manifest structure...
✅ Complete
```

Access progress via:
- Console output (automatic in verbose mode)
- Trace details (with `--trace` flag)
- Feedback summary (with `--trace` flag)

## Correlation IDs and Tracing

### Enable Trace Mode

```bash
npm --prefix app run cli scaffold -- --type api --name MyAPI --trace
```

### Benefits

1. **Full Traceability**: Track all feedback for a specific operation
2. **Debugging**: Identify issues across multiple components
3. **Audit Trail**: Record of validation, hints, and progress
4. **Integration**: Link with CI/CD and monitoring systems

### Trace Output

```
🔍 Trace abc123def456:
  Errors: 0
  Hints: 3
    - [SCAFFOLD_VALIDATION] Validate configuration before generating files
    - [SCAFFOLD_PREVIEW] Review generated files before writing to disk
    - [MANIFEST_WARNING] API protocol should define at least one endpoint
  Progress:
    - scaffold-manifest-abc123def456: COMPLETED (3/3 steps)
```

## Security and Redaction

Sensitive data is automatically redacted in previews:

- API Keys
- Passwords
- Tokens
- Authorization headers
- Private keys

**Redaction is enabled by default.** Disable with `--redact false` (not recommended for production).

## Performance Targets

The scaffolder is optimized for fast feedback:

- **Validation**: <100ms per config
- **Generation**: <50ms per file
- **Manifest Validation**: <50ms
- **CLI Render**: <20ms per 50 events

## Integration with Other Systems

### Catalog Index (B5.1)
- URN validation against registered protocols
- Default values from catalog entries

### Security Redaction (B5.2)
- Automatic redaction in logs and previews
- Pattern-based secret detection

### Feedback System (B7.4.0)
- Structured errors with recovery patterns
- Contextual hints and suggestions
- Progress tracking and correlation

## Error Handling

### Common Errors and Solutions

#### VALIDATION_FAILED (40122)
**Cause**: Configuration or manifest validation failed
**Solution**: Review validation errors and suggestions, correct input

#### INTERNAL_ERROR (50000)
**Cause**: Template rendering or file system error
**Solution**: Check template files, verify output directory permissions

#### CONFLICT (40109)
**Cause**: File already exists
**Solution**: Use `--force` to overwrite or choose different output

## Best Practices

### 1. Use Interactive Mode for Exploration
Start with interactive mode to understand options and see live validation.

### 2. Enable Trace for Complex Operations
Use `--trace --verbose` for detailed feedback and debugging.

### 3. Review Validation Before Writing
Always review preview and validation results in production workflows.

### 4. Use Dry Run for CI/CD
Test scaffold generation with `--dry-run` before writing files.

### 5. Follow Naming Conventions
Use kebab-case or snake_case for protocol names (e.g., `my-api`, `data_format`).

### 6. Version Semantically
Follow semver: `MAJOR.MINOR.PATCH` (e.g., `1.0.0`, `2.1.3`).

## Troubleshooting

### "Invalid name format" Error
- **Problem**: Name contains invalid characters
- **Solution**: Use only alphanumeric, hyphens, underscores
- **Example**: `my-api` ✅ `My API!` ❌

### "Version format error" Error
- **Problem**: Version doesn't follow semver
- **Solution**: Use `MAJOR.MINOR.PATCH` format
- **Example**: `1.0.0` ✅ `v1.0` ❌

### "Cannot write to directory" Error
- **Problem**: Output directory permissions issue
- **Solution**: Check permissions, try different output directory
- **Command**: `ls -la $(dirname OUTPUT_DIR)`

### Template Rendering Failed
- **Problem**: Template file missing or corrupted
- **Solution**: Verify template files exist in `app/templates/`
- **Check**: `ls app/templates/manifest-*.json`

## Advanced Configuration

### Custom Output Structure

```bash
npm --prefix app run cli scaffold -- \
  --type api \
  --name MyAPI \
  --output ./custom/path/scaffolds
```

### Type-Specific Options

#### API Protocol
```bash
--baseUrl https://api.example.com \
--authentication bearer \
--endpoint_path /v1/resource \
--endpoint_method GET
```

#### Data Protocol
```bash
--format json \
--compression gzip
```

#### Event Protocol
```bash
--transport websocket \
--event_name data.updated \
--event_description "Data update event"
```

#### Semantic Protocol
```bash
--vocabulary http://schema.org/ \
--ontology custom
```

## Next Steps

After scaffolding:

1. **Review Generated Files**: Check manifest, importer, and tests
2. **Customize Implementation**: Add business logic to importer
3. **Add Test Cases**: Expand test coverage
4. **Register Protocol**: Use `npm --prefix app run cli register` (B7.2.0)
5. **Run Tests**: `npm test`

## Related Documentation

- **Feedback System**: `app/feedback/README.md`
- **Error Codes**: `app/feedback/error-codes.js`
- **Security Redaction**: `app/src/security/README.md`
- **Templates**: `app/templates/`

## Changelog

### B7.5.0 (Current)
- ✅ Integrated FeedbackAggregator for hints and progress
- ✅ Added validation with suggested fixes
- ✅ Implemented correlation IDs and trace mode
- ✅ Enhanced preview with validation display
- ✅ Added security redaction for previews
- ✅ New hints: SCAFFOLD_VALIDATION, SCAFFOLD_NAME_FORMAT, etc.

### B7.4.0
- Structured feedback system foundation

### Previous
- Basic scaffold command with templates
