import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ProtocolGenerator {
  constructor() {
    this.templatesPath = path.join(__dirname, '../templates/protocol-templates');
  }

  async generate(protocolData) {
    const templatePath = path.join(this.templatesPath, `manifest-${protocolData.type}.json`);
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found for protocol type: ${protocolData.type}`);
    }

    const template = fs.readFileSync(templatePath, 'utf8');
    const manifest = this.processTemplate(template, protocolData);
    
    return JSON.parse(manifest);
  }

  processTemplate(template, data) {
    let processed = template;
    
    // Replace all template variables
    const variables = {
      type: data.type,
      name: data.name,
      version: data.version,
      description: data.description,
      timestamp: data.timestamp,
      author: data.author,
      baseUrl: data.baseUrl || '',
      authentication: data.authentication || '',
      endpoint_path: data.endpoint_path || '/api/endpoint',
      endpoint_method: data.endpoint_method || 'GET',
      endpoint_description: data.endpoint_description || 'API endpoint',
      format: data.format || 'json',
      compression: data.compression || 'none',
      transport: data.transport || 'http',
      event_name: data.event_name || 'event',
      event_description: data.event_description || 'Event description',
      vocabulary: data.vocabulary || 'standard',
      ontology: data.ontology || 'basic',
      workflow_type: data.workflow_type || 'sequential',
      steps: data.steps || '3',
      trigger: data.trigger || 'manual'
    };

    // Replace all {{variable}} patterns
    Object.keys(variables).forEach(key => {
      const pattern = new RegExp(`{{${key}}}`, 'g');
      processed = processed.replace(pattern, variables[key]);
    });

    return processed;
  }

  validateManifest(manifest) {
    const requiredFields = ['type', 'name', 'version', 'description', 'protocol', 'metadata'];
    
    for (const field of requiredFields) {
      if (!manifest[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Type-specific validation
    switch (manifest.type) {
      case 'api':
        this.validateApiManifest(manifest);
        break;
      case 'data':
        this.validateDataManifest(manifest);
        break;
      case 'event':
        this.validateEventManifest(manifest);
        break;
      case 'workflow':
        this.validateWorkflowManifest(manifest);
        break;
    }

    return true;
  }

  validateApiManifest(manifest) {
    if (!manifest.protocol.baseUrl) {
      throw new Error('API manifest requires baseUrl');
    }
  }

  validateDataManifest(manifest) {
    if (!manifest.protocol.format) {
      throw new Error('Data manifest requires format');
    }
  }

  validateEventManifest(manifest) {
    if (!manifest.protocol.transport) {
      throw new Error('Event manifest requires transport');
    }
  }

  validateWorkflowManifest(manifest) {
    if (!manifest.protocol.workflow_type) {
      throw new Error('Workflow manifest requires workflow_type');
    }
  }
}

export default ProtocolGenerator;
