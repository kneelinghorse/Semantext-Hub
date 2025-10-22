import crypto from 'node:crypto';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export async function upsertManifest(db, urn, body, { issuer, signature } = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
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
    caps = Array.isArray(json?.capabilities) ? json.capabilities : [];
  } catch {}
  
  await db.run("DELETE FROM capabilities WHERE urn=?", [urn]);
  for (const cap of caps) {
    await db.run("INSERT OR IGNORE INTO capabilities(urn,cap) VALUES(?,?)", [urn, String(cap)]);
  }
  
  return { urn, digest };
}

export async function getManifest(db, urn) {
  const row = await db.get(
    "SELECT body, digest, issuer, signature, updated_at FROM manifests WHERE urn=?",
    [urn]
  );
  if (!row) return null;
  return {
    urn,
    body: JSON.parse(row.body),
    digest: row.digest,
    issuer: row.issuer,
    signature: row.signature,
    updated_at: row.updated_at
  };
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


