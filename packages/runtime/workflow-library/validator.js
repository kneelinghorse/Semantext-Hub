/**
 * Workflow Validator
 * Validates workflow definitions against the JSON schema with helpful error messages
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workflowSchema = JSON.parse(
  readFileSync(join(__dirname, 'schema/workflow.schema.json'), 'utf-8')
);

class WorkflowValidator {
  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false
    });
    addFormats(this.ajv);
    this.validateSchema = this.ajv.compile(workflowSchema);
  }

  /**
   * Validate a workflow definition
   * @param {object} workflow - The workflow definition to validate
   * @returns {object} - { valid: boolean, errors: array }
   */
  validate(workflow) {
    if (!workflow || typeof workflow !== 'object') {
      return {
        valid: false,
        errors: [{
          path: '',
          message: 'Workflow must be a non-null object',
          severity: 'error'
        }]
      };
    }

    // Schema validation
    const schemaValid = this.validateSchema(workflow);
    const errors = [];

    if (!schemaValid) {
      errors.push(...this._formatSchemaErrors(this.validateSchema.errors));
    }

    // Semantic validations
    errors.push(...this._validateSemantics(workflow));

    return {
      valid: errors.length === 0,
      errors: errors.filter(e => e.severity === 'error'),
      warnings: errors.filter(e => e.severity === 'warning')
    };
  }

  /**
   * Format AJV schema errors into user-friendly messages
   * @private
   */
  _formatSchemaErrors(ajvErrors) {
    if (!ajvErrors) return [];

    return ajvErrors.map(error => {
      const path = error.instancePath || error.dataPath || '/';
      let message = error.message;

      // Enhance common error messages
      if (error.keyword === 'required') {
        const missing = error.params.missingProperty;
        message = `Missing required field: ${missing}`;
      } else if (error.keyword === 'type') {
        message = `Expected ${error.params.type}, got ${typeof error.data}`;
      } else if (error.keyword === 'pattern') {
        message = `Value does not match pattern ${error.params.pattern}`;
      } else if (error.keyword === 'enum') {
        message = `Must be one of: ${error.params.allowedValues.join(', ')}`;
      } else if (error.keyword === 'minItems') {
        message = `Must have at least ${error.params.limit} items`;
      }

      return {
        path,
        message,
        severity: 'error',
        keyword: error.keyword
      };
    });
  }

  /**
   * Validate semantic constraints beyond schema validation
   * @private
   */
  _validateSemantics(workflow) {
    const errors = [];

    // Collect all step IDs for dependency validation
    const stepIds = new Set();
    const compensationSteps = new Set();

    this._collectStepIds(workflow.steps, stepIds, compensationSteps);

    // Validate step dependencies
    this._validateStepDependencies(workflow.steps, stepIds, errors);

    // Validate compensation references
    this._validateCompensationRefs(workflow.steps, stepIds, compensationSteps, errors);

    // Validate no circular dependencies
    this._validateNoCycles(workflow.steps, errors);

    // Validate timeout values
    this._validateTimeouts(workflow, errors);

    return errors;
  }

  /**
   * Recursively collect all step IDs from workflow
   * @private
   */
  _collectStepIds(steps, stepIds, compensationSteps, path = '') {
    if (!steps) return;

    for (const step of steps) {
      if (step.stepId) {
        if (stepIds.has(step.stepId)) {
          // Duplicate step ID - will be caught by validation
        }
        stepIds.add(step.stepId);

        if (step.type === 'compensation') {
          compensationSteps.add(step.stepId);
        }
      }

      // Recurse into parallel branches
      if (step.branches) {
        for (const branch of step.branches) {
          this._collectStepIds(branch.steps, stepIds, compensationSteps, `${path}/${step.stepId}`);
        }
      }

      // Recurse into conditional cases
      if (step.cases) {
        for (const caseItem of step.cases) {
          this._collectStepIds(caseItem.steps, stepIds, compensationSteps, `${path}/${step.stepId}`);
        }
      }

      // Recurse into default case
      if (step.default) {
        this._collectStepIds(step.default, stepIds, compensationSteps, `${path}/${step.stepId}`);
      }
    }
  }

  /**
   * Validate that step dependencies reference valid step IDs
   * @private
   */
  _validateStepDependencies(steps, stepIds, errors, path = '') {
    if (!steps) return;

    for (const step of steps) {
      if (step.dependsOn) {
        for (const depId of step.dependsOn) {
          if (!stepIds.has(depId)) {
            errors.push({
              path: `${path}/steps/${step.stepId}/dependsOn`,
              message: `Step '${step.stepId}' depends on unknown step '${depId}'`,
              severity: 'error'
            });
          }
        }
      }

      // Recurse into nested steps
      if (step.branches) {
        for (const branch of step.branches) {
          this._validateStepDependencies(branch.steps, stepIds, errors, `${path}/${step.stepId}`);
        }
      }
      if (step.cases) {
        for (const caseItem of step.cases) {
          this._validateStepDependencies(caseItem.steps, stepIds, errors, `${path}/${step.stepId}`);
        }
      }
      if (step.default) {
        this._validateStepDependencies(step.default, stepIds, errors, `${path}/${step.stepId}`);
      }
    }
  }

  /**
   * Validate compensation step references
   * @private
   */
  _validateCompensationRefs(steps, stepIds, compensationSteps, errors, path = '') {
    if (!steps) return;

    for (const step of steps) {
      if (step.compensation) {
        if (!stepIds.has(step.compensation)) {
          errors.push({
            path: `${path}/steps/${step.stepId}/compensation`,
            message: `Compensation references unknown step '${step.compensation}'`,
            severity: 'error'
          });
        } else if (!compensationSteps.has(step.compensation)) {
          errors.push({
            path: `${path}/steps/${step.stepId}/compensation`,
            message: `Step '${step.compensation}' is not a compensation step`,
            severity: 'warning'
          });
        }
      }

      // Recurse into nested steps
      if (step.branches) {
        for (const branch of step.branches) {
          this._validateCompensationRefs(branch.steps, stepIds, compensationSteps, errors, `${path}/${step.stepId}`);
        }
      }
      if (step.cases) {
        for (const caseItem of step.cases) {
          this._validateCompensationRefs(caseItem.steps, stepIds, compensationSteps, errors, `${path}/${step.stepId}`);
        }
      }
      if (step.default) {
        this._validateCompensationRefs(step.default, stepIds, compensationSteps, errors, `${path}/${step.stepId}`);
      }
    }
  }

  /**
   * Validate no circular dependencies in workflow
   * @private
   */
  _validateNoCycles(steps, errors) {
    const graph = this._buildDependencyGraph(steps);
    const visited = new Set();
    const recStack = new Set();

    const detectCycle = (stepId, path = []) => {
      if (recStack.has(stepId)) {
        const cycle = [...path, stepId].join(' -> ');
        errors.push({
          path: '/steps',
          message: `Circular dependency detected: ${cycle}`,
          severity: 'error'
        });
        return true;
      }

      if (visited.has(stepId)) {
        return false;
      }

      visited.add(stepId);
      recStack.add(stepId);

      const deps = graph.get(stepId) || [];
      for (const dep of deps) {
        if (detectCycle(dep, [...path, stepId])) {
          return true;
        }
      }

      recStack.delete(stepId);
      return false;
    };

    for (const stepId of graph.keys()) {
      if (!visited.has(stepId)) {
        detectCycle(stepId);
      }
    }
  }

  /**
   * Build dependency graph from steps
   * @private
   */
  _buildDependencyGraph(steps, graph = new Map()) {
    if (!steps) return graph;

    for (const step of steps) {
      if (step.stepId) {
        if (!graph.has(step.stepId)) {
          graph.set(step.stepId, []);
        }
        if (step.dependsOn) {
          graph.set(step.stepId, step.dependsOn);
        }
      }

      // Recurse into nested steps
      if (step.branches) {
        for (const branch of step.branches) {
          this._buildDependencyGraph(branch.steps, graph);
        }
      }
      if (step.cases) {
        for (const caseItem of step.cases) {
          this._buildDependencyGraph(caseItem.steps, graph);
        }
      }
      if (step.default) {
        this._buildDependencyGraph(step.default, graph);
      }
    }

    return graph;
  }

  /**
   * Validate timeout configurations
   * @private
   */
  _validateTimeouts(workflow, errors) {
    const workflowTimeout = workflow.timeout;

    const checkStepTimeouts = (steps, path = '') => {
      if (!steps) return;

      for (const step of steps) {
        if (step.timeout && workflowTimeout && step.timeout > workflowTimeout) {
          errors.push({
            path: `${path}/steps/${step.stepId}/timeout`,
            message: `Step timeout (${step.timeout}ms) exceeds workflow timeout (${workflowTimeout}ms)`,
            severity: 'warning'
          });
        }

        // Recurse into nested steps
        if (step.branches) {
          for (const branch of step.branches) {
            checkStepTimeouts(branch.steps, `${path}/${step.stepId}`);
          }
        }
        if (step.cases) {
          for (const caseItem of step.cases) {
            checkStepTimeouts(caseItem.steps, `${path}/${step.stepId}`);
          }
        }
        if (step.default) {
          checkStepTimeouts(step.default, `${path}/${step.stepId}`);
        }
      }
    };

    checkStepTimeouts(workflow.steps);
  }
}

export default WorkflowValidator;
