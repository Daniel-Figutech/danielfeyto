CREATE TABLE IF NOT EXISTS carrusel_leads (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  instagram TEXT NOT NULL,
  que_vendes TEXT NOT NULL,
  facturacion TEXT NOT NULL,
  objetivo TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS carrusel_leads_email ON carrusel_leads(email);
CREATE INDEX IF NOT EXISTS carrusel_leads_created ON carrusel_leads(created_at);

CREATE TABLE IF NOT EXISTS carrusel_sessions (
  token_hash TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES carrusel_leads(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS carrusel_sessions_expiry ON carrusel_sessions(expires_at);

CREATE TABLE IF NOT EXISTS carrusel_rate_limits (
  bucket TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
