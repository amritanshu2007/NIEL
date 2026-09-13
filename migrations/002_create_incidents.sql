-- =====================================================================
-- Migration: incidents table (Field Officer Incident Reporting)
--
-- Run via:   npm run db:migrate
--
-- Simplified like 001_create_users.sql: no DO blocks (safe with the
-- migration runner). Depends on the incident_type / severity_level enum
-- types and the set_updated_at() helper created by 001_create_tables.sql.
-- Always adds updated_at (Phase 4 timestamps) even on databases migrated
-- by the earlier schema file.
-- =====================================================================

CREATE TABLE IF NOT EXISTS incidents (
  id                  BIGSERIAL PRIMARY KEY,
  reported_by_user_id BIGINT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location            GEOMETRY(Point, 4326) NOT NULL,
  incident_type       incident_type    NOT NULL,
  photo_url           TEXT,
  severity            severity_level   NOT NULL DEFAULT 'Medium',
  created_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- Apply the Phase 4 timestamps to DBs already migrated by 001_create_tables.sql
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_incidents_location ON incidents USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_incidents_type     ON incidents (incident_type);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents (severity);
CREATE INDEX IF NOT EXISTS idx_incidents_auth     ON incidents (reported_by_user_id);

-- Keep updated_at fresh on UPDATE (idempotent)
DROP TRIGGER IF EXISTS trg_incidents_updated ON incidents;
CREATE TRIGGER trg_incidents_updated
  BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();