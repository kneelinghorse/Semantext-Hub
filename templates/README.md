# Protocol Templates

This directory contains templates for scaffolding new protocol components.

## Available Templates

### Manifest Templates
- `manifest-api.json` - API protocol manifests
- `manifest-data.json` - Data format protocol manifests
- `manifest-event.json` - Event/messaging protocol manifests
- `manifest-semantic.json` - Semantic/ontology protocol manifests

### Code Templates
- `importer.js` - Importer class skeleton
- `test.js` - Test file scaffold

## Template Syntax

Templates use mustache-style interpolation: `{{variable}}`

### Common Variables
- `{{name}}` - Component name
- `{{type}}` - Protocol type (api, data, event, semantic)
- `{{version}}` - Version string
- `{{description}}` - Component description
- `{{timestamp}}` - ISO timestamp
- `{{author}}` - Author name
- `{{className}}` - PascalCase class name
- `{{filename}}` - kebab-case filename

## Usage

Templates are processed by the TemplateEngine and used by the ProtocolScaffolder:

```javascript
import { TemplateEngine } from '../generators/scaffold/engine.js';

const engine = new TemplateEngine('./templates');
const result = await engine.render('manifest-api.json', {
  name: 'MyAPI',
  type: 'api',
  version: '1.0.0'
});
```

Or via CLI:

```bash
npm run cli scaffold -- --type api --name MyService
```
