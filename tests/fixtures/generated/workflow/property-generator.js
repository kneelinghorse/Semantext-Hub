export function generateRandomWorkflow() {
  const stepTypes = ['task', 'validation', 'notification', 'condition'];
  const actions = ['process', 'validate', 'notify', 'check'];
  
  const workflowId = `workflow-${Math.random().toString(36).substr(2, 9)}`;
  const version = `${Math.floor(Math.random() * 10) + 1}.0.0`;
  
  const steps = [];
  const numSteps = Math.floor(Math.random() * 5) + 1;
  
  for (let i = 0; i < numSteps; i++) {
    const stepType = stepTypes[Math.floor(Math.random() * stepTypes.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];
    
    steps.push({
      stepId: `step-${i + 1}`,
      type: stepType,
      [stepType]: {
        action: `${action}-${Math.random().toString(36).substr(2, 5)}`,
        inputs: { test: true }
      }
    });
  }
  
  return {
    workflowId,
    name: `Test Workflow ${workflowId}`,
    version,
    steps
  };
}