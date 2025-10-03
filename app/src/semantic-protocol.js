/**
 * Semantic Protocol v2.0
 * Universal semantic understanding for UI components
 * 
 * Teaching software to understand itself.
 * Zero dependencies. Protocol over frameworks.
 */

class SemanticProtocol {
  constructor() {
    this.version = '2.0.0';
    this.manifests = new Map();
    this.validators = new Map();
    this.relationships = new Map();
    this.contexts = new WeakMap();
    
    // Initialize built-in validators
    this._initializeValidators();
  }

  /**
   * Create a semantic manifest for a component
   */
  createManifest(config) {
    const manifest = {
      id: config.id || this._generateId(),
      protocol: 'semantic-ui/v2',
      timestamp: Date.now(),
      
      // Core semantic information
      element: {
        type: config.type,
        role: config.role,
        intent: config.intent,
        criticality: config.criticality || 'normal'
      },
      
      // Semantic meaning and behavior
      semantics: {
        category: config.category,
        purpose: config.purpose,
        capabilities: config.capabilities || [],
        constraints: config.constraints || [],
        ...config.semantics
      },
      
      // Context information
      context: {
        domain: config.domain,
        flow: config.flow,
        step: config.step,
        prerequisites: config.prerequisites || [],
        outcomes: config.outcomes || [],
        ...config.context
      },
      
      // Relationships to other components
      relationships: {
        parent: config.parent,
        children: config.children || [],
        dependencies: config.dependencies || [],
        observers: config.observers || [],
        ...config.relationships
      },
      
      // Validation rules
      validation: {
        rules: config.rules || [],
        required: config.required || false,
        async: config.async || false,
        ...config.validation
      },
      
      // Rendering hints
      rendering: {
        component: config.component,
        props: config.props || {},
        responsive: config.responsive || true,
        accessibility: config.accessibility || {},
        ...config.rendering
      },
      
      // Metadata
      metadata: {
        version: config.version || '1.0.0',
        author: config.author,
        tags: config.tags || [],
        description: config.description,
        ...config.metadata
      }
    };
    
    // Validate the manifest
    const validation = this.validateManifest(manifest);
    if (!validation.valid) {
      throw new Error(`Invalid manifest: ${validation.errors.join(', ')}`);
    }
    
    // Store the manifest
    this.manifests.set(manifest.id, manifest);
    
    // Register relationships
    this._registerRelationships(manifest);
    
    return manifest;
  }

  /**
   * Validate a semantic manifest
   */
  validateManifest(manifest) {
    const errors = [];
    
    // Check required fields
    if (!manifest.protocol || !manifest.protocol.startsWith('semantic-ui/')) {
      errors.push('Invalid or missing protocol version');
    }
    
    if (!manifest.element || !manifest.element.type) {
      errors.push('Missing element type');
    }
    
    if (!manifest.semantics || !manifest.semantics.purpose) {
      errors.push('Missing semantic purpose');
    }
    
    // Validate relationships
    if (manifest.relationships) {
      if (manifest.relationships.parent && !this.manifests.has(manifest.relationships.parent)) {
        // Parent doesn't need to exist yet (might be registered later)
        // But we note it for future validation
      }
      
      // Check for circular dependencies
      if (this._hasCircularDependency(manifest)) {
        errors.push('Circular dependency detected');
      }
    }
    
    // Custom validators
    for (const [name, validator] of this.validators) {
      const result = validator(manifest);
      if (!result.valid) {
        errors.push(`${name}: ${result.error}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Discover components by semantic query
   */
  discover(query) {
    const results = [];
    
    for (const [id, manifest] of this.manifests) {
      if (this._matchesQuery(manifest, query)) {
        results.push(manifest);
      }
    }
    
    // Sort by relevance
    return this._sortByRelevance(results, query);
  }

  /**
   * Query components using semantic selectors
   */
  query(selector) {
    // Parse selector syntax
    // Examples: 
    //   "type:form intent:payment"
    //   "category:input[required=true]"
    //   "flow:checkout step:3"
    
    const parts = selector.split(' ');
    const criteria = {};
    
    for (const part of parts) {
      const [key, value] = part.split(':');
      if (value) {
        criteria[key] = value;
      }
    }
    
    return this.discover(criteria);
  }

  /**
   * Get component relationships
   */
  getRelationships(componentId) {
    const manifest = this.manifests.get(componentId);
    if (!manifest) return null;
    
    const relationships = {
      parent: null,
      children: [],
      siblings: [],
      dependencies: [],
      dependents: []
    };
    
    // Get parent
    if (manifest.relationships.parent) {
      relationships.parent = this.manifests.get(manifest.relationships.parent);
    }
    
    // Get children
    for (const childId of manifest.relationships.children || []) {
      const child = this.manifests.get(childId);
      if (child) relationships.children.push(child);
    }
    
    // Get siblings (same parent)
    if (relationships.parent) {
      for (const siblingId of relationships.parent.relationships.children || []) {
        if (siblingId !== componentId) {
          const sibling = this.manifests.get(siblingId);
          if (sibling) relationships.siblings.push(sibling);
        }
      }
    }
    
    // Get dependencies and dependents
    for (const [id, otherManifest] of this.manifests) {
      if (manifest.relationships.dependencies?.includes(id)) {
        relationships.dependencies.push(otherManifest);
      }
      if (otherManifest.relationships.dependencies?.includes(componentId)) {
        relationships.dependents.push(otherManifest);
      }
    }
    
    return relationships;
  }

  /**
   * Set context for a component
   */
  setContext(component, context) {
    this.contexts.set(component, context);
    
    // Propagate context to children if specified
    if (context.propagate && component.semanticManifest) {
      const manifest = component.semanticManifest;
      for (const childId of manifest.relationships.children || []) {
        const child = document.querySelector(`[data-semantic-id="${childId}"]`);
        if (child) {
          this.setContext(child, { ...context, inherited: true });
        }
      }
    }
  }

  /**
   * Get context for a component
   */
  getContext(component) {
    return this.contexts.get(component) || null;
  }

  /**
   * Register a custom validator
   */
  registerValidator(name, validator) {
    this.validators.set(name, validator);
  }

  /**
   * Compare two manifests and return differences
   */
  diff(manifest1, manifest2) {
    const differences = [];
    
    // Deep comparison of manifest structures
    const compare = (obj1, obj2, path = '') => {
      for (const key in obj1) {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (!(key in obj2)) {
          differences.push({
            type: 'removed',
            path: currentPath,
            oldValue: obj1[key]
          });
        } else if (typeof obj1[key] === 'object' && typeof obj2[key] === 'object') {
          compare(obj1[key], obj2[key], currentPath);
        } else if (obj1[key] !== obj2[key]) {
          differences.push({
            type: 'changed',
            path: currentPath,
            oldValue: obj1[key],
            newValue: obj2[key]
          });
        }
      }
      
      for (const key in obj2) {
        if (!(key in obj1)) {
          const currentPath = path ? `${path}.${key}` : key;
          differences.push({
            type: 'added',
            path: currentPath,
            newValue: obj2[key]
          });
        }
      }
    };
    
    compare(manifest1, manifest2);
    return differences;
  }

  /**
   * Generate automatic tests from manifest
   */
  generateTests(manifest) {
    const tests = [];
    
    // Validation tests
    if (manifest.validation.rules) {
      for (const rule of manifest.validation.rules) {
        tests.push({
          type: 'validation',
          description: `Should validate ${rule.field} with ${rule.type}`,
          test: () => this._generateValidationTest(manifest, rule)
        });
      }
    }
    
    // Relationship tests
    if (manifest.relationships.dependencies) {
      for (const dep of manifest.relationships.dependencies) {
        tests.push({
          type: 'dependency',
          description: `Should have dependency on ${dep}`,
          test: () => this._generateDependencyTest(manifest, dep)
        });
      }
    }
    
    // Outcome tests
    if (manifest.context.outcomes) {
      for (const outcome of manifest.context.outcomes) {
        tests.push({
          type: 'outcome',
          description: `Should produce outcome: ${outcome}`,
          test: () => this._generateOutcomeTest(manifest, outcome)
        });
      }
    }
    
    return tests;
  }

  // Private helper methods
  
  _initializeValidators() {
    // Built-in validators
    this.registerValidator('accessibility', (manifest) => {
      if (!manifest.rendering?.accessibility?.label) {
        return { valid: false, error: 'Missing accessibility label' };
      }
      return { valid: true };
    });
    
    this.registerValidator('security', (manifest) => {
      if (manifest.element.type === 'password' && !manifest.validation?.rules?.some(r => r.type === 'strength')) {
        return { valid: false, error: 'Password fields must have strength validation' };
      }
      return { valid: true };
    });
  }

  _generateId() {
    return `sem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  _registerRelationships(manifest) {
    // Store relationship mappings for fast lookup
    if (!this.relationships.has(manifest.id)) {
      this.relationships.set(manifest.id, new Set());
    }
    
    // Register all relationships bidirectionally
    for (const depId of manifest.relationships.dependencies || []) {
      if (!this.relationships.has(depId)) {
        this.relationships.set(depId, new Set());
      }
      this.relationships.get(depId).add(manifest.id);
    }
  }

  _hasCircularDependency(manifest, visited = new Set()) {
    if (visited.has(manifest.id)) return true;
    visited.add(manifest.id);
    
    for (const depId of manifest.relationships.dependencies || []) {
      const dep = this.manifests.get(depId);
      if (dep && this._hasCircularDependency(dep, visited)) {
        return true;
      }
    }
    
    visited.delete(manifest.id);
    return false;
  }

  _matchesQuery(manifest, query) {
    for (const [key, value] of Object.entries(query)) {
      const manifestValue = this._getNestedValue(manifest, key);
      if (manifestValue !== value) {
        return false;
      }
    }
    return true;
  }

  _getNestedValue(obj, path) {
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (current && typeof current === 'object') {
        current = current[part];
      } else {
        return undefined;
      }
    }
    
    return current;
  }

  _sortByRelevance(results, query) {
    // Simple relevance scoring based on match quality
    return results.sort((a, b) => {
      let scoreA = 0, scoreB = 0;
      
      for (const [key, value] of Object.entries(query)) {
        if (this._getNestedValue(a, key) === value) scoreA++;
        if (this._getNestedValue(b, key) === value) scoreB++;
      }
      
      return scoreB - scoreA;
    });
  }

  _generateValidationTest(manifest, rule) {
    return `
      test('${manifest.element.type} validates ${rule.field}', () => {
        const component = new ${manifest.rendering.component}();
        const value = 'test_value';
        const result = component.validate('${rule.field}', value);
        expect(result.valid).toBeDefined();
      });
    `;
  }

  _generateDependencyTest(manifest, dependency) {
    return `
      test('${manifest.element.type} has dependency on ${dependency}', () => {
        const component = document.querySelector('[data-semantic-id="${manifest.id}"]');
        const dependency = document.querySelector('[data-semantic-id="${dependency}"]');
        expect(dependency).toBeTruthy();
        expect(component.semanticManifest.relationships.dependencies).toContain('${dependency}');
      });
    `;
  }

  _generateOutcomeTest(manifest, outcome) {
    return `
      test('${manifest.element.type} produces outcome: ${outcome}', async () => {
        const component = new ${manifest.rendering.component}();
        const result = await component.execute();
        expect(result.outcomes).toContain('${outcome}');
      });
    `;
  }
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SemanticProtocol;
} else if (typeof window !== 'undefined') {
  window.SemanticProtocol = SemanticProtocol;
}
