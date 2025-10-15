import { describe, it, expect } from '@jest/globals';
import { generateRandomWorkflow } from '../../fixtures/generated/workflow/property-generator.js';

describe('Workflow Property Tests', () => {
  it('should always have required fields', async () => {
    for (let i = 0; i < 100; i++) {
      const workflow = generateRandomWorkflow();
      expect(workflow.workflowId).toBeDefined();
      expect(workflow.name).toBeDefined();
      expect(workflow.version).toBeDefined();
      expect(workflow.steps).toBeDefined();
      expect(Array.isArray(workflow.steps)).toBe(true);
    }
  });

  it('should always have valid step structure', async () => {
    const validStepTypes = ['task', 'validation', 'notification', 'condition'];
    
    for (let i = 0; i < 100; i++) {
      const workflow = generateRandomWorkflow();
      
      for (const step of workflow.steps) {
        expect(step.stepId).toBeDefined();
        expect(step.type).toBeDefined();
        expect(validStepTypes).toContain(step.type);
        expect(typeof step.stepId).toBe('string');
        expect(typeof step.type).toBe('string');
      }
    }
  });

  it('should always have unique step IDs', async () => {
    for (let i = 0; i < 100; i++) {
      const workflow = generateRandomWorkflow();
      const stepIds = workflow.steps.map(step => step.stepId);
      const uniqueStepIds = new Set(stepIds);
      expect(uniqueStepIds.size).toBe(stepIds.length);
    }
  });

  it('should always have valid version format', async () => {
    for (let i = 0; i < 100; i++) {
      const workflow = generateRandomWorkflow();
      expect(workflow.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});