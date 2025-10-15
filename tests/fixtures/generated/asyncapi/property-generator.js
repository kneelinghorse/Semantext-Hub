export function generateRandomAsyncAPI() {
  const channels = ['user.events', 'order.events', 'product.events', 'system.events'];
  const operations = ['publish', 'subscribe'];
  
  const spec = {
    asyncapi: '2.6.0',
    info: {
      title: `Test Event API ${Math.random().toString(36).substr(2, 9)}`,
      version: `${Math.floor(Math.random() * 10) + 1}.0.0`,
      description: 'Generated test event API'
    },
    channels: {}
  };

  // Generate random channels
  const numChannels = Math.floor(Math.random() * 3) + 1;
  for (let i = 0; i < numChannels; i++) {
    const channelName = channels[Math.floor(Math.random() * channels.length)];
    const operation = operations[Math.floor(Math.random() * operations.length)];
    
    spec.channels[channelName] = {
      [operation]: {
        message: {
          payload: {
            type: 'object',
            properties: {
              eventType: { type: 'string' },
              timestamp: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    };
  }

  return spec;
}