-- =====================================================================
-- Migration: Automated meteorological monitoring support
--
-- Adds the monitoring/audit tables required by the weather monitor
-- service (src/services/weatherMonitor.js):
--   - district_monitoring : per-district weather sampling points
--     (centroid + bounding box) derived from the road network, so the
--     poller can translate district rainfall into road impact zones.
--   - road_status_history : immutable audit trail of every automated
--     (and manual) road:status transition, including the triggering
--     rainfall intensity whenever applicable.
--
-- Run via:  node scripts/run-migrations.js
-- =====================================================================

-- ---------------------------------------------------------------------
-- district_monitoring : centroid / bbox sampling geometry per district
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS district_monitoring (
  district        VARCHAR(100) PRIMARY KEY,
  centroid        GEOMETRY(Point, 4326) NOT NULL,
  bounding_box    GEOMETRY(Polygon, 4326),
  active          BOOLEAN      NOT NULL DEFAULT TRUE,
  last_observed_at TIMESTAMPTZ,
  last_rainfall_mmh NUMERIC(8, 2),
  last_forecast_mmh NUMERIC(8, 2),
  last_source     VARCHAR(32),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_district_monitoring_centroid
  ON district_monitoring USING GIST (centroid);
CREATE INDEX IF NOT EXISTS idx_district_monitoring_active
  ON district_monitoring (active);

-- ---------------------------------------------------------------------
-- road_status_history : immutable audit log of status transitions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS road_status_history (
  id              BIGSERIAL PRIMARY KEY,
  road_id         BIGINT       NOT NULL REFERENCES roads(id) ON DELETE CASCADE,
  previous_status road_status  NOT NULL,
  new_status      road_status  NOT NULL,
  change_reason   TEXT,
  source          VARCHAR(50)  NOT NULL DEFAULT 'weather',
  rainfall_mmh    NUMERIC(8, 2),
  changed_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_road_status_history_road
  ON road_status_history (road_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_road_status_history_source
  ON road_status_history (source);

-- ---------------------------------------------------------------------
-- Seed monitoring districts from every district present in `roads`.
-- Centroid = geometric center of all road corridors in the district;
-- bounding_box = MBR envelope (Polygon) when the envelope is 2-D.
-- New districts added later are picked up by the monitor at runtime
-- (ON CONFLICT DO NOTHING keeps this idempotent).
-- ---------------------------------------------------------------------
INSERT INTO district_monitoring (district, centroid, bounding_box, active)
SELECT r.district,
       ST_SetSRID(ST_Centroid(ST_Collect(r.geom)), 4326),
       CASE
         WHEN GeometryType(ST_Envelope(ST_Collect(r.geom))) = 'POLYGON'
         THEN ST_Envelope(ST_Collect(r.geom))
         ELSE NULL
       END,
       TRUE
  FROM roads r
 GROUP BY r.district
ON CONFLICT (district) DO NOTHING;