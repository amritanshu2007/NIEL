-- =====================================================================
-- Migration: Multimodal Logistics - Transport Graph (feature: multimodal-logistics)
--
-- ADDITIVE ONLY. Implements the refined multimodal-logistics spec:
-- a modal transport graph of transfer-capable nodes (road junctions,
-- warehouses, relief centres, river ports, helipads, drone waypoints)
-- joined by directed transport edges labelled by transport mode:
--   ROAD | DRONE | HELICOPTER | RIVER
--
-- ROAD legs of live route requests are still computed by the EXISTING
-- Dijkstra road engine (src/services/routingService.js). The transport
-- graph adds the non-road modes plus declared connector/capacity and
-- accessibility metadata on top of that engine. ST_ geometry columns are
-- generated from latitude / longitude for easy map rendering.
--
-- Feature API:  /api/v1/features/multimodal-logistics/{nodes,edges,routes}
--
-- Run via:  node scripts/run-migrations.js
-- =====================================================================

CREATE TABLE IF NOT EXISTS transport_nodes (
  id                  BIGSERIAL PRIMARY KEY,
  name                VARCHAR(150) NOT NULL,
  node_type           VARCHAR(20)  NOT NULL CHECK (node_type IN (
                        'DRONE_WAYPOINT', 'HELIPAD', 'RIVER_PORT',
                        'ROAD_JUNCTION', 'WAREHOUSE', 'RELIEF_CENTER')),
  latitude            NUMERIC(10, 6) NOT NULL,
  longitude           NUMERIC(10, 6) NOT NULL,
  geom                GEOMETRY(Point, 4326) GENERATED ALWAYS AS (
                        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED,
  capacity            INTEGER      NOT NULL DEFAULT 100 CHECK (capacity >= 0),
  operational_status  VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE' CHECK (operational_status IN (
                        'ACTIVE', 'INACTIVE', 'MAINTENANCE')),
  metadata            JSONB,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transport_nodes_geom    ON transport_nodes USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_transport_nodes_type    ON transport_nodes (node_type);
CREATE INDEX IF NOT EXISTS idx_transport_nodes_status  ON transport_nodes (operational_status);

DROP TRIGGER IF EXISTS trg_transport_nodes_updated ON transport_nodes;
CREATE TRIGGER trg_transport_nodes_updated
  BEFORE UPDATE ON transport_nodes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS transport_edges (
  id                   BIGSERIAL PRIMARY KEY,
  from_node_id         BIGINT NOT NULL REFERENCES transport_nodes(id) ON DELETE CASCADE,
  to_node_id           BIGINT NOT NULL REFERENCES transport_nodes(id) ON DELETE CASCADE,
  mode                 VARCHAR(12) NOT NULL CHECK (mode IN ('ROAD', 'DRONE', 'HELICOPTER', 'RIVER')),
  distance_km          NUMERIC(10, 2) NOT NULL CHECK (distance_km > 0),
  estimated_time_min   NUMERIC(10, 2) NOT NULL CHECK (estimated_time_min > 0),
  estimated_cost_inr   NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (estimated_cost_inr >= 0),
  capacity             INTEGER      NOT NULL DEFAULT 100 CHECK (capacity >= 0),
  accessibility_status VARCHAR(20)  NOT NULL DEFAULT 'OPEN' CHECK (accessibility_status IN (
                        'OPEN', 'BLOCKED', 'RESTRICTED')),
  risk_score           NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 1),
  metadata             JSONB,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (from_node_id <> to_node_id)
);

CREATE INDEX IF NOT EXISTS idx_transport_edges_from  ON transport_edges (from_node_id);
CREATE INDEX IF NOT EXISTS idx_transport_edges_to    ON transport_edges (to_node_id);
CREATE INDEX IF NOT EXISTS idx_transport_edges_mode  ON transport_edges (mode);
CREATE INDEX IF NOT EXISTS idx_transport_edges_status ON transport_edges (accessibility_status);

DROP TRIGGER IF EXISTS trg_transport_edges_updated ON transport_edges;
CREATE TRIGGER trg_transport_edges_updated
  BEFORE UPDATE ON transport_edges
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- Seed: NER transport graph (initial fixture layer, editable by admins).
-- Node ids are deterministic on a fresh migration from 1..34. Edges are
-- seeded in that id space so the admin map / route planner has a working
-- multimodal overlay out of the box.
-- =====================================================================

INSERT INTO transport_nodes (name, node_type, latitude, longitude, capacity, operational_status, metadata) VALUES
-- Warehouses
('Guwahati Gate Warehouse',          'WAREHOUSE',     26.144500, 91.736200, 2000, 'ACTIVE',    '{"state":"AS"}'::jsonb),
('Dibrugarh Relief Depot',           'WAREHOUSE',     27.472000, 94.905000, 1200, 'ACTIVE',    '{"state":"AS"}'::jsonb),
-- Relief centres
('Guwahati Relief Hub',              'RELIEF_CENTER', 26.106000, 91.586000, 800,  'ACTIVE',    '{"state":"AS"}'::jsonb),
('Shillong Relief Shed',             'RELIEF_CENTER', 25.578800, 91.893300, 400,  'ACTIVE',    '{"state":"ML"}'::jsonb),
('Silchar Relief Centre',            'RELIEF_CENTER', 24.827300, 92.797600, 450,  'ACTIVE',    '{"state":"AS"}'::jsonb),
('Dibrugarh Relief Centre',          'RELIEF_CENTER', 27.472800, 94.912000, 500,  'ACTIVE',    '{"state":"AS"}'::jsonb),
('Agartala Relief Centre',           'RELIEF_CENTER', 23.831500, 91.286800, 450,  'ACTIVE',    '{"state":"TR"}'::jsonb),
('Imphal Relief Centre',             'RELIEF_CENTER', 24.817000, 93.936800, 500,  'ACTIVE',    '{"state":"MN"}'::jsonb),
('Aizawl Relief Centre',             'RELIEF_CENTER', 23.730500, 92.717300, 400,  'ACTIVE',    '{"state":"MZ"}'::jsonb),
('Kohima Relief Centre',             'RELIEF_CENTER', 25.659200, 94.105000, 350,  'ACTIVE',    '{"state":"NL"}'::jsonb),
('Dimapur Relief Centre',            'RELIEF_CENTER', 25.911700, 93.721500, 400,  'ACTIVE',    '{"state":"NL"}'::jsonb),
('Tawang Relief Shed',               'RELIEF_CENTER', 27.580000, 91.870000, 200,  'ACTIVE',    '{"state":"AR"}'::jsonb),
('Bomdila Relief Shed',              'RELIEF_CENTER', 27.264300, 92.422300, 250,  'ACTIVE',    '{"state":"AR"}'::jsonb),
('Ziro Relief Shed',                 'RELIEF_CENTER', 27.556000, 93.827000, 200,  'ACTIVE',    '{"state":"AR"}'::jsonb),
('Champhai Relief Shed',             'RELIEF_CENTER', 23.456300, 93.329400, 200,  'ACTIVE',    '{"state":"MZ"}'::jsonb),
-- River ports
('Pandu Inland Port (Guwahati)',     'RIVER_PORT',    26.177000, 91.750000, 1500, 'ACTIVE',    '{"waterway":"Brahmaputra NW-2"}'::jsonb),
('Dhubri River Port',                'RIVER_PORT',    26.022300, 89.989300, 900,  'ACTIVE',    '{"waterway":"Brahmaputra NW-2"}'::jsonb),
('Dibrugarh River Port',             'RIVER_PORT',    27.462000, 94.890000, 900,  'ACTIVE',    '{"waterway":"Brahmaputra NW-2"}'::jsonb),
('Silchar Barak Jetty',              'RIVER_PORT',    24.819000, 92.801000, 500,  'ACTIVE',    '{"waterway":"Barak"}'::jsonb),
('Goalpara River Ghat',              'RIVER_PORT',    26.176800, 90.625900, 400,  'ACTIVE',    '{"waterway":"Brahmaputra NW-2"}'::jsonb),
-- Helipads
('Guwahati Helipad',                 'HELIPAD',       26.106000, 91.586000, 600,  'ACTIVE',    '{"type":"city"}'::jsonb),
('Tawang Helipad',                   'HELIPAD',       27.586100, 91.859400, 250,  'ACTIVE',    '{"type":"mountain"}'::jsonb),
('Kohima Helipad',                   'HELIPAD',       25.659200, 94.105000, 300,  'ACTIVE',    '{"type":"city"}'::jsonb),
('Aizawl Helipad',                   'HELIPAD',       23.730500, 92.717300, 250,  'ACTIVE',    '{"type":"city"}'::jsonb),
('Agartala Helipad',                 'HELIPAD',       23.831500, 91.286800, 300,  'ACTIVE',    '{"type":"city"}'::jsonb),
('Imphal Helipad',                   'HELIPAD',       24.817000, 93.936800, 300,  'ACTIVE',    '{"type":"city"}'::jsonb),
('Shillong Helipad',                 'HELIPAD',       25.578800, 91.893300, 250,  'ACTIVE',    '{"type":"city"}'::jsonb),
-- Drone waypoints
('Bomdila Drone Hub',                'DRONE_WAYPOINT',27.264300, 92.422300, 200,  'ACTIVE',    '{"payload_kg":50}'::jsonb),
('Tawang Drone Dropsite',            'DRONE_WAYPOINT',27.560000, 91.870000, 120,  'ACTIVE',    '{"payload_kg":40}'::jsonb),
('Ziro Drone Waypoint',              'DRONE_WAYPOINT',27.556000, 93.827000, 120,  'ACTIVE',    '{"payload_kg":40}'::jsonb),
('Champhai Drone Waypoint',          'DRONE_WAYPOINT',23.456300, 93.329400, 120,  'ACTIVE',    '{"payload_kg":40}'::jsonb),
('Nagaon Drone Relay',               'DRONE_WAYPOINT',26.346500, 92.684300, 150,  'ACTIVE',    '{"payload_kg":50}'::jsonb),
-- Road junctions
('Nagaon Road Junction',             'ROAD_JUNCTION', 26.346500, 92.684300, 400,  'ACTIVE',    '{"nh":"NH-27"}'::jsonb),
('Silchar Road Junction',            'ROAD_JUNCTION', 24.827300, 92.797600, 300,  'ACTIVE',    '{"nh":"NH-37"}'::jsonb);

INSERT INTO transport_edges (from_node_id, to_node_id, mode, distance_km, estimated_time_min, estimated_cost_inr, capacity, accessibility_status, risk_score, metadata) VALUES
-- ---- ROAD connectors (within-city / feeder legs) ----
(1,  3, 'ROAD', 8.0,   20,  120,   1500, 'OPEN',     0.05, '{"road":"city feeder"}'::jsonb),
(1, 16, 'ROAD', 6.0,   15,   90,   2000, 'OPEN',     0.05, '{"road":"Pandu road"}'::jsonb),
(3, 21, 'ROAD', 1.0,    4,   20,    800, 'OPEN',     0.02, '{"road":"helipad access"}'::jsonb),
(16,3, 'ROAD', 10.0,   25,  150,   1000, 'OPEN',     0.08, '{"road":"city feeder"}'::jsonb),
(2, 18, 'ROAD', 4.0,   10,   60,   1200, 'OPEN',     0.04, '{"road":"port road"}'::jsonb),
(2,  6, 'ROAD', 10.0,  22,  160,   1200, 'OPEN',     0.06, '{"road":"district road"}'::jsonb),
(1, 33, 'ROAD', 118.0, 150, 1800,   1400, 'OPEN',     0.18, '{"road":"NH-27"}'::jsonb),
(33,32, 'ROAD', 1.0,    3,   20,    400, 'OPEN',     0.03, '{"road":"relay access"}'::jsonb),
(34,19, 'ROAD', 2.0,    6,   30,    500, 'OPEN',     0.02, '{"road":"jetty road"}'::jsonb),
(34, 5, 'ROAD', 3.0,    8,   45,    450, 'OPEN',     0.02, '{"road":"district road"}'::jsonb),
(27, 4, 'ROAD', 2.0,    5,   40,    500, 'OPEN',     0.02, '{"road":"helipad access"}'::jsonb),
(22,12, 'ROAD', 1.0,    4,   25,    300, 'OPEN',     0.02, '{"road":"helipad access"}'::jsonb),
(23,10, 'ROAD', 2.0,    6,   40,    400, 'OPEN',     0.02, '{"road":"helipad access"}'::jsonb),
(24, 9, 'ROAD', 2.0,    6,   40,    400, 'OPEN',     0.02, '{"road":"helipad access"}'::jsonb),
(25, 7, 'ROAD', 2.0,    6,   40,    400, 'OPEN',     0.02, '{"road":"helipad access"}'::jsonb),
(26, 8, 'ROAD', 2.0,    6,   40,    400, 'OPEN',     0.02, '{"road":"helipad access"}'::jsonb),
-- Guwahati -> Shillong trunk road (landslide-prone, currently BLOCKED)
(4,  1, 'ROAD', 104.0, 170, 1600,    800, 'BLOCKED',   0.85, '{"road":"NH-6 landslide","cause":"landslide"}'::jsonb),
-- ---- HELICOPTER ----
(21,27, 'HELICOPTER', 118.0, 40, 32000, 350, 'OPEN',   0.22, '{}'::jsonb),
(21,22, 'HELICOPTER', 300.0, 95, 55000, 220, 'OPEN',   0.40, '{}'::jsonb),
(27,23, 'HELICOPTER', 170.0, 55, 48000, 260, 'OPEN',   0.30, '{}'::jsonb),
(23,26, 'HELICOPTER', 78.0,  28, 26000, 280, 'OPEN',   0.28, '{}'::jsonb),
(24,26, 'HELICOPTER', 195.0, 62, 52000, 220, 'OPEN',   0.35, '{}'::jsonb),
(25,24, 'HELICOPTER', 165.0, 48, 45000, 240, 'OPEN',   0.32, '{}'::jsonb),
-- ---- RIVER (National Waterway-2 / Barak) ----
(16,17, 'RIVER', 292.0, 300,  900, 1200, 'OPEN',   0.18, '{"waterway":"NW-2"}'::jsonb),
(16,20, 'RIVER', 112.0, 140,  560, 1000, 'OPEN',   0.15, '{"waterway":"NW-2"}'::jsonb),
(20,16, 'RIVER', 112.0, 140,  560, 1000, 'OPEN',   0.15, '{"waterway":"NW-2"}'::jsonb),
(18,16, 'RIVER', 480.0, 520, 1400,  900, 'BLOCKED',   0.30, '{"waterway":"NW-2","cause":"low water"}'::jsonb),
-- ---- DRONE (last-mile relay chains) ----
(32,28, 'DRONE', 130.0, 50, 2600, 120, 'RESTRICTED', 0.50, '{"payload_kg":50}'::jsonb),
(28,29, 'DRONE', 62.0,  45, 2200, 140, 'OPEN',       0.45, '{"payload_kg":40}'::jsonb),
(29,12, 'DRONE', 5.0,    6,  300, 120, 'OPEN',       0.08, '{"payload_kg":40}'::jsonb),
(30,14, 'DRONE', 2.0,    4,  150, 120, 'OPEN',       0.06, '{"payload_kg":40}'::jsonb),
(31,15, 'DRONE', 2.0,    4,  150, 120, 'OPEN',       0.06, '{"payload_kg":40}'::jsonb),
(33,30, 'DRONE', 95.0,  70, 1800, 100, 'OPEN',       0.40, '{"payload_kg":40}'::jsonb);

-- =====================================================================
-- Reversibility (down migration, for documentation / manual rollback):
--   DROP TABLE IF EXISTS transport_edges;
--   DROP TABLE IF EXISTS transport_nodes;
-- =====================================================================