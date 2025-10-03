# Protocol Viewer Server

**Mission B3.1 - Express Server Foundation**

The Protocol Viewer Server is an Express-based API server that serves protocol manifests from the artifacts directory. It provides a JSON API for listing and retrieving manifests, with built-in security features and performance optimizations.

## Quick Start

```bash
# Start the server
protocol-discover serve ./artifacts

# Start on custom port
protocol-discover serve ./artifacts --port 4000
```

The server will be available at `http://localhost:3000` (or your custom port).

## API Endpoints

### GET /api/health

Health check endpoint with server metadata.

```bash
curl http://localhost:3000/api/health
```

**Response:**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "artifacts_dir": "/path/to/artifacts",
  "manifest_count": 42
}
```

### GET /api/manifests

List all available manifest files with optional filtering.

```bash
# List all manifests
curl http://localhost:3000/api/manifests

# Filter by kind
curl http://localhost:3000/api/manifests?kind=api
curl http://localhost:3000/api/manifests?kind=data
curl http://localhost:3000/api/manifests?kind=event
```

**Response:**
```json
{
  "manifests": [
    {
      "filename": "api-billing.json",
      "kind": "api",
      "size": 12345,
      "modified": "2025-10-02T10:00:00Z",
      "urn": "urn:proto:api:billing@1.0.0"
    }
  ]
}
```

### GET /api/manifest/:filename

Retrieve a specific manifest by filename.

```bash
curl http://localhost:3000/api/manifest/api-billing.json
```

**Response:**
```json
{
  "event": { ... },
  "protocol": { ... },
  "metadata": { ... }
}
```

**Error Responses:**
- `404 Not Found` - Manifest file does not exist
- `403 Forbidden` - Invalid path (security violation)
- `400 Bad Request` - Invalid JSON or non-JSON file requested
- `500 Internal Server Error` - Failed to read manifest

## Security Features

### Path Validation

The server includes middleware to prevent directory traversal attacks:

- Blocks `../` path traversal attempts
- Blocks absolute paths
- Only allows `.json` file extensions
- Returns `403 Forbidden` for invalid paths

Example blocked requests:
```bash
curl http://localhost:3000/api/manifest/../../../etc/passwd
# Response: 403 {"error":"Invalid path"}

curl http://localhost:3000/api/manifest/test.txt
# Response: 400 {"error":"Only JSON files allowed"}
```

### Rate Limiting

The server enforces rate limiting to prevent abuse:

- **Limit**: 100 requests per minute per IP
- **Window**: 60 seconds (sliding window)
- **Response**: `429 Too Many Requests` when limit exceeded

Rate limit headers are included in responses:
```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1696234567
```

### Error Sanitization

Error responses never leak filesystem paths or sensitive information. All errors return generic messages suitable for public APIs.

## CORS Configuration

CORS is automatically configured based on environment:

- **Development** (`NODE_ENV !== 'production'`): CORS enabled for `localhost:3000` and `localhost:5173` (Vite dev server)
- **Production**: CORS disabled by default

To override CORS settings:
```javascript
const server = new ProtocolViewerServer('./artifacts', {
  enableCors: true  // Force enable CORS
});
```

## Performance

The server is optimized for fast manifest serving:

| Metric | Target | Measured |
|--------|--------|----------|
| Startup time | <500ms | ✅ Verified |
| Manifest load | <100ms | ✅ Verified |
| Concurrent requests | 10+ | ✅ Verified |
| Memory usage | <50MB for 100 manifests | ✅ Verified |

## Usage from Code

```javascript
const { ProtocolViewerServer } = require('./app/viewer/server.js');

// Create server instance
const server = new ProtocolViewerServer('./artifacts', {
  port: 3000,
  enableCors: true
});

// Start server
await server.start();

// Stop server gracefully
await server.stop();
```

## CLI Options

```bash
protocol-discover serve <artifacts-dir> [options]

Arguments:
  artifacts-dir         Path to directory containing manifest files

Options:
  -p, --port <number>   Port to listen on (default: 3000)
  -h, --help            Display help information
```

## Architecture

```
app/viewer/
├── server.js                    # Main server class
├── routes/
│   ├── api.js                   # API endpoints
│   └── static.js                # Static file serving
├── middleware/
│   ├── validate-path.js         # Path security
│   └── rate-limit.js            # Rate limiting
└── public/                      # React build output
    └── index.html               # SPA entry point
```

## Semantic Instrumentation & Debugging (Mission B3.3)

- **Coverage**: Health, Manifests (list + detail), Validation, Graph, and Governance panes emit canonical `data-semantic-*` attributes via `useSemanticPanel` helpers. Manifest detail actions include semantic roles (`data-semantic-action="download-manifest"`, etc.).
- **Registry Context**: `SemanticRegistryProvider` tracks `activeTab`, `activePanels`, `selectedManifest`, and metadata histories. Components register themselves with `useRegisterPanel` so downstream tooling can consume canonical URNs.
- **Debug Panel**: In dev builds press `Ctrl+Shift+D` (`Cmd+Shift+D` on macOS) to toggle the Semantic Debug Panel. Views include:
  - **Registry** – active tab, selected manifest, and live metadata snapshots.
  - **History** – the last 20 tab/manifest transitions with timestamps.
  - **Attributes** – DOM elements currently advertising `data-semantic-*` attributes (copy/export available).
- **Snapshots**: The debug panel and registry hook expose `getSnapshot()` for quick JSON captures:

```javascript
import { useSemanticRegistry } from '../contexts/SemanticRegistry.jsx';

function RegistryButton() {
  const { getSnapshot } = useSemanticRegistry();

  const handleClick = () => {
    const snapshot = getSnapshot();
    console.table(snapshot.metadata);
  };

  return <button onClick={handleClick}>Print Semantic Snapshot</button>;
}
```

- **Testing**: `pnpm test --filter "App semantic instrumentation"` exercises registry lifecycle, tab switching semantics, and manifest detail instrumentation.
- **Next Steps**: Mission B3.4 will layer the alt-click inspection overlay on top of this registry/attribute foundation.

### Route Order

Routes are configured in this specific order to ensure proper functionality:

1. **API routes** (`/api/*`) - Must come first to prevent shadowing
2. **Static files** - Serves React build from `public/`
3. **SPA fallback** (`*`) - Returns `index.html` for client-side routing

This order is critical - if static middleware comes before API routes, the SPA fallback will catch API requests.

## Testing

```bash
# Run all tests
npm test

# Run only viewer tests
npm test -- viewer

# Run with coverage
npm test -- --coverage
```

Test suites include:
- Server lifecycle tests (start/stop, performance)
- API route tests (health, manifests, manifest retrieval)
- Security tests (path validation, rate limiting)
- Error handling tests

## Graceful Shutdown

The server handles `SIGINT` (Ctrl+C) and `SIGTERM` signals gracefully:

```bash
protocol-discover serve ./artifacts
# Press Ctrl+C
# > Shutting down server...
# > Server stopped
```

All active connections are closed cleanly before the process exits.

## React Viewer Client (B3.2)

The Protocol Viewer includes a React-based web UI that consumes the API endpoints described above.

### Client Architecture

```
app/viewer/client/
├── src/
│   ├── components/          # React components
│   │   ├── Layout.jsx       # Main layout with header
│   │   ├── TabNav.jsx       # Accessible tab navigation
│   │   ├── TabPanel.jsx     # Tab content container
│   │   ├── HealthTab.jsx    # Health status display
│   │   ├── ManifestsTab.jsx # Manifest list and detail view
│   │   └── PlaceholderTab.jsx # Future tab implementations
│   ├── hooks/
│   │   └── useSemanticPanel.js # Semantic metadata hook
│   ├── lib/
│   │   └── api.js           # API client with error handling
│   ├── test/                # Component tests
│   ├── App.jsx              # Main application
│   └── main.jsx             # Entry point
├── index.html               # HTML template
├── vite.config.js           # Build configuration
└── package.json             # Client dependencies
```

### Building the Client

```bash
# Install dependencies
cd app/viewer/client
npm install

# Development mode (with hot reload)
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

The production build outputs to `app/viewer/public/`, which the Express server serves automatically.

### Client Features

#### Tabbed Navigation
- **Health Tab**: Server status, uptime, manifest counts
- **Manifests Tab**: List and detail views with download functionality
- **Validation Tab**: Placeholder for validation results (B3.3+)
- **Graph Tab**: Placeholder for protocol graph visualization (B3.3+)
- **Governance Tab**: Placeholder for governance insights (B3.3+)

#### Accessibility
- Keyboard navigation (Arrow keys, Home, End)
- ARIA labels and semantic HTML
- Focus management
- Screen reader support

#### Semantic Instrumentation (Mission B3.3)
All components include `data-semantic-*` attributes for the inspection overlay (Mission B3.4):

```jsx
// Manifest items have semantic URNs
<div data-semantic-urn="urn:proto:manifest:api-test"
     data-semantic-type="manifest"
     data-semantic-format="openapi">
```

These attributes power the inspection overlay so Alt+Click reveals protocol metadata in-place.

##### Semantic Registry

The viewer includes a centralized **Semantic Registry** that tracks active UI panels and their metadata:

```javascript
import { useSemanticRegistry } from './contexts/SemanticRegistry.jsx';

function MyComponent() {
  const { setActiveTab, setSelectedManifest, registry } = useSemanticRegistry();

  // Registry tracks:
  // - Active tab
  // - Selected manifest
  // - Active panels with metadata
  // - Navigation history
}
```

##### Developer Debug Panel

Press **Ctrl+Shift+D** (or **Cmd+Shift+D** on Mac) to toggle the Semantic Debug Panel. This developer tool provides real-time visibility into:

- **Registry View**: Active panels and their URN identifiers
- **History View**: Recent tab switches and manifest selections
- **Attributes View**: DOM elements with semantic attributes

The debug panel includes:
- **Copy Snapshot**: Copy current registry state to clipboard
- **Export JSON**: Download registry snapshot for inspection
- **Live Updates**: Automatically reflects registry changes

This tool is essential for validating semantic coverage during development and preparing for the inspection overlay (B3.4).

##### Inspection Overlay (Mission B3.4)

- **Activate**: Hold **Alt** (Option on macOS) and click any element instrumented with `data-semantic-urn`.
- **Keyboard Toggle**: Press **Ctrl+Shift+I** (or **Cmd+Shift+I**) to open the inspector without clicking a specific element.
- **Dismiss**: Hit **Esc**, click the close button, or click the translucent backdrop.
- **Anchoring**: The highlight follows the inspected element while you scroll, keeping the overlay panel docked alongside it.
- **Context**: Inspector surfaces element attributes, registry snapshot (active tab, panels), and manifest details pulled from the Semantic Registry.
- **Guardrails**: Enabled automatically in development builds. In production builds set `VITE_ENABLE_INSPECTION=true` or run `localStorage.setItem('ossProto:inspectionEnabled', 'true')` to opt-in.

##### Semantic Stub Data

All placeholder tabs (Validation, Graph, Governance) render structured semantic data with URN identifiers:

```javascript
// Example validation stub
{
  "urn": "urn:proto:validation:summary",
  "manifests": [
    {
      "id": "api-test",
      "urn": "urn:proto:manifest:api-test",
      "validationStatus": "pass",
      "checks": { ... }
    }
  ]
}
```

These stubs enable semantic dogfooding—the viewer uses the same URN scheme it will help developers inspect.

### Development Workflow

```bash
# Terminal 1: Start the API server
protocol-discover serve ./artifacts

# Terminal 2: Start Vite dev server (with proxy)
cd app/viewer/client
npm run dev
```

Visit `http://localhost:5173` for the dev server with hot reload, or `http://localhost:3000` for the production build served by Express.

### API Integration

The client uses a centralized API client (`src/lib/api.js`) with:
- Error normalization
- Type-safe responses
- Automatic retries (future)
- Request caching (future)

```javascript
import { api } from './lib/api.js';

// Fetch health data
const health = await api.getHealth();

// List manifests
const manifests = await api.getManifests();

// Get specific manifest (filename or identifier)
const manifest = await api.getManifest('api-test.json');
```

### Testing

The client includes comprehensive tests using Vitest and React Testing Library:

```bash
# Run tests
cd app/viewer/client
npm test

# Watch mode
npm run test:watch
```

Test coverage includes:
- Component rendering and interactions
- Tab navigation and keyboard controls
- Loading and error states
- API client error handling
- Semantic hook outputs

## Troubleshooting

### Port Already in Use

```bash
# Error: listen EADDRINUSE: address already in use :::3000
protocol-discover serve ./artifacts --port 4000
```

### Artifacts Directory Not Found

```bash
# Error: Artifacts directory not found: ./artifacts
# Check that the directory exists and path is correct
ls -la ./artifacts
```

### Rate Limit Exceeded

```bash
# Response: 429 {"error":"Too many requests, please try again later."}
# Wait 60 seconds and try again
```

## Next Steps

- **B3.5**: Graph Visualization - Interactive protocol dependency graph

## Mission Status

### ✅ B3.1 - Express Server Foundation (Complete)
- Express API with health and manifest endpoints
- Security middleware (path validation, rate limiting)
- Graceful shutdown and performance optimization
- Comprehensive test coverage

### ✅ B3.2 - React Viewer with Tabs (Complete)
- Vite + React SPA with accessible tabbed navigation
- Health and Manifests tabs with loading/error states
- Manifest detail modal with download affordance and JSON syntax highlighting
- Semantic instrumentation (`data-semantic-*` attributes)
- Component tests with React Testing Library
- Production build outputting to `app/viewer/public/`

### ✅ B3.3 - Semantic Dogfooding (Complete)
- Semantic Registry tracking active panels and URN metadata
- Developer debug panel (Ctrl+Shift+D) with registry inspection
- Validation/Graph/Governance tabs with structured semantic stubs
- Comprehensive semantic instrumentation across all tabs
- Vitest coverage for registry and semantic hooks
- Documentation of semantic debug workflow

### ✅ B3.4 - Inspection Overlay (Complete)
- Alt+Click inspector with animated element highlight and anchored overlay panel
- Keyboard shortcuts for toggle (`Ctrl/Cmd+Shift+I`) and escape handling
- Semantic Registry bridge surfaces active tab, panel metadata, and manifest details
- Feature-flag guardrails ensure the overlay only loads in dev or when explicitly enabled
- Vitest coverage for overlay activation, teardown, accessibility, and registry synchronisation

## Mission Context

**Status**: ✅ B3.1 Complete, ✅ B3.2 Complete, ✅ B3.3 Complete, ✅ B3.4 Complete
**Week**: 3 - Web Viewer & Semantic Protocol
**Dependencies**: Week 2 Complete (B2.1-B2.5)
**Enables**: B3.5 (Graph Visualization)

This server and client provide a complete foundation for the protocol viewer web application. The manifest-first approach treats CLI-generated artifacts as the source of truth, serving them via a secure, performant API with an accessible React UI.

---

*Last Updated: October 4, 2025*
*Version: 0.1.0*
*Missions: B3.1 (Server) + B3.2 (Client) + B3.3 (Semantic) + B3.4 (Inspection Overlay)*
