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

