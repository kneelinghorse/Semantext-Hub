export function generateRandomAgent() {
  const agentId = `agent-${Math.random().toString(36).substr(2, 9)}`;
  const version = `${Math.floor(Math.random() * 10) + 1}.0.0`;
  
  const agent = {
    agent: {
      id: agentId,
      name: `Test Agent ${agentId}`,
      version,
      description: 'Generated test agent'
    }
  };

  // Randomly add capabilities
  if (Math.random() > 0.5) {
    agent.capabilities = {
      tools: [
        {
          name: `tool-${Math.random().toString(36).substr(2, 5)}`,
          description: 'Generated test tool'
        }
      ]
    };
  }

  // Randomly add relationships
  if (Math.random() > 0.5) {
    agent.relationships = {
      api: [`urn:proto:api:test-api@${version}`],
      data: [`urn:proto:data:test-data@${version}`]
    };
  }

  return agent;
}