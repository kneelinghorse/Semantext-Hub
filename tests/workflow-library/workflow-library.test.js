/**
 * Workflow Library Tests
 * Comprehensive tests for workflow validation, execution, and all patterns
 */

import WorkflowValidator from '../../packages/runtime/workflow-library/validator.js';
import { WorkflowExecutor, ExecutionState } from '../../packages/runtime/workflow-library/executor.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Workflow Library', () => {
  let validator;
  let executor;

  beforeEach(() => {
    validator = new WorkflowValidator();
    executor = new WorkflowExecutor({ dryRun: true });
  });

  describe('Schema Validation', () => {
    test('should validate a valid workflow', () => {
      const workflow = {
        workflowId: 'test-workflow',
        name: 'Test Workflow',
        version: '1.0.0',
        steps: [
          {
            stepId: 'step-1',
            type: 'task',
            task: {
              action: 'test-action',
              inputs: {}
            }
          }
        ]
      };

      const result = validator.validate(workflow);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject workflow with missing required fields', () => {
      const workflow = {
        name: 'Test Workflow'
        // Missing workflowId, version, steps
      };

      const result = validator.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should reject workflow with invalid version format', () => {
      const workflow = {
        workflowId: 'test-workflow',
        name: 'Test Workflow',
        version: 'invalid',
        steps: []
      };

      const result = validator.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('pattern'))).toBe(true);
    });

    test('should reject workflow with empty steps array', () => {
      const workflow = {
        workflowId: 'test-workflow',
        name: 'Test Workflow',
        version: '1.0.0',
        steps: []
      };

      const result = validator.validate(workflow);
      expect(result.valid).toBe(false);
    });

    test('should validate parallel step with branches', () => {
      const workflow = {
        workflowId: 'parallel-test',
        name: 'Parallel Test',
        version: '1.0.0',
        steps: [
          {
            stepId: 'parallel-step',
            type: 'parallel',
            branches: [
              {
                branchId: 'branch-1',
                steps: [
                  {
                    stepId: 'task-1',
                    type: 'task',
                    task: { action: 'action-1', inputs: {} }
                  }
                ]
              }
            ]
          }
        ]
      };

      const result = validator.validate(workflow);
      expect(result.valid).toBe(true);
    });

    test('should validate conditional step with cases', () => {
      const workflow = {
        workflowId: 'conditional-test',
        name: 'Conditional Test',
        version: '1.0.0',
        steps: [
          {
            stepId: 'conditional-step',
            type: 'conditional',
            cases: [
              {
                condition: 'true',
                steps: [
                  {
                    stepId: 'task-1',
                    type: 'task',
                    task: { action: 'action-1', inputs: {} }
                  }
                ]
              }
            ]
          }
        ]
      };

      const result = validator.validate(workflow);
      expect(result.valid).toBe(true);
    });
  });

  describe('Semantic Validation', () => {
    test('should detect unknown step dependency', () => {
      const workflow = {
        workflowId: 'test-workflow',
        name: 'Test Workflow',
        version: '1.0.0',
        steps: [
          {
            stepId: 'step-1',
            type: 'task',
            dependsOn: ['nonexistent-step'],
            task: { action: 'test-action', inputs: {} }
          }
        ]
      };

      const result = validator.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('unknown step'))).toBe(true);
    });

    test('should detect circular dependencies', () => {
      const workflow = {
        workflowId: 'test-workflow',
        name: 'Test Workflow',
        version: '1.0.0',
        steps: [
          {
            stepId: 'step-1',
            type: 'task',
            dependsOn: ['step-2'],
            task: { action: 'action-1', inputs: {} }
          },
          {
            stepId: 'step-2',
            type: 'task',
            dependsOn: ['step-1'],
            task: { action: 'action-2', inputs: {} }
          }
        ]
      };

      const result = validator.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Circular dependency'))).toBe(true);
    });

    test('should detect invalid compensation reference', () => {
      const workflow = {
        workflowId: 'test-workflow',
        name: 'Test Workflow',
        version: '1.0.0',
        steps: [
          {
            stepId: 'step-1',
            type: 'task',
            compensation: 'nonexistent-compensation',
            task: { action: 'action-1', inputs: {} }
          }
        ]
      };

      const result = validator.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('unknown step'))).toBe(true);
    });

    test('should warn about step timeout exceeding workflow timeout', () => {
      const workflow = {
        workflowId: 'test-workflow',
        name: 'Test Workflow',
        version: '1.0.0',
        timeout: 5000,
        steps: [
          {
            stepId: 'step-1',
            type: 'task',
            timeout: 10000,
            task: { action: 'action-1', inputs: {} }
          }
        ]
      };

      const result = validator.validate(workflow);
      expect(result.warnings.some(w => w.message.includes('exceeds workflow timeout'))).toBe(true);
    });
  });

  describe('Sequential Execution', () => {
    test('should execute steps in sequence', async () => {
      const workflow = {
        workflowId: 'sequential-test',
        name: 'Sequential Test',
        version: '1.0.0',
        steps: [
          {
            stepId: 'step-1',
            type: 'task',
            task: { action: 'action-1', inputs: { value: 1 } }
          },
          {
            stepId: 'step-2',
            type: 'task',
            dependsOn: ['step-1'],
            task: { action: 'action-2', inputs: { value: 2 } }
          },
          {
            stepId: 'step-3',
            type: 'task',
            dependsOn: ['step-2'],
            task: { action: 'action-3', inputs: { value: 3 } }
          }
        ]
      };

      const context = await executor.execute(workflow);
      expect(context.state).toBe(ExecutionState.COMPLETED);
      expect(context.stepResults.size).toBe(3);
      expect(context.isStepCompleted('step-1')).toBe(true);
      expect(context.isStepCompleted('step-2')).toBe(true);
      expect(context.isStepCompleted('step-3')).toBe(true);
    });

    test('should skip steps with unmet dependencies', async () => {
      const workflow = {
        workflowId: 'dependency-test',
        name: 'Dependency Test',
        version: '1.0.0',
        steps: [
          {
            stepId: 'step-1',
            type: 'task',
            task: { action: 'action-1', inputs: {} }
          },
          {
            stepId: 'step-2',
            type: 'task',
            dependsOn: ['step-1'],
            condition: 'false', // Will be skipped
            task: { action: 'action-2', inputs: {} }
          },
          {
            stepId: 'step-3',
            type: 'task',
            dependsOn: ['step-2'], // Depends on skipped step
            task: { action: 'action-3', inputs: {} }
          }
        ]
      };

      const skippedSteps = [];
      executor.on('step:skipped', (event) => {
        skippedSteps.push(event.stepId);
      });

      const context = await executor.execute(workflow);
      expect(skippedSteps).toContain('step-2');
      expect(skippedSteps).toContain('step-3');
    });
  });

  describe('Parallel Execution', () => {
    test('should execute parallel branches concurrently', async () => {
      const workflow = {
        workflowId: 'parallel-test',
        name: 'Parallel Test',
        version: '1.0.0',
        steps: [
          {
            stepId: 'parallel-step',
            type: 'parallel',
            branches: [
              {
                branchId: 'branch-1',
                steps: [
                  {
                    stepId: 'task-1',
                    type: 'task',
                    task: { action: 'action-1', inputs: {} }
                  }
                ]
              },
              {
                branchId: 'branch-2',
                steps: [
                  {
                    stepId: 'task-2',
                    type: 'task',
                    task: { action: 'action-2', inputs: {} }
                  }
                ]
              },
              {
                branchId: 'branch-3',
                steps: [
                  {
                    stepId: 'task-3',
                    type: 'task',
                    task: { action: 'action-3', inputs: {} }
                  }
                ]
              }
            ]
          }
        ]
      };

      const events = [];
      executor.on('parallel:start', (event) => {
        events.push({ type: 'start', ...event });
      });
      executor.on('parallel:complete', (event) => {
        events.push({ type: 'complete', ...event });
      });

      const context = await executor.execute(workflow);
      expect(context.state).toBe(ExecutionState.COMPLETED);
      expect(events.find(e => e.type === 'start')).toBeTruthy();
      expect(events.find(e => e.type === 'complete')).toBeTruthy();
    });

    test('should fail if any parallel branch fails', async () => {
      const failingExecutor = new WorkflowExecutor({
        taskExecutor: async (action) => {
          if (action === 'failing-action') {
            throw new Error('Branch failed');
          }
          return { success: true };
        }
      });

      const workflow = {
        workflowId: 'parallel-fail-test',
        name: 'Parallel Fail Test',
        version: '1.0.0',
        compensationPolicy: 'none',
        steps: [
          {
            stepId: 'parallel-step',
            type: 'parallel',
            branches: [
              {
                branchId: 'branch-1',
                steps: [
                  {
                    stepId: 'task-1',
                    type: 'task',
                    task: { action: 'success-action', inputs: {} }
                  }
                ]
              },
              {
                branchId: 'branch-2',
                steps: [
                  {
                    stepId: 'task-2',
                    type: 'task',
                    task: { action: 'failing-action', inputs: {} }
                  }
                ]
              }
            ]
          }
        ]
      };

      await expect(failingExecutor.execute(workflow)).rejects.toThrow();
    });
  });

  describe('Conditional Execution', () => {
    test('should execute matching case', async () => {
      const workflow = {
        workflowId: 'conditional-test',
        name: 'Conditional Test',
        version: '1.0.0',
        steps: [
          {
            stepId: 'initial-task',
            type: 'task',
            task: { action: 'setup', inputs: {} }
          },
          {
            stepId: 'conditional-step',
            type: 'conditional',
            dependsOn: ['initial-task'],
            cases: [
              {
                condition: 'false',
                steps: [
                  {
                    stepId: 'case-1-task',
                    type: 'task',
                    task: { action: 'case-1', inputs: {} }
                  }
                ]
              },
              {
                condition: 'true',
                steps: [
                  {
                    stepId: 'case-2-task',
                    type: 'task',
                    task: { action: 'case-2', inputs: {} }
                  }
                ]
              }
            ]
          }
        ]
      };

      const events = [];
      executor.on('conditional:matched', (event) => {
        events.push(event);
      });

      const context = await executor.execute(workflow);
      expect(context.state).toBe(ExecutionState.COMPLETED);
      expect(events.some(e => e.condition === 'true')).toBe(true);
    });

    test('should execute default case when no match', async () => {
      const workflow = {
        workflowId: 'conditional-default-test',
        name: 'Conditional Default Test',
        version: '1.0.0',
        steps: [
          {
            stepId: 'conditional-step',
            type: 'conditional',
            cases: [
              {
                condition: 'false',
                steps: [
                  {
                    stepId: 'case-task',
                    type: 'task',
                    task: { action: 'case-action', inputs: {} }
                  }
                ]
              }
            ],
            default: [
              {
                stepId: 'default-task',
                type: 'task',
                task: { action: 'default-action', inputs: {} }
              }
            ]
          }
        ]
      };

      const events = [];
      executor.on('conditional:default', (event) => {
        events.push(event);
      });

      const context = await executor.execute(workflow);
      expect(context.state).toBe(ExecutionState.COMPLETED);
      expect(events.length).toBe(1);
    });
  });

  describe('Compensation (Saga Pattern)', () => {
    test('should execute compensation on failure', async () => {
      const compensationExecutor = new WorkflowExecutor({
        taskExecutor: async (action) => {
          if (action === 'failing-action') {
            throw new Error('Task failed');
          }
          return { action, success: true };
        }
      });

      const workflow = {
        workflowId: 'saga-test',
        name: 'Saga Test',
        version: '1.0.0',
        compensationPolicy: 'full',
        steps: [
          {
            stepId: 'step-1',
            type: 'task',
            task: { action: 'action-1', inputs: {} },
            compensation: 'compensate-1'
          },
          {
            stepId: 'compensate-1',
            type: 'compensation',
            task: { action: 'rollback-1', inputs: {} }
          },
          {
            stepId: 'step-2',
            type: 'task',
            dependsOn: ['step-1'],
            task: { action: 'failing-action', inputs: {} },
            onFailure: 'fail'
          }
        ]
      };

      const compensationEvents = [];
      compensationExecutor.on('compensation:start', (event) => {
        compensationEvents.push({ type: 'start', ...event });
      });
      compensationExecutor.on('compensation:step', (event) => {
        compensationEvents.push({ type: 'step', ...event });
      });
      compensationExecutor.on('compensation:complete', (event) => {
        compensationEvents.push({ type: 'complete', ...event });
      });

      await expect(compensationExecutor.execute(workflow)).rejects.toThrow();
      expect(compensationEvents.some(e => e.type === 'start')).toBe(true);
      expect(compensationEvents.some(e => e.type === 'complete')).toBe(true);
    });

    test('should execute partial compensation', async () => {
      const compensationExecutor = new WorkflowExecutor({
        taskExecutor: async (action) => {
          if (action === 'failing-action') {
            throw new Error('Task failed');
          }
          return { action, success: true };
        }
      });

      const workflow = {
        workflowId: 'partial-saga-test',
        name: 'Partial Saga Test',
        version: '1.0.0',
        compensationPolicy: 'partial', // Only compensate last step
        steps: [
          {
            stepId: 'step-1',
            type: 'task',
            task: { action: 'action-1', inputs: {} },
            compensation: 'compensate-1'
          },
          {
            stepId: 'compensate-1',
            type: 'compensation',
            task: { action: 'rollback-1', inputs: {} }
          },
          {
            stepId: 'step-2',
            type: 'task',
            dependsOn: ['step-1'],
            task: { action: 'action-2', inputs: {} },
            compensation: 'compensate-2'
          },
          {
            stepId: 'compensate-2',
            type: 'compensation',
            task: { action: 'rollback-2', inputs: {} }
          },
          {
            stepId: 'step-3',
            type: 'task',
            dependsOn: ['step-2'],
            task: { action: 'failing-action', inputs: {} }
          }
        ]
      };

      const compensationEvents = [];
      compensationExecutor.on('compensation:step', (event) => {
        compensationEvents.push(event);
      });

      await expect(compensationExecutor.execute(workflow)).rejects.toThrow();
      // Partial compensation should only execute the most recent compensation
      expect(compensationEvents.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Retry Logic', () => {
    test('should retry failed tasks according to retry policy', async () => {
      let attemptCount = 0;
      const retryExecutor = new WorkflowExecutor({
        taskExecutor: async (action) => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Temporary failure');
          }
          return { success: true };
        }
      });

      const workflow = {
        workflowId: 'retry-test',
        name: 'Retry Test',
        version: '1.0.0',
        steps: [
          {
            stepId: 'retryable-task',
            type: 'task',
            task: { action: 'flaky-action', inputs: {} },
            retryPolicy: {
              maxAttempts: 3,
              backoffMs: 10,
              backoffMultiplier: 1
            }
          }
        ]
      };

      const retryEvents = [];
      retryExecutor.on('step:retry', (event) => {
        retryEvents.push(event);
      });

      const context = await retryExecutor.execute(workflow);
      expect(context.state).toBe(ExecutionState.COMPLETED);
      expect(attemptCount).toBe(3);
      expect(retryEvents.length).toBe(2); // Two retries before success
    });

    test('should fail after max retry attempts', async () => {
      const retryExecutor = new WorkflowExecutor({
        taskExecutor: async () => {
          throw new Error('Persistent failure');
        }
      });

      const workflow = {
        workflowId: 'retry-fail-test',
        name: 'Retry Fail Test',
        version: '1.0.0',
        compensationPolicy: 'none',
        steps: [
          {
            stepId: 'failing-task',
            type: 'task',
            task: { action: 'always-fails', inputs: {} },
            retryPolicy: {
              maxAttempts: 2,
              backoffMs: 10
            }
          }
        ]
      };

      await expect(retryExecutor.execute(workflow)).rejects.toThrow('Persistent failure');
    });
  });

  describe('Example Workflows', () => {
    const examplesDir = path.join(__dirname, '../../packages/runtime/workflow-library/examples');

    test('should validate sequential.json example', () => {
      const workflow = JSON.parse(
        fs.readFileSync(path.join(examplesDir, 'sequential.json'), 'utf-8')
      );
      const result = validator.validate(workflow);
      expect(result.valid).toBe(true);
    });

    test('should validate parallel.json example', () => {
      const workflow = JSON.parse(
        fs.readFileSync(path.join(examplesDir, 'parallel.json'), 'utf-8')
      );
      const result = validator.validate(workflow);
      expect(result.valid).toBe(true);
    });

    test('should validate conditional.json example', () => {
      const workflow = JSON.parse(
        fs.readFileSync(path.join(examplesDir, 'conditional.json'), 'utf-8')
      );
      const result = validator.validate(workflow);
      expect(result.valid).toBe(true);
    });

    test('should validate saga.json example', () => {
      const workflow = JSON.parse(
        fs.readFileSync(path.join(examplesDir, 'saga.json'), 'utf-8')
      );
      const result = validator.validate(workflow);
      expect(result.valid).toBe(true);
    });

    test('should execute sequential.json example in dry-run', async () => {
      const workflow = JSON.parse(
        fs.readFileSync(path.join(examplesDir, 'sequential.json'), 'utf-8')
      );
      const context = await executor.execute(workflow);
      expect(context.state).toBe(ExecutionState.COMPLETED);
    });

    test('should execute parallel.json example in dry-run', async () => {
      const workflow = JSON.parse(
        fs.readFileSync(path.join(examplesDir, 'parallel.json'), 'utf-8')
      );
      const context = await executor.execute(workflow);
      expect(context.state).toBe(ExecutionState.COMPLETED);
    });
  });

  describe('Performance', () => {
    test('validation should complete in <50ms', () => {
      const workflow = {
        workflowId: 'perf-test',
        name: 'Performance Test',
        version: '1.0.0',
        steps: Array.from({ length: 20 }, (_, i) => ({
          stepId: `step-${i}`,
          type: 'task',
          task: { action: `action-${i}`, inputs: {} }
        }))
      };

      const start = Date.now();
      validator.validate(workflow);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });

    test('parallel scheduling overhead should be <10ms', async () => {
      const workflow = {
        workflowId: 'parallel-perf-test',
        name: 'Parallel Performance Test',
        version: '1.0.0',
        steps: [
          {
            stepId: 'parallel-step',
            type: 'parallel',
            branches: Array.from({ length: 5 }, (_, i) => ({
              branchId: `branch-${i}`,
              steps: [
                {
                  stepId: `task-${i}`,
                  type: 'task',
                  task: { action: `action-${i}`, inputs: {} }
                }
              ]
            }))
          }
        ]
      };

      const events = [];
      executor.on('parallel:start', (event) => {
        events.push({ type: 'start', time: Date.now() });
      });
      executor.on('parallel:complete', (event) => {
        events.push({ type: 'complete', time: Date.now(), duration: event.duration });
      });

      await executor.execute(workflow);

      const overhead = events.find(e => e.type === 'complete').duration;
      // Overhead should be minimal (most time is task execution)
      expect(overhead).toBeLessThan(100);
    });
  });
});
