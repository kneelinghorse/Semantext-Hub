# Draft/Review/Approve Workflow Patterns for Protocol Management

Production systems managing review workflows require coordinated state machines, flexible change formats, granular approval tracking, comprehensive audit trails, and replayable override rules. This research synthesizes patterns from GitHub, GitLab, Phabricator, AWS, and other platforms into actionable designs for protocol management systems handling API, Data, Event, and Semantic protocols.

## State machine architecture delivers deterministic review flows

The recommended state machine balances flexibility with determinism through seven states and twelve guarded transitions. **DISCOVERED** serves as the entry point when changes are first identified, transitioning to **IN_REVIEW** once basic validation passes. The **PARTIAL** state handles the common scenario where some reviewers approve while others remain pending—critical for async distributed teams. **APPROVED** requires all required approvals with passing CI checks before progressing to **DEPLOYED**, the terminal success state. Two terminal failure states complete the model: **REJECTED** for explicitly denied changes and **STALE** for abandoned reviews exceeding inactivity thresholds.

State transitions employ guards extensively. The **submit_for_review** transition validates basic requirements before moving DISCOVERED→IN_REVIEW. The **receive_partial_approval** transition fires when at least one approval exists but required approvals remain unmet, creating the PARTIAL state. The **receive_full_approval** transition requires all approvals, no blocking change requests, passed CI checks, and resolved merge conflicts. The **request_changes** transition returns any state to IN_REVIEW, optionally clearing existing approvals based on staleness policies. The **update_revision** transition handles new commits by re-evaluating approval validity and re-triggering automated checks. The **deploy** transition enforces final deployment checks before marking changes DEPLOYED. **Reopen** transitions allow moving rejected or stale reviews back to IN_REVIEW with proper justification.

GitHub's approach dismisses stale approvals when new commits push, using content-based comparison via file diff SHA rather than commit SHA—their "intelligent dismissal" preserves approvals for pure rebases while invalidating them for code changes. GitLab tracks patch_id_sha for similar content tracking. Meta's research shows automated nudging reduces review time by 7% for reviews exceeding three days, while reviewer recommendation algorithms improved from 60% to 75% top-3 accuracy through machine learning.

Multi-tier timeout systems prevent reviews from languishing. **DISCOVERED** state uses 3-day warnings escalating to 14-day staleness. **IN_REVIEW** triggers 24-hour nudges, 3-day escalations, and 14-day staleness. **PARTIAL** allows 48-hour nudges before 10-day staleness given progress already exists. **APPROVED** most aggressively manages timeouts with 24-hour warnings leading to 7-day staleness, reflecting urgency of deploying already-approved changes. Inactivity scores weight time since last commit (30%), time since last comment (20%), time since last review (30%), with CI failures applying 2x multipliers and merge conflicts 3x multipliers.

Concurrent review handling employs optimistic locking with SHA validation, atomic approval operations using row-level database locks, and idempotent operations enabling safe retries. The state synchronization period (GitLab's approvals_syncing) prevents race conditions during simultaneous reviews. Event sourcing provides complete audit trails for reconstructing review history.

Error handling follows fail-fast principles with explicit exceptions containing recovery context. The Saga pattern provides compensation actions: submit_for_review compensates with cancel_ci + remove_assignments, deploy compensates with rollback_deployment + revert_merge. Dead letter queues capture permanent failures with full context for manual intervention. Distributed locks using Redis Redlock or DynamoDB prevent concurrent processing of the same state transition.

Notification strategies employ multi-channel delivery: review_requested sends in-app + email, approval_received uses in-app only, changes_requested sends in-app + email, review_overdue escalates to Slack + email, critical issues add SMS. Four-level escalation chains start with gentle 24-hour reminders, progress to firm 48-hour Slack notifications, escalate to team leads at 72 hours, involve engineering managers at 96 hours with incident creation, and auto-close at 7 days with complete audit trails. Throttling prevents alert fatigue by limiting notifications to 3 per hour per user per review, using digest mode for batching, respecting user preferences and quiet hours.

## JSON-Patch provides precise, atomic protocol modifications

RFC 6902 defines six operation types enabling granular control over protocol changes. **Add operations** insert or replace values with syntax `{op: "add", path: "/baz", value: "qux"}`, supporting object property addition and array insertion via the special path "/array/-" for appending. **Remove operations** delete values, causing array elements to shift left after removal. **Replace operations** functionally combine remove + add but require the target to exist. **Move operations** relocate values atomically with `{op: "move", from: "/a/b/c", path: "/a/b/d"}`, preventing moves into child paths. **Copy operations** duplicate values from source to destination. **Test operations** enable conditional validation via `{op: "test", path: "/baz", value: "qux"}`, critical for optimistic concurrency control—test failures abort entire patches.

JSON Pointer paths (RFC 6901) target specific locations using forward-slash notation like `/users/0/name`. Special characters require escaping: `~0` represents tilde, `~1` represents slash. Patches apply sequentially with strict atomicity—any operation failure aborts the entire patch, ensuring data integrity.

Schema modifications demonstrate practical application. Adding new protocol fields: `{op: "add", path: "/properties/newField", value: {type: "string", description: "..."}}`. Removing deprecated fields: `{op: "remove", path: "/properties/oldField"}`. Type corrections: `{op: "replace", path: "/properties/userId/type", value: "integer"}`. Nullability changes: `{op: "add", path: "/properties/email/nullable", value: false}`.

PII classifications apply JSON-Patch for field-level annotations: `{op: "add", path: "/properties/ssn/x-pii", value: true}` marks Social Security Numbers as PII. Sensitivity levels use: `{op: "replace", path: "/properties/creditCard/x-sensitivity", value: "critical"}`. Category assignments employ: `{op: "add", path: "/properties/email/x-pii-category", value: "contact-info"}`.

Pagination hints embed operational metadata: `{op: "add", path: "/x-pagination/style", value: "cursor"}` specifies cursor-based pagination. Maximum limits use: `{op: "add", path: "/x-pagination/maxPageSize", value: 100}`. Default values employ: `{op: "add", path: "/x-pagination/defaultPageSize", value: 20}`.

Auth corrections leverage test operations for safety: `{op: "test", path: "/security/0/oauth2/0", value: "read:users"}` verifies current scopes before `{op: "add", path: "/security/0/oauth2/-", value: "write:users"}` adds new scopes. Removing stale scopes uses array index removal: `{op: "remove", path: "/security/0/oauth2/2"}`.

Relationship links establish protocol connections: `{op: "add", path: "/components/schemas/User/properties/orders", value: {$ref: "#/components/schemas/Order"}}` creates schema relationships. URN references use: `{op: "add", path: "/x-relationships/0", value: {type: "belongsTo", target: "urn:protocol:Order"}}`.

Performance benchmarks show fast-json-patch processing **6 million operations per second** in optimized JavaScript implementations. Applying patches operates O(n) where n equals operation count. Generating diffs proves more expensive but efficient compared to wholesale replacement. Schema-driven optimization (fast-json-schema-patch) uses diff plans based on JSON Schema, choosing optimal array diffing strategies like longest common subsequence versus primary key matching. Bandwidth reduction reaches 90-99% compared to full document replacement—a 100KB protocol schema typically requires only 1-10KB of patches.

Three-way merge enables conflict resolution by storing patch history. CouchDB's pattern reconstructs common ancestors by applying reverse patches, generates forward patches from ancestor to both conflicting versions, compares patches to detect field-level conflicts, and merges non-conflicting changes automatically. Optimistic concurrency control employs version fields: `{op: "test", path: "/version", value: 5}` verifies current version before `{op: "replace", path: "/version", value: 6}` increments it, returning 409 Conflict on mismatch. ETag-based approaches use HTTP If-Match headers. Elasticsearch sequence numbers provide similar guarantees: `POST /index/_update/doc?if_seq_no=10&if_primary_term=1`.

JSON Merge Patch (RFC 7386) offers simpler alternatives for basic updates, using recursive merge where patch objects mirror target structure. The patch `{a: "z", c: {f: null}}` applied to `{a: "b", c: {d: "e", f: "g"}}` yields `{a: "z", c: {d: "e"}}`. While simpler and more compact, Merge Patch cannot set explicit nulls (null means delete), cannot update array elements (must replace entire array), lacks conditional operations, and provides no move/copy capabilities. Use Merge Patch for simple field updates in large objects, JSON-Patch for protocol management requiring precision and atomicity.

## Granular approval mechanisms enable flexible review workflows

Three granularity levels serve different needs. **Chunk-level** (GitHub suggestions) allows line-range approvals up to 200 lines, supporting batch commits of multiple suggestions with co-authorship tracking. Suggestions invalidate when base code changes, requiring re-review. **Patch set level** (Gerrit) treats each commit as an atomic change with multiple patch sets representing iterations. Label-based voting (Code-Review: -2 to +2, Verified: -1 to +1) enables multi-dimensional approval. **Merge request level** (GitLab) approves entire change sets with branch-specific rules, CODEOWNERS integration, and policy-based automation for security and coverage gates.

Dependency tracking requires explicit modeling. Changes decompose into granular units (files, chunks, fields) with typed dependencies: *requires* creates mandatory co-approval groups, *conflicts* marks mutually exclusive changes, *suggests* recommends related changes without enforcement. Graph traversal identifies connected components where all units must reach identical approval states. Cascading rejection automatically rejects all dependent units when rejecting a dependency source, preventing orphaned changes. Soft dependencies (GitHub's default) warn but don't block inconsistent application, placing responsibility on authors.

The core data structure tracks approval state at multiple levels:

```javascript
{
  changeRequest: {
    id: "CR-12345",
    status: "open" | "approved" | "rejected" | "partial",
    units: [{
      id: "unit-1",
      type: "chunk" | "file" | "field",
      path: "src/api/users.proto:45-60",
      approvals: [{
        reviewer: "user-123",
        decision: "approve" | "reject" | "abstain",
        timestamp: "2025-09-30T14:23:00Z",
        comment: "LGTM with condition",
        conditions: ["unit-2 must also approve"]
      }],
      dependencies: {
        requires: ["unit-2"],
        conflicts: ["unit-5"],
        suggests: ["unit-4"]
      },
      computed: {
        canMerge: boolean,
        blockingIssues: string[]
      }
    }],
    rules: {
      strategy: "all-approve" | "majority" | "weighted" | "role-based",
      minimumApprovers: 2,
      requiredRoles: ["senior-eng", "security"],
      labels: {
        "Code-Review": {min: -2, max: 2, blocking: -2, required: 2},
        "Security": {min: -1, max: 1, required: 1}
      }
    }
  }
}
```

The approval algorithm evaluates in four phases. **Phase 1** evaluates each unit against approval rules, checking threshold requirements, detecting blocking rejections, and marking potentially mergeable units. **Phase 2** resolves dependencies by finding connected components in the dependency graph—all units in a component must be approvable with no cross-unit conflicts. **Phase 3** handles reviewer conflicts by applying configured resolution strategies: tech-lead-override gives highest authority final say (Google's approach), discussion requires human intervention, veto-wins blocks on single rejection (Gerrit -2), supermajority requires 2:1 or 3:1 approval ratios. **Phase 4** determines final merge readiness based on mergeable units, absence of blocking issues, and satisfaction of global rules.

Approval strategies vary by context. **All-approve** requires zero rejections and minimum approver count. **Majority** requires approval count exceeding total votes divided by two. **Role-based** (CODEOWNERS style) requires approvals from all specified roles—backend-team for API changes, security-team for auth changes. **Weighted** (Gerrit labels) aggregates scores where two +1s don't equal one +2, preventing gaming while allowing flexible rules.

Rollback strategies address partial deployment failures. **Atomic rollback** (Gerrit style) treats each merge as a single commit, enabling clean git revert operations. **Batch rollback** (GitHub) reverts entire suggestion batches while preserving original suggestions in PR history for re-application. **Selective rollback** checks dependencies before creating inverse patches for specific units, applies patches in reverse dependency order via topological sort, and clears approval state on rolled-back units.

Reviewer conflict resolution follows established patterns. Google's standard prioritizes data over opinions, defers to style guides for objective rules, respects author consistency when no rule exists, and escalates to tech leads for final decisions. Gerrit's blocking votes give single reviewers veto power via -2 scores, while requiring explicit score thresholds (two +1s don't aggregate to +2). Conditional approvals enable nuanced review: "approved if unit-X also approved" handles cross-cutting concerns.

Permission models use role-based access control. Junior developers suggest changes but lack approval weight. Senior developers approve team changes and non-breaking modifications with weight 1. Tech leads approve anything, override conflicts, carry weight 2, and wield veto power. Security teams hold required approval authority for security-related files (*.auth.*, *.crypto.*) with veto power over any security change. CODEOWNERS integration automatically assigns domain experts: /api/** routes to backend-team, /ui/** to frontend-team, *.security.* to security-team with veto power.

Production systems demonstrate optimal granularity trade-offs. GitHub suggestions excel for quick fixes under 50 lines. Gerrit patch sets balance atomic review with iteration tracking for changes under 400 lines. GitLab merge requests handle larger features requiring holistic review. The key principle: minimize approval scope for faster reviews while maintaining coherence.

## Comprehensive audit trails ensure compliance and accountability

Enterprise audit log schemas capture identity, events, resources, and context. **Identity fields** include principalId (unique user/service identifier), principalType (IAMUser, ServiceAccount), userName (human-readable), accountId (organization), sessionContext (MFA status), and impersonator (for assumed-role scenarios). **Event metadata** tracks eventId (UUID), eventTime (ISO 8601), eventType (AwsApiCall, AdminActivity), eventCategory (Management, Security, Data), and eventVersion (schema version). **Action and resource fields** specify actionType (create, update, delete, approve, reject), resourceId (target identifier), resourceType (Project, User, Protocol), resourceName (human-readable), and scope (organizational hierarchy). **Request and response data** stores requestParameters (input JSON), responseElements (output JSON), errorCode and errorMessage (for failures), and statusCode (HTTP-style). **Review-specific fields** capture reviewers array, approvers array, reviewDecision (Approved/Rejected/NeedsChanges), approvalTime, changeReason (justification), oldValue (pre-change state), and newValue (post-change state). **Context fields** record sourceIPAddress, userAgent, location/awsRegion, requestId (correlation), and tlsDetails (version, cipher suite).

Event types span authentication (login, MFA, sessions), authorization (permission grants, role assignments, policy modifications, access denials), change management (resource CRUD, configuration changes), review workflow (review requested/completed, approvals granted/rejected, changes requested, delegations, timeouts), and administration (user management, service accounts, API keys, certificates). GitLab tracks 400+ distinct event types including project access changes, deploy key operations, branch protection modifications, merge request approvals, and repository clones.

Query optimization employs strategic indexing. **Primary indexes** use B-trees for eventTime (time-range queries), principalId (user activity), resourceId (resource history), and eventType (event filtering). **Composite indexes** accelerate common patterns: (principalId, eventTime) for user activity timelines, (resourceId, eventTime) for resource change history, (eventType, eventTime) for event analysis, (accountId, eventTime) for account-level queries. **Secondary indexes** support correlation via requestId, security analysis via sourceIPAddress, and failure analysis via errorCode. Columnar storage using ORC or Parquet provides 10-100x compression versus row format with efficient column projection for analytical queries.

Retention policies align with compliance requirements. SOC 2 mandates 1-year minimum (typically 1-3 years), ISO 27001 requires 3 years (typically 3-7), HIPAA demands 6 years, PCI DSS specifies 3 months hot + 1 year total (typically 3 years), SOX requires 7 years, GDPR varies by need, and FISMA mandates 3 years. Production systems default differently: AWS CloudTrail provides 90 days free event history with up to 10 years via CloudTrail Lake, Google Cloud stores Admin Activity logs indefinitely with 30-day default for Data Access, Azure defaults to 90 days, GitHub Enterprise retains 180 days, and GitLab stores indefinitely without auto-expiration.

Tiered storage architecture balances cost and performance. **Hot storage** (0-90 days) uses SSD and in-memory caches for real-time monitoring with millisecond query latency at highest cost, typically Splunk or Elasticsearch. **Warm storage** (90 days to 1 year) employs standard cloud storage like S3 Standard or Azure Blob with second-latency queries at medium cost. **Cold storage** (1+ years) uses S3 Glacier or Azure Archive for long-term compliance with minute-to-hour query latency at minimal cost. Automated lifecycle policies transition logs through tiers: day 0 enters hot storage with full indexing, day 30 transitions to warm with reduced indexing, day 365 moves to cold in archive format, day 2555+ deletes after retention period expires.

Immutability mechanisms prevent tampering. **Write-Once Read-Many** (WORM) storage uses AWS S3 Object Lock with retention/legal hold, Azure Immutable Blobs with policy-based protection, and Google Cloud Bucket Lock for permanent retention. **Append-only systems** prohibit update/delete operations, use monotonically increasing sequence numbers, and employ distributed consensus (Raft, Paxos). **Database-level** approaches include Amazon QLDB's cryptographic journal, temporal tables with system versioning, and event sourcing treating all changes as immutable events.

Cryptographic verification employs hash chains where `Entry[N].hash = SHA256(Entry[N].data + Entry[N-1].hash)`, creating tamper-evident structures that break on any modification while guaranteeing chronological ordering. Digital signatures sign each log entry or batch with private keys, use timestamp authorities for non-repudiation, and leverage PKI for key management. Merkle trees group entries into tree structures where the root hash provides compact verification and efficient partial verification.

AWS CloudTrail implements verification through hourly digest files containing log file hashes with digital signatures, validated via `aws cloudtrail validate-logs` to detect tampering or missing files. Google Cloud explicitly states "Log entries written by Cloud Audit Logs are immutable" with no modification or deletion possible. Amazon QLDB provides an immutable journal with built-in proof generation using hash chains for cryptographic integrity.

Performance optimization strategies include asynchronous logging to in-memory buffers with batch disk/network flushes (reducing application latency), buffered writers using 8KB+ buffers, write-ahead logging to fast sequential media with asynchronous structured storage processing, and message queue patterns decoupling applications from logging infrastructure. The pattern `App → Local Buffer → Agent → Kafka/Kinesis → Stream Processor → Storage (Hot + Archive)` handles burst traffic, enables multiple consumers, and provides fault tolerance with replay capability.

Volume reduction techniques employ sampling (100% critical events, 1% routine events using consistent hashing), filtering at source (blacklist noisy events, whitelist critical types before network transmission), aggregation (store summaries rather than raw high-frequency events), and deduplication (content-based hashing to reference first occurrences). Database-specific tuning includes MongoDB's selective audit event enabling with filters excluding low-value events (5% overhead default versus 30-50% full auditing), PostgreSQL pgAudit's session versus object auditing with dedicated tablespaces, and MySQL/MariaDB audit plugins in asynchronous mode.

The complete audit log schema for protocol review workflows:

```sql
CREATE TABLE audit_events (
  event_id UUID PRIMARY KEY,
  event_time TIMESTAMP NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_category VARCHAR(20) NOT NULL,
  
  principal_id VARCHAR(255) NOT NULL,
  principal_type VARCHAR(50) NOT NULL,
  principal_name VARCHAR(255),
  account_id VARCHAR(255),
  
  action_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(255) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_name VARCHAR(255),
  
  old_value JSONB,
  new_value JSONB,
  change_reason TEXT,
  
  reviewers JSONB,
  approvers JSONB,
  review_decision VARCHAR(20),
  approval_time TIMESTAMP,
  
  request_parameters JSONB,
  response_elements JSONB,
  error_code VARCHAR(50),
  error_message TEXT,
  
  source_ip_address INET,
  user_agent TEXT,
  location VARCHAR(100),
  request_id UUID,
  
  hash_chain_value BYTEA,
  previous_event_hash BYTEA,
  
  INDEX idx_event_time (event_time),
  INDEX idx_principal (principal_id, event_time),
  INDEX idx_resource (resource_id, event_time),
  INDEX idx_event_type (event_type, event_time)
);
```

## Override rules enable persistent, replayable corrections

Override rule systems require precise formats, efficient matching, conflict resolution, and persistence across updates. Production systems demonstrate four fundamental approaches with distinct trade-offs.

**CSS cascade format** uses selector-based specificity with three-column scoring (ID-CLASS-TYPE weights). The rule `#id.class element {property: value}` carries specificity 1-1-1, defeating lower-specificity selectors. Cascade layers (`@layer`) provide explicit precedence ordering. The `!important` flag reverses normal cascade order. Source order serves as final tiebreaker when specificity equals.

**Open Policy Agent format** employs declarative Rego language with unification-based pattern matching. Policies like `package example; default allow := false; allow {input.method == "GET"; input.user == user}` support multiple rule bodies (OR logic) and partial evaluation for optimization. Rules index on specific fields (O(1) lookup) when patterns match exact values, falling back to O(n) traversal for complex queries.

**Firewall rules format** (iptables) uses sequential first-match evaluation: `iptables -A INPUT -p tcp --dport 22 -j ACCEPT` followed by `iptables -A INPUT -j DROP` processes linearly until first match wins, then stops. Chain-based organization (INPUT, OUTPUT, FORWARD) provides structure but no automatic specificity scoring.

**AWS IAM policy format** structures JSON with explicit deny precedence: `{Effect: "Allow|Deny", Action: ["s3:GetObject"], Resource: ["arn:aws:s3:::bucket/*"], Condition: {StringEquals: {key: "value"}}}`. **Explicit deny always wins** regardless of other rules. Multiple policy types (identity-based, resource-based, SCPs, permission boundaries) intersect, with effective permissions being the intersection.

**ESLint override format** uses glob-based file patterns: `{rules: {"no-unused-vars": "error"}, overrides: [{files: ["*.test.js"], rules: {"no-unused-vars": "warn"}}]}`. Base rules merge with override rules for matching files. Inline comments (`// eslint-disable-next-line`) provide line-level overrides.

Pattern matching approaches vary by data structure. **Glob patterns** (`**/*.test.js`) provide simplicity and speed (O(n)) with `*` (any), `**` (recursive), `?` (single char), `!` (negate). **JSONPath** (`$.store.book[?(@.price < 10)]`) enables structured queries with filter expressions and recursive descent, though implementations vary without standard specification. **JMESPath** (`people[?age > 20].{Name: name, Age: age}`) offers rich functions, type awareness, and consistent specification but complex syntax. **Regular expressions** maximize expressiveness but minimize performance and simplicity. For protocol overrides, use glob patterns for file/path matching, JSONPath or JMESPath for structured protocol field matching.

Conflict resolution strategies determine which rule applies when multiple match. **Specificity scoring** (CSS) compares ID-CLASS-TYPE columns left-to-right, with `#id .class p` (1-1-1) defeating `.class p` (0-1-1). **Priority/salience** (Drools) uses explicit ordering where higher salience executes first: `rule "High" salience 100` precedes `rule "Low" salience 10`. **First-match** (iptables) applies the first matching rule in sequence, using `-I` to insert at higher priority positions or `-A` to append at lower priority. **Explicit deny wins** (AWS IAM) overrides any allow regardless of specificity, implementing default-deny with explicit allow/deny evaluation.

The recommended override rule format for protocol management:

```json
{
  "ruleId": "rule-456",
  "version": 3,
  "effectiveFrom": "2025-09-30T00:00:00Z",
  "priority": 1000,
  "enabled": true,
  
  "match": {
    "protocolType": ["API", "Data"],
    "pathPattern": "/apis/**/auth/**",
    "fieldPath": "$.security[*].oauth2",
    "conditions": {
      "schemaVersion": {">": "2.0"}
    }
  },
  
  "action": {
    "type": "override",
    "operations": [
      {"op": "add", "path": "/security/0/x-requires-mfa", "value": true}
    ]
  },
  
  "metadata": {
    "appliedBy": "security-team",
    "rationale": {
      "reason": "SOC2 compliance requirement for authentication endpoints",
      "ticketId": "JIRA-SEC-5678",
      "approvedBy": "ciso@company.com"
    },
    "confidence": {
      "score": 0.95,
      "basis": "manual-expert-review",
      "factors": [
        {"type": "security-audit", "weight": 0.6},
        {"type": "regulatory-mandate", "weight": 0.3}
      ]
    }
  },
  
  "persistence": {
    "replayable": true,
    "idempotencyKey": "rule-456-v3-20250930",
    "checksum": "sha256:abc123..."
  }
}
```

Persistence and replay mechanisms employ event sourcing for complete audit trails. Each override application generates an immutable event: `{eventId: "uuid", eventType: "RuleOverrideApplied", timestamp: "2025-09-30T12:00:00Z", data: {ruleId: "rule-456", override: {}}, metadata: {userId: "user-789", version: 2}}`. Replay involves reconstructing state by reapplying all events in chronological order. Snapshots optimize replay by storing periodic state checkpoints, replaying only events since last snapshot.

Idempotent operations ensure safe replay. **Unique ID tracking** stores processed event IDs to skip duplicates. **Natural idempotency** designs operations idempotently: `SET priority = 10` (idempotent) versus `SET priority = priority + 1` (non-idempotent). **Version-based** optimistic concurrency control prevents duplicate processing by tracking version numbers. The pattern:

```javascript
async function applyOverride(event) {
  if (await isProcessed(event.eventId)) return;
  await executeOverride(event.data);
  await markProcessed(event.eventId);
}
```

Performance optimization requires multi-level strategies. **Indexing** accelerates rule matching via `CREATE INDEX idx_rules_priority ON rules(priority DESC)` and `CREATE INDEX idx_rules_pattern ON rules USING gin(pattern)` for PostgreSQL GIN indexes supporting pattern matching. **Caching** employs three levels: L1 in-memory LRU cache with 1-hour TTL, L2 compiled rules storing pre-compiled bytecode, and event-driven invalidation clearing caches on rule updates. **Rule compilation** uses ahead-of-time (AOT) compilation at build/deployment for fast runtime or just-in-time (JIT) compilation on first use with hot-path optimization (Drools approach).

Benchmarks demonstrate scalability: OPA with indexed rules processes 10K requests/second at <1ms latency using 130MB memory for 1K rules. Non-indexed OPA drops to 1K req/s at ~10ms. Drools handles 5K req/s at ~2ms for 10K rules (130MB memory), degrading to 2K req/s at ~5ms for 100K rules (1.1GB memory). CSS cascade implementations process millions of rules per page through incremental computation.

Confidence scoring tracks override reliability through multi-factor calculation. **Source authority** contributes 0-40 points (security team > manual expert > automated tool). **Test coverage** adds 0-30 points based on percentage of affected code covered by tests. **Peer review** contributes 0-20 points for number and seniority of reviewers. **Historical accuracy** adds 0-10 points based on past override success rate. Normalize final score to 0-1 scale. Store confidence factors for explainability.

The complete override persistence schema:

```sql
CREATE TABLE override_rules (
  rule_id VARCHAR(255) PRIMARY KEY,
  version INTEGER NOT NULL,
  effective_from TIMESTAMP NOT NULL,
  effective_until TIMESTAMP,
  priority INTEGER NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  
  match_criteria JSONB NOT NULL,
  action JSONB NOT NULL,
  
  metadata JSONB NOT NULL,
  confidence JSONB,
  
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  supersedes VARCHAR(255) REFERENCES override_rules(rule_id),
  
  created_at TIMESTAMP NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  
  INDEX idx_priority (priority DESC),
  INDEX idx_effective (effective_from, effective_until),
  INDEX idx_match_pattern (match_criteria) USING gin
);

CREATE TABLE override_applications (
  application_id UUID PRIMARY KEY,
  rule_id VARCHAR(255) REFERENCES override_rules(rule_id),
  protocol_id VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL,
  applied_by VARCHAR(255) NOT NULL,
  
  pre_state JSONB,
  post_state JSONB,
  operations_applied JSONB,
  
  success BOOLEAN NOT NULL,
  error_message TEXT,
  
  INDEX idx_protocol (protocol_id, applied_at),
  INDEX idx_rule (rule_id, applied_at)
);
```

Replay architecture processes protocol updates by loading active override rules sorted by priority descending, matching rules against protocol using compiled patterns, applying matched rules in priority order (highest first) with idempotency checks, recording all applications in override_applications table, and generating audit events for full traceability. Conflict resolution follows explicit deny wins strategy: denial rules (reject, block) always execute regardless of priority, allow rules execute in priority order, equal priority uses rule creation timestamp (newer wins).

## Production-ready implementation synthesis

Successful protocol management systems integrate these five patterns cohesively. The state machine coordinates review progression from discovery through approval to deployment, with timeouts and error handling preventing stagnation. JSON-Patch provides the change format for expressing protocol modifications atomically with optimistic concurrency control via test operations. Granular approval mechanisms enable field-level or component-level review with dependency tracking ensuring coherent partial approvals. Comprehensive audit logs capture every state transition, approval decision, and override application with immutability guarantees for compliance. Override rules persist corrections across protocol imports, replaying automatically through idempotent operations with conflict resolution.

Technology stack recommendations include XState or python-statemachine for state machines, fast-json-patch or rfc6902 for JSON-Patch operations, PostgreSQL with JSONB for flexible schema storage, Kafka or AWS Kinesis for event streaming, Redis for caching and distributed locks, Elasticsearch or CloudTrail Lake for audit log queries, and OPA or custom rule engines for override evaluation.

Testing strategies must cover state transition unit tests (all valid and invalid transitions), JSON-Patch operation tests (edge cases, conflicts, performance), approval workflow integration tests (concurrent reviews, dependency resolution), audit log verification (completeness, immutability, query performance), and override rule tests (pattern matching accuracy, conflict resolution, replay idempotency).

Metrics for operational excellence include cycle time tracking (time in each state, DISCOVERED→DEPLOYED duration), quality metrics (approval rejection rate, re-review cycles, defect escape rate), process metrics (stale review rate, escalation frequency, timeout triggers), performance metrics (review pickup time P50/P95, approval completion time, deployment lag), and system metrics (JSON-Patch application latency, audit log ingestion rate, override rule evaluation throughput).

The architecture supporting these patterns separates concerns into layers: **API layer** handles external interactions and webhook integrations, **state machine layer** manages review workflow transitions and guards, **approval engine layer** evaluates granular approvals and dependency graphs, **change processor layer** applies JSON-Patch operations with validation, **override engine layer** matches and applies override rules, **audit layer** captures all events immutably with cryptographic verification, and **storage layer** persists protocol versions, review state, audit logs, and override rules with appropriate indexing and partitioning strategies.

This comprehensive workflow pattern synthesis provides production-ready designs for protocol management systems requiring robust review processes, precise change tracking, flexible approval workflows, complete audit trails, and persistent override corrections. Implementation of these patterns, validated by major platforms including GitHub, GitLab, AWS, and Google Cloud, delivers maintainable, scalable, and compliant protocol management at enterprise scale.