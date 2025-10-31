import express from 'express';
import rateLimit from 'express-rate-limit';
import { openDb, getHealth, ensureSchema, DEFAULT_SCHEMA_PATH } from './db.mjs';
import { upsertManifest, getManifest, queryByCapability, resolve, listManifests } from './repository.mjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateProvenance, summarizeProvenance } from '../security/provenance.mjs';
const DEFAULT_RATE_LIMIT_CONFIG = fileURLToPath(
  new URL('../../../app/config/security/rate-limit.config.json', import.meta.url),
);
const DEFAULT_REGISTRY_CONFIG = fileURLToPath(
  new URL('../../../app/config/registry.config.json', import.meta.url),
);
const DEFAULT_PROVENANCE_KEY = fileURLToPath(
  new URL('../../../fixtures/keys/pub.pem', import.meta.url),
);
const OPENAPI_SPEC_PATH = fileURLToPath(new URL('./openapi.json', import.meta.url));

const WELL_KNOWN_PAYLOAD = {
  service: 'Semantext Hub Registry Service (SQLite)',
  version: 'registry.ossp-agi.io/v1',
  description: 'SQLite-backed registry with WAL mode for durability',
  links: {
    register_v1: '/v1/registry/{urn}',
    resolve_v1: '/v1/resolve?urn={urn}',
    query_v1: '/v1/query',
    health: '/health',
  },
  auth: { type: 'api-key', header: 'X-API-Key' },
};

export async function readOpenApiSpec() {
  return readFile(OPENAPI_SPEC_PATH, 'utf8');
}

export async function loadOpenApiSpec() {
  const raw = await readOpenApiSpec();
  return JSON.parse(raw);
}

async function loadRateLimitConfig(path) {
  if (path === null) return {};
  const configPath = path || DEFAULT_RATE_LIMIT_CONFIG;
  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    /* istanbul ignore next -- optional rate-limit config logging */
    if (error?.code !== 'ENOENT') {
      console.warn(`[registry] Failed to load rate limit config:`, error);
    }
  }
  return {};
}

async function loadRegistryConfig(path) {
  const configPath = path || DEFAULT_REGISTRY_CONFIG;
  try {
    const raw = await readFile(configPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    /* istanbul ignore next -- optional registry config logging */
    if (error?.code !== 'ENOENT') {
      console.warn(`[registry] Failed to load registry config:`, error);
    }
  }
  return {};
}

function buildRateLimiter(config = {}) {
  const {
    windowMs = 60000,
    max = 60,
    standardHeaders = true,
    legacyHeaders = false,
    message = { error: 'rate_limited', message: 'Too many requests.' },
  } = config;

  const limiter = rateLimit({
    windowMs,
    max,
    standardHeaders,
    legacyHeaders,
    message,
  });

  return { limiter, config: { windowMs, max, standardHeaders, legacyHeaders } };
}

function normalizeProvenanceKeyConfig(entry) {
  /* istanbul ignore next -- configuration schema guards entry shape */
  if (!entry || typeof entry !== 'object') {
    throw new Error('Provenance verifier entries must be objects.');
  }
  /* istanbul ignore next -- configuration schema guards key presence */
  if (!entry.pubkey) {
    throw new Error('Provenance verifier entry requires a `pubkey`.');
  }
  return {
    pubkey: entry.pubkey,
    alg: entry.alg || entry.algorithm || 'Ed25519',
    keyid: entry.keyid || entry.keyId || entry.kid || null,
  };
}

async function loadProvenanceVerifier(options = {}) {
  if (Array.isArray(options.keys) && options.keys.length > 0) {
    return options.keys.map(normalizeProvenanceKeyConfig);
  }

  const keyPath =
    options.keyPath ??
    process.env.PROVENANCE_PUBKEY_PATH ??
    DEFAULT_PROVENANCE_KEY;

  try {
    const pubkey = await readFile(keyPath, 'utf8');
    return [
      normalizeProvenanceKeyConfig({
        pubkey,
        alg: options.algorithm || 'Ed25519',
        keyid: options.keyid || options.keyId || null,
      }),
    ];
  } catch (error) {
    if (options.optional) {
      return [];
    }
    throw new Error(
      `Failed to load provenance verification key from ${keyPath}: ${error.message}`,
    );
  }
}

export async function createServer(options = {}) {
  const {
    registryConfigPath,
    rateLimitConfigPath,
    registryConfigOverrides,
    dbPath = null,
    pragmas = null,
    rateLimit: rateLimitOverrides,
    apiKey,
    jsonLimit = '512kb',
    provenanceKeyPath,
    provenanceKeys,
    provenanceAlgorithm = 'Ed25519',
    provenanceKeyId = null,
    requireProvenance = true,
    schemaPath,
    autoMigrate = true,
  } = options;

  const envApiKey =
    typeof process.env.REGISTRY_API_KEY === 'string'
      ? process.env.REGISTRY_API_KEY.trim()
      : '';
  const resolvedApiKey =
    typeof apiKey === 'string' && apiKey.trim().length > 0
      ? apiKey.trim()
      : envApiKey;

  if (!resolvedApiKey) {
    throw new Error(
      'Registry API key must be provided via options.apiKey or REGISTRY_API_KEY environment variable. Insecure defaults have been removed.',
    );
  }

  const registryConfigFromFile = await loadRegistryConfig(registryConfigPath);
  const registryConfig = {
    ...(registryConfigFromFile || {}),
    ...(registryConfigOverrides || {}),
  };
  if (dbPath) {
    registryConfig.dbPath = dbPath;
  }
  if (pragmas && typeof pragmas === 'object') {
    registryConfig.pragmas = {
      ...(registryConfig.pragmas || {}),
      ...pragmas,
    };
  }
  const db = await openDb(registryConfig);

  if (autoMigrate !== false) {
    const migrationSchemaPath =
      schemaPath ??
      registryConfig.schemaPath ??
      DEFAULT_SCHEMA_PATH;

    try {
      const { applied, version } = await ensureSchema(db, {
        schemaPath: migrationSchemaPath,
      });
      if (applied) {
        console.log(
          `[registry] Applied schema version ${version} from ${migrationSchemaPath}`,
        );
      }
    } catch (error) {
      throw new Error(`Registry schema migration failed: ${error.message}`);
    }
  }

  const healthConfig = registryConfig.health || {};
  const candidateMinFree = Number(healthConfig.minFreeBytes);
  const minFreeBytes =
    Number.isFinite(candidateMinFree) && candidateMinFree >= 0
      ? candidateMinFree
      : undefined;
  const startupHealth = await getHealth(db, { minFreeBytes });
  if (startupHealth.errors.length > 0) {
    throw new Error(
      `Registry startup health check failed: ${startupHealth.errors.join('; ')}`,
    );
  }
  if (startupHealth.warnings.length > 0) {
    for (const warning of startupHealth.warnings) {
      console.warn(`[registry] Startup health warning: ${warning}`);
    }
  }

  const rateLimitConfigFromFile = await loadRateLimitConfig(rateLimitConfigPath);
  const rateLimitConfig = {
    ...(rateLimitConfigFromFile || {}),
    ...(rateLimitOverrides || {}),
  };
  const { limiter, config: limiterConfig } = buildRateLimiter(rateLimitConfig);

  const provenanceVerifier = await loadProvenanceVerifier({
    keyPath: provenanceKeyPath,
    keys: provenanceKeys,
    algorithm: provenanceAlgorithm,
    keyid: provenanceKeyId,
    optional: requireProvenance === false,
  });
  if (requireProvenance !== false && provenanceVerifier.length === 0) {
    /* istanbul ignore next -- enforcement tested via integration harness */
    throw new Error(
      'Provenance enforcement enabled but no verification keys were loaded.',
    );
  }

  const app = express();
  app.disable('x-powered-by');
  app.set('db', db);
  app.set('registryConfig', registryConfig);
  app.set('registryConfigRaw', registryConfigFromFile || {});
  app.set('rateLimiter', limiter);
  app.set('rateLimitConfig', limiterConfig);
  app.set('rateLimitConfigRaw', rateLimitConfigFromFile || {});
  app.set('healthConfig', { minFreeBytes: minFreeBytes ?? null });
  app.set('provenanceVerifier', provenanceVerifier);
  app.set('provenanceRequired', requireProvenance !== false);
  app.set('registryApiKey', resolvedApiKey);

  app.use(express.json({ limit: jsonLimit }));
  
  // CORS
  app.use((request, response, next) => {
    const origin = request.headers.origin;
    if (typeof origin === 'string') {
      try {
        const url = new URL(origin);
        const hostname = url.hostname.toLowerCase();
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
          response.setHeader('Access-Control-Allow-Origin', origin);
          response.setHeader('Vary', 'Origin');
          response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
          response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
          response.setHeader('Access-Control-Max-Age', '600');
        }
      } catch {}
    }
    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }
    next();
  });

  app.use((request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  const requireApiKey = (request, response, next) => {
    const provided = request.get('X-API-Key');
    if (!provided || provided !== resolvedApiKey) {
      return response.status(401).json({
        error: 'unauthorized',
        message: 'Valid X-API-Key header is required.',
      });
    }
    return next();
  };

  app.get('/.well-known/ossp-agi.json', (request, response) => {
    response.json(WELL_KNOWN_PAYLOAD);
  });

  app.get('/health', async (request, response, next) => {
    try {
      const health = await getHealth(db, {
        minFreeBytes: app.get('healthConfig')?.minFreeBytes ?? undefined,
      });
      const count = (await db.get("SELECT COUNT(*) as count FROM manifests"))?.count || 0;
      const status =
        health.errors.length > 0 ? 'error' : health.warnings.length > 0 ? 'warn' : 'ok';
      response.json({
        status,
        registry: {
          driver: health.driver,
          wal: health.wal,
          journal_mode: health.journalMode,
          schema_version: health.schemaVersion,
          expected_schema_version: health.expectedSchemaVersion,
          path: health.path,
          disk: health.disk,
          records: count,
        },
        warnings: health.warnings,
        errors: health.errors,
        rateLimit: limiterConfig,
      });
    } catch (error) {
      /* istanbul ignore next -- health route errors bubbled via global error handler */
      next(error);
    }
  });

  app.get('/openapi.json', async (request, response, next) => {
    try {
      const spec = await readOpenApiSpec();
      response.setHeader('Content-Type', 'application/json');
      response.send(spec);
    } catch (error) {
      /* istanbul ignore next -- spec load errors handled by global error handler */
      next(error);
    }
  });

  const v1Router = express.Router();

  v1Router.get(
    '/registry/:urn',
    limiter,
    requireApiKey,
    async (request, response, next) => {
      try {
        const urn = decodeURIComponent(request.params.urn);
        const manifest = await getManifest(db, urn);
        if (!manifest) {
          return response.status(404).json({
            error: 'not_found',
            message: `No manifest found for urn '${urn}'.`,
            urn,
          });
        }
        return response.json({
          urn: manifest.urn,
          body: manifest.body,
          digest: manifest.digest,
          issuer: manifest.issuer,
          signature: manifest.signature,
          updated_at: manifest.updated_at,
          provenance: manifest.provenance ?? null,
        });
      } catch (error) {
        /* istanbul ignore next -- registry lookup errors handled by global handler */
        return next(error);
      }
    },
  );

  v1Router.put(
    '/registry/:urn',
    limiter,
    requireApiKey,
    async (request, response, next) => {
      try {
        const urn = decodeURIComponent(request.params.urn);
        const payload = request.body;

        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          return response.status(400).json({
            error: 'invalid_request',
            message: 'Body must be a JSON object.',
          });
        }

        let manifest = payload.manifest ?? payload.body ?? null;
        if (typeof manifest === 'string') {
          try {
            manifest = JSON.parse(manifest);
          } catch {
            manifest = null;
          }
        }
        if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
          return response.status(400).json({
            error: 'invalid_manifest',
            message: 'Request must include a `manifest` object.',
          });
        }

        if (
          manifest &&
          typeof manifest === 'object' &&
          !Array.isArray(manifest) &&
          manifest.manifest &&
          manifest.provenance &&
          typeof manifest.manifest === 'object' &&
          !Array.isArray(manifest.manifest) &&
          (Array.isArray(manifest.manifest.capabilities) || manifest.manifest.id)
        ) {
          manifest = manifest.manifest;
        }

        const provenance = payload.provenance;
        const requireAttestation = app.get('provenanceRequired') !== false;
        if (requireAttestation && !provenance) {
          return response.status(422).json({
            error: 'missing-provenance',
            message: 'DSSE provenance attestation is required.',
            urn,
          });
        }

        let provenanceSummary = null;
        if (provenance) {
          const verifierConfigs = app.get('provenanceVerifier') || [];
          const validation = validateProvenance(provenance, verifierConfigs);
          if (!validation.ok) {
            const status =
              validation.reason === 'no-verification-keys' ||
              validation.reason === 'no-matching-key'
                ? 500
                : 422;
            return response.status(status).json({
              error: 'invalid-provenance',
              message: 'Provenance attestation failed validation.',
              urn,
              reason: validation.reason,
            });
          }
          provenanceSummary = summarizeProvenance(provenance);
          const signatureSummary = {
            scheme: 'dsse+jws',
            keyId: validation.signature?.keyid ?? null,
            algorithm: validation.signature?.alg ?? null,
          };
          provenanceSummary = {
            ...provenanceSummary,
            signature: signatureSummary,
          };
        } else if (requireAttestation) {
          return response.status(422).json({
            error: 'missing-provenance',
            message: 'DSSE provenance attestation is required.',
            urn,
          });
        }

        const result = await upsertManifest(db, urn, manifest, {
          issuer: payload?.issuer,
          signature: payload?.signature,
          provenance: provenance || null,
        });

        return response.status(200).json({
          status: 'ok',
          urn: result.urn,
          digest: result.digest,
          provenance: provenanceSummary,
        });
      } catch (error) {
        /* istanbul ignore next -- registry upsert errors handled by global handler */
        return next(error);
      }
    },
  );

  v1Router.get(
    '/resolve',
    limiter,
    requireApiKey,
    async (request, response, next) => {
      try {
        const urnCandidate = request.query.urn;
        if (typeof urnCandidate !== 'string' || urnCandidate.trim().length === 0) {
          return response.status(400).json({
            error: 'invalid_query',
            message: '`urn` query parameter is required.',
          });
        }
        const urn = decodeURIComponent(urnCandidate);
        const resolved = await resolve(db, urn);
        if (!resolved) {
          return response.status(404).json({
            error: 'not_found',
            message: `No manifest found for urn '${urn}'.`,
            urn,
          });
        }
        return response.json({
          urn: resolved.urn,
          manifest: resolved.manifest,
          capabilities: resolved.capabilities,
          digest: resolved.digest,
        });
      } catch (error) {
        /* istanbul ignore next -- resolve errors handled by global handler */
        return next(error);
      }
    },
  );

  v1Router.post(
    '/query',
    limiter,
    requireApiKey,
    async (request, response, next) => {
      try {
        const { capability } = request.body;
        if (!capability || typeof capability !== 'string') {
          return response.status(400).json({
            error: 'invalid_request',
            message: 'Body must include a `capability` string.',
          });
        }
        const results = await queryByCapability(db, capability);
        return response.json({
          status: 'ok',
          capability,
          results,
        });
      } catch (error) {
        /* istanbul ignore next -- query errors handled by global handler */
        return next(error);
      }
    },
  );

  app.use('/v1', v1Router);

  app.use((error, request, response, next) => {
    if (error?.type === 'entity.parse.failed') {
      return response.status(400).json({
        error: 'invalid_json',
        message: 'Request body must be valid JSON.',
      });
    }

    /* istanbul ignore next -- diagnostic logging only */
    console.error('[registry] Unhandled error', error);
    /* istanbul ignore next -- integrity checks exercised via integration harness */
    if (response.headersSent) {
      return next(error);
    }
    return response.status(500).json({
      error: 'internal_error',
      message: 'Unexpected error occurred.',
    });
  });

  return app;
}

export async function startServer(options = {}) {
  const app = await createServer(options);
  const requestedPort = options.port ?? 3000;
  const host = options.host;

  return new Promise((resolve, reject) => {
    const server = app
      .listen(requestedPort, host, () => {
        const address = server.address();
        const resolvedPort =
          typeof address === 'object' && address !== null ? address.port : requestedPort;
        if (resolvedPort === undefined) {
          /* istanbul ignore next -- console output is diagnostic only */
          console.log('[registry] Server listening');
        } else {
          /* istanbul ignore next -- console output is diagnostic only */
          console.log(`[registry] Server listening on port ${resolvedPort}`);
        }
        resolve({
          app,
          port: resolvedPort,
          host:
            typeof address === 'object' && address !== null
              ? address.address ?? host ?? '0.0.0.0'
              : host ?? '0.0.0.0',
          address,
          server,
          close: () =>
            new Promise((closeResolve) => {
              server.close(() => closeResolve());
            }),
        });
      })
      .on('error', reject);
  });
}
