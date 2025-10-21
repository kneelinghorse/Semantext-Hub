# Protocol Viewer

Web-based visualization interface for OSS Protocol manifests, validation results, and governance insights.

## Overview

The Protocol Viewer provides a rich, interactive UI for exploring protocol data structures and relationships. It is designed to support developer workflows, governance validation, and analytics integration.

## Features

### Core Functionality
- **Health Dashboard**: System status and connectivity checks
- **Manifest Browser**: Browse and inspect protocol manifests with syntax highlighting and download support
- **Validation Panel**: View live validation results powered by `POST /api/validate`
- **Graph Visualization**: Explore protocol relationships with chunked graph data from `POST /api/graph`
- **Governance Panel**: View governance scores and recommendations (placeholder)

### Developer Tools (Week 3)

#### Semantic Debug Panel
**Keyboard Shortcut**: `Ctrl+Shift+D` (or `Cmd+Shift+D` on Mac)

Toggle the Semantic Debug Panel to visualize the internal semantic registry state. This panel shows:
- Active tab and selected manifest
- All registered panels with URN annotations
- Semantic metadata for UI components
- History of tab transitions and manifest selections

The debug panel is development-only and provides visibility into the semantic instrumentation layer.

#### Alt-Click Inspection Overlay (B3.4)
**Activation**: `Alt+Click` on any element with semantic annotations

The Inspection Overlay provides real-time insight into semantic metadata attached to UI components:

**Features**:
- **Element Attributes**: View all `data-semantic-*` attributes (URN, type, format, path, etc.)
- **Registry Context**: See active tab, selected manifest, and panel counts
- **Panel Metadata**: Inspect registered panels and their semantic payloads
- **Manifest Details**: View selected manifest metadata (ID, URN, format, path)

**Keyboard Shortcuts**:
- `Alt+Click`: Activate overlay on semantic element
- `Ctrl+Shift+I` (or `Cmd+Shift+I`): Toggle overlay without selecting element
- `Esc`: Close overlay
- Click overlay close button or backdrop: Close overlay

**Feature Flag**:
- Enabled by default in development (`import.meta.env.DEV`)
- Can be force-enabled in production via environment variable: `VITE_ENABLE_INSPECTION=true`
- Can be force-enabled via localStorage: `localStorage.setItem('ossProto:inspectionEnabled', 'true')`

**Visual Indicators**:
- **Element Highlight**: Purple animated outline with type badge
- **Inspector Panel**: Floating panel showing all semantic context
- **Backdrop**: Semi-transparent backdrop for focus

**Use Cases**:
- Validate semantic annotations during development
- Debug registry state for specific UI elements
- Verify URN correctness before committing changes
- Dogfood the protocol system within the viewer itself

## Architecture

### Client (React + Vite)
- **Location**: `app/viewer/client/`
- **Framework**: React 18 with functional components and hooks
- **Build Tool**: Vite for fast development and optimized production builds
- **Styling**: CSS with modular component styles
- **Testing**: Vitest + React Testing Library

### Server (Express)
- **Location**: `app/viewer/server.js`
- **Framework**: Express
- **Purpose**: Serves API endpoints for health, manifests, validation, graph, and governance data
- **Middleware**: JSON parsing, CORS, static file serving

### API Routes (Sprint 18)
- `GET /api/health` — Server health + artifact stats
- `GET /api/manifests` — Manifest metadata (filterable via `?kind=`)
- `GET /api/manifest/:filename` — Raw manifest JSON (path-safe)
- `POST /api/validate` — Body `{ manifests: ["api-test.json"] }` → `{ valid, summary, manifests, errors }`
- `POST /api/graph` — Body `{ manifests: [...] }` → graph index + chunk descriptors
- `GET /api/graph/part/:id` — Retrieve graph chunk JSON (nodes, edges, summary)

See `artifacts/viewer/api-smoke.json` for an example payload recorded from the smoke workflow.

### Semantic Instrumentation
- **Registry**: `src/contexts/SemanticRegistry.jsx` - Tracks active panels and semantic metadata
- **Hooks**: `src/hooks/useSemanticPanel.js` - Generates semantic attributes for components
- **Inspection**: `src/contexts/InspectionOverlay.jsx` - Manages alt-click inspection UI
- **Component**: `src/components/InspectionOverlay.jsx` - Renders inspection panel and element highlights

All UI components emit semantic attributes (`data-semantic-urn`, `data-semantic-type`, etc.) to enable inspection and downstream analytics.

## Getting Started

### Installation
```bash
cd app/viewer/client
npm install
```

### Development
```bash
npm run dev
```
Starts Vite dev server on http://localhost:5173

### Production Build
```bash
npm run build
```
Outputs to `client/dist/`

### Testing
```bash
npm test              # Run all tests
npm test -- --watch   # Watch mode
npm run test:ui       # Vitest UI
```

### Running the Server
```bash
node app/viewer/server.js
```
Starts Express server on http://localhost:3000

## Project Structure

```
app/viewer/
├── client/
│   ├── src/
│   │   ├── components/       # React components
│   │   │   ├── InspectionOverlay.jsx       # Alt-click inspection UI
│   │   │   ├── SemanticDebugPanel.jsx      # Debug panel
│   │   │   └── ...
│   │   ├── contexts/         # React contexts
│   │   │   ├── SemanticRegistry.jsx        # Semantic state management
│   │   │   ├── InspectionOverlay.jsx       # Inspection overlay state
│   │   │   └── ...
│   │   ├── hooks/            # Custom hooks
│   │   │   ├── useSemanticPanel.js         # Semantic attribute generation
│   │   │   └── ...
│   │   ├── lib/              # Utilities
│   │   │   └── api.js                      # API client
│   │   ├── test/             # Test utilities
│   │   ├── App.jsx           # Main app component
│   │   ├── main.jsx          # Entry point
│   │   └── index.css         # Global styles
│   ├── public/               # Static assets
│   ├── package.json
│   └── vite.config.js
├── server.js                 # Express server
├── routes/                   # API routes
└── middleware/               # Express middleware
```

## Semantic Annotations

Components use `data-semantic-*` attributes to enable inspection and analytics:

```jsx
import { useSemanticPanel, manifestSemanticAttrs } from './hooks/useSemanticPanel';

// Hook-based approach
const attrs = useSemanticPanel('urn:proto:manifest:api-test', {
  type: 'manifest',
  version: '1.0.0'
});
<div {...attrs}>Content</div>

// Helper function approach
const attrs = manifestSemanticAttrs(manifest, { view: 'list', role: 'card' });
<div {...attrs}>Content</div>
```

**Common Attributes**:
- `data-semantic-urn`: Canonical URN identifier
- `data-semantic-type`: Resource type (manifest, validation, graph, etc.)
- `data-semantic-format`: Format (json, yaml, etc.)
- `data-semantic-path`: File path
- `data-semantic-view`: View mode (list, detail, etc.)
- `data-semantic-role`: UI role (card, row, modal, etc.)
- `data-semantic-section`: Section within a view (header, body, footer, etc.)
- `data-semantic-state`: UI state (active, loading, error, etc.)
- `data-semantic-context`: JSON-encoded context data

## Development Workflow

1. **Enable Debug Mode**: Press `Ctrl+Shift+D` to toggle the Semantic Debug Panel
2. **Inspect Elements**: `Alt+Click` on any semantic element to open the Inspection Overlay
3. **Validate Annotations**: Check that URNs and types are correct in the overlay
4. **Test Changes**: Run `npm test` to ensure semantic instrumentation tests pass
5. **Build**: Run `npm run build` before deploying

## Testing

### Semantic Registry Tests
- `src/contexts/SemanticRegistry.test.jsx` - Registry lifecycle, panel registration, tab switching
- Coverage: Registration, unregistration, tab changes, manifest selection, debug mode

### Inspection Overlay Tests
- `src/contexts/InspectionOverlay.test.jsx` - Overlay activation, keyboard shortcuts, feature flags
- `src/components/InspectionOverlay.test.jsx` - UI rendering, interactions, accessibility
- Coverage: Alt-click, Escape key, Ctrl+Shift+I, backdrop clicks, element highlighting, registry integration

### Semantic Panel Tests
- `src/hooks/useSemanticPanel.test.js` - Attribute generation, helper functions
- Coverage: URN formatting, metadata serialization, manifest/validation/graph helpers

## Troubleshooting

### Inspection Overlay Not Appearing
1. Verify you're in development mode (`npm run dev`)
2. Check that element has `data-semantic-urn` attribute
3. Ensure you're holding `Alt` when clicking
4. Try `Ctrl+Shift+I` to toggle overlay without element selection
5. Check browser console for errors

### Debug Panel Not Showing
1. Press `Ctrl+Shift+D` (or `Cmd+Shift+D` on Mac)
2. Check browser console for keyboard event conflicts
3. Verify SemanticRegistryProvider is wrapping the app

### Tests Failing
1. Run `npm test` to see specific failures
2. Check that all semantic attributes are being generated correctly
3. Ensure React imports are present in test files
4. Verify feature flag logic in tests

## Future Enhancements (Week 4+)

- **Validation Integration**: Connect Validation panel to real validation engine
- **Graph Visualization**: Implement interactive protocol graph with D3.js or similar
- **Governance Analytics**: Real-time governance scoring and recommendations
- **Export Functionality**: Export semantic annotations and registry snapshots
- **Custom Overlays**: Plugin system for custom inspection overlays
- **Performance Monitoring**: Track overlay performance impact

## Related Documentation

- **Main README**: `/README.md`
- **AI Handoff**: `/AI_HANDOFF.md`
- **Project Context**: `/PROJECT_CONTEXT.json`
- **Week 3 Build Notes**: `/missions/week-03/BUILD_WEEK3.md`
- **Mission Brief B3.4**: See project mission files for alt-click overlay requirements

## Contributing

When adding new semantic annotations:
1. Use `useSemanticPanel` or helper functions consistently
2. Emit URNs that match the canonical format (`urn:proto:type:id`)
3. Add tests for new semantic attributes
4. Update this documentation with new attribute types
5. Test with the Inspection Overlay before committing
