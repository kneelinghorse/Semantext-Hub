#!/usr/bin/env node

/**
 * Protocol MCP Server
 * 
 * Wraps the protocol discovery tooling as an MCP server
 * for use with Claude/Cursor or other MCP clients.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createStdioServer } from './mcp/shim.js';
import { performance } from 'perf_hooks';
import { randomUUID } from 'crypto';

// Import ES modules
import { runTool, runWorkflow } from '../src/agents/runtime.js';
// NOTE: Avoid importing graph/validation modules at startup to keep ESM/CJS
// interop issues from blocking the server. Load them lazily inside handlers
// that need them.

// Import performance optimizations
import { PerformanceOptimizer } from '../services/mcp-server/performance-optimizations.js';
import { createMetricsEndpoint } from '../services/mcp-server/metrics-endpoint.js';
import { createStructuredLogger } from '../services/mcp-server/logger.js';

// Dynamic imports for CommonJS modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { OpenAPIImporter } = require('../importers/openapi/importer.js');
const { importAsyncAPI } = require('../importers/asyncapi/importer.js');
const { PostgresImporter } = require('../importers/postgres/importer.js');

// Implementations use real importers/validators/graph

const ROOT = process.env.PROTOCOL_ROOT || process.cwd();

// Initialize structured logging
const logger = createStructuredLogger({
  serviceContext: {
    service: 'protocol-mcp-server',
    environment: process.env.NODE_ENV || 'development',
    root: ROOT
  }
});

const lifecycleLogger = logger.child('lifecycle');
const shutdownLogger = lifecycleLogger.child('shutdown');
const performanceLogger = logger.child('performance');
const metricsLogger = logger.child('metrics');
const toolLogger = logger.child('tool');
const governanceLogger = logger.child('governance');

// Initialize performance optimizations
const performanceOptimizer = new PerformanceOptimizer({
  enableLogging: process.env.NODE_ENV !== 'production',
  logger: performanceLogger
});

const metricsEndpoint = createMetricsEndpoint({
  enableLogging: process.env.NODE_ENV !== 'production',
  logger: metricsLogger
});

const DEFAULT_METRICS_LOG_FILE = path.join(ROOT, 'var', 'log', 'mcp', 'performance-metrics.jsonl');
const metricsLogMode = (process.env.MCP_METRICS_LOG_MODE || 'file').trim().toLowerCase();
const metricsLogIntervalEnv = process.env.MCP_METRICS_LOG_INTERVAL_MS;
const parsedMetricsLogInterval = metricsLogIntervalEnv !== undefined
  ? Number.parseInt(metricsLogIntervalEnv, 10)
  : Number.NaN;
const metricsLogIntervalMs = Number.isFinite(parsedMetricsLogInterval) && parsedMetricsLogInterval >= 0
  ? parsedMetricsLogInterval
  : 300000;
const metricsLogFileSetting = process.env.MCP_METRICS_LOG_FILE;
const metricsLogFile = metricsLogFileSetting
  ? (path.isAbsolute(metricsLogFileSetting) ? metricsLogFileSetting : path.join(ROOT, metricsLogFileSetting))
  : DEFAULT_METRICS_LOG_FILE;

let stopMetricsSummaryWriter = null;
let shutdownInProgress = false;

if (metricsLogIntervalMs === 0 || metricsLogMode === 'off') {
  metricsLogger.debug('Periodic performance metrics logging disabled', {
    mode: metricsLogMode || 'file',
    intervalMs: metricsLogIntervalMs
  });
} else if (metricsLogMode === 'stdout') {
  stopMetricsSummaryWriter = startMetricsStdoutWriter({
    metricsEndpoint,
    metricsLogger,
    intervalMs: metricsLogIntervalMs
  });
} else if (metricsLogMode === 'file' || metricsLogMode === '') {
  stopMetricsSummaryWriter = startMetricsFileWriter({
    metricsEndpoint,
    metricsLogger,
    filePath: metricsLogFile,
    intervalMs: metricsLogIntervalMs
  });
} else {
  metricsLogger.warn('Unknown MCP_METRICS_LOG_MODE value, defaulting to file logging', {
    mode: metricsLogMode
  });
  stopMetricsSummaryWriter = startMetricsFileWriter({
    metricsEndpoint,
    metricsLogger,
    filePath: metricsLogFile,
    intervalMs: metricsLogIntervalMs
  });
}

// Path safety check
const safe = (p) => {
  const abs = path.resolve(ROOT, p);
  if (!abs.startsWith(path.resolve(ROOT))) {
    throw new Error(`Path outside ROOT: ${p}`);
  }
  return abs;
};

const SENSITIVE_QUERY_KEYS = new Set(['password', 'pass', 'pwd', 'secret', 'access_token', 'auth', 'key']);

function sanitizeConnectionString(connectionString) {
  if (typeof connectionString !== 'string') {
    return '';
  }

  const trimmed = connectionString.trim();
  if (trimmed === '') {
    return '';
  }

  try {
    const parsed = new URL(trimmed);
    parsed.username = parsed.username ? '***' : '';
    parsed.password = parsed.password ? '***' : '';

    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, '***');
      }
    }

    return parsed.toString();
  } catch {
    return trimmed.replace(/\/\/([^/@:]+)(?::[^@/?#]*)?@/, '//***@');
  }
}

function sanitizeSensitiveValue(value, original, sanitized) {
  if (typeof value !== 'string' || !original) {
    return value;
  }

  return value.split(original).join(sanitized);
}

function startMetricsFileWriter({ metricsEndpoint, metricsLogger, filePath, intervalMs }) {
  let writing = false;
  let pendingFlush = false;
  let stopped = false;

  const queueWrite = () => {
    if (stopped) {
      return;
    }
    if (writing) {
      pendingFlush = true;
      return;
    }
    writing = true;
    void (async () => {
      try {
        const summary = metricsEndpoint.getSummary();
        const entry = JSON.stringify({
          timestamp: new Date().toISOString(),
          summary
        });
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.appendFile(filePath, `${entry}\n`, 'utf8');
      } catch (error) {
        metricsLogger.error('Failed to write performance metrics summary to file', {
          error,
          filePath
        });
      } finally {
        writing = false;
        if (pendingFlush) {
          pendingFlush = false;
          queueWrite();
        }
      }
    })();
  };

  queueWrite();
  const timer = setInterval(queueWrite, intervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  metricsLogger.debug('Performance metrics file logging enabled', {
    filePath,
    intervalMs
  });

  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearInterval(timer);
  };
}

function startMetricsStdoutWriter({ metricsEndpoint, metricsLogger, intervalMs }) {
  const emitSummary = () => {
    const summary = metricsEndpoint.getSummary();
    metricsLogger.info('Performance summary', {
      uptimeSeconds: Math.round(summary.uptime),
      totalRequests: summary.requests.total,
      successRate: summary.requests.successRate,
      latency: summary.latency,
      memoryMB: summary.memory.heapUsedMB,
      compliance: summary.compliance
    });
  };

  emitSummary();
  const timer = setInterval(emitSummary, intervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  metricsLogger.debug('Performance metrics stdout logging enabled', {
    intervalMs
  });

  return () => clearInterval(timer);
}

// Performance wrapper for tool handlers
const withPerformanceTracking = (toolName, operation, handler) => {
  const toolLog = toolLogger.child(toolName);
  return async (args) => {
    const startTime = performance.now();
    let success = false;
    let cached = false;
    
    try {
      const result = await handler(args);
      success = true;
      return result;
    } catch (error) {
      success = false;
      toolLog.error('Handler failed', {
        operation,
        argKeys: args && typeof args === 'object' ? Object.keys(args) : [],
        error
      });
      throw error;
    } finally {
      const latency = performance.now() - startTime;
      metricsEndpoint.recordRequest(toolName, operation, latency, success, cached);
      if (success) {
        toolLog.debug('Handler completed', {
          operation,
          latency
        });
      }
    }
  };
};

// (Removed eager graph-based Mermaid builder; see docs_mermaid handler below.)

// Helper to resolve agent from on-disk catalog (if present)
async function resolveAgent(agentUrn) {
  try {
    // Use optimized URN resolver for better performance
    const result = await performanceOptimizer.urnResolver.resolveAgentUrn(agentUrn);
    return {
      urn: agentUrn,
      endpoints: result.metadata.endpoints || {},
      protocol: result.metadata.protocol || 'a2a',
      capabilities: result.capabilities || {}
    };
  } catch (e) {
    throw new Error(`Agent resolution failed: ${e.message}`);
  }
}

// Tool definitions
const tools = [
  {
    name: 'protocol_discover_api',
    description: 'Discover and import API contracts from OpenAPI specifications',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', format: 'uri', description: 'URL to OpenAPI specification' }
      },
      required: ['url']
    },
    handler: withPerformanceTracking('protocol_discover_api', 'discovery', async ({ url }) => {
      try {
        const importer = new OpenAPIImporter({ generateURNs: true, inferPatterns: true });
        const manifest = await importer.import(url);

        if (manifest?.metadata?.status === 'error') {
          return {
            success: false,
            error: manifest.metadata?.error?.message || 'Discovery failed',
            url,
            manifest
          };
        }

        if (manifest) {
          return {
            success: true,
            manifest,
            message: `Successfully discovered API from ${url}`
          };
        }

        return {
          success: false,
          error: 'Discovery failed - no manifest returned',
          url
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          url,
          details: error.stack
        };
      }
    })
  },
  
  {
    name: 'protocol_discover_local',
    description: 'Discover and import API contracts from local OpenAPI specification files',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to local OpenAPI specification file' }
      },
      required: ['file_path']
    },
    handler: withPerformanceTracking('protocol_discover_local', 'discovery', async ({ file_path }) => {
      try {
        const fullPath = safe(file_path);
        const importer = new OpenAPIImporter({ generateURNs: true, inferPatterns: true });
        const manifest = await importer.import(fullPath);

        if (manifest?.metadata?.status === 'error') {
          return {
            success: false,
            error: manifest.metadata?.error?.message || 'Discovery failed',
            file_path,
            manifest
          };
        }

        if (manifest) {
          return {
            success: true,
            manifest,
            message: `Successfully discovered API from local file ${file_path}`
          };
        }

        return {
          success: false,
          error: 'Discovery failed - no manifest returned',
          file_path
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          file_path,
          details: error.stack
        };
      }
    })
  },

  {
    name: 'protocol_discover_asyncapi',
    description: 'Discover and import Event Protocol manifests from AsyncAPI specifications',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to local AsyncAPI specification file (JSON or YAML)'
        },
        url: {
          type: 'string',
          format: 'uri',
          description: 'HTTP(S) URL to AsyncAPI specification'
        }
      },
      anyOf: [
        { required: ['file_path'] },
        { required: ['url'] }
      ],
      additionalProperties: false
    },
    handler: withPerformanceTracking('protocol_discover_asyncapi', 'discovery', async ({ file_path, url }) => {
      const targetUrl = typeof url === 'string' ? url.trim() : '';
      const targetPath = typeof file_path === 'string' ? file_path.trim() : '';

      if (!targetUrl && !targetPath) {
        return {
          success: false,
          error: 'Either url or file_path is required'
        };
      }

      if (targetUrl && targetPath) {
        return {
          success: false,
          error: 'Provide only one of url or file_path'
        };
      }

      const location = targetUrl ? { url: targetUrl } : { file_path: targetPath };
      const locationLabel = targetUrl || targetPath;
      let sourceToImport;
      let cleanupPath = null;

      if (targetUrl) {
        const fetchFn = globalThis.fetch;
        if (typeof fetchFn !== 'function') {
          return {
            success: false,
            error: 'Fetch API not available to retrieve AsyncAPI specification',
            ...location
          };
        }
        try {
          const response = await fetchFn(targetUrl);
          if (!response.ok) {
            return {
              success: false,
              error: `Failed to fetch AsyncAPI specification (status ${response.status})`,
              status: response.status,
              ...location
            };
          }
          const body = await response.text();
          const remoteDir = path.join(ROOT, '.tmp', 'asyncapi-cache');
          await fs.mkdir(remoteDir, { recursive: true });

          let extension = '.yaml';
          try {
            const pathname = new URL(targetUrl).pathname.toLowerCase();
            if (pathname.endsWith('.json')) {
              extension = '.json';
            } else if (pathname.endsWith('.yml') || pathname.endsWith('.yaml')) {
              extension = '.yaml';
            }
          } catch {
            // Ignore URL parsing issues; fall back to content-type detection
          }
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('json')) {
            extension = '.json';
          }

          const tempPath = path.join(remoteDir, `${randomUUID()}${extension}`);
          await fs.writeFile(tempPath, body, 'utf8');
          sourceToImport = tempPath;
          cleanupPath = tempPath;
        } catch (error) {
          return {
            success: false,
            error: `Failed to fetch AsyncAPI specification: ${error.message}`,
            ...location,
            details: error.stack
          };
        }
      } else {
        sourceToImport = safe(targetPath);
      }

      try {
        const { manifests, metadata } = await importAsyncAPI(sourceToImport, {
          timeout: 30000,
          logger: toolLogger.child('protocol_discover_asyncapi')
        });

        if (!manifests || manifests.length === 0) {
          return {
            success: false,
            error: 'Discovery failed - no event manifests returned',
            metadata,
            ...location
          };
        }

        const manifest = { ...manifests[0] };
        manifest.metadata = {
          ...(manifest.metadata || {}),
          channel_count: metadata?.channel_count,
          message_count: metadata?.message_count,
          parse_time_ms: metadata?.parse_time_ms
        };

        if (manifest.metadata?.status === 'error') {
          return {
            success: false,
            error: manifest.metadata?.error?.message || 'Discovery failed',
            manifest,
            metadata,
            ...location
          };
        }

        return {
          success: true,
          manifest,
          metadata,
          message: `Successfully discovered AsyncAPI from ${locationLabel}`,
          ...location
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          ...location,
          details: error.stack
        };
      } finally {
        if (cleanupPath) {
          await fs.unlink(cleanupPath).catch(() => {});
        }
      }
    })
  },

  {
    name: 'protocol_discover_data',
    description: 'Discover and import Data Protocol manifests from PostgreSQL schemas',
    inputSchema: {
      type: 'object',
      properties: {
        connection_string: {
          type: 'string',
          description: 'PostgreSQL connection string (postgresql://user:pass@host:port/db)'
        },
        target_schema: {
          type: 'string',
          description: 'Optional schema name to restrict discovery'
        }
      },
      required: ['connection_string'],
      additionalProperties: false
    },
    handler: withPerformanceTracking('protocol_discover_data', 'discovery', async ({ connection_string, target_schema }) => {
      const rawConnection = typeof connection_string === 'string' ? connection_string.trim() : '';
      const rawSchema = typeof target_schema === 'string' ? target_schema.trim() : '';

      if (!rawConnection) {
        return {
          success: false,
          error: 'connection_string is required'
        };
      }

      const sanitizedConnection = sanitizeConnectionString(rawConnection);
      const schemaContext = rawSchema ? { target_schema: rawSchema } : {};

      try {
        const importer = new PostgresImporter({
          readOnly: true,
          sampleData: true,
          includePerformance: true,
          generateURNs: true
        });

        const manifest = await importer.import(rawConnection, rawSchema || undefined);

        if (!manifest) {
          return {
            success: false,
            error: 'Discovery failed - no manifest returned',
            connection: sanitizedConnection,
            ...schemaContext
          };
        }

        if (manifest?.metadata?.status === 'error') {
          return {
            success: false,
            error: manifest.metadata?.error?.message || 'Discovery failed',
            connection: sanitizedConnection,
            manifest,
            ...schemaContext
          };
        }

        return {
          success: true,
          manifest,
          connection: sanitizedConnection,
          message: rawSchema
            ? `Successfully discovered schema '${rawSchema}' from PostgreSQL connection`
            : 'Successfully discovered PostgreSQL database schema',
          ...schemaContext
        };
      } catch (error) {
        const sanitizedMessage = sanitizeSensitiveValue(
          error?.message || 'PostgreSQL discovery failed',
          rawConnection,
          sanitizedConnection
        );
        const sanitizedDetails = sanitizeSensitiveValue(
          error?.stack,
          rawConnection,
          sanitizedConnection
        );

        return {
          success: false,
          error: sanitizedMessage,
          connection: sanitizedConnection,
          ...schemaContext,
          ...(sanitizedDetails ? { details: sanitizedDetails } : {})
        };
      }
    })
  },
  
  {
    name: 'protocol_list_test_files',
    description: 'List available OpenAPI test files in the seeds directory',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    handler: async () => {
      try {
        const seedsDir = path.join(ROOT, 'seeds', 'openapi');
        const entries = await fs.readdir(seedsDir, { withFileTypes: true });
        
        const testFiles = [];
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const specPath = path.join(seedsDir, entry.name, 'spec.json');
            try {
              await fs.access(specPath);
              testFiles.push({
                name: entry.name,
                path: specPath,
                relative_path: `seeds/openapi/${entry.name}/spec.json`
              });
            } catch (error) {
              // Skip if spec.json doesn't exist
            }
          }
        }
        
        return {
          success: true,
          test_files: testFiles,
          message: `Found ${testFiles.length} test OpenAPI specifications`
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          details: error.stack
        };
      }
    }
  },
  
  {
    name: 'protocol_review',
    description: 'Review a draft manifest and perform validation checks',
    inputSchema: {
      type: 'object',
      properties: {
        manifest_path: { type: 'string' }
      },
      required: ['manifest_path']
    },
    handler: async ({ manifest_path }) => {
      try {
        const fullPath = safe(manifest_path);
        const raw = await fs.readFile(fullPath, 'utf8');
        const manifest = JSON.parse(raw);

        // Lazy-load validation and graph only when requested
        const graphModule = await import('../workflow/graph-builder.js');
        const { loadManifestsFromDirectory, buildGraph } = graphModule.default ?? graphModule;
        const validatorModule = await import('../../protocols/validation/cross-validator.js');
        const { CrossValidator } = validatorModule.default ?? validatorModule;

        const dir = path.dirname(fullPath);
        const entries = await loadManifestsFromDirectory(dir);
        const valid = entries.filter(e => e.manifest);
        const { graph } = buildGraph(valid);

        const validator = new CrossValidator(graph);
        const result = validator.validate(manifest);
        return {
          success: true,
          valid: result.valid,
          totalIssues: result.totalIssues,
          issues: result.issues,
          manifest_path: fullPath
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          manifest_path
        };
      }
    }
  },
  
  {
    name: 'protocol_approve',
    description: 'Approve a draft manifest and transition it to approved status',
    inputSchema: {
      type: 'object',
      properties: {
        draft_path: { type: 'string' },
        final_path: { type: 'string' },
        accept: { type: 'array', items: { type: 'string' } },
        reject: { type: 'array', items: { type: 'string' } },
        approved_by: { type: 'string' },
        allowWrite: { type: 'boolean' }
      },
      required: ['draft_path', 'final_path']
    },
    handler: async (args) => {
      if (!args.allowWrite) {
        throw new Error('allowWrite required for approve operation');
      }
      try {
        const draftPath = safe(args.draft_path);
        const approvedPath = safe(args.final_path);
        const raw = await fs.readFile(draftPath, 'utf8');
        const manifest = JSON.parse(raw);

        manifest.metadata = manifest.metadata || {};
        manifest.metadata.status = 'approved';
        manifest.metadata.approved_at = new Date().toISOString();
        if (args.approved_by) manifest.metadata.approved_by = args.approved_by;

        await fs.mkdir(path.dirname(approvedPath), { recursive: true });
        await fs.writeFile(approvedPath, JSON.stringify(manifest, null, 2));

        return {
          success: true,
          draftPath,
          approvedPath,
          approvedBy: args.approved_by || 'mcp',
          message: 'Approval completed'
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          draftPath: args.draft_path
        };
      }
    }
  },
  
  {
    name: 'protocol_report_governance',
    description: 'Generate governance documentation from protocol manifests',
    inputSchema: {
      type: 'object',
      properties: {
        manifest_glob: { type: 'string' },
        out_path: { type: 'string' },
        allowWrite: { type: 'boolean' }
      },
      required: ['manifest_glob', 'out_path']
    },
    handler: async ({ manifest_glob, out_path, allowWrite }) => {
      if (!allowWrite) {
        throw new Error('allowWrite required for governance report');
      }
      try {
        const { governanceCommand: runGovernance } = await import('../cli/commands/governance.js');
        const result = await runGovernance({
          output: path.join(ROOT, out_path),
          manifests: path.join(ROOT, manifest_glob),
          update: false,
          sections: ['all'],
          diagrams: true,
          pii: true,
          metrics: true,
          logger: governanceLogger
        });
        return {
          success: true,
          output: result?.path || path.join(ROOT, out_path)
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }
  },
  
  // Agent fork surfaces
  {
    name: 'agent_resolve',
    description: 'Resolve agent metadata by URN',
    inputSchema: {
      type: 'object',
      properties: {
        agent_urn: { type: 'string' }
      },
      required: ['agent_urn']
    },
    handler: withPerformanceTracking('agent_resolve', 'discovery', async ({ agent_urn }) => {
      return resolveAgent(agent_urn);
    })
  },
  
  {
    name: 'agent_run',
    description: 'UNSUPPORTED (501) – agent execution surfaces are disabled in Sprint 21 builds.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_urn: { type: 'string' },
        tool: { type: 'string' },
        args: { type: 'object' }
      },
      required: ['agent_urn', 'tool']
    },
    handler: withPerformanceTracking('agent_run', 'mcp', async ({ agent_urn, tool, args }) => {
      return runTool({ agentUrn: agent_urn, tool, args: args || {}, root: ROOT });
    })
  },
  
  {
    name: 'workflow_run',
    description: 'UNSUPPORTED (501) – workflow execution is disabled in Sprint 21 builds.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_path: { type: 'string' },
        inputs: { type: 'object' }
      },
      required: ['workflow_path']
    },
    handler: withPerformanceTracking('workflow_run', 'mcp', async ({ workflow_path, inputs }) => {
      return runWorkflow({
        workflowPath: safe(workflow_path),
        inputs: inputs || {},
        originalWorkflowPath: workflow_path,
        root: ROOT
      });
    })
  },
  
  {
    name: 'docs_mermaid',
    description: 'Generate Mermaid diagram from protocol manifests',
    inputSchema: {
      type: 'object',
      properties: {
        manifest_dir: { type: 'string' },
        focus_urn: { type: 'string' }
      },
      required: ['manifest_dir']
    },
    handler: async ({ manifest_dir, focus_urn }) => {
      try {
        // Lightweight, dependency-free mermaid generator for tests/CI
        const simple = {
          nodes: new Map(),
          edges: []
        };
        const manifestPath = safe(manifest_dir);
        
        // Load manifests into graph (recursive, pick up approved/*/manifest.json etc.)
        async function walk(dir) {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const ent of entries) {
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) {
              // Try common name first
              const mf = path.join(full, 'manifest.json');
              try {
                const raw = await fs.readFile(mf, 'utf8');
                const manifest = JSON.parse(raw);
                if (manifest.urn) {
                  simple.nodes.set(manifest.urn, { id: manifest.urn, data: manifest });
                }
              } catch {}
              // Continue recursion to find any .json manifests
              await walk(full);
            } else if (ent.isFile() && ent.name.endsWith('.json')) {
              try {
                const raw = await fs.readFile(full, 'utf8');
                const manifest = JSON.parse(raw);
                if (manifest.urn) {
                  simple.nodes.set(manifest.urn, { id: manifest.urn, data: manifest });
                }
              } catch {}
            }
          }
        }

        await walk(manifestPath);
        
        // Generate Mermaid diagram
        const nodes = Array.from(simple.nodes.values());
        const edges = simple.edges;
        
        let mermaid = 'graph TD\n';
        
        // Add nodes
        nodes.forEach(node => {
          const label = node.data?.name || node.id;
          const style = focus_urn === node.id ? ':::highlighted' : '';
          mermaid += `  ${node.id}["${label}"]${style}\n`;
        });
        
        // Add edges
        // (none in lightweight mode)
        
        // Add style for highlighted node
        if (focus_urn) {
          mermaid += '\nclassDef highlighted fill:#ff9,stroke:#333,stroke-width:4px;\n';
        }
        
        return { 
          success: true,
          diagram: mermaid, 
          nodeCount: nodes.length, 
          edgeCount: edges.length,
          manifest_dir: manifestPath
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          manifest_dir: safe(manifest_dir)
        };
      }
    }
  }
];

// Resource definitions
const resources = [
  {
    uriTemplate: 'file://{relpath}',
    name: 'File Reader',
    description: 'Read any file within the protocol root directory',
    mimeType: 'text/plain',
    read: async ({ relpath }) => {
      const content = await fs.readFile(safe(relpath), 'utf8');
      return { content };
    }
  },
  
  {
    uriTemplate: 'catalog://index',
    name: 'Catalog Index',
    description: 'Access the protocol artifact catalog index',
    mimeType: 'application/json',
    read: async () => {
      const catalogPath = path.join(ROOT, 'artifacts/index.json');
      try {
        const content = await fs.readFile(catalogPath, 'utf8');
        return { content };
      } catch (error) {
        return { content: JSON.stringify({ error: 'Catalog not found' }) };
      }
    }
  },
  
  {
    uriTemplate: 'docs://governance',
    name: 'Governance Documentation',
    description: 'Read the generated governance documentation',
    mimeType: 'text/markdown',
    read: async () => {
      const govPath = path.join(ROOT, 'artifacts/GOVERNANCE.md');
      try {
        const content = await fs.readFile(govPath, 'utf8');
        return { content };
      } catch (error) {
        return { content: '# Governance\n\nNo governance report generated yet.' };
      }
    }
  },
  
  {
    uriTemplate: 'metrics://performance',
    name: 'Performance Metrics',
    description: 'Access server performance metrics and compliance status',
    mimeType: 'application/json',
    read: async () => {
      try {
        const metrics = metricsEndpoint.getMetrics();
        return { content: JSON.stringify(metrics, null, 2) };
      } catch (error) {
        return { content: JSON.stringify({ error: 'Failed to retrieve metrics' }) };
      }
    }
  }
];

// Create and start the MCP server
const server = createStdioServer({
  name: 'system-protocols-mcp',
  tools,
  resources,
  logger
});

// Cleanup utilities
function cleanup() {
  let encounteredError = null;

  if (stopMetricsSummaryWriter) {
    try {
      stopMetricsSummaryWriter();
      shutdownLogger.debug('Stopped metrics summary writer');
    } catch (error) {
      shutdownLogger.error('Failed to stop metrics summary writer', { error });
      encounteredError ??= error;
    } finally {
      stopMetricsSummaryWriter = null;
    }
  }

  try {
    performanceOptimizer.destroy();
    shutdownLogger.debug('Performance optimizer destroyed');
  } catch (error) {
    shutdownLogger.error('Failed to destroy performance optimizer', { error });
    encounteredError ??= error;
  }

  try {
    metricsEndpoint.destroy();
    shutdownLogger.debug('Metrics endpoint destroyed');
  } catch (error) {
    shutdownLogger.error('Failed to destroy metrics endpoint', { error });
    encounteredError ??= error;
  }

  if (encounteredError) {
    throw encounteredError;
  }
}

function requestShutdown({ signal, reason, exitCode = 0 } = {}) {
  const context = {};
  if (signal) {
    context.signal = signal;
  }
  if (reason) {
    context.reason = reason;
  }

  if (shutdownInProgress) {
    shutdownLogger.debug('Shutdown already in progress', context);
    return;
  }

  shutdownInProgress = true;

  const startMessage = signal ? 'Shutdown signal received' : 'Shutdown requested';
  shutdownLogger.info(startMessage, context);

  let finalExitCode = exitCode;

  try {
    cleanup();
    shutdownLogger.info('Shutdown cleanup completed', context);
  } catch (error) {
    shutdownLogger.error('Shutdown cleanup failed', { ...context, error });
    if (finalExitCode === 0) {
      finalExitCode = 1;
    }
  }

  shutdownLogger.info('Process exiting', { ...context, exitCode: finalExitCode });
  process.exit(finalExitCode);
}

// Add error handling
process.on('uncaughtException', (error) => {
  lifecycleLogger.fatal('Uncaught exception', { error });
  requestShutdown({ reason: 'uncaughtException', exitCode: 1 });
});

process.on('unhandledRejection', (reason, promise) => {
  lifecycleLogger.fatal('Unhandled rejection', {
    reason,
    promiseType: promise?.constructor?.name
  });
  requestShutdown({ reason: 'unhandledRejection', exitCode: 1 });
});

// Graceful shutdown
process.once('SIGINT', () => {
  requestShutdown({ signal: 'SIGINT', exitCode: 0 });
});

process.once('SIGTERM', () => {
  requestShutdown({ signal: 'SIGTERM', exitCode: 0 });
});

// Log performance metrics on startup
lifecycleLogger.info('MCP Server starting with performance optimizations enabled', {
  targets: {
    discoveryP95: '1s',
    mcpP95: '3s',
    heap: '100MB'
  }
});

// Start server
server.listen();
