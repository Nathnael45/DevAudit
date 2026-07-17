-- DevAudit database schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  repo_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued | running | done | failed
  public_slug TEXT UNIQUE,
  owner_token_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Migration for existing databases (docker-entrypoint-initdb.d only runs on first init):
-- ALTER TABLE audits ADD COLUMN IF NOT EXISTS owner_token_hash TEXT;

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
  type TEXT NOT NULL,    -- thought | finding | summary | error
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS findings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
  file_path TEXT,
  line_start INT,
  line_end INT,
  severity TEXT,         -- critical | high | medium | low | info
  category TEXT,
  title TEXT NOT NULL,
  description TEXT,
  recommendation TEXT,
  raw_output JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audits_user_id ON audits(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_audit_id ON audit_events(audit_id);
CREATE INDEX IF NOT EXISTS idx_findings_audit_id ON findings(audit_id);
CREATE INDEX IF NOT EXISTS idx_audits_public_slug ON audits(public_slug);
