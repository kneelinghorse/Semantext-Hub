import crypto from 'node:crypto';
import { parsePayload as parseEnvelopePayload } from '../security/dsse.mjs';
import { summarizeProvenance } from '../security/provenance.mjs';

function extractCapabilityStrings(manifest) {
  const values = new Set();
  if (!manifest || typeof manifest !== 'object') {
    return [];
  }

  const pushEntry = (entry) => {
    if (!entry) return;
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed) values.add(trimmed);
      return;
    }
    if (typeof entry !== 'object') return;
    if (typeof entry.capability === 'string' && entry.capability.trim()) {
      values.add(entry.capability.trim());
    }
    if (typeof entry.urn === 'string' && entry.urn.trim()) {
      values.add(entry.urn.trim());
    }
  };

  const rootCaps = manifest.capabilities;
  if (Array.isArray(rootCaps)) {
    for (const entry of rootCaps) {
      pushEntry(entry);
    }
  } else if (rootCaps && typeof rootCaps === 'object') {
    if (Array.isArray(rootCaps.tools)) {
      for (const entry of rootCaps.tools) {
        pushEntry(entry);
      }
    }
    if (Array.isArray(rootCaps.resources)) {
      for (const entry of rootCaps.resources) {
        pushEntry(entry);
      }
    }
  }

  return Array.from(values);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export async function upsertManifest(db, urn, body, { issuer, signature, provenance } = {}) {
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        parsed.manifest &&
        typeof parsed.manifest === 'object'
      ) {
        body = parsed.manifest;
      }
    } catch {
      // leave body as-is
    }
  } else if (
    body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    body.manifest &&
    typeof body.manifest === 'object'
  ) {
    body = body.manifest;
  }

  let payload = typeof body === 'string' ? body : JSON.stringify(body);
  try {
    const maybeWrapper = JSON.parse(payload);
    if (
      maybeWrapper &&
      typeof maybeWrapper === 'object' &&
      !Array.isArray(maybeWrapper) &&
      maybeWrapper.manifest &&
      typeof maybeWrapper.manifest === 'object'
    ) {
      payload = JSON.stringify(maybeWrapper.manifest);
      body = maybeWrapper.manifest;
    }
  } catch {
    // ignore
  }

  const digest = sha256(payload);
  await db.run(
    `INSERT INTO manifests (urn, body, digest, issuer, signature)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(urn) DO UPDATE SET body=excluded.body, digest=excluded.digest, issuer=excluded.issuer, signature=excluded.signature, updated_at=datetime('now')`,
    [urn, payload, digest, issuer || null, signature || null]
  );
  
  // Extract capabilities from manifest
  let caps = [];
  try {
    const json = JSON.parse(payload);
    caps = extractCapabilityStrings(json);
  } catch {}
  
  await db.run("DELETE FROM capabilities WHERE urn=?", [urn]);
  for (const cap of caps) {
    await db.run("INSERT OR IGNORE INTO capabilities(urn,cap) VALUES(?,?)", [urn, String(cap)]);
  }
  
  // Insert provenance if provided
  if (provenance) {
    await insertProvenance(db, urn, digest, provenance);
  }
  
  return { urn, digest };
}

/**
 * Insert a provenance record for a URN
 */
export async function insertProvenance(db, urn, digest, envelope) {
  let envelopeObject;
  if (typeof envelope === 'string') {
    try {
      envelopeObject = JSON.parse(envelope);
    } catch {
      throw new Error('Invalid provenance envelope JSON.');
    }
  } else if (envelope && typeof envelope === 'object') {
    envelopeObject = envelope;
  } else {
    throw new Error('Provenance envelope must be an object or JSON string.');
  }

  let payload;
  try {
    payload = parseEnvelopePayload(envelopeObject);
  } catch {
    throw new Error('Invalid provenance envelope payload');
  }

  const envelopeStr = typeof envelope === 'string' ? envelope : JSON.stringify(envelopeObject);
  const issuer = payload.builder?.id || 'unknown';
  const committedAt = payload.metadata?.timestamp || new Date().toISOString();
  const buildTool = payload.metadata?.buildTool || null;
  const inputs = payload.inputs ? JSON.stringify(payload.inputs) : null;
  const outputs = payload.outputs ? JSON.stringify(payload.outputs) : null;
  const payloadType = envelopeObject.payloadType || 'application/vnd.in-toto+json';

  await db.run(
    `INSERT INTO provenance (urn, envelope, payload_type, digest, issuer, committed_at, build_tool, inputs, outputs)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(urn, digest) DO UPDATE SET 
       envelope=excluded.envelope, 
       issuer=excluded.issuer, 
       committed_at=excluded.committed_at,
       build_tool=excluded.build_tool,
       inputs=excluded.inputs,
       outputs=excluded.outputs`,
    [urn, envelopeStr, payloadType, digest, issuer, committedAt, buildTool, inputs, outputs]
  );
}

/**
 * Get provenance records for a URN
 */
export async function getProvenance(db, urn) {
  const rows = await db.all(
    "SELECT envelope, digest, issuer, committed_at, created_at FROM provenance WHERE urn=? ORDER BY created_at DESC",
    [urn]
  );
  return rows.map((row) => {
    let envelope;
    try {
      envelope = JSON.parse(row.envelope);
    } catch {
      envelope = null;
    }
    return {
      envelope,
      digest: row.digest,
      issuer: row.issuer,
      committedAt: row.committed_at,
      createdAt: row.created_at,
      summary: envelope ? summarizeProvenance(envelope) : { error: 'invalid-provenance' },
    };
  });
}

export async function getManifest(db, urn) {
  const row = await db.get(
    "SELECT body, digest, issuer, signature, updated_at FROM manifests WHERE urn=?",
    [urn]
  );
  if (!row) return null;
  
  const provenanceRow = await db.get(
    "SELECT envelope, digest, issuer, committed_at, created_at FROM provenance WHERE urn=? ORDER BY created_at DESC LIMIT 1",
    [urn]
  );
  
  const result = {
    urn,
    body: (() => {
      let parsed;
      try {
        parsed = JSON.parse(row.body);
      } catch {
        return row.body;
      }
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        parsed.manifest &&
        typeof parsed.manifest === 'object'
      ) {
        return parsed.manifest;
      }
      return parsed;
    })(),
    digest: row.digest,
    issuer: row.issuer,
    signature: row.signature,
    updated_at: row.updated_at
  };
  
  if (provenanceRow) {
    try {
      const envelope = JSON.parse(provenanceRow.envelope);
      const summary = summarizeProvenance(envelope);
      result.provenance = {
        ...summary,
        builder: summary.builder || provenanceRow.issuer,
        committedAt: provenanceRow.committed_at,
        issuer: provenanceRow.issuer,
        digest: provenanceRow.digest,
        recordedAt: provenanceRow.created_at,
      };
    } catch {
      result.provenance = { error: 'invalid-provenance' };
    }
  }
  
  return result;
}

export async function queryByCapability(db, cap) {
  return await db.all(
    "SELECT m.urn, m.digest FROM capabilities c JOIN manifests m ON m.urn=c.urn WHERE c.cap=?",
    [cap]
  );
}

export async function resolve(db, urn) {
  const m = await getManifest(db, urn);
  if (!m) return null;
  const caps = await db.all("SELECT cap FROM capabilities WHERE urn=?", [urn]);
  return {
    urn,
    manifest: m.body,
    capabilities: caps.map(x => x.cap),
    digest: m.digest
  };
}

export async function listManifests(db) {
  return await db.all("SELECT urn, digest, updated_at FROM manifests ORDER BY updated_at DESC");
}
