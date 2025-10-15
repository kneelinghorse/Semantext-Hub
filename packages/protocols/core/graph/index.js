/**
 * ProtocolGraph - Main export
 *
 * Provides a unified interface for importing all graph components.
 */

const { ProtocolGraph, NodeKind, EdgeKind } = require('./protocol-graph');
const urnUtils = require('./urn-utils');
const { detectCycles, getCycleForNode } = require('./tarjan');
const traversal = require('./traversal');
const piiTracer = require('./pii-tracer');
const impactAnalyzer = require('./impact-analyzer');
const { LRUCache, GraphCache } = require('./cache');

module.exports = {
  // Main classes
  ProtocolGraph,
  NodeKind,
  EdgeKind,

  // Utilities
  urnUtils,

  // Algorithms
  detectCycles,
  getCycleForNode,
  traversal,
  piiTracer,
  impactAnalyzer,

  // Cache
  LRUCache,
  GraphCache
};
