# Week 1 Build Sprint: Foundation & MVP
*Total Sprint: 5 days | 5 missions | Target: Working MVP with 2 APIs + 1 DB imported*

## Sprint Overview
- **B1.1**: OpenAPI Importer (Day 1-2)
- **B1.2**: Postgres Importer (Day 2-3)
- **B1.3**: CLI Foundation (Day 3-4)
- **B1.4**: Draft/Approve Workflow (Day 4-5)
- **B1.5**: Basic GOVERNANCE.md Generator (Day 5)

---

# Build Mission B1.1: OpenAPI Importer

## Mission Metadata
- **Session Type**: Build
- **Estimated Tokens**: 25k
- **Complexity**: Medium
- **Dependencies**: Research R1.1 (Pagination patterns)
- **Enables**: B1.3 (CLI), B1.5 (Governance)

## Token Budget Planning
```yaml
context_load:
  project_context: 2k
  api_protocol: 3k
  research_findings: 2k
  
generation_budget:
  implementation: 10k
  tests: 5k
  documentation: 2k
  
validation_reserve: 3k
total_estimated: 27k
```

## Research Foundation
Applied findings from research missions:
- **R1.1**: Pagination detection patterns (cursor, page, limit params)
- **R1.1**: LRO patterns (202 status, Location header, status endpoints)

## Implementation Scope

### Core Deliverable
```javascript
// importers/openapi_importer.js

function openAPIToAPIProtocol(oas, sourceUrl) {
  // Generate service URN
  const serviceUrn = generateServiceURN(oas.info);
  
  // Map endpoints with URN generation
  const endpoints = mapEndpoints(oas.paths, serviceUrn);
  
  // Extract authentication
  const auth = mapAuthentication(oas.security, oas.components);
  
  // Detect patterns
  const patterns = {
    pagination: detectPagination(oas.paths),
    longRunning: detectLongRunning(oas.paths)
  };
  
  return {
    service: {
      name: oas.info?.title,
      version: oas.info?.version,
      urn: serviceUrn
    },
    interface: { 
      authentication: auth,
      endpoints 
    },
    validation: { 
      schemas: extractSchemas(oas.components) 
    },
    metadata: { 
      status: 'draft',
      source_url: sourceUrl,
      fetched_at: new Date().toISOString(),
      source_hash: hash(oas),
      review_state: 'DISCOVERED'
    }
  };
}
```

### Out of Scope (Future Missions)
- GraphQL support
- OpenAPI 2.0 support
- Webhook detection
- Rate limit extraction

## Success Criteria
- [ ] Parse OpenAPI 3.x specs
- [ ] Generate valid URNs for service and endpoints
- [ ] Map authentication correctly
- [ ] Detect pagination in 80% of cases
- [ ] Output draft manifests with metadata

## Implementation Checklist
### Essential (This Session)
- [ ] OpenAPI parser setup
- [ ] URN generator
- [ ] Auth mapper
- [ ] Basic pagination detection
- [ ] Draft manifest output
- [ ] Core tests

### Deferred (Next Mission)
- [ ] Advanced LRO detection
- [ ] GraphQL support
- [ ] Performance optimization

## Deliverables
- `importers/openapi_importer.js`
- `importers/utils/urn_generator.js`
- `tests/openapi_importer.test.js`
- Sample output: `artifacts/github-api.draft.json`

---

# Build Mission B1.2: Postgres Importer

## Mission Metadata
- **Session Type**: Build
- **Estimated Tokens**: 28k
- **Complexity**: High
- **Dependencies**: Research R1.2 (PII patterns)
- **Enables**: B1.3 (CLI), B1.5 (Governance)

## Token Budget Planning
```yaml
context_load:
  project_context: 2k
  data_protocol: 3k
  research_findings: 3k
  
generation_budget:
  implementation: 12k
  tests: 5k
  documentation: 2k
  
validation_reserve: 3k
total_estimated: 30k
```

## Research Foundation
Applied findings from research missions:
- **R1.2**: PII regex patterns for email, phone, SSN, credit cards
- **R1.2**: Column name indicators (email, phone, ssn, dob, address)
- **R1.2**: Sampling strategies for null rates

## Implementation Scope

### Core Deliverable
```javascript
// importers/postgres_importer.js

async function postgrestoDataProtocol(connectionString) {
  const client = new Client(connectionString);
  await client.connect();
  
  // Introspect schema
  const tables = await introspectTables(client);
  const columns = await introspectColumns(client);
  const constraints = await introspectConstraints(client);
  
  // Sample data quality
  const quality = await sampleDataQuality(client, tables);
  
  // Detect PII
  const piiFields = detectPII(columns);
  
  // Generate URNs
  const datasetUrn = generateDatasetURN(connectionString);
  
  return {
    dataset: {
      name: extractDatasetName(connectionString),
      type: 'database',
      urn: datasetUrn
    },
    schema: {
      primary_key: extractPrimaryKeys(constraints),
      fields: mapFields(columns, piiFields),
      keys: mapConstraints(constraints)
    },
    quality,
    governance: {
      policy: {
        classification: piiFields.length > 0 ? 'pii' : 'internal'
      }
    },
    metadata: {
      status: 'draft',
      source_url: sanitizeConnectionString(connectionString),
      fetched_at: new Date().toISOString(),
      source_hash: hashSchema(tables, columns),
      review_state: 'DISCOVERED'
    }
  };
}
```

### Out of Scope (Future Missions)
- MySQL support
- NoSQL databases
- Data profiling beyond sampling
- Lineage detection

## Success Criteria
- [ ] Connect to Postgres read-only
- [ ] Introspect schema completely
- [ ] Detect PII with 90% accuracy
- [ ] Sample null rates efficiently
- [ ] Generate valid dataset URNs

## Implementation Checklist
### Essential (This Session)
- [ ] Postgres client setup
- [ ] Schema introspection queries
- [ ] PII detection logic
- [ ] Quality sampling
- [ ] URN generation
- [ ] Core tests

### Deferred (Next Mission)
- [ ] Connection pooling
- [ ] Advanced PII heuristics
- [ ] Performance optimization

## Deliverables
- `importers/postgres_importer.js`
- `importers/utils/pii_detector.js`
- `importers/utils/quality_sampler.js`
- `tests/postgres_importer.test.js`
- Sample output: `artifacts/billing-db.draft.json`

---

# Build Mission B1.3: CLI Foundation

## Mission Metadata
- **Session Type**: Build
- **Estimated Tokens**: 22k
- **Complexity**: Medium
- **Dependencies**: B1.1, B1.2 (Importers)
- **Enables**: B1.4 (Approval), B1.5 (Governance)

## Token Budget Planning
```yaml
context_load:
  project_context: 2k
  importer_apis: 3k
  
generation_budget:
  implementation: 10k
  tests: 4k
  documentation: 2k
  
validation_reserve: 3k
total_estimated: 24k
```

## Implementation Scope

### Core Deliverable
```javascript
#!/usr/bin/env node
// cli/index.js

const program = require('commander');
const { openAPIToAPIProtocol } = require('../importers/openapi_importer');
const { postgrestoDataProtocol } = require('../importers/postgres_importer');

program
  .name('protocol-discover')
  .version('0.1.0');

program
  .command('api <url>')
  .option('--out <file>', 'output file path')
  .action(async (url, options) => {
    const spec = await fetchOpenAPI(url);
    const manifest = openAPIToAPIProtocol(spec, url);
    await saveManifest(manifest, options.out || 'api-manifest.draft.json');
  });

program
  .command('db <connection>')
  .option('--out <file>', 'output file path')
  .action(async (connection, options) => {
    const manifest = await postgrestoDataProtocol(connection);
    await saveManifest(manifest, options.out || 'data-manifest.draft.json');
  });

// Basic generate commands
program
  .command('generate sdk <manifest>')
  .option('--out <dir>', 'output directory')
  .action(async (manifestPath, options) => {
    const manifest = await loadManifest(manifestPath);
    if (manifest.metadata?.status === 'draft') {
      console.error('Error: Cannot generate from draft manifest. Run protocol-approve first.');
      process.exit(1);
    }
    await generateSDK(manifest, options.out || './sdk');
  });
```

### Out of Scope (Future Missions)
- AsyncAPI command
- Web UI command
- CI mode

## Success Criteria
- [ ] CLI runs without installation issues
- [ ] Discovers APIs successfully
- [ ] Discovers databases successfully
- [ ] Blocks generation on drafts
- [ ] Clear error messages

## Implementation Checklist
### Essential (This Session)
- [ ] Commander.js setup
- [ ] discover api command
- [ ] discover db command
- [ ] Basic generate commands
- [ ] Error handling
- [ ] Help text

### Deferred (Next Mission)
- [ ] Progress indicators
- [ ] Colored output
- [ ] Verbose mode

## Deliverables
- `cli/index.js`
- `cli/utils/fetcher.js`
- `cli/utils/file_ops.js`
- `package.json` with bin entry
- `tests/cli.test.js`

---

# Build Mission B1.4: Draft/Approve Workflow

## Mission Metadata
- **Session Type**: Build
- **Estimated Tokens**: 20k
- **Complexity**: Medium
- **Dependencies**: B1.3 (CLI)
- **Enables**: B1.5 (Governance), Week 2 missions

## Token Budget Planning
```yaml
context_load:
  project_context: 2k
  cli_structure: 2k
  research_findings: 1k
  
generation_budget:
  implementation: 9k
  tests: 4k
  documentation: 2k
  
validation_reserve: 2k
total_estimated: 22k
```

## Research Foundation
Applied findings from research missions:
- **R1.4**: Review state machine patterns
- **R1.4**: JSON-Patch for suggestions

## Implementation Scope

### Core Deliverable
```javascript
// cli/commands/review.js

async function reviewManifest(draftPath) {
  const draft = await loadManifest(draftPath);
  const suggestions = generateSuggestions(draft);
  
  console.log('\n📋 Manifest Review\n');
  console.log(`Name: ${draft.service?.name || draft.dataset?.name}`);
  console.log(`Status: ${draft.metadata?.review_state}`);
  console.log(`Source: ${draft.metadata?.source_url}`);
  
  if (suggestions.length > 0) {
    console.log('\n💡 Suggestions:\n');
    suggestions.forEach(s => {
      const icon = s.severity === 'error' ? '❌' : 
                   s.severity === 'warn' ? '⚠️' : 'ℹ️';
      console.log(`${icon} ${s.message}`);
      console.log(`   Path: ${s.path}`);
      console.log(`   Suggestion: ${s.suggestion}`);
    });
  }
  
  // Save suggestions for approval
  await saveSuggestions(draftPath, suggestions);
}

// cli/commands/approve.js

async function approveManifest(draftPath, options) {
  const draft = await loadManifest(draftPath);
  const suggestions = await loadSuggestions(draftPath);
  
  // Apply accepted patches
  const accepted = parseAccepted(options.accept);
  const rejected = parseRejected(options.reject);
  
  const patches = suggestions
    .filter(s => accepted.includes(s.id))
    .map(s => s.patch);
  
  const approved = applyPatches(draft, patches);
  
  // Update metadata
  approved.metadata.status = 'approved';
  approved.metadata.review_state = 'APPROVED';
  approved.metadata.approved_by = options.approvedBy;
  approved.metadata.approved_at = new Date().toISOString();
  approved.metadata.patches_applied = patches;
  
  await saveManifest(approved, options.final);
  
  // Save to overrides for future imports
  await updateOverrides(draft.metadata.source_url, patches);
}
```

### Out of Scope (Future Missions)
- Visual diff viewer
- Interactive approval
- Bulk approvals

## Success Criteria
- [ ] Review prints clear summary
- [ ] Suggestions are actionable
- [ ] Partial approval works
- [ ] Overrides file updated
- [ ] State transitions correct

## Implementation Checklist
### Essential (This Session)
- [ ] Review command
- [ ] Suggestions generator
- [ ] Approve command
- [ ] Patch applicator
- [ ] Overrides updater

### Deferred (Next Mission)
- [ ] Interactive mode
- [ ] Diff visualization
- [ ] Rollback capability

## Deliverables
- `cli/commands/review.js`
- `cli/commands/approve.js`
- `cli/utils/suggestions.js`
- `cli/utils/patches.js`
- `tests/workflow.test.js`

---

# Build Mission B1.5: Basic GOVERNANCE.md Generator

## Mission Metadata
- **Session Type**: Build
- **Estimated Tokens**: 18k
- **Complexity**: Low-Medium
- **Dependencies**: B1.1-B1.4 (All previous)
- **Enables**: Week 2 ProtocolGraph enhancement

## Token Budget Planning
```yaml
context_load:
  project_context: 2k
  manifest_formats: 2k
  
generation_budget:
  implementation: 8k
  tests: 3k
  documentation: 2k
  
validation_reserve: 2k
total_estimated: 19k
```

## Implementation Scope

### Core Deliverable
```javascript
// governance/generator.js

function generateGovernanceReport(manifests) {
  const report = [];
  
  report.push('# GOVERNANCE.md');
  report.push(`*Generated: ${new Date().toISOString()}*\n`);
  
  // Security Posture
  report.push('## 🔐 Security Posture\n');
  manifests.filter(m => m.interface).forEach(api => {
    const auth = api.interface?.authentication?.type || 'none';
    const icon = auth === 'none' ? '❌' : '✅';
    report.push(`- ${icon} **${api.service.name}**: ${auth} authentication`);
    
    if (api.interface?.endpoints) {
      const noErrors = api.interface.endpoints.filter(e => !e.errors?.length);
      if (noErrors.length > 0) {
        report.push(`  - ⚠️ ${noErrors.length} endpoints without error handling`);
      }
    }
  });
  
  // PII Summary
  report.push('\n## 🔍 PII Exposure\n');
  const piiFields = [];
  manifests.filter(m => m.schema).forEach(data => {
    Object.entries(data.schema.fields || {}).forEach(([field, spec]) => {
      if (spec.pii) {
        piiFields.push({
          dataset: data.dataset.name,
          field,
          urn: data.dataset.urn
        });
      }
    });
  });
  
  if (piiFields.length > 0) {
    report.push(`**${piiFields.length} PII fields detected:**\n`);
    piiFields.forEach(pii => {
      report.push(`- \`${pii.dataset}.${pii.field}\``);
    });
  }
  
  // Delivery & Resilience
  report.push('\n## 📦 Delivery & Resilience\n');
  manifests.filter(m => m.delivery).forEach(event => {
    const dlq = event.delivery?.contract?.dlq;
    const guarantees = event.delivery?.contract?.guarantees;
    const icon = dlq ? '✅' : '❌';
    report.push(`- ${icon} **${event.event.name}**: ${guarantees || 'unknown'} delivery`);
    if (!dlq && guarantees !== 'best-effort') {
      report.push(`  - ⚠️ Missing DLQ for retryable event`);
    }
  });
  
  // Provenance
  report.push('\n## 📝 Provenance\n');
  manifests.forEach(m => {
    report.push(`- **${m.service?.name || m.dataset?.name || m.event?.name}**`);
    report.push(`  - Source: ${m.metadata?.source_url}`);
    report.push(`  - Fetched: ${m.metadata?.fetched_at}`);
    report.push(`  - Status: ${m.metadata?.status}`);
  });
  
  return report.join('\n');
}
```

### Out of Scope (Future Missions)
- ProtocolGraph integration
- PII tracing paths
- Breaking change detection

## Success Criteria
- [ ] Generates valid Markdown
- [ ] Shows security posture
- [ ] Lists PII fields
- [ ] Shows provenance
- [ ] Actionable findings

## Implementation Checklist
### Essential (This Session)
- [ ] Report generator
- [ ] Security section
- [ ] PII section
- [ ] Provenance section
- [ ] CLI integration

### Deferred (Week 2)
- [ ] ProtocolGraph tracing
- [ ] URN cross-references
- [ ] Severity scoring

## Deliverables
- `governance/generator.js`
- `cli/commands/report.js`
- `tests/governance.test.js`
- Sample: `artifacts/GOVERNANCE.md`

---

# Sprint Success Validation

## End-to-End Test (Day 5 afternoon)
```bash
# Import public APIs
protocol-discover api https://api.github.com/openapi.json --out artifacts/github.draft.json
protocol-discover api https://petstore.swagger.io/v2/swagger.json --out artifacts/petstore.draft.json

# Import test database
protocol-discover db postgresql://readonly:pass@demo.db/testdb --out artifacts/testdb.draft.json

# Review and approve
protocol-review artifacts/github.draft.json
protocol-approve artifacts/github.draft.json \
  --accept pagination --accept auth \
  --final artifacts/github.json \
  --approved-by "Team"

# Generate governance report
protocol-report governance "artifacts/*.json" --out artifacts/GOVERNANCE.md

# Verify SDK generation blocked on drafts
protocol-generate sdk artifacts/petstore.draft.json  # Should fail
protocol-generate sdk artifacts/github.json --out sdk/  # Should succeed
```

## Week 1 Deliverables Checklist
- [ ] OpenAPI importer with URN generation
- [ ] Postgres importer with PII detection
- [ ] CLI with discover/review/approve commands
- [ ] Draft → Approve workflow
- [ ] Basic GOVERNANCE.md generation
- [ ] 2 APIs + 1 DB successfully imported
- [ ] All tests passing

## Handoff to Week 2
```json
{
  "completed": [
    "Basic importers (OpenAPI, Postgres)",
    "CLI foundation",
    "Draft/Approve workflow",
    "Basic governance reporting"
  ],
  "ready_for_week2": [
    "ProtocolGraph implementation",
    "Advanced validators",
    "Community overrides",
    "Curated seeds"
  ],
  "technical_debt": [
    "Pagination detection needs refinement",
    "PII heuristics need expansion",
    "No progress indicators yet"
  ]
}
```

---
*Sprint Plan Created: 2024-01-15*
*Target Completion: End of Week 1*
*Next Sprint: Week 2 - Protocol Glue & Governance*