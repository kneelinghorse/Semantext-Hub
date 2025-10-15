# Migration Guide: Test API v1.0.0 → v2.0.0

## Overview

This migration guide covers the breaking changes introduced in Test API v2.0.0.

## Breaking Changes

### 1. Endpoint Removal: DELETE /users/{id}

**Impact Level:** High
**Affected Consumers:** User management service, Admin dashboard

**Description:**
The DELETE /users/{id} endpoint has been removed in favor of a new soft delete approach.

**Before:**
```bash
DELETE /users/123
```

**After:**
```bash
# Use PATCH endpoint for soft delete (not implemented in this example)
PATCH /users/123/status
```

**Migration Steps:**
1. Update all DELETE calls to use alternative approach
2. Update response handling
3. Update error handling

### 2. Schema Change: User.email field type change

**Impact Level:** Medium
**Affected Consumers:** Registration service, Email service

**Description:**
The User.email field has changed from string to object to support multiple email addresses and verification status.

**Before:**
```json
{
  "email": "user@example.com"
}
```

**After:**
```json
{
  "email": {
    "primary": "user@example.com",
    "verified": false
  }
}
```

**Migration Steps:**
1. Update data models to handle email object structure
2. Update validation logic for new email format
3. Update UI components to display email information
