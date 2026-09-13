-- =====================================================================
-- Migration: vehicles table (Logistics & Vehicle Tracking)
--
-- Run via:   npm run db:migrate
--
-- Simplified like 001_create_users.sql / 002_create_incidents.sql:
-- no DO blocks. Uses CHECK constraints for cargo_type and status (as
-- required). Depends on the set_updated_at() helper from
-- 001_create_tables.sql. Vehicles may already exist from that migration,
-- so every statement is idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS vehicles (
  id               BIGSERIAL PRIMARY KEY,
  vehicle_number   VARCHAR(50)  NOT NULL UNIQUE,
  driver_name      VARCHAR(100) NOT NULL,
  phone            VARCHAR(20)  NOT NULL,
  cargo_type       VARCHAR(20)  NOT NULL
                   CHECK (cargo_type IN ('Medicine', 'Food', 'Construction', 'Agriculture')),
  current_location GEOMETRY(Point, 4326) NOT NULL,
  destination      VARCHAR(200) NOT NULL,
  status           VARCHAR(20)  NOT NULL DEFAULT 'IN_TRANSIT'
                   CHECK (status IN ('IN_TRANSIT', 'DELIVERED', 'DELAYED')),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_location ON vehicles USING GIST (current_location);
CREATE INDEX IF NOT EXISTS idx_vehicles_status   ON vehicles (status);
CREATE INDEX IF NOT EXISTS idx_vehicles_cargo    ON vehicles (cargo_type);

-- Keep updated_at fresh on UPDATE (idempotent; helper exists from 001)
DROP TRIGGER IF EXISTS trg_vehicles_updated ON vehicles;
CREATE TRIGGER trg_vehicles_updated
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();