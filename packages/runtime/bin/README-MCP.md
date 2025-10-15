# Protocol MCP Server

This MCP (Model Context Protocol) server wraps the protocol discovery tooling for use with Claude, Cursor, or other MCP-compatible clients.

## Setup

1. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

2. **Configure your MCP client** (Claude/Cursor):
   
   Add to your MCP configuration file (e.g., `~/.config/claude/mcp.json` or Cursor settings):
   
   ```json
   {
     "mcpServers": {
       "system-protocols": {
         "command": "node",
         "args": ["/path/to/OSSP-AGI/app/bin/protocol-mcp-server.js"],
         "type": "stdio",
         "env": {
           "PROTOCOL_ROOT": "/path/to/your/workspace"
         }
       }
     }
   }
   ```

   Replace `/path/to/your/workspace` with the directory where you want to store artifacts.

## Available Tools

### Protocol Discovery & Management

- **protocol_discover_api** - Discover and import API contracts from OpenAPI specifications
  - `url`: API specification URL (supports OpenAPI 3.x and Swagger 2.x)
  - Returns: Complete API protocol manifest with URNs, endpoints, schemas, and patterns
  
- **protocol_discover_local** - Discover and import API contracts from local OpenAPI files
  - `file_path`: Path to local OpenAPI specification file
  - Returns: Complete API protocol manifest with URNs, endpoints, schemas, and patterns
  
- **protocol_list_test_files** - List available OpenAPI test files in seeds directory
  - Returns: Array of test OpenAPI specifications for validation
  
- **protocol_review** - Review draft manifests with comprehensive validation
  - `manifest_path`: Path to manifest file
  - Returns: Validation results with errors, warnings, and suggestions
  
- **protocol_approve** - Approve draft manifests and transition to approved status
  - `draft_path`: Path to draft manifest
  - `final_path`: Path for approved manifest
  - `accept`: Array of accepted validation issues
  - `reject`: Array of rejected validation issues
  - `approved_by`: Approver identifier
  - `allowWrite`: Must be true for write operations
  - Returns: Approval confirmation with metadata
  
- **protocol_report_governance** - Generate comprehensive governance documentation
  - `manifest_glob`: Glob pattern for manifest files
  - `out_path`: Output file path
  - `allowWrite`: Must be true for write operations
  - Returns: Governance report with dependencies, metrics, and diagrams

### Agent Operations

- **agent_resolve** - Resolve agent metadata by URN with performance optimization
  - `agent_urn`: Agent URN to resolve
  - Returns: Agent metadata with endpoints, protocol, and capabilities
  
- **agent_run** - Execute specific tool on an agent with error handling
  - `agent_urn`: Agent URN
  - `tool`: Tool name to execute
  - `args`: Tool arguments object
  - Returns: Tool execution result with performance metrics
  
- **workflow_run** - Execute workflow file with agent nodes and input validation
  - `workflow_path`: Path to workflow file
  - `inputs`: Workflow input parameters object
  - Returns: Workflow execution result with step outputs

### Documentation & Visualization

- **docs_mermaid** - Generate Mermaid diagrams from protocol manifests
  - `manifest_dir`: Directory containing manifests
  - `focus_urn`: Optional URN to highlight in diagram
  - Returns: Mermaid diagram code with node and edge counts

## Available Resources

- `file://{relpath}` - Read any file in the workspace
- `catalog://index` - Access the artifact catalog index
- `docs://governance` - Read the governance documentation

## Ecosystem Validation

The MCP server provides comprehensive ecosystem validation through the CLI:

```bash
# Validate entire ecosystem
ossp validate --ecosystem --manifests protocols --verbose

# Generate structured JSON report
ossp validate --ecosystem --output validation-report.json --format json

# Performance validation (target: ≥100 protocols in <1s)
ossp validate --ecosystem --manifests protocols
```

### Governance Rules v0.1

The validation engine implements three core governance rules:

1. **Missing Schema Detection** - Identifies endpoints/entities without schema definitions
2. **Cyclic Dependency Detection** - Detects circular dependencies in protocol chains
3. **Duplicate URN Detection** - Ensures URN uniqueness across all protocols

### Validation Performance

- **Target**: Validate ≥100 protocols in <1s
- **Optimization**: Single-threaded implementation with performance tracking
- **Metrics**: Load time, graph build time, validation time, total time
- **Reporting**: Structured JSON output with detailed issue breakdown

## Security

- All file operations are restricted to the `PROTOCOL_ROOT` directory
- Write operations require explicit `allowWrite: true` parameter
- Path traversal attempts are blocked

## Example Usage

In Claude or Cursor:

```
Use the protocol_discover_api tool to discover the API at https://api.example.com/openapi.json

Review the manifest at artifacts/api-manifest.draft.json

Generate a governance report for all manifests in the protocols directory
```
