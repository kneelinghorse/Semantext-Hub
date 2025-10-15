export function generateRandomManifest() {
  const kinds = ['APIProtocol', 'DataProtocol', 'EventProtocol', 'SemanticProtocol'];
  const names = ['test-api', 'test-data', 'test-event', 'test-semantic'];
  
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const name = names[Math.floor(Math.random() * names.length)];
  const version = `${Math.floor(Math.random() * 10) + 1}.0.0`;
  
  return {
    apiVersion: 'protocol.ossp-agi.dev/v1',
    kind,
    metadata: {
      name: `${name}-${Math.random().toString(36).substr(2, 9)}`,
      version,
      description: `Generated ${kind.toLowerCase()} protocol`
    },
    spec: {
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          value: { type: 'number' }
        }
      }
    }
  };
}