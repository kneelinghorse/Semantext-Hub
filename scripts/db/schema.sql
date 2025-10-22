PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA user_version=1;

CREATE TABLE IF NOT EXISTS manifests (
  urn TEXT PRIMARY KEY,
  body TEXT NOT NULL,                    -- JSON string
  digest TEXT NOT NULL,                  -- sha256 of body
  issuer TEXT,                           -- signer/issuer id (optional)
  signature TEXT,                        -- JWS/DSSE envelope (JSON string)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS capabilities (
  urn TEXT NOT NULL,
  cap TEXT NOT NULL,
  PRIMARY KEY (urn, cap)
);

CREATE INDEX IF NOT EXISTS idx_cap ON capabilities(cap);

CREATE TRIGGER IF NOT EXISTS manifests_updated
AFTER UPDATE ON manifests
BEGIN
  UPDATE manifests SET updated_at = datetime('now') WHERE urn = NEW.urn;
END;

CREATE TABLE IF NOT EXISTS schema_history (
  version INTEGER PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schema_history(version) VALUES (1);

-- Provenance table for DSSE attestations
CREATE TABLE IF NOT EXISTS provenance (
  urn TEXT NOT NULL,
  envelope TEXT NOT NULL,         -- DSSE JSON envelope
  payload_type TEXT NOT NULL,     -- e.g., 'application/vnd.in-toto+json'
  digest TEXT NOT NULL,           -- SHA256 of manifest content
  issuer TEXT NOT NULL,           -- Builder/signer identifier
  committed_at TEXT NOT NULL,     -- Git commit timestamp
  build_tool TEXT,                -- Tool that created the build
  inputs TEXT,                    -- JSON array of input artifacts
  outputs TEXT,                   -- JSON array of output artifacts
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (urn, digest)
);

CREATE INDEX IF NOT EXISTS idx_prov_urn ON provenance(urn);
CREATE INDEX IF NOT EXISTS idx_prov_issuer ON provenance(issuer);
CREATE INDEX IF NOT EXISTS idx_prov_committed_at ON provenance(committed_at);

