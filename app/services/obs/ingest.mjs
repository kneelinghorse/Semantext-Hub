import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, open as openFile } from 'node:fs/promises';

const DEFAULT_LOG_ROOT = process.env.OSSP_LOG_ROOT ?? '/var/ossp/logs';

const REQUIRED_FIELDS = ['sessionId', 'tool', 'step', 'ms', 'ok'];

const ISO_DATE_LENGTH = 10;

function toISODate(input) {
  const date = input instanceof Date ? input : new Date(input ?? Date.now());
  if (Number.isNaN(date.valueOf())) {
    throw new TypeError('Invalid event timestamp');
  }
  return date.toISOString();
}

function pickEventFields(event) {
  const normalized = {};
  normalized.ts = toISODate(event.ts ?? Date.now());

  for (const field of REQUIRED_FIELDS) {
    if (event[field] === undefined || event[field] === null) {
      throw new TypeError(`Missing required field "${field}" in metrics event`);
    }
    normalized[field] = event[field];
  }

  if (typeof normalized.sessionId !== 'string' || normalized.sessionId.trim() === '') {
    throw new TypeError('sessionId must be a non-empty string');
  }

  if (typeof normalized.tool !== 'string' || normalized.tool.trim() === '') {
    throw new TypeError('tool must be a non-empty string');
  }

  if (typeof normalized.step !== 'string' || normalized.step.trim() === '') {
    throw new TypeError('step must be a non-empty string');
  }

  if (typeof normalized.ms !== 'number' || !Number.isFinite(normalized.ms) || normalized.ms < 0) {
    throw new TypeError('ms must be a non-negative number');
  }

  normalized.ok = Boolean(normalized.ok);

  if (event.err !== undefined && event.err !== null) {
    normalized.err = String(event.err);
  }

  return normalized;
}

function ensureDateFolder(eventTs) {
  return eventTs.slice(0, ISO_DATE_LENGTH);
}

function resolveLogLocation({ ts, sessionId, root = DEFAULT_LOG_ROOT }) {
  const isoDate = ensureDateFolder(ts);
  const logDir = join(root, isoDate);
  return {
    directory: logDir,
    filePath: join(logDir, `${sessionId}.jsonl`),
  };
}

async function appendJsonLine(filePath, payload) {
  const handle = await openFile(filePath, 'a');
  try {
    await handle.appendFile(`${JSON.stringify(payload)}\n`, 'utf8');
  } finally {
    await handle.close();
  }
}

export async function logPerformanceEvent(event, options = {}) {
  const { root = DEFAULT_LOG_ROOT } = options;
  const normalized = pickEventFields(event);
  const location = resolveLogLocation({ ts: normalized.ts, sessionId: normalized.sessionId, root });

  await mkdir(location.directory, { recursive: true });
  await appendJsonLine(location.filePath, normalized);

  return {
    record: normalized,
    path: location.filePath,
  };
}

export class MetricsIngestWriter {
  constructor({ sessionId, root = DEFAULT_LOG_ROOT } = {}) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new TypeError('sessionId is required to initialize MetricsIngestWriter');
    }
    this.sessionId = sessionId;
    this.root = root;
  }

  async log(event) {
    const payload = {
      ...event,
      sessionId: event.sessionId ?? this.sessionId,
    };
    return logPerformanceEvent(payload, { root: this.root });
  }
}

export function getDefaultLogRoot() {
  return DEFAULT_LOG_ROOT;
}

export function getConfigDirectory() {
  return dirname(fileURLToPath(import.meta.url));
}
