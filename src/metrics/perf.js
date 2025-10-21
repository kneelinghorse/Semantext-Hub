import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_LOG_MATCHERS = {
  nameIncludes: ['performance', 'metrics'],
  extensions: ['.jsonl', '.log'],
};

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
  const duration = logEntry.duration ?? logEntry.context?.duration ?? logEntry.ms;
  if (typeof duration !== 'number') return;

  const message = (logEntry.message ?? '').toLowerCase();
  const label = (logEntry.step ?? '').toLowerCase();
  const isDiscovery =
    message.includes('discovery') || message.includes('catalog') || label.includes('discovery');
  const isMcp =
    message.includes('mcp') || message.includes('tool') || label.includes('mcp');

  const endTime = Date.now();
  const startTime = endTime - duration;
  const cached =
    message.includes('cache') &&
    (message.includes('hit') || message.includes('warm')) &&
    !message.includes('miss');
  const errored =
    message.includes('error') ||
    message.includes('failed') ||
    message.includes('timeout') ||
    logEntry.ok === false;

  if (isDiscovery) {
    collector.recordDiscovery(startTime, endTime, cached, errored);
    return;
  }

  if (isMcp) {
    const toolExecuted = message.includes('tool') || Boolean(logEntry.toolExecuted);
    collector.recordMCP(startTime, endTime, toolExecuted, errored);
  }
}

export function seedMockPerfData(collector) {
  for (let index = 0; index < 50; index += 1) {
    const duration = Math.random() * 800 + 100;
    collector.recordDiscovery(Date.now() - duration, Date.now(), Math.random() > 0.3);
  }

  for (let index = 0; index < 30; index += 1) {
    const duration = Math.random() * 2500 + 200;
    collector.recordMCP(Date.now() - duration, Date.now(), Math.random() > 0.5);
  }
}

export async function collectWorkspacePerfMetrics({
  workspace,
  artifactsDir = 'artifacts',
  verbose = false,
  fallbackToMocks = true,
  logMatchers = DEFAULT_LOG_MATCHERS,
  onWarning,
} = {}) {
  const collector = new PerformanceCollector();
  if (!workspace) {
    if (fallbackToMocks) seedMockPerfData(collector);
    return collector;
  }

  const artifactsRoot = path.resolve(workspace, artifactsDir);
  try {
    await access(artifactsRoot);
  } catch {
    if (fallbackToMocks) seedMockPerfData(collector);
    return collector;
  }

  const logFiles = await findPerformanceLogs(artifactsRoot, logMatchers);
  for (const logFile of logFiles) {
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
  }

  if (collector.isEmpty() && fallbackToMocks) {
    seedMockPerfData(collector);
  }

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

export { DEFAULT_LOG_MATCHERS };
