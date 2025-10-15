export function generateRandomOpenAPI() {
  const methods = ['get', 'post', 'put', 'delete', 'patch'];
  const paths = ['/users', '/orders', '/products', '/health', '/status'];
  
  const spec = {
    openapi: '3.0.0',
    info: {
      title: `Test API ${Math.random().toString(36).substr(2, 9)}`,
      version: `${Math.floor(Math.random() * 10) + 1}.0.0`,
      description: 'Generated test API'
    },
    paths: {}
  };

  // Generate random paths
  const numPaths = Math.floor(Math.random() * 3) + 1;
  for (let i = 0; i < numPaths; i++) {
    const path = paths[Math.floor(Math.random() * paths.length)];
    const method = methods[Math.floor(Math.random() * methods.length)];
    
    spec.paths[path] = {
      [method]: {
        summary: `Test ${method.toUpperCase()} endpoint`,
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    };
  }

  return spec;
}