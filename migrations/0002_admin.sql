CREATE TABLE IF NOT EXISTS carrusel_admin_sessions (
  token_hash TEXT PRIMARY KEY,
  key_version TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS carrusel_admin_sessions_expiry ON carrusel_admin_sessions(expires_at);
