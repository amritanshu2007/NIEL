-- =====================================================================
-- Migration: Multimodal Logistics (feature: multimodal-logistics)
--
-- ADDITIVE ONLY. Adds non-road transport networks (rail / air / inland
-- water) as LineStrings with their terminal/transfer points, plus a
-- shipment-plans ledger that records every plan produced by the modal
-- route-graph planner. Complements (does not replace) the existing road
-- network / Dijkstra routing.
--
-- Feature API:  /api/v1/features/multimodal/...
--
-- Run via:  node scripts/run-migrations.js
-- =====================================================================

CREATE TABLE IF NOT EXISTS mode_networks (
  id           BIGSERIAL PRIMARY KEY,
  mode         VARCHAR(10)   NOT NULL CHECK (mode IN ('road', 'rail', 'air', 'water')),
  network_name VARCHAR(150)  NOT NULL,
  district     VARCHAR(100),
  geometry     GEOMETRY(LineString, 4326) NOT NULL,
  status       VARCHAR(20)   NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'LIMITED', 'CLOSED')),
  attributes   JSONB,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mode_networks_geom ON mode_networks USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_mode_networks_mode ON mode_networks (mode);

CREATE TABLE IF NOT EXISTS mode_terminals (
  id             BIGSERIAL PRIMARY KEY,
  mode           VARCHAR(10)  NOT NULL CHECK (mode IN ('road', 'rail', 'air', 'water')),
  terminal_name  VARCHAR(150) NOT NULL,
  district       VARCHAR(100),
  location       GEOMETRY(Point, 4326) NOT NULL,
  serving_cities TEXT[],
  status         VARCHAR(20)  NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'LIMITED', 'CLOSED')),
  attributes     JSONB,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mode_terminals_location ON mode_terminals USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_mode_terminals_mode     ON mode_terminals (mode);

CREATE TABLE IF NOT EXISTS shipment_plans (
  id                   BIGSERIAL PRIMARY KEY,
  created_by           BIGINT REFERENCES users(id) ON DELETE SET NULL,
  origin_name          VARCHAR(150),
  origin_lng           NUMERIC(10, 6),
  origin_lat           NUMERIC(10, 6),
  destination_name     VARCHAR(150),
  destination_lng      NUMERIC(10, 6),
  destination_lat      NUMERIC(10, 6),
  cargo_type           VARCHAR(20),
  selected_profile     VARCHAR(60),
  total_distance_km    NUMERIC(10, 2),
  total_duration_min   NUMERIC(10, 2),
  estimated_cost_inr   NUMERIC(12, 2),
  co2e_kg              NUMERIC(10, 2),
  plan_data            JSONB,
  engine_source        VARCHAR(32) NOT NULL DEFAULT 'multimodal-routegraph',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipment_plans_user    ON shipment_plans (created_by);
CREATE INDEX IF NOT EXISTS idx_shipment_plans_created ON shipment_plans (created_at DESC);

-- =====================================================================
-- Seed: NER multimodal network (rail / air / water) + transfer terminals.
-- Coordinates are consistent with the seeded road corridor endpoints so
-- the modal route-graph can connect road <-> rail <-> air <-> water legs.
-- =====================================================================

-- ----- Rail corridors (broad-gauge / freight main lines) -----
INSERT INTO mode_networks (mode, network_name, district, geometry) VALUES
('rail', 'Guwahati - Jorhat Freight Main Line', 'Kamrup',
 ST_SetSRID(ST_GeomFromText('LINESTRING(91.7400 26.1800, 91.8200 26.2900, 92.1200 26.3400, 92.6800 26.3500, 93.2000 26.5200, 93.6100 26.6300, 94.2100 26.7500)'), 4326)),
('rail', 'Lumding - Silchar Hill Section', 'Hojai',
 ST_SetSRID(ST_GeomFromText('LINESTRING(93.1500 25.4500, 93.0100 25.3200, 92.8700 25.1200, 92.7900 24.8300)'), 4326)),
('rail', 'Silchar - Aizawl Fast-Gauge Link', 'Cachar',
 ST_SetSRID(ST_GeomFromText('LINESTRING(92.7900 24.8300, 92.7200 24.4200, 92.6600 24.0000, 92.7176 23.7271)'), 4326)),
('rail', 'Dharmanagar - Agartala Trunk', 'Dhalai',
 ST_SetSRID(ST_GeomFromText('LINESTRING(92.1600 24.3200, 92.0400 24.1000, 91.8300 23.9200, 91.7400 23.8400, 91.2868 23.8315)'), 4326));

-- ----- Air corridors (scheduled freight/passenger connexions) -----
INSERT INTO mode_networks (mode, network_name, district, geometry) VALUES
('air', 'Guwahati - Dibrugarh Air Corridor', 'Kamrup',
 ST_SetSRID(ST_GeomFromText('LINESTRING(91.7400 26.1900, 93.2000 26.9000, 95.0000 27.4800)'), 4326)),
('air', 'Guwahati - Imphal Air Corridor', 'Kamrup',
 ST_SetSRID(ST_GeomFromText('LINESTRING(91.7400 26.1900, 92.7000 25.6000, 93.9000 24.7600)'), 4326)),
('air', 'Guwahati - Agartala Air Corridor', 'Kamrup',
 ST_SetSRID(ST_GeomFromText('LINESTRING(91.7400 26.1900, 91.2400 23.8900)'), 4326)),
('air', 'Guwahati - Aizawl (Lengpui) Air Corridor', 'Kamrup',
 ST_SetSRID(ST_GeomFromText('LINESTRING(91.7400 26.1900, 92.6200 23.8400)'), 4326)),
('air', 'Guwahati - Silchar Air Corridor', 'Kamrup',
 ST_SetSRID(ST_GeomFromText('LINESTRING(91.7400 26.1900, 92.9800 24.9100)'), 4326)),
('air', 'Guwahati - Dimapur Air Corridor', 'Kamrup',
 ST_SetSRID(ST_GeomFromText('LINESTRING(91.7400 26.1900, 93.7400 25.8800)'), 4326)),
('air', 'Guwahati - Shillong (Umroi) Air Corridor', 'Kamrup',
 ST_SetSRID(ST_GeomFromText('LINESTRING(91.7400 26.1900, 91.9700 25.6700)'), 4326));

-- ----- Inland waterways (National Waterway-2 / Barak river system) -----
INSERT INTO mode_networks (mode, network_name, district, geometry) VALUES
('water', 'Brahmaputra National Waterway-2', 'Dhubri',
 ST_SetSRID(ST_GeomFromText('LINESTRING(89.9800 26.0200, 90.6000 26.1000, 91.3000 26.1600, 91.7400 26.1800, 92.4000 26.3600, 92.7900 26.6300, 94.3000 27.0800, 95.0000 27.4700)'), 4326)),
('water', 'Barak River Waterway (Badarpur - Silchar Reach)', 'Cachar',
 ST_SetSRID(ST_GeomFromText('LINESTRING(92.3500 24.8700, 92.5000 24.8600, 92.7000 24.8500, 92.7900 24.8300)'), 4326));

-- ----- Air terminals (airports) -----
INSERT INTO mode_terminals (mode, terminal_name, district, location, serving_cities) VALUES
('air', 'Guwahati International Airport (GAU)', 'Kamrup',
 ST_SetSRID(ST_Point(91.7400, 26.1900), 4326), ARRAY['Guwahati', 'Assam']),
('air', 'Dibrugarh Airport - Mohanbari', 'Dibrugarh',
 ST_SetSRID(ST_Point(95.0000, 27.4800), 4326), ARRAY['Dibrugarh', 'Tinsukia']),
('air', 'Imphal International Airport', 'Imphal East',
 ST_SetSRID(ST_Point(93.9000, 24.7600), 4326), ARRAY['Imphal', 'Manipur']),
('air', 'Agartala Airport (IXA)', 'West Tripura',
 ST_SetSRID(ST_Point(91.2400, 23.8900), 4326), ARRAY['Agartala', 'Tripura']),
('air', 'Lengpui Airport (Aizawl)', 'Aizawl',
 ST_SetSRID(ST_Point(92.6200, 23.8400), 4326), ARRAY['Aizawl', 'Mizoram']),
('air', 'Silchar Airport (IXS)', 'Cachar',
 ST_SetSRID(ST_Point(92.9800, 24.9100), 4326), ARRAY['Silchar', 'Barak Valley']),
('air', 'Dimapur Airport', 'Dimapur',
 ST_SetSRID(ST_Point(93.7400, 25.8800), 4326), ARRAY['Dimapur', 'Nagaland']),
('air', 'Umroi Airport (Shillong)', 'Ri Bhoi',
 ST_SetSRID(ST_Point(91.9700, 25.6700), 4326), ARRAY['Shillong', 'Meghalaya']);

-- ----- Water terminals (inland ports / river jetties) -----
INSERT INTO mode_terminals (mode, terminal_name, district, location, serving_cities) VALUES
('water', 'Dhubri Inland River Port', 'Dhubri',
 ST_SetSRID(ST_Point(89.9800, 26.0200), 4326), ARRAY['Dhubri', 'Kokrajhar']),
('water', 'Pandu Inland Port (Guwahati)', 'Kamrup',
 ST_SetSRID(ST_Point(91.7400, 26.1800), 4326), ARRAY['Guwahati']),
('water', 'Tezpur River Jetty', 'Sonitpur',
 ST_SetSRID(ST_Point(92.7900, 26.6300), 4326), ARRAY['Tezpur']),
('water', 'Dibrugarh River Port', 'Dibrugarh',
 ST_SetSRID(ST_Point(95.0000, 27.4700), 4326), ARRAY['Dibrugarh']),
('water', 'Karimganj Land Customs Terminal', 'Karimganj',
 ST_SetSRID(ST_Point(92.3500, 24.8700), 4326), ARRAY['Karimganj', 'Sylhet (BD)']),
('water', 'Badarpurghat Jetty (Silchar)', 'Cachar',
 ST_SetSRID(ST_Point(92.7900, 24.8300), 4326), ARRAY['Silchar', 'Badarpur']);

-- ----- Rail terminals (junctions / goods sheds) -----
INSERT INTO mode_terminals (mode, terminal_name, district, location, serving_cities) VALUES
('rail', 'Guwahati Railway Junction', 'Kamrup',
 ST_SetSRID(ST_Point(91.7400, 26.1800), 4326), ARRAY['Guwahati', 'Northeast freight hub']),
('rail', 'Lumding Railway Junction', 'Hojai',
 ST_SetSRID(ST_Point(93.1500, 25.4500), 4326), ARRAY['Lumding', 'Hill section gateway']),
('rail', 'Jorhat Town Railway Station', 'Jorhat',
 ST_SetSRID(ST_Point(94.2100, 26.7500), 4326), ARRAY['Jorhat']),
('rail', 'Silchar Railway Station', 'Cachar',
 ST_SetSRID(ST_Point(92.7900, 24.8300), 4326), ARRAY['Silchar', 'Barak Valley']),
('rail', 'Agartala Railway Station', 'West Tripura',
 ST_SetSRID(ST_Point(91.2868, 23.8315), 4326), ARRAY['Agartala']),
('rail', 'Dharmanagar Railway Station', 'North Tripura',
 ST_SetSRID(ST_Point(92.1600, 24.3200), 4326), ARRAY['Dharmanagar', 'Kailashahar']),
('rail', 'Dibrugarh Railway Station', 'Dibrugarh',
 ST_SetSRID(ST_Point(95.0000, 27.4800), 4326), ARRAY['Dibrugarh', 'Tinsukia']);

-- =====================================================================
-- Reversibility (down migration, for documentation / manual rollback):
--   DROP TABLE IF EXISTS shipment_plans;
--   DROP TABLE IF EXISTS mode_terminals;
--   DROP TABLE IF EXISTS mode_networks;
-- =====================================================================