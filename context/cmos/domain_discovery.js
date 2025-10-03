// domain_discovery.js
// Domain Discovery Engine for Mission 2.2
// Automatically discovers domains from project structure, dependencies, and usage patterns

const fs = require('fs');
const path = require('path');

class DomainDiscovery {
  constructor(config = {}) {
    this.config = {
      // File patterns that indicate domain boundaries
      domainIndicators: {
        directories: ['src', 'lib', 'modules', 'components', 'services', 'features'],
        fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.java', '.rb'],
        excludePatterns: ['node_modules', '.git', 'build', 'dist', 'coverage'],
        ...config.domainIndicators
      },

      // Clustering parameters
      clustering: {
        minDomainSize: config.clustering?.minDomainSize || 2,
        maxDomainSize: config.clustering?.maxDomainSize || 50,
        similarityThreshold: config.clustering?.similarityThreshold || 0.3,
        ...config.clustering
      },

      // Semantic analysis settings
      semantic: {
        enableKeywordExtraction: config.semantic?.enableKeywordExtraction !== false,
        keywordMinFrequency: config.semantic?.keywordMinFrequency || 2,
        stopWords: new Set([
          'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
          'function', 'class', 'const', 'let', 'var', 'return', 'import', 'export'
        ]),
        ...config.semantic
      }
    };

    // Discovery cache
    this.discoveryCache = new Map();
    this.lastDiscovery = null;
  }

  /**
   * Discover domains in a project directory
   * @param {string} projectPath - Root path to analyze
   * @param {Object} options - Discovery options
   * @returns {Object} Domain discovery results
   */
  async discoverDomains(projectPath, options = {}) {
    const startTime = Date.now();

    try {
      // Check cache first
      const cacheKey = this.getCacheKey(projectPath, options);
      if (this.discoveryCache.has(cacheKey) && !options.forceRefresh) {
        return this.discoveryCache.get(cacheKey);
      }

      // Step 1: Analyze project structure
      const structureAnalysis = await this.analyzeProjectStructure(projectPath);

      // Step 2: Extract file dependencies
      const dependencyGraph = this.extractDependencies(structureAnalysis.files);

      // Step 3: Perform semantic clustering
      const semanticClusters = this.performSemanticClustering(structureAnalysis.files);

      // Step 4: Apply structural clustering
      const structuralClusters = this.performStructuralClustering(structureAnalysis.directories);

      // Step 5: Merge clustering results
      const mergedDomains = this.mergeClusters(semanticClusters, structuralClusters, dependencyGraph);

      // Step 6: Validate and refine domains
      const validatedDomains = this.validateDomains(mergedDomains, structureAnalysis);

      // Step 7: Create domain definitions
      const domainDefinitions = this.createDomainDefinitions(validatedDomains, dependencyGraph);

      const result = {
        domains: domainDefinitions,
        statistics: {
          totalFiles: structureAnalysis.files.length,
          totalDirectories: structureAnalysis.directories.length,
          domainsFound: domainDefinitions.length,
          averageDomainSize: domainDefinitions.reduce((sum, d) => sum + d.files.length, 0) / domainDefinitions.length,
          discoveryTimeMs: Date.now() - startTime
        },
        metadata: {
          projectPath,
          timestamp: Date.now(),
          structureAnalysis,
          dependencyGraph: this.summarizeDependencyGraph(dependencyGraph),
          options
        }
      };

      // Cache result
      this.discoveryCache.set(cacheKey, result);
      this.lastDiscovery = result;

      return result;

    } catch (error) {
      throw new Error(`Domain discovery failed: ${error.message}`);
    }
  }

  /**
   * Analyze project structure - files, directories, patterns
   */
  async analyzeProjectStructure(projectPath) {
    const files = [];
    const directories = [];
    const patterns = new Map();

    const scanDirectory = (dirPath, relativePath = '') => {
      try {
        const items = fs.readdirSync(dirPath);

        items.forEach(item => {
          const fullPath = path.join(dirPath, item);
          const relativeFullPath = path.join(relativePath, item);

          // Skip excluded patterns
          if (this.shouldExclude(relativeFullPath)) return;

          const stats = fs.statSync(fullPath);

          if (stats.isDirectory()) {
            directories.push({
              name: item,
              path: relativeFullPath,
              fullPath,
              depth: relativePath.split(path.sep).length
            });

            // Recurse into subdirectories
            scanDirectory(fullPath, relativeFullPath);

          } else if (stats.isFile()) {
            const ext = path.extname(item);

            if (this.config.domainIndicators.fileTypes.includes(ext)) {
              const fileInfo = {
                name: item,
                path: relativeFullPath,
                fullPath,
                extension: ext,
                size: stats.size,
                directory: relativePath || '.',
                depth: relativePath.split(path.sep).length
              };

              // Extract content for analysis
              try {
                fileInfo.content = fs.readFileSync(fullPath, 'utf-8');
                fileInfo.lines = fileInfo.content.split('\n').length;
              } catch (readError) {
                fileInfo.content = '';
                fileInfo.lines = 0;
              }

              files.push(fileInfo);

              // Track file patterns
              const pattern = this.extractFilePattern(fileInfo);
              if (pattern) {
                if (!patterns.has(pattern)) patterns.set(pattern, []);
                patterns.get(pattern).push(fileInfo);
              }
            }
          }
        });
      } catch (error) {
        // Skip directories we can't read
      }
    };

    scanDirectory(projectPath);

    return {
      files,
      directories,
      patterns: Object.fromEntries(patterns),
      rootPath: projectPath
    };
  }

  /**
   * Extract dependencies between files
   */
  extractDependencies(files) {
    const dependencyGraph = new Map();

    files.forEach(file => {
      const dependencies = this.parseDependencies(file);
      dependencyGraph.set(file.path, dependencies);
    });

    // Resolve relative imports to actual files
    const resolvedGraph = new Map();

    files.forEach(file => {
      const rawDeps = dependencyGraph.get(file.path) || [];
      const resolvedDeps = rawDeps
        .map(dep => this.resolveDependency(dep, file, files))
        .filter(Boolean);

      resolvedGraph.set(file.path, resolvedDeps);
    });

    return resolvedGraph;
  }

  /**
   * Parse dependencies from file content
   */
  parseDependencies(file) {
    const dependencies = [];
    const content = file.content;

    // JavaScript/TypeScript imports
    const importRegex = /(?:import|require)\s*\(?['"`]([^'"`]+)['"`]\)?/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];

      // Skip external dependencies (non-relative paths)
      if (!importPath.startsWith('.') && !importPath.startsWith('/')) continue;

      dependencies.push({
        type: 'import',
        path: importPath,
        line: content.substring(0, match.index).split('\n').length
      });
    }

    // Function calls and references
    const callRegex = /(\w+)\s*\(/g;
    const calls = new Set();

    while ((match = callRegex.exec(content)) !== null) {
      calls.add(match[1]);
    }

    dependencies.push(...Array.from(calls).map(funcName => ({
      type: 'call',
      name: funcName
    })));

    return dependencies;
  }

  /**
   * Resolve relative dependency to actual file
   */
  resolveDependency(dependency, sourceFile, allFiles) {
    if (dependency.type !== 'import') return null;

    const sourceDirPath = path.dirname(sourceFile.path);
    let resolvedPath = path.resolve(sourceDirPath, dependency.path);

    // Normalize path separators
    resolvedPath = resolvedPath.replace(/\\/g, '/');

    // Try different extensions if not specified
    const possiblePaths = [
      resolvedPath,
      resolvedPath + '.js',
      resolvedPath + '.ts',
      resolvedPath + '.jsx',
      resolvedPath + '.tsx',
      path.join(resolvedPath, 'index.js'),
      path.join(resolvedPath, 'index.ts')
    ];

    for (const possiblePath of possiblePaths) {
      const targetFile = allFiles.find(f =>
        f.path.replace(/\\/g, '/').endsWith(possiblePath.replace(/\\/g, '/')) ||
        f.fullPath.replace(/\\/g, '/') === possiblePath.replace(/\\/g, '/')
      );

      if (targetFile) {
        return {
          type: 'import',
          source: sourceFile.path,
          target: targetFile.path,
          originalPath: dependency.path
        };
      }
    }

    return null;
  }

  /**
   * Perform semantic clustering based on file content
   */
  performSemanticClustering(files) {
    const clusters = [];
    const keywords = this.extractKeywords(files);
    const similarityMatrix = this.calculateSemanticSimilarity(files, keywords);

    // Use simple hierarchical clustering
    let currentClusters = files.map(file => ({
      id: this.generateClusterId(),
      files: [file],
      keywords: this.extractFileKeywords(file, keywords),
      type: 'semantic'
    }));

    while (currentClusters.length > 1) {
      let bestMerge = null;
      let bestSimilarity = 0;

      // Find most similar clusters to merge
      for (let i = 0; i < currentClusters.length; i++) {
        for (let j = i + 1; j < currentClusters.length; j++) {
          const similarity = this.calculateClusterSimilarity(
            currentClusters[i],
            currentClusters[j],
            similarityMatrix
          );

          if (similarity > bestSimilarity && similarity > this.config.clustering.similarityThreshold) {
            bestSimilarity = similarity;
            bestMerge = { i, j, similarity };
          }
        }
      }

      if (!bestMerge) break;

      // Merge clusters
      const mergedCluster = this.mergeTwoClusters(
        currentClusters[bestMerge.i],
        currentClusters[bestMerge.j]
      );

      // Remove original clusters and add merged one
      currentClusters = [
        ...currentClusters.slice(0, bestMerge.i),
        ...currentClusters.slice(bestMerge.i + 1, bestMerge.j),
        ...currentClusters.slice(bestMerge.j + 1),
        mergedCluster
      ];
    }

    let result = currentClusters.filter(cluster =>
      cluster.files.length >= this.config.clustering.minDomainSize &&
      cluster.files.length <= this.config.clustering.maxDomainSize
    );

    // Fallback: if no clusters after filtering, group by directory structure or minimal batching
    if (result.length === 0 && files.length > 0) {
      const byDir = new Map();
      files.forEach(f => {
        const dir = f.directory || (f.path && f.path.includes('/') ? f.path.split('/').slice(0, -1).join('/') : '.');
        if (!byDir.has(dir)) byDir.set(dir, []);
        byDir.get(dir).push(f);
      });
      result = Array.from(byDir.values())
        .map(group => ({
          id: this.generateClusterId(),
          files: group,
          keywords: this.extractFileKeywords(group[0], keywords),
          type: 'semantic'
        }))
        .filter(cluster =>
          cluster.files.length >= this.config.clustering.minDomainSize &&
          cluster.files.length <= this.config.clustering.maxDomainSize
        );

      if (result.length === 0 && files.length >= this.config.clustering.minDomainSize) {
        // Minimal batching of size 2 to ensure at least some clusters
        const batches = [];
        const batchSize = Math.max(2, this.config.clustering.minDomainSize);
        for (let i = 0; i < files.length; i += batchSize) {
          const batch = files.slice(i, i + batchSize);
          if (batch.length >= this.config.clustering.minDomainSize && batch.length <= this.config.clustering.maxDomainSize) {
            batches.push({
              id: this.generateClusterId(),
              files: batch,
              keywords: this.extractFileKeywords(batch[0], keywords),
              type: 'semantic'
            });
          }
        }
        result = batches;
      }
    }

    return result;
  }

  /**
   * Perform structural clustering based on directory structure
   */
  performStructuralClustering(directories) {
    const clusters = [];

    // Group by top-level directories
    const topLevelDirs = directories.filter(dir => dir.depth === 0);

    topLevelDirs.forEach(topDir => {
      const relatedDirs = directories.filter(dir =>
        dir.path.startsWith(topDir.path + path.sep) || dir.path === topDir.path
      );

      if (relatedDirs.length > 0) {
        clusters.push({
          id: this.generateClusterId(),
          name: topDir.name,
          directories: relatedDirs,
          type: 'structural',
          rootDirectory: topDir
        });
      }
    });

    return clusters;
  }

  /**
   * Merge semantic and structural clusters
   */
  mergeClusters(semanticClusters, structuralClusters, dependencyGraph) {
    const mergedDomains = [];

    // Start with structural clusters as base
    structuralClusters.forEach(structCluster => {
      const domain = {
        id: structCluster.id,
        name: this.generateDomainName(structCluster),
        type: 'mixed',
        files: [],
        directories: structCluster.directories,
        dependencies: [],
        keywords: [],
        confidence: 0.7 // Base confidence for structural clustering
      };

      // Find semantic clusters that overlap with this structural cluster
      semanticClusters.forEach(semCluster => {
        const overlap = this.calculateFileOverlap(structCluster.directories, semCluster.files);

        if (overlap.percentage > 0.3) {
          // Merge semantic cluster into domain
          domain.files.push(...semCluster.files);
          domain.keywords.push(...semCluster.keywords);
          domain.confidence += overlap.percentage * 0.3;
        }
      });

      // Add dependency information
      domain.dependencies = this.extractDomainDependencies(domain.files, dependencyGraph);

      mergedDomains.push(domain);
    });

    // Add orphaned semantic clusters as separate domains
    semanticClusters.forEach(semCluster => {
      const isOrphaned = !mergedDomains.some(domain =>
        this.calculateFileOverlap(domain.directories, semCluster.files).percentage > 0.3
      );

      if (isOrphaned && semCluster.files.length >= this.config.clustering.minDomainSize) {
        mergedDomains.push({
          id: semCluster.id,
          name: this.generateDomainName(semCluster),
          type: 'semantic',
          files: semCluster.files,
          directories: [],
          dependencies: this.extractDomainDependencies(semCluster.files, dependencyGraph),
          keywords: semCluster.keywords,
          confidence: 0.5
        });
      }
    });

    return mergedDomains;
  }

  /**
   * Validate discovered domains
   */
  validateDomains(domains, structureAnalysis) {
    return domains.filter(domain => {
      // Size validation
      if (domain.files.length < this.config.clustering.minDomainSize) return false;
      if (domain.files.length > this.config.clustering.maxDomainSize) return false;

      // Coherence validation
      const coherenceScore = this.calculateDomainCoherence(domain);
      if (coherenceScore < 0.3) return false;

      // Completeness validation
      const completenessScore = this.calculateDomainCompleteness(domain, structureAnalysis);
      if (completenessScore < 0.05) return false;

      return true;
    });
  }

  /**
   * Create final domain definitions
   */
  createDomainDefinitions(validatedDomains, dependencyGraph) {
    return validatedDomains.map(domain => ({
      id: domain.id,
      name: domain.name,
      type: domain.type,
      files: domain.files.map(f => ({
        path: f.path,
        name: f.name,
        size: f.size,
        lines: f.lines,
        extension: f.extension
      })),
      directories: domain.directories.map(d => ({
        path: d.path,
        name: d.name,
        depth: d.depth
      })),
      dependencies: {
        internal: domain.dependencies.filter(dep => dep.type === 'internal'),
        external: domain.dependencies.filter(dep => dep.type === 'external'),
        crossDomain: domain.dependencies.filter(dep => dep.type === 'crossDomain')
      },
      keywords: domain.keywords.slice(0, 10), // Top 10 keywords
      metrics: {
        fileCount: domain.files.length,
        totalSize: domain.files.reduce((sum, f) => sum + f.size, 0),
        totalLines: domain.files.reduce((sum, f) => sum + f.lines, 0),
        averageFileSize: domain.files.reduce((sum, f) => sum + f.size, 0) / domain.files.length,
        coherenceScore: this.calculateDomainCoherence(domain),
        confidence: domain.confidence
      },
      created: Date.now()
    }));
  }

  /**
   * Helper methods
   */

  shouldExclude(path) {
    return this.config.domainIndicators.excludePatterns.some(pattern =>
      path.includes(pattern)
    );
  }

  extractFilePattern(file) {
    // Extract pattern based on naming convention
    const name = file.name.toLowerCase();

    if (name.includes('test') || name.includes('spec')) return 'test';
    if (name.includes('config') || name.includes('settings')) return 'config';
    if (name.includes('util') || name.includes('helper')) return 'utility';
    if (name.includes('component')) return 'component';
    if (name.includes('service')) return 'service';
    if (name.includes('model') || name.includes('entity')) return 'model';
    if (name.includes('controller')) return 'controller';

    return file.extension.substring(1); // Default to file extension
  }

  extractKeywords(files) {
    const counts = new Map();

    files.forEach(file => {
      const words = this.tokenizeContent(file.content || '');
      words.forEach(w => {
        const word = w.toLowerCase();
        if (!this.config.semantic.stopWords.has(word) && word.length > 2) {
          counts.set(word, (counts.get(word) || 0) + 1);
        }
      });
    });

    // Primary threshold
    const minFreq = this.config.semantic.keywordMinFrequency || 2;
    let entries = Array.from(counts.entries()).filter(([, f]) => f >= minFreq);

    // Fallback for small sets: relax threshold if empty
    if (entries.length === 0) {
      entries = Array.from(counts.entries());
      entries.sort((a, b) => b[1] - a[1]);
      entries = entries.slice(0, 10);
    }

    return new Map(entries);
  }

  extractFileKeywords(file, globalKeywords) {
    const words = this.tokenizeContent(file.content);
    const fileKeywords = [];

    words.forEach(word => {
      if (globalKeywords.has(word)) {
        fileKeywords.push({
          word,
          frequency: globalKeywords.get(word),
          fileFrequency: (file.content.match(new RegExp(word, 'gi')) || []).length
        });
      }
    });

    return fileKeywords
      .sort((a, b) => b.fileFrequency - a.fileFrequency)
      .slice(0, 5)
      .map(item => item.word);
  }

  tokenizeContent(content) {
    return content
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0);
  }

  calculateSemanticSimilarity(files, keywords) {
    const matrix = new Map();

    files.forEach((file1, i) => {
      files.forEach((file2, j) => {
        if (i <= j) {
          const similarity = this.calculateFileSimilarity(file1, file2, keywords);
          matrix.set(`${i}-${j}`, similarity);
        }
      });
    });

    return matrix;
  }

  calculateFileSimilarity(file1, file2, keywords) {
    const keywords1 = new Set(this.extractFileKeywords(file1, keywords));
    const keywords2 = new Set(this.extractFileKeywords(file2, keywords));

    const intersection = new Set([...keywords1].filter(x => keywords2.has(x)));
    const union = new Set([...keywords1, ...keywords2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  calculateClusterSimilarity(cluster1, cluster2, similarityMatrix) {
    let totalSimilarity = 0;
    let comparisons = 0;

    cluster1.files.forEach(file1 => {
      cluster2.files.forEach(file2 => {
        const i = cluster1.files.indexOf(file1);
        const j = cluster2.files.indexOf(file2);
        const key = i <= j ? `${i}-${j}` : `${j}-${i}`;

        if (similarityMatrix.has(key)) {
          totalSimilarity += similarityMatrix.get(key);
          comparisons++;
        }
      });
    });

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  mergeTwoClusters(cluster1, cluster2) {
    return {
      id: this.generateClusterId(),
      files: [...cluster1.files, ...cluster2.files],
      keywords: [...new Set([...cluster1.keywords, ...cluster2.keywords])],
      type: 'semantic'
    };
  }

  calculateFileOverlap(directories, files) {
    const dirPaths = new Set(directories.map(d => d.path));
    const overlappingFiles = files.filter(file =>
      dirPaths.has(path.dirname(file.path))
    );

    return {
      count: overlappingFiles.length,
      percentage: files.length > 0 ? overlappingFiles.length / files.length : 0
    };
  }

  extractDomainDependencies(files, dependencyGraph) {
    const dependencies = [];
    const filePaths = new Set(files.map(f => f.path));

    files.forEach(file => {
      const deps = dependencyGraph.get(file.path) || [];

      deps.forEach(dep => {
        if (dep.target) {
          const type = filePaths.has(dep.target) ? 'internal' : 'external';
          dependencies.push({
            ...dep,
            type
          });
        }
      });
    });

    return dependencies;
  }

  calculateDomainCoherence(domain) {
    // Simple coherence based on keyword overlap
    const allKeywords = domain.keywords;
    const uniqueKeywords = new Set(allKeywords);

    return uniqueKeywords.size > 0 ? allKeywords.length / uniqueKeywords.size : 0;
  }

  calculateDomainCompleteness(domain, structureAnalysis) {
    // Completeness based on directory coverage
    const totalFiles = structureAnalysis.files.length;
    const domainFiles = domain.files.length;

    return totalFiles > 0 ? domainFiles / totalFiles : 0;
  }

  generateDomainName(cluster) {
    if (cluster.name) return cluster.name;
    if (cluster.keywords && cluster.keywords.length > 0) {
      return cluster.keywords[0] + '_domain';
    }
    if (cluster.rootDirectory) {
      return cluster.rootDirectory.name + '_domain';
    }
    return 'domain_' + cluster.id.substring(0, 8);
  }

  generateClusterId() {
    return 'cluster_' + Math.random().toString(36).substring(2, 15);
  }

  getCacheKey(projectPath, options) {
    return `${projectPath}:${JSON.stringify(options)}`;
  }

  summarizeDependencyGraph(dependencyGraph) {
    const summary = {
      totalFiles: dependencyGraph.size,
      totalDependencies: 0,
      averageDependencies: 0
    };

    dependencyGraph.forEach(deps => {
      summary.totalDependencies += deps.length;
    });

    summary.averageDependencies = summary.totalFiles > 0 ?
      summary.totalDependencies / summary.totalFiles : 0;

    return summary;
  }

  /**
   * Get discovery statistics and diagnostics
   */
  getDiagnostics() {
    return {
      lastDiscovery: this.lastDiscovery ? {
        timestamp: this.lastDiscovery.metadata.timestamp,
        domainsFound: this.lastDiscovery.domains.length,
        averageDomainSize: this.lastDiscovery.statistics.averageDomainSize,
        discoveryTime: this.lastDiscovery.statistics.discoveryTimeMs
      } : null,
      cacheSize: this.discoveryCache.size,
      configuration: this.config
    };
  }
}

module.exports = DomainDiscovery;
