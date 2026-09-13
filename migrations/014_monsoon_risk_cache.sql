-- =====================================================================
-- Migration: Predictive Monsoon - Risk Cache (feature: predictive-monsoon)
--
-- ADDITIVE ONLY. The monsoon analytics pipeline computes explainable
-- baseline risk per road segment / district / month from existing,
-- untouched source records (incidents + roads + monsoon_climatology).
-- Completed heatmap/risk results are cached here so repeated API reads are
-- fast and reproducible. The cache never stores derived data that
-- pretends to be an observation; production rows carry model_version,
-- method and a "dataCoverage" flag so under-observed areas are labelled
-- honestly instead of fabricating predictions.
--
-- Feature API:  /api/v1/features/predictive-monsoon/{heatmap,risk,run,metrics}
--
-- Run via:  node scripts/run-migrations.js
-- =====================================================================

CREATE TABLE IF NOT EXISTS monsoon_risk_cache (
  id               BIGSERIAL PRIMARY KEY,
  cache_key        VARCHAR(191) NOT NULL UNIQUE,
  month            SMALLINT     NOT NULL CHECK (month BETWEEN 1 AND 12),
  incident_type    VARCHAR(40)  NOT NULL,
  district         VARCHAR(100),
  road_name        VARCHAR(150),
  road_id          BIGINT,
  method           VARCHAR(30)  NOT NULL DEFAULT 'baseline',
  model_version    VARCHAR(50)  NOT NULL,
  risk_score      DOUBLE PRECISION NOT NULL,
  risk_level       VARCHAR(10)  NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  confidence       DOUBLE PRECISION NOT NULL DEFAULT 0,
  contribution_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  historical_count INTEGER      NOT NULL DEFAULT 0,
  cluster_count    INTEGER      NOT NULL DEFAULT 0,
  seasonal_recurrence DOUBLE PRECISION NOT NULL DEFAULT 0,
  data_coverage    VARCHAR(20)  NOT NULL DEFAULT 'insufficient',
  factors          JSONB,
  geometry         GEOMETRY(LineString, 4326),
  point           GEOMETRY(Point, 4326),
  expires_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW() + INTERVAL '3 hours',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monsoon_risk_cache_key      ON monsoon_risk_cache (cache_key);
CREATE INDEX IF NOT EXISTS idx_monsoon_risk_cache_month    ON monsoon_risk_cache (month);
CREATE INDEX IF NOT EXISTS idx_monsoon_risk_cache_type     ON monsoon_risk_cache (incident_type);
CREATE INDEX IF NOT EXISTS idx_monsoon_risk_cache_level    ON monsoon_risk_cache (risk_level);
CREATE INDEX IF NOT EXISTS idx_monsoon_risk_cache_geom     ON monsoon_risk_cache USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_monsoon_risk_cache_point    ON monsoon_risk_cache USING GIST (point);

-- =====================================================================
-- Reversibility (down migration, for documentation / manual rollback):
--   DROP TABLE IF EXISTS monsoon_risk_cache;
-- =====================================================================