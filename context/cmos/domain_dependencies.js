// domain_dependencies.js
// Dependency Mapping and Relationship Tracking for Mission 2.2
// Tracks relationships between domains, manages dependency graphs, and optimizes loading order

class DomainDependencies {
  constructor(config = {}) {
    this.config = {
      // Dependency analysis settings
      analysis: {
        maxDepth: config.analysis?.maxDepth || 5,
        circularDependencyThreshold: config.analysis?.circularDependencyThreshold || 10,
        criticalPathThreshold: config.analysis?.criticalPathThreshold || 0.8,
        ...config.analysis
      },

      // Relationship strength thresholds
      relationships: {
        strongCoupling: config.relationships?.strongCoupling || 0.7,
        moderateCoupling: config.relationships?.moderateCoupling || 0.4,
        weakCoupling: config.relationships?.weakCoupling || 0.1,
        ...config.relationships
      },

      // Performance thresholds
      performance: {
        maxAnalysisTimeMs: config.performance?.maxAnalysisTimeMs || 1000,
        cacheExpiryMs: config.performance?.cacheExpiryMs || 300000, // 5 minutes
        ...config.performance
      }
    };

    // Dependency tracking
    this.dependencyGraph = new Map();
    this.relationships = new Map();
    this.criticalPaths = [];
    this.circularDependencies = [];

    // Analysis cache
    this.analysisCache = new Map();
    this.lastAnalysis = null;

    // Performance tracking
    this.analysisHistory = [];
  }

  /**
   * Build comprehensive dependency map for domains
   * @param {Array} domains - Array of domain definitions
   * @param {Map} fileDependencies - File-level dependency graph
   * @returns {Object} Complete dependency analysis
   */
  buildDependencyMap(domains, fileDependencies) {
    const startTime = Date.now();

    try {
      // Step 1: Build domain-level dependency graph
      this.buildDomainGraph(domains, fileDependencies);

      // Step 2: Analyze relationship strengths
      this.analyzeRelationshipStrengths(domains);

      // Step 3: Detect circular dependencies
      this.detectCircularDependencies();

      // Step 4: Identify critical paths
      this.identifyCriticalPaths();

      // Step 5: Calculate loading priorities
      const loadingOrder = this.calculateLoadingOrder();

      // Step 6: Generate relationship metrics
      const metrics = this.generateRelationshipMetrics();

      const analysisResult = {
        dependencyGraph: this.serializeDependencyGraph(),
        relationships: this.serializeRelationships(),
        circularDependencies: this.circularDependencies,
        criticalPaths: this.criticalPaths,
        loadingOrder,
        metrics,
        analysisTime: Date.now() - startTime,
        timestamp: Date.now()
      };

      this.lastAnalysis = analysisResult;
      this.recordAnalysis(analysisResult);

      return analysisResult;

    } catch (error) {
      throw new Error(`Dependency analysis failed: ${error.message}`);
    }
  }

  /**
   * Build domain-level dependency graph from file dependencies
   */
  buildDomainGraph(domains, fileDependencies) {
    this.dependencyGraph.clear();

    // Initialize graph with all domains
    domains.forEach(domain => {
      this.dependencyGraph.set(domain.id, {
        domain,
        dependencies: new Set(),
        dependents: new Set(),
        files: new Map() // Track file-level dependencies within domain
      });
    });

    // Create lookup of file path -> set of domains containing that file path
    const fileToDomains = new Map();
    domains.forEach(domain => {
      domain.files.forEach(file => {
        if (!fileToDomains.has(file.path)) fileToDomains.set(file.path, new Set());
        fileToDomains.get(file.path).add(domain.id);
      });
    });

    // Build cross-domain dependencies (handle duplicate file paths across domains)
    fileDependencies.forEach((deps, filePath) => {
      const sourceDomains = fileToDomains.get(filePath) || new Set();

      deps.forEach(dep => {
        if (!dep || !dep.target) return;
        const targetDomains = fileToDomains.get(dep.target) || new Set();

        sourceDomains.forEach(sourceDomain => {
          targetDomains.forEach(targetDomain => {
            if (targetDomain && targetDomain !== sourceDomain) {
              const sourceNode = this.dependencyGraph.get(sourceDomain);
              const targetNode = this.dependencyGraph.get(targetDomain);
              if (!sourceNode || !targetNode) return;

              sourceNode.dependencies.add(targetDomain);
              targetNode.dependents.add(sourceDomain);

              if (!sourceNode.files.has(targetDomain)) {
                sourceNode.files.set(targetDomain, []);
              }
              sourceNode.files.get(targetDomain).push({
                sourceFile: filePath,
                targetFile: dep.target,
                type: dep.type || 'import'
              });
            }
          });
        });
      });
    });
  }

  /**
   * Analyze relationship strengths between domains
   */
  analyzeRelationshipStrengths(domains) {
    this.relationships.clear();

    this.dependencyGraph.forEach((sourceNode, sourceDomainId) => {
      sourceNode.dependencies.forEach(targetDomainId => {
        const relationship = this.calculateRelationshipStrength(
          sourceDomainId,
          targetDomainId,
          sourceNode,
          this.dependencyGraph.get(targetDomainId)
        );

        const relationshipKey = `${sourceDomainId}->${targetDomainId}`;
        this.relationships.set(relationshipKey, relationship);
      });
    });
  }

  /**
   * Calculate relationship strength between two domains
   */
  calculateRelationshipStrength(sourceDomainId, targetDomainId, sourceNode, targetNode) {
    const fileDependencies = sourceNode.files.get(targetDomainId) || [];
    const sourceDomain = sourceNode.domain;
    const targetDomain = targetNode.domain;

    // Factor 1: Number of file-level dependencies (40%)
    const dependencyCount = fileDependencies.length;
    const maxPossibleDeps = sourceDomain.files.length * targetDomain.files.length;
    const dependencyRatio = maxPossibleDeps > 0 ? dependencyCount / maxPossibleDeps : 0;
    const dependencyScore = Math.min(1, dependencyRatio * 10) * 0.4;

    // Factor 2: Bidirectional coupling (30%)
    const reverseDeps = targetNode.files.get(sourceDomainId) || [];
    const bidirectionalScore = reverseDeps.length > 0 ? 0.3 : 0;

    // Factor 3: Shared functionality/keywords (20%)
    const sharedKeywords = this.calculateSharedKeywords(sourceDomain, targetDomain);
    const keywordScore = sharedKeywords * 0.2;

    // Factor 4: Size similarity (10%)
    const sizeRatio = Math.min(sourceDomain.files.length, targetDomain.files.length) /
                     Math.max(sourceDomain.files.length, targetDomain.files.length);
    const sizeScore = sizeRatio * 0.1;

    const totalStrength = dependencyScore + bidirectionalScore + keywordScore + sizeScore;

    return {
      sourceDomain: sourceDomainId,
      targetDomain: targetDomainId,
      strength: Math.min(1, totalStrength),
      coupling: this.categorizeCoupling(totalStrength),
      fileDependencies: fileDependencies.length,
      bidirectional: reverseDeps.length > 0,
      sharedKeywords: sharedKeywords,
      details: {
        dependencyScore,
        bidirectionalScore,
        keywordScore,
        sizeScore
      }
    };
  }

  /**
   * Calculate shared keywords between domains
   */
  calculateSharedKeywords(domain1, domain2) {
    const keywords1 = new Set(domain1.keywords || []);
    const keywords2 = new Set(domain2.keywords || []);

    const intersection = new Set([...keywords1].filter(x => keywords2.has(x)));
    const union = new Set([...keywords1, ...keywords2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Categorize coupling strength
   */
  categorizeCoupling(strength) {
    if (strength >= this.config.relationships.strongCoupling) return 'strong';
    if (strength >= this.config.relationships.moderateCoupling) return 'moderate';
    if (strength >= this.config.relationships.weakCoupling) return 'weak';
    return 'minimal';
  }

  /**
   * Detect circular dependencies using DFS
   */
  detectCircularDependencies() {
    this.circularDependencies = [];
    const visited = new Set();
    const recursionStack = new Set();

    const dfs = (domainId, path = []) => {
      if (recursionStack.has(domainId)) {
        // Found circular dependency
        const cycleStart = path.indexOf(domainId);
        const cycle = path.slice(cycleStart).concat(domainId);

        this.circularDependencies.push({
          cycle,
          length: cycle.length,
          strength: this.calculateCycleStrength(cycle),
          type: cycle.length <= this.config.analysis.circularDependencyThreshold ? 'simple' : 'complex'
        });
        return;
      }

      if (visited.has(domainId)) return;

      visited.add(domainId);
      recursionStack.add(domainId);

      const node = this.dependencyGraph.get(domainId);
      if (node) {
        node.dependencies.forEach(depId => {
          dfs(depId, [...path, domainId]);
        });
      }

      recursionStack.delete(domainId);
    };

    this.dependencyGraph.forEach((_, domainId) => {
      if (!visited.has(domainId)) {
        dfs(domainId);
      }
    });
  }

  /**
   * Calculate the strength of a circular dependency
   */
  calculateCycleStrength(cycle) {
    let totalStrength = 0;
    let edgeCount = 0;

    for (let i = 0; i < cycle.length - 1; i++) {
      const relationshipKey = `${cycle[i]}->${cycle[i + 1]}`;
      const relationship = this.relationships.get(relationshipKey);

      if (relationship) {
        totalStrength += relationship.strength;
        edgeCount++;
      }
    }

    return edgeCount > 0 ? totalStrength / edgeCount : 0;
  }

  /**
   * Identify critical paths in the dependency graph
   */
  identifyCriticalPaths() {
    this.criticalPaths = [];

    // Find root domains (no incoming edges: no dependents)
    const rootDomains = [];
    this.dependencyGraph.forEach((node, domainId) => {
      if (node.dependents.size === 0) {
        rootDomains.push(domainId);
      }
    });

    // Find longest paths from each root
    rootDomains.forEach(rootId => {
      const paths = this.findLongestPaths(rootId);
      paths.forEach(path => {
        const pathStrength = this.calculatePathStrength(path);

        if (pathStrength >= this.config.analysis.criticalPathThreshold) {
          this.criticalPaths.push({
            path,
            strength: pathStrength,
            length: path.length,
            root: rootId
          });
        }
      });
    });

    // Sort by strength descending
    this.criticalPaths.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Find longest paths from a starting domain
   */
  findLongestPaths(startDomain, visited = new Set(), currentPath = []) {
    if (visited.has(startDomain)) return [];

    const newPath = [...currentPath, startDomain];
    const node = this.dependencyGraph.get(startDomain);

    if (!node || node.dependencies.size === 0) {
      return [newPath];
    }

    visited.add(startDomain);
    let allPaths = [];

    node.dependencies.forEach(depId => {
      const paths = this.findLongestPaths(depId, new Set(visited), newPath);
      allPaths = allPaths.concat(paths);
    });

    return allPaths;
  }

  /**
   * Calculate strength of a dependency path
   */
  calculatePathStrength(path) {
    if (path.length < 2) return 0;

    let totalStrength = 0;
    let edgeCount = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const relationshipKey = `${path[i]}->${path[i + 1]}`;
      const relationship = this.relationships.get(relationshipKey);

      if (relationship) {
        totalStrength += relationship.strength;
        edgeCount++;
      }
    }

    return edgeCount > 0 ? totalStrength / edgeCount : 0;
  }

  /**
   * Calculate optimal loading order for domains
   */
  calculateLoadingOrder() {
    const loadingOrder = [];
    const inDegree = new Map();
    const queue = [];

    // Calculate in-degrees (topological sort preparation)
    this.dependencyGraph.forEach((_, domainId) => {
      inDegree.set(domainId, 0);
    });

    this.dependencyGraph.forEach(node => {
      node.dependencies.forEach(depId => {
        inDegree.set(depId, (inDegree.get(depId) || 0) + 1);
      });
    });

    // Add domains with no dependencies to queue
    inDegree.forEach((degree, domainId) => {
      if (degree === 0) {
        queue.push({
          domainId,
          priority: this.calculateLoadingPriority(domainId)
        });
      }
    });

    // Process queue with priority consideration
    while (queue.length > 0) {
      // Sort by priority (higher priority first)
      queue.sort((a, b) => b.priority - a.priority);
      const current = queue.shift();

      loadingOrder.push({
        domain: current.domainId,
        priority: current.priority,
        loadingStrategy: this.determineLoadingStrategy(current.domainId)
      });

      // Update in-degrees and add newly available domains
      const node = this.dependencyGraph.get(current.domainId);
      if (node) {
        node.dependencies.forEach(depId => {
          const newDegree = inDegree.get(depId) - 1;
          inDegree.set(depId, newDegree);

          if (newDegree === 0) {
            queue.push({
              domainId: depId,
              priority: this.calculateLoadingPriority(depId)
            });
          }
        });
      }
    }

    return loadingOrder;
  }

  /**
   * Calculate loading priority for a domain
   */
  calculateLoadingPriority(domainId) {
    const node = this.dependencyGraph.get(domainId);
    if (!node) return 0;

    // Factor 1: Number of dependents (40%)
    const dependentScore = node.dependents.size * 0.4;

    // Factor 2: Critical path involvement (30%)
    const criticalScore = this.criticalPaths.some(cp => cp.path.includes(domainId)) ? 0.3 : 0;

    // Factor 3: Domain size/complexity (20%)
    const sizeScore = Math.min(1, node.domain.files.length / 20) * 0.2;

    // Factor 4: Relationship strength average (10%)
    let avgStrength = 0;
    let relationshipCount = 0;

    this.relationships.forEach(rel => {
      if (rel.sourceDomain === domainId || rel.targetDomain === domainId) {
        avgStrength += rel.strength;
        relationshipCount++;
      }
    });

    const strengthScore = relationshipCount > 0 ? (avgStrength / relationshipCount) * 0.1 : 0;

    return dependentScore + criticalScore + sizeScore + strengthScore;
  }

  /**
   * Determine loading strategy for a domain
   */
  determineLoadingStrategy(domainId) {
    const node = this.dependencyGraph.get(domainId);
    if (!node) return 'standard';

    const domain = node.domain;
    const priority = this.calculateLoadingPriority(domainId);

    // High priority domains - preload
    if (priority > 0.7) return 'preload';

    // Large domains - lazy load
    if (domain.files.length > 30) return 'lazy';

    // Domains with many dependencies - staged load
    if (node.dependencies.size > 5) return 'staged';

    return 'standard';
  }

  /**
   * Generate comprehensive relationship metrics
   */
  generateRelationshipMetrics() {
    const metrics = {
      totalDomains: this.dependencyGraph.size,
      totalRelationships: this.relationships.size,
      averageRelationshipStrength: 0,
      couplingDistribution: { strong: 0, moderate: 0, weak: 0, minimal: 0 },
      circularDependencyCount: this.circularDependencies.length,
      criticalPathCount: this.criticalPaths.length,
      isolatedDomains: 0,
      maxDepth: 0,
      complexity: 0
    };

    // Calculate relationship metrics
    let totalStrength = 0;
    this.relationships.forEach(rel => {
      totalStrength += rel.strength;
      metrics.couplingDistribution[rel.coupling]++;
    });

    metrics.averageRelationshipStrength = this.relationships.size > 0 ?
      totalStrength / this.relationships.size : 0;

    // Count isolated domains
    this.dependencyGraph.forEach(node => {
      if (node.dependencies.size === 0 && node.dependents.size === 0) {
        metrics.isolatedDomains++;
      }
    });

    // Calculate max depth
    metrics.maxDepth = Math.max(...this.criticalPaths.map(cp => cp.length), 0);

    // Calculate complexity score
    metrics.complexity = this.calculateGraphComplexity();

    return metrics;
  }

  /**
   * Calculate overall graph complexity
   */
  calculateGraphComplexity() {
    const n = this.dependencyGraph.size;
    const e = this.relationships.size;
    const c = this.circularDependencies.length;

    if (n === 0) return 0;

    // Complexity factors
    const densityFactor = e / (n * (n - 1)); // Edge density
    const cycleFactor = c / Math.max(1, n); // Circular dependency ratio
    const depthFactor = this.criticalPaths.length > 0 ?
      Math.max(...this.criticalPaths.map(cp => cp.length)) / n : 0;

    return Math.min(1, (densityFactor + cycleFactor + depthFactor) / 3);
  }

  /**
   * Optimize dependency structure for better performance
   */
  optimizeDependencyStructure() {
    const optimizations = [];

    // Identify optimization opportunities
    this.circularDependencies.forEach(cycle => {
      optimizations.push({
        type: 'break_cycle',
        cycle: cycle.cycle,
        severity: cycle.strength > 0.7 ? 'high' : 'medium',
        recommendation: `Consider breaking circular dependency: ${cycle.cycle.join(' -> ')}`
      });
    });

    // Identify overly coupled domains
    this.relationships.forEach(rel => {
      if (rel.coupling === 'strong' && rel.strength > 0.8) {
        optimizations.push({
          type: 'reduce_coupling',
          domains: [rel.sourceDomain, rel.targetDomain],
          severity: 'medium',
          recommendation: `Consider reducing coupling between ${rel.sourceDomain} and ${rel.targetDomain}`
        });
      }
    });

    return optimizations;
  }

  /**
   * Serialization helpers
   */
  serializeDependencyGraph() {
    const serialized = {};

    this.dependencyGraph.forEach((node, domainId) => {
      serialized[domainId] = {
        dependencies: Array.from(node.dependencies),
        dependents: Array.from(node.dependents),
        fileCount: node.domain.files.length,
        fileDependencies: {}
      };

      node.files.forEach((deps, targetDomain) => {
        serialized[domainId].fileDependencies[targetDomain] = deps.length;
      });
    });

    return serialized;
  }

  serializeRelationships() {
    const serialized = {};

    this.relationships.forEach((rel, key) => {
      serialized[key] = {
        strength: rel.strength,
        coupling: rel.coupling,
        fileDependencies: rel.fileDependencies,
        bidirectional: rel.bidirectional
      };
    });

    return serialized;
  }

  recordAnalysis(analysisResult) {
    this.analysisHistory.push({
      timestamp: analysisResult.timestamp,
      analysisTime: analysisResult.analysisTime,
      domainCount: this.dependencyGraph.size,
      relationshipCount: this.relationships.size,
      circularDependencies: analysisResult.circularDependencies.length,
      criticalPaths: analysisResult.criticalPaths.length
    });

    // Keep last 50 analyses
    if (this.analysisHistory.length > 50) {
      this.analysisHistory.shift();
    }
  }

  /**
   * Get diagnostics and performance information
   */
  getDiagnostics() {
    const recentAnalyses = this.analysisHistory.slice(-10);
    const avgAnalysisTime = recentAnalyses.length > 0 ?
      recentAnalyses.reduce((sum, a) => sum + a.analysisTime, 0) / recentAnalyses.length : 0;

    return {
      lastAnalysis: this.lastAnalysis ? {
        timestamp: this.lastAnalysis.timestamp,
        analysisTime: this.lastAnalysis.analysisTime,
        domainCount: this.dependencyGraph.size,
        relationshipCount: this.relationships.size
      } : null,
      performance: {
        averageAnalysisTimeMs: avgAnalysisTime,
        analysisCount: this.analysisHistory.length,
        cacheSize: this.analysisCache.size
      },
      configuration: this.config,
      currentState: {
        domains: this.dependencyGraph.size,
        relationships: this.relationships.size,
        circularDependencies: this.circularDependencies.length,
        criticalPaths: this.criticalPaths.length
      }
    };
  }
}

module.exports = DomainDependencies;
