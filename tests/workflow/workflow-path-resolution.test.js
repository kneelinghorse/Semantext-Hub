/**
 * Workflow Path Resolution Regression Tests
 * 
 * Mission B10.1: Workflow Fixes & Validation Gaps
 * 
 * Tests workflow path resolution and validation integrity to prevent regression
 * of the path-resolution bug identified in Sprint 9.
 */

import { runWorkflow } from '../../packages/runtime/src/agents/runtime.js';
import { runFullValidation } from '../../packages/runtime/workflow/validation-service.js';
import { parseURN, isValidURN } from '../../packages/protocols/core/graph/urn-utils.js';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';

describe('Workflow Path Resolution Regression Tests', () => {
  const examplesDir = path.join(process.cwd(), 'src/examples');
  
  describe('URN Validation', () => {
    test('should validate workflow URNs without authority', () => {
      const workflowUrns = [
        'urn:proto:workflow:research_pipeline@1.1.2',
        'urn:proto:workflow:data_processing@2.0.0',
        'urn:proto:agent:writer@1.1.1',
        'urn:proto:iam:writer@1.1.2'
      ];

      workflowUrns.forEach(urn => {
        expect(isValidURN(urn)).toBe(true);
        const parsed = parseURN(urn);
        expect(parsed).not.toBeNull();
        expect(parsed.kind).toBeDefined();
        expect(parsed.id).toBeDefined();
      });
    });

    test('should validate URNs with authority', () => {
      const apiUrns = [
        'urn:proto:api:github.com/repos@1.0.0',
        'urn:proto:data:myapp/users@2.1.0'
      ];

      apiUrns.forEach(urn => {
        expect(isValidURN(urn)).toBe(true);
        const parsed = parseURN(urn);
        expect(parsed).not.toBeNull();
        expect(parsed.authority).toBeDefined();
        expect(parsed.id).toBeDefined();
      });
    });
  });

  describe('Workflow Execution', () => {
    test('should execute workflow-research-pipeline.yaml without path resolution errors', async () => {
      const workflowPath = path.join(examplesDir, 'workflow-research-pipeline.yaml');
      
      // Verify file exists
      expect(await fs.pathExists(workflowPath)).toBe(true);
      
      // Execute workflow
      const result = await runWorkflow({ 
        workflowPath, 
        inputs: {}, 
        root: process.cwd() 
      });
      
      expect(result).toBeDefined();
      expect(result.state).toBe('completed');
    });

    test('should handle workflow with relative path references', async () => {
      const workflowPath = path.join(examplesDir, 'workflow-research-pipeline.yaml');
      
      // Test with different root paths to ensure path resolution works
      const testRoots = [
        process.cwd(),
        path.join(process.cwd(), 'app'),
        path.dirname(workflowPath)
      ];

      for (const root of testRoots) {
        const result = await runWorkflow({ 
          workflowPath, 
          inputs: {}, 
          root 
        });
        
        expect(result).toBeDefined();
        expect(result.state).toBe('completed');
      }
    });
  });

  describe('Validation Integrity', () => {
    test('should validate workflow-research-pipeline.yaml without structural errors', async () => {
      const manifestPath = path.join(examplesDir, 'workflow-research-pipeline.yaml');
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      const manifest = yaml.load(manifestContent);
      
      const result = await runFullValidation({ manifestPath, manifest });
      
      // Should be valid (no errors)
      expect(result.combined.valid).toBe(true);
      expect(result.combined.errors.length).toBe(0);
      
      // Should have workflow contract type recognized
      expect(manifest.workflow).toBeDefined();
      expect(manifest.workflow.version).toBeDefined();
    });

    test('should detect unresolved URN references as warnings', async () => {
      const manifestPath = path.join(examplesDir, 'workflow-research-pipeline.yaml');
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      const manifest = yaml.load(manifestContent);
      
      const result = await runFullValidation({ manifestPath, manifest });
      
      // Should have warnings for unresolved references
      const unresolvedWarnings = result.combined.warnings.filter(w => 
        w.type === 'urn_resolution' && w.message.includes('Unresolved URN reference')
      );
      
      expect(unresolvedWarnings.length).toBeGreaterThan(0);
      
      // Verify specific unresolved references
      const unresolvedUrns = unresolvedWarnings.map(w => w.value);
      expect(unresolvedUrns).toContain('urn:proto:agent:writer@1.1.1');
      expect(unresolvedUrns).toContain('urn:proto:iam:writer@1.1.2');
    });

    test('should validate all workflow examples', async () => {
      const workflowFiles = [
        'workflow-research-pipeline.yaml'
      ];

      for (const file of workflowFiles) {
        const manifestPath = path.join(examplesDir, file);
        
        if (await fs.pathExists(manifestPath)) {
          const manifestContent = await fs.readFile(manifestPath, 'utf8');
          const manifest = yaml.load(manifestContent);
          
          const result = await runFullValidation({ manifestPath, manifest });
          
          // All workflow examples should be structurally valid
          expect(result.combined.valid).toBe(true);
          expect(result.combined.errors.length).toBe(0);
        }
      }
    });
  });

  describe('Cross-Protocol Validation', () => {
    test('should handle workflow URNs in cross-protocol validation', async () => {
      const manifestPath = path.join(examplesDir, 'workflow-research-pipeline.yaml');
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      const manifest = yaml.load(manifestContent);
      
      const result = await runFullValidation({ manifestPath, manifest });
      
      // Cross-protocol validation should run without errors
      expect(result.cross).toBeDefined();
      expect(result.combined).toBeDefined();
      
      // Should not have URN format errors
      const urnFormatErrors = result.combined.errors.filter(e => 
        e.message && e.message.includes('Invalid URN format')
      );
      expect(urnFormatErrors.length).toBe(0);
    });

    test('should extract URNs from workflow spec correctly', async () => {
      const manifestPath = path.join(examplesDir, 'workflow-research-pipeline.yaml');
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      const manifest = yaml.load(manifestContent);
      
      const result = await runFullValidation({ manifestPath, manifest });
      
      // Should find URNs in workflow spec
      const extractedUrns = [];
      
      // Check for URNs in agent nodes
      if (manifest.spec?.nodes) {
        manifest.spec.nodes.forEach(node => {
          if (node.agent?.urn) {
            extractedUrns.push(node.agent.urn);
          }
          if (node.agent?.delegation?.urn) {
            extractedUrns.push(node.agent.delegation.urn);
          }
        });
      }
      
      expect(extractedUrns.length).toBeGreaterThan(0);
      expect(extractedUrns).toContain('urn:proto:agent:writer@1.1.1');
      expect(extractedUrns).toContain('urn:proto:iam:writer@1.1.2');
    });
  });

  describe('Performance Regression', () => {
    test('workflow validation should complete within performance threshold', async () => {
      const manifestPath = path.join(examplesDir, 'workflow-research-pipeline.yaml');
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      const manifest = yaml.load(manifestContent);
      
      const startTime = performance.now();
      const result = await runFullValidation({ manifestPath, manifest });
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      
      // Should complete within 100ms (performance regression threshold)
      expect(duration).toBeLessThan(100);
      expect(result.combined.valid).toBe(true);
    });

    test('workflow execution should complete within performance threshold', async () => {
      const workflowPath = path.join(examplesDir, 'workflow-research-pipeline.yaml');
      
      const startTime = performance.now();
      const result = await runWorkflow({ 
        workflowPath, 
        inputs: {}, 
        root: process.cwd() 
      });
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      
      // Should complete within 50ms (performance regression threshold)
      expect(duration).toBeLessThan(50);
      expect(result.state).toBe('completed');
    });
  });
});
