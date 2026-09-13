-- =====================================================================
-- Migration: Citizen Crowdsourcing Portal Reports
--
-- IMPORTANT (reconciliation note):
-- An earlier development iteration created a `citizen_reports` table with
-- a legacy schema (reporter_name / reporter_phone / latitude / longitude /
-- geom / incident_type / severity / confidence_score / upvotes_count /
-- downvotes_count ...). That legacy schema is already applied to production
-- databases via schema_migrations.
--
-- To keep the migration chain runnable on BOTH fresh and existing
-- databases, this file is idempotent and schema-aware:
--   * fresh install  -> creates the canonical schema below;
--   * existing DB    -> the legacy columns are preserved and the canonical
--                       columns are added ADDITIVELY (no data destroyed).
-- =====================================================================

-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enum for report status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_status') THEN
    CREATE TYPE report_status AS ENUM ('unverified', 'verified', 'rejected');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_category') THEN
    CREATE TYPE report_category AS ENUM (
      'Pothole',
      'Road_Damage',
      'Landslide',
      'Flood',
      'Bridge_Issue',
      'Traffic_Hazard',
      'Infrastructure_Damage',
      'Other'
    );
  END IF;
END $$;

-- Citizen reports table (canonical layout; no-op when the table already exists)
CREATE TABLE IF NOT EXISTS citizen_reports (
  id                    BIGSERIAL PRIMARY KEY,
  location              GEOMETRY(Point, 4326),
  category              report_category,
  description           TEXT,
  image_url             TEXT,
  image_filename        VARCHAR(255),
  image_mime_type       VARCHAR(100),
  status                report_status NOT NULL DEFAULT 'unverified',
  reviewed_by_user_id   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  review_notes          TEXT,
  contact_email         VARCHAR(255),
  contact_phone         VARCHAR(50),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Legacy reconciliation: if a legacy citizen_reports table exists (i.e. the
-- canonical `location` column is absent), bring it up to the canonical shape
-- ADDITIVELY so the model layer and the citizen-crowdsourcing feature can read
-- every report regardless of which layout was applied. Nothing is dropped and
-- existing legacy data is fully preserved.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'citizen_reports' AND column_name = 'location'
  ) THEN
    NULL; -- canonical schema already present (fresh install)
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'citizen_reports'
  ) THEN
    ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS location      GEOMETRY(Point, 4326);
    ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS category      report_category;
    ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS description   TEXT;
    ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS image_url     TEXT;
    ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS image_filename VARCHAR(255);
    ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS image_mime_type VARCHAR(100);
    ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS contact_email  VARCHAR(255);
    ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS contact_phone  VARCHAR(50);
    ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS review_notes   TEXT;
  END IF;
END $$;

-- Spatial index for location-based queries
CREATE INDEX IF NOT EXISTS idx_citizen_reports_location ON citizen_reports USING GIST (location);

-- Indexes for common query patterns (enum-typed columns; no-op for legacy rows)
CREATE INDEX IF NOT EXISTS idx_citizen_reports_status ON citizen_reports (status);
CREATE INDEX IF NOT EXISTS idx_citizen_reports_category ON citizen_reports (category);
CREATE INDEX IF NOT EXISTS idx_citizen_reports_created_at ON citizen_reports (created_at DESC);

-- Trigger to keep updated_at fresh
DROP TRIGGER IF EXISTS trg_citizen_reports_updated ON citizen_reports;
CREATE TRIGGER trg_citizen_reports_updated
  BEFORE UPDATE ON citizen_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- Optional: Helper view for unverified reports (admin dashboard).
-- Matches both canonical ('unverified') and legacy ('UNVERIFIED') layouts.
-- =====================================================================
CREATE OR REPLACE VIEW unverified_citizen_reports AS
SELECT
  id,
  ST_AsGeoJSON(location) AS location,
  category,
  description,
  image_url,
  image_filename,
  image_mime_type,
  status,
  contact_email,
  contact_phone,
  created_at
FROM citizen_reports
WHERE LOWER(status::text) = 'unverified'
ORDER BY created_at DESC;

-- =====================================================================
-- Reverse (down migration, for documentation / manual rollback):
--   DROP VIEW IF EXISTS unverified_citizen_reports;
--   DROP TABLE IF EXISTS citizen_reports;
--   DROP TYPE IF EXISTS report_category;
--   DROP TYPE IF EXISTS report_status;
-- =====================================================================