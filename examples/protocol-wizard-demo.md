# Protocol Wizard Demo

This document demonstrates how to use the Protocol Authoring Wizard v2 to create protocol manifests.

## Quick Start

Run the wizard from the project root:

```bash
node app/cli/commands/protocol-wizard.js
```

## Example Session

### 1. Protocol Type Selection

```
🚀 Protocol Authoring Wizard v2
=====================================

Select protocol type:
  1. API
  2. DATA
  3. EVENT
  4. WORKFLOW

Enter choice (1-4): 1
✓ Selected: API
```

### 2. Basic Information

```
📝 Basic Information
====================
Protocol name: [my-protocol] user-service-api
Version: [1.0.0] 1.2.0
Description: [A new protocol manifest] User management API service
Author: [developer] john.doe@example.com
```

### 3. API-Specific Configuration

```
🔧 API Specific Configuration
==========================================
Base URL: [https://api.example.com] https://api.userservice.com
Authentication: [bearer] bearer
Add endpoint? (y/n): [y] y
Endpoint path: [/api/v1/endpoint] /api/v1/users
HTTP method: [GET] GET
Endpoint description: [API endpoint] Retrieve user information
```

### 4. Generated Manifest

The wizard generates a complete manifest:

```json
{
  "type": "api",
  "name": "user-service-api",
  "version": "1.2.0",
  "description": "User management API service",
  "protocol": {
    "baseUrl": "https://api.userservice.com",
    "authentication": "bearer",
    "endpoints": [
      {
        "path": "/api/v1/users",
        "method": "GET",
        "description": "Retrieve user information"
      }
    ]
  },
  "metadata": {
    "created": "2025-01-10T10:30:00.000Z",
    "author": "john.doe@example.com"
  }
}
```

## Protocol Types

### API Protocol
- **Purpose**: REST API services
- **Key Fields**: baseUrl, authentication, endpoints
- **Use Case**: Microservices, external APIs

### Data Protocol
- **Purpose**: Data exchange formats
- **Key Fields**: format, schema, compression
- **Use Case**: Data pipelines, ETL processes

### Event Protocol
- **Purpose**: Event-driven systems
- **Key Fields**: transport, events, schema
- **Use Case**: Message queues, real-time systems

### Workflow Protocol
- **Purpose**: Process automation
- **Key Fields**: workflow_type, steps, trigger
- **Use Case**: Business processes, automation

## Smart Defaults

The wizard provides intelligent defaults based on:
- Protocol type
- Common industry patterns
- Best practices
- User environment

## Validation

Generated manifests are automatically validated against:
- Required field presence
- Type-specific constraints
- Schema compliance
- Format correctness

## Tips

1. **Use descriptive names**: Choose names that clearly indicate the protocol's purpose
2. **Version consistently**: Follow semantic versioning (major.minor.patch)
3. **Provide clear descriptions**: Help other developers understand the protocol
4. **Test endpoints**: Verify API endpoints work before deployment
5. **Review generated manifests**: Always check the output before using

## Troubleshooting

### Common Issues

**Template not found**: Ensure all template files exist in `/app/templates/protocol-templates/`

**Validation errors**: Check that all required fields are provided

**Permission errors**: Ensure write access to the output directory

### Getting Help

- Check the generated manifest for validation errors
- Review the template files for expected structure
- Consult the protocol documentation for field requirements

## Advanced Usage

### Custom Templates

You can extend the wizard by adding custom templates to `/app/templates/protocol-templates/`. Templates should follow the `manifest-{type}.json` naming convention.

### Programmatic Usage

```javascript
const ProtocolWizard = require('./app/cli/commands/protocol-wizard');
const wizard = new ProtocolWizard();
await wizard.start();
```

### Integration

The wizard can be integrated into CI/CD pipelines or development workflows to automate protocol creation.
