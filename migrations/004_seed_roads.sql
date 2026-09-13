-- =====================================================================
-- Migration: Seed additional NER road network corridors
--
-- Inserts ~9 production-grade road corridors across the North Eastern
-- Region (Assam, Nagaland, Manipur, Arunachal Pradesh, Mizoram,
-- Meghalaya) into the `roads` table as GEOMETRY(LineString, 4326)
-- (WGS 84 lat/lon). Endpoints deliberately share coordinates with the
-- existing corridor set so graph nodes connect cleanly for the Dijkstra
-- routing engines (both backend PostGIS graph and client node-name
-- graph).
--
-- Run via:  node scripts/run-migrations.js
-- =====================================================================

-- Jorhat - North Lakhimpur - Itanagar express arterial (Assam)
INSERT INTO roads (road_name, district, geom, status) VALUES
('Jorhat - North Lakhimpur Express Arterial', 'Jorhat',
 ST_SetSRID(ST_GeomFromText('LINESTRING(
   94.2100 26.7600,
   94.3400 26.9200,
   94.5100 27.0200,
   94.4400 27.2400,
   93.7952 27.2352)'), 4326),
 'OPEN');

-- Itanagar - Bhalukpong - Balipara strategic link (Arunachal Pradesh)
INSERT INTO roads (road_name, district, geom, status) VALUES
('Itanagar - Bhalukpong Strategic Link', 'Papum Pare',
 ST_SetSRID(ST_GeomFromText('LINESTRING(
   93.6053 27.0844,
   93.5600 27.0600,
   93.4200 26.9900,
   93.1500 26.8500,
   92.9500 26.9500,
   92.6500 27.0100)'), 4326),
 'OPEN');

-- Dimapur - Pfutsero - Mao gate alternate (Nagaland Highland Bypass)
INSERT INTO roads (road_name, district, geom, status) VALUES
('Dimapur - Pfutsero Highland Bypass', 'Kohima',
 ST_SetSRID(ST_GeomFromText('LINESTRING(
   93.7270 25.9064,
   93.9700 25.6500,
   94.0500 25.5500,
   94.1086 25.6751)'), 4326),
 'RISKY');

-- Jorhat - Dimapur short-haul freight link (Assam / Nagaland)
INSERT INTO roads (road_name, district, geom, status) VALUES
('Jorhat - Dimapur Freight Link', 'Golaghat',
 ST_SetSRID(ST_GeomFromText('LINESTRING(
   94.2100 26.7600,
   94.5800 26.5000,
   94.1500 26.2500,
   93.9700 26.1000,
   93.7270 25.9064)'), 4326),
 'OPEN');

-- Shillong - Dawki (Indo-Bangladesh border) NH-40 link (Meghalaya)
INSERT INTO roads (road_name, district, geom, status) VALUES
('Shillong - Dawki Border Link', 'East Khasi Hills',
 ST_SetSRID(ST_GeomFromText('LINESTRING(
   91.8933 25.5788,
   91.8600 25.4100,
   91.8400 25.2500,
   92.0600 25.1900,
   92.1000 25.1500)'), 4326),
 'OPEN');

-- Agartala - Silchar secondary trunk (Tripura)
INSERT INTO roads (road_name, district, geom, status) VALUES
('Agartala - Silchar Secondary Trunk', 'West Tripura',
 ST_SetSRID(ST_GeomFromText('LINESTRING(
   91.2868 23.8315,
   91.7000 23.9000,
   91.8500 24.0500,
   92.2000 24.4000,
   92.6500 24.6500,
   92.7926 24.8333)'), 4326),
 'RISKY');

-- Aizawl - Champhai (Indo-Myanmar border) planned corridor (Mizoram)
INSERT INTO roads (road_name, district, geom, status) VALUES
('Aizawl - Champhai, MZ-3 Corridor', 'Aizawl',
 ST_SetSRID(ST_GeomFromText('LINESTRING(
   92.7176 23.7271,
   93.0400 23.7200,
   93.2100 23.9000,
   93.4500 23.9000,
   93.3500 23.9500)'), 4326),
 'BLOCKED');

-- Ziro - Yazali valley feeder (Arunachal Pradesh)
INSERT INTO roads (road_name, district, geom, status) VALUES
('Ziro - Yazali Valley Feeder', 'Lower Subansiri',
 ST_SetSRID(ST_GeomFromText('LINESTRING(
   93.6053 27.0844,
   93.7000 27.2500,
   93.8300 27.4800,
   93.9000 27.5400)'), 4326),
 'RISKY');

-- Silchar - Aizawl - Agartala bee-line connector (Cachar)
INSERT INTO roads (road_name, district, geom, status) VALUES
('Silchar - Aizawl Bee-Line Connector', 'Cachar',
 ST_SetSRID(ST_GeomFromText('LINESTRING(
   92.7926 24.8333,
   92.5500 24.6300,
   92.4200 24.4000,
   92.5000 24.1800,
   92.7176 23.7271)'), 4326),
 'OPEN');

