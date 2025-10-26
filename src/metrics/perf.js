import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_LOG_MATCHERS = {
  nameIncludes: ['performance', 'metrics'],
  extensions: ['.jsonl'],
};

const DEFAULT_MAX_LOG_AGE_MINUTES = 60;
const MS_PER_MINUTE = 60 * 1000;
const DEFAULT_MAX_LOG_AGE_MS = DEFAULT_MAX_LOG_AGE_MINUTES * MS_PER_MINUTE;

/**
 * Shared performance summarization utilities.
 * Consumed by both catalog CLI (cli/commands/perf-status.js) and WSAP CLI (app/cli/perf-status.mjs).
 */

export function percentile(values = [], p = 95) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export class PerformanceCollector {
  constructor() {
    this.metrics = {
      discovery: {
        requests: [],
        cacheHits: 0,
        cacheMisses: 0,
        errors: 0,
      },
      mcp: {
        requests: [],
        toolExecutions: 0,
        errors: 0,
      },
      system: {
        memoryUsage: 0,
        uptime: 0,
      },
    };
    this._sourceLogFiles = new Set();
  }

  recordDiscovery(startTime, endTime, cached = false, error = false) {
    const duration = endTime - startTime;
    this.metrics.discovery.requests.push(duration);
    if (cached) this.metrics.discovery.cacheHits += 1;
    else this.metrics.discovery.cacheMisses += 1;
    if (error) this.metrics.discovery.errors += 1;
  }

  recordMCP(startTime, endTime, toolExecuted = false, error = false) {
    const duration = endTime - startTime;
    this.metrics.mcp.requests.push(duration);
    if (toolExecuted) this.metrics.mcp.toolExecutions += 1;
    if (error) this.metrics.mcp.errors += 1;
  }

  isEmpty() {
    return (
      this.metrics.discovery.requests.length === 0 &&
      this.metrics.mcp.requests.length === 0
    );
  }

  trackSource(filePath) {
    if (!filePath) return;
    this._sourceLogFiles.add(filePath);
  }

  getSourceLogs() {
    return Array.from(this._sourceLogFiles).sort();
  }

  getSummary() {
    const discoveryP95 = percentile(this.metrics.discovery.requests, 95);
    const mcpP95 = percentile(this.metrics.mcp.requests, 95);
    const discoveryP50 = percentile(this.metrics.discovery.requests, 50);
    const mcpP50 = percentile(this.metrics.mcp.requests, 50);
    const discoveryAvg =
      this.metrics.discovery.requests.length > 0
        ? this.metrics.discovery.requests.reduce((a, b) => a + b, 0) /
          this.metrics.discovery.requests.length
        : 0;
    const mcpAvg =
      this.metrics.mcp.requests.length > 0
        ? this.metrics.mcp.requests.reduce((a, b) => a + b, 0) /
          this.metrics.mcp.requests.length
        : 0;

    return {
      discovery: {
        p50: discoveryP50,
        p95: discoveryP95,
        avg: discoveryAvg,
        total: this.metrics.discovery.requests.length,
        cacheHitRate:
          this.metrics.discovery.cacheHits /
          Math.max(
            1,
            this.metrics.discovery.cacheHits + this.metrics.discovery.cacheMisses,
          ),
        errors: this.metrics.discovery.errors,
      },
      mcp: {
        p50: mcpP50,
        p95: mcpP95,
        avg: mcpAvg,
        total: this.metrics.mcp.requests.length,
        toolExecutions: this.metrics.mcp.toolExecutions,
        errors: this.metrics.mcp.errors,
      },
      system: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
      },
    };
  }
}

export async function findPerformanceLogs(
  rootDir,
  { nameIncludes = DEFAULT_LOG_MATCHERS.nameIncludes, extensions = DEFAULT_LOG_MATCHERS.extensions } = {},
) {
  const results = [];
  let dirents = [];
  try {
    dirents = await readdir(rootDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const dirent of dirents) {
    const fullPath = path.join(rootDir, dirent.name);
    if (dirent.isDirectory()) {
      const nested = await findPerformanceLogs(fullPath, { nameIncludes, extensions });
      results.push(...nested);
      continue;
    }

    if (!dirent.isFile()) continue;
    const lowerName = dirent.name.toLowerCase();
    const matchesName = nameIncludes.some((part) => lowerName.includes(part));
    const matchesExtension = extensions.some((ext) => lowerName.endsWith(ext));
    if (matchesName || matchesExtension) {
      results.push(fullPath);
    }
  }

  return results;
}

export function parsePerfLogEntry(logEntry, collector) {
  if (!logEntry || typeof logEntry !== 'object') return;
  const durationCandidates = [
    logEntry.duration,
    logEntry.context?.duration,
    logEntry.ms,
    logEntry.tookMs,
    logEntry.took_ms,
    logEntry.latency,
    logEntry.responseTime,
    logEntry.elapsed,
    logEntry.elapsedMs,
    logEntry.elapsed_ms,
  ];

  let duration = null;
  for (const candidate of durationCandidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      duration = candidate;
      break;
    }
    if (typeof candidate === 'string') {
      const parsed = Number.parseFloat(candidate);
      if (Number.isFinite(parsed)) {
        duration = parsed;
        break;
      }
    }
  }

  if (duration == null || !Number.isFinite(duration) || duration < 0) {
    return;
  }

  const normalized = (value) =>
    typeof value === 'string' ? value.toLowerCase() : '';

  const message = normalized(logEntry.message);
  const label = normalized(logEntry.step);
  const tool = normalized(logEntry.tool);
  const category = normalized(logEntry.category);
  const kind = normalized(logEntry.kind);
  const service = normalized(logEntry.service);
  const operation = normalized(logEntry.operation);
  const route = normalized(logEntry.route);
  const path = normalized(logEntry.path);
  const event = normalized(logEntry.event);
  const type = normalized(logEntry.type);
  const target = normalized(logEntry.target);
  const stage = normalized(logEntry.stage);
  const component = normalized(logEntry.component);

  const textFields = [
    message,
    label,
    tool,
    category,
    kind,
    service,
    operation,
    route,
    path,
    event,
    type,
    target,
    stage,
    component,
  ];

  const discoveryKeywords = [
    'discovery',
    'catalog',
    'registry',
    'resolve',
    'urn',
    'wsap',
    'ingest',
    'import',
    'openapi',
    'bench:discovery',
  ];

  const mcpKeywords = [
    'mcp',
    'tool',
    'a2a',
    'release:canary',
    'playbook',
    'workflow',
    'agent',
    'bench:mcp',
    'tool_exec',
  ];

  const includesKeyword = (keywords) =>
    textFields.some(
      (field) => field && keywords.some((keyword) => field.includes(keyword)),
    );

  const isDiscovery = includesKeyword(discoveryKeywords);
  const isMcp = includesKeyword(mcpKeywords);

  if (!isDiscovery && !isMcp) {
    return;
  }

  const endTime = Date.now();
  const startTime = endTime - duration;

  const cached =
    textFields.some((field) => field.includes('cache') && field.includes('hit')) &&
    !textFields.some((field) => field.includes('cache') && field.includes('miss'));

  const errorCandidates = [
    normalized(logEntry.err),
    normalized(logEntry.error),
    normalized(logEntry.errorMessage),
    normalized(logEntry.reason),
  ];
  const errored =
    logEntry.ok === false ||
    (typeof logEntry.status === 'number' && logEntry.status >= 400) ||
    textFields.some(
      (field) =>
        field.includes('error') ||
        field.includes('failed') ||
        field.includes('timeout') ||
        field.includes('circuit_open'),
    ) ||
    errorCandidates.some(
      (field) =>
        field &&
        (field.includes('error') ||
          field.includes('failed') ||
          field.includes('timeout') ||
          field.includes('circuit')),
    );

  if (isDiscovery) {
    collector.recordDiscovery(startTime, endTime, cached, errored);
  }

  if (isMcp) {
    const toolExecuted =
      textFields.some((field) => field.includes('tool')) ||
      Boolean(logEntry.toolExecuted);
    collector.recordMCP(startTime, endTime, toolExecuted, errored);
  }
}

// REMOVED: seedMockPerfData()
// Performance data must come from real execution logs.
// If you see "missing perf data" errors, ensure your tests/workbench runs
// generate JSONL telemetry under artifacts/perf/

export async function collectWorkspacePerfMetrics({
  workspace,
  artifactsDir = 'artifacts',
  verbose = false,
  logMatchers = DEFAULT_LOG_MATCHERS,
  onWarning,
  maxLogAgeMs = DEFAULT_MAX_LOG_AGE_MS,
} = {}) {
  const collector = new PerformanceCollector();
  if (!workspace) {
    const error = new Error(
      'Missing workspace parameter. Cannot collect performance metrics without a workspace path.'
    );
    if (typeof onWarning === 'function') {
      onWarning(error.message);
    }
    throw error;
  }

  const artifactsRoot = path.resolve(workspace, artifactsDir);
  try {
    await access(artifactsRoot);
  } catch (error) {
    const message = `Artifacts directory not found: ${artifactsRoot}. Ensure tests/workbench runs generate telemetry logs.`;
    if (typeof onWarning === 'function') {
      onWarning(message);
    }
    throw new Error(message);
  }

  const logFiles = await findPerformanceLogs(artifactsRoot, logMatchers);
  if (logFiles.length === 0) {
    const message = `No performance logs found in ${artifactsRoot}. Expected files matching ${JSON.stringify(logMatchers)}.`;
    if (typeof onWarning === 'function') {
      onWarning(message);
    }
    throw new Error(message);
  }

  const now = Date.now();
  const staleLogs = [];

  for (const logFile of logFiles) {
    let fileStat;
    try {
      fileStat = await stat(logFile);
    } catch {
      continue;
    }

    const ageMs = Math.max(0, now - fileStat.mtimeMs);
    if (
      Number.isFinite(maxLogAgeMs) &&
      maxLogAgeMs > 0 &&
      ageMs > maxLogAgeMs
    ) {
      staleLogs.push({
        file: logFile,
        ageMinutes: Math.floor(ageMs / MS_PER_MINUTE),
      });
      if (verbose && typeof onWarning === 'function') {
        onWarning(
          `Skipping stale performance log ${logFile} (${Math.floor(
            ageMs / MS_PER_MINUTE,
          )} minutes old)`,
        );
      }
      continue;
    }

    const discoveryBefore = collector.metrics.discovery.requests.length;
    const mcpBefore = collector.metrics.mcp.requests.length;
    try {
      const content = await readFile(logFile, 'utf8');
      const lines = content.split('\n').filter((line) => line.trim().length > 0);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          parsePerfLogEntry(entry, collector);
        } catch {
          // Ignore malformed lines
        }
      }
    } catch (error) {
      if (verbose && typeof onWarning === 'function') {
        onWarning(`Failed to load performance log ${logFile}: ${error.message}`);
      }
    }

    const discoveryAfter = collector.metrics.discovery.requests.length;
    const mcpAfter = collector.metrics.mcp.requests.length;
    if (discoveryAfter > discoveryBefore || mcpAfter > mcpBefore) {
      collector.trackSource(logFile);
    }
  }

  if (collector.isEmpty()) {
    if (staleLogs.length > 0) {
      const first = staleLogs[0];
      const message =
        staleLogs.length === 1
          ? `Performance logs are stale (${first.ageMinutes} minutes old): ${first.file}.`
          : `Performance logs are stale (oldest ~${first.ageMinutes} minutes): ${staleLogs
              .slice(0, 3)
              .map((entry) => entry.file)
              .join(', ')}${staleLogs.length > 3 ? ', ...' : ''}`;
      if (typeof onWarning === 'function') {
        onWarning(message);
      }
      throw new Error(message);
    }
    const message = `Performance logs found but contain no parseable metrics. Check log format in ${artifactsRoot}.`;
    if (typeof onWarning === 'function') {
      onWarning(message);
    }
    throw new Error(message);
  }

  // Expose immutable list of parsed source logs for downstream reporting.
  collector.sourceLogFiles = Object.freeze(collector.getSourceLogs());

  return collector;
}

// Summarize JSONL event entries of the shape:
// { tool: string, step: string, ms: number, ok?: boolean }
export function summarizeMetrics(entries = []) {
  const groups = new Map();

  for (const entry of entries) {
    if (!entry || typeof entry.ms !== 'number') continue;
    const tool = entry.tool ?? 'unknown';
    const step = entry.step ?? 'unknown';
    const key = `${tool}::${step}`;

    if (!groups.has(key)) {
      groups.set(key, {
        tool,
        step,
        durations: [],
        okCount: 0,
        errorCount: 0,
      });
    }

    const bucket = groups.get(key);
    bucket.durations.push(entry.ms);
    if (entry.ok) bucket.okCount += 1;
    else bucket.errorCount += 1;
  }

  const summary = [];
  for (const group of groups.values()) {
    const total = group.durations.length;
    const avg =
      total > 0 ? group.durations.reduce((a, b) => a + b, 0) / total : 0;
    summary.push({
      tool: group.tool,
      step: group.step,
      count: total,
      avg,
      p95: percentile(group.durations, 95),
      okCount: group.okCount,
      errorCount: group.errorCount,
    });
  }

  summary.sort((a, b) =>
    a.tool === b.tool
      ? a.step.localeCompare(b.step)
      : a.tool.localeCompare(b.tool),
  );
  return summary;
}

// Evaluate budgets of the shape:
// { [tool]: { [step]: { avg?: number, p95?: number } } }
export function evaluateBudgets(summary = [], budgets = {}) {
  const violations = [];

  for (const metric of summary) {
    const budget = budgets?.[metric.tool]?.[metric.step];
    if (!budget) continue;

    if (Number.isFinite(budget.avg) && metric.avg > budget.avg) {
      violations.push({
        tool: metric.tool,
        step: metric.step,
        metric: 'avg',
        actual: metric.avg,
        limit: budget.avg,
      });
    }
    if (Number.isFinite(budget.p95) && metric.p95 > budget.p95) {
      violations.push({
        tool: metric.tool,
        step: metric.step,
        metric: 'p95',
        actual: metric.p95,
        limit: budget.p95,
      });
    }
  }

  return { pass: violations.length === 0, violations };
}

async function listDirectoriesDescending(root) {
  const dirents = await readdir(root, { withFileTypes: true });
  return dirents
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .sort((a, b) => (a < b ? 1 : -1));
}

async function listJsonlDescending(directory, extension = '.jsonl') {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((dirent) => dirent.isFile() && dirent.name.endsWith(extension))
    .map((dirent) => dirent.name)
    .sort((a, b) => (a < b ? 1 : -1));
}

export async function resolvePerfLogFile({ root, sessionId, extension = '.jsonl' } = {}) {
  try {
    const dateDirs = await listDirectoriesDescending(root);
    for (const dateDir of dateDirs) {
      const directoryPath = path.join(root, dateDir);
      const files = await listJsonlDescending(directoryPath, extension);
      for (const fileName of files) {
        if (!sessionId || fileName === `${sessionId}${extension}`) {
          const filePath = path.join(directoryPath, fileName);
          return {
            path: filePath,
            sessionId: fileName.replace(extension, ''),
            date: dateDir,
          };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function loadPerfLogEntries(filePath) {
  const content = await readFile(filePath, 'utf8');
  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  const entries = [];
  for (const line of lines) {
    try {
      const json = JSON.parse(line);
      if (
        json &&
        typeof json.tool === 'string' &&
        typeof json.step === 'string' &&
        typeof json.ms === 'number'
      ) {
        entries.push(json);
      }
    } catch {
      // Ignore malformed lines
    }
  }
  return entries;
}

export async function loadPerfBudgets(filePath) {
  try {
    const content = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);
    return parsed?.budgets ?? {};
  } catch {
    return {};
  }
}

export { DEFAULT_LOG_MATCHERS, DEFAULT_MAX_LOG_AGE_MS, DEFAULT_MAX_LOG_AGE_MINUTES };
