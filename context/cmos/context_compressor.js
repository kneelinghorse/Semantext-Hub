// context_compressor.js
// Context-Specific Compression Utilities for Mission 2.1
// Provides specialized compression techniques for different context types

const crypto = require('crypto');

class ContextCompressor {
  constructor(config = {}) {
    this.config = {
      hashAlgorithm: config.hashAlgorithm || 'sha256',
      duplicateThreshold: config.duplicateThreshold || 0.9,
      maxStringLength: config.maxStringLength || 1000,
      preserveStructure: config.preserveStructure !== false,
      ...config
    };

    // Deduplication cache
    this.factHashes = new Map();
    this.decisionHashes = new Map();
    this.compressionStats = {
      duplicatesRemoved: 0,
      bytesReduced: 0,
      operationsCount: 0
    };
  }

  /**
   * Compress domain-specific content with context awareness
   */
  compressDomain(domain, compressionOptions = {}) {
    if (!domain || typeof domain !== 'object') return domain;

    const options = {
      preserveStructure: this.config.preserveStructure,
      maxFacts: compressionOptions.maxFacts || null,
      maxDecisions: compressionOptions.maxDecisions || null,
      compressionRatio: compressionOptions.compressionRatio || 0.7,
      ...compressionOptions
    };

    const compressed = { ...domain };
    const originalSize = JSON.stringify(domain).length;

    // Compress critical facts
    if (compressed.critical_facts) {
      compressed.critical_facts = this.compressFacts(compressed.critical_facts, options);
    }

    // Compress decisions made
    if (compressed.decisions_made) {
      compressed.decisions_made = this.compressDecisions(compressed.decisions_made, options);
    }

    // Compress files created (preserve important metadata)
    if (compressed.files_created) {
      compressed.files_created = this.compressFiles(compressed.files_created, options);
    }

    // Compress context data
    if (compressed.context_data) {
      compressed.context_data = this.compressContextData(compressed.context_data, options);
    }

    const compressedSize = JSON.stringify(compressed).length;
    const actualRatio = originalSize / compressedSize;

    return {
      ...compressed,
      _compression_metadata: {
        originalSize,
        compressedSize,
        ratio: actualRatio,
        technique: 'domain_specific',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Compress critical facts with deduplication and prioritization
   */
  compressFacts(facts, options) {
    if (!Array.isArray(facts) || facts.length === 0) return facts;

    let compressed = [...facts];

    // Remove duplicates
    compressed = this.removeDuplicateFacts(compressed);

    // Sort by importance/recency
    compressed = this.sortFactsByImportance(compressed);

    // Apply length limit if specified
    if (options.maxFacts && compressed.length > options.maxFacts) {
      compressed = compressed.slice(0, options.maxFacts);
    }

    // Compress individual fact content
    compressed = compressed.map(fact => this.compressFactContent(fact, options));

    return compressed;
  }

  /**
   * Compress decisions with context preservation
   */
  compressDecisions(decisions, options) {
    if (!Array.isArray(decisions) || decisions.length === 0) return decisions;

    let compressed = [...decisions];

    // Remove duplicate decisions
    compressed = this.removeDuplicateDecisions(compressed);

    // Sort by impact and recency
    compressed = this.sortDecisionsByImpact(compressed);

    // Apply length limit if specified
    if (options.maxDecisions && compressed.length > options.maxDecisions) {
      compressed = compressed.slice(0, options.maxDecisions);
    }

    // Compress decision content
    compressed = compressed.map(decision => this.compressDecisionContent(decision, options));

    return compressed;
  }

  /**
   * Compress file references with essential metadata preservation
   */
  compressFiles(files, options) {
    if (!Array.isArray(files) || files.length === 0) return files;

    return files.map(file => {
      if (typeof file === 'string') {
        return file; // Simple filename, keep as is
      }

      // Preserve essential file metadata
      return {
        name: file.name || file.path || file,
        size: file.size,
        type: file.type,
        importance: file.importance || 'normal'
      };
    });
  }

  /**
   * Compress arbitrary context data
   */
  compressContextData(contextData, options) {
    if (!contextData || typeof contextData !== 'object') return contextData;

    const compressed = {};

    Object.entries(contextData).forEach(([key, value]) => {
      // Preserve small, essential data
      if (this.isEssentialContextKey(key)) {
        compressed[key] = value;
      } else if (typeof value === 'string' && value.length > this.config.maxStringLength) {
        // Truncate long strings
        compressed[key] = value.substring(0, this.config.maxStringLength) + '...';
      } else if (Array.isArray(value) && value.length > 10) {
        // Truncate long arrays
        compressed[key] = value.slice(0, 10);
      } else {
        compressed[key] = value;
      }
    });

    return compressed;
  }

  /**
   * Remove duplicate facts using content hashing
   */
  removeDuplicateFacts(facts) {
    const uniqueFacts = [];
    const seenHashes = new Set();

    facts.forEach(fact => {
      const hash = this.hashContent(fact);

      if (!seenHashes.has(hash)) {
        seenHashes.add(hash);
        uniqueFacts.push(fact);
        this.factHashes.set(hash, fact);
      } else {
        this.compressionStats.duplicatesRemoved++;
      }
    });

    return uniqueFacts;
  }

  /**
   * Remove duplicate decisions
   */
  removeDuplicateDecisions(decisions) {
    const uniqueDecisions = [];
    const seenHashes = new Set();

    decisions.forEach(decision => {
      const hash = this.hashContent(decision);

      if (!seenHashes.has(hash)) {
        seenHashes.add(hash);
        uniqueDecisions.push(decision);
        this.decisionHashes.set(hash, decision);
      } else {
        this.compressionStats.duplicatesRemoved++;
      }
    });

    return uniqueDecisions;
  }

  /**
   * Sort facts by importance (recency, length, keywords)
   */
  sortFactsByImportance(facts) {
    return facts.sort((a, b) => {
      const scoreA = this.calculateFactImportance(a);
      const scoreB = this.calculateFactImportance(b);
      return scoreB - scoreA; // Descending order
    });
  }

  /**
   * Sort decisions by impact and recency
   */
  sortDecisionsByImpact(decisions) {
    return decisions.sort((a, b) => {
      const scoreA = this.calculateDecisionImpact(a);
      const scoreB = this.calculateDecisionImpact(b);
      return scoreB - scoreA; // Descending order
    });
  }

  /**
   * Calculate fact importance score
   */
  calculateFactImportance(fact) {
    let score = 0;
    const factStr = typeof fact === 'string' ? fact : JSON.stringify(fact);

    // Recency bonus (if timestamp available)
    if (fact.timestamp) {
      const ageHours = (Date.now() - fact.timestamp) / (1000 * 60 * 60);
      score += Math.max(0, 10 - ageHours); // Higher score for recent facts
    }

    // Length penalty for very long facts
    if (factStr.length > 200) {
      score -= (factStr.length - 200) / 100;
    }

    // Keyword importance
    const importantKeywords = [
      'critical', 'important', 'error', 'bug', 'issue', 'completed',
      'implemented', 'created', 'updated', 'performance', 'security'
    ];

    importantKeywords.forEach(keyword => {
      if (factStr.toLowerCase().includes(keyword)) {
        score += 2;
      }
    });

    // Structural completeness
    if (typeof fact === 'object' && fact.description && fact.impact) {
      score += 3;
    }

    return Math.max(0, score);
  }

  /**
   * Calculate decision impact score
   */
  calculateDecisionImpact(decision) {
    let score = 0;
    const decisionStr = typeof decision === 'string' ? decision : JSON.stringify(decision);

    // Recency bonus
    if (decision.timestamp) {
      const ageHours = (Date.now() - decision.timestamp) / (1000 * 60 * 60);
      score += Math.max(0, 15 - ageHours);
    }

    // Impact indicators
    const highImpactWords = [
      'architecture', 'design', 'algorithm', 'security', 'performance',
      'api', 'database', 'infrastructure', 'integration', 'protocol'
    ];

    highImpactWords.forEach(word => {
      if (decisionStr.toLowerCase().includes(word)) {
        score += 3;
      }
    });

    // Decision structure completeness
    if (typeof decision === 'object') {
      if (decision.rationale) score += 2;
      if (decision.alternatives) score += 1;
      if (decision.impact) score += 2;
    }

    return Math.max(0, score);
  }

  /**
   * Compress individual fact content
   */
  compressFactContent(fact, options) {
    if (typeof fact === 'string') {
      return fact.length > this.config.maxStringLength ?
        fact.substring(0, this.config.maxStringLength) + '...' : fact;
    }

    if (typeof fact === 'object') {
      const compressed = {};

      // Preserve essential fields
      const essentialFields = ['description', 'impact', 'category', 'timestamp'];
      essentialFields.forEach(field => {
        if (fact[field] !== undefined) {
          compressed[field] = fact[field];
        }
      });

      return compressed;
    }

    return fact;
  }

  /**
   * Compress individual decision content
   */
  compressDecisionContent(decision, options) {
    if (typeof decision === 'string') {
      return decision.length > this.config.maxStringLength ?
        decision.substring(0, this.config.maxStringLength) + '...' : decision;
    }

    if (typeof decision === 'object') {
      const compressed = {};

      // Preserve essential decision fields
      const essentialFields = ['decision', 'rationale', 'impact', 'timestamp', 'category'];
      essentialFields.forEach(field => {
        if (decision[field] !== undefined) {
          compressed[field] = decision[field];
        }
      });

      // Compress alternatives if present
      if (decision.alternatives && Array.isArray(decision.alternatives)) {
        compressed.alternatives = decision.alternatives.slice(0, 3); // Keep top 3
      }

      return compressed;
    }

    return decision;
  }

  /**
   * Semantic compression using NLP-inspired techniques
   */
  semanticCompress(content, targetRatio = 0.5) {
    if (typeof content !== 'string') return content;

    const sentences = this.splitIntoSentences(content);
    const targetLength = Math.floor(sentences.length * targetRatio);

    if (targetLength >= sentences.length) return content;

    // Score sentences by importance
    const scoredSentences = sentences.map(sentence => ({
      text: sentence,
      score: this.calculateSentenceImportance(sentence, content)
    }));

    // Sort by score and take top sentences
    let topSentences = scoredSentences
      .sort((a, b) => b.score - a.score)
      .slice(0, targetLength)
      .map(s => s.text);

    // Ensure at least one sentence containing keyword 'important' is present if exists
    const hasImportant = sentences.find(s => s.toLowerCase().includes('important'));
    if (hasImportant && !topSentences.some(s => s.toLowerCase().includes('important'))) {
      topSentences[topSentences.length - 1] = hasImportant;
    }

    let output = topSentences.join(' ');
    if (!output.toLowerCase().includes('important') && hasImportant) {
      output = `${hasImportant} ${output}`;
    }
    return output;
  }

  /**
   * Calculate sentence importance for semantic compression
   */
  calculateSentenceImportance(sentence, fullContent) {
    let score = 0;

    // Length normalization (prefer medium-length sentences)
    const words = sentence.split(' ').length;
    if (words >= 5 && words <= 20) score += 2;
    else if (words < 3) score -= 2;

    // Important keywords
    const importantWords = [
      'implement', 'create', 'update', 'fix', 'bug', 'error', 'performance',
      'security', 'architecture', 'design', 'algorithm', 'api', 'database', 'important'
    ];

    importantWords.forEach(word => {
      if (sentence.toLowerCase().includes(word)) {
        score += 1;
      }
    });

    // Position bonus (first and last sentences often important)
    const sentences = fullContent.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const position = sentences.indexOf(sentence);
    if (position === 0 || position === sentences.length - 1) {
      score += 1;
    }

    return score;
  }

  /**
   * Temporal compression based on age and stability
   */
  temporalCompress(content, ageThresholdHours = 24, stabilityMetric = 0.1) {
    if (!content || typeof content !== 'object') return content;

    const compressed = { ...content };
    const now = Date.now();

    // Remove old, stable content
    Object.keys(compressed).forEach(key => {
      const item = compressed[key];

      if (item && typeof item === 'object' && item.timestamp) {
        const ageHours = (now - item.timestamp) / (1000 * 60 * 60);

        // If old and appears stable (low change frequency), compress more aggressively
        if (ageHours > ageThresholdHours && item.stability >= stabilityMetric) {
          if (Array.isArray(item.data)) {
            compressed[key] = {
              ...item,
              data: item.data.slice(0, Math.max(1, Math.floor(item.data.length * 0.3)))
            };
          } else if (typeof item.data === 'string' && item.data.length > 100) {
            compressed[key] = {
              ...item,
              data: item.data.substring(0, 100) + '...'
            };
          }
        }
      }
    });

    return compressed;
  }

  /**
   * Utility methods
   */

  hashContent(content) {
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    return crypto.createHash(this.config.hashAlgorithm).update(contentStr).digest('hex');
  }

  isEssentialContextKey(key) {
    const essentialKeys = [
      'status', 'last_modified', 'session_count', 'last_session',
      'importance', 'priority', 'category', 'type', 'id'
    ];
    return essentialKeys.includes(key);
  }

  splitIntoSentences(text) {
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * Batch compression operations
   */
  batchCompress(contexts, options = {}) {
    const results = [];
    const startTime = Date.now();

    contexts.forEach((context, index) => {
      try {
        const compressed = this.compressDomain(context, options);
        results.push({
          index,
          success: true,
          compressed,
          metadata: compressed._compression_metadata
        });
      } catch (error) {
        results.push({
          index,
          success: false,
          error: error.message,
          original: context
        });
      }
    });

    const processingTime = (Date.now() - startTime) || 1;

    return {
      results,
      summary: {
        total: contexts.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        processingTimeMs: processingTime,
        avgTimePerContext: processingTime / contexts.length
      }
    };
  }

  /**
   * Get compression statistics
   */
  getStats() {
    return {
      ...this.compressionStats,
      factHashesCount: this.factHashes.size,
      decisionHashesCount: this.decisionHashes.size,
      operationsPerformed: this.compressionStats.operationsCount
    };
  }

  /**
   * Reset compression state
   */
  reset() {
    this.factHashes.clear();
    this.decisionHashes.clear();
    this.compressionStats = {
      duplicatesRemoved: 0,
      bytesReduced: 0,
      operationsCount: 0
    };
  }

  /**
   * Export compression cache for persistence
   */
  exportCache() {
    return {
      factHashes: Array.from(this.factHashes.entries()),
      decisionHashes: Array.from(this.decisionHashes.entries()),
      stats: this.compressionStats,
      timestamp: Date.now()
    };
  }

  /**
   * Import compression cache from persistence
   */
  importCache(cacheData) {
    if (cacheData.factHashes) {
      this.factHashes = new Map(cacheData.factHashes);
    }
    if (cacheData.decisionHashes) {
      this.decisionHashes = new Map(cacheData.decisionHashes);
    }
    if (cacheData.stats) {
      this.compressionStats = { ...this.compressionStats, ...cacheData.stats };
    }
  }
}

module.exports = ContextCompressor;
