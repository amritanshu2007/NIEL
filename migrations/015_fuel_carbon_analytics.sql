-- =====================================================================
-- Migration: Fuel & Carbon Analytics (feature: fuel-carbon-analytics)
--
-- ADDITIVE ONLY. Adds the configurable parameter tables and the route
-- efficiency ledger required by the refined fuel-carbon spec:
--
--   vehicle_efficiency_profiles   vehicle-specific fuel/efficiency config
--   emission_factors              central, configurable emission factors
--   route_efficiency_records      baseline-vs-optimized savings ledger
--
-- Nothing here touches the existing routing engine. Optimized metrics come
-- from the existing /api/route/optimize pipeline; the baseline is a clearly
-- labelled great-circle reference (see comparisonService). Values adopted
-- from the standard NER logistics reference set and editable by admins.
--
-- Feature API:  /api/v1/features/fuel-carbon-analytics/{summary,routes,vehicles,report}
--
-- Run via:  node scripts/run-migrations.js
-- =====================================================================

CREATE TABLE IF NOT EXISTS vehicle_efficiency_profiles (
  id                BIGSERIAL PRIMARY KEY,
  profile_name      VARCHAR(100) NOT NULL UNIQUE,
  vehicle_type      VARCHAR(40)  NOT NULL,
  fuel_type         VARCHAR(20)  NOT NULL CHECK (fuel_type IN ('PETROL', 'DIESEL', 'CNG', 'ELECTRIC')),
  efficiency        NUMERIC(10, 3) NOT NULL CHECK (efficiency > 0),
  efficiency_unit   VARCHAR(20)  NOT NULL DEFAULT 'km_per_litre'
                    CHECK (efficiency_unit IN ('km_per_litre', 'km_per_kg', 'km_per_kwh')),
  fuel_price_per_unit NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fuel_price_per_unit >= 0),
  payload_factor    NUMERIC(4, 3) CHECK (payload_factor IS NULL OR (payload_factor > 0 AND payload_factor <= 1)),
  source            VARCHAR(100),
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vhp_fuel_type   ON vehicle_efficiency_profiles (fuel_type);
CREATE INDEX IF NOT EXISTS idx_vhp_vehicle_type ON vehicle_efficiency_profiles (vehicle_type);

DROP TRIGGER IF EXISTS trg_vehicle_efficiency_profiles_updated ON vehicle_efficiency_profiles;
CREATE TRIGGER trg_vehicle_efficiency_profiles_updated
  BEFORE UPDATE ON vehicle_efficiency_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS emission_factors (
  id              BIGSERIAL PRIMARY KEY,
  fuel_type       VARCHAR(20)  NOT NULL UNIQUE CHECK (fuel_type IN ('PETROL', 'DIESEL', 'CNG', 'ELECTRIC')),
  factor_type     VARCHAR(30)  NOT NULL CHECK (factor_type IN ('kg_co2_per_litre', 'kg_co2_per_kg', 'kg_co2_per_kwh')),
  factor_value    NUMERIC(10, 4) NOT NULL CHECK (factor_value >= 0),
  source          VARCHAR(150),
  effective_from  DATE         NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_emission_factors_updated ON emission_factors;
CREATE TRIGGER trg_emission_factors_updated
  BEFORE UPDATE ON emission_factors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS route_efficiency_records (
  id                    BIGSERIAL PRIMARY KEY,
  vehicle_id            BIGINT REFERENCES vehicles(id) ON DELETE SET NULL,
  profile_id            BIGINT REFERENCES vehicle_efficiency_profiles(id) ON DELETE SET NULL,
  calculated_by       BIGINT REFERENCES users(id) ON DELETE SET NULL,

  origin_name         VARCHAR(150),
  origin_lat          NUMERIC(10, 6),
  origin_lng          NUMERIC(10, 6),
  destination_name    VARCHAR(150),
  destination_lat     NUMERIC(10, 6),
  destination_lng     NUMERIC(10, 6),

  baseline_distance_km   NUMERIC(10, 2) NOT NULL CHECK (baseline_distance_km >= 0),
  baseline_duration_min  NUMERIC(10, 2) NOT NULL CHECK (baseline_duration_min >= 0),
  optimized_distance_km  NUMERIC(10, 2) NOT NULL CHECK (optimized_distance_km >= 0),
  optimized_duration_min NUMERIC(10, 2) NOT NULL CHECK (optimized_duration_min >= 0),
  optimized_source       VARCHAR(32),

  distance_saved_km  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  time_saved_min     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  distance_saved_pct NUMERIC(6, 3)  NOT NULL DEFAULT 0,
  time_saved_pct     NUMERIC(6, 3)  NOT NULL DEFAULT 0,

  baseline_fuel_units   NUMERIC(12, 4) NOT NULL DEFAULT 0,
  optimized_fuel_units  NUMERIC(12, 4) NOT NULL DEFAULT 0,
  fuel_unit             VARCHAR(12)    NOT NULL DEFAULT 'litres',
  fuel_saved_units      NUMERIC(12, 4) NOT NULL DEFAULT 0,
  fuel_saved_cost_inr   NUMERIC(14, 2) NOT NULL DEFAULT 0,

  baseline_co2_kg   NUMERIC(12, 4) NOT NULL DEFAULT 0,
  optimized_co2_kg  NUMERIC(12, 4) NOT NULL DEFAULT 0,
  co2_saved_kg      NUMERIC(12, 4) NOT NULL DEFAULT 0,
  co2_saved_pct     NUMERIC(6, 3)  NOT NULL DEFAULT 0,

  payload_factor    NUMERIC(4, 3),
  calculated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rer_vehicle    ON route_efficiency_records (vehicle_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rer_profile    ON route_efficiency_records (profile_id);
CREATE INDEX IF NOT EXISTS idx_rer_calculated ON route_efficiency_records (calculated_at);

-- =====================================================================
-- Seed: reference emission factors (standard NER logistics reference set).
-- Admin-editable: replacements never cascade - records store the snapshot.
-- =====================================================================
INSERT INTO emission_factors (fuel_type, factor_type, factor_value, source) VALUES
('PETROL',   'kg_co2_per_litre', 2.3100, 'Diesel/Petrol road CO2 reference (liquids, kg CO2 per litre)'),
('DIESEL',   'kg_co2_per_litre', 2.6800, 'Diesel/Petrol road CO2 reference (liquids, kg CO2 per litre)'),
('CNG',      'kg_co2_per_kg',    1.9600, 'CNG combustion reference (kg CO2 per kg CNG)'),
('ELECTRIC', 'kg_co2_per_kwh',   0.8200, 'India national grid emission factor (kg CO2 per kWh, e-grid 2022)')
ON CONFLICT (fuel_type) DO NOTHING;

-- =====================================================================
-- Seed: reference vehicle efficiency profiles (editable, additively extended).
-- =====================================================================
INSERT INTO vehicle_efficiency_profiles
  (profile_name, vehicle_type, fuel_type, efficiency, efficiency_unit, fuel_price_per_unit, payload_factor, source)
VALUES
('Truck Light Diesel',   'Truck_Light',   'DIESEL',   8.00, 'km_per_litre', 92.00, 0.6,  'NER logistics reference set'),
('Truck Heavy Diesel',   'Truck_Heavy',   'DIESEL',   4.50, 'km_per_litre', 92.00, 1.0,  'NER logistics reference set'),
('Utility Petrol',       'Utility_Vehicle','PETROL', 10.50, 'km_per_litre', 102.00, 0.4, 'NER logistics reference set'),
('Pickup CNG',           'Pickup',        'CNG',     14.00, 'km_per_kg',    66.00, 0.4,  'NER logistics reference set'),
('EV Cargo Eicher',   'Cargo_EV',      'ELECTRIC', 6.00, 'km_per_kwh',   8.50,  0.5,  'NER logistics reference set'),
('Pickup Petrol Base',   'Pickup',        'PETROL',  13.00, 'km_per_litre', 102.00, 0.4,  'NER logistics reference set'),
('Van CNG',              'Van',           'CNG',     15.50, 'km_per_kg',    66.00, 0.35, 'NER logistics reference set')
ON CONFLICT (profile_name) DO NOTHING;

-- =====================================================================
-- Reversibility (down migration, for documentation / manual rollback):
--   DROP TABLE IF EXISTS route_efficiency_records;
--   DROP TABLE IF EXISTS emission_factors;
--   DROP TABLE IF EXISTS vehicle_efficiency_profiles;
-- =====================================================================