-- =====================================================================
-- Migration: Predictive Monsoon (feature: predictive-monsoon)
--
-- ADDITIVE ONLY. Adds a per-district monsoonal forecast ledger, run audit
-- log and a climatology reference seed. The prediction service runs a
-- transparent statistical model (climatology + live rainfall trend +
-- optional OpenWeather forecast) and never fabricates data: outputs are
-- flagged with their source ('climatology', 'observation-model',
-- 'external' or 'mock-climatology' when no observational inputs exist).
--
-- Feature API:  /api/v1/features/monsoon/...
--
-- Run via:  node scripts/run-migrations.js
-- =====================================================================

CREATE TABLE IF NOT EXISTS monsoon_climatology (
  district           VARCHAR(100) NOT NULL,
  month              SMALLINT     NOT NULL CHECK (month BETWEEN 1 AND 12),
  typical_mm_day     NUMERIC(8, 2) NOT NULL,
  peak_intensity_mmh NUMERIC(8, 2) NOT NULL,
  wet_fraction       NUMERIC(3, 2) NOT NULL DEFAULT 0.60,
  PRIMARY KEY (district, month)
);

CREATE TABLE IF NOT EXISTS monsoon_forecasts (
  id                  BIGSERIAL PRIMARY KEY,
  district            VARCHAR(100)  NOT NULL,
  forecast_date       DATE          NOT NULL,
  expected_rainfall_mm NUMERIC(10, 2) NOT NULL,
  rainfall_5day_mm    NUMERIC(10, 2),
  intensity_mmh       NUMERIC(8, 2),
  confidence          INTEGER       NOT NULL DEFAULT 60 CHECK (confidence BETWEEN 0 AND 100),
  risk_level          VARCHAR(20)   NOT NULL DEFAULT 'LOW'
                      CHECK (risk_level IN ('LOW', 'MODERATE', 'HIGH', 'SEVERE')),
  baseline_condition  VARCHAR(20)   NOT NULL DEFAULT 'DAMP'
                      CHECK (baseline_condition IN ('DRY', 'DAMP', 'MOIST', 'WET', 'SATURATED')),
  advisory            TEXT,
  model_version       VARCHAR(50)   NOT NULL,
  source              VARCHAR(32)   NOT NULL DEFAULT 'climatology',
  window_start        TIMESTAMPTZ,
  window_end          TIMESTAMPTZ,
  generated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (district, forecast_date)
);

CREATE INDEX IF NOT EXISTS idx_monsoon_forecasts_date      ON monsoon_forecasts (forecast_date);
CREATE INDEX IF NOT EXISTS idx_monsoon_forecasts_district  ON monsoon_forecasts (district);
CREATE INDEX IF NOT EXISTS idx_monsoon_forecasts_risk      ON monsoon_forecasts (risk_level);

CREATE TABLE IF NOT EXISTS monsoon_runs (
  id            BIGSERIAL PRIMARY KEY,
  model_version VARCHAR(50) NOT NULL,
  districts_count INTEGER  NOT NULL DEFAULT 0,
  horizon_days  INTEGER     NOT NULL DEFAULT 7,
  objective     VARCHAR(30) NOT NULL DEFAULT 'ensemble',
  source        VARCHAR(32) NOT NULL DEFAULT 'climatology',
  inputs        JSONB,
  status        VARCHAR(20) NOT NULL DEFAULT 'running'
                CHECK (status IN ('running', 'completed', 'failed')),
  error         TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ
);

-- =====================================================================
-- Seed climatology: monthly typical daily rainfall (mm/day) per district
-- present in the seeded road network. Monsoon months (May-Sep) carry the
-- weight; East Khasi Hills is the NER extreme (Cherrapunji rain-shadow).
-- =====================================================================
INSERT INTO monsoon_climatology (district, month, typical_mm_day, peak_intensity_mmh, wet_fraction) VALUES
('Jorhat',            1, 1.2,  8, 0.25),
('Jorhat',            2, 2.5, 10, 0.30),
('Jorhat',            3, 5.0, 14, 0.40),
('Jorhat',            4, 9.0, 22, 0.55),
('Jorhat',            5, 14.2, 32, 0.70),
('Jorhat',            6, 18.5, 45, 0.80),
('Jorhat',            7, 20.8, 52, 0.85),
('Jorhat',            8, 16.2, 42, 0.80),
('Jorhat',            9, 13.1, 34, 0.70),
('Jorhat',           10, 6.5, 18, 0.45),
('Jorhat',           11, 1.8,  9, 0.25),
('Jorhat',           12, 0.8,  6, 0.15),
('Papum Pare',        1, 0.9,  6, 0.20),
('Papum Pare',        2, 2.0,  9, 0.25),
('Papum Pare',        3, 5.2, 15, 0.40),
('Papum Pare',        4, 10.5, 25, 0.55),
('Papum Pare',        5, 15.8, 38, 0.75),
('Papum Pare',        6, 20.5, 50, 0.85),
('Papum Pare',        7, 23.0, 58, 0.88),
('Papum Pare',        8, 18.5, 48, 0.82),
('Papum Pare',        9, 14.0, 36, 0.72),
('Papum Pare',       10, 6.8, 19, 0.45),
('Papum Pare',       11, 1.5,  8, 0.25),
('Papum Pare',       12, 0.6,  5, 0.15),
('Kohima',            1, 0.7,  5, 0.18),
('Kohima',            2, 1.6,  8, 0.22),
('Kohima',            3, 3.8, 12, 0.35),
('Kohima',            4, 7.0, 18, 0.50),
('Kohima',            5, 11.0, 28, 0.62),
('Kohima',            6, 15.0, 40, 0.78),
('Kohima',            7, 16.5, 44, 0.80),
('Kohima',            8, 14.0, 38, 0.76),
('Kohima',            9, 11.5, 30, 0.65),
('Kohima',           10, 5.2, 15, 0.42),
('Kohima',           11, 1.2,  7, 0.22),
('Kohima',           12, 0.5,  4, 0.12),
('Golaghat',          1, 1.1,  7, 0.24),
('Golaghat',          2, 2.4, 10, 0.28),
('Golaghat',          3, 4.8, 13, 0.38),
('Golaghat',          4, 8.6, 21, 0.52),
('Golaghat',          5, 13.6, 30, 0.68),
('Golaghat',          6, 17.8, 43, 0.78),
('Golaghat',          7, 19.8, 50, 0.84),
('Golaghat',          8, 15.4, 40, 0.78),
('Golaghat',          9, 12.4, 32, 0.68),
('Golaghat',         10, 6.0, 17, 0.44),
('Golaghat',         11, 1.6,  8, 0.24),
('Golaghat',         12, 0.7,  5, 0.14),
('East Khasi Hills',  1, 1.5,  8, 0.25),
('East Khasi Hills',  2, 3.5, 12, 0.35),
('East Khasi Hills',  3, 8.0, 20, 0.50),
('East Khasi Hills',  4, 18.0, 35, 0.70),
('East Khasi Hills',  5, 48.0, 70, 0.90),
('East Khasi Hills',  6, 62.0, 82, 0.95),
('East Khasi Hills',  7, 68.0, 88, 0.95),
('East Khasi Hills',  8, 55.0, 76, 0.92),
('East Khasi Hills',  9, 35.0, 55, 0.85),
('East Khasi Hills', 10, 12.0, 28, 0.55),
('East Khasi Hills', 11, 3.0, 11, 0.30),
('East Khasi Hills', 12, 1.2,  7, 0.22),
('West Tripura',      1, 0.9,  6, 0.20),
('West Tripura',      2, 2.2,  9, 0.26),
('West Tripura',      3, 4.5, 13, 0.36),
('West Tripura',      4, 9.0, 22, 0.52),
('West Tripura',      5, 14.5, 34, 0.70),
('West Tripura',      6, 18.8, 46, 0.80),
('West Tripura',      7, 20.0, 50, 0.84),
('West Tripura',      8, 17.0, 44, 0.80),
('West Tripura',      9, 13.5, 34, 0.70),
('West Tripura',     10, 6.2, 17, 0.44),
('West Tripura',     11, 1.4,  8, 0.24),
('West Tripura',     12, 0.5,  4, 0.14),
('Aizawl',            1, 0.6,  5, 0.16),
('Aizawl',            2, 1.4,  8, 0.22),
('Aizawl',            3, 3.2, 11, 0.32),
('Aizawl',            4, 7.5, 19, 0.48),
('Aizawl',            5, 12.5, 30, 0.64),
('Aizawl',            6, 16.5, 42, 0.78),
('Aizawl',            7, 17.8, 46, 0.80),
('Aizawl',            8, 15.0, 40, 0.76),
('Aizawl',            9, 12.0, 31, 0.64),
('Aizawl',           10, 5.6, 15, 0.42),
('Aizawl',           11, 1.5,  8, 0.22),
('Aizawl',           12, 0.4,  4, 0.12),
('Lower Subansiri',   1, 1.0,  6, 0.20),
('Lower Subansiri',   2, 2.2, 10, 0.26),
('Lower Subansiri',   3, 5.6, 16, 0.40),
('Lower Subansiri',   4, 11.0, 26, 0.58),
('Lower Subansiri',   5, 16.2, 40, 0.76),
('Lower Subansiri',   6, 21.0, 52, 0.86),
('Lower Subansiri',   7, 23.5, 60, 0.88),
('Lower Subansiri',   8, 19.0, 50, 0.82),
('Lower Subansiri',   9, 14.8, 38, 0.72),
('Lower Subansiri',  10, 7.0, 20, 0.46),
('Lower Subansiri',  11, 1.6,  9, 0.26),
('Lower Subansiri',  12, 0.6,  5, 0.14),
('Cachar',            1, 0.8,  5, 0.18),
('Cachar',            2, 2.0,  9, 0.24),
('Cachar',            3, 4.2, 13, 0.36),
('Cachar',            4, 8.5, 21, 0.50),
('Cachar',            5, 13.8, 32, 0.68),
('Cachar',            6, 17.5, 44, 0.80),
('Cachar',            7, 18.8, 48, 0.82),
('Cachar',            8, 16.0, 42, 0.78),
('Cachar',            9, 12.8, 33, 0.66),
('Cachar',           10, 6.0, 16, 0.42),
('Cachar',           11, 1.4,  8, 0.22),
('Cachar',           12, 0.5,  4, 0.12)
ON CONFLICT (district, month) DO NOTHING;

-- =====================================================================
-- Reversibility (down migration, for documentation / manual rollback):
--   DROP TABLE IF EXISTS monsoon_runs;
--   DROP TABLE IF EXISTS monsoon_forecasts;
--   DROP TABLE IF EXISTS monsoon_climatology;
-- =====================================================================