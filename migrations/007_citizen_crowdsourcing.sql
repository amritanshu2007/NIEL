-- =====================================================================
-- Migration: Citizen Crowdsourcing (feature: citizen-crowdsourcing)
--
-- ADDITIVE ONLY. Extends the existing citizen_reports table with crowdsourcing
-- counters and adds a vote ledger so community members can corroborate pins
-- ("confirmed" / "disputed"). Nothing existing is altered or destroyed.
--
-- Feature API:  /api/v1/features/citizen-reports/...
--
-- Run via:  node scripts/run-migrations.js
-- =====================================================================

-- ---------------------------------------------------------------------
-- Additive columns on the existing citizen_reports table
-- (ADD COLUMN IF NOT EXISTS keeps this idempotent / reversible).
-- ---------------------------------------------------------------------
ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS reported_by     VARCHAR(128);
ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS device_key      VARCHAR(128);
ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS upvotes         SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS downvotes       SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS vote_tally      SMALLINT NOT NULL DEFAULT 0;

-- Fast lookups by device (used for per-source rate limiting decisions)
CREATE INDEX IF NOT EXISTS idx_citizen_reports_device_key
  ON citizen_reports (device_key);

-- ---------------------------------------------------------------------
-- crowdsourcing_votes : append-only corroboration / dispute ledger.
-- One row per (report, voter); doubles as the dedup guard so the same
-- citizen cannot bump a pin twice.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crowdsourcing_votes (
  id          BIGSERIAL PRIMARY KEY,
  report_id   BIGINT      NOT NULL REFERENCES citizen_reports(id) ON DELETE CASCADE,
  voter_key   VARCHAR(128) NOT NULL,
  vote_value  SMALLINT    NOT NULL DEFAULT 1 CHECK (vote_value IN (1, -1)),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, voter_key)
);

CREATE INDEX IF NOT EXISTS idx_crowdsourcing_votes_report
  ON crowdsourcing_votes (report_id);
CREATE INDEX IF NOT EXISTS idx_crowdsourcing_votes_voter
  ON crowdsourcing_votes (voter_key);

-- =====================================================================
-- Reversibility (down migration, for documentation / manual rollback):
--   DROP INDEX IF EXISTS idx_citizen_reports_device_key;
--   ALTER TABLE citizen_reports
--     DROP COLUMN IF EXISTS reported_by,
--     DROP COLUMN IF EXISTS device_key,
--     DROP COLUMN IF EXISTS upvotes,
--     DROP COLUMN IF EXISTS downvotes,
--     DROP COLUMN IF EXISTS vote_tally;
--   DROP TABLE IF EXISTS crowdsourcing_votes;
-- =====================================================================