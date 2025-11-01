import path from 'node:path';

import { openDb } from '../../registry/db.mjs';
import { getManifest } from '../../registry/repository.mjs';
import { IAMFilter } from './iam-filter.js';

const DEFAULT_DB_PATH = path.resolve(process.cwd(), 'var/registry.sqlite');

const toIsoDate = () => new Date().toISOString();

const coerceStringArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set();
  const normalised = [];
  for (const entry of value) {
    if (entry == null) {
      continue;
    }
    const text = typeof entry === 'string' ? entry.trim() : String(entry).trim();
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    normalised.push(text);
  }
  return normalised;
};

const pickString = (...candidates) => {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return null;
};

const extractTags = (...candidates) => {
  const tags = new Set();
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        if (typeof entry === 'string') {
          const trimmed = entry.trim();
          if (trimmed) {
            tags.add(trimmed);
          }
        }
      }
    }
  }
  return Array.from(tags);
};

const normaliseActor = (actor, extraCapabilities) => {
  if (typeof actor === 'string' && actor.trim()) {
    actor = { id: actor.trim() };
  } else if (!actor || typeof actor !== 'object') {
    actor = {};
  } else {
    actor = { ...actor };
  }

  const mergedCaps = [];
  if (Array.isArray(actor.capabilities)) {
    mergedCaps.push(...actor.capabilities);
  }
  if (Array.isArray(extraCapabilities)) {
    mergedCaps.push(...extraCapabilities);
  }

  if (mergedCaps.length > 0) {
    const unique = new Set();
    const filtered = [];
    for (const cap of mergedCaps) {
      if (cap == null) {
        continue;
      }
      const text = typeof cap === 'string' ? cap.trim() : String(cap).trim();
      if (!text || unique.has(text)) {
        continue;
      }
      unique.add(text);
      filtered.push(text);
    }
    actor.capabilities = filtered;
  }

  return actor;
};

const deriveMetadata = (manifest) => {
  if (!manifest || typeof manifest !== 'object') {
    return {};
  }

  const metadata = manifest.metadata && typeof manifest.metadata === 'object' ? manifest.metadata : {};

  const name = pickString(
    manifest.name,
    manifest.title,
    metadata.name,
    metadata.title,
    manifest.id
  );

  const summary = pickString(
    manifest.summary,
    manifest.description,
    metadata.summary,
    metadata.description
  );

  const version = pickString(
    manifest.version,
    metadata.version,
    metadata.revision
  );

  const schema = pickString(
    manifest.schema,
    manifest.schema_uri,
    manifest.schemaUri,
    metadata.schema,
    metadata.schema_uri,
    metadata.schemaUri,
    metadata.contract
  );

  const owner = pickString(
    metadata.owner,
    metadata.maintainer,
    metadata.team,
    manifest.owner
  );

  const kind = pickString(
    manifest.kind,
    metadata.kind,
    metadata.type,
    manifest.type
  );

  const tags = extractTags(manifest.tags, metadata.tags, metadata.keywords);

  const activation =
    manifest.activation && typeof manifest.activation === 'object'
      ? manifest.activation
      : metadata.activation && typeof metadata.activation === 'object'
        ? metadata.activation
        : null;

  const entrypoint = pickString(
    activation?.entrypoint,
    manifest.entrypoint,
    metadata.entrypoint,
    activation?.handler,
    manifest.handler
  );

  const instructions = pickString(
    activation?.instructions,
    activation?.summary,
    activation?.notes
  );

  return {
    name,
    summary,
    version,
    schema,
    owner,
    kind,
    tags,
    entrypoint: entrypoint || null,
    instructions: instructions || null
  };
};

const toError = (message, code, details = {}) => {
  const error = new Error(message);
  if (code) {
    error.code = code;
  }
  if (details && typeof details === 'object') {
    error.details = details;
  }
  return error;
};

export class ToolHubActivationService {
  constructor(options = {}) {
    this.logger = options.logger ?? console;
    this.dbPath = options.dbPath
      ? path.resolve(options.dbPath)
      : DEFAULT_DB_PATH;
    this.openDb = typeof options.openDb === 'function' ? options.openDb : openDb;
    this.getManifest =
      typeof options.getManifest === 'function' ? options.getManifest : getManifest;

    this.iamFilter =
      options.iamFilter ??
      new IAMFilter({
        authorize: options.authorize,
        logger: (options.logger && options.logger.child
          ? options.logger.child('iam')
          : options.logger) ?? console,
        requireActor: options.requireActor ?? false,
        denyOnError: options.denyOnError,
        allowImplicitGrant: options.allowImplicitGrant
      });

    this.toolLoader =
      typeof options.toolLoader === 'function' ? options.toolLoader : null;

    this.eventPublisher =
      options.eventPublisher && typeof options.eventPublisher.publish === 'function'
        ? options.eventPublisher
        : null;

    this.contextStore =
      options.contextStore && typeof options.contextStore === 'object'
        ? options.contextStore
        : null;

    this.eventStreamDefaults =
      options.eventStreamDefaults && typeof options.eventStreamDefaults === 'object'
        ? { ...options.eventStreamDefaults }
        : { object: 'tool', event: 'activated' };

    this.includeManifestByDefault =
      options.includeManifest !== undefined ? Boolean(options.includeManifest) : true;
    this.includeProvenanceByDefault =
      options.includeProvenance !== undefined ? Boolean(options.includeProvenance) : true;
  }

  async activate(params = {}) {
    const urn = this.#resolveUrn(params);
    const actor = normaliseActor(params.actor, params.capabilities);
    const includeManifest =
      params.include_manifest ?? params.includeManifest ?? this.includeManifestByDefault;
    const includeProvenance =
      params.include_provenance ?? params.includeProvenance ?? this.includeProvenanceByDefault;

    const record = await this.#loadTool(urn);
    if (!record) {
      throw toError(`Tool '${urn}' not found in registry`, 'NOT_FOUND', { urn });
    }

    const capabilities = coerceStringArray(record.capabilities);

    let iam = null;
    if (this.iamFilter && typeof this.iamFilter.filter === 'function') {
      const filtered = await this.iamFilter.filter(
        [
          {
            tool_id: record.tool_id ?? record.urn ?? urn,
            urn: record.urn ?? urn,
            capabilities
          }
        ],
        actor
      );

      if (!Array.isArray(filtered) || filtered.length === 0) {
        throw toError(
          'Activation denied by IAM policy',
          'IAM_DENIED',
          { urn, actor: actor?.id ?? actor?.urn ?? null }
        );
      }

      iam = filtered[0]?.iam ?? null;
    }

    const response = {
      ok: true,
      urn,
      tool_id: record.tool_id ?? urn,
      digest: record.digest ?? null,
      issuer: record.issuer ?? null,
      signature: record.signature ?? null,
      updated_at: record.updated_at ?? null,
      resolved_at: toIsoDate(),
      capabilities,
      metadata: deriveMetadata(record.manifest),
      iam: iam ?? { allowed: true, reason: 'implicit_allow' }
    };

    if (includeManifest) {
      response.manifest = record.manifest ?? null;
    }

    if (includeProvenance) {
      response.provenance = record.provenance ?? null;
    }

    if (record.activation_hints) {
      response.activation_hints = record.activation_hints;
    }

    if (record.resources) {
      response.resources = record.resources;
    }

    await this.#emitActivationEvents({
      urn,
      actor,
      response,
      params
    });

    return response;
  }

  async #loadTool(urn) {
    if (this.toolLoader) {
      return await this.toolLoader(urn);
    }

    let db;
    try {
      db = await this.openDb({ dbPath: this.dbPath });
      const manifestRecord = await this.getManifest(db, urn);
      if (!manifestRecord) {
        return null;
      }

      const rows = await db.all(
        'SELECT cap FROM capabilities WHERE urn = ? ORDER BY cap ASC',
        [urn]
      );

      const capabilities = coerceStringArray(
        Array.isArray(rows) ? rows.map((row) => row?.cap ?? null) : []
      );

      return {
        urn,
        tool_id: urn,
        manifest: manifestRecord.body ?? null,
        digest: manifestRecord.digest ?? null,
        issuer: manifestRecord.issuer ?? null,
        signature: manifestRecord.signature ?? null,
        updated_at: manifestRecord.updated_at ?? null,
        provenance: manifestRecord.provenance ?? null,
        capabilities
      };
    } finally {
      if (db && typeof db.close === 'function') {
        try {
          await db.close();
        } catch (error) {
          this.logger?.warn?.('[tool-hub-activation] Failed to close registry connection', {
            error: error?.message ?? error
          });
        }
      }
    }
  }

  async #emitActivationEvents(context) {
    await Promise.allSettled([
      this.#publishActivationEvent(context),
      this.#recordContextEntry(context)
    ]);
  }

  async #publishActivationEvent({ urn, actor, response, params }) {
    if (!this.eventPublisher) {
      return;
    }

    try {
      const toolId = response.tool_id ?? urn;
      const streamObjectId = toolId ? String(toolId) : 'unknown';
      const toolTag = toolId ? String(toolId).toLowerCase() : null;
      const safeActor = this.#sanitiseActorForEvent(actor);
      await this.eventPublisher.publish({
        eventType: 'ToolActivated',
        source: 'tool_hub.activate',
        streamSegments: {
          ...this.eventStreamDefaults,
          objectId: streamObjectId
        },
        correlationId: params?.correlation_id || params?.correlationId || params?.request_id,
        context: {
          urn,
          actorId: safeActor?.id ?? null
        },
        tags: ['tool', 'activation', toolTag].filter(Boolean),
        payload: {
          urn,
          toolId: streamObjectId,
          actor: safeActor,
          capabilities: response.capabilities,
          metadata: response.metadata,
          resolvedAt: response.resolved_at,
          iam: response.iam,
          resources: response.resources ?? null
        }
      });
    } catch (error) {
      this.logger.warn('Failed to publish tool activation event', {
        urn,
        error: error?.message || String(error)
      });
    }
  }

  async #recordContextEntry({ urn, actor, response, params }) {
    if (!this.contextStore || typeof this.contextStore.recordToolActivation !== 'function') {
      return;
    }

    try {
      const toolId = response.tool_id ?? urn;
      const streamObjectId = toolId ? String(toolId) : 'unknown';
      const safeActor = this.#sanitiseActorForEvent(actor);
      await this.contextStore.recordToolActivation({
        urn,
        toolId: streamObjectId,
        actor: safeActor,
        capabilities: response.capabilities,
        metadata: response.metadata,
        resolvedAt: response.resolved_at,
        iam: response.iam
      }, {
        source: 'tool_hub.activate',
        correlationId: params?.correlation_id || params?.correlationId || params?.request_id,
        context: {
          urn,
          actorId: safeActor?.id ?? null
        },
        streamSegments: {
          object: 'tool',
          event: 'activated',
          objectId: streamObjectId
        }
      });
    } catch (error) {
      this.logger.warn('Failed to record activation context entry', {
        urn,
        error: error?.message || String(error)
      });
    }
  }

  #sanitiseActorForEvent(actor) {
    if (!actor || typeof actor !== 'object') {
      return null;
    }

    const safeActor = {};
    if (actor.id) {
      safeActor.id = String(actor.id);
    } else if (actor.urn) {
      safeActor.id = String(actor.urn);
    }

    if (actor.role) {
      safeActor.role = String(actor.role);
    }

    if (Array.isArray(actor.capabilities)) {
      safeActor.capabilities = actor.capabilities.map((cap) => String(cap));
    }

    return Object.keys(safeActor).length > 0 ? safeActor : null;
  }

  #resolveUrn(params) {
    const candidates = [
      params?.urn,
      params?.tool_id,
      params?.toolId,
      params?.tool,
      params?.selector,
      params?.selection,
      params?.result
    ];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
      if (typeof candidate === 'object') {
        const urnCandidate = pickString(
          candidate.urn,
          candidate.tool_id,
          candidate.toolId,
          candidate.id
        );
        if (urnCandidate) {
          return urnCandidate;
        }
      }
    }

    throw toError('tool_hub.activate requires a tool identifier', 'INVALID_INPUT');
  }

  async shutdown() {}
}

export default ToolHubActivationService;
