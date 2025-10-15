import os from 'os';

class SmartDefaults {
  static getDefaults(protocolType) {
    const baseDefaults = {
      name: 'my-protocol',
      version: '1.0.0',
      description: 'A new protocol manifest',
      author: os.userInfo().username || 'developer'
    };

    const typeSpecificDefaults = {
      api: {
        baseUrl: 'https://api.example.com',
        authentication: 'bearer',
        endpoint_path: '/api/v1/endpoint',
        endpoint_method: 'GET',
        endpoint_description: 'Main API endpoint'
      },
      data: {
        format: 'json',
        compression: 'gzip'
      },
      event: {
        transport: 'http',
        event_name: 'data-updated',
        event_description: 'Data update event'
      },
      workflow: {
        workflow_type: 'sequential',
        steps: '3',
        trigger: 'manual'
      }
    };

    return {
      ...baseDefaults,
      ...typeSpecificDefaults[protocolType]
    };
  }

  static getProtocolTypes() {
    return ['api', 'data', 'event', 'workflow'];
  }

  static getValidationRules(protocolType) {
    const rules = {
      api: {
        required: ['baseUrl', 'authentication'],
        optional: ['endpoints']
      },
      data: {
        required: ['format'],
        optional: ['compression', 'schema']
      },
      event: {
        required: ['transport', 'events'],
        optional: ['schema']
      },
      workflow: {
        required: ['workflow_type', 'steps'],
        optional: ['trigger', 'conditions']
      }
    };

    return rules[protocolType] || {};
  }

  static suggestFieldValues(field, protocolType) {
    const suggestions = {
      authentication: ['bearer', 'api-key', 'oauth2', 'basic'],
      format: ['json', 'xml', 'yaml', 'csv', 'protobuf'],
      transport: ['http', 'websocket', 'mqtt', 'kafka', 'rabbitmq'],
      compression: ['none', 'gzip', 'deflate', 'brotli'],
      workflow_type: ['sequential', 'parallel', 'conditional', 'loop'],
      trigger: ['manual', 'scheduled', 'event-driven', 'webhook']
    };

    return suggestions[field] || [];
  }

  static generateExampleManifest(protocolType) {
    const defaults = this.getDefaults(protocolType);
    
    const examples = {
      api: {
        type: 'api',
        name: defaults.name,
        version: defaults.version,
        description: defaults.description,
        protocol: {
          baseUrl: defaults.baseUrl,
          authentication: defaults.authentication,
          endpoints: [{
            path: defaults.endpoint_path,
            method: defaults.endpoint_method,
            description: defaults.endpoint_description
          }]
        },
        metadata: {
          created: new Date().toISOString(),
          author: defaults.author
        }
      },
      data: {
        type: 'data',
        name: defaults.name,
        version: defaults.version,
        description: defaults.description,
        protocol: {
          format: defaults.format,
          compression: defaults.compression,
          schema: {
            fields: []
          }
        },
        metadata: {
          created: new Date().toISOString(),
          author: defaults.author
        }
      },
      event: {
        type: 'event',
        name: defaults.name,
        version: defaults.version,
        description: defaults.description,
        protocol: {
          transport: defaults.transport,
          events: [{
            name: defaults.event_name,
            schema: {},
            description: defaults.event_description
          }]
        },
        metadata: {
          created: new Date().toISOString(),
          author: defaults.author
        }
      },
      workflow: {
        type: 'workflow',
        name: defaults.name,
        version: defaults.version,
        description: defaults.description,
        protocol: {
          workflow_type: defaults.workflow_type,
          steps: parseInt(defaults.steps),
          trigger: defaults.trigger,
          nodes: []
        },
        metadata: {
          created: new Date().toISOString(),
          author: defaults.author
        }
      }
    };

    return examples[protocolType];
  }
}

export default SmartDefaults;
