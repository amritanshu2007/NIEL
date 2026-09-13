-- =====================================================================
-- Migration: Fuel & Carbon Analytics (feature: fuel-carbon-analytics)
--
-- ADDITIVE ONLY. Adds fuel-consumption records, trip records and rolled-up
-- carbon aggregates for the vehicle fleet. Carbon intensity is computed in
-- the service layer using transparent emission factors (diesel/petrol/CNG/EV);
-- this schema only stores the observable inputs and the computed outputs.
--
-- Feature API:  /api/v1/features/fuel-carbon/...
--
-- Run via:  node scripts/run-migrations.js
-- =====================================================================

CREATE TABLE IF NOT EXISTS fuel_records (
  id                BIGSERIAL PRIMARY KEY,
  vehicle_id        BIGINT       NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  district          VARCHAR(100),
  fuel_type         VARCHAR(20)  NOT NULL DEFAULT 'diesel'
                    CHECK (fuel_type IN ('diesel', 'petrol', 'cng', 'ev')),
  fuel_litres       NUMERIC(10, 2) NOT NULL CHECK (fuel_litres >= 0),
  trip_distance_km  NUMERIC(10, 2) CHECK (trip_distance_km >= 0),
  odometer_km       NUMERIC(10, 2) CHECK (odometer_km >= 0),
  cost_inr          NUMERIC(12, 2) CHECK (cost_inr >= 0),
  recorded_by       BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  recorded_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fuel_records_vehicle ON fuel_records (vehicle_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_fuel_records_fueltype ON fuel_records (fuel_type);
CREATE INDEX IF NOT EXISTS idx_fuel_records_recorded ON fuel_records (recorded_at);

CREATE TABLE IF NOT EXISTS trip_records (
  id                BIGSERIAL PRIMARY KEY,
  vehicle_id        BIGINT       REFERENCES vehicles(id) ON DELETE CASCADE,
  origin            VARCHAR(150),
  destination       VARCHAR(150),
  distance_km       NUMERIC(10, 2) NOT NULL CHECK (distance_km >= 0),
  duration_min      NUMERIC(10, 2) CHECK (duration_min >= 0),
  cargo_tons        NUMERIC(10, 2) CHECK (cargo_tons >= 0),
  co2e_kg           NUMERIC(10, 2) NOT NULL DEFAULT 0,
  fuel_litres_est   NUMERIC(10, 2) DEFAULT 0,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_records_vehicle ON trip_records (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_trip_records_created ON trip_records (created_at);

CREATE TABLE IF NOT EXISTS carbon_aggregates (
  id                  BIGSERIAL PRIMARY KEY,
  period_key          VARCHAR(10)   NOT NULL CHECK (period_key IN ('daily', 'monthly')),
  period_start        TIMESTAMPTZ   NOT NULL,
  district            VARCHAR(100),
  fleet_km            NUMERIC(12, 2) NOT NULL DEFAULT 0,
  fleet_fuel_litres   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  fleet_co2e_kg       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  avg_km_per_litre    NUMERIC(8, 2),
  intensity_kg_per_km NUMERIC(10, 4),
  vehicle_count       INTEGER       NOT NULL DEFAULT 0,
  computed_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (period_key, period_start, district)
);

CREATE INDEX IF NOT EXISTS idx_carbon_aggregates_period ON carbon_aggregates (period_key, period_start);
CREATE INDEX IF NOT EXISTS idx_carbon_aggregates_district ON carbon_aggregates (district);

-- =====================================================================
-- Reversibility (down migration, for documentation / manual rollback):
--   DROP TABLE IF EXISTS carbon_aggregates;
--   DROP TABLE IF EXISTS trip_records;
--   DROP TABLE IF EXISTS fuel_records;
-- =====================================================================