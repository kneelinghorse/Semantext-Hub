import fs from 'fs';
import os from 'os';
import path from 'path';

const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
const LEVEL_VALUES = LEVELS.reduce((acc, level, index) => {
  acc[level] = index;
  return acc;
}, {});

function parseLevel(level) {
  if (!level) return LEVEL_VALUES.info;
  const normalized = level.toLowerCase();
  return Object.prototype.hasOwnProperty.call(LEVEL_VALUES, normalized)
    ? LEVEL_VALUES[normalized]
    : LEVEL_VALUES.info;
}

function safeString(value) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function serializeContext(context) {
  if (context instanceof Error) {
    return {
      error: {
        name: context.name,
        message: context.message,
        stack: context.stack
      }
    };
  }

  if (!context || typeof context !== 'object') {
    const value = safeString(context);
    return value === undefined ? undefined : { value };
  }

  const result = {};
  for (const [key, rawValue] of Object.entries(context)) {
    if (rawValue instanceof Error) {
      result[key] = {
        name: rawValue.name,
        message: rawValue.message,
        stack: rawValue.stack
      };
    } else if (typeof rawValue === 'object' && rawValue !== null) {
      try {
        result[key] = JSON.parse(JSON.stringify(rawValue));
      } catch {
        result[key] = safeString(rawValue);
      }
    } else {
      result[key] = rawValue;
    }
  }
  return result;
}

function formatTimestamp(date) {
  return date.toISOString().replace(/[:]/g, '-');
}

class LogFileWriter {
  constructor(options) {
    const {
      directory,
      filename = 'mcp-server.log',
      maxSizeBytes = 5 * 1024 * 1024,
      maxFiles = 5
    } = options ?? {};

    this.directory = directory;
    this.filename = filename;
    this.filepath = path.join(directory, filename);
    this.maxSizeBytes = maxSizeBytes;
    this.maxFiles = Math.max(1, maxFiles);

    fs.mkdirSync(directory, { recursive: true });
    this.currentSize = fs.existsSync(this.filepath)
      ? fs.statSync(this.filepath).size
      : 0;
  }

  getRotatedFiles() {
    const basePrefix = `${this.filename}.`;
    return fs
      .readdirSync(this.directory)
      .filter(file => file.startsWith(basePrefix) && file.endsWith('.log'))
      .map(file => path.join(this.directory, file))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  }

  rotateIfNeeded(nextChunkSize) {
    if (this.currentSize + nextChunkSize <= this.maxSizeBytes) {
      return;
    }

    if (fs.existsSync(this.filepath)) {
      const timestamp = formatTimestamp(new Date());
      const rotatedPath = path.join(
        this.directory,
        `${this.filename}.${timestamp}.log`
      );
      fs.renameSync(this.filepath, rotatedPath);
    }

    this.currentSize = 0;

    const rotatedFiles = this.getRotatedFiles();
    if (rotatedFiles.length > this.maxFiles - 1) {
      const filesToRemove = rotatedFiles.slice(this.maxFiles - 1);
      for (const file of filesToRemove) {
        try {
          fs.unlinkSync(file);
        } catch {
          // Best effort cleanup; ignore failures
        }
      }
    }
  }

  writeLine(line) {
    const buffer = Buffer.from(`${line}\n`, 'utf8');
    this.rotateIfNeeded(buffer.length);
    fs.appendFileSync(this.filepath, buffer);
    this.currentSize += buffer.length;
  }
}

class ComponentLogger {
  constructor(root, componentName, defaultContext) {
    this.root = root;
    this.componentName = componentName;
    this.defaultContext =
      defaultContext && typeof defaultContext === 'object'
        ? { ...defaultContext }
        : undefined;
  }

  child(subComponent, context) {
    const mergedContext = {
      ...(this.defaultContext || {})
    };

    if (context && typeof context === 'object') {
      Object.assign(mergedContext, context);
    }

    const componentName = subComponent
      ? `${this.componentName}.${subComponent}`
      : this.componentName;

    return new ComponentLogger(this.root, componentName, mergedContext);
  }

  log(level, message, context) {
    this.root.log({
      level,
      component: this.componentName,
      message,
      context,
      defaultContext: this.defaultContext
    });
  }

  trace(message, context) {
    this.log('trace', message, context);
  }

  debug(message, context) {
    this.log('debug', message, context);
  }

  info(message, context) {
    this.log('info', message, context);
  }

  warn(message, context) {
    this.log('warn', message, context);
  }

  error(message, context) {
    this.log('error', message, context);
  }

  fatal(message, context) {
    this.log('fatal', message, context);
  }
}

export class StructuredLogger {
  constructor(options = {}) {
    const {
      directory,
      filename,
      maxSizeBytes,
      maxFiles,
      level,
      componentLevels,
      serviceContext
    } = options;

    if (!directory) {
      throw new Error('Logging directory is required');
    }

    this.baseLevel = parseLevel(level ?? 'info');
    this.componentLevels = new Map();

    const levelsInput = componentLevels ?? {};
    for (const [component, componentLevel] of Object.entries(levelsInput)) {
      this.componentLevels.set(component, parseLevel(componentLevel));
    }

    this.fileWriter = new LogFileWriter({
      directory,
      filename,
      maxSizeBytes,
      maxFiles
    });

    this.hostname = os.hostname();
    this.serviceContext =
      serviceContext && typeof serviceContext === 'object'
        ? { ...serviceContext }
        : {};
  }

  getThreshold(component) {
    if (component && this.componentLevels.has(component)) {
      return this.componentLevels.get(component);
    }
    return this.baseLevel;
  }

  child(component, defaultContext) {
    return new ComponentLogger(this, component, defaultContext);
  }

  log({ level, component, message, context, defaultContext }) {
    const normalizedLevel = level?.toLowerCase() ?? 'info';
    if (!Object.prototype.hasOwnProperty.call(LEVEL_VALUES, normalizedLevel)) {
      return;
    }

    if (LEVEL_VALUES[normalizedLevel] < this.getThreshold(component)) {
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level: normalizedLevel,
      component: component || 'root',
      message: safeString(message) ?? '',
      pid: process.pid,
      hostname: this.hostname,
      ...this.serviceContext
    };

    const mergedContext = {
      ...(defaultContext || {})
    };

    if (context !== undefined) {
      const serialized = serializeContext(context);
      if (serialized && typeof serialized === 'object') {
        Object.assign(mergedContext, serialized);
      }
    }

    if (Object.keys(mergedContext).length > 0) {
      payload.context = mergedContext;
    }

    try {
      this.fileWriter.writeLine(JSON.stringify(payload));
    } catch {
      // Swallow logging errors to avoid impacting runtime
    }
  }

  trace(message, context) {
    this.log({ level: 'trace', message, context });
  }

  debug(message, context) {
    this.log({ level: 'debug', message, context });
  }

  info(message, context) {
    this.log({ level: 'info', message, context });
  }

  warn(message, context) {
    this.log({ level: 'warn', message, context });
  }

  error(message, context) {
    this.log({ level: 'error', message, context });
  }

  fatal(message, context) {
    this.log({ level: 'fatal', message, context });
  }
}

export function buildLoggerConfig(env = process.env) {
  const logDir =
    env.MCP_LOG_DIR ||
    path.join(env.PROTOCOL_ROOT || process.cwd(), 'var', 'log', 'mcp');

  const maxSizeBytes = env.MCP_LOG_MAX_SIZE
    ? Number.parseInt(env.MCP_LOG_MAX_SIZE, 10)
    : 5 * 1024 * 1024;

  const maxFiles = env.MCP_LOG_MAX_FILES
    ? Number.parseInt(env.MCP_LOG_MAX_FILES, 10)
    : 5;

  const componentLevels = {};
  const levelsEnv = env.MCP_LOG_LEVELS;
  if (levelsEnv) {
    const pairs = levelsEnv.split(',');
    for (const pair of pairs) {
      const [component, value] = pair.split('=').map(part => part?.trim());
      if (component && value) {
        componentLevels[component] = value.toLowerCase();
      }
    }
  }

  return {
    directory: logDir,
    filename: env.MCP_LOG_FILE || 'mcp-server.log',
    maxSizeBytes: Number.isNaN(maxSizeBytes) ? undefined : maxSizeBytes,
    maxFiles: Number.isNaN(maxFiles) ? undefined : maxFiles,
    level: env.MCP_LOG_LEVEL || 'info',
    componentLevels
  };
}

export function createStructuredLogger(options = {}) {
  const config = buildLoggerConfig({
    ...process.env,
    ...(options.environmentOverrides || {})
  });

  return new StructuredLogger({
    ...config,
    serviceContext: options.serviceContext || {}
  });
}
