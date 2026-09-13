-- =====================================================================
-- Migration: Initial schema for NER Smart Logistics & Accessibility
-- Intelligence Platform
--
-- Requirements:
--   - PostgreSQL with PostGIS extension installed
--   - Run:  psql -U postgres -d ner_logistics -f migrations/001_create_tables.sql
--
-- Assumes a database has already been created:
--   CREATE DATABASE ner_logistics;
--   CREATE EXTENSION IF NOT EXISTS postgis;  (or uncomment below)
-- =====================================================================

-- Ensure required extensions are available (run once per database)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- Optional lookup enums
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('admin', 'field_officer', 'transporter');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'road_status') THEN
    CREATE TYPE road_status AS ENUM ('OPEN', 'RISKY', 'BLOCKED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cargo_type') THEN
    CREATE TYPE cargo_type AS ENUM ('Medicine', 'Food', 'Construction', 'Agriculture');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vehicle_status') THEN
    CREATE TYPE vehicle_status AS ENUM ('IN_TRANSIT', 'DELIVERED', 'DELAYED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_type') THEN
    CREATE TYPE incident_type AS ENUM ('Landslide', 'Flood', 'Bridge_Damage', 'Road_Block');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'severity_level') THEN
    CREATE TYPE severity_level AS ENUM ('High', 'Medium', 'Low');
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  name          VARCHAR(100)        NOT NULL,
  email         VARCHAR(255)        NOT NULL UNIQUE,
  password      VARCHAR(255)        NOT NULL,
  role          user_role           NOT NULL DEFAULT 'transporter',
  district      VARCHAR(100)        NOT NULL,
  created_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- roads  (LineString geometries, SRID 4326 = WGS84 lat/lon)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roads (
  id            BIGSERIAL PRIMARY KEY,
  road_name     VARCHAR(150)        NOT NULL,
  district      VARCHAR(100)        NOT NULL,
  geom          GEOMETRY(LineString, 4326) NOT NULL,
  status        road_status         NOT NULL DEFAULT 'OPEN',
  updated_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roads_geom       ON roads USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_roads_district   ON roads (district);
CREATE INDEX IF NOT EXISTS idx_roads_status     ON roads (status);

-- ---------------------------------------------------------------------
-- vehicles
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
  id                BIGSERIAL PRIMARY KEY,
  vehicle_number    VARCHAR(50)         NOT NULL UNIQUE,
  driver_name       VARCHAR(100)        NOT NULL,
  phone             VARCHAR(20)         NOT NULL,
  cargo_type        cargo_type          NOT NULL,
  current_location  GEOMETRY(Point, 4326) NOT NULL,
  destination       VARCHAR(200)        NOT NULL,
  status            vehicle_status      NOT NULL DEFAULT 'IN_TRANSIT',
  created_at        TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_location ON vehicles USING GIST (current_location);
CREATE INDEX IF NOT EXISTS idx_vehicles_status   ON vehicles (status);
CREATE INDEX IF NOT EXISTS idx_vehicles_cargo    ON vehicles (cargo_type);

-- ---------------------------------------------------------------------
-- incidents
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incidents (
  id                  BIGSERIAL PRIMARY KEY,
  reported_by_user_id BIGINT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location            GEOMETRY(Point, 4326) NOT NULL,
  incident_type       incident_type   NOT NULL,
  photo_url           TEXT,
  severity            severity_level  NOT NULL DEFAULT 'Medium',
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_location ON incidents USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_incidents_type     ON incidents (incident_type);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents (severity);
CREATE INDEX IF NOT EXISTS idx_incidents_auth     ON incidents (reported_by_user_id);

-- ---------------------------------------------------------------------
-- Convenience trigger: keep updated_at fresh
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_roads_updated ON roads;
CREATE TRIGGER trg_roads_updated
  BEFORE UPDATE ON roads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_vehicles_updated ON vehicles;
CREATE TRIGGER trg_vehicles_updated
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();