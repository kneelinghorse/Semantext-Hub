/**
 * ProtocolGraph - Main export
 *
 * Provides a unified interface for importing all graph components.
 */

import { ProtocolGraph, NodeKind, EdgeKind } from './protocol-graph.js';
import * as urnUtils from './urn-utils.js';
import { detectCycles, getCycleForNode } from './tarjan.js';
import * as traversal from './traversal.js';
import * as piiTracer from './pii-tracer.js';
import * as impactAnalyzer from './impact-analyzer.js';
import { LRUCache, GraphCache } from './cache.js';

export {
  ProtocolGraph,
  NodeKind,
  EdgeKind,
  urnUtils,
  detectCycles,
  getCycleForNode,
  traversal,
  piiTracer,
  impactAnalyzer,
  LRUCache,
  GraphCache
};

export default {
  ProtocolGraph,
  NodeKind,
  EdgeKind,
  urnUtils,
  detectCycles,
  getCycleForNode,
  traversal,
  piiTracer,
  impactAnalyzer,
  LRUCache,
  GraphCache
};
