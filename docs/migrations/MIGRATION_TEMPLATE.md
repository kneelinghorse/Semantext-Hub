# Migration Template

This template provides a standardized format for documenting breaking changes in protocol artifacts.

## Usage

When making breaking changes to protocol manifests, create a migration file using this template to document the changes and provide guidance for consumers.

## Template

```markdown
# Migration Guide: [Protocol Name] v[Old Version] → v[New Version]

## Overview

Brief description of the changes and migration requirements.

## Breaking Changes

### 1. [Change Category]: [Brief Description]

**Impact Level:** [High/Medium/Low]
**Affected Consumers:** [List of affected systems/components]

**Description:**
Detailed description of what changed and why.

**Before:**
```json
{
  "example": "of old structure"
}
```

**After:**
```json
{
  "example": "of new structure"
}
```

**Migration Steps:**
1. Step 1: [Action required]
2. Step 2: [Action required]
3. Step 3: [Action required]

**Code Example:**
```javascript
// Old code
const oldApi = new OldApiClient();

// New code
const newApi = new NewApiClient();
```

**Timeline:**
- **Deprecation Date:** [Date]
- **Removal Date:** [Date]
- **Support End Date:** [Date]

---

### 2. [Next Breaking Change]

[Repeat the same structure for each breaking change]

## Non-Breaking Changes

### [Change Description]

Brief description of non-breaking changes that consumers should be aware of.

## Compatibility Matrix

| Consumer Version | Supported | Notes |
|------------------|-----------|-------|
| v1.0.0 | ✅ | Full compatibility |
| v1.1.0 | ✅ | Full compatibility |
| v2.0.0 | ❌ | Breaking changes |

## Testing

### Pre-Migration Testing

1. [Test step 1]
2. [Test step 2]

### Post-Migration Testing

1. [Test step 1]
2. [Test step 2]

## Rollback Plan

If issues are encountered, follow these steps to rollback:

1. [Rollback step 1]
2. [Rollback step 2]

## Support

For questions or issues with this migration:

- **Documentation:** [Link to documentation]
- **Support Channel:** [Link to support]
- **Issue Tracker:** [Link to issues]

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| v2.0.0 | 2024-01-01 | Initial breaking changes |
| v2.0.1 | 2024-01-02 | Bug fixes |

---

**Last Updated:** [Date]
**Next Review:** [Date]
```

## Examples

### API Endpoint Removal

```markdown
### 1. Endpoint Removal: DELETE /api/v1/users/{id}

**Impact Level:** High
**Affected Consumers:** User management service, Admin dashboard

**Description:**
The DELETE /api/v1/users/{id} endpoint has been removed in favor of a new soft delete approach using PATCH /api/v1/users/{id}/status.

**Before:**
```bash
DELETE /api/v1/users/123
```

**After:**
```bash
PATCH /api/v1/users/123/status
Content-Type: application/json

{
  "status": "deleted",
  "deleted_at": "2024-01-01T00:00:00Z"
}
```

**Migration Steps:**
1. Update all DELETE calls to use PATCH with status update
2. Update response handling to check for new status field
3. Update error handling for new response format

**Code Example:**
```javascript
// Old code
await api.delete(`/users/${userId}`);

// New code
await api.patch(`/users/${userId}/status`, {
  status: 'deleted',
  deleted_at: new Date().toISOString()
});
```
```

### Schema Field Change

```markdown
### 2. Schema Change: User.email field type change

**Impact Level:** Medium
**Affected Consumers:** Registration service, Email service

**Description:**
The User.email field has changed from string to object to support multiple email addresses and verification status.

**Before:**
```json
{
  "user": {
    "id": "123",
    "email": "user@example.com"
  }
}
```

**After:**
```json
{
  "user": {
    "id": "123",
    "email": {
      "primary": "user@example.com",
      "verified": true,
      "alternatives": []
    }
  }
}
```

**Migration Steps:**
1. Update data models to handle email object structure
2. Update validation logic for new email format
3. Update UI components to display email information

**Code Example:**
```javascript
// Old code
const userEmail = user.email;

// New code
const userEmail = user.email.primary;
const isVerified = user.email.verified;
```
```

## Best Practices

1. **Be Specific:** Provide exact examples of old vs new structures
2. **Include Code:** Show actual code changes required
3. **Set Timelines:** Clearly define deprecation and removal dates
4. **Test Thoroughly:** Include testing steps for both pre and post migration
5. **Plan Rollback:** Always include a rollback plan
6. **Communicate Early:** Notify consumers well in advance of breaking changes
7. **Version Appropriately:** Use semantic versioning to indicate breaking changes
8. **Document Everything:** Include all relevant details for successful migration

## File Naming

Use one of these standard names for migration files:

- `MIGRATION.md` - General migration guide
- `BREAKING_CHANGES.md` - Focus on breaking changes only
- `CHANGELOG.md` - Version changelog with migration notes
- `MIGRATION_v[version].md` - Version-specific migration guide

## Integration with CI/CD

Migration files are automatically detected by:

- Pre-commit hooks
- GitHub Actions workflows
- Protocol diff tools

Ensure your migration file follows this template structure for proper integration.
